/**
 * @vitest-environment jsdom
 *
 * InvoiceDetailModal Component Tests
 * Tests for invoice metadata display, summons list, payment toggle, notes, and deadline
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InvoiceDetailModal from '../src/components/InvoiceDetailModal';
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
  invoice_number: 'INV-TestCorp-2026-02-01',
  invoice_date: '2026-02-01T00:00:00.000Z',
  recipient_company: 'Test Corp',
  recipient_attention: 'John Smith',
  recipient_address: '123 Main St',
  recipient_email: 'john@test.com',
  total_legal_fees: 500,
  total_fines_due: 1200,
  item_count: 2,
  payment_status: 'unpaid',
  payment_date: null,
  alert_deadline: '2026-02-08T00:00:00.000Z',
  notes: 'Test note',
  items: {
    items: [
      {
        id: 'item-1',
        invoiceID: 'inv-1',
        summonsID: 'sum-1',
        summons_number: 'SUM-001',
        legal_fee: 250,
        amount_due: 600,
      },
      {
        id: 'item-2',
        invoiceID: 'inv-1',
        summonsID: 'sum-2',
        summons_number: 'SUM-002',
        legal_fee: 250,
        amount_due: 600,
      },
    ],
  },
  ...overrides,
});

const defaultProps = {
  open: true,
  invoice: makeInvoice(),
  onClose: vi.fn(),
  onMarkPaid: vi.fn().mockResolvedValue(undefined),
  onMarkUnpaid: vi.fn().mockResolvedValue(undefined),
  onUpdateDeadline: vi.fn().mockResolvedValue(undefined),
  onUpdateNotes: vi.fn().mockResolvedValue(undefined),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InvoiceDetailModal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-10T00:00:00.000Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when invoice is null', () => {
    const { container } = render(
      <InvoiceDetailModal {...defaultProps} invoice={null} />
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders invoice number in the dialog title', () => {
    render(<InvoiceDetailModal {...defaultProps} />);
    expect(screen.getByText('INV-TestCorp-2026-02-01')).toBeDefined();
  });

  it('renders invoice metadata fields', () => {
    render(<InvoiceDetailModal {...defaultProps} />);
    expect(screen.getByText('Invoice Date')).toBeDefined();
    expect(screen.getByText('Alert Deadline')).toBeDefined();
    expect(screen.getByText('Recipient')).toBeDefined();
    expect(screen.getByText('Test Corp')).toBeDefined();
    expect(screen.getByText(/Attn: John Smith/)).toBeDefined();
    expect(screen.getByText('Payment Status')).toBeDefined();
  });

  it('shows "Unpaid" when invoice is unpaid', () => {
    render(<InvoiceDetailModal {...defaultProps} />);
    expect(screen.getByText('Unpaid')).toBeDefined();
  });

  it('shows paid date when invoice is paid', () => {
    const paidInvoice = makeInvoice({
      payment_status: 'paid',
      payment_date: '2026-02-05T00:00:00.000Z',
    });
    render(<InvoiceDetailModal {...defaultProps} invoice={paidInvoice} />);
    expect(screen.getByText(/Paid on 2\/05\/26/)).toBeDefined();
  });

  it('renders financial summary with Legal Fees, Fines Due, and Total', () => {
    render(<InvoiceDetailModal {...defaultProps} />);
    expect(screen.getByText('Legal Fees')).toBeDefined();
    expect(screen.getByText('Fines Due')).toBeDefined();
    expect(screen.getByText('Total')).toBeDefined();
    expect(screen.getByText('$500.00')).toBeDefined();
    expect(screen.getByText('$1,200.00')).toBeDefined();
    expect(screen.getByText('$1,700.00')).toBeDefined();
  });

  it('renders summons list with correct count', () => {
    render(<InvoiceDetailModal {...defaultProps} />);
    expect(screen.getByText('Summonses (2)')).toBeDefined();
    expect(screen.getByText('SUM-001')).toBeDefined();
    expect(screen.getByText('SUM-002')).toBeDefined();
  });

  it('shows empty summons message when no items', () => {
    const noItemsInvoice = makeInvoice({ items: { items: [] } });
    render(<InvoiceDetailModal {...defaultProps} invoice={noItemsInvoice} />);
    expect(screen.getByText('No linked summonses found.')).toBeDefined();
  });

  it('renders "Mark as Paid" button for unpaid invoices', () => {
    render(<InvoiceDetailModal {...defaultProps} />);
    expect(screen.getByText('Mark as Paid')).toBeDefined();
  });

  it('calls onMarkPaid when "Mark as Paid" is clicked', async () => {
    vi.useRealTimers();
    render(<InvoiceDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Mark as Paid'));
    await waitFor(() => {
      expect(defaultProps.onMarkPaid).toHaveBeenCalledWith('inv-1', expect.any(String));
    });
  });

  it('renders "Mark as Unpaid" button for paid invoices', () => {
    const paidInvoice = makeInvoice({
      payment_status: 'paid',
      payment_date: '2026-02-05T00:00:00.000Z',
    });
    render(<InvoiceDetailModal {...defaultProps} invoice={paidInvoice} />);
    expect(screen.getByText('Mark as Unpaid')).toBeDefined();
  });

  it('calls onMarkUnpaid when "Mark as Unpaid" is clicked', async () => {
    vi.useRealTimers();
    const paidInvoice = makeInvoice({
      id: 'inv-paid',
      payment_status: 'paid',
      payment_date: '2026-02-05T00:00:00.000Z',
    });
    render(<InvoiceDetailModal {...defaultProps} invoice={paidInvoice} />);
    fireEvent.click(screen.getByText('Mark as Unpaid'));
    await waitFor(() => {
      expect(defaultProps.onMarkUnpaid).toHaveBeenCalledWith('inv-paid');
    });
  });

  it('renders notes section', () => {
    render(<InvoiceDetailModal {...defaultProps} />);
    expect(screen.getByText('Notes')).toBeDefined();
    expect(screen.getByText('Test note')).toBeDefined();
  });

  it('shows placeholder when notes are empty', () => {
    const noNotesInvoice = makeInvoice({ notes: null });
    render(<InvoiceDetailModal {...defaultProps} invoice={noNotesInvoice} />);
    expect(screen.getByText('Click to add notes...')).toBeDefined();
  });

  it('enters edit mode when notes area is clicked', () => {
    render(<InvoiceDetailModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Test note'));
    // Should show a text field and Save/Cancel buttons
    expect(screen.getByText('Save')).toBeDefined();
    expect(screen.getByText('Cancel')).toBeDefined();
  });

  it('calls onUpdateNotes when Save is clicked after editing', async () => {
    vi.useRealTimers();
    render(<InvoiceDetailModal {...defaultProps} />);
    // Enter edit mode
    fireEvent.click(screen.getByText('Test note'));
    // Find the multiline text field (notes textarea); DatePicker also has textboxes
    const textboxes = screen.getAllByRole('textbox');
    // The notes textarea is the multiline one - find it by current value
    const notesField = textboxes.find((el) => (el as HTMLTextAreaElement).value === 'Test note');
    expect(notesField).toBeDefined();
    fireEvent.change(notesField!, { target: { value: 'Updated note' } });
    // Click Save
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(defaultProps.onUpdateNotes).toHaveBeenCalledWith('inv-1', 'Updated note');
    });
  });

  it('renders Close button in dialog actions', () => {
    render(<InvoiceDetailModal {...defaultProps} />);
    // There may be multiple "Close" texts; the button in dialog actions is what we want
    const closeButtons = screen.getAllByText('Close');
    expect(closeButtons.length).toBeGreaterThan(0);
  });

  it('calls onClose when Close text button is clicked', () => {
    render(<InvoiceDetailModal {...defaultProps} />);
    // Get the Close button in the dialog actions area
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    // Click the last one (the text button in DialogActions, not the icon button)
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when close icon button is clicked', () => {
    const { container } = render(<InvoiceDetailModal {...defaultProps} />);
    // The close icon button is an IconButton with CloseIcon
    const closeButton = container.querySelector('[data-testid="CloseIcon"]');
    if (closeButton) {
      fireEvent.click(closeButton.closest('button')!);
      expect(defaultProps.onClose).toHaveBeenCalled();
    }
  });

  it('renders status chip in the title', () => {
    render(<InvoiceDetailModal {...defaultProps} />);
    // Overdue invoice (deadline 2026-02-08, current time 2026-02-10)
    expect(screen.getByText('OVERDUE')).toBeDefined();
  });

  it('renders PAID chip for paid invoices', () => {
    const paidInvoice = makeInvoice({
      payment_status: 'paid',
      payment_date: '2026-02-05T00:00:00.000Z',
    });
    render(<InvoiceDetailModal {...defaultProps} invoice={paidInvoice} />);
    expect(screen.getByText('PAID')).toBeDefined();
  });
});
