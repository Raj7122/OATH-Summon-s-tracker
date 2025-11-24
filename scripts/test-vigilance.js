/**
 * NYC OATH Summons Tracker - Vigilance Test Script
 *
 * Purpose: Automated simulation to prove that the "Freshness" and "Audit Trail" logic works correctly.
 *
 * This script simulates a Friday → Monday scenario where:
 * 1. A summons is created on Friday (4 days ago)
 * 2. NYC updates the status and amount on Monday (today)
 * 3. The strict diff engine detects changes and sets audit metadata
 * 4. The UI shows an orange [UPDATED] badge with tooltip
 *
 * Usage:
 *   node scripts/test-vigilance.js
 *
 * Expected Result:
 *   - AUTO-TEST-001 record created with old timestamps
 *   - Simulated update with change detection
 *   - Audit trail: last_change_summary and last_change_at populated
 *   - Dashboard should show orange [UPDATED] badge with tooltip
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current directory (ES module equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const TEST_SUMMONS_NUMBER = 'AUTO-TEST-001';
const TEST_CLIENT_ID = 'test-client-123';
const REGION = process.env.AWS_REGION || 'us-east-1';

// Read table name from environment or amplify config
let SUMMONS_TABLE = process.env.STORAGE_SUMMONS_NAME;

if (!SUMMONS_TABLE) {
  try {
    const amplifyConfigPath = join(__dirname, '..', 'amplify_outputs.json');
    const amplifyConfig = JSON.parse(readFileSync(amplifyConfigPath, 'utf-8'));
    SUMMONS_TABLE = amplifyConfig.storage?.summons_table || 'Summons-dev';
    console.log(`📋 Using table from amplify_outputs.json: ${SUMMONS_TABLE}`);
  } catch (error) {
    SUMMONS_TABLE = 'Summons-dev';
    console.log(`⚠️  Could not read amplify config, using default: ${SUMMONS_TABLE}`);
  }
}

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// ============================================================================
// HELPER FUNCTIONS (Copied from daily-sweep Lambda for consistency)
// ============================================================================

/**
 * Normalize amount values (handle string, number, null, undefined)
 * @param {string|number|null|undefined} value - Raw amount
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
 * @param {string|null|undefined} value - Raw date
 * @returns {string|null} Normalized ISO date string with 'Z' suffix, or null
 */
function normalizeDate(value) {
  if (!value) return null;
  // Ensure ISO format with 'Z' suffix
  if (value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value)) {
    return value;
  }
  return `${value}Z`;
}

/**
 * Strict Diff Engine: Calculate changes between existing and incoming records
 * (Exact copy from daily-sweep Lambda)
 *
 * @param {Object} existingRecord - Current record in DynamoDB
 * @param {Object} incomingData - New data (normalized)
 * @returns {Object} { hasChanges: boolean, summary: string }
 */
function calculateChanges(existingRecord, incomingData) {
  const changes = [];

  // Compare Status (string comparison)
  const oldStatus = existingRecord.status || 'Unknown';
  const newStatus = incomingData.status || 'Unknown';
  if (oldStatus !== newStatus) {
    changes.push(`Status: '${oldStatus}' → '${newStatus}'`);
  }

  // Compare Amount Due (normalize both sides for comparison)
  const oldAmount = normalizeAmount(existingRecord.amount_due);
  const newAmount = normalizeAmount(incomingData.amount_due);
  // Use toFixed(2) comparison to avoid floating point issues
  if (oldAmount.toFixed(2) !== newAmount.toFixed(2)) {
    changes.push(`Amount Due: $${oldAmount.toFixed(2)} → $${newAmount.toFixed(2)}`);
  }

  // Compare Hearing Date (normalize both sides - handle null/undefined)
  const oldDate = normalizeDate(existingRecord.hearing_date);
  const newDate = normalizeDate(incomingData.hearing_date);
  if (oldDate !== newDate) {
    const oldDateDisplay = oldDate ? new Date(oldDate).toLocaleDateString('en-US') : 'None';
    const newDateDisplay = newDate ? new Date(newDate).toLocaleDateString('en-US') : 'None';
    changes.push(`Hearing Date: ${oldDateDisplay} → ${newDateDisplay}`);
  }

  return {
    hasChanges: changes.length > 0,
    summary: changes.join('; '),
  };
}

