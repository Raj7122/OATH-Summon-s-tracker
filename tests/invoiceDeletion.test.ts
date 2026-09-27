/**
 * @vitest-environment jsdom
 *
 * Tests for deleteInvoiceAndUnmarkSummonses — the shared helper that deletes an
 * invoice and clears the is_invoiced flag on its summonses, mirroring the
 * InvoiceBuilder remove-item rules (a summons stays flagged if it is still on
 * another invoice) and clearing the localStorage fallback.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  deleteInvoiceAndUnmarkSummonses,
  reconcileInvoicedSummonses,
} from '../src/utils/invoiceDeletion';
import { markAsInvoiced, isInvoiced } from '../src/utils/invoiceTracking';
import { Invoice } from '../src/types/invoiceTracker';

// Minimal Amplify client shape the delete helpers accept.
type TestClient = { graphql: (arg: { query: string; variables?: unknown }) => Promise<unknown> };

// Build a mock Amplify graphql client that routes by operation name and records
// every UpdateSummons input so the assertions can inspect what got un-flagged.
//
// `joinRowPages` serves InvoiceSummonsForInvoice — the byInvoice GSI query the
// delete path now uses to get its OWN complete row list rather than trusting
// invoice.items.items (see the truncation test at the bottom of this file).
// Pages are returned in order, mimicking DynamoDB's nextToken.
function makeClient(
  remainingBySummons: Record<string, Array<{ invoiceID: string }>>,
  joinRowPages: Array<Array<{ id: string; summonsID: string }>> = [],
) {
  const updateInputs: any[] = [];
  const deletedInvoiceIds: string[] = [];
  const deletedJoinIds: string[] = [];

  const graphql = vi.fn(async ({ query, variables }: any) => {
    if (query.includes('InvoiceSummonsForInvoice')) {
      const idx = variables.nextToken ? Number(variables.nextToken) : 0;
      return {
        data: {
          invoiceSummonsByInvoiceIDAndSummonsID: {
            items: joinRowPages[idx] ?? [],
            nextToken: idx + 1 < joinRowPages.length ? String(idx + 1) : null,
          },
        },
      };
    }
    if (query.includes('DeleteInvoiceSummonsRecord')) {
      deletedJoinIds.push(variables.input.id);
      return {};
    }
    if (query.includes('DeleteInvoiceRecord')) {
      deletedInvoiceIds.push(variables.input.id);
      return {};
    }
    if (query.includes('InvoiceSummonsItemsBySummons')) {
      return {
        data: {
          invoiceSummonsesBySummonsID: {
            items: remainingBySummons[variables.summonsID] || [],
          },
        },
      };
    }
    if (query.includes('GetSummons')) {
      return { data: { getSummons: { id: variables.id, activity_log: null } } };
    }
    if (query.includes('UpdateSummons')) {
      updateInputs.push(variables.input);
      return { data: { updateSummons: variables.input } };
    }
    throw new Error(`Unexpected query: ${query.slice(0, 60)}`);
  });

  return { client: { graphql }, updateInputs, deletedInvoiceIds, deletedJoinIds };
}

const invoice: any = {
  id: 'inv-1',
  invoice_number: 'INV-Test-2026-01-15',
  items: {
    items: [
      { id: 'join-A', summonsID: 'sum-A' }, // only on inv-1
      { id: 'join-B', summonsID: 'sum-B' }, // also on inv-2
    ],
  },
};

describe('deleteInvoiceAndUnmarkSummonses', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('deletes the invoice, its join rows, and un-flags a single-invoice summons', async () => {
    markAsInvoiced(['sum-A', 'sum-B']);
    const { client, updateInputs, deletedInvoiceIds, deletedJoinIds } = makeClient(
      {
        'sum-A': [], // no other invoice references sum-A
        'sum-B': [{ invoiceID: 'inv-2' }], // sum-B still on inv-2
      },
      [invoice.items.items],
    );

    await deleteInvoiceAndUnmarkSummonses(client as any, invoice);

    // Both join rows + the invoice record were deleted.
    expect(deletedJoinIds.sort()).toEqual(['join-A', 'join-B']);
    expect(deletedInvoiceIds).toEqual(['inv-1']);

    // sum-A is un-flagged in the DB...
    const aUpdate = updateInputs.find((u) => u.id === 'sum-A');
    expect(aUpdate).toBeTruthy();
    expect(aUpdate.is_invoiced).toBe(false);
    expect(aUpdate.invoice_date).toBeNull();

    // ...and cleared from the localStorage fallback.
    expect(isInvoiced('sum-A')).toBe(false);
  });

  it('leaves a summons flagged when it still appears on another invoice', async () => {
    markAsInvoiced(['sum-A', 'sum-B']);
    const { client, updateInputs } = makeClient(
      {
        'sum-A': [],
        'sum-B': [{ invoiceID: 'inv-2' }],
      },
      [invoice.items.items],
    );

    await deleteInvoiceAndUnmarkSummonses(client as any, invoice);

    // sum-B must NOT be un-flagged — it is still on inv-2.
    const bUpdate = updateInputs.find((u) => u.id === 'sum-B');
    expect(bUpdate).toBeUndefined();

    // localStorage fallback for sum-B is preserved.
    expect(isInvoiced('sum-B')).toBe(true);
  });

  // Reproduces Jacky's report: a Platinum Supply invoice covering several
  // violations is deleted, none of those violations are on any other invoice,
  // so EVERY one must be un-flagged in the DB and localStorage. Pre-fix, the
  // delete left is_invoiced=true and the grid/modal kept showing "invoiced".
  it('un-flags every violation when a multi-violation invoice is deleted (Platinum Supply)', async () => {
    const platinumInvoice: any = {
      id: 'inv-platinum',
      invoice_number: 'INV-Platinum-Supply-2026-06-11',
      items: {
        items: [
          { id: 'join-1', summonsID: 'sum-1' },
          { id: 'join-2', summonsID: 'sum-2' },
          { id: 'join-3', summonsID: 'sum-3' },
        ],
      },
    };
    markAsInvoiced(['sum-1', 'sum-2', 'sum-3']);
    // None of the three violations appear on any other invoice.
    const { client, updateInputs, deletedInvoiceIds, deletedJoinIds } = makeClient(
      {
        'sum-1': [],
        'sum-2': [],
        'sum-3': [],
      },
      [platinumInvoice.items.items],
    );

    await deleteInvoiceAndUnmarkSummonses(client as any, platinumInvoice);

    // Invoice + all three join rows are gone.
    expect(deletedInvoiceIds).toEqual(['inv-platinum']);
    expect(deletedJoinIds.sort()).toEqual(['join-1', 'join-2', 'join-3']);

    // Every violation is un-flagged in the DB...
    for (const id of ['sum-1', 'sum-2', 'sum-3']) {
      const update = updateInputs.find((u) => u.id === id);
      expect(update, `expected UpdateSummons for ${id}`).toBeTruthy();
      expect(update.is_invoiced).toBe(false);
      expect(update.invoice_date).toBeNull();
      // ...and in the localStorage fallback.
      expect(isInvoiced(id)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Truncation regression — the orphaned-join-row bug
// ---------------------------------------------------------------------------

describe('deleteInvoiceAndUnmarkSummonses — reads its own complete row list', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Reproduces real production damage. Invoice c625a87b (CORPORATE EXPRESS) had
  // ~266 join rows. The delete path read invoice.items.items, which the hasMany
  // resolver caps at 100, so it deleted the Invoice record plus only the first
  // 100 rows — stranding 166 orphans that pointed at an invoice which no longer
  // existed. Those orphans then permanently defeat the un-flag check, because
  // any surviving join row reads as "still on another invoice".
  //
  // 266 - 100 = 166, exactly what was found in the table.
  it('deletes ALL join rows when the caller-supplied items were truncated to 100', async () => {
    const TOTAL = 266;
    const allRows = Array.from({ length: TOTAL }, (_, i) => ({
      id: `join-${i}`,
      invoiceID: 'inv-corp-old',
      summonsID: `sum-${i}`,
    }));

    const truncatedInvoice = {
      id: 'inv-corp-old',
      invoice_number: 'INV-CORPORATE_EXPRESS_IN-2026-06-25',
      // What the capped connection handed the caller — the decoy.
      items: { items: allRows.slice(0, 100) },
    } as unknown as Invoice;

    // No summons is on any other invoice, so all must be un-flagged.
    const remaining = Object.fromEntries(allRows.map((r) => [r.summonsID, []]));
    // The GSI serves the truth, in 100/100/66 pages.
    const { client, deletedInvoiceIds, deletedJoinIds } = makeClient(remaining, [
      allRows.slice(0, 100),
      allRows.slice(100, 200),
      allRows.slice(200),
    ]);

    await deleteInvoiceAndUnmarkSummonses(client as TestClient, truncatedInvoice);

    // Every join row is gone — no orphans left behind.
    expect(deletedJoinIds).toHaveLength(TOTAL);
    expect(new Set(deletedJoinIds).size).toBe(TOTAL);
    expect(deletedInvoiceIds).toEqual(['inv-corp-old']);
  });

  // If we cannot establish the real row set, deleting nothing is the only safe
  // outcome: a half-deleted invoice is worse than one that is still there.
  it('deletes nothing when the join rows cannot be loaded', async () => {
    const graphql = vi.fn(async ({ query }: { query: string }) => {
      if (query.includes('InvoiceSummonsForInvoice')) throw new Error('network down');
      throw new Error(`should not have been called: ${query.slice(0, 40)}`);
    });

    await expect(
      deleteInvoiceAndUnmarkSummonses({ graphql } as TestClient, {
        id: 'inv-x',
        invoice_number: 'INV-X',
        items: { items: [{ id: 'join-1', summonsID: 'sum-1' }] },
      } as unknown as Invoice),
    ).rejects.toThrow('network down');

    // Only the failed read was attempted — no deletes, no flag changes.
    expect(graphql).toHaveBeenCalledTimes(1);
  });
});

describe('reconcileInvoicedSummonses', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clears a flagged summons with no backing invoice (DB + localStorage)', async () => {
    markAsInvoiced(['sum-stale']);
    const { client, updateInputs } = makeClient({ 'sum-stale': [] });
    const summonses = [{ id: 'sum-stale', is_invoiced: true }];

    const cleared = await reconcileInvoicedSummonses(client as any, summonses);

    expect(cleared.has('sum-stale')).toBe(true);
    const update = updateInputs.find((u) => u.id === 'sum-stale');
    expect(update.is_invoiced).toBe(false);
    expect(update.invoice_date).toBeNull();
    expect(isInvoiced('sum-stale')).toBe(false);
  });

  it('leaves a flagged summons untouched when an invoice still references it', async () => {
    const { client, updateInputs } = makeClient({
      'sum-live': [{ invoiceID: 'inv-9', invoice: { id: 'inv-9' } }],
    });
    const summonses = [{ id: 'sum-live', is_invoiced: true }];

    const cleared = await reconcileInvoicedSummonses(client as any, summonses);

    expect(cleared.size).toBe(0);
    expect(updateInputs.length).toBe(0);
  });

  it('clears a flagged summons whose join row is orphaned (invoice gone)', async () => {
    markAsInvoiced(['sum-orphan']);
    // Join row exists but its nested invoice resolved to null — the Invoice
    // record was deleted but the join row was left behind.
    const { client, updateInputs } = makeClient({
      'sum-orphan': [{ invoiceID: 'inv-dead', invoice: null }],
    });
    const summonses = [{ id: 'sum-orphan', is_invoiced: true }];

    const cleared = await reconcileInvoicedSummonses(client as any, summonses);

    expect(cleared.has('sum-orphan')).toBe(true);
    expect(updateInputs.find((u) => u.id === 'sum-orphan').is_invoiced).toBe(false);
    expect(isInvoiced('sum-orphan')).toBe(false);
  });

  it('issues no queries when nothing is flagged', async () => {
    const { client } = makeClient({});
    const summonses = [{ id: 'sum-clean', is_invoiced: false }];

    const cleared = await reconcileInvoicedSummonses(client as any, summonses);

    expect(cleared.size).toBe(0);
    expect((client.graphql as any).mock.calls.length).toBe(0);
  });

  // The state Platinum Supply is in on prod right now: an invoice was deleted by
  // the OLD (pre-fix) code, which removed the Invoice + join rows but left every
  // violation flagged is_invoiced=true. Opening the client page must self-heal
  // ALL of them, even when only some carry a localStorage fallback entry.
  it('heals all violations left stale by a pre-fix deletion (Platinum Supply)', async () => {
    // Mixed state: two carry the localStorage fallback, one only the DB flag.
    markAsInvoiced(['sum-1', 'sum-2']);
    const { client, updateInputs } = makeClient({
      'sum-1': [],
      'sum-2': [],
      'sum-3': [],
    });
    const summonses = [
      { id: 'sum-1', is_invoiced: true },
      { id: 'sum-2', is_invoiced: true },
      { id: 'sum-3', is_invoiced: true },
    ];

    const cleared = await reconcileInvoicedSummonses(client as any, summonses);

    // All three are healed.
    expect([...cleared].sort()).toEqual(['sum-1', 'sum-2', 'sum-3']);
    for (const id of ['sum-1', 'sum-2', 'sum-3']) {
      const update = updateInputs.find((u) => u.id === id);
      expect(update, `expected UpdateSummons for ${id}`).toBeTruthy();
      expect(update.is_invoiced).toBe(false);
      expect(update.invoice_date).toBeNull();
      expect(isInvoiced(id)).toBe(false);
    }
  });
});
