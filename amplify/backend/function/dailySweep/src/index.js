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
    url.searchParams.append('code_description', 'IDLING');
    url.searchParams.append('$order', 'hearing_date DESC');

    const headers = {
      'X-App-Token': NYC_API_TOKEN,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
      throw new Error(`NYC API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
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
      // Check if respondent name matches any client
      const respondentName = (apiSummons.respondent || '').toLowerCase().trim();

      if (!respondentName) {
        continue; // Skip summonses with no respondent name
      }

      const matchedClient = clientNameMap.get(respondentName);

      if (!matchedClient) {
        continue; // Not a match, skip
      }

      matched++;

      // Auto-generate links (FR-03)
      const pdfLink = `https://a820-ecbticketfinder.nyc.gov/GetViolationImage?violationNumber=${apiSummons.summons_number}`;
      const videoLink = `https://nycidling.azurewebsites.net/idlingevidence/video/${apiSummons.summons_number}`;

      // Check if summons already exists
      const existingSummons = await findExistingSummons(apiSummons.summons_number);

      if (existingSummons) {
        // Update if status or amount_due changed
        if (
          existingSummons.status !== apiSummons.status ||
          existingSummons.amount_due !== parseFloat(apiSummons.amount_due)
        ) {
          await updateSummons(existingSummons.id, {
            status: apiSummons.status,
            amount_due: parseFloat(apiSummons.amount_due) || 0,
          });
          updated++;
          console.log(`Updated summons: ${apiSummons.summons_number}`);
        }
      } else {
        // Create new summons record
        const newSummons = {
          id: generateUUID(),
          clientID: matchedClient.id,
          summons_number: apiSummons.summons_number,
          respondent_name: apiSummons.respondent,
          hearing_date: apiSummons.hearing_date || null,
          status: apiSummons.status || 'Unknown',
          license_plate: apiSummons.license_plate || '',
          base_fine: parseFloat(apiSummons.fine_amount) || 0,
          amount_due: parseFloat(apiSummons.amount_due) || 0,
          violation_date: apiSummons.violation_date || null,
          violation_location: apiSummons.violation_location || '',
          summons_pdf_link: pdfLink,
          video_link: videoLink,
          added_to_calendar: false,
          evidence_reviewed: false,
          evidence_requested: false,
          evidence_received: false,
        };

        await createSummons(newSummons);
        created++;
        console.log(`Created new summons: ${apiSummons.summons_number}`);

        // Asynchronously invoke data-extractor function (FR-03, FR-09)
        await invokeDataExtractor(newSummons);
      }
    } catch (error) {
      console.error(`Error processing summons ${apiSummons.summons_number}:`, error);
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
 * Update an existing summons record
 * @param {string} id - Summons ID
 * @param {Object} updates - Fields to update
 */
async function updateSummons(id, updates) {
  try {
    const params = {
      TableName: SUMMONS_TABLE,
      Key: { id },
      UpdateExpression: 'SET #status = :status, amount_due = :amount_due',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': updates.status,
        ':amount_due': updates.amount_due,
      },
    };

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
