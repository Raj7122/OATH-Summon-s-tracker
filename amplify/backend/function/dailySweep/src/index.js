/**
 * NYC OATH Summons Tracker - Daily Sweep Lambda Function
 *
 * This function runs daily via Amazon EventBridge Scheduler.
 * It fetches ALL OATH summonses from NYC Open Data API (Sanitation, Noise, DOT, Environmental, etc.),
 * matches them to registered clients, and creates/updates records in DynamoDB.
 *
 * FR-03: Automated Daily Data Sweep
 *
 * **CRITICAL: No IDLING Filter**
 * This function fetches ALL violation types for Arthur's clients, not just IDLING violations.
 *
 * **STRICT DIFF ENGINE (TRD v1.9)**
 * Prevents false-positive [UPDATED] badges by only updating records when critical fields change:
 *
 * 1. **Critical Fields Monitored:**
 *    - hearing_status / hearing_result (NYC API fields)
 *    - hearing_date + hearing_time (NYC API fields)
 *    - balance_due / amount_due (NYC API field)
 *    - code_description (violation type - charge_1_code_description)
 *    - paid_amount (NYC API field)
 *
 * 2. **Normalization:**
 *    - Amounts: "600" vs 600 vs null → all normalized to number
 *    - Dates: null vs undefined vs "2025-01-01" → all normalized to ISO format or null
 *    - Floating point: Uses toFixed(2) to avoid 600.00 vs 600.001 differences
 *
 * 3. **Update Logic:**
 *    - IF NO CHANGES: Skip DynamoDB write entirely (preserves updatedAt timestamp)
 *    - IF CHANGES: Update only changed fields + metadata (last_change_summary, last_change_at, updatedAt)
 *
 * 4. **User Field Preservation:**
 *    - updateSummons() uses dynamic UPDATE expressions
 *    - NEVER overwrites: notes, internal_status, evidence_reviewed, evidence_requested,
 *      evidence_received, added_to_calendar (these are user-entered fields)
 *
 * 5. **Logging:**
 *    - ✓ Updated summons: Shows exact changes
 *    - ○ Skipped summons: No changes detected
 *    - + Created new summons
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
    console.log(`Built name map with ${clientNameMap.size} unique names`);
    // Debug: Log all registered client names for matching
    console.log('Registered client names:', Array.from(clientNameMap.keys()));

    // Step 3: Fetch summonses from NYC Open Data API using targeted client queries
    const apiSummonses = await fetchNYCDataForClients(clients);
    console.log(`Fetched ${apiSummonses.length} summonses from NYC API`);

    // Step 4: Process and match summonses
    const results = await processSummonses(apiSummonses, clientNameMap);
    console.log('Processing complete:', results);
    console.log(`Summary: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped (no changes)`);

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
 * Normalize a company name for fuzzy matching
 * - Lowercase
 * - Remove extra whitespace (collapse multiple spaces to single)
 * - Remove common suffixes (LLC, INC, CORP, etc.)
 * - Trim
 *
 * @param {string} name - Raw company name
 * @returns {string} Normalized name for matching
 */
function normalizeCompanyName(name) {
  if (!name) return '';

  let normalized = name
    .toLowerCase()
    .trim()
    // Collapse multiple spaces to single space
    .replace(/\s+/g, ' ')
    // Remove common suffixes for matching purposes
    .replace(/\s*(llc|inc|corp|co|ltd|l\.l\.c\.|i\.n\.c\.)\s*$/i, '')
    .trim();

  return normalized;
}

/**
 * Build a map of client names (including AKAs) to client IDs
 * Performs case-insensitive, fuzzy matching with normalized names
 *
 * @param {Array} clients - Array of client records
 * @returns {Map} Map of normalized names to client objects
 */
function buildClientNameMap(clients) {
  const nameMap = new Map();

  clients.forEach((client) => {
    // Add the primary client name (normalized for fuzzy matching)
    const primaryName = normalizeCompanyName(client.name);
    nameMap.set(primaryName, client);

    // Also add without spaces (for cases like "G C" vs "GC")
    const noSpaceName = primaryName.replace(/\s/g, '');
    if (noSpaceName !== primaryName) {
      nameMap.set(noSpaceName, client);
    }

    // Add all AKAs (normalized)
    if (client.akas && Array.isArray(client.akas)) {
      client.akas.forEach((aka) => {
        const akaName = normalizeCompanyName(aka);
        nameMap.set(akaName, client);

        // Also add without spaces
        const akaNoSpace = akaName.replace(/\s/g, '');
        if (akaNoSpace !== akaName) {
          nameMap.set(akaNoSpace, client);
        }
      });
    }
  });

  return nameMap;
}

