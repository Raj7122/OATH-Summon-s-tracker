/**
 * @vitest-environment jsdom
 *
 * InvoiceBuilder Integration Tests
 * Tests for DatePicker rendering, previously-invoiced indicators,
 * and createInvoiceRecord mutation calls on generate.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock AWS Amplify (hoisted)
// ---------------------------------------------------------------------------
const mockGraphql = vi.hoisted(() => vi.fn());

vi.mock('aws-amplify/api', () => ({
  generateClient: () => ({
    graphql: mockGraphql,
  }),
}));

// ---------------------------------------------------------------------------
// Mock invoice generator to avoid real PDF/DOCX generation
// ---------------------------------------------------------------------------
const mockGeneratePDF = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockGenerateDOCX = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../src/utils/invoiceGenerator', () => ({
  generatePDF: mockGeneratePDF,
  generateDOCX: mockGenerateDOCX,
  // Also re-export the pure helpers so components (e.g., InvoicePreview) and
  // the builder can still compute totals without running the real PDF/DOCX paths.
  parseExtraAmount: (raw: string | null | undefined) => {
    if (!raw) return 0;
    const n = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  },
  sumExtrasLegalFees: (extras: { legal_fee: string }[] | undefined) => {
    if (!extras || extras.length === 0) return 0;
    return extras.reduce((sum, e) => {
      const n = parseFloat((e.legal_fee || '').replace(/[^0-9.\-]/g, ''));
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  },
}));

// ---------------------------------------------------------------------------
// Mock invoiceTracking to avoid localStorage side effects
// ---------------------------------------------------------------------------
vi.mock('../src/utils/invoiceTracking', () => ({
  markAsInvoiced: vi.fn(),
  isInvoiced: vi.fn().mockReturnValue(false),
  getInvoicedIds: vi.fn().mockReturnValue(new Set()),
}));

// ---------------------------------------------------------------------------
// Mock SummonsDetailModal to simplify rendering
// ---------------------------------------------------------------------------
vi.mock('../src/components/SummonsDetailModal', () => ({
  default: () => null,
}));

// ---------------------------------------------------------------------------
// Mock InvoicePreview to simplify rendering
// ---------------------------------------------------------------------------
vi.mock('../src/components/InvoicePreview', () => ({
  default: () => <div data-testid="invoice-preview">Preview</div>,
}));

import { MemoryRouter } from 'react-router-dom';
import { InvoiceProvider } from '../src/contexts/InvoiceContext';
import { InvoiceCartItem } from '../src/types/invoice';

// Stub the InvoiceTrackerContext — the builder calls `fetchInvoices` after
// saving edits, but in this cart-mode-only test file we never exercise that
// path. Providing a no-op avoids pulling the real context's effects and its
// dependent queries into every render.
vi.mock('../src/contexts/InvoiceTrackerContext', () => ({
  useInvoiceTracker: () => ({
    invoices: [],
    loading: false,
    error: null,
    fetchInvoices: vi.fn().mockResolvedValue(undefined),
    markAsPaid: vi.fn(),
    markAsUnpaid: vi.fn(),
    updateAlertDeadline: vi.fn(),
    updateNotes: vi.fn(),
    deleteInvoice: vi.fn(),
    getHorizonStats: vi.fn().mockReturnValue({
      overdueCount: 0,
      dueSoonCount: 0,
      paidCount: 0,
      unpaidCount: 0,
    }),
  }),
  InvoiceTrackerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import InvoiceBuilder from '../src/pages/InvoiceBuilder';

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const cartItem1: InvoiceCartItem = {
  id: 'sum-1',
  summons_number: 'SUM-001',
  respondent_name: 'Test Corp',
  clientID: 'client-1',
  violation_date: '2026-01-15T00:00:00.000Z',
  hearing_date: '2026-02-01T00:00:00.000Z',
  hearing_result: 'DEFAULT',
  status: 'CLOSED',
  amount_due: 500,
  legal_fee: 250,
  addedAt: '2026-02-01T00:00:00.000Z',
};

const cartItem2: InvoiceCartItem = {
  id: 'sum-2',
  summons_number: 'SUM-002',
  respondent_name: 'Test Corp',
  clientID: 'client-1',
  violation_date: '2026-01-20T00:00:00.000Z',
  hearing_date: '2026-02-05T00:00:00.000Z',
  hearing_result: 'GUILTY',
  status: 'CLOSED',
  amount_due: 600,
  legal_fee: 250,
  addedAt: '2026-02-01T00:00:00.000Z',
};

/**
 * Helper to set up localStorage with cart items before rendering.
 * InvoiceContext reads from localStorage on mount.
 */
