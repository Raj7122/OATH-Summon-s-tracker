/**
 * @vitest-environment jsdom
 *
 * InvoiceListPanel Sorting Tests
 * Verifies the sortable column headers: default order is preserved, clicking
 * "Recipient" sorts A→Z, and clicking again reverses to Z→A.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import InvoiceListPanel from '../src/components/InvoiceListPanel';
import { Invoice } from '../src/types/invoiceTracker';

// InvoiceListPanel transitively imports helpers/theme that pull in Amplify.
const mockGraphql = vi.hoisted(() => vi.fn());
vi.mock('aws-amplify/api', () => ({
  generateClient: () => ({ graphql: mockGraphql }),
}));

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  invoice_number: 'INV-Test-2026-02-01',
  invoice_date: '2026-02-01T00:00:00.000Z',
  recipient_company: 'Test Corp',
  total_legal_fees: 250,
  total_fines_due: 500,
  item_count: 1,
  payment_status: 'unpaid',
  payment_date: null,
  alert_deadline: '2026-02-08T00:00:00.000Z',
  notes: null,
  ...overrides,
});

// Deliberately out of alphabetical order to prove sorting actually reorders.
const invoices: Invoice[] = [
  makeInvoice({ id: 'a', recipient_company: 'DESANTIS DESPATCH', invoice_number: 'INV-DESANTIS_DESPATCH-2026-05-28' }),
  makeInvoice({ id: 'b', recipient_company: 'AAA EGG DEPOT', invoice_number: 'INV-AAA_EGG_DEPOT-2026-05-28' }),
  makeInvoice({ id: 'c', recipient_company: 'BENJAMIN MOORE CO', invoice_number: 'INV-BENJAMIN_MOORE_CO-2026-04-28' }),
];

const renderPanel = () =>
  render(
    <InvoiceListPanel
      invoices={invoices}
      horizonFilter={null}
      onInvoiceClick={() => {}}
      onMarkPaid={() => {}}
      onMarkUnpaid={() => {}}
    />,
  );

// Read the Recipient cell (3rd column) from each body row, in DOM order.
const recipientOrder = (): string[] => {
  const rows = screen.getAllByRole('row').slice(1); // drop header row
  return rows.map((row) => within(row).getAllByRole('cell')[2].textContent?.trim() ?? '');
};

describe('InvoiceListPanel sorting', () => {
  it('preserves the given order by default (no sort applied)', () => {
    renderPanel();
    expect(recipientOrder()).toEqual(['DESANTIS DESPATCH', 'AAA EGG DEPOT', 'BENJAMIN MOORE CO']);
  });

  it('sorts A→Z when the Recipient header is clicked, and Z→A on a second click', () => {
    renderPanel();
    const recipientHeader = screen.getByRole('button', { name: /Recipient/i });

    fireEvent.click(recipientHeader);
    expect(recipientOrder()).toEqual(['AAA EGG DEPOT', 'BENJAMIN MOORE CO', 'DESANTIS DESPATCH']);

    fireEvent.click(recipientHeader);
    expect(recipientOrder()).toEqual(['DESANTIS DESPATCH', 'BENJAMIN MOORE CO', 'AAA EGG DEPOT']);
  });

  it('sorts alphabetically by Invoice # the same way (shared INV- prefix)', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Invoice #/i }));
    expect(recipientOrder()).toEqual(['AAA EGG DEPOT', 'BENJAMIN MOORE CO', 'DESANTIS DESPATCH']);
  });
});
