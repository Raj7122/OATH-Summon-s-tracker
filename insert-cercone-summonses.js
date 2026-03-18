/**
 * Manual Insert Script - 4 Cercone Summonses
 *
 * This script manually inserts 4 summonses for "CERCONE EXTERIOR RESTORATION C"
 * that were missed by the daily sweep due to AKA timing issues.
 *
 * The matching logic SHOULD work now that the AKA is added, but these
 * specific summonses need to be inserted manually to catch up.
 *
 * Usage:
 *   node insert-cercone-summonses.js <summons-table-name> <client-table-name> [region]
 *
 * Example:
 *   node insert-cercone-summonses.js Summons-xxxxx-dev Client-xxxxx-dev us-east-1
 *
 * To find table names, run:
 *   aws dynamodb list-tables --region us-east-1 | grep -E "(Summons|Client)"
 */

import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

// Parse command line arguments
const [,, summonsTableName, clientTableName, region = 'us-east-1'] = process.argv;

if (!summonsTableName || !clientTableName) {
  console.error('Error: Missing required arguments\n');
  console.log('Usage:');
  console.log('  node insert-cercone-summonses.js <summons-table> <client-table> [region]\n');
  console.log('Example:');
  console.log('  node insert-cercone-summonses.js Summons-xxxxx-dev Client-xxxxx-dev us-east-1\n');
  console.log('To find table names:');
  console.log('  aws dynamodb list-tables --region us-east-1 | grep -E "(Summons|Client)"');
  process.exit(1);
}

// Configure AWS SDK
AWS.config.update({ region });
const dynamodb = new AWS.DynamoDB.DocumentClient();

// The 4 Cercone summonses from NYC Open Data API (verified 2026-02-05)
// Data extracted from: https://data.cityofnewyork.us/resource/jz4z-kudi.json
// These 4 have respondent_first_name: "ORP", respondent_last_name: "CERCONE EXTERIOR RESTORATION C"
// which the daily sweep should match via suffix fragment detection + AKA lookup
const CERCONE_SUMMONSES = [
  {
    summons_number: '000917991M',
    respondent_name: 'ORP CERCONE EXTERIOR RESTORATION C',
    violation_date: '2024-12-13T00:00:00.000Z',
    violation_time: '08:49:00',
    hearing_date: '2025-12-24T00:00:00.000Z',
    hearing_time: '08:30:00',
    status: 'PAID IN FULL',
    hearing_result: 'ADMIT IN-VIO',
    base_fine: 600,
    amount_due: 0,
    paid_amount: 600,
    penalty_imposed: 600,
    code_description: 'IDLING MOTOR VEHICLE ENGIN OVER 1MIN WHILE ADJACENT TO SCHOOL 3RD SUB',
    violation_location: 'ON BROADWAY BETWEEN W 116TH S, NEW YORK, 10027',
    license_plate: '24140NA',
  },
  {
    summons_number: '000956255X',
    respondent_name: 'ORP CERCONE EXTERIOR RESTORATION C',
    violation_date: '2024-10-08T00:00:00.000Z',
    violation_time: '12:44:00',
    hearing_date: '2026-03-18T00:00:00.000Z',
    hearing_time: '09:00:00',
    status: 'PAID IN FULL',
    hearing_result: 'ADMIT IN-VIO',
    base_fine: 350,
    amount_due: 0,
    paid_amount: 350,
    penalty_imposed: 350,
    code_description: 'IDLING OF MOTOR VEHICLE ENGINE OVER 1MIN WHILE ADJACENT TO SCHOOL 1ST',
    violation_location: '2 WEST 22 STREET, NEW YORK, 10010',
    license_plate: '',  // Not in API response
  },
  {
    summons_number: '000822391R',
    respondent_name: 'ORP CERCONE EXTERIOR RESTORATION C',
    violation_date: '2023-07-24T00:00:00.000Z',
    violation_time: '12:50:00',
    hearing_date: '2025-03-31T00:00:00.000Z',
    hearing_time: '13:00:00',
    status: 'PAID IN FULL',
    hearing_result: 'IN VIOLATION',
    base_fine: 350,
    amount_due: 0,
    paid_amount: 459,  // Includes late fees
    penalty_imposed: 350,
    code_description: 'IDLING OF MOTOR VEHICLE ENGINE MORE THAN THREE MINUTES 1ST OFF',
    violation_location: '20 WEST 37 STREET, NEW YORK, 10018',
    license_plate: '74535NC',
  },
  {
    summons_number: '000724549Z',
    respondent_name: 'ORP CERCONE EXTERIOR RESTORATION C',
    violation_date: '2022-07-12T00:00:00.000Z',
    violation_time: '15:37:00',
    hearing_date: '2024-06-17T00:00:00.000Z',
    hearing_time: '08:30:00',
    status: 'PAID IN FULL',
    hearing_result: 'IN VIOLATION',
    base_fine: 350,
    amount_due: 0,
    paid_amount: 455,  // Includes late fees
    penalty_imposed: 350,
    code_description: 'IDLING OF MOTOR VEHICLE ENGINE MORE THAN THREE MINUTES 1ST OFF',
    violation_location: '85 5 AVENUE, NEW YORK, 10003',
    license_plate: '67856MC',
  },
];

/**
 * Find the Cercone client in DynamoDB
 */
