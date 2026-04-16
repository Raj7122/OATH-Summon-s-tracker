/**
 * @vitest-environment jsdom
 *
 * InvoiceTracker Page Integration Tests
 * Tests for page rendering, loading/error states, and child component presence
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// InvoiceTracker uses useLocation/useNavigate to pick up snackbar messages
// passed from InvoiceBuilder after an edit save. Wrap every render in a
// MemoryRouter so those hooks resolve.
const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

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
// Mock the InvoiceTrackerContext
// ---------------------------------------------------------------------------
const mockContextValues = vi.hoisted(() => ({
  invoices: [] as any[],
  loading: false,
  error: null as string | null,
  fetchInvoices: vi.fn(),
  markAsPaid: vi.fn(),
  markAsUnpaid: vi.fn(),
  updateAlertDeadline: vi.fn(),
  updateNotes: vi.fn(),
  getHorizonStats: vi.fn().mockReturnValue({
    overdueCount: 0,
    dueSoonCount: 0,
    paidCount: 0,
    unpaidCount: 0,
  }),
}));

vi.mock('../src/contexts/InvoiceTrackerContext', () => ({
  useInvoiceTracker: () => mockContextValues,
  InvoiceTrackerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import InvoiceTracker from '../src/pages/InvoiceTracker';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InvoiceTracker Page', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-10T00:00:00.000Z'));
    vi.clearAllMocks();

    // Reset to defaults
    mockContextValues.invoices = [];
    mockContextValues.loading = false;
    mockContextValues.error = null;
    mockContextValues.getHorizonStats.mockReturnValue({
      overdueCount: 0,
      dueSoonCount: 0,
      paidCount: 0,
      unpaidCount: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders page header with "Invoice Tracker" title', () => {
    renderWithRouter(<InvoiceTracker />);
    expect(screen.getByText('Invoice Tracker')).toBeDefined();
  });

  it('renders the ReceiptLong icon (via data-testid)', () => {
    const { container } = renderWithRouter(<InvoiceTracker />);
    const icon = container.querySelector('[data-testid="ReceiptLongIcon"]');
    expect(icon).not.toBeNull();
  });

  it('shows loading spinner when loading is true', () => {
    mockContextValues.loading = true;
    const { container } = renderWithRouter(<InvoiceTracker />);
    // CircularProgress renders a role="progressbar"
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it('does not show page content when loading', () => {
    mockContextValues.loading = true;
    renderWithRouter(<InvoiceTracker />);
    expect(screen.queryByText('Invoice Tracker')).toBeNull();
  });

  it('shows error alert when error exists', () => {
    mockContextValues.error = 'Failed to load invoices';
    renderWithRouter(<InvoiceTracker />);
    expect(screen.getByText('Failed to load invoices')).toBeDefined();
  });

  it('renders InvoiceCalendarPanel (visible via "Invoice Calendar" heading)', () => {
    renderWithRouter(<InvoiceTracker />);
    expect(screen.getByText('Invoice Calendar')).toBeDefined();
  });

  it('renders InvoiceListPanel (visible via "Invoices" heading)', () => {
    renderWithRouter(<InvoiceTracker />);
    expect(screen.getByText('Invoices')).toBeDefined();
  });

  it('renders InvoiceSummaryCards (visible via "Summary" heading)', () => {
    renderWithRouter(<InvoiceTracker />);
    expect(screen.getByText('Summary')).toBeDefined();
  });

  it('renders filter chips in the calendar panel with zero counts', () => {
    renderWithRouter(<InvoiceTracker />);
    expect(screen.getByText('Overdue (0)')).toBeDefined();
    expect(screen.getByText('Due Soon (0)')).toBeDefined();
    expect(screen.getByText('Paid (0)')).toBeDefined();
  });

  it('renders with invoices present', () => {
    mockContextValues.invoices = [
      {
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
      },
    ];
    mockContextValues.getHorizonStats.mockReturnValue({
      overdueCount: 1,
      dueSoonCount: 0,
      paidCount: 0,
      unpaidCount: 1,
    });

    renderWithRouter(<InvoiceTracker />);
    expect(screen.getByText('INV-Test-2026-02-01')).toBeDefined();
    expect(screen.getByText('Test Corp')).toBeDefined();
    expect(screen.getByText('Overdue (1)')).toBeDefined();
  });
});
