#!/usr/bin/env node
/**
 * Phase 3 — Import DynamoDB items from migration/backups/dynamodb/<Type>.json
 * into the target account's tables.
 *
 * Usage: node migration/scripts/05-import-dynamo.js
 *
 * Reads target table names from migration/.env.target (populated by 05a).
 * Uses the AWS profile configured in env (default: arthur).
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const PROFILE = process.env.TARGET_PROFILE || 'arthur';
const REGION = process.env.TARGET_REGION || 'us-east-1';
const ENV_NAME = process.env.TARGET_ENV_NAME || 'prod';

process.env.AWS_PROFILE = PROFILE;
process.env.AWS_REGION = REGION;
process.env.AWS_SDK_LOAD_CONFIG = '1';

let DynamoDBClient, BatchWriteItemCommand;
try {
  ({ DynamoDBClient, BatchWriteItemCommand } = require('@aws-sdk/client-dynamodb'));
} catch (e) {
  console.error('[error] @aws-sdk/client-dynamodb not installed.');
  console.error('Run: npm install --no-save @aws-sdk/client-dynamodb');
  process.exit(1);
}

const MIGRATION_ROOT = path.resolve(__dirname, '..');
const DYNAMO_BACKUP_DIR = path.join(MIGRATION_ROOT, 'backups', 'dynamodb');
const ENV_TARGET = path.join(MIGRATION_ROOT, '.env.target');

// Parse migration/.env.target for the GraphQL API ID
function readTargetApiId() {
  if (!fs.existsSync(ENV_TARGET)) {
    console.error(`[error] ${ENV_TARGET} not found. Run 05a-discover-target-tables.sh first.`);
    process.exit(1);
  }
  const text = fs.readFileSync(ENV_TARGET, 'utf8');
  const m = text.match(/^export TARGET_GRAPHQL_API_ID="([^"]+)"/m);
  if (!m) {
    console.error('[error] TARGET_GRAPHQL_API_ID missing from .env.target');
    process.exit(1);
  }
  return m[1];
}

const TARGET_API_ID = readTargetApiId();
const TYPES = ['Client', 'Summons', 'SyncStatus', 'Invoice', 'InvoiceSummons'];
const targetTable = (type) => `${type}-${TARGET_API_ID}-${ENV_NAME}`;

const client = new DynamoDBClient({ region: REGION });

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function batchWriteWithRetry(table, items) {
  let pending = items.map((Item) => ({ PutRequest: { Item } }));
  let attempt = 0;
  while (pending.length > 0) {
    const batches = chunk(pending, 25);
    const stillPending = [];
    for (const batch of batches) {
      const cmd = new BatchWriteItemCommand({
        RequestItems: { [table]: batch },
      });
      const resp = await client.send(cmd);
      const unprocessed = resp.UnprocessedItems?.[table] ?? [];
      if (unprocessed.length > 0) stillPending.push(...unprocessed);
    }
    pending = stillPending;
    if (pending.length > 0) {
      attempt += 1;
      if (attempt > 10) {
        throw new Error(`Gave up after 10 retries with ${pending.length} unprocessed items.`);
      }
      const backoff = Math.min(1000 * 2 ** attempt, 30_000);
      console.log(`  retry ${attempt}: ${pending.length} unprocessed, sleeping ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}

async function importType(type) {
  const file = path.join(DYNAMO_BACKUP_DIR, `${type}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`[skip] ${file} not found.`);
    return;
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = data.Items ?? [];
  const table = targetTable(type);
  console.log(`[${type}] ${items.length} items -> ${table}`);
  if (items.length === 0) return;
  await batchWriteWithRetry(table, items);
  console.log(`[${type}] done`);
}

(async () => {
  // Import order matters for any FK-style references; parents first.
  for (const type of TYPES) {
    try {
      await importType(type);
    } catch (e) {
      console.error(`[fatal] failed importing ${type}:`, e.message);
      process.exit(2);
    }
  }
  console.log('All tables imported.');
})();
