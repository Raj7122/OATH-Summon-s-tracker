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

// Build a mock Amplify graphql client that routes by operation name and records
// every UpdateSummons input so the assertions can inspect what got un-flagged.
function makeClient(remainingBySummons: Record<string, Array<{ invoiceID: string }>>) {
  const updateInputs: any[] = [];
  const deletedInvoiceIds: string[] = [];
  const deletedJoinIds: string[] = [];

  const graphql = vi.fn(async ({ query, variables }: any) => {
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
    const { client, updateInputs, deletedInvoiceIds, deletedJoinIds } = makeClient({
      'sum-A': [], // no other invoice references sum-A
      'sum-B': [{ invoiceID: 'inv-2' }], // sum-B still on inv-2
    });

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
    const { client, updateInputs } = makeClient({
      'sum-A': [],
      'sum-B': [{ invoiceID: 'inv-2' }],
    });

    await deleteInvoiceAndUnmarkSummonses(client as any, invoice);

    // sum-B must NOT be un-flagged — it is still on inv-2.
    const bUpdate = updateInputs.find((u) => u.id === 'sum-B');
    expect(bUpdate).toBeUndefined();

    // localStorage fallback for sum-B is preserved.
    expect(isInvoiced('sum-B')).toBe(true);
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
});
