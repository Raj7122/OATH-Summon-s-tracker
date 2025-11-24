/**
 * NYC OATH Summons Tracker - Daily Sweep Lambda Function
 *
 * This function runs daily via Amazon EventBridge Scheduler.
 * It fetches IDLING summonses from NYC Open Data API, matches them
 * to registered clients, and creates/updates records in DynamoDB.
 *
 * FR-03: Automated Daily Data Sweep
 */

const AWS = require('aws-sdk');
const fetch = require('node-fetch');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

// Environment variables (configured in AWS Console)
const CLIENTS_TABLE = process.env.CLIENTS_TABLE || 'Client-dev';
const SUMMONS_TABLE = process.env.SUMMONS_TABLE || 'Summons-dev';
const NYC_API_TOKEN = process.env.NYC_OPEN_DATA_APP_TOKEN;
const DATA_EXTRACTOR_FUNCTION = process.env.DATA_EXTRACTOR_FUNCTION;

// NYC Open Data API Configuration
const NYC_API_URL = 'https://data.cityofnewyork.us/resource/jz4z-kudi.json';
const API_LIMIT = 5000;

/**
 * Main handler for the daily sweep Lambda function
 */
exports.handler = async (event) => {
  console.log('Starting daily sweep...', new Date().toISOString());

  try {
    // Step 1: Fetch all clients from DynamoDB
    const clients = await fetchAllClients();
    console.log(`Fetched ${clients.length} clients from database`);

    if (clients.length === 0) {
      console.log('No clients found. Exiting sweep.');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No clients to process', processed: 0 }),
      };
    }

    // Step 2: Create a list of all client names and AKAs for matching
    const clientNameMap = buildClientNameMap(clients);
    console.log(`Built name map with ${Object.keys(clientNameMap).size} unique names`);

    // Step 3: Fetch summonses from NYC Open Data API
    const apiSummonses = await fetchNYCData();
    console.log(`Fetched ${apiSummonses.length} summonses from NYC API`);

    // Step 4: Process and match summonses
    const results = await processSummonses(apiSummonses, clientNameMap);
    console.log('Processing complete:', results);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Daily sweep completed successfully',
        ...results,
      }),
    };
  } catch (error) {
    // Critical error logging (TRD Section 18, Rule 1)
    console.error('Daily sweep failed:', error);
    console.error('Error stack:', error.stack);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Daily sweep failed',
        message: error.message,
      }),
    };
  }
};

/**
 * Fetch all clients from DynamoDB
 * @returns {Promise<Array>} Array of client records
 */
async function fetchAllClients() {
  try {
    const params = {
      TableName: CLIENTS_TABLE,
    };

    const result = await dynamodb.scan(params).promise();
    return result.Items || [];
  } catch (error) {
    console.error('Error fetching clients from DynamoDB:', error);
    throw new Error(`Failed to fetch clients: ${error.message}`);
  }
}

/**
 * Build a map of client names (including AKAs) to client IDs
 * Performs case-insensitive matching
 *
 * @param {Array} clients - Array of client records
 * @returns {Map} Map of lowercase names to client objects
 */
function buildClientNameMap(clients) {
  const nameMap = new Map();

  clients.forEach((client) => {
    // Add the primary client name (case-insensitive)
    const primaryName = client.name.toLowerCase().trim();
    nameMap.set(primaryName, client);

    // Add all AKAs (case-insensitive)
    if (client.akas && Array.isArray(client.akas)) {
      client.akas.forEach((aka) => {
        const akaName = aka.toLowerCase().trim();
        nameMap.set(akaName, client);
      });
    }
  });

  return nameMap;
}

/**
 * Fetch IDLING summonses from NYC Open Data API
 * @returns {Promise<Array>} Array of summons records
 */
async function fetchNYCData() {
  try {
    const url = new URL(NYC_API_URL);
    url.searchParams.append('$limit', API_LIMIT);
    // Filter for IDLING violations using charge code description fields
    url.searchParams.append('$where', "charge_1_code_description like '%IDLING%' OR charge_2_code_description like '%IDLING%' OR charge_3_code_description like '%IDLING%'");
    url.searchParams.append('$order', 'hearing_date DESC');

    console.log('Fetching from NYC API:', url.toString());
    console.log('NYC_API_TOKEN present:', !!NYC_API_TOKEN);

    const headers = {
      'X-App-Token': NYC_API_TOKEN,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('NYC API error response:', errorBody);
      throw new Error(`NYC API returned ${response.status}: ${response.statusText} - ${errorBody}`);
    }

    const data = await response.json();
    console.log(`Successfully fetched ${data.length} IDLING summonses from NYC API`);

    return data || [];
  } catch (error) {
    console.error('Error fetching NYC Open Data:', error);
    throw new Error(`Failed to fetch NYC data: ${error.message}`);
  }
}

