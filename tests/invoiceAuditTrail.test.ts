/**
 * @vitest-environment node
 *
 * Invoice Audit Trail Tests
 * 100% coverage of src/utils/invoiceAuditLog.ts
 *
 * Tests:
 * - parseActivityLog: handles null, undefined, empty string, valid JSON string,
 *   invalid JSON string, array, non-array JSON, and other types
 * - buildInvoiceAuditEntries: produces correct INVOICE_CREATED and INVOICE_DUE entries
 * - appendInvoiceAuditEntries: parses existing log, appends entries, caps at 100, returns JSON string
 * - formatDeadline: formats valid ISO dates, handles invalid dates, handles non-date strings
 */

import { describe, it, expect } from 'vitest';
import {
  parseActivityLog,
  buildInvoiceAuditEntries,
  appendInvoiceAuditEntries,
  formatDeadline,
} from '../src/utils/invoiceAuditLog';
import { ActivityLogEntry } from '../src/types/summons';

// ---------------------------------------------------------------------------
// parseActivityLog
// ---------------------------------------------------------------------------
describe('parseActivityLog', () => {
  it('returns empty array for null', () => {
    expect(parseActivityLog(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseActivityLog(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseActivityLog('')).toEqual([]);
  });

  it('parses a valid JSON string containing an array', () => {
    const entry: ActivityLogEntry = {
      date: '2026-01-01T00:00:00.000Z',
      type: 'CREATED',
      description: 'Test',
      old_value: null,
      new_value: 'NEW',
    };
    const json = JSON.stringify([entry]);
    expect(parseActivityLog(json)).toEqual([entry]);
  });

  it('returns empty array for invalid JSON string', () => {
    expect(parseActivityLog('not json {')).toEqual([]);
  });

  it('returns empty array for JSON string that is not an array', () => {
    expect(parseActivityLog(JSON.stringify({ key: 'value' }))).toEqual([]);
  });

  it('returns the array directly when given an array', () => {
    const entries: ActivityLogEntry[] = [
      { date: '2026-01-01T00:00:00.000Z', type: 'CREATED', description: 'Test', old_value: null, new_value: 'x' },
    ];
    expect(parseActivityLog(entries)).toBe(entries);
  });

  it('returns empty array for non-string, non-array types (number)', () => {
    expect(parseActivityLog(42)).toEqual([]);
  });

  it('returns empty array for non-string, non-array types (object)', () => {
    expect(parseActivityLog({ key: 'val' })).toEqual([]);
  });

  it('returns empty array for boolean false', () => {
    expect(parseActivityLog(false)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// formatDeadline
// ---------------------------------------------------------------------------
describe('formatDeadline', () => {
  it('formats a valid ISO date string', () => {
    const result = formatDeadline('2026-04-15T00:00:00.000Z');
    expect(result).toBe('Apr 15, 2026');
  });

  it('formats another date correctly', () => {
    const result = formatDeadline('2026-12-25T00:00:00.000Z');
    expect(result).toBe('Dec 25, 2026');
  });

  it('returns the original string for an invalid date', () => {
    expect(formatDeadline('not-a-date')).toBe('not-a-date');
  });

  it('returns the original string for empty string', () => {
    expect(formatDeadline('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// buildInvoiceAuditEntries
// ---------------------------------------------------------------------------
describe('buildInvoiceAuditEntries', () => {
  const invoiceNumber = 'INV-TEST-20260401';
  const recipientCompany = 'Acme Corp';
  const invoiceDate = '2026-04-01T12:00:00.000Z';
  const alertDeadline = '2026-04-15T00:00:00.000Z';

  it('returns exactly two entries', () => {
    const entries = buildInvoiceAuditEntries(invoiceNumber, recipientCompany, invoiceDate, alertDeadline);
    expect(entries).toHaveLength(2);
  });

  it('first entry is INVOICE_CREATED with correct fields', () => {
    const entries = buildInvoiceAuditEntries(invoiceNumber, recipientCompany, invoiceDate, alertDeadline);
    expect(entries[0]).toEqual({
      date: invoiceDate,
      type: 'INVOICE_CREATED',
      description: `Added to invoice #${invoiceNumber} for ${recipientCompany}`,
      old_value: null,
      new_value: invoiceNumber,
    });
  });

  it('second entry is INVOICE_DUE with correct fields', () => {
    const entries = buildInvoiceAuditEntries(invoiceNumber, recipientCompany, invoiceDate, alertDeadline);
    expect(entries[1]).toEqual({
      date: invoiceDate,
      type: 'INVOICE_DUE',
      description: `Invoice #${invoiceNumber} due by Apr 15, 2026`,
      old_value: null,
      new_value: alertDeadline,
    });
  });

  it('uses raw deadline string when it cannot be formatted', () => {
    const entries = buildInvoiceAuditEntries(invoiceNumber, recipientCompany, invoiceDate, 'bad-date');
    expect(entries[1].description).toContain('due by bad-date');
    expect(entries[1].new_value).toBe('bad-date');
  });
});

// ---------------------------------------------------------------------------
// appendInvoiceAuditEntries
// ---------------------------------------------------------------------------
describe('appendInvoiceAuditEntries', () => {
  const invoiceNumber = 'INV-ACME-20260401';
  const recipientCompany = 'Acme Corp';
  const invoiceDate = '2026-04-01T12:00:00.000Z';
  const alertDeadline = '2026-04-15T00:00:00.000Z';

  it('returns a valid JSON string', () => {
    const result = appendInvoiceAuditEntries(null, invoiceNumber, recipientCompany, invoiceDate, alertDeadline);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('creates two entries when existing log is null', () => {
    const result = JSON.parse(
      appendInvoiceAuditEntries(null, invoiceNumber, recipientCompany, invoiceDate, alertDeadline)
    );
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('INVOICE_CREATED');
    expect(result[1].type).toBe('INVOICE_DUE');
  });

  it('preserves existing entries when appending', () => {
    const existing: ActivityLogEntry[] = [
      { date: '2026-03-01T00:00:00.000Z', type: 'CREATED', description: 'Summons created', old_value: null, new_value: 'PENDING' },
      { date: '2026-03-15T00:00:00.000Z', type: 'STATUS_CHANGE', description: 'Status changed', old_value: 'PENDING', new_value: 'DEFAULT' },
    ];
    const result = JSON.parse(
      appendInvoiceAuditEntries(existing, invoiceNumber, recipientCompany, invoiceDate, alertDeadline)
    );
    expect(result).toHaveLength(4);
    expect(result[0].type).toBe('CREATED');
    expect(result[1].type).toBe('STATUS_CHANGE');
    expect(result[2].type).toBe('INVOICE_CREATED');
    expect(result[3].type).toBe('INVOICE_DUE');
  });

  it('handles JSON-string existing log', () => {
    const existing: ActivityLogEntry[] = [
      { date: '2026-01-01T00:00:00.000Z', type: 'CREATED', description: 'Test', old_value: null, new_value: 'x' },
    ];
    const result = JSON.parse(
      appendInvoiceAuditEntries(JSON.stringify(existing), invoiceNumber, recipientCompany, invoiceDate, alertDeadline)
    );
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('CREATED');
    expect(result[1].type).toBe('INVOICE_CREATED');
  });

  it('caps total entries at 100 (oldest trimmed)', () => {
    // Create 99 existing entries
    const existing: ActivityLogEntry[] = Array.from({ length: 99 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      type: 'CREATED' as const,
      description: `Entry ${i}`,
      old_value: null,
      new_value: `val-${i}`,
    }));
    const result = JSON.parse(
      appendInvoiceAuditEntries(existing, invoiceNumber, recipientCompany, invoiceDate, alertDeadline)
    );
    // 99 + 2 = 101, capped to 100
    expect(result).toHaveLength(100);
    // First entry should be the second original (index 1), since index 0 was trimmed
    expect(result[0].description).toBe('Entry 1');
    // Last two entries should be the invoice audit entries
    expect(result[98].type).toBe('INVOICE_CREATED');
    expect(result[99].type).toBe('INVOICE_DUE');
  });

  it('handles empty string existing log', () => {
    const result = JSON.parse(
      appendInvoiceAuditEntries('', invoiceNumber, recipientCompany, invoiceDate, alertDeadline)
    );
    expect(result).toHaveLength(2);
  });

  it('handles invalid JSON string gracefully', () => {
    const result = JSON.parse(
      appendInvoiceAuditEntries('bad json', invoiceNumber, recipientCompany, invoiceDate, alertDeadline)
    );
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('INVOICE_CREATED');
  });

  it('includes correct invoice number and recipient in entries', () => {
    const result = JSON.parse(
      appendInvoiceAuditEntries(null, 'INV-XYZ-001', 'Test Co', invoiceDate, alertDeadline)
    );
    expect(result[0].description).toBe('Added to invoice #INV-XYZ-001 for Test Co');
    expect(result[0].new_value).toBe('INV-XYZ-001');
  });

  it('includes correct deadline in INVOICE_DUE entry', () => {
    const result = JSON.parse(
      appendInvoiceAuditEntries(null, invoiceNumber, recipientCompany, invoiceDate, '2026-06-30T00:00:00.000Z')
    );
    expect(result[1].description).toContain('due by Jun 30, 2026');
    expect(result[1].new_value).toBe('2026-06-30T00:00:00.000Z');
  });
});
