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
// generatePDF / generateDOCX must resolve with { blob, filename } — the caller
// destructures both fields immediately. Returning undefined throws and aborts
// the rest of the generate flow (mutations, success dialog, etc.).
const mockGeneratePDF = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ blob: new Blob(['pdf']), filename: 'test.pdf' })
);
const mockGenerateDOCX = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ blob: new Blob(['docx']), filename: 'test.docx' })
);

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

/** Minimal shape of an Amplify graphql() call, for inspecting mock invocations. */
type GqlCall = {
  query: string;
  variables?: {
    id?: string;
    nextToken?: string | null;
    input?: { id?: string; item_count?: number; total_legal_fees?: number };
  };
};

// The one join row the edit-mode fixtures describe, served via the byInvoice GSI
// fake (see wireEditModeMocks). amount_due is the snapshot frozen at invoice
// creation; the live getSummons value is deliberately different so the
// fine-precedence rule is observable.
const EDIT_MODE_JOIN_ROWS = [
  {
    id: 'join-1',
    invoiceID: 'inv-edit-1',
    summonsID: 'sum-1',
    summons_number: 'SUM-001',
    legal_fee: 250,
    amount_due: 500,
    highlighted: false,
  },
];

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

      // Bug 2 fix: editable footer fields must round-trip to the DB. They
      // default to FOOTER_TEXT.* values but must be present on every create.
      expect(typeof input.payment_instructions).toBe('string');
      expect(input.payment_instructions.length).toBeGreaterThan(0);
      expect(typeof input.review_text).toBe('string');
      expect(input.review_text.length).toBeGreaterThan(0);
      expect(typeof input.overdue_text).toBe('string');
      expect(input.overdue_text.length).toBeGreaterThan(0);
      expect(input.show_overdue).toBe(true);
      // additional_notes defaults to empty string -> persisted as null
      expect(input.additional_notes).toBeNull();
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
      // The edit screen reads its line items from the byInvoice GSI now — the
      // invoice.items.items connection is capped at 100 rows by its resolver, so
      // it can never be trusted as a complete list.
      if (
        typeof query === 'string' &&
        query.includes('invoiceSummonsByInvoiceIDAndSummonsID')
      ) {
        return Promise.resolve({
          data: {
            invoiceSummonsByInvoiceIDAndSummonsID: {
              items: EDIT_MODE_JOIN_ROWS,
              nextToken: null,
            },
          },
        });
      }
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

  // -------------------------------------------------------------------------
  // Edit-mode fine auto-refresh
  //
  // Jacky's bug: an invoice line item snapshots Summons.amount_due at creation,
  // but the daily sweep keeps the live summons fine current. Revising an invoice
  // must reflect today's fine, not the stale snapshot. The hydration prefers the
  // live summons value (s?.amount_due) over the stored join row (j.amount_due),
  // falling back to the snapshot only when the summons is gone.
  // -------------------------------------------------------------------------

  /**
   * Wire edit-mode mocks: the stored InvoiceSummons join row carries the frozen
   * snapshot (500), while the live getSummons returns `liveAmountDue`. Pass null
   * for the summons to simulate an archived/deleted record.
   */
  function wireEditModeMocks(liveAmountDue: number | null, summonsExists = true) {
    mockGraphql.mockImplementation(({ query }: any) => {
      // The edit screen reads its line items from the byInvoice GSI now — the
      // invoice.items.items connection is capped at 100 rows by its resolver, so
      // it can never be trusted as a complete list.
      if (
        typeof query === 'string' &&
        query.includes('invoiceSummonsByInvoiceIDAndSummonsID')
      ) {
        return Promise.resolve({
          data: {
            invoiceSummonsByInvoiceIDAndSummonsID: {
              items: EDIT_MODE_JOIN_ROWS,
              nextToken: null,
            },
          },
        });
      }
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
                    amount_due: 500, // snapshot frozen at invoice creation
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
            getSummons: summonsExists
              ? {
                  id: 'sum-1',
                  clientID: 'client-1',
                  respondent_name: 'Test Corp',
                  violation_date: '2026-01-15T00:00:00.000Z',
                  hearing_date: '2026-02-01T00:00:00.000Z',
                  hearing_result: 'DEFAULT',
                  status: 'CLOSED',
                  amount_due: liveAmountDue, // live fine, post-sweep
                }
              : null,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
  }

  it('keeps the fine SAVED on the invoice and does not repopulate it from the live summons', async () => {
    // Jacky's bug: she had adjusted this fine to $500 on the invoice; the live
    // NYC balance later moved to $200. Reopening to edit must NOT overwrite her
    // saved $500 — the value she deliberately set has to stick.
    wireEditModeMocks(200);

    render(
      <MemoryRouter initialEntries={['/invoice-builder?editInvoiceId=inv-edit-1']}>
        <InvoiceProvider>
          <InvoiceBuilder />
        </InvoiceProvider>
      </MemoryRouter>
    );

    // Wait for edit-mode hydration.
    await screen.findByRole('button', { name: /Add Summonses/i });

    // The line-item fine input shows the saved 500, NOT the live 200...
    await waitFor(() => {
      expect(screen.getByDisplayValue('500')).toBeDefined();
    });
    expect(screen.queryByDisplayValue('200')).toBeNull();

    // ...and the Total Fines Due reflects the saved value, not the live balance.
    expect(screen.getByText('$500.00')).toBeDefined();
    expect(screen.queryByText('$200.00')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Truncation regression — the CORPORATE EXPRESS edit bug
  //
  // Invoice f309f597 has 214 join rows in DynamoDB. The edit screen used to read
  // them from invoice.items.items, whose resolver hardcodes a 100-row cap, so it
  // loaded 100 and Raj reported "half the violations I billed were missing".
  // Saving from that state would have written item_count: 100, recomputed the fee
  // total from 100 rows, and overwritten the stored document.
  // -------------------------------------------------------------------------

  /** Wire a large invoice: `total` join rows served over the GSI in 100-row pages. */
  function wireLargeInvoiceMocks(total: number, storedItemCount = total) {
    const allRows = Array.from({ length: total }, (_, i) => ({
      id: `join-${i}`,
      invoiceID: 'inv-big',
      summonsID: `sum-${i}`,
      summons_number: `SUM-${String(i).padStart(4, '0')}`,
      legal_fee: 100,
      amount_due: 0,
      highlighted: false,
    }));
    const pages: (typeof allRows)[] = [];
    for (let i = 0; i < total; i += 100) pages.push(allRows.slice(i, i + 100));

    mockGraphql.mockImplementation(({ query, variables }: GqlCall) => {
      if (typeof query === 'string' && query.includes('invoiceSummonsByInvoiceIDAndSummonsID')) {
        const idx = variables?.nextToken ? Number(variables.nextToken) : 0;
        return Promise.resolve({
          data: {
            invoiceSummonsByInvoiceIDAndSummonsID: {
              items: pages[idx] ?? [],
              nextToken: idx + 1 < pages.length ? String(idx + 1) : null,
            },
          },
        });
      }
      if (typeof query === 'string' && query.includes('getInvoice(')) {
        return Promise.resolve({
          data: {
            getInvoice: {
              id: 'inv-big',
              invoice_number: 'INV-CORPORATE_EXPRESS_IN-2026-09-02',
              invoice_date: '2026-09-02T17:08:47.103Z',
              clientID: 'client-1',
              recipient_company: 'CORPORATE EXPRESS INC',
              recipient_attention: null,
              recipient_address: 'PO BOX 144',
              recipient_email: null,
              alert_deadline: null,
              payment_status: 'unpaid',
              item_count: storedItemCount,
              total_legal_fees: total * 100,
              total_fines_due: 0,
              // The decoy: what the capped connection would have returned.
              items: { items: allRows.slice(0, 100) },
            },
          },
        });
      }
      if (typeof query === 'string' && query.includes('getSummons')) {
        return Promise.resolve({
          data: {
            getSummons: {
              id: variables?.id ?? 'sum-0',
              clientID: 'client-1',
              respondent_name: 'CORPORATE EXPRESS INC',
              violation_date: '2025-03-28T00:00:00.000Z',
              hearing_date: '2027-04-12T00:00:00.000Z',
              hearing_result: null,
              status: 'RESCHEDULED',
              amount_due: 0,
            },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
    return { allRows };
  }

  const renderEdit = (invoiceId: string) =>
    render(
      <MemoryRouter initialEntries={[`/invoice-builder?editInvoiceId=${invoiceId}`]}>
        <InvoiceProvider>
          <InvoiceBuilder />
        </InvoiceProvider>
      </MemoryRouter>
    );

  it('loads every line item in edit mode, not the 100 the items connection returns', async () => {
    wireLargeInvoiceMocks(120);
    renderEdit('inv-big');

    await screen.findByRole('button', { name: /Add Summonses/i });

    // Rows beyond index 99 lived past the cap that used to truncate this list.
    await screen.findByText('SUM-0119', {}, { timeout: 20000 });
    expect(screen.getByText('SUM-0000')).toBeDefined();
    // The row that sat exactly at the old boundary is there too.
    expect(screen.getByText('SUM-0100')).toBeDefined();
  }, 30000);

  it('saves the full item_count for a >100-item invoice', async () => {
    wireLargeInvoiceMocks(120);
    renderEdit('inv-big');

    await screen.findByRole('button', { name: /Add Summonses/i });
    await screen.findByText('SUM-0119', {}, { timeout: 20000 });

    vi.spyOn(window, 'alert').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    // The Invoice record must be updated with all 120, never a truncated 100.
    await waitFor(
      () => {
        const updateCall = mockGraphql.mock.calls.find(
          ([arg]: [GqlCall]) =>
            typeof arg?.query === 'string' &&
            arg.query.includes('UpdateInvoiceRecord') &&
            arg.variables?.input?.id === 'inv-big'
        );
        expect(updateCall).toBeDefined();
        expect(updateCall[0].variables.input.item_count).toBe(120);
        expect(updateCall[0].variables.input.total_legal_fees).toBe(12000);
      },
      { timeout: 20000 }
    );
  }, 30000);

  it('refuses to save when fewer items loaded than the invoice record claims', async () => {
    // Belt-and-braces guard: the GSI hands back 100 rows but the record says 214,
    // so we loaded a partial invoice. Saving would silently drop 114 line items.
    wireLargeInvoiceMocks(100, 214);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderEdit('inv-big');

    await screen.findByRole('button', { name: /Add Summonses/i });
    await screen.findByText('SUM-0099', {}, { timeout: 20000 });

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(
      () => {
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('100 of 214'));
      },
      { timeout: 20000 }
    );
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Refusing to save'));

    // Nothing was written.
    const wrote = mockGraphql.mock.calls.some(
      ([arg]: [GqlCall]) =>
        typeof arg?.query === 'string' &&
        (arg.query.includes('UpdateInvoiceRecord') ||
          arg.query.includes('DeleteInvoiceSummonsRecord') ||
          arg.query.includes('CreateInvoiceSummonsRecord'))
    );
    expect(wrote).toBe(false);

    alertSpy.mockRestore();
    errorSpy.mockRestore();
  }, 30000);

  it('keeps the stored snapshot fine when the live summons is missing', async () => {
    // Summons archived/deleted — getSummons resolves null. Fall back to snapshot 500.
    wireEditModeMocks(null, false);

    render(
      <MemoryRouter initialEntries={['/invoice-builder?editInvoiceId=inv-edit-1']}>
        <InvoiceProvider>
          <InvoiceBuilder />
        </InvoiceProvider>
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: /Add Summonses/i });

    await waitFor(() => {
      expect(screen.getByDisplayValue('500')).toBeDefined();
    });
    expect(screen.getByText('$500.00')).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Clearing a fine persists 0 (removed), never null
  //
  // Jacky's remaining bug: she removes a fine by CLEARING the cell. That used to
  // store null, which buildInvoiceDocInputs refills from the live NYC balance on
  // the next edit (the null -> live fallback is intentional for never-set lines),
  // so the fine reappeared. Clearing must now persist the removed-fine sentinel
  // 0, which wins over the live balance and sticks on reopen. This drives the
  // same handleAmountDueChange path (build-mode branch -> updateAmountDue(id, 0))
  // and inspects the join row written on generate.
  // -------------------------------------------------------------------------
  it('persists a cleared fine as 0 (removed), not null, so it does not repopulate', async () => {
    setupCart([cartItem1]); // amount_due starts at 500
    renderBuilder();

    await waitFor(() => {
      expect(screen.getByText('SUM-001')).toBeDefined();
    });

    // Clear the FINE DUE cell (initial value 500).
    const fineInput = screen.getByDisplayValue('500') as HTMLInputElement;
    fireEvent.change(fineInput, { target: { value: '' } });

    // A removed fine (0) renders blank, not "0" (`|| ''` in the input value).
    expect(fineInput.value).toBe('');

    vi.spyOn(window, 'alert').mockImplementation(() => {});
    fireEvent.click(screen.getByText('Generate PDF'));

    await waitFor(() => {
      expect(mockGeneratePDF).toHaveBeenCalled();
    });

    // The join row persisted for this summons carries amount_due 0 — the removed
    // sentinel — NOT null (which would repopulate) and NOT the original 500.
    await waitFor(() => {
      const joinCall = mockGraphql.mock.calls.find(
        (call: any[]) =>
          typeof call[0]?.query === 'string' && call[0].query.includes('createInvoiceSummons')
      );
      expect(joinCall).toBeDefined();
      expect(joinCall![0].variables.input.amount_due).toBe(0);
    });

    // ...and the value handed to the generator is 0, not null/500.
    const itemsPassedToPDF = mockGeneratePDF.mock.calls[0][0] as InvoiceCartItem[];
    expect(itemsPassedToPDF[0].amount_due).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Recipient never carries over the previous client / never goes blank
  //
  // Jacky's bug: invoicing JLSHM, then building an invoice for George
  // Hildebrandt showed "JLSHM" as the company name (Symptom 1); after logging
  // out and back in it went blank (Symptom 2). Root cause: the recipient
  // auto-fill effect only ever *overwrote* the company name when the client
  // record resolved — on the "not loaded / didn't resolve" branch it did
  // nothing, so the stale (or empty) localStorage value survived. The fix makes
  // the recipient a deterministic function of the active client with a fallback
  // to the summons' respondent_name. These tests drive the real component along
  // Jacky's exact path and would FAIL under the old effect.
  // -------------------------------------------------------------------------

  // George's cart item with a distinct respondent_name — the fallback company
  // name when his Client record can't be resolved.
  const georgeItem: InvoiceCartItem = {
    id: 'sum-george',
    summons_number: 'SUM-G01',
    respondent_name: 'GEORGE HILDEBRANDT TRUCKING',
    clientID: 'client-george',
    violation_date: '2026-01-15T00:00:00.000Z',
    hearing_date: '2026-02-01T00:00:00.000Z',
    hearing_result: 'DEFAULT',
    status: 'CLOSED',
    amount_due: 500,
    legal_fee: 250,
    addedAt: '2026-02-01T00:00:00.000Z',
  };

  // Seed a STALE recipient from a previous invoice (JLSHM) plus George's item.
  // InvoiceContext rehydrates the recipient from localStorage on mount, exactly
  // as it did across Jacky's logout/login.
  function setupGeorgeCartWithStaleJlshm() {
    localStorage.setItem('oath-invoice-cart', JSON.stringify([georgeItem]));
    localStorage.setItem(
      'oath-invoice-recipient',
      JSON.stringify({
        companyName: 'JLSHM',
        attention: 'Old Attn',
        address: '999 Old Rd',
        cityStateZip: 'Oldtown NY 11111',
        email: 'old@jlshm.com',
      })
    );
  }

  it('uses the summons company name (never stale JLSHM / never blank) when the client record does not resolve', async () => {
    // George's Client record cannot be loaded — getClient resolves null.
    mockGraphql.mockImplementation(({ query }: any) => {
      if (typeof query === 'string' && query.includes('getClient')) {
        return Promise.resolve({ data: { getClient: null } });
      }
      if (typeof query === 'string' && query.includes('invoiceSummonsesBySummonsID')) {
        return Promise.resolve({
          data: { invoiceSummonsesBySummonsID: { items: [], nextToken: null } },
        });
      }
      return Promise.resolve({ data: {} });
    });

    setupGeorgeCartWithStaleJlshm();
    renderBuilder();

    // The Company Name field falls back to the summons name — NOT the stale
    // JLSHM value rehydrated from localStorage, and not blank.
    await waitFor(() => {
      expect(screen.getByDisplayValue('GEORGE HILDEBRANDT TRUCKING')).toBeDefined();
    });
    expect(screen.queryByDisplayValue('JLSHM')).toBeNull();

    // And the fallback is surfaced so a genuinely broken client isn't masked.
    expect(
      screen.getByText(/Client details couldn't be loaded/i)
    ).toBeDefined();
  });

  it('auto-fills the active client and drops the previous client when the record resolves', async () => {
    // George's Client record resolves normally.
    mockGraphql.mockImplementation(({ query }: any) => {
      if (typeof query === 'string' && query.includes('getClient')) {
        return Promise.resolve({
          data: {
            getClient: {
              id: 'client-george',
              name: 'George Hildebrandt',
              contact_name: 'George H.',
              contact_address: '12 Depot Lane\nAlbany NY 12207',
              contact_email1: 'george@ghtruck.com',
            },
          },
        });
      }
      if (typeof query === 'string' && query.includes('invoiceSummonsesBySummonsID')) {
        return Promise.resolve({
          data: { invoiceSummonsesBySummonsID: { items: [], nextToken: null } },
        });
      }
      return Promise.resolve({ data: {} });
    });

    setupGeorgeCartWithStaleJlshm();
    renderBuilder();

    // Company name becomes George's, the stale JLSHM is gone, and the full
    // address block fills from the resolved client (no leftover Old Rd values).
    await waitFor(() => {
      expect(screen.getByDisplayValue('George Hildebrandt')).toBeDefined();
    });
    expect(screen.queryByDisplayValue('JLSHM')).toBeNull();
    expect(screen.getByDisplayValue('12 Depot Lane')).toBeDefined();
    expect(screen.getByDisplayValue('Albany NY 12207')).toBeDefined();
    expect(screen.queryByDisplayValue('999 Old Rd')).toBeNull();
  });
});