/**
 * Fetch OATH summonses from NYC Open Data API for specific client names
 * Uses targeted queries to search for each client rather than bulk fetching
 *
 * @param {Array} clients - Array of client objects with name and akas
 * @returns {Promise<Array>} Array of summons records matching client names
 */
async function fetchNYCDataForClients(clients) {
  const allSummonses = [];
  const seenTickets = new Set();

  const headers = {
    'X-App-Token': NYC_API_TOKEN,
    'Content-Type': 'application/json',
  };

  console.log('NYC_API_TOKEN present:', !!NYC_API_TOKEN);

  // Build unique search terms from client names and AKAs
  const searchTerms = new Set();
  clients.forEach(client => {
    // Add primary name (extract main part for LIKE search)
    const mainName = client.name.replace(/\s+(llc|inc|corp|co|ltd)\.?$/i, '').trim();
    if (mainName.length > 3) {
      searchTerms.add(mainName.toUpperCase());
    }

    // Add AKAs
    if (client.akas && Array.isArray(client.akas)) {
      client.akas.forEach(aka => {
        const akaMain = aka.replace(/\s+(llc|inc|corp|co|ltd)\.?$/i, '').trim();
        if (akaMain.length > 3) {
          searchTerms.add(akaMain.toUpperCase());
        }
      });
    }
  });

  console.log(`Searching for ${searchTerms.size} unique client name patterns...`);

  // Query NYC API for each search term
  for (const searchTerm of searchTerms) {
    try {
      const url = new URL(NYC_API_URL);
      url.searchParams.append('$limit', 500); // Limit per client
      // Escape single quotes for SQL LIKE query
      const escapedTerm = searchTerm.replace(/'/g, "''");
      url.searchParams.append('$where', `upper(respondent_last_name) like '%${escapedTerm}%'`);

      console.log(`Querying for: ${searchTerm}`);

      const response = await fetch(url.toString(), { headers });

      if (!response.ok) {
        console.error(`NYC API error for "${searchTerm}": ${response.status}`);
        continue;
      }

      const data = await response.json();

      // Deduplicate by ticket_number
      for (const summons of data) {
        if (!seenTickets.has(summons.ticket_number)) {
          seenTickets.add(summons.ticket_number);
          allSummonses.push(summons);
        }
      }

      console.log(`  Found ${data.length} summonses for "${searchTerm}"`);

    } catch (error) {
      console.error(`Error querying for "${searchTerm}":`, error.message);
    }
  }

  console.log(`Total unique summonses fetched: ${allSummonses.length}`);
  return allSummonses;
}

/**
 * Normalize amount values (handle string, number, null, undefined)
 * Ensures consistent comparison for currency fields
 *
 * @param {string|number|null|undefined} value - Raw amount from API
 * @returns {number} Normalized number (0 if invalid/null)
 */
function normalizeAmount(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const parsed = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Normalize date values (handle null, undefined, ensure ISO format)
 * Ensures consistent comparison for date fields
 *
 * @param {string|null|undefined} value - Raw date from API
 * @returns {string|null} Normalized ISO date string with 'Z' suffix, or null
 */
function normalizeDate(value) {
  if (!value) return null;
  return ensureISOFormat(value);
}

/**
 * Strict Diff Engine: Calculate changes between existing and incoming records
 * Compares critical fields: status, amount_due, hearing_date, hearing_time, hearing_result,
 * code_description, paid_amount
 * Uses normalized values to prevent false positives (e.g., "600" vs 600)
 *
 * @param {Object} existingRecord - Current record in DynamoDB
 * @param {Object} incomingData - New data from NYC API (normalized)
 * @param {string} incomingData.status - Normalized status value
 * @param {number} incomingData.amount_due - Normalized amount (number)
 * @param {string|null} incomingData.hearing_date - Normalized ISO date or null
 * @param {string|null} incomingData.hearing_time - Hearing time (optional)
 * @param {string|null} incomingData.hearing_result - Hearing result (HIGH PRIORITY)
 * @param {string|null} incomingData.code_description - Violation type
 * @param {number} incomingData.paid_amount - Amount paid by client
 * @returns {Object} { hasChanges: boolean, summary: string }
 */
function calculateChanges(existingRecord, incomingData) {
  const changes = [];

  // Compare Hearing Result (HIGH PRIORITY - major event if changes)
  const oldResult = existingRecord.hearing_result || '';
  const newResult = incomingData.hearing_result || '';
  if (oldResult !== newResult) {
    const oldDisplay = oldResult || 'Pending';
    const newDisplay = newResult || 'Pending';
    changes.push(`Result: '${oldDisplay}' → '${newDisplay}'`);
  }

  // Compare Status (string comparison)
  const oldStatus = existingRecord.status || 'Unknown';
  const newStatus = incomingData.status || 'Unknown';
  if (oldStatus !== newStatus) {
    changes.push(`Status: '${oldStatus}' → '${newStatus}'`);
  }

  // Compare Amount Due (normalize both sides for comparison)
  const oldAmount = normalizeAmount(existingRecord.amount_due);
  const newAmount = normalizeAmount(incomingData.amount_due);
  // Use toFixed(2) comparison to avoid floating point issues (600.00 vs 600.001)
  if (oldAmount.toFixed(2) !== newAmount.toFixed(2)) {
    changes.push(`Amount Due: $${oldAmount.toFixed(2)} → $${newAmount.toFixed(2)}`);
  }

  // Compare Paid Amount (critical if client paid)
  const oldPaid = normalizeAmount(existingRecord.paid_amount);
  const newPaid = normalizeAmount(incomingData.paid_amount);
  if (oldPaid.toFixed(2) !== newPaid.toFixed(2)) {
    changes.push(`Paid: $${oldPaid.toFixed(2)} → $${newPaid.toFixed(2)}`);
  }

  // Compare Hearing Date (normalize both sides - handle null/undefined)
  const oldDate = normalizeDate(existingRecord.hearing_date);
  const newDate = normalizeDate(incomingData.hearing_date);
  if (oldDate !== newDate) {
    const oldDateDisplay = oldDate ? new Date(oldDate).toLocaleDateString('en-US') : 'None';
    const newDateDisplay = newDate ? new Date(newDate).toLocaleDateString('en-US') : 'None';
    changes.push(`Hearing Date: ${oldDateDisplay} → ${newDateDisplay}`);
  }

  // Compare Hearing Time (time shifts are important)
  const oldTime = existingRecord.hearing_time || '';
  const newTime = incomingData.hearing_time || '';
  if (oldTime !== newTime) {
    const oldTimeDisplay = oldTime || 'Not Set';
    const newTimeDisplay = newTime || 'Not Set';
    changes.push(`Hearing Time: ${oldTimeDisplay} → ${newTimeDisplay}`);
  }

  // Compare Code Description (violation type - if amended)
  const oldCode = existingRecord.code_description || '';
  const newCode = incomingData.code_description || '';
  if (oldCode !== newCode) {
    const oldCodeDisplay = oldCode || 'Unknown';
    const newCodeDisplay = newCode || 'Unknown';
    changes.push(`Violation: '${oldCodeDisplay}' → '${newCodeDisplay}'`);
  }

  return {
    hasChanges: changes.length > 0,
    summary: changes.join('; '),
  };
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
  let skipped = 0; // Track records with no changes
  let errors = 0;

  for (const apiSummons of apiSummonses) {
    try {
      // Map NYC API fields to our expected fields
      const ticketNumber = apiSummons.ticket_number;
      const respondentFirstName = apiSummons.respondent_first_name || '';
      const respondentLastName = apiSummons.respondent_last_name || '';
      const respondentFullName = `${respondentFirstName} ${respondentLastName}`.trim();

      if (!respondentFullName) {
        continue; // Skip summonses with no respondent name
      }

      // Normalize respondent name for fuzzy matching
      const normalizedName = normalizeCompanyName(respondentFullName);
      const noSpaceName = normalizedName.replace(/\s/g, '');

      // Try to match: first with spaces, then without spaces
      let matchedClient = clientNameMap.get(normalizedName);
      if (!matchedClient && noSpaceName !== normalizedName) {
        matchedClient = clientNameMap.get(noSpaceName);
      }

      if (!matchedClient) {
        continue; // Not a match, skip
      }

      matched++;

      // Auto-generate links (FR-03)
      const pdfLink = `https://a820-ecbticketfinder.nyc.gov/GetViolationImage?violationNumber=${ticketNumber}`;
      const videoLink = `https://nycidling.azurewebsites.net/idlingevidence/video/${ticketNumber}`;

      // Check if summons already exists
      const existingSummons = await findExistingSummons(ticketNumber);

      // Extract and normalize NYC API data (ALL OATH violation types)
      const incomingHearingResult = apiSummons.hearing_result || '';
      const incomingStatus = apiSummons.hearing_status || incomingHearingResult || 'Unknown';
      const incomingAmountDue = normalizeAmount(apiSummons.balance_due);
      const incomingHearingDate = normalizeDate(apiSummons.hearing_date);
      const incomingHearingTime = apiSummons.hearing_time || '';
      const incomingCodeDescription = apiSummons.charge_1_code_description || apiSummons.charge_2_code_description || '';
      const incomingPaidAmount = normalizeAmount(apiSummons.paid_amount);
      const incomingPenaltyImposed = normalizeAmount(apiSummons.penalty_imposed);
      const incomingViolationTime = apiSummons.violation_time || '';

      if (existingSummons) {
        // **STRICT DIFF ENGINE** - Only update if critical fields changed
        const changeResult = calculateChanges(existingSummons, {
          status: incomingStatus,
          amount_due: incomingAmountDue,
          hearing_date: incomingHearingDate,
          hearing_time: incomingHearingTime,
          hearing_result: incomingHearingResult,
          code_description: incomingCodeDescription,
          paid_amount: incomingPaidAmount,
        });

        if (changeResult.hasChanges) {
          // Changes detected - update with change tracking
          await updateSummons(existingSummons.id, {
            status: incomingStatus,
            amount_due: incomingAmountDue,
            hearing_date: incomingHearingDate,
            hearing_time: incomingHearingTime,
            hearing_result: incomingHearingResult,
            code_description: incomingCodeDescription,
            paid_amount: incomingPaidAmount,
            penalty_imposed: incomingPenaltyImposed,
            last_change_summary: changeResult.summary,
            last_change_at: new Date().toISOString(),
          });
          updated++;
          console.log(`✓ Updated summons ${ticketNumber}: ${changeResult.summary}`);
        } else {
          // No changes - skip update to preserve updatedAt timestamp
          skipped++;
          console.log(`○ Skipped summons ${ticketNumber}: No changes detected`);
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

        // Parse base fine
        const totalViolationAmount = normalizeAmount(apiSummons.total_violation_amount);

        // Create new summons record with proper timestamps (ALL OATH violation types)
        const newSummons = {
          id: generateUUID(),
          clientID: matchedClient.id,
          summons_number: ticketNumber,
          respondent_name: respondentFullName,

          // Hearing Information
          hearing_date: hearingDate,
          hearing_time: incomingHearingTime,
          hearing_result: incomingHearingResult,
          status: incomingStatus,

          // Violation Information
          code_description: incomingCodeDescription,
          violation_date: violationDate,
          violation_time: incomingViolationTime,
          violation_location: violationLocation,
          license_plate: apiSummons.license_plate || '',

          // Financial Information
          base_fine: totalViolationAmount,
          amount_due: incomingAmountDue,
          paid_amount: incomingPaidAmount,
          penalty_imposed: incomingPenaltyImposed,

          // Generated Links
          summons_pdf_link: pdfLink,
          video_link: videoLink,

          // User-Input Fields (defaults)
          added_to_calendar: false,
          evidence_reviewed: false,
          evidence_requested: false,
          evidence_received: false,

          // Amplify Required Fields
          createdAt: now,  // Required by Amplify @model directive
          updatedAt: now,  // Required by Amplify @model directive
          owner: matchedClient.owner,  // Required for @auth(rules: [{ allow: private }])
        };

        await createSummons(newSummons);
        created++;
        console.log(`+ Created new summons: ${ticketNumber}`);

        // Asynchronously invoke data-extractor function (FR-03, FR-09)
        await invokeDataExtractor(newSummons);
      }
    } catch (error) {
      console.error(`Error processing summons ${apiSummons.ticket_number}:`, error);
      errors++;
    }
  }

  return { matched, created, updated, skipped, errors };
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

    if (updates.hearing_result !== undefined) {
      updateExpressions.push('hearing_result = :hearing_result');
      expressionAttributeValues[':hearing_result'] = updates.hearing_result;
    }

    if (updates.hearing_time !== undefined) {
      updateExpressions.push('hearing_time = :hearing_time');
      expressionAttributeValues[':hearing_time'] = updates.hearing_time;
    }

    if (updates.amount_due !== undefined) {
      updateExpressions.push('amount_due = :amount_due');
      expressionAttributeValues[':amount_due'] = updates.amount_due;
    }

    if (updates.paid_amount !== undefined) {
      updateExpressions.push('paid_amount = :paid_amount');
      expressionAttributeValues[':paid_amount'] = updates.paid_amount;
    }

    if (updates.penalty_imposed !== undefined) {
      updateExpressions.push('penalty_imposed = :penalty_imposed');
      expressionAttributeValues[':penalty_imposed'] = updates.penalty_imposed;
    }

    if (updates.code_description !== undefined) {
      updateExpressions.push('code_description = :code_description');
      expressionAttributeValues[':code_description'] = updates.code_description;
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
