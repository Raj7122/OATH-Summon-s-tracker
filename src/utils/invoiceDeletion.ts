/**
 * Invoice deletion helper.
 *
 * Deleting an invoice must also un-flag the summonses it covered — otherwise the
 * `INVOICED` chip (summons modal) and the "Invoiced" column (client grid) keep
 * showing stale state after the invoice is gone.
 *
 * This consolidates the delete + un-flag logic that was previously duplicated (and
 * incomplete) across three call sites: InvoiceTrackerContext, ClientInvoicesDialog,
 * and SummonsDetailModal. The un-flag rules mirror the already-working remove-item
 * flow in InvoiceBuilder.tsx (a summons is only un-flagged when it is not still on
 * another invoice), plus the localStorage cleanup that flow omits.
 *
 * @module utils/invoiceDeletion
 */

import { Invoice } from '../types/invoiceTracker';
import {
  deleteInvoiceRecord,
  deleteInvoiceSummonsRecord,
  invoiceSummonsItemsBySummons,
} from '../graphql/customQueries';
import { getSummons } from '../graphql/queries';
import { updateSummons } from '../graphql/mutations';
import { appendInvoiceRemovedEntry } from './invoiceAuditLog';
import { isInvoiced as isInvoicedLocally, unmarkAsInvoiced } from './invoiceTracking';

// Minimal client shape — typing this as the full generateClient() return triggers
// excessive generic stack depth in tsc. Callers pass their own Amplify client.
interface ApiClient {
  graphql: (options: any) => any;
}

/**
 * Delete an invoice, its InvoiceSummons join rows, and clear is_invoiced /
 * invoice_date on each underlying summons — UNLESS the summons still appears on
 * another invoice (in which case it must stay flagged).
 *
 * @param apiClient - An Amplify GraphQL client (caller passes their own instance)
 * @param invoice   - The invoice to delete; must include items[].id and items[].summonsID
 */
export async function deleteInvoiceAndUnmarkSummonses(
  apiClient: ApiClient,
  invoice: Invoice,
): Promise<void> {
  const items = invoice.items?.items || [];
  // Unique summons IDs covered by this invoice (a summons can appear once per invoice).
  const summonsIds = [...new Set(items.map((i) => i.summonsID).filter(Boolean))];

  // 1. Delete all join rows for this invoice.
  await Promise.all(
    items.map((item) =>
      apiClient.graphql({
        query: deleteInvoiceSummonsRecord,
        variables: { input: { id: item.id } },
      }),
    ),
  );

  // 2. Delete the invoice record itself.
  await apiClient.graphql({
    query: deleteInvoiceRecord,
    variables: { input: { id: invoice.id } },
  });

  // 3. For each summons, clear is_invoiced unless it is still on ANOTHER invoice.
  const clearedIds: string[] = [];
  await Promise.all(
    summonsIds.map(async (summonsID) => {
      // Check whether this summons still appears on any other invoice. We exclude
      // invoice.id explicitly because the GSI may still return the just-deleted
      // rows momentarily (eventual consistency).
      let stillOnAnotherInvoice = false;
      try {
        const res: any = await apiClient.graphql({
          query: invoiceSummonsItemsBySummons,
          variables: { summonsID, limit: 100 },
        });
        const remaining = res?.data?.invoiceSummonsesBySummonsID?.items || [];
        stillOnAnotherInvoice = remaining.some(
          (i: any) => i.invoiceID && i.invoiceID !== invoice.id,
        );
      } catch (e) {
        console.warn(
          'Could not verify other invoices for summons; leaving is_invoiced untouched:',
          e,
        );
        stillOnAnotherInvoice = true; // fail-safe: don't unflag if unsure
      }
      if (stillOnAnotherInvoice) return;

      // Best-effort audit-log entry recording the removal.
      let updatedLog: string | undefined;
      try {
        const existing: any = await apiClient.graphql({
          query: getSummons,
          variables: { id: summonsID },
        });
        updatedLog = appendInvoiceRemovedEntry(
          existing?.data?.getSummons?.activity_log,
          invoice.invoice_number,
        );
      } catch {
        /* keep going without the log entry */
      }

      await apiClient.graphql({
        query: updateSummons,
        variables: {
          input: {
            id: summonsID,
            is_invoiced: false,
            invoice_date: null,
            ...(updatedLog ? { activity_log: updatedLog } : {}),
          },
        },
      });
      clearedIds.push(summonsID);
    }),
  );

  // 4. Clear the localStorage fallback so the chip/column don't read it as invoiced.
  unmarkAsInvoiced(clearedIds);
}

/** Minimal shape the reconcile needs from a summons row. */
interface FlaggableSummons {
  id: string;
  is_invoiced?: boolean | null;
}

/**
 * Self-heal stale "invoiced" flags.
 *
 * Summonses invoiced before the delete-time un-flagging existed can be left with
 * is_invoiced = true (and a localStorage entry) even though their invoice was
 * deleted — so the INVOICED chip / receipt icon keep showing with no real invoice
 * behind them. This checks each flagged summons against the authoritative
 * InvoiceSummons join rows and clears the flag (DB + localStorage) when nothing
 * actually references it.
 *
 * @returns the set of summons IDs whose flag was cleared (empty if none).
 */
export async function reconcileInvoicedSummonses(
  apiClient: ApiClient,
  summonses: FlaggableSummons[],
): Promise<Set<string>> {
  // Only the genuinely-flagged rows are worth a lookup; once cleaned, a client
  // page visit finds none flagged and issues zero queries.
  const flagged = summonses.filter((s) => s.is_invoiced || isInvoicedLocally(s.id));
  const cleared = new Set<string>();

  await Promise.all(
    flagged.map(async (s) => {
      let hasInvoice = true; // fail-safe: never clear unless we confirm none exists
      try {
        const res: any = await apiClient.graphql({
          query: invoiceSummonsItemsBySummons,
          variables: { summonsID: s.id, limit: 100 },
        });
        const items = res?.data?.invoiceSummonsesBySummonsID?.items || [];
        // Count only join rows whose invoice still resolves — an old delete may
        // have removed the Invoice record but left an orphaned join row behind,
        // whose nested `invoice` comes back null.
        hasInvoice = items.some((i: any) => i.invoice);
      } catch (e) {
        console.warn('Could not verify invoices for summons; leaving flag as-is:', e);
        return;
      }
      if (hasInvoice) return;

      try {
        await apiClient.graphql({
          query: updateSummons,
          variables: { input: { id: s.id, is_invoiced: false, invoice_date: null } },
        });
      } catch (e) {
        console.warn('Could not clear stale is_invoiced flag for summons:', e);
        return;
      }
      unmarkAsInvoiced([s.id]);
      cleared.add(s.id);
    }),
  );

  return cleared;
}
