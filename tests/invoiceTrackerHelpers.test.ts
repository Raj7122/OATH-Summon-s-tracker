/**
 * @vitest-environment node
 *
 * Invoice Tracker Helper Tests
 * 100% coverage for all pure utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeAlertDeadline,
  isOverdue,
  isDueSoon,
  getInvoiceHorizonColor,
  groupInvoicesByWeek,
  groupInvoicesByMonth,
  generateInvoiceNumber,
  summarizeInvoicePeriod,
} from '../src/utils/invoiceTrackerHelpers';
import { Invoice } from '../src/types/invoiceTracker';

// ---------------------------------------------------------------------------
// Helpers to create test invoices
// ---------------------------------------------------------------------------

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    invoice_number: 'INV-Test-2026-01-15',
    invoice_date: '2026-01-15T00:00:00.000Z',
    recipient_company: 'Test Corp',
    total_legal_fees: 250,
    total_fines_due: 500,
    item_count: 1,
    payment_status: 'unpaid',
    alert_deadline: '2026-01-22T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeAlertDeadline
// ---------------------------------------------------------------------------

describe('computeAlertDeadline', () => {
  it('should default to 7 days after invoice date', () => {
    const result = computeAlertDeadline('2026-03-01T00:00:00.000Z');
    expect(result).toBe('2026-03-08T00:00:00.000Z');
  });

  it('should accept a custom days offset', () => {
    const result = computeAlertDeadline('2026-03-01T00:00:00.000Z', 14);
    expect(result).toBe('2026-03-15T00:00:00.000Z');
  });

  it('should handle month boundaries', () => {
    const result = computeAlertDeadline('2026-01-28T00:00:00.000Z', 7);
    expect(result).toBe('2026-02-04T00:00:00.000Z');
  });

  it('should handle year boundaries', () => {
    const result = computeAlertDeadline('2025-12-28T00:00:00.000Z', 7);
    expect(result).toBe('2026-01-04T00:00:00.000Z');
  });

  it('should handle leap year (Feb 29)', () => {
    // 2028 is a leap year
    const result = computeAlertDeadline('2028-02-25T00:00:00.000Z', 7);
    expect(result).toBe('2028-03-03T00:00:00.000Z');
  });

  it('should handle 0 days offset', () => {
    const result = computeAlertDeadline('2026-06-15T00:00:00.000Z', 0);
    expect(result).toBe('2026-06-15T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// isOverdue
// ---------------------------------------------------------------------------

describe('isOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return true when past deadline and unpaid', () => {
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const invoice = { alert_deadline: '2026-01-22T00:00:00.000Z', payment_status: 'unpaid' };
    expect(isOverdue(invoice)).toBe(true);
  });

  it('should return false when past deadline but paid', () => {
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const invoice = { alert_deadline: '2026-01-22T00:00:00.000Z', payment_status: 'paid' };
    expect(isOverdue(invoice)).toBe(false);
  });

  it('should return false when before deadline and unpaid', () => {
    vi.setSystemTime(new Date('2026-01-20T00:00:00.000Z'));
    const invoice = { alert_deadline: '2026-01-22T00:00:00.000Z', payment_status: 'unpaid' };
    expect(isOverdue(invoice)).toBe(false);
  });

  it('should return false when exactly on the deadline (not past)', () => {
    vi.setSystemTime(new Date('2026-01-22T00:00:00.000Z'));
    const invoice = { alert_deadline: '2026-01-22T00:00:00.000Z', payment_status: 'unpaid' };
    // dayjs.isAfter is strict: same moment is NOT after
    expect(isOverdue(invoice)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isDueSoon
// ---------------------------------------------------------------------------

describe('isDueSoon', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return true when within default threshold (3 days) and unpaid', () => {
    vi.setSystemTime(new Date('2026-01-20T00:00:00.000Z'));
    const invoice = { alert_deadline: '2026-01-22T00:00:00.000Z', payment_status: 'unpaid' };
    expect(isDueSoon(invoice)).toBe(true);
  });

  it('should return true when exactly on threshold boundary', () => {
    vi.setSystemTime(new Date('2026-01-19T00:00:00.000Z'));
    const invoice = { alert_deadline: '2026-01-22T00:00:00.000Z', payment_status: 'unpaid' };
    expect(isDueSoon(invoice)).toBe(true); // 3 days = threshold
  });

  it('should return false when beyond threshold', () => {
    vi.setSystemTime(new Date('2026-01-10T00:00:00.000Z'));
    const invoice = { alert_deadline: '2026-01-22T00:00:00.000Z', payment_status: 'unpaid' };
    expect(isDueSoon(invoice)).toBe(false);
  });

  it('should return false when already overdue', () => {
    vi.setSystemTime(new Date('2026-01-25T00:00:00.000Z'));
    const invoice = { alert_deadline: '2026-01-22T00:00:00.000Z', payment_status: 'unpaid' };
    expect(isDueSoon(invoice)).toBe(false);
  });

  it('should return false when paid', () => {
    vi.setSystemTime(new Date('2026-01-20T00:00:00.000Z'));
    const invoice = { alert_deadline: '2026-01-22T00:00:00.000Z', payment_status: 'paid' };
    expect(isDueSoon(invoice)).toBe(false);
  });

  it('should accept a custom threshold', () => {
    vi.setSystemTime(new Date('2026-01-15T00:00:00.000Z'));
    const invoice = { alert_deadline: '2026-01-22T00:00:00.000Z', payment_status: 'unpaid' };
    expect(isDueSoon(invoice, 7)).toBe(true);
    expect(isDueSoon(invoice, 3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getInvoiceHorizonColor
// ---------------------------------------------------------------------------

describe('getInvoiceHorizonColor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "paid" for paid invoices regardless of deadline', () => {
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const invoice = { alert_deadline: '2026-01-10T00:00:00.000Z', payment_status: 'paid' };
    expect(getInvoiceHorizonColor(invoice)).toBe('paid');
  });

  it('should return "overdue" for unpaid past deadline', () => {
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const invoice = { alert_deadline: '2026-01-22T00:00:00.000Z', payment_status: 'unpaid' };
    expect(getInvoiceHorizonColor(invoice)).toBe('overdue');
  });

  it('should return "dueSoon" when within threshold', () => {
    vi.setSystemTime(new Date('2026-01-20T00:00:00.000Z'));
    const invoice = { alert_deadline: '2026-01-22T00:00:00.000Z', payment_status: 'unpaid' };
    expect(getInvoiceHorizonColor(invoice)).toBe('dueSoon');
  });

  it('should return "normal" for unpaid well before deadline', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const invoice = { alert_deadline: '2026-01-22T00:00:00.000Z', payment_status: 'unpaid' };
    expect(getInvoiceHorizonColor(invoice)).toBe('normal');
  });
});

// ---------------------------------------------------------------------------
// groupInvoicesByWeek
// ---------------------------------------------------------------------------

describe('groupInvoicesByWeek', () => {
  it('should group invoices by ISO week', () => {
    const invoices = [
      makeInvoice({ id: '1', invoice_date: '2026-01-05T00:00:00.000Z' }), // Week 2
      makeInvoice({ id: '2', invoice_date: '2026-01-06T00:00:00.000Z' }), // Week 2
      makeInvoice({ id: '3', invoice_date: '2026-01-12T00:00:00.000Z' }), // Week 3
    ];
    const result = groupInvoicesByWeek(invoices);
    expect(result.size).toBe(2);
    expect(result.get('2026-W02')?.length).toBe(2);
    expect(result.get('2026-W03')?.length).toBe(1);
  });

  it('should return empty map for empty input', () => {
    const result = groupInvoicesByWeek([]);
    expect(result.size).toBe(0);
  });

  it('should handle year boundary weeks', () => {
    const invoices = [
      makeInvoice({ id: '1', invoice_date: '2025-12-29T00:00:00.000Z' }), // ISO week 1 of 2026
    ];
    const result = groupInvoicesByWeek(invoices);
    expect(result.size).toBe(1);
    // Dec 29, 2025 is Mon of ISO week 1 of 2026
    expect(result.has('2026-W01')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// groupInvoicesByMonth
// ---------------------------------------------------------------------------

describe('groupInvoicesByMonth', () => {
  it('should group invoices by month', () => {
    const invoices = [
      makeInvoice({ id: '1', invoice_date: '2026-01-05T00:00:00.000Z' }),
      makeInvoice({ id: '2', invoice_date: '2026-01-20T00:00:00.000Z' }),
      makeInvoice({ id: '3', invoice_date: '2026-02-10T00:00:00.000Z' }),
    ];
    const result = groupInvoicesByMonth(invoices);
    expect(result.size).toBe(2);
    expect(result.get('2026-01')?.length).toBe(2);
    expect(result.get('2026-02')?.length).toBe(1);
  });

  it('should return empty map for empty input', () => {
    const result = groupInvoicesByMonth([]);
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateInvoiceNumber
// ---------------------------------------------------------------------------

describe('generateInvoiceNumber', () => {
  it('should generate correct format', () => {
    const result = generateInvoiceNumber('Test Corp', '2026-01-15T00:00:00.000Z');
    expect(result).toBe('INV-Test_Corp-2026-01-15');
  });

  it('should strip special characters', () => {
    const result = generateInvoiceNumber('G.C. Warehouse, LLC', '2026-03-01T00:00:00.000Z');
    expect(result).toBe('INV-GC_Warehouse_LLC-2026-03-01');
  });

  it('should truncate long company names to 20 characters', () => {
    const result = generateInvoiceNumber('Very Long Company Name That Exceeds Limit', '2026-06-01T00:00:00.000Z');
    const parts = result.split('-');
    // Company part (between first INV- and the date) should be ≤20 chars
    const companyPart = parts.slice(1, parts.length - 3).join('-');
    expect(companyPart.length).toBeLessThanOrEqual(20);
  });

  it('should handle company names with only special characters', () => {
    const result = generateInvoiceNumber('...', '2026-01-01T00:00:00.000Z');
    expect(result).toBe('INV--2026-01-01');
  });

  it('should collapse multiple spaces', () => {
    const result = generateInvoiceNumber('Test   Corp', '2026-01-01T00:00:00.000Z');
    expect(result).toBe('INV-Test_Corp-2026-01-01');
  });
});

// ---------------------------------------------------------------------------
// summarizeInvoicePeriod
// ---------------------------------------------------------------------------

describe('summarizeInvoicePeriod', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should correctly summarize a mix of paid and unpaid invoices', () => {
    const invoices = [
      makeInvoice({ id: '1', payment_status: 'paid', total_legal_fees: 250, total_fines_due: 500 }),
      makeInvoice({ id: '2', payment_status: 'unpaid', alert_deadline: '2026-01-20T00:00:00.000Z', total_legal_fees: 250, total_fines_due: 300 }),
      makeInvoice({ id: '3', payment_status: 'unpaid', alert_deadline: '2026-03-01T00:00:00.000Z', total_legal_fees: 100, total_fines_due: 200 }),
    ];

    const result = summarizeInvoicePeriod('2026-W03', '2026-01-12T00:00:00.000Z', invoices);

    expect(result.periodLabel).toBe('2026-W03');
    expect(result.totalInvoices).toBe(3);
    expect(result.paidCount).toBe(1);
    expect(result.unpaidCount).toBe(2);
    expect(result.overdueCount).toBe(1); // invoice 2 is past deadline
    expect(result.totalAmountPaid).toBe(750); // 250 + 500
    expect(result.totalAmountOutstanding).toBe(850); // (250+300) + (100+200)
  });

  it('should handle all paid invoices', () => {
    const invoices = [
      makeInvoice({ id: '1', payment_status: 'paid', total_legal_fees: 100, total_fines_due: 200 }),
    ];

    const result = summarizeInvoicePeriod('2026-01', '2026-01-01T00:00:00.000Z', invoices);

    expect(result.paidCount).toBe(1);
    expect(result.unpaidCount).toBe(0);
    expect(result.overdueCount).toBe(0);
    expect(result.totalAmountOutstanding).toBe(0);
    expect(result.totalAmountPaid).toBe(300);
  });

  it('should handle empty invoices', () => {
    const result = summarizeInvoicePeriod('2026-W01', '2026-01-01T00:00:00.000Z', []);

    expect(result.totalInvoices).toBe(0);
    expect(result.paidCount).toBe(0);
    expect(result.unpaidCount).toBe(0);
    expect(result.overdueCount).toBe(0);
    expect(result.totalAmountOutstanding).toBe(0);
    expect(result.totalAmountPaid).toBe(0);
  });
});