/**
 * Generate a UUID for test record
 * @returns {string} UUID
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// DYNAMODB OPERATIONS
// ============================================================================

/**
 * Delete test record if it exists (clean slate)
 */
async function cleanSlate() {
  try {
    const getCommand = new GetCommand({
      TableName: SUMMONS_TABLE,
      Key: { id: TEST_SUMMONS_NUMBER },
    });

    const result = await docClient.send(getCommand);

    if (result.Item) {
      const deleteCommand = new DeleteCommand({
        TableName: SUMMONS_TABLE,
        Key: { id: TEST_SUMMONS_NUMBER },
      });

      await docClient.send(deleteCommand);
      console.log('🧹 Cleaned existing test record');
    }
  } catch (error) {
    // Record doesn't exist, that's fine
    console.log('🧹 No existing test record to clean');
  }
}

/**
 * Create "Friday" record (4 days ago)
 */
async function createFridayRecord() {
  // Calculate Friday timestamp (4 days ago)
  const fridayDate = new Date();
  fridayDate.setDate(fridayDate.getDate() - 4);
  fridayDate.setHours(14, 30, 0, 0); // Friday 2:30 PM
  const fridayISO = fridayDate.toISOString();

  const record = {
    id: TEST_SUMMONS_NUMBER,
    clientID: TEST_CLIENT_ID,
    summons_number: TEST_SUMMONS_NUMBER,
    respondent_name: 'TEST CLIENT LLC',
    hearing_date: normalizeDate('2025-12-01T00:00:00.000'),
    status: 'SCHEDULED',
    license_plate: 'TEST123',
    base_fine: 0,
    amount_due: 0,
    violation_date: normalizeDate('2024-11-01T00:00:00.000'),
    violation_location: '123 Test St, New York, NY 10001',
    summons_pdf_link: `https://example.com/pdf/${TEST_SUMMONS_NUMBER}`,
    video_link: `https://example.com/video/${TEST_SUMMONS_NUMBER}`,
    added_to_calendar: false,
    evidence_reviewed: false,
    evidence_requested: false,
    evidence_received: false,
    createdAt: fridayISO,
    updatedAt: fridayISO,
    owner: 'test-user',
    // Internal fields (simulating Arthur's notes)
    notes: 'Test record - Client called, will contest.',
    internal_status: 'Reviewing',
  };

  const putCommand = new PutCommand({
    TableName: SUMMONS_TABLE,
    Item: record,
  });

  await docClient.send(putCommand);

  console.log('✅ Step 1: Created "Friday" record (4 days ago)');
  console.log(`   📅 Timestamps: ${fridayISO}`);
  console.log(`   📊 Status: SCHEDULED, Amount: $0.00`);

  return record;
}

/**
 * Simulate Monday update (detect changes and update with audit trail)
 */
async function simulateMondayUpdate(existingRecord) {
  console.log('\n🔄 Step 2: Simulating Monday Update...');

  // Define incoming NYC data (simulating API response)
  const incomingCityData = {
    status: 'DEFAULT JUDGMENT',
    amount_due: 500,
    hearing_date: normalizeDate('2025-12-01T00:00:00.000'), // Same date, no change
  };

  console.log('   📥 Incoming NYC Data:');
  console.log(`      Status: ${incomingCityData.status}`);
  console.log(`      Amount Due: $${incomingCityData.amount_due.toFixed(2)}`);

  // Execute Strict Diff Engine
  const changeResult = calculateChanges(existingRecord, incomingCityData);

  if (!changeResult.hasChanges) {
    console.log('   ⚠️  ERROR: No changes detected! This should not happen.');
    process.exit(1);
  }

  console.log(`   ✅ Changes Detected: ${changeResult.summary}`);

  // Update record with audit trail
  const now = new Date().toISOString();

  const updateCommand = new UpdateCommand({
    TableName: SUMMONS_TABLE,
    Key: { id: TEST_SUMMONS_NUMBER },
    UpdateExpression: 'SET #status = :status, amount_due = :amount_due, last_change_summary = :summary, last_change_at = :change_at, updatedAt = :updated_at',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':status': incomingCityData.status,
      ':amount_due': incomingCityData.amount_due,
      ':summary': changeResult.summary,
      ':change_at': now,
      ':updated_at': now,
    },
  });

  await docClient.send(updateCommand);

  console.log('✅ Step 3: Updated record with audit trail');
  console.log(`   🔖 last_change_summary: "${changeResult.summary}"`);
  console.log(`   📅 last_change_at: ${now}`);
  console.log(`   📅 updatedAt: ${now}`);

  return changeResult;
}

