/**
 * @vitest-environment jsdom
 *
 * InvoiceSummaryCards Component Tests
 * Tests for weekly/monthly toggle, period cards, badges, and empty state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InvoiceSummaryCards from '../src/components/InvoiceSummaryCards';
import { Invoice } from '../src/types/invoiceTracker';

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
  item_count: 1,
  payment_status: 'unpaid',
  payment_date: null,
  alert_deadline: '2026-02-08T00:00:00.000Z',
  notes: null,
  ...overrides,
});

const testInvoices: Invoice[] = [
  // Week 1 of Feb 2026
  makeInvoice({
    id: 'inv-1',
    invoice_date: '2026-02-02T00:00:00.000Z',
    alert_deadline: '2026-01-20T00:00:00.000Z', // overdue
    total_legal_fees: 250,
    total_fines_due: 500,
  }),
  makeInvoice({
    id: 'inv-2',
    invoice_date: '2026-02-03T00:00:00.000Z',
    payment_status: 'paid',
    payment_date: '2026-02-05T00:00:00.000Z',
    total_legal_fees: 300,
    total_fines_due: 600,
  }),
  // Week 2 of Feb 2026
  makeInvoice({
    id: 'inv-3',
    invoice_date: '2026-02-10T00:00:00.000Z',
    alert_deadline: '2026-02-17T00:00:00.000Z',
    total_legal_fees: 150,
    total_fines_due: 400,
  }),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InvoiceSummaryCards', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-10T00:00:00.000Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the "Summary" heading', () => {
    render(<InvoiceSummaryCards invoices={testInvoices} />);
    expect(screen.getByText('Summary')).toBeDefined();
  });

  it('renders weekly/monthly toggle buttons', () => {
    render(<InvoiceSummaryCards invoices={testInvoices} />);
    expect(screen.getByText('Weekly')).toBeDefined();
    expect(screen.getByText('Monthly')).toBeDefined();
  });

  it('defaults to weekly view', () => {
    render(<InvoiceSummaryCards invoices={testInvoices} />);
    const weeklyBtn = screen.getByText('Weekly');
    // The Weekly button should be selected (aria-pressed)
    expect(weeklyBtn.closest('button')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders period cards with invoice counts', () => {
    render(<InvoiceSummaryCards invoices={testInvoices} />);
    // Should have period labels and invoice counts
    const invoiceCountTexts = screen.getAllByText(/invoice/i);
    expect(invoiceCountTexts.length).toBeGreaterThan(0);
  });

  it('shows empty state when no invoices', () => {
    render(<InvoiceSummaryCards invoices={[]} />);
    expect(screen.getByText('No invoices to summarize.')).toBeDefined();
  });

  it('toggles to monthly view when Monthly is clicked', () => {
    render(<InvoiceSummaryCards invoices={testInvoices} />);
    fireEvent.click(screen.getByText('Monthly'));
    const monthlyBtn = screen.getByText('Monthly');
    expect(monthlyBtn.closest('button')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders overdue badge when overdue invoices exist', () => {
    render(<InvoiceSummaryCards invoices={testInvoices} />);
    // The overdue invoice (inv-1) has alert_deadline in the past
    expect(screen.getByText(/overdue/i)).toBeDefined();
  });

  it('renders paid badge when paid invoices exist', () => {
    render(<InvoiceSummaryCards invoices={testInvoices} />);
    // Look for "N paid" text pattern in summary cards
    expect(screen.getByText(/\d+ paid/)).toBeDefined();
  });

  it('renders unpaid badge when unpaid invoices exist', () => {
    render(<InvoiceSummaryCards invoices={testInvoices} />);
    // Multiple cards may show "N unpaid" badges
    const unpaidBadges = screen.getAllByText(/\d+ unpaid/);
    expect(unpaidBadges.length).toBeGreaterThan(0);
  });

  it('shows outstanding amount for periods with unpaid invoices', () => {
    render(<InvoiceSummaryCards invoices={testInvoices} />);
    // At least one "Outstanding: $X.XX" should appear
    expect(screen.getAllByText(/Outstanding/i).length).toBeGreaterThan(0);
  });

  it('renders different period labels in monthly vs weekly view', () => {
    const { rerender } = render(<InvoiceSummaryCards invoices={testInvoices} />);

    // In weekly view, labels should be like "2026-W06"
    const weeklyCards = screen.getAllByText(/W\d{2}/);
    expect(weeklyCards.length).toBeGreaterThan(0);

    // Switch to monthly
    fireEvent.click(screen.getByText('Monthly'));

    // In monthly view, labels should be like "2026-02"
    expect(screen.getByText('2026-02')).toBeDefined();
  });
});
