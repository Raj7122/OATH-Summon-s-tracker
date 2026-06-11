#!/usr/bin/env node
/**
 * Generic one-time cleanup for stale client-match false positives.
 *
 * Background: before the matcher was hardened (token-aligned prefix matching,
 * commit 0d1570e), an overly-broad fetch + bare-startsWith matcher attached
 * unrelated companies to a client that merely shared a leading word. The matcher
 * is now correct and deployed, but stale summonses created by the old logic
 * remain attached to the client and keep showing up in the app.
 *
 * This script finds every summons attached to the target client and decides,
 * using the CURRENT (corrected) sweep logic, whether the live sweep would still
 * produce it:
 *   keep iff (respondent name contains one of the client's API search terms)
 *        AND (the hardened matcher maps the respondent back to this client)
 * Anything else is a stale false positive and is flagged for hard deletion.
 *
 * It reuses the EXACT matching + search-term logic that runs in the production
 * sweep (imported from the Lambda's own source), so its keep/delete decision
 * mirrors what the deployed sweep does today.
 *
 * SAFETY: dry-run by default — prints what WOULD be deleted and deletes nothing.
 * Pass --apply to perform the hard deletes (BatchWriteItem, chunks of 25).
 *
 * NOTE: this hard-deletes Summons rows directly. It does NOT clean up any
 * InvoiceSummons join rows, so confirm none of the targeted records are invoiced
 * before running with --apply.
 *
 * Usage:
 *   AWS_PROFILE=arthur CLIENT_ID=<client-uuid> node scripts/cleanup-false-positives.cjs            # dry run
 *   AWS_PROFILE=arthur CLIENT_ID=<client-uuid> node scripts/cleanup-false-positives.cjs --apply    # delete
 *
 * Required env: CLIENT_ID
 * Optional overrides via env: SUMMONS_TABLE, CLIENT_TABLE, AWS_REGION
 */

'use strict';

const path = require('path');

// Resolve aws-sdk and the production matcher from the Lambda's own node_modules,
// so we reuse the EXACT matching logic that runs in the sweep.
process.env.AWS_SDK_LOAD_CONFIG = '1'; // read region from the named AWS profile
const lambdaSrc = path.join(__dirname, '..', 'amplify', 'backend', 'function', 'dailySweep', 'src');
const AWS = require(path.join(lambdaSrc, 'node_modules', 'aws-sdk'));
const { matchRespondentToClient, buildClientNameMap, buildSearchTerm } =
  require(path.join(lambdaSrc, 'index'))._testExports;

const SUMMONS_TABLE = process.env.SUMMONS_TABLE || 'Summons-pnovfgxjnnfargx3dkymbhfqgq-prod';
const CLIENT_TABLE = process.env.CLIENT_TABLE || 'Client-pnovfgxjnnfargx3dkymbhfqgq-prod';
const CLIENT_ID = process.env.CLIENT_ID;
const APPLY = process.argv.includes('--apply');

// CLIENT_ID is required — there is no default, so --apply can never target the
// wrong client by accident.
if (!CLIENT_ID) {
  console.error('ERROR: CLIENT_ID env var is required.');
  console.error('Usage: AWS_PROFILE=<profile> CLIENT_ID=<client-uuid> node scripts/cleanup-false-positives.cjs [--apply]');
  process.exit(2);
}

if (process.env.AWS_REGION) AWS.config.update({ region: process.env.AWS_REGION });
const ddb = new AWS.DynamoDB.DocumentClient();

async function loadClient() {
  const res = await ddb.get({ TableName: CLIENT_TABLE, Key: { id: CLIENT_ID } }).promise();
  if (!res.Item) throw new Error(`Client ${CLIENT_ID} not found in ${CLIENT_TABLE}`);
  return res.Item;
}

// Query all summonses attached to the client via the byClient GSI (paginated).
async function loadAttachedSummonses() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.query({
      TableName: SUMMONS_TABLE,
      IndexName: 'byClient',
      KeyConditionExpression: 'clientID = :cid',
      ExpressionAttributeValues: { ':cid': CLIENT_ID },
      ExclusiveStartKey,
    }).promise();
    items.push(...res.Items);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

// A record stays only if the corrected sweep would still produce it for this
// client: fetchable by a current search term AND matched by the hardened matcher.
function isStillValid(summons, searchTerms, nameMap) {
  const rn = (summons.respondent_name || '').toUpperCase();
  if (!rn) return false;
  const fetchable = searchTerms.some((t) => rn.includes(t));
  const matched = matchRespondentToClient('', summons.respondent_name || '', nameMap);
  const matchable = !!matched && matched.id === CLIENT_ID;
  return fetchable && matchable;
}

async function batchDelete(ids) {
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25);
    let requestItems = {
      [SUMMONS_TABLE]: chunk.map((id) => ({ DeleteRequest: { Key: { id } } })),
    };
    // Retry UnprocessedItems with simple linear backoff
    for (let attempt = 0; attempt < 5 && Object.keys(requestItems).length; attempt++) {
      const res = await ddb.batchWrite({ RequestItems: requestItems }).promise();
      requestItems = res.UnprocessedItems && Object.keys(res.UnprocessedItems).length
        ? res.UnprocessedItems
        : {};
      if (Object.keys(requestItems).length) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
    if (Object.keys(requestItems).length) {
      throw new Error('Some items could not be deleted after retries');
    }
    console.log(`  deleted ${Math.min(i + 25, ids.length)}/${ids.length}`);
  }
}

async function main() {
  const client = await loadClient();
  const akas = Array.isArray(client.akas) ? client.akas : [];
  const searchTerms = [...new Set([buildSearchTerm(client.name), ...akas.map(buildSearchTerm)].filter(Boolean))];
  const nameMap = buildClientNameMap([client]);

  console.log(`Client: ${client.name} (${CLIENT_ID})`);
  console.log(`AKAs: ${JSON.stringify(akas)}`);
  console.log(`Current API search terms: ${JSON.stringify(searchTerms)}`);
  console.log('');

  const summonses = await loadAttachedSummonses();
  const toDelete = [];
  const toKeep = [];
  for (const s of summonses) {
    (isStillValid(s, searchTerms, nameMap) ? toKeep : toDelete).push(s);
  }

  const fmt = (s) => `  ${(s.summons_number || s.id).padEnd(14)} | ${s.respondent_name || '(no name)'}`;
  console.log(`KEEP (${toKeep.length} genuine):`);
  toKeep.forEach((s) => console.log(fmt(s)));
  console.log('');
  console.log(`DELETE (${toDelete.length} false positives):`);
  toDelete.forEach((s) => console.log(fmt(s)));
  console.log('');
  console.log(`Total attached: ${summonses.length} | keep: ${toKeep.length} | delete: ${toDelete.length}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --apply to perform deletions.');
    return;
  }
  if (!toDelete.length) {
    console.log('\nNothing to delete.');
    return;
  }
  console.log(`\nAPPLY — hard-deleting ${toDelete.length} records...`);
  await batchDelete(toDelete.map((s) => s.id));
  console.log('Done.');
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