function setupCart(items: InvoiceCartItem[]) {
  localStorage.setItem('oath-invoice-cart', JSON.stringify(items));
  localStorage.setItem(
    'oath-invoice-recipient',
    JSON.stringify({
      companyName: 'Test Corp',
      attention: 'John Smith',
      address: '123 Main St',
      cityStateZip: 'New York, NY 10001',
      email: 'john@test.com',
    })
  );
}

/**
 * Render InvoiceBuilder wrapped in its required providers.
 * The builder reads `editInvoiceId` from the URL via useSearchParams and
 * calls useNavigate on save, so we wrap in a MemoryRouter. The default route
 * keeps us out of edit mode.
 */
function renderBuilder() {
  return render(
    <MemoryRouter initialEntries={['/invoice-builder']}>
      <InvoiceProvider>
        <InvoiceBuilder />
      </InvoiceProvider>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InvoiceBuilder Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Default mock for getClient query
    mockGraphql.mockImplementation(({ query, variables }: any) => {
      // getClient query
      if (typeof query === 'string' && query.includes('getClient')) {
        return Promise.resolve({
          data: {
            getClient: {
              id: 'client-1',
              name: 'Test Corp',
              contact_name: 'John Smith',
              contact_address: '123 Main St',
              contact_email1: 'john@test.com',
            },
          },
        });
      }
      // invoiceSummonsItemsBySummons query - no history by default
      if (typeof query === 'string' && query.includes('invoiceSummonsesBySummonsID')) {
        return Promise.resolve({
          data: {
            invoiceSummonsesBySummonsID: { items: [], nextToken: null },
          },
        });
      }
      // updateSummons mutation
      if (typeof query === 'string' && query.includes('updateSummons')) {
        return Promise.resolve({ data: { updateSummons: { id: variables?.input?.id } } });
      }
      // createInvoice mutation
      if (typeof query === 'string' && query.includes('createInvoice(')) {
        return Promise.resolve({
          data: {
            createInvoice: { id: 'new-inv-1', invoice_number: 'INV-Test_Corp-2026-02-10' },
          },
        });
      }
      // createInvoiceSummons mutation
      if (typeof query === 'string' && query.includes('createInvoiceSummons')) {
        return Promise.resolve({
          data: { createInvoiceSummons: { id: 'join-1' } },
        });
      }
      // getSummons query
      if (typeof query === 'string' && query.includes('getSummons')) {
        return Promise.resolve({ data: { getSummons: null } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders page header with "Invoice Builder" title', () => {
    setupCart([]);
    renderBuilder();
    expect(screen.getByText('Invoice Builder')).toBeDefined();
  });

  it('shows empty cart message when no items', () => {
    setupCart([]);
    renderBuilder();
    expect(
      screen.getByText(/Your invoice cart is empty/)
    ).toBeDefined();
  });

  it('renders cart items when present', async () => {
    setupCart([cartItem1, cartItem2]);
    renderBuilder();
    await waitFor(() => {
      expect(screen.getByText('SUM-001')).toBeDefined();
      expect(screen.getByText('SUM-002')).toBeDefined();
    });
  });

  it('renders the alert deadline DatePicker', async () => {
    setupCart([cartItem1]);
    renderBuilder();
    await waitFor(() => {
      expect(screen.getByText('Payment Alert Deadline')).toBeDefined();
    });
    // The DatePicker text field with placeholder should be present
    expect(screen.getByPlaceholderText('Select deadline...')).toBeDefined();
  });

  it('renders previously-invoiced indicators when history exists', async () => {
    // Set up invoice history for sum-1
    mockGraphql.mockImplementation(({ query }: any) => {
      if (typeof query === 'string' && query.includes('getClient')) {
        return Promise.resolve({
          data: {
            getClient: {
              id: 'client-1',
              name: 'Test Corp',
              contact_name: 'John Smith',
              contact_address: '123 Main St',
              contact_email1: 'john@test.com',
            },
          },
        });
      }
      if (typeof query === 'string' && query.includes('invoiceSummonsesBySummonsID')) {
        return Promise.resolve({
          data: {
            invoiceSummonsesBySummonsID: {
              items: [
                {
                  id: 'join-prev',
                  invoiceID: 'inv-prev',
                  summonsID: 'sum-1',
                  summons_number: 'SUM-001',
                  legal_fee: 250,
                  amount_due: 500,
                  invoice: {
                    id: 'inv-prev',
                    invoice_number: 'INV-Prev',
                    invoice_date: '2026-01-15T00:00:00.000Z',
                    payment_status: 'unpaid',
                    payment_date: null,
                  },
                },
              ],
              nextToken: null,
            },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    setupCart([cartItem1]);
    renderBuilder();

    // Wait for the previously-invoiced chip to appear
    await waitFor(() => {
      expect(screen.getByText(/Invoiced 1\/15\/26/)).toBeDefined();
    });
  });

  it('renders paid indicator for previously-paid summons', async () => {
    mockGraphql.mockImplementation(({ query }: any) => {
      if (typeof query === 'string' && query.includes('getClient')) {
        return Promise.resolve({
          data: {
            getClient: {
              id: 'client-1',
              name: 'Test Corp',
              contact_name: 'John Smith',
              contact_address: '123 Main St',
              contact_email1: 'john@test.com',
            },
          },
        });
      }
      if (typeof query === 'string' && query.includes('invoiceSummonsesBySummonsID')) {
        return Promise.resolve({
          data: {
            invoiceSummonsesBySummonsID: {
              items: [
                {
                  id: 'join-paid',
                  invoiceID: 'inv-paid',
                  summonsID: 'sum-1',
                  summons_number: 'SUM-001',
                  legal_fee: 250,
                  amount_due: 500,
                  invoice: {
                    id: 'inv-paid',
                    invoice_number: 'INV-Paid',
                    invoice_date: '2026-01-10T00:00:00.000Z',
                    payment_status: 'paid',
                    payment_date: '2026-01-20T00:00:00.000Z',
                  },
                },
              ],
              nextToken: null,
            },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    setupCart([cartItem1]);
    renderBuilder();

    await waitFor(() => {
      expect(screen.getByText(/Paid 1\/20\/26/)).toBeDefined();
    });
  });

  it('calls createInvoiceRecord mutation on PDF generate', async () => {
    setupCart([cartItem1]);
    renderBuilder();

    // Wait for cart items to load
    await waitFor(() => {
      expect(screen.getByText('SUM-001')).toBeDefined();
    });

    // Stub window.confirm for clearCart dialog
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    // Click Generate PDF
    const generateBtn = screen.getByText('Generate PDF');
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(mockGeneratePDF).toHaveBeenCalled();
    });

    // Verify that createInvoice mutation was called
    await waitFor(() => {
      const calls = mockGraphql.mock.calls;
      const createInvoiceCall = calls.find(
        (call: any[]) => typeof call[0]?.query === 'string' && call[0].query.includes('createInvoice(')
      );
      expect(createInvoiceCall).toBeDefined();

      // Verify the input includes expected fields
      const input = createInvoiceCall![0].variables.input;
      expect(input.recipient_company).toBe('Test Corp');
      expect(input.payment_status).toBe('unpaid');
      expect(input.item_count).toBe(1);
      expect(input.total_legal_fees).toBe(250);
    });
  });

  it('calls createInvoiceSummons for each cart item after invoice creation', async () => {
    setupCart([cartItem1, cartItem2]);
    renderBuilder();

    await waitFor(() => {
      expect(screen.getByText('SUM-001')).toBeDefined();
    });

    vi.spyOn(window, 'alert').mockImplementation(() => {});

    fireEvent.click(screen.getByText('Generate PDF'));

    await waitFor(() => {
      expect(mockGeneratePDF).toHaveBeenCalled();
    });

    // Verify createInvoiceSummons was called for each item
    await waitFor(() => {
      const calls = mockGraphql.mock.calls;
      const joinCalls = calls.filter(
        (call: any[]) => typeof call[0]?.query === 'string' && call[0].query.includes('createInvoiceSummons')
      );
      expect(joinCalls.length).toBe(2);
    });
  });

  it('shows success dialog after generation', async () => {
    setupCart([cartItem1]);
    renderBuilder();

    await waitFor(() => {
      expect(screen.getByText('SUM-001')).toBeDefined();
    });

    vi.spyOn(window, 'alert').mockImplementation(() => {});

    fireEvent.click(screen.getByText('Generate PDF'));

    await waitFor(() => {
      expect(screen.getByText('Invoice Generated')).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Editable Hearing Status + Results cells
  // -------------------------------------------------------------------------

  it('Hearing Status cell is editable and reflects typed value', async () => {
    setupCart([cartItem1]);
    renderBuilder();

    // Wait for the row to render.
    await waitFor(() => {
      expect(screen.getByText('SUM-001')).toBeDefined();
    });

    // Locate the Hearing Status input by its initial displayed value.
    const statusInput = screen.getByDisplayValue(cartItem1.status) as HTMLInputElement;
    // Edit to a value that's distinct from cartItem1.hearing_result so the
    // subsequent lookup uniquely identifies the status input.
    fireEvent.change(statusInput, { target: { value: 'UPDATED_STATUS' } });

    expect((screen.getByDisplayValue('UPDATED_STATUS') as HTMLInputElement).value).toBe('UPDATED_STATUS');
  });

  it('Results cell is editable and reflects typed value', async () => {
    setupCart([cartItem1]);
    renderBuilder();

    await waitFor(() => {
      expect(screen.getByText('SUM-001')).toBeDefined();
    });

    // cartItem1.hearing_result === 'DEFAULT'. Use a unique seed for Status to
    // avoid ambiguity with the Results cell; cartItem1.status === 'CLOSED' is
    // different from its hearing_result, so getByDisplayValue resolves cleanly.
    const resultInput = screen.getByDisplayValue(cartItem1.hearing_result!) as HTMLInputElement;
    fireEvent.change(resultInput, { target: { value: 'Granted' } });

    expect((screen.getByDisplayValue('Granted') as HTMLInputElement).value).toBe('Granted');
  });

  it('passes edited Hearing Status + Results values into generatePDF', async () => {
    setupCart([cartItem1]);
    renderBuilder();

    await waitFor(() => {
      expect(screen.getByText('SUM-001')).toBeDefined();
    });

    // Capture BOTH inputs before editing either — editing one can make the
    // other's value-based lookup ambiguous if we collide on a display value.
    const statusInput = screen.getByDisplayValue(cartItem1.status) as HTMLInputElement;
    const resultInput = screen.getByDisplayValue(cartItem1.hearing_result!) as HTMLInputElement;

    fireEvent.change(statusInput, { target: { value: 'UPDATED_STATUS' } });
    fireEvent.change(resultInput, { target: { value: 'Granted' } });

    // Silence any alert() calls inside the generate path (the mocked
    // generatePDF returns undefined, so the destructure downstream will throw;
    // the test only needs to verify the call reached the generator with the
    // correct items).
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    fireEvent.click(screen.getByText('Generate PDF'));

    // Wait until generatePDF has been invoked.
    await waitFor(() => {
      expect(mockGeneratePDF).toHaveBeenCalled();
    });

    // Inspect the items array that was passed to generatePDF. The edited
    // values must propagate to the PDF generator — this is the core contract.
    const callArgs = mockGeneratePDF.mock.calls[0];
    const itemsPassedToPDF = callArgs[0] as InvoiceCartItem[];
    expect(itemsPassedToPDF).toHaveLength(1);
    expect(itemsPassedToPDF[0].status).toBe('UPDATED_STATUS');
    expect(itemsPassedToPDF[0].hearing_result).toBe('Granted');
  });

  // -------------------------------------------------------------------------
  // Edit-mode "Add Summonses" picker: checkbox toggles selection
  //
  // Regression: previously both TableRow.onClick and Checkbox.onChange called
  // the same toggle, so clicking the checkbox fired both (via bubbling) and
  // the two toggles cancelled out. The fix adds stopPropagation on the cell.
  // -------------------------------------------------------------------------
  it('enables the "Add to Invoice" button when a picker checkbox is clicked', async () => {
    // Dedicated mock wiring for edit mode: getInvoiceWithItems, getSummons,
    // and summonsesByClientForPicker all need to resolve.
    mockGraphql.mockImplementation(({ query }: any) => {
      if (typeof query === 'string' && query.includes('getInvoice(')) {
        return Promise.resolve({
          data: {
            getInvoice: {
              id: 'inv-edit-1',
              invoice_number: 'INV-Test_Corp-2026-02-10',
              invoice_date: '2026-02-10T00:00:00.000Z',
              clientID: 'client-1',
              recipient_company: 'Test Corp',
              recipient_attention: 'John Smith',
              recipient_address: '123 Main St',
              recipient_email: 'john@test.com',
              alert_deadline: null,
              payment_status: 'unpaid',
              items: {
                items: [
                  {
                    id: 'join-1',
                    summonsID: 'sum-1',
                    summons_number: 'SUM-001',
                    legal_fee: 250,
                    amount_due: 500,
                  },
                ],
              },
            },
          },
        });
      }
      if (typeof query === 'string' && query.includes('getSummons')) {
        return Promise.resolve({
          data: {
            getSummons: {
              id: 'sum-1',
              clientID: 'client-1',
              respondent_name: 'Test Corp',
              violation_date: '2026-01-15T00:00:00.000Z',
              hearing_date: '2026-02-01T00:00:00.000Z',
              hearing_result: 'DEFAULT',
              status: 'CLOSED',
              amount_due: 500,
            },
          },
        });
      }
      if (typeof query === 'string' && query.includes('summonsByClientIDAndHearing_date')) {
        return Promise.resolve({
          data: {
            summonsByClientIDAndHearing_date: {
              items: [
                {
                  id: 'sum-candidate-1',
                  clientID: 'client-1',
                  summons_number: 'SUM-999',
                  respondent_name: 'Test Corp',
                  hearing_date: '2026-03-01T00:00:00.000Z',
                  hearing_result: null,
                  status: 'OPEN',
                  violation_date: '2026-02-15T00:00:00.000Z',
                  amount_due: 750,
                  is_invoiced: false,
                  invoice_date: null,
                },
              ],
            },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(
      <MemoryRouter initialEntries={['/invoice-builder?editInvoiceId=inv-edit-1']}>
        <InvoiceProvider>
          <InvoiceBuilder />
        </InvoiceProvider>
      </MemoryRouter>
    );

    // Wait for edit mode hydration: the "Add Summonses" button only renders
    // once the invoice has loaded.
    const addBtn = await screen.findByRole('button', { name: /Add Summonses/i });
    fireEvent.click(addBtn);

    // Picker opens and lists the candidate.
    await waitFor(() => {
      expect(screen.getByText('SUM-999')).toBeDefined();
    });

    // Before click: confirm button reads "Add to Invoice" (no count) and is disabled.
    const confirmBtn = screen.getByRole('button', { name: /Add to Invoice/i }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    // Click the row's checkbox. With the old double-toggle bug, this click
    // would net to zero and the button would stay disabled.
    const checkbox = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
    fireEvent.click(checkbox);

    // After fix: exactly one toggle fires, selection size is 1, button enables
    // and its label reflects the count.
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Add 1 to Invoice/i }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
  });
});
