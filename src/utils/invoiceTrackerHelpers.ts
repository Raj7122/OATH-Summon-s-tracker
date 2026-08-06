/**
 * Invoice Tracker Helper Functions
 * Pure utility functions for invoice business logic
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import isoWeek from 'dayjs/plugin/isoWeek';
import { Invoice, InvoicePeriodSummary, SentToClientAttribution } from '../types/invoiceTracker';
import { DEFAULT_ALERT_DAYS, DUE_SOON_THRESHOLD_DAYS, INVOICE_STATUS } from '../constants/invoiceTrackerDefaults';

dayjs.extend(utc);
dayjs.extend(isoWeek);

/**
 * Compute the alert deadline date for an invoice.
 * @param invoiceDate ISO date string for the invoice creation date
 * @param daysOffset Number of days after invoice date (default: 7)
 * @returns ISO date string for the alert deadline
 */
export function computeAlertDeadline(invoiceDate: string, daysOffset: number = DEFAULT_ALERT_DAYS): string {
  return dayjs.utc(invoiceDate).add(daysOffset, 'day').toISOString();
}

/**
 * Check if an invoice is overdue (past alert deadline AND unpaid).
 */
export function isOverdue(invoice: { alert_deadline: string; payment_status: string }): boolean {
  return (
    invoice.payment_status === INVOICE_STATUS.UNPAID &&
    dayjs.utc().isAfter(dayjs.utc(invoice.alert_deadline))
  );
}

/**
 * Check if an invoice is due soon (within threshold days of deadline AND unpaid AND not yet overdue).
 * @param threshold Number of days before deadline to consider "due soon" (default: 3)
 */
export function isDueSoon(
  invoice: { alert_deadline: string; payment_status: string },
  threshold: number = DUE_SOON_THRESHOLD_DAYS
): boolean {
  if (invoice.payment_status !== INVOICE_STATUS.UNPAID) return false;
  const now = dayjs.utc();
  const deadline = dayjs.utc(invoice.alert_deadline);
  // Not overdue yet, but within threshold days
  return now.isBefore(deadline) && deadline.diff(now, 'day') <= threshold;
}

/**
 * Get the horizon color category for an invoice.
 */
export function getInvoiceHorizonColor(
  invoice: { alert_deadline: string; payment_status: string }
): 'overdue' | 'dueSoon' | 'paid' | 'normal' {
  if (invoice.payment_status === INVOICE_STATUS.PAID) return 'paid';
  if (isOverdue(invoice)) return 'overdue';
  if (isDueSoon(invoice)) return 'dueSoon';
  return 'normal';
}

/**
 * Group invoices by ISO week. Returns a Map keyed by "YYYY-WNN" labels.
 */
export function groupInvoicesByWeek(invoices: Invoice[]): Map<string, Invoice[]> {
  const groups = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const d = dayjs.utc(inv.invoice_date);
    const key = `${d.isoWeekYear()}-W${String(d.isoWeek()).padStart(2, '0')}`;
    const arr = groups.get(key) || [];
    arr.push(inv);
    groups.set(key, arr);
  }
  return groups;
}

/**
 * Group invoices by month. Returns a Map keyed by "YYYY-MM" labels.
 */
export function groupInvoicesByMonth(invoices: Invoice[]): Map<string, Invoice[]> {
  const groups = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const d = dayjs.utc(inv.invoice_date);
    const key = d.format('YYYY-MM');
    const arr = groups.get(key) || [];
    arr.push(inv);
    groups.set(key, arr);
  }
  return groups;
}

/**
 * Generate a human-readable invoice number.
 * Format: INV-{Company}-{YYYY-MM-DD} (company truncated to 20 chars, spaces replaced with underscores)
 */
export function generateInvoiceNumber(company: string, date: string): string {
  const sanitized = company
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 20);
  const dateStr = dayjs.utc(date).format('YYYY-MM-DD');
  return `INV-${sanitized}-${dateStr}`;
}

/**
 * The amount the firm actually received for an invoice.
 *
 * - Unpaid invoice -> 0.
 * - Paid with a recorded amount -> that amount. A recorded 0 is a real value (a written-off or
 *   $0 collection), so the check is an explicit finite-number test, never `||`.
 * - Paid with no recorded amount (legacy rows created before amount_paid existed) -> total_legal_fees.
 *   The firm only ever collects legal fees; the fines on an invoice are paid by the client directly
 *   to the court, so falling back to the billed grand total would overstate revenue. This is a
 *   read-time rule only — no stored data is backfilled.
 */
export function getAmountReceived(
  invoice: Pick<Invoice, 'payment_status' | 'total_legal_fees'> & { amount_paid?: number | null }
): number {
  if (invoice.payment_status !== INVOICE_STATUS.PAID) return 0;
  const recorded = invoice.amount_paid;
  if (typeof recorded === 'number' && Number.isFinite(recorded)) return recorded;
  return invoice.total_legal_fees ?? 0;
}

/** True when the invoice carries an explicitly recorded receipt (vs. the legacy legal-fees fallback). */
export function hasRecordedAmountPaid(invoice: { amount_paid?: number | null }): boolean {
  return typeof invoice.amount_paid === 'number' && Number.isFinite(invoice.amount_paid);
}

/**
 * Summarize a group of invoices for a given period.
 */
export function summarizeInvoicePeriod(periodLabel: string, periodStart: string, invoices: Invoice[]): InvoicePeriodSummary {
  let unpaidCount = 0;
  let overdueCount = 0;
  let paidCount = 0;
  let totalAmountOutstanding = 0;
  let totalAmountCollected = 0;

  for (const inv of invoices) {
    if (inv.payment_status === INVOICE_STATUS.PAID) {
      paidCount++;
      // Cash received, not the billed total — fines go to the court, not to the firm.
      totalAmountCollected += getAmountReceived(inv);
    } else {
      unpaidCount++;
      totalAmountOutstanding += inv.total_legal_fees + inv.total_fines_due;
      if (isOverdue(inv)) {
        overdueCount++;
      }
    }
  }

  return {
    periodLabel,
    periodStart,
    totalInvoices: invoices.length,
    unpaidCount,
    overdueCount,
    paidCount,
    totalAmountOutstanding,
    totalAmountCollected,
  };
}

/**
 * Safely parse the AWSJSON sent_to_client_attr field.
 * Returns the attribution only when it represents an active "sent" stamp,
 * otherwise null (covers unset, cleared, and malformed values).
 */
export function parseSentToClient(raw?: string | null): SentToClientAttribution | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as SentToClientAttribution;
    return value?.sent ? value : null;
  } catch {
    return null;
  }
}
