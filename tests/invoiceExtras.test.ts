import { describe, it, expect } from 'vitest';
import { parseExtraAmount, sumExtrasLegalFees } from '../src/utils/invoiceGenerator';
import type { InvoiceExtraLineItem } from '../src/types/invoice';

const extra = (overrides: Partial<InvoiceExtraLineItem>): InvoiceExtraLineItem => ({
  id: 'extra-1',
  summons_number: 'Research Fee',
  violation_date: '',
  status: '',
  hearing_result: '',
  hearing_date: '',
  amount_due: '',
  legal_fee: '',
  ...overrides,
});

describe('parseExtraAmount', () => {
  it('parses plain numeric strings', () => {
    expect(parseExtraAmount('250')).toBe(250);
    expect(parseExtraAmount('250.50')).toBe(250.5);
  });

  it('tolerates currency formatting', () => {
    expect(parseExtraAmount('$250')).toBe(250);
    expect(parseExtraAmount('$1,250.00')).toBe(1250);
  });

  it('returns 0 for empty or non-numeric input', () => {
    expect(parseExtraAmount('')).toBe(0);
    expect(parseExtraAmount(null)).toBe(0);
    expect(parseExtraAmount(undefined)).toBe(0);
    expect(parseExtraAmount('—')).toBe(0);
    expect(parseExtraAmount('N/A')).toBe(0);
  });
});

describe('sumExtrasLegalFees', () => {
  it('sums legal_fee across multiple extras', () => {
    const extras = [
      extra({ id: 'a', legal_fee: '250' }),
      extra({ id: 'b', legal_fee: '$125.50' }),
      extra({ id: 'c', legal_fee: '1,000' }),
    ];
    expect(sumExtrasLegalFees(extras)).toBe(1375.5);
  });

  it('ignores amount_due when rolling up totals', () => {
    // Contract per user spec: extras' amount_due does NOT affect totals.
    // Only legal_fee rolls into the grand Legal Fees total.
    const extras = [extra({ id: 'a', legal_fee: '0', amount_due: '500' })];
    expect(sumExtrasLegalFees(extras)).toBe(0);
  });

  it('returns 0 for empty or undefined input', () => {
    expect(sumExtrasLegalFees([])).toBe(0);
    expect(sumExtrasLegalFees(undefined)).toBe(0);
  });
});
