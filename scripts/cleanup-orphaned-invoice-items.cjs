#!/usr/bin/env node
/**
 * One-time cleanup for ORPHANED InvoiceSummons join rows.
 *
 * Background: the `Invoice.items` hasMany connection's generated resolver caps a
 * page at 100 rows (`$util.defaultIfNull($ctx.args.limit, 100)`), and the app's
 * delete path used to read its row list from that connection. So deleting an
 * invoice with more than 100 line items removed the Invoice record plus only the
 * first 100 join rows — stranding the rest, pointing at an invoice that no longer
 * exists. In production this left 166 rows behind from a ~266-item CORPORATE
 * EXPRESS invoice (266 - 100 = 166).
 *
 * Those orphans are not harmless: `stillOnAnotherInvoice` in the un-flag checks
 * (InvoiceBuilder's remove-item path and utils/invoiceDeletion) treats ANY
 * surviving join row as proof the summons is still invoiced, so an orphan
 * permanently blocks is_invoiced from ever being cleared for that summons.
 *
 * The read path is fixed (utils/fetchAllInvoiceItems pages the byInvoice GSI, so
 * no NEW orphans can be created). This script removes the ones already there.
 *
 * What counts as an orphan: a row in InvoiceSummons whose `invoiceID` matches no
 * record in the Invoice table. Discovered generically — nothing is hardcoded — so
 * the script stays correct if the set changes before it is run.
 *
 * SAFETY:
 *   - Dry run by default. Deletes nothing without --apply.
 *   - Always writes a full JSON backup of every candidate row (all attributes)
 *     to migration/backups/dynamodb/ BEFORE deleting anything, even in dry run.
 *   - Reports, per orphan, whether the underlying summons is still covered by a
 *     LIVE invoice. If a summons is flagged is_invoiced but would be left with no
 *     live invoice at all, the script refuses to --apply unless
 *     ALLOW_UNCOVERED=1, because deleting that row would silently change what the
 *     app reports about a real billing record.
 *   - Deletes ONLY InvoiceSummons rows. Never touches Invoice or Summons.
 *
 * Usage:
 *   AWS_PROFILE=arthur node scripts/cleanup-orphaned-invoice-items.cjs            # dry run
 *   AWS_PROFILE=arthur node scripts/cleanup-orphaned-invoice-items.cjs --apply    # delete
 *
 * Optional env: INVOICE_TABLE, INVOICE_SUMMONS_TABLE, SUMMONS_TABLE, AWS_REGION,
 *               ALLOW_UNCOVERED=1
 */

'use strict';

const fs = require('fs');
const path = require('path');

process.env.AWS_SDK_LOAD_CONFIG = '1'; // read region from the named AWS profile
const lambdaSrc = path.join(__dirname, '..', 'amplify', 'backend', 'function', 'dailySweep', 'src');
const AWS = require(path.join(lambdaSrc, 'node_modules', 'aws-sdk'));

const STACK = 'pnovfgxjnnfargx3dkymbhfqgq-prod';
const INVOICE_TABLE = process.env.INVOICE_TABLE || `Invoice-${STACK}`;
const INVOICE_SUMMONS_TABLE = process.env.INVOICE_SUMMONS_TABLE || `InvoiceSummons-${STACK}`;
const SUMMONS_TABLE = process.env.SUMMONS_TABLE || `Summons-${STACK}`;
const APPLY = process.argv.includes('--apply');
const ALLOW_UNCOVERED = process.env.ALLOW_UNCOVERED === '1';

if (process.env.AWS_REGION) AWS.config.update({ region: process.env.AWS_REGION });
const ddb = new AWS.DynamoDB.DocumentClient();