/**
 * Process summonses: match to clients, create/update records
 *
 * @param {Array} apiSummonses - Summonses from NYC API
 * @param {Map} clientNameMap - Map of client names to client objects
 * @returns {Promise<Object>} Processing results
 */
async function processSummonses(apiSummonses, clientNameMap) {
  let matched = 0;
  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const apiSummons of apiSummonses) {
    try {
      // Map NYC API fields to our expected fields
      const ticketNumber = apiSummons.ticket_number;
      const respondentFirstName = apiSummons.respondent_first_name || '';
      const respondentLastName = apiSummons.respondent_last_name || '';
      const respondentFullName = `${respondentFirstName} ${respondentLastName}`.trim();

      // Check if respondent name matches any client
      const respondentName = respondentFullName.toLowerCase().trim();

      if (!respondentName) {
        continue; // Skip summonses with no respondent name
      }

      const matchedClient = clientNameMap.get(respondentName);

      if (!matchedClient) {
        continue; // Not a match, skip
      }

      matched++;

      // Auto-generate links (FR-03)
      const pdfLink = `https://a820-ecbticketfinder.nyc.gov/GetViolationImage?violationNumber=${ticketNumber}`;
      const videoLink = `https://nycidling.azurewebsites.net/idlingevidence/video/${ticketNumber}`;

      // Check if summons already exists
      const existingSummons = await findExistingSummons(ticketNumber);

      // Map API fields to database fields
      const status = apiSummons.hearing_status || apiSummons.hearing_result || 'Unknown';
      const balanceDue = parseFloat(apiSummons.balance_due) || 0;
      const totalViolationAmount = parseFloat(apiSummons.total_violation_amount) || 0;

      if (existingSummons) {
        // Prepare new values for comparison
        const newHearingDate = apiSummons.hearing_date || null;

        // Strict diff logic: Track changes in critical fields
        const changes = [];

        if (existingSummons.status !== status) {
          changes.push(`Status: '${existingSummons.status}' → '${status}'`);
        }

        if (existingSummons.amount_due !== balanceDue) {
          changes.push(`Amount Due: $${existingSummons.amount_due || 0} → $${balanceDue}`);
        }

        // Compare hearing dates (handle null/undefined safely)
        const existingDate = existingSummons.hearing_date || null;
        const newDate = newHearingDate;
        if (existingDate !== newDate) {
          const oldDateStr = existingDate ? new Date(existingDate).toLocaleDateString() : 'None';
          const newDateStr = newDate ? new Date(newDate).toLocaleDateString() : 'None';
          changes.push(`Hearing Date: ${oldDateStr} → ${newDateStr}`);
        }

        // If any changes detected, update the record
        if (changes.length > 0) {
          const changeSummary = changes.join('; ');

          await updateSummons(existingSummons.id, {
            status: status,
            amount_due: balanceDue,
            hearing_date: newHearingDate,
            last_change_summary: changeSummary,
            last_change_at: new Date().toISOString(),
          });
          updated++;
          console.log(`Updated summons ${ticketNumber}: ${changeSummary}`);
        }
      } else {
        // Build violation location string
        const violationLocation = [
          apiSummons.violation_location_house,
          apiSummons.violation_location_street_name,
          apiSummons.violation_location_city,
          apiSummons.violation_location_zip_code
        ].filter(Boolean).join(', ');

        // Ensure dates are in proper ISO 8601 format with timezone
        const hearingDate = apiSummons.hearing_date ? ensureISOFormat(apiSummons.hearing_date) : null;
        const violationDate = apiSummons.violation_date ? ensureISOFormat(apiSummons.violation_date) : null;
        const now = new Date().toISOString();

        // Create new summons record with proper timestamps
        const newSummons = {
          id: generateUUID(),
          clientID: matchedClient.id,
          summons_number: ticketNumber,
          respondent_name: respondentFullName,
          hearing_date: hearingDate,
          status: status,
          license_plate: apiSummons.license_plate || '',
          base_fine: totalViolationAmount,
          amount_due: balanceDue,
          violation_date: violationDate,
          violation_location: violationLocation,
          summons_pdf_link: pdfLink,
          video_link: videoLink,
          added_to_calendar: false,
          evidence_reviewed: false,
          evidence_requested: false,
          evidence_received: false,
          createdAt: now,  // Required by Amplify @model directive
          updatedAt: now,  // Required by Amplify @model directive
          owner: matchedClient.owner,  // Required for @auth(rules: [{ allow: private }])
        };

        await createSummons(newSummons);
        created++;
        console.log(`Created new summons: ${ticketNumber}`);

        // Asynchronously invoke data-extractor function (FR-03, FR-09)
        await invokeDataExtractor(newSummons);
      }
    } catch (error) {
      console.error(`Error processing summons ${apiSummons.ticket_number}:`, error);
      errors++;
    }
  }

  return { matched, created, updated, errors };
}

