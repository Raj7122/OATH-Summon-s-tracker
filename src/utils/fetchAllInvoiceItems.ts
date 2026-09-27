/**
 * Read an invoice's COMPLETE set of InvoiceSummons join rows.
 *
 * Why this exists: the `Invoice.items` hasMany connection cannot be trusted. Its
 * generated resolver hardcodes a page size —
 *
 *     #set( $limit = $util.defaultIfNull($context.args.limit, 100) )
 *
 * — and every query that read `invoice { items { items } }` omitted both `limit`
 * and `nextToken`, so any invoice with more than 100 line items came back
 * quietly truncated. Real damage that caused:
 *
 *   - A 214-item invoice opened for editing showed 100 items. Saving would then
 *     have written item_count: 100, recomputed the fee total from 100 rows, and
 *     overwritten the stored document — while the join table still held 214.
 *   - "Get as PDF/DOCX/XLSX" regenerated 100-row documents for that invoice.
 *   - Deleting a ~266-item invoice removed the Invoice record and only the first
 *     100 join rows, stranding 166 orphans pointing at an invoice that no longer
 *     existed (and permanently defeating the is_invoiced un-flag check, which
 *     treats any surviving join row as "still on another invoice").
 *
 * So: page the byInvoice GSI, follow nextToken to exhaustion, and if we somehow
 * can't finish, THROW. A partial line-item list must never reach a save, a
 * generated document, or a delete — silently billing half a client's violations
 * is far worse than an error the user can retry.
 *
 * @module utils/fetchAllInvoiceItems
 */

import { invoiceSummonsForInvoice } from '../graphql/customQueries';
import { InvoiceSummonsItem } from '../types/invoiceTracker';

// Rows per request. Well above any real invoice (the largest to date is 214), so
// the common case is a single round trip; the loop exists because DynamoDB caps a
// Query page at 1 MB regardless of `limit` and will hand back a nextToken.
const PAGE_SIZE = 1000;

// Hard stop so a malformed nextToken can't spin forever. 50 pages is ~50k rows —
// orders of magnitude beyond any plausible invoice, so tripping it means
// something is wrong, not that an invoice is genuinely that large.
const MAX_FETCHES = 50;

// Minimal client shape. Typing this as the full generateClient() return trips
// excessive generic stack depth in tsc, so callers pass their own instance —
// same approach as utils/invoiceDeletion.ts.
interface ApiClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  graphql: (options: any) => any;
}

/**
 * Fetch every InvoiceSummons row for one invoice, following pagination.
 *
 * @param apiClient - An Amplify GraphQL client (caller passes their own instance)
 * @param invoiceID - The invoice whose join rows to read
 * @returns All join rows, in byInvoice (summonsID) order
 * @throws If a page request fails or the MAX_FETCHES guard trips — never returns
 *         a partial list, because callers cannot tell a short list from a
 *         genuinely small invoice.
 */
export async function fetchAllInvoiceItems(
  apiClient: ApiClient,
  invoiceID: string,
): Promise<InvoiceSummonsItem[]> {
  const rows: InvoiceSummonsItem[] = [];
  let nextToken: string | null = null;
  let fetches = 0;

  do {
    if (fetches >= MAX_FETCHES) {
      // Loud failure by design — see the module header.
      console.error(
        `fetchAllInvoiceItems: exceeded ${MAX_FETCHES} pages for invoice ${invoiceID} ` +
          `after collecting ${rows.length} rows; refusing to return a partial list.`,
      );
      throw new Error(
        `Could not load all line items for invoice ${invoiceID} (pagination guard tripped).`,
      );
    }

    let page: { items?: InvoiceSummonsItem[]; nextToken?: string | null } | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await apiClient.graphql({
        query: invoiceSummonsForInvoice,
        variables: { invoiceID, limit: PAGE_SIZE, nextToken },
      });
      page = res?.data?.invoiceSummonsByInvoiceIDAndSummonsID;
    } catch (err) {
      console.error(`fetchAllInvoiceItems: failed to load a page for invoice ${invoiceID}:`, err);
      throw err;
    }

    if (!page) {
      console.error(
        `fetchAllInvoiceItems: empty response shape for invoice ${invoiceID} on page ${fetches + 1}.`,
      );
      throw new Error(`Could not load line items for invoice ${invoiceID} (unexpected response).`);
    }

    rows.push(...(page.items || []));
    nextToken = page.nextToken || null;
    fetches++;
  } while (nextToken);

  return rows;
}