async function findCerconeClient() {
  console.log('Searching for Cercone client...');

  const params = {
    TableName: clientTableName,
    FilterExpression: 'contains(#n, :name)',
    ExpressionAttributeNames: { '#n': 'name' },
    ExpressionAttributeValues: { ':name': 'CERCONE' },
  };

  try {
    const result = await dynamodb.scan(params).promise();

    if (!result.Items || result.Items.length === 0) {
      // Try case-insensitive search
      params.ExpressionAttributeValues = { ':name': 'Cercone' };
      const result2 = await dynamodb.scan(params).promise();

      if (!result2.Items || result2.Items.length === 0) {
        console.error('ERROR: Could not find Cercone client in database');
        console.error('Please verify the client exists in the Clients table');
        return null;
      }
      return result2.Items[0];
    }

    return result.Items[0];
  } catch (error) {
    console.error('Error querying clients table:', error.message);
    throw error;
  }
}

/**
 * Check if a summons already exists in the database
 */
async function summonsExists(summonsNumber) {
  // Use a scan with filter since we don't have a direct index lookup via DocumentClient
  const params = {
    TableName: summonsTableName,
    FilterExpression: 'summons_number = :sn',
    ExpressionAttributeValues: { ':sn': summonsNumber },
  };

  try {
    const result = await dynamodb.scan(params).promise();
    return result.Items && result.Items.length > 0;
  } catch (error) {
    console.error(`Error checking if summons ${summonsNumber} exists:`, error.message);
    return false;
  }
}

/**
 * Create a summons record for DynamoDB
 */
function createSummonsRecord(summonsData, clientId, owner) {
  const now = new Date().toISOString();
  const ticketNumber = summonsData.summons_number;

  // Generate PDF and video links
  const pdfLink = `https://a820-ecbticketfinder.nyc.gov/GetViolationImage?violationNumber=${ticketNumber}`;
  const videoLink = `https://nycidling.azurewebsites.net/idlingevidence/video/${ticketNumber}`;

  // Create initial activity log entry
  const initialActivityLog = [
    {
      date: now,
      type: 'CREATED',
      description: 'Summons manually inserted (AKA matching catch-up)',
      old_value: null,
      new_value: summonsData.status || 'Unknown',
    },
  ];

  return {
    id: uuidv4(),
    clientID: clientId,
    summons_number: ticketNumber,
    respondent_name: summonsData.respondent_name,

    // Core API fields
    hearing_date: summonsData.hearing_date,
    hearing_time: summonsData.hearing_time || '',
    hearing_result: summonsData.hearing_result,
    status: summonsData.status,
    code_description: summonsData.code_description,
    violation_date: summonsData.violation_date,
    violation_time: summonsData.violation_time || '',
    violation_location: summonsData.violation_location || '',
    license_plate: summonsData.license_plate || '',

    // Financial fields
    base_fine: summonsData.base_fine,
    amount_due: summonsData.amount_due,
    paid_amount: summonsData.paid_amount,
    penalty_imposed: summonsData.penalty_imposed,

    // Generated links
    summons_pdf_link: pdfLink,
    video_link: videoLink,

    // User-input fields (defaults)
    added_to_calendar: false,
    evidence_reviewed: false,
    evidence_requested: false,
    evidence_received: false,
    internal_status: 'New',

    // OCR fields - flag for processing
    ocr_status: 'pending',
    ocr_failure_count: 0,

    // Tracking fields
    api_miss_count: 0,
    is_archived: false,
    last_metadata_sync: now,
    activity_log: initialActivityLog,

    // Amplify DataStore metadata
    _version: 1,
    _lastChangedAt: Date.now(),
    _deleted: null,

    // Timestamps
    createdAt: now,
    updatedAt: now,
    owner: owner,
  };
}

/**
 * Insert a summons into DynamoDB
 */
async function insertSummons(summons) {
  const params = {
    TableName: summonsTableName,
    Item: summons,
    ConditionExpression: 'attribute_not_exists(id)',
  };

  try {
    await dynamodb.put(params).promise();
    return { success: true };
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      return { success: false, error: 'Already exists' };
    }
    return { success: false, error: error.message };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('='.repeat(60));
  console.log('MANUAL INSERT: 4 Cercone Summonses');
  console.log('='.repeat(60));
  console.log(`Summons Table: ${summonsTableName}`);
  console.log(`Client Table: ${clientTableName}`);
  console.log(`Region: ${region}`);
  console.log('');

  // Step 1: Find Cercone client
  const client = await findCerconeClient();
  if (!client) {
    process.exit(1);
  }

  console.log(`Found client: ${client.name} (ID: ${client.id})`);
  console.log(`AKAs: ${client.akas ? client.akas.join(', ') : 'None'}`);
  console.log(`Owner: ${client.owner || 'Not set'}`);
  console.log('');

  // Step 2: Insert each summons
  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const summonsData of CERCONE_SUMMONSES) {
    const ticketNum = summonsData.summons_number;
    process.stdout.write(`[${ticketNum}] `);

    // Check if already exists
    const exists = await summonsExists(ticketNum);
    if (exists) {
      console.log('SKIPPED (already exists)');
      skipped++;
      continue;
    }

    // Create and insert the record
    const record = createSummonsRecord(summonsData, client.id, client.owner);
    const result = await insertSummons(record);

    if (result.success) {
      console.log(`INSERTED (ocr_status: pending)`);
      inserted++;
    } else {
      console.log(`FAILED: ${result.error}`);
      failed++;
    }
  }

  // Summary
  console.log('');
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped:  ${skipped} (already existed)`);
  console.log(`Failed:   ${failed}`);
  console.log('');

  if (inserted > 0) {
    console.log('NEXT STEPS:');
    console.log('1. The summonses will appear in the dashboard immediately');
    console.log('2. OCR will process them on the next daily sweep (Phase 2)');
    console.log('3. Or manually trigger OCR by invoking the dailySweep Lambda');
    console.log('');
    console.log('To manually trigger OCR:');
    console.log('  aws lambda invoke --function-name dailySweep-dev --payload \'{}\' response.json');
  }
}

// Run
main().catch(error => {
  console.error('\nFatal error:', error);
  process.exit(1);
});
