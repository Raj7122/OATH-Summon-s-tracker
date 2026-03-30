/**
 * @vitest-environment jsdom
 *
 * InvoiceListPanel Component Tests
 * Tests for table rendering, filter tabs, status chips, and action buttons
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import InvoiceListPanel from '../src/components/InvoiceListPanel';
import { Invoice, InvoiceHorizonFilter } from '../src/types/invoiceTracker';

// ---------------------------------------------------------------------------
// Mock AWS Amplify
// ---------------------------------------------------------------------------
const mockGraphql = vi.hoisted(() => vi.fn());

vi.mock('aws-amplify/api', () => ({
  generateClient: () => ({
    graphql: mockGraphql,
  }),
}));

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  invoice_number: 'INV-Test-2026-02-01',
  invoice_date: '2026-02-01T00:00:00.000Z',
  recipient_company: 'Test Corp',
  total_legal_fees: 250,
  total_fines_due: 500,
  item_count: 2,
  payment_status: 'unpaid',
  payment_date: null,
  alert_deadline: '2026-02-08T00:00:00.000Z',
  notes: null,
  ...overrides,
});

// Overdue invoice: deadline in the past, unpaid
const overdueInvoice = makeInvoice({
  id: 'inv-overdue',
  invoice_number: 'INV-Overdue-2026-01-01',
  alert_deadline: '2026-01-15T00:00:00.000Z',
  recipient_company: 'Late Corp',
});

// Paid invoice
const paidInvoice = makeInvoice({
  id: 'inv-paid',
  invoice_number: 'INV-Paid-2026-01-20',
  payment_status: 'paid',
  payment_date: '2026-01-25T00:00:00.000Z',
  recipient_company: 'Paid Corp',
});

// Due soon invoice: within 3 days of deadline, unpaid
const dueSoonInvoice = makeInvoice({
  id: 'inv-soon',
  invoice_number: 'INV-Soon-2026-02-09',
  alert_deadline: '2026-02-11T00:00:00.000Z',
  recipient_company: 'Soon Corp',
});

const allInvoices = [overdueInvoice, paidInvoice, dueSoonInvoice];

const defaultProps = {
  invoices: allInvoices,
  horizonFilter: null as InvoiceHorizonFilter,
  onInvoiceClick: vi.fn(),
  onMarkPaid: vi.fn(),
  onMarkUnpaid: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InvoiceListPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-10T00:00:00.000Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the "Invoices" heading', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    expect(screen.getByText('Invoices')).toBeDefined();
  });

  it('renders table with correct column headers', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    expect(screen.getByText('Invoice #')).toBeDefined();
    expect(screen.getByText('Date')).toBeDefined();
    expect(screen.getByText('Recipient')).toBeDefined();
    expect(screen.getByText('Items')).toBeDefined();
    expect(screen.getByText('Total')).toBeDefined();
    expect(screen.getByText('Status')).toBeDefined();
    expect(screen.getByText('Deadline')).toBeDefined();
    expect(screen.getByText('Action')).toBeDefined();
  });

  it('renders all invoice numbers', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    expect(screen.getByText('INV-Overdue-2026-01-01')).toBeDefined();
    expect(screen.getByText('INV-Paid-2026-01-20')).toBeDefined();
    expect(screen.getByText('INV-Soon-2026-02-09')).toBeDefined();
  });

  it('renders filter tabs (All, Unpaid, Overdue, Paid)', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    const tabLabels = tabs.map((t) => t.textContent);
    expect(tabLabels).toContain('All (3)');
    expect(tabLabels).toContain('Unpaid');
    expect(tabLabels).toContain('Overdue');
    expect(tabLabels).toContain('Paid');
  });

  it('shows all invoices by default on All tab', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    // All 3 invoices should be visible
    const rows = screen.getAllByRole('row');
    // 1 header row + 3 data rows = 4
    expect(rows.length).toBe(4);
  });

  it('filters to unpaid invoices when Unpaid tab is clicked', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: /Unpaid/i }));
    // Only overdue and dueSoon are unpaid
    expect(screen.getByText('INV-Overdue-2026-01-01')).toBeDefined();
    expect(screen.getByText('INV-Soon-2026-02-09')).toBeDefined();
    expect(screen.queryByText('INV-Paid-2026-01-20')).toBeNull();
  });

  it('filters to paid invoices when Paid tab is clicked', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: /^Paid$/i }));
    expect(screen.getByText('INV-Paid-2026-01-20')).toBeDefined();
    expect(screen.queryByText('INV-Overdue-2026-01-01')).toBeNull();
    expect(screen.queryByText('INV-Soon-2026-02-09')).toBeNull();
  });

  it('filters to overdue invoices when Overdue tab is clicked', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('tab', { name: /Overdue/i }));
    expect(screen.getByText('INV-Overdue-2026-01-01')).toBeDefined();
    expect(screen.queryByText('INV-Paid-2026-01-20')).toBeNull();
    expect(screen.queryByText('INV-Soon-2026-02-09')).toBeNull();
  });

  it('renders OVERDUE status chip for overdue invoices', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    expect(screen.getByText('OVERDUE')).toBeDefined();
  });

  it('renders PAID status chip for paid invoices', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    expect(screen.getByText('PAID')).toBeDefined();
  });

  it('renders DUE SOON status chip for due-soon invoices', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    expect(screen.getByText('DUE SOON')).toBeDefined();
  });

  it('shows "Mark Paid" button for unpaid invoices', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    const markPaidButtons = screen.getAllByText('Mark Paid');
    // 2 unpaid invoices (overdue + dueSoon) = 2 buttons
    expect(markPaidButtons.length).toBe(2);
  });

  it('shows "Undo" button for paid invoices', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    expect(screen.getByText('Undo')).toBeDefined();
  });

  it('calls onMarkPaid when "Mark Paid" is clicked', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    const markPaidButtons = screen.getAllByText('Mark Paid');
    fireEvent.click(markPaidButtons[0]);
    expect(defaultProps.onMarkPaid).toHaveBeenCalledWith('inv-overdue');
  });

  it('calls onMarkUnpaid when "Undo" is clicked', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Undo'));
    expect(defaultProps.onMarkUnpaid).toHaveBeenCalledWith('inv-paid');
  });

  it('shows empty state when no invoices match the filter', () => {
    render(
      <InvoiceListPanel
        {...defaultProps}
        invoices={[]}
      />
    );
    expect(screen.getByText('No invoices match the current filter.')).toBeDefined();
  });

  it('calls onInvoiceClick when a row is clicked', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    // Click on the overdue invoice row (by clicking the invoice number cell)
    fireEvent.click(screen.getByText('INV-Overdue-2026-01-01'));
    expect(defaultProps.onInvoiceClick).toHaveBeenCalledWith(overdueInvoice);
  });

  it('does not trigger onInvoiceClick when action button is clicked', () => {
    render(<InvoiceListPanel {...defaultProps} />);
    const markPaidButtons = screen.getAllByText('Mark Paid');
    fireEvent.click(markPaidButtons[0]);
    // onMarkPaid should be called, but onInvoiceClick should NOT be
    expect(defaultProps.onMarkPaid).toHaveBeenCalled();
    expect(defaultProps.onInvoiceClick).not.toHaveBeenCalled();
  });
});
