/**
 * getAmountReceived / hasRecordedAmountPaid
 *
 * The firm is only ever paid the LEGAL FEES on an invoice — the fines are paid by the
 * client directly to the court. These tests pin the read-time rule that every surface
 * (detail modal, list, CSV export, summary cards) uses to report what was collected.
 */

import { describe, it, expect } from 'vitest';
import { getAmountReceived, hasRecordedAmountPaid } from '../src/utils/invoiceTrackerHelpers';
import type { Invoice } from '../src/types/invoiceTracker';

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  invoice_number: 'INV-Test-2026-02-01',
  invoice_date: '2026-02-01T00:00:00.000Z',
  recipient_company: 'Test Corp',
  total_legal_fees: 250,
  total_fines_due: 800,
  item_count: 1,
  payment_status: 'paid',
  alert_deadline: '2026-02-08T00:00:00.000Z',
  ...overrides,
});

describe('getAmountReceived', () => {
  it('returns 0 for an unpaid invoice, even if an amount is somehow recorded', () => {
    expect(getAmountReceived(makeInvoice({ payment_status: 'unpaid', amount_paid: 500 }))).toBe(0);
  });

  it('returns the recorded amount for a paid invoice', () => {
    expect(getAmountReceived(makeInvoice({ total_legal_fees: 300, amount_paid: 250 }))).toBe(250);
  });

  it('honors a recorded 0 instead of falling back to legal fees', () => {
    // The `||` bug guard: 0 is a real recorded value (written-off / $0 collection).
    expect(getAmountReceived(makeInvoice({ amount_paid: 0 }))).toBe(0);
  });

  it('falls back to legal fees — never the billed total — on a legacy paid invoice', () => {
    // 250 legal fees + 800 fines: the answer is 250, never 1050.
    expect(getAmountReceived(makeInvoice({ amount_paid: null }))).toBe(250);
    expect(getAmountReceived(makeInvoice({ amount_paid: undefined }))).toBe(250);
    expect(getAmountReceived(makeInvoice())).toBe(250);
  });

  it('falls back to legal fees when the recorded value is not a finite number', () => {
    expect(getAmountReceived(makeInvoice({ amount_paid: NaN }))).toBe(250);
    expect(getAmountReceived(makeInvoice({ amount_paid: Infinity }))).toBe(250);
  });

  it('handles an overpayment or a partial payment as recorded', () => {
    expect(getAmountReceived(makeInvoice({ amount_paid: 125.5 }))).toBe(125.5);
    expect(getAmountReceived(makeInvoice({ amount_paid: 400 }))).toBe(400);
  });
});

describe('hasRecordedAmountPaid', () => {
  it('is true only when a finite number is stored', () => {
    expect(hasRecordedAmountPaid({ amount_paid: 250 })).toBe(true);
    expect(hasRecordedAmountPaid({ amount_paid: 0 })).toBe(true);
    expect(hasRecordedAmountPaid({ amount_paid: null })).toBe(false);
    expect(hasRecordedAmountPaid({ amount_paid: undefined })).toBe(false);
    expect(hasRecordedAmountPaid({})).toBe(false);
    expect(hasRecordedAmountPaid({ amount_paid: NaN })).toBe(false);
  });
});
