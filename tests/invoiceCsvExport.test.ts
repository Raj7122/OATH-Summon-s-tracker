import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { generateInvoiceCSV, buildInvoiceCsvFilename } from '../src/lib/invoiceCsvExport';
import type { Invoice } from '../src/types/invoiceTracker';

dayjs.extend(utc);

const EXPECTED_HEADER =
  'Invoice #,Invoice Date,Recipient,Attention,Items,Legal Fees,Fines Due,Total,Status,Deadline,Payment Date';

const invoice = (overrides: Partial<Invoice>): Invoice => ({
  id: 'inv-1',
  invoice_number: 'INV-001',
  invoice_date: '2026-05-01T00:00:00.000Z',
  recipient_company: 'Acme Corp',
  total_legal_fees: 1000,
  total_fines_due: 240,
  item_count: 2,
  payment_status: 'unpaid',
  // Far enough in the future to count as a "normal" unpaid invoice
  alert_deadline: dayjs.utc().add(30, 'day').toISOString(),
  ...overrides,
});

describe('generateInvoiceCSV', () => {
  it('emits the header row even for an empty list', () => {
    expect(generateInvoiceCSV([])).toBe(EXPECTED_HEADER);
  });

  it('produces one data row per invoice', () => {
    const csv = generateInvoiceCSV([invoice({}), invoice({ id: 'inv-2' })]);
    expect(csv.split('\n')).toHaveLength(3); // header + 2 rows
  });

  it('computes Total as legal fees + fines due', () => {
    const csv = generateInvoiceCSV([invoice({ total_legal_fees: 1000, total_fines_due: 240 })]);
    const cells = csv.split('\n')[1].split(',');
    expect(cells[7]).toBe('1240.00'); // Total column
  });

  it('maps payment/deadline state to the computed Status label', () => {
    const paid = invoice({ id: 'p', payment_status: 'paid', payment_date: '2026-05-10T00:00:00.000Z' });
    const overdue = invoice({ id: 'o', payment_status: 'unpaid', alert_deadline: dayjs.utc().subtract(10, 'day').toISOString() });
    const unpaid = invoice({ id: 'u', payment_status: 'unpaid' });

    const status = (inv: Invoice) => generateInvoiceCSV([inv]).split('\n')[1].split(',')[8];

    expect(status(paid)).toBe('Paid');
    expect(status(overdue)).toBe('Overdue');
    expect(status(unpaid)).toBe('Unpaid');
  });

  it('escapes a comma in the recipient name so it stays in one cell', () => {
    const csv = generateInvoiceCSV([invoice({ recipient_company: 'Acme, Inc.' })]);
    expect(csv.split('\n')[1]).toContain('"Acme, Inc."');
  });
});

describe('buildInvoiceCsvFilename', () => {
  it('includes the tab label and the current date', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(buildInvoiceCsvFilename('Unpaid')).toBe(`Invoices_Unpaid_${today}.csv`);
  });
});
