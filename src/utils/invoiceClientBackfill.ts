/**
 * One-time backfill: stamp `clientID` onto any Invoice record that is missing it.
 *
 * Legacy invoices created before the Invoice.clientID field was wired up have
 * NULL clientID, which means they don't surface under the referencing client
 * on the Client Detail page. This utility walks those orphan invoices, reads
 * the clientID from one of their linked summonses (via the InvoiceSummons
 * join table), and writes it back onto the Invoice.
 *
 * Safe properties:
 * - Never overwrites an existing non-null clientID.
 * - No-op when no orphan invoices exist (no mutations fire).
 * - Skips invoices whose summonses can't be resolved (logs and continues).
 */
import { generateClient } from 'aws-amplify/api';
import { getSummons } from '../graphql/queries';
import { listInvoicesWithItems, updateInvoiceRecord } from '../graphql/customQueries';
import { Invoice, InvoiceSummonsItem } from '../types/invoiceTracker';

const client = generateClient();
const MAX_FETCHES = 50;

export interface BackfillResult {
  scanned: number;
  updated: number;
  skipped: number;
  errors: number;
  details: Array<{ invoiceID: string; action: 'updated' | 'skipped' | 'error'; reason?: string; clientID?: string }>;
}

type ListInvoicesResult = { data?: { listInvoices?: { items?: Invoice[]; nextToken?: string | null } } };
type GetSummonsResult = { data?: { getSummons?: { clientID?: string | null } | null } };

async function fetchAllInvoices(): Promise<Invoice[]> {
  const all: Invoice[] = [];
  let nextToken: string | null = null;
  let fetchCount = 0;

  while (fetchCount < MAX_FETCHES) {
    const result = (await client.graphql({
      query: listInvoicesWithItems,
      variables: { limit: 1000, nextToken },
    })) as ListInvoicesResult;
    const items = result.data?.listInvoices?.items || [];
    all.push(...items);
    nextToken = result.data?.listInvoices?.nextToken || null;
    fetchCount++;
    if (!nextToken) break;
  }

  return all;
}

async function resolveClientIDFromItems(items: InvoiceSummonsItem[]): Promise<string | null> {
  for (const item of items) {
    if (!item.summonsID) continue;
    try {
      const result = (await client.graphql({
        query: getSummons,
        variables: { id: item.summonsID },
      })) as GetSummonsResult;
      const summonsClientID = result.data?.getSummons?.clientID;
      if (summonsClientID) return summonsClientID;
    } catch {
      continue;
    }
  }
  return null;
}

export async function runInvoiceClientBackfill(): Promise<BackfillResult> {
  const result: BackfillResult = { scanned: 0, updated: 0, skipped: 0, errors: 0, details: [] };

  let invoices: Invoice[];
  try {
    invoices = await fetchAllInvoices();
  } catch (err) {
    console.error('[invoiceClientBackfill] failed to list invoices:', err);
    return result;
  }

  const orphans = invoices.filter((inv) => !inv.clientID);
  result.scanned = orphans.length;

  if (orphans.length === 0) return result;

  for (const invoice of orphans) {
    const items = invoice.items?.items || [];
    if (items.length === 0) {
      result.skipped++;
      result.details.push({ invoiceID: invoice.id, action: 'skipped', reason: 'no linked summonses' });
      continue;
    }

    const clientID = await resolveClientIDFromItems(items);
    if (!clientID) {
      result.skipped++;
      result.details.push({ invoiceID: invoice.id, action: 'skipped', reason: 'summonses have no clientID' });
      continue;
    }

    try {
      await client.graphql({
        query: updateInvoiceRecord,
        variables: { input: { id: invoice.id, clientID } },
      });
      result.updated++;
      result.details.push({ invoiceID: invoice.id, action: 'updated', clientID });
    } catch (err) {
      result.errors++;
      result.details.push({
        invoiceID: invoice.id,
        action: 'error',
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