/**
 * Verify the record is ready for UI testing
 */
async function verifyRecord() {
  const getCommand = new GetCommand({
    TableName: SUMMONS_TABLE,
    Key: { id: TEST_SUMMONS_NUMBER },
  });

  const result = await docClient.send(getCommand);

  if (!result.Item) {
    console.log('   ❌ ERROR: Record not found after update!');
    process.exit(1);
  }

  const record = result.Item;

  console.log('\n📊 Final Record State:');
  console.log(`   ID: ${record.id}`);
  console.log(`   Status: ${record.status}`);
  console.log(`   Amount Due: $${record.amount_due.toFixed(2)}`);
  console.log(`   Created At: ${record.createdAt}`);
  console.log(`   Updated At: ${record.updatedAt}`);
  console.log(`   Change Summary: ${record.last_change_summary}`);
  console.log(`   Change At: ${record.last_change_at}`);
  console.log(`   Notes (preserved): ${record.notes}`);
  console.log(`   Internal Status (preserved): ${record.internal_status}`);

  // Calculate freshness
  const updatedDate = new Date(record.updatedAt);
  const now = new Date();
  const diffHours = (now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60);

  console.log(`\n✨ Freshness Check:`);
  console.log(`   Hours since update: ${diffHours.toFixed(2)}`);
  console.log(`   Within 72-hour window: ${diffHours < 72 ? '✅ YES' : '❌ NO'}`);
  console.log(`   Should show [UPDATED] badge: ${diffHours < 72 ? '✅ YES' : '❌ NO'}`);

  // Check if createdAt != updatedAt (required for UPDATED badge)
  const createdDate = new Date(record.createdAt);
  const timeDiff = updatedDate.getTime() - createdDate.getTime();
  const isUpdated = timeDiff >= 1000; // At least 1 second difference

  console.log(`   createdAt != updatedAt: ${isUpdated ? '✅ YES' : '❌ NO'}`);
  console.log(`   Badge Type: ${isUpdated ? '🟠 UPDATED' : '🔵 NEW'}`);
}

// ============================================================================
// MAIN TEST WORKFLOW
// ============================================================================

async function main() {
  console.log('🧪 NYC OATH Vigilance Test Script');
  console.log('=====================================\n');
  console.log(`📋 DynamoDB Table: ${SUMMONS_TABLE}`);
  console.log(`🎯 Test Summons: ${TEST_SUMMONS_NUMBER}\n`);

  try {
    // Step 1: Clean slate
    await cleanSlate();

    // Step 2: Create Friday record (4 days ago)
    const fridayRecord = await createFridayRecord();

    // Wait 1 second to ensure timestamps are different
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 3: Simulate Monday update
    await simulateMondayUpdate(fridayRecord);

    // Step 4: Verify final state
    await verifyRecord();

    // Success message
    console.log('\n✅ TEST COMPLETE');
    console.log('=====================================');
    console.log('🌐 Next Steps:');
    console.log('   1. Open your localhost Dashboard (npm run dev)');
    console.log('   2. Search for summons: AUTO-TEST-001');
    console.log('   3. You should see:');
    console.log('      - 🟠 Orange [UPDATED] badge in Status column');
    console.log('      - Hover tooltip showing: "Status: \'SCHEDULED\' → \'DEFAULT JUDGMENT\'; Amount Due: $0.00 → $500.00"');
    console.log('      - Amount Due: $500.00');
    console.log('      - Status: DEFAULT JUDGMENT (red chip)');
    console.log('      - Notes field preserved: "Test record - Client called, will contest."');
    console.log('      - Internal Status preserved: "Reviewing"');
    console.log('\n🧹 Cleanup: Run this script again to reset the test record.');

  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
main();
