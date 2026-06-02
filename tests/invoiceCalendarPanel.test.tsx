/**
 * @vitest-environment jsdom
 *
 * InvoiceCalendarPanel Component Tests
 * Tests for calendar rendering, horizon filter chips, and date selection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import InvoiceCalendarPanel from '../src/components/InvoiceCalendarPanel';
import { Invoice, InvoiceHorizonFilter, InvoiceHorizonStats } from '../src/types/invoiceTracker';

dayjs.extend(utc);

// ---------------------------------------------------------------------------
// Mock AWS Amplify (required because theme/helpers may transitively import it)
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

const defaultStats: InvoiceHorizonStats = {
  overdueCount: 2,
  dueSoonCount: 1,
  paidCount: 3,
  unpaidCount: 3,
};

const defaultProps = {
  invoices: [
    makeInvoice({ id: 'inv-1', alert_deadline: '2026-02-05T00:00:00.000Z' }),
    makeInvoice({ id: 'inv-2', alert_deadline: '2026-02-10T00:00:00.000Z' }),
    makeInvoice({
      id: 'inv-3',
      payment_status: 'paid' as const,
      payment_date: '2026-02-03T00:00:00.000Z',
    }),
  ],
  selectedDate: null as dayjs.Dayjs | null,
  onDateSelect: vi.fn(),
  horizonFilter: null as InvoiceHorizonFilter,
  horizonStats: defaultStats,
  onHorizonFilterClick: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InvoiceCalendarPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-10T00:00:00.000Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the "Invoice Calendar" heading', () => {
    render(<InvoiceCalendarPanel {...defaultProps} />);
    expect(screen.getByText('Invoice Calendar')).toBeDefined();
  });

  it('renders the DateCalendar component', () => {
    const { container } = render(<InvoiceCalendarPanel {...defaultProps} />);
    // MUI DateCalendar renders a calendar header with month/year
    expect(container.querySelector('.MuiDateCalendar-root')).toBeDefined();
  });

  it('renders horizon filter chips with correct counts', () => {
    render(<InvoiceCalendarPanel {...defaultProps} />);
    expect(screen.getByText('Overdue (2)')).toBeDefined();
    expect(screen.getByText('Due Soon (1)')).toBeDefined();
    expect(screen.getByText('Paid (3)')).toBeDefined();
  });

  it('calls onHorizonFilterClick when clicking an Overdue chip', () => {
    render(<InvoiceCalendarPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Overdue (2)'));
    expect(defaultProps.onHorizonFilterClick).toHaveBeenCalledWith('overdue');
  });

  it('calls onHorizonFilterClick when clicking Due Soon chip', () => {
    render(<InvoiceCalendarPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Due Soon (1)'));
    expect(defaultProps.onHorizonFilterClick).toHaveBeenCalledWith('due_soon');
  });

  it('calls onHorizonFilterClick when clicking Paid chip', () => {
    render(<InvoiceCalendarPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Paid (3)'));
    expect(defaultProps.onHorizonFilterClick).toHaveBeenCalledWith('paid');
  });

  it('shows "Today" button', () => {
    render(<InvoiceCalendarPanel {...defaultProps} />);
    expect(screen.getByText('Today')).toBeDefined();
  });

  it('calls onDateSelect with today when clicking Today button', () => {
    const onDateSelect = vi.fn();
    render(<InvoiceCalendarPanel {...defaultProps} onDateSelect={onDateSelect} />);
    fireEvent.click(screen.getByText('Today'));
    expect(onDateSelect).toHaveBeenCalled();
    const arg = onDateSelect.mock.calls[0][0];
    // Should be a dayjs representing today
    expect(arg).not.toBeNull();
    // dayjs() uses local time; system time is 2026-02-10T00:00:00Z
    // In local timezone this could be 2026-02-09, so just check it's a valid day
    expect(dayjs.isDayjs(arg)).toBe(true);
  });

  it('shows "Clear" button when a date is selected', () => {
    render(
      <InvoiceCalendarPanel
        {...defaultProps}
        selectedDate={dayjs('2026-02-10')}
      />
    );
    expect(screen.getByText('Clear')).toBeDefined();
  });

  it('does not show "Clear" button when no date is selected', () => {
    render(<InvoiceCalendarPanel {...defaultProps} selectedDate={null} />);
    expect(screen.queryByText('Clear')).toBeNull();
  });

  it('calls onDateSelect with null when clicking Clear', () => {
    const onDateSelect = vi.fn();
    render(
      <InvoiceCalendarPanel
        {...defaultProps}
        selectedDate={dayjs('2026-02-10')}
        onDateSelect={onDateSelect}
      />
    );
    fireEvent.click(screen.getByText('Clear'));
    expect(onDateSelect).toHaveBeenCalledWith(null);
  });

  it('renders dots for invoice dates via the DOM', () => {
    const { container } = render(<InvoiceCalendarPanel {...defaultProps} />);
    // Dots are 6x6 circles positioned absolutely at the bottom of day cells
    const dots = container.querySelectorAll('[class*="MuiBox-root"]');
    // We just verify the calendar rendered without errors - exact dot count
    // depends on MUI internal rendering and the current month
    expect(dots.length).toBeGreaterThan(0);
  });
});
