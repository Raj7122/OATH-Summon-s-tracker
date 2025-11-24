#!/usr/bin/env node
/**
 * Fix Database Timestamps - Data Repair Script
 *
 * This script fixes malformed Summons records in DynamoDB that have:
 * 1. Dates without timezone suffix (e.g., "2026-05-06T00:00:00.000" instead of "2026-05-06T00:00:00.000Z")
 * 2. Null createdAt or updatedAt timestamps (required by Amplify @model)
 *
 * USAGE:
 *   node scripts/fix-database-timestamps.js
 *
 * PREREQUISITES:
 *   - AWS credentials configured (via aws configure or environment variables)
 *   - Correct DynamoDB table name set in SUMMONS_TABLE variable below
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// Configuration - UPDATE THESE VALUES
const REGION = 'us-east-1';
const SUMMONS_TABLE = 'Summons-y3ftocckkvaqrn43xz6cn6vfgq-dev'; // Your actual table name

const client = new DynamoDBClient({ region: REGION });
const dynamodb = DynamoDBDocumentClient.from(client);

/**
 * Ensure date is in proper ISO 8601 format with timezone
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
 * Scan all summons records and fix malformed data
 */
async function scanAndFixSummons() {
  console.log('Starting database repair...\n');
  console.log(`Table: ${SUMMONS_TABLE}`);
  console.log(`Region: ${REGION}\n`);

  let scannedCount = 0;
  let fixedCount = 0;
  let errorCount = 0;
  let lastEvaluatedKey = null;

  do {
    try {
      const scanParams = {
        TableName: SUMMONS_TABLE,
        ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey }),
      };

      const scanResult = await dynamodb.send(new ScanCommand(scanParams));
      scannedCount += scanResult.Items.length;

      for (const item of scanResult.Items) {
        try {
          const needsUpdate = await checkAndFixSummons(item);
          if (needsUpdate) {
            fixedCount++;
          }
        } catch (error) {
          console.error(`Error fixing summons ${item.summons_number}:`, error.message);
          errorCount++;
        }
      }

      lastEvaluatedKey = scanResult.LastEvaluatedKey;
    } catch (error) {
      console.error('Error scanning table:', error);
      throw error;
    }
  } while (lastEvaluatedKey);

  console.log('\n=== REPAIR SUMMARY ===');
  console.log(`Scanned: ${scannedCount} records`);
  console.log(`Fixed: ${fixedCount} records`);
  console.log(`Errors: ${errorCount} records`);
  console.log('======================\n');
}

/**
 * Check if a summons needs fixing and fix it
 */
async function checkAndFixSummons(summons) {
  const updates = {};
  const problems = [];

  // Check for missing createdAt
  if (!summons.createdAt) {
    updates.createdAt = new Date().toISOString();
    problems.push('missing createdAt');
  }

  // Check for missing updatedAt
  if (!summons.updatedAt) {
    updates.updatedAt = new Date().toISOString();
    problems.push('missing updatedAt');
  }

  // Check for malformed hearing_date
  if (summons.hearing_date && !summons.hearing_date.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(summons.hearing_date)) {
    updates.hearing_date = ensureISOFormat(summons.hearing_date);
    problems.push(`malformed hearing_date: ${summons.hearing_date}`);
  }

  // Check for malformed violation_date
  if (summons.violation_date && !summons.violation_date.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(summons.violation_date)) {
    updates.violation_date = ensureISOFormat(summons.violation_date);
    problems.push(`malformed violation_date: ${summons.violation_date}`);
  }

  // Check for malformed video_created_date
  if (summons.video_created_date && !summons.video_created_date.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(summons.video_created_date)) {
    updates.video_created_date = ensureISOFormat(summons.video_created_date);
    problems.push(`malformed video_created_date: ${summons.video_created_date}`);
  }

  // Check for malformed evidence_requested_date
  if (summons.evidence_requested_date && !summons.evidence_requested_date.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(summons.evidence_requested_date)) {
    updates.evidence_requested_date = ensureISOFormat(summons.evidence_requested_date);
    problems.push(`malformed evidence_requested_date: ${summons.evidence_requested_date}`);
  }

  // Check for malformed last_change_at
  if (summons.last_change_at && !summons.last_change_at.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(summons.last_change_at)) {
    updates.last_change_at = ensureISOFormat(summons.last_change_at);
    problems.push(`malformed last_change_at: ${summons.last_change_at}`);
  }

  // If no updates needed, return false
  if (Object.keys(updates).length === 0) {
    return false;
  }

  console.log(`\nFixing summons: ${summons.summons_number} (ID: ${summons.id})`);
  console.log(`Problems found: ${problems.join(', ')}`);

  // Build update expression
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  let attrIndex = 0;
  for (const [key, value] of Object.entries(updates)) {
    const attrName = `#attr${attrIndex}`;
    const attrValue = `:val${attrIndex}`;

    updateExpressions.push(`${attrName} = ${attrValue}`);
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = value;

    attrIndex++;
  }

  const updateParams = {
    TableName: SUMMONS_TABLE,
    Key: { id: summons.id },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  };

  await dynamodb.send(new UpdateCommand(updateParams));
  console.log(`✓ Fixed successfully`);

  return true;
}

/**
 * Main execution
 */
async function main() {
  console.log('\n========================================');
  console.log('NYC OATH Summons Tracker');
  console.log('Database Timestamp Repair Script');
  console.log('========================================\n');

  try {
    await scanAndFixSummons();
    console.log('✓ Database repair completed successfully!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database repair failed:', error);
    process.exit(1);
  }
}

// Run the script
main();
