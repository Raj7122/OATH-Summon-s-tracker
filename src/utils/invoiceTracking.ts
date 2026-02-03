/**
 * Invoice Tracking Utility
 *
 * Provides localStorage-based tracking for invoiced summonses.
 * This is a workaround until the backend schema with is_invoiced/invoice_date
 * fields is deployed. Once deployed, the DB-based tracking will take precedence.
 *
 * @module utils/invoiceTracking
 */

// localStorage key for invoiced summons records
const STORAGE_KEY = 'oath-invoiced-summons';

/**
 * Represents a record of an invoiced summons
 */
interface InvoicedRecord {
  summonsId: string;
  invoiceDate: string; // ISO 8601 format
}

/**
 * Get all invoiced records from localStorage
 *
 * @returns Array of invoiced records, empty array if none or on error
 */
export function getInvoicedRecords(): InvoicedRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    console.error('Failed to read invoiced records from localStorage');
    return [];
  }
}

/**
 * Check if a summons is invoiced (in localStorage)
 *
 * @param summonsId - The ID of the summons to check
 * @returns true if the summons is marked as invoiced in localStorage
 */
export function isInvoiced(summonsId: string): boolean {
  const records = getInvoicedRecords();
  return records.some(r => r.summonsId === summonsId);
}

/**
 * Get the invoice date for a summons (from localStorage)
 *
 * @param summonsId - The ID of the summons to check
 * @returns The invoice date as ISO string, or null if not invoiced
 */
export function getInvoiceDate(summonsId: string): string | null {
  const records = getInvoicedRecords();
  const record = records.find(r => r.summonsId === summonsId);
  return record?.invoiceDate ?? null;
}

/**
 * Mark summonses as invoiced in localStorage
 *
 * @param summonsIds - Array of summons IDs to mark as invoiced
 */
export function markAsInvoiced(summonsIds: string[]): void {
  try {
    const records = getInvoicedRecords();
    const invoiceDate = new Date().toISOString();

    // Only add records that don't already exist
    summonsIds.forEach(id => {
      if (!records.some(r => r.summonsId === id)) {
        records.push({ summonsId: id, invoiceDate });
      }
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.error('Failed to save invoiced records to localStorage:', error);
  }
}
