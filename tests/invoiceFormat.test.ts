/**
 * Unit tests for invoice file-format helpers.
 *
 * The Tracker infers an invoice's file type purely from its S3 key extension,
 * so these helpers are the single source of truth for "is this a Word / Excel /
 * PDF invoice". They drive the format-aware icons/labels in the viewers.
 */

import { describe, it, expect } from 'vitest';
import { formatFromKey, formatLabel, formatMime, InvoiceFormat } from '../src/utils/invoiceFormat';

describe('formatFromKey', () => {
  it('detects docx from a .docx key', () => {
    expect(formatFromKey('public/invoices/inv-1/Invoice-AAA-2026-07-06.docx')).toBe('docx');
  });

  it('detects xlsx from a .xlsx key', () => {
    expect(formatFromKey('public/invoices/inv-1/Invoice-AAA-2026-07-06.xlsx')).toBe('xlsx');
  });

  it('detects pdf from a .pdf key', () => {
    expect(formatFromKey('public/invoices/inv-1/Invoice-AAA-2026-07-06.pdf')).toBe('pdf');
  });

  it('is case-insensitive on the extension', () => {
    expect(formatFromKey('.../INVOICE.DOCX')).toBe('docx');
    expect(formatFromKey('.../Invoice.Xlsx')).toBe('xlsx');
  });

  it('defaults to pdf for a null / undefined / empty key (legacy records)', () => {
    expect(formatFromKey(null)).toBe('pdf');
    expect(formatFromKey(undefined)).toBe('pdf');
    expect(formatFromKey('')).toBe('pdf');
  });

  it('defaults to pdf for an unrecognized extension', () => {
    expect(formatFromKey('.../invoice.txt')).toBe('pdf');
    expect(formatFromKey('.../invoice')).toBe('pdf');
  });

  it('does not misfire when "docx"/"xlsx" appears mid-key but not as the extension', () => {
    // Only the trailing extension decides the format.
    expect(formatFromKey('public/docx-archive/inv.pdf')).toBe('pdf');
  });
});

describe('formatLabel', () => {
  it('maps each format to a human label', () => {
    expect(formatLabel('docx')).toBe('Word');
    expect(formatLabel('xlsx')).toBe('Excel');
    expect(formatLabel('pdf')).toBe('PDF');
  });
});

describe('formatMime', () => {
  const cases: [InvoiceFormat, string][] = [
    ['pdf', 'application/pdf'],
    ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ];
  it.each(cases)('maps %s to the correct MIME type', (format, mime) => {
    expect(formatMime(format)).toBe(mime);
  });
});
