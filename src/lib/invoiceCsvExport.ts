/**
 * Invoice CSV Export
 *
 * Serializes a list of Invoice records to CSV for the Invoice Tracker page.
 * Exports exactly the rows passed in (the caller scopes them to the active filter).
 *
 * @module lib/invoiceCsvExport
 */

import { Invoice } from '../types/invoiceTracker';
import { getInvoiceHorizonColor } from '../utils/invoiceTrackerHelpers';
import { escapeCSVValue, formatDate } from './csvExport';

/** Human-readable status label matching the on-screen status chip. */
function statusLabel(invoice: Invoice): string {
  switch (getInvoiceHorizonColor(invoice)) {
    case 'overdue':
      return 'Overdue';
    case 'dueSoon':
      return 'Due Soon';
    case 'paid':
      return 'Paid';
    default:
      return 'Unpaid';
  }
}

/** Format a number as a plain decimal string (no $ — keeps the column Excel-math-safe). */
function amount(value: number): string {
  return value.toFixed(2);
}

const HEADERS = [
  'Invoice #',
  'Invoice Date',
  'Recipient',
  'Attention',
  'Items',
  'Legal Fees',
  'Fines Due',
  'Total',
  'Status',
  'Deadline',
  'Payment Date',
];

/**
 * Generate CSV content from a list of invoices.
 * Returns just the header row when the list is empty.
 */
export function generateInvoiceCSV(invoices: Invoice[]): string {
  const headerRow = HEADERS.map(escapeCSVValue).join(',');

  const dataRows = invoices.map((inv) => {
    const cells = [
      inv.invoice_number,
      formatDate(inv.invoice_date, 'us'),
      inv.recipient_company,
      inv.recipient_attention ?? '',
      inv.item_count,
      amount(inv.total_legal_fees),
      amount(inv.total_fines_due),
      amount(inv.total_legal_fees + inv.total_fines_due),
      statusLabel(inv),
      formatDate(inv.alert_deadline, 'us'),
      formatDate(inv.payment_date, 'us'),
    ];
    return cells.map(escapeCSVValue).join(',');
  });

  return [headerRow, ...dataRows].join('\n');
}

/**
 * Build a download filename for the export, e.g. "Invoices_Unpaid_2026-05-21.csv".
 */
export function buildInvoiceCsvFilename(tabLabel: string): string {
  const date = new Date().toISOString().split('T')[0];
  return `Invoices_${tabLabel}_${date}.csv`;
}
