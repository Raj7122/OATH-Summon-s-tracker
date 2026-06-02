/**
 * Invoice Audit Log Helpers
 *
 * Builds INVOICE_CREATED and INVOICE_DUE activity log entries for summonses
 * when they are added to an invoice. Handles parsing existing activity_log
 * (string, array, or empty) and caps total entries at MAX_LOG_ENTRIES.
 */

import { ActivityLogEntry } from '../types/summons';

const MAX_LOG_ENTRIES = 100;

/**
 * Parse an existing activity_log value into an array.
 * Handles: null/undefined, JSON string, or already-parsed array.
 */
export function parseActivityLog(raw: unknown): ActivityLogEntry[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Build the two invoice audit entries (INVOICE_CREATED + INVOICE_DUE).
 */
export function buildInvoiceAuditEntries(
  invoiceNumber: string,
  recipientCompany: string,
  invoiceDate: string,
  alertDeadline: string,
): ActivityLogEntry[] {
  // Format deadline for human-readable description
  const deadlineDisplay = formatDeadline(alertDeadline);

  return [
    {
      date: invoiceDate,
      type: 'INVOICE_CREATED',
      description: `Added to invoice #${invoiceNumber} for ${recipientCompany}`,
      old_value: null,
      new_value: invoiceNumber,
    },
    {
      date: invoiceDate,
      type: 'INVOICE_DUE',
      description: `Invoice #${invoiceNumber} due by ${deadlineDisplay}`,
      old_value: null,
      new_value: alertDeadline,
    },
  ];
}

/**
 * Append invoice audit entries to an existing activity log and return
 * the updated log as a JSON string (ready for the updateSummons mutation).
 * Caps at MAX_LOG_ENTRIES to respect DynamoDB 400KB item size limit.
 */
export function appendInvoiceAuditEntries(
  existingLog: unknown,
  invoiceNumber: string,
  recipientCompany: string,
  invoiceDate: string,
  alertDeadline: string,
): string {
  const parsed = parseActivityLog(existingLog);
  const newEntries = buildInvoiceAuditEntries(invoiceNumber, recipientCompany, invoiceDate, alertDeadline);
  const updated = [...parsed, ...newEntries].slice(-MAX_LOG_ENTRIES);
  return JSON.stringify(updated);
}

/**
 * Append an INVOICE_MODIFIED entry to an existing activity log when a summons's
 * invoice line (legal fee or amount due) is edited in place, and return the
 * updated log as a JSON string.
 */
export function appendInvoiceModifiedEntry(
  existingLog: unknown,
  invoiceNumber: string,
  changeSummary: string,
  changedAt: string = new Date().toISOString(),
): string {
  const parsed = parseActivityLog(existingLog);
  const entry: ActivityLogEntry = {
    date: changedAt,
    type: 'INVOICE_MODIFIED',
    description: `Invoice #${invoiceNumber} updated: ${changeSummary}`,
    old_value: null,
    new_value: invoiceNumber,
  };
  const updated = [...parsed, entry].slice(-MAX_LOG_ENTRIES);
  return JSON.stringify(updated);
}

/**
 * Append an INVOICE_REMOVED entry to an existing activity log when a summons is
 * taken off an invoice (during invoice editing), and return the updated log as
 * a JSON string.
 */
export function appendInvoiceRemovedEntry(
  existingLog: unknown,
  invoiceNumber: string,
  removedAt: string = new Date().toISOString(),
): string {
  const parsed = parseActivityLog(existingLog);
  const entry: ActivityLogEntry = {
    date: removedAt,
    type: 'INVOICE_REMOVED',
    description: `Removed from invoice #${invoiceNumber}`,
    old_value: invoiceNumber,
    new_value: null,
  };
  const updated = [...parsed, entry].slice(-MAX_LOG_ENTRIES);
  return JSON.stringify(updated);
}

/**
 * Format an ISO deadline string for display (e.g., "Apr 15, 2026").
 */
export function formatDeadline(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return isoDate;
  }
}