/** Scan an entire table, following LastEvaluatedKey. */
async function scanAll(TableName, ProjectionExpression) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb
      .scan({ TableName, ...(ProjectionExpression ? { ProjectionExpression } : {}), ExclusiveStartKey })
      .promise();
    items.push(...(res.Items || []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

/** BatchGet in chunks of 100, retrying UnprocessedKeys. */
async function batchGetSummonses(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    let Keys = ids.slice(i, i + 100).map((id) => ({ id }));
    while (Keys.length) {
      const res = await ddb
        .batchGet({
          RequestItems: {
            [SUMMONS_TABLE]: {
              Keys,
              ProjectionExpression: 'id, summons_number, is_invoiced, clientID, respondent_name',
            },
          },
        })
        .promise();
      out.push(...((res.Responses || {})[SUMMONS_TABLE] || []));
      Keys = ((res.UnprocessedKeys || {})[SUMMONS_TABLE] || {}).Keys || [];
    }
  }
  return out;
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (rows will be deleted)' : 'DRY RUN (nothing will be deleted)'}`);
  console.log(`Tables: ${INVOICE_TABLE} / ${INVOICE_SUMMONS_TABLE} / ${SUMMONS_TABLE}\n`);

  const [invoices, joinRows] = await Promise.all([
    scanAll(INVOICE_TABLE, 'id, invoice_number, payment_status'),
    scanAll(INVOICE_SUMMONS_TABLE),
  ]);
  const liveInvoiceIds = new Set(invoices.map((i) => i.id));
  console.log(`Invoices: ${invoices.length}   InvoiceSummons rows: ${joinRows.length}`);

  const orphans = joinRows.filter((r) => r.invoiceID && !liveInvoiceIds.has(r.invoiceID));
  if (orphans.length === 0) {
    console.log('\nNo orphaned join rows found. Nothing to do.');
    return;
  }

  // Group by the dangling invoiceID so the report shows which deleted invoice
  // each block came from.
  const byInvoice = new Map();
  for (const r of orphans) {
    if (!byInvoice.has(r.invoiceID)) byInvoice.set(r.invoiceID, []);
    byInvoice.get(r.invoiceID).push(r);
  }

  console.log(`\nORPHANED rows: ${orphans.length} across ${byInvoice.size} dangling invoiceID(s)`);
  for (const [iid, rows] of [...byInvoice].sort((a, b) => b[1].length - a[1].length)) {
    const fees = rows.reduce((s, r) => s + (Number(r.legal_fee) || 0), 0);
    console.log(`  ${iid}: ${rows.length} rows, $${fees.toLocaleString()} in legal fees`);
  }

  // ---- Backup BEFORE anything else, dry run included. ---------------------
  const backupDir = path.join(__dirname, '..', 'migration', 'backups', 'dynamodb');
  fs.mkdirSync(backupDir, { recursive: true });
  // Timestamp is only used to name the file; a fixed-second collision would just
  // overwrite an identical backup from the same second.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `orphaned-invoice-summons-${stamp}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      { table: INVOICE_SUMMONS_TABLE, capturedAt: new Date().toISOString(), rows: orphans },
      null,
      2,
    ),
  );
  console.log(`\nBackup of all ${orphans.length} rows written to:\n  ${backupPath}`);

  // ---- Coverage check: is each summons still on a LIVE invoice? -----------
  // The orphan rows are garbage, but the summonses they reference are real. If a
  // summons is flagged is_invoiced and has no live invoice behind it, removing
  // its last (orphan) row changes what the app reports — so surface that loudly.
  const summonsIds = [...new Set(orphans.map((r) => r.summonsID).filter(Boolean))];
  const liveBySummons = new Map(); // summonsID -> [invoice_number]
  for (const r of joinRows) {
    if (!liveInvoiceIds.has(r.invoiceID)) continue;
    const inv = invoices.find((i) => i.id === r.invoiceID);
    if (!liveBySummons.has(r.summonsID)) liveBySummons.set(r.summonsID, []);
    liveBySummons.get(r.summonsID).push(inv ? inv.invoice_number : r.invoiceID);
  }

  const summonses = await batchGetSummonses(summonsIds);
  const byId = new Map(summonses.map((s) => [s.id, s]));

  let covered = 0;
  const uncoveredFlagged = [];
  const uncoveredUnflagged = [];
  for (const sid of summonsIds) {
    const live = liveBySummons.get(sid) || [];
    const s = byId.get(sid);
    if (live.length > 0) covered++;
    else if (s && s.is_invoiced === true) uncoveredFlagged.push(s);
    else uncoveredUnflagged.push(s || { id: sid, summons_number: '(summons not found)' });
  }

  console.log('\n=== Coverage of the referenced summonses ===');
  console.log(`  ${summonsIds.length} distinct summonses referenced by orphan rows`);
  console.log(`  ${covered} are still covered by a LIVE invoice (safe — nothing changes for them)`);
  console.log(`  ${uncoveredUnflagged.length} have no live invoice and are already is_invoiced=false (safe)`);
  console.log(`  ${uncoveredFlagged.length} have NO live invoice but are still is_invoiced=true`);
  for (const s of uncoveredFlagged.slice(0, 20)) {
    console.log(`     ! ${s.summons_number} (${s.id})`);
  }
  if (uncoveredFlagged.length > 20) {
    console.log(`     ... and ${uncoveredFlagged.length - 20} more`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing was deleted. Re-run with --apply to delete the rows above.');
    return;
  }

  if (uncoveredFlagged.length > 0 && !ALLOW_UNCOVERED) {
    console.error(
      `\nREFUSING TO APPLY: ${uncoveredFlagged.length} summons(es) are flagged is_invoiced=true ` +
        `with no live invoice behind them. Deleting their only join row would change what the app ` +
        `reports about a real billing record. Review the list above, then re-run with ` +
        `ALLOW_UNCOVERED=1 if that is intended.`,
    );
    process.exit(3);
  }

  // ---- Delete, in chunks of 25 (BatchWrite limit), retrying unprocessed. --
  console.log(`\nDeleting ${orphans.length} orphaned rows...`);
  let deleted = 0;
  for (let i = 0; i < orphans.length; i += 25) {
    let RequestItems = {
      [INVOICE_SUMMONS_TABLE]: orphans.slice(i, i + 25).map((r) => ({
        DeleteRequest: { Key: { id: r.id } },
      })),
    };
    let attempt = 0;
    while (RequestItems[INVOICE_SUMMONS_TABLE] && RequestItems[INVOICE_SUMMONS_TABLE].length) {
      const res = await ddb.batchWrite({ RequestItems }).promise();
      const done =
        RequestItems[INVOICE_SUMMONS_TABLE].length -
        (((res.UnprocessedItems || {})[INVOICE_SUMMONS_TABLE] || []).length);
      deleted += done;
      RequestItems = res.UnprocessedItems || {};
      if (RequestItems[INVOICE_SUMMONS_TABLE] && RequestItems[INVOICE_SUMMONS_TABLE].length) {
        if (++attempt > 5) throw new Error('Too many UnprocessedItems retries; aborting.');
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
    process.stdout.write(`\r  deleted ${deleted}/${orphans.length}`);
  }
  console.log('');

  // ---- Verify ------------------------------------------------------------
  const after = await scanAll(INVOICE_SUMMONS_TABLE, 'id, invoiceID');
  const stillOrphaned = after.filter((r) => r.invoiceID && !liveInvoiceIds.has(r.invoiceID));
  console.log(`\nVerification: ${after.length} join rows remain, ${stillOrphaned.length} still orphaned.`);
  if (stillOrphaned.length > 0) {
    console.error('WARNING: some orphans survived. Re-run to finish.');
    process.exit(4);
  }
  console.log('Done — all orphaned join rows removed.');
}

main().catch((err) => {
  console.error('\nFAILED:', err);
  process.exit(1);
});