/**
 * Find existing summons by summons_number
 * @param {string} summonsNumber - Summons number to search for
 * @returns {Promise<Object|null>} Existing summons or null
 */
async function findExistingSummons(summonsNumber) {
  try {
    const params = {
      TableName: SUMMONS_TABLE,
      IndexName: 'bySummonsNumber',
      KeyConditionExpression: 'summons_number = :summonsNumber',
      ExpressionAttributeValues: {
        ':summonsNumber': summonsNumber,
      },
    };

    const result = await dynamodb.query(params).promise();
    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
  } catch (error) {
    console.error('Error finding existing summons:', error);
    throw error;
  }
}

/**
 * Create a new summons record in DynamoDB
 * @param {Object} summons - Summons data
 */
async function createSummons(summons) {
  try {
    const params = {
      TableName: SUMMONS_TABLE,
      Item: summons,
    };

    await dynamodb.put(params).promise();
  } catch (error) {
    console.error('Error creating summons:', error);
    throw new Error(`Failed to create summons: ${error.message}`);
  }
}

/**
 * Update an existing summons record with change tracking
 * @param {string} id - Summons ID
 * @param {Object} updates - Fields to update (including last_change_summary and last_change_at)
 */
async function updateSummons(id, updates) {
  try {
    // Build dynamic update expression based on provided fields
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    if (updates.status !== undefined) {
      updateExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = updates.status;
    }

    if (updates.amount_due !== undefined) {
      updateExpressions.push('amount_due = :amount_due');
      expressionAttributeValues[':amount_due'] = updates.amount_due;
    }

    if (updates.hearing_date !== undefined) {
      // Ensure hearing_date is in proper ISO format
      const hearingDate = updates.hearing_date ? ensureISOFormat(updates.hearing_date) : null;
      updateExpressions.push('hearing_date = :hearing_date');
      expressionAttributeValues[':hearing_date'] = hearingDate;
    }

    if (updates.last_change_summary !== undefined) {
      updateExpressions.push('last_change_summary = :last_change_summary');
      expressionAttributeValues[':last_change_summary'] = updates.last_change_summary;
    }

    if (updates.last_change_at !== undefined) {
      updateExpressions.push('last_change_at = :last_change_at');
      expressionAttributeValues[':last_change_at'] = updates.last_change_at;
    }

    // CRITICAL: Always update updatedAt timestamp (required by Amplify @model)
    updateExpressions.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const params = {
      TableName: SUMMONS_TABLE,
      Key: { id },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
    };

    // Remove undefined properties
    if (params.ExpressionAttributeNames === undefined) {
      delete params.ExpressionAttributeNames;
    }

    await dynamodb.update(params).promise();
  } catch (error) {
    console.error('Error updating summons:', error);
    throw new Error(`Failed to update summons: ${error.message}`);
  }
}

/**
 * Asynchronously invoke the data-extractor Lambda function
 * @param {Object} summons - New summons data
 */
async function invokeDataExtractor(summons) {
  try {
    const payload = {
      summons_id: summons.id,
      summons_number: summons.summons_number,
      pdf_link: summons.summons_pdf_link,
      video_link: summons.video_link,
      violation_date: summons.violation_date,
    };

    const params = {
      FunctionName: DATA_EXTRACTOR_FUNCTION,
      InvocationType: 'Event', // Async invocation
      Payload: JSON.stringify(payload),
    };

    await lambda.invoke(params).promise();
    console.log(`Invoked data-extractor for summons: ${summons.summons_number}`);
  } catch (error) {
    // Log but don't fail the sweep if data extraction fails
    console.error('Error invoking data-extractor:', error);
  }
}

/**
 * Ensure date is in proper ISO 8601 format with timezone
 * NYC API returns dates like "2026-05-06T00:00:00.000" without timezone
 * AWS requires "2026-05-06T00:00:00.000Z" format
 *
 * @param {string} dateString - Date string from NYC API
 * @returns {string} ISO 8601 date with timezone
 */
function ensureISOFormat(dateString) {
  if (!dateString) return null;

  // If date already has timezone (Z or +00:00), return as-is
  if (dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString)) {
    return dateString;
  }

  // Add 'Z' timezone suffix for UTC
  return `${dateString}Z`;
}

/**
 * Generate a UUID (simplified version)
 * @returns {string} UUID
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
// Updated Wed Nov 19 09:47:55 EST 2025
