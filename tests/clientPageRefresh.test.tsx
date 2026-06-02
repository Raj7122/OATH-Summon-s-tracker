/**
 * @vitest-environment jsdom
 *
 * Same-page refresh regression test.
 *
 * Scenario: Arthur is on the Client Detail page, opens the Invoices dialog,
 * marks an invoice paid, and closes the dialog. The Paid column on the
 * client page should update immediately — no navigation required.
 *
 * This test pins the wiring (onInvoicesChanged callback) that enables that.
 * If someone removes the prop or stops firing it after mark-paid, this test
 * fails fast.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const mockGraphql = vi.hoisted(() => vi.fn());

vi.mock('aws-amplify/api', () => ({
  generateClient: () => ({ graphql: mockGraphql }),
}));

vi.mock('aws-amplify/storage', () => ({
  getUrl: vi.fn().mockResolvedValue({ url: new URL('https://example.com/invoice.pdf') }),
}));

import ClientInvoicesDialog from '../src/components/ClientInvoicesDialog';

const UNPAID_INVOICE = {
  id: 'inv-1',
  invoice_number: 'INV-Test-2026-02-01',
  invoice_date: '2026-02-01T00:00:00.000Z',
  recipient_company: 'Test Corp',
  recipient_attention: 'Jane Smith',
  recipient_address: '1 Main St',
  recipient_email: 'jane@test.com',
  total_legal_fees: 500,
  total_fines_due: 1000,
  item_count: 1,
  payment_status: 'unpaid',
  payment_date: null,
  alert_deadline: '2026-02-08T00:00:00.000Z',
  notes: null,
  clientID: 'client-1',
  pdf_s3_key: null,
  extra_line_items: null,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
};

// The dialog does two query stages on open: a list of invoices, then
// per-invoice hydration of their InvoiceSummons join rows. Mark-paid then
// fires updateInvoice + a second list refresh. The mock dispatches on
// operation name so the ordering stays flexible.
function mockResponseFor(arg: { query: string }) {
  const q = arg.query;
  if (q.includes('InvoicesByClientBasic')) {
    return Promise.resolve({
      data: {
        invoicesByClientID: {
          items: [UNPAID_INVOICE],
          nextToken: null,
        },
      },
    });
  }
  if (q.includes('InvoiceSummonsForInvoice')) {
    return Promise.resolve({
      data: {
        invoiceSummonsByInvoiceIDAndSummonsID: {
          items: [
            { id: 'item-1', invoiceID: 'inv-1', summonsID: 'sum-1', summons_number: 'SUM-001', legal_fee: 500, amount_due: 1000 },
          ],
          nextToken: null,
        },
      },
    });
  }
  if (q.includes('UpdateInvoiceRecord')) {
    return Promise.resolve({ data: { updateInvoice: { id: 'inv-1' } } });
  }
  // Fallback for any unexpected query — return empty shape instead of
  // throwing so an unrelated render side-effect can't silently fail the test.
  return Promise.resolve({ data: {} });
}

describe('Client page refresh after mark-paid', () => {
  beforeEach(() => {
    mockGraphql.mockReset();
    mockGraphql.mockImplementation(mockResponseFor);
  });

  it('fires onInvoicesChanged after Arthur marks an invoice paid inside the dialog', async () => {
    const onInvoicesChanged = vi.fn();

    render(
      <MemoryRouter>
        <ClientInvoicesDialog
          open
          onClose={() => {}}
          clientID="client-1"
          clientName="Test Corp"
          onInvoicesChanged={onInvoicesChanged}
        />
      </MemoryRouter>
    );

    // Invoice row shows up once the mocked list query resolves.
    await waitFor(() => {
      expect(screen.getByText('INV-Test-2026-02-01')).toBeDefined();
    });

    // Click the row to open the nested InvoiceDetailModal.
    fireEvent.click(screen.getByText('INV-Test-2026-02-01'));

    // The detail modal's "Mark as Paid" button should now be reachable.
    const markPaidButton = await screen.findByRole('button', { name: /mark as paid/i });
    fireEvent.click(markPaidButton);

    // The key assertion: ClientDetail's refresh hook was fired. Without this,
    // the Paid column on the client page would stay stale until navigation.
    await waitFor(() => {
      expect(onInvoicesChanged).toHaveBeenCalled();
    });

    // Sanity: the update mutation was actually dispatched with the paid
    // status — guards against a regression where the callback fires but
    // the persistence path was broken.
    const updateCall = mockGraphql.mock.calls.find(([arg]) =>
      typeof arg?.query === 'string' && arg.query.includes('UpdateInvoiceRecord')
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0].variables.input.payment_status).toBe('paid');
  });
});
