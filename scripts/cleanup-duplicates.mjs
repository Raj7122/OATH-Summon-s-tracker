/**
 * One-time cleanup script: Delete duplicate summons records
 *
 * Context: The Mar 4 test sweep created 944 duplicate records because the
 * pre-loaded existingSummonsMap failed to find existing records. All duplicates
 * have createdAt = 2026-03-05T00:44* UTC with ocr_status = 'pending'.
 * The originals predate this and have ocr_status = 'complete' with full OCR data.
 *
 * Logic:
 * 1. Scan the full Summons table
 * 2. Group records by summons_number
 * 3. For groups with >1 record, keep the oldest (by createdAt) and delete the rest
 * 4. Log each deletion for audit
 *
 * Usage:
 *   AWS_REGION=us-east-1 SUMMONS_TABLE=Summons-xxxxx-dev node scripts/cleanup-duplicates.mjs
 *   Add --dry-run to preview without deleting
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.SUMMONS_TABLE;
const DRY_RUN = process.argv.includes('--dry-run');

if (!TABLE_NAME) {
  console.error('ERROR: SUMMONS_TABLE environment variable is required');
  console.error('Usage: SUMMONS_TABLE=Summons-xxxxx-dev node scripts/cleanup-duplicates.mjs [--dry-run]');
  process.exit(1);
}

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(client);

async function scanFullTable() {
  const allItems = [];
  let lastKey = undefined;

  do {
    const params = {
      TableName: TABLE_NAME,
      ProjectionExpression: 'id, summons_number, clientID, createdAt, ocr_status',
      ...(lastKey && { ExclusiveStartKey: lastKey }),
    };

    const result = await dynamodb.send(new ScanCommand(params));
    allItems.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
    process.stdout.write(`\rScanned ${allItems.length} records...`);
  } while (lastKey);

  console.log(`\nTotal records scanned: ${allItems.length}`);
  return allItems;
}

async function deleteRecord(id) {
  if (DRY_RUN) return;
  await dynamodb.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { id },
  }));
}

async function main() {
  console.log(`=== Summons Duplicate Cleanup ===`);
  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no deletions)' : 'LIVE (will delete duplicates)'}`);
  console.log('');

  // Step 1: Scan full table
  const allRecords = await scanFullTable();

  // Step 2: Group by summons_number
  const groups = new Map();
  for (const record of allRecords) {
    if (!record.summons_number) continue;
    if (!groups.has(record.summons_number)) {
      groups.set(record.summons_number, []);
    }
    groups.get(record.summons_number).push(record);
  }

  console.log(`Unique summons_numbers: ${groups.size}`);

  // Step 3: Find duplicates and delete newer ones
  let deletedCount = 0;
  const duplicateGroups = [];

  for (const [summonsNumber, records] of groups) {
    if (records.length <= 1) continue;

    // Sort by createdAt ascending — keep the oldest
    records.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    const keeper = records[0];
    const toDelete = records.slice(1);

    duplicateGroups.push({ summonsNumber, keepCount: 1, deleteCount: toDelete.length });

    for (const dup of toDelete) {
      console.log(
        `DELETE ${dup.id} | summons=${summonsNumber} | created=${dup.createdAt} | ocr=${dup.ocr_status} ` +
        `(keeping ${keeper.id} created=${keeper.createdAt} ocr=${keeper.ocr_status})`
      );
      await deleteRecord(dup.id);
      deletedCount++;
    }
  }

  // Summary
  console.log('');
  console.log(`=== Summary ===`);
  console.log(`Total records before: ${allRecords.length}`);
  console.log(`Duplicate groups found: ${duplicateGroups.length}`);
  console.log(`Records ${DRY_RUN ? 'to delete' : 'deleted'}: ${deletedCount}`);
  console.log(`Records after: ${allRecords.length - deletedCount}`);

  if (DRY_RUN) {
    console.log('\nThis was a DRY RUN. Re-run without --dry-run to execute deletions.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
