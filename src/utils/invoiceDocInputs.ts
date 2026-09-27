/**
 * Rebuild invoice-document generator inputs from a stored Invoice record.
 *
 * Both the edit screen and the Tracker's on-demand "download in another format"
 * actions need to turn a persisted Invoice (+ its InvoiceSummons join rows) back
 * into the `{ items, recipient, options, extras }` shape the PDF/DOCX/XLSX
 * generators expect. Centralizing it here keeps the two paths consistent — most
 * importantly the fine-precedence rule below.
 *
 * Fine precedence: the fee/fine/highlight the user SAVED on the invoice (the join
 * row) wins over the live NYC summons balance. `??` (not `||`) so a saved 0 — a
 * fine the user deliberately removed or that was paid in full — still wins. The
 * live summons is only consulted for display-only columns (violation/hearing
 * dates, status, results) and as a fallback when the invoice has no stored fine.
 */

import { generateClient } from 'aws-amplify/api';
import { getSummons } from '../graphql/queries';
import {
  InvoiceCartItem,
  InvoiceExtraLineItem,
  InvoiceOptions,
  InvoiceRecipient,
  HighlightedSections,
} from '../types/invoice';
import { Invoice as TrackerInvoice } from '../types/invoiceTracker';
import { FOOTER_TEXT } from '../constants/invoiceDefaults';
import { compareByHearingDateAsc } from './invoiceOrdering';
import { fetchAllInvoiceItems } from './fetchAllInvoiceItems';
import { InvoiceSummonsItem } from '../types/invoiceTracker';

export interface InvoiceDocInputs {
  items: InvoiceCartItem[];
  recipient: InvoiceRecipient;
  options: InvoiceOptions;
  extras: InvoiceExtraLineItem[];
}

// Defensively parse an AWSJSON field that may arrive as a JSON string, an already
// parsed value, or null/legacy-missing. Returns `fallback` on anything unexpected.
const parseJsonField = <T>(raw: unknown, fallback: T, isValid: (v: unknown) => boolean): T => {
  if (raw === null || raw === undefined) return fallback;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return isValid(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Hydrate a stored invoice into generator inputs.
 * @param invoice    The Invoice record.
 * @param client     Optional Amplify GraphQL client (injectable for testing).
 * @param prefetchedItems  Optional pre-fetched join rows. Callers that already paged the
 *                   byInvoice GSI pass them in to skip a second round trip; everyone
 *                   else leaves this undefined and we fetch them here.
 */
export const buildInvoiceDocInputs = async (
  invoice: TrackerInvoice,
  // Amplify GraphQL client; injectable so tests can supply a fake. Typed loosely
  // to accept the real client without tripping strictFunctionTypes on its overloads.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: { graphql: (...args: any[]) => any } = generateClient(),
  prefetchedItems?: InvoiceSummonsItem[],
): Promise<InvoiceDocInputs> => {
  // Never read invoice.items.items here: that connection is capped at 100 rows by
  // its resolver, which is exactly how a 214-item invoice regenerated as a 100-row
  // document. Page the byInvoice GSI instead (see utils/fetchAllInvoiceItems).
  const joinItems = prefetchedItems ?? (await fetchAllInvoiceItems(client, invoice.id));

  // Fetch each line item's live summons for the display-only columns. A failed or
  // missing summons degrades to sparse data rather than dropping the line item.
  const summonsResults = await Promise.all(
    joinItems.map(async (j) => {
      try {
        const res = await client.graphql({
          query: getSummons,
          variables: { id: j.summonsID },
        });
        return (res?.data?.getSummons ?? null) as Record<string, unknown> | null;
      } catch {
        return null;
      }
    }),
  );

  const items: InvoiceCartItem[] = joinItems.map((j, idx) => {
    const s = (summonsResults[idx] ?? null) as Record<string, unknown> | null;
    return {
      id: j.summonsID,
      summons_number: j.summons_number,
      respondent_name: (s?.respondent_name as string) || '',
      clientID: (s?.clientID as string) || invoice.clientID || '',
      violation_date: (s?.violation_date as string) || null,
      hearing_date: (s?.hearing_date as string) || null,
      hearing_result: (s?.hearing_result as string) || null,
      status: (s?.status as string) || '',
      // Saved invoice fine wins over the live balance (see file header).
      amount_due: j.amount_due ?? (s?.amount_due as number | null) ?? null,
      legal_fee: j.legal_fee,
      addedAt: invoice.invoice_date,
      highlighted: !!j.highlighted,
    };
  });
  items.sort(compareByHearingDateAsc);

  const recipient: InvoiceRecipient = {
    companyName: invoice.recipient_company || '',
    attention: invoice.recipient_attention || '',
    address: invoice.recipient_address || '',
    cityStateZip: '', // Not stored on the Invoice record.
    email: invoice.recipient_email || '',
  };

  const extras = parseJsonField<InvoiceExtraLineItem[]>(
    invoice.extra_line_items,
    [],
    (v) => Array.isArray(v),
  );

  const highlightedSections = parseJsonField<HighlightedSections>(
    invoice.highlighted_sections,
    {},
    (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  );

  // Legacy invoices predate the persisted footer fields — fall back to the
  // hardcoded defaults so they regenerate identically to the original output.
  const options: InvoiceOptions = {
    invoiceDate: invoice.invoice_date,
    paymentInstructions: invoice.payment_instructions ?? FOOTER_TEXT.payment,
    reviewText: invoice.review_text ?? FOOTER_TEXT.review,
    additionalNotes: invoice.additional_notes ?? '',
    showOverdue: invoice.show_overdue ?? true,
    overdueText: invoice.overdue_text ?? FOOTER_TEXT.overdue,
    customMiddleText: invoice.custom_middle_text ?? '',
    highlightedSections,
  };

  return { items, recipient, options, extras };
};
