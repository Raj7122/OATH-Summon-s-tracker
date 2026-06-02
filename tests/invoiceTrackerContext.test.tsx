/**
 * @vitest-environment jsdom
 *
 * Invoice Tracker Context Tests
 * Tests for data fetching, state management, and GraphQL mutations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { InvoiceTrackerProvider, useInvoiceTracker } from '../src/contexts/InvoiceTrackerContext';

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

const mockInvoice1 = {
  id: 'inv-1',
  invoice_number: 'INV-Test-2026-01-15',
  invoice_date: '2026-01-15T00:00:00.000Z',
  recipient_company: 'Test Corp',
  total_legal_fees: 250,
  total_fines_due: 500,
  item_count: 1,
  payment_status: 'unpaid',
  payment_date: null,
  alert_deadline: '2026-01-22T00:00:00.000Z',
  notes: null,
  clientID: 'c1',
  items: { items: [] },
  createdAt: '2026-01-15T00:00:00.000Z',
  updatedAt: '2026-01-15T00:00:00.000Z',
};

const mockInvoice2 = {
  id: 'inv-2',
  invoice_number: 'INV-Test2-2026-02-01',
  invoice_date: '2026-02-01T00:00:00.000Z',
  recipient_company: 'Corp Two',
  total_legal_fees: 500,
  total_fines_due: 1000,
  item_count: 2,
  payment_status: 'paid',
  payment_date: '2026-02-05T00:00:00.000Z',
  alert_deadline: '2026-02-08T00:00:00.000Z',
  notes: 'Payment received',
  clientID: 'c2',
  items: { items: [] },
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-05T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  return <InvoiceTrackerProvider>{children}</InvoiceTrackerProvider>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InvoiceTrackerContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw when used outside provider', () => {
    // Suppress React error boundary console output
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      renderHook(() => useInvoiceTracker());
    }).toThrow('useInvoiceTracker must be used within an InvoiceTrackerProvider');
    consoleSpy.mockRestore();
  });

  it('should fetch invoices on mount', async () => {
    mockGraphql.mockResolvedValueOnce({
      data: {
        listInvoices: {
          items: [mockInvoice1, mockInvoice2],
          nextToken: null,
        },
      },
    });

    const { result } = renderHook(() => useInvoiceTracker(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.invoices).toHaveLength(2);
    expect(result.current.error).toBeNull();
    expect(mockGraphql).toHaveBeenCalledTimes(1);
  });

  it('should handle paginated fetches', async () => {
    mockGraphql
      .mockResolvedValueOnce({
        data: {
          listInvoices: {
            items: [mockInvoice1],
            nextToken: 'page2-token',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          listInvoices: {
            items: [mockInvoice2],
            nextToken: null,
          },
        },
      });

    const { result } = renderHook(() => useInvoiceTracker(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.invoices).toHaveLength(2);
    expect(mockGraphql).toHaveBeenCalledTimes(2);
  });

  it('should set error on fetch failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGraphql.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useInvoiceTracker(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to load invoices');
    expect(result.current.invoices).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  it('should mark invoice as paid with optimistic update', async () => {
    mockGraphql
      .mockResolvedValueOnce({
        data: {
          listInvoices: {
            items: [{ ...mockInvoice1 }],
            nextToken: null,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          updateInvoice: { id: 'inv-1', payment_status: 'paid', payment_date: '2026-02-10T00:00:00.000Z' },
        },
      });

    const { result } = renderHook(() => useInvoiceTracker(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.markAsPaid('inv-1', '2026-02-10T00:00:00.000Z');
    });

    expect(result.current.invoices[0].payment_status).toBe('paid');
    expect(result.current.invoices[0].payment_date).toBe('2026-02-10T00:00:00.000Z');
  });

  it('should mark invoice as unpaid with optimistic update', async () => {
    mockGraphql
      .mockResolvedValueOnce({
        data: {
          listInvoices: {
            items: [{ ...mockInvoice2 }],
            nextToken: null,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          updateInvoice: { id: 'inv-2', payment_status: 'unpaid', payment_date: null },
        },
      });

    const { result } = renderHook(() => useInvoiceTracker(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.markAsUnpaid('inv-2');
    });

    expect(result.current.invoices[0].payment_status).toBe('unpaid');
    expect(result.current.invoices[0].payment_date).toBeNull();
  });

  it('should update alert deadline with optimistic update', async () => {
    mockGraphql
      .mockResolvedValueOnce({
        data: {
          listInvoices: {
            items: [{ ...mockInvoice1 }],
            nextToken: null,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          updateInvoice: { id: 'inv-1', alert_deadline: '2026-02-15T00:00:00.000Z' },
        },
      });

    const { result } = renderHook(() => useInvoiceTracker(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateAlertDeadline('inv-1', '2026-02-15T00:00:00.000Z');
    });

    expect(result.current.invoices[0].alert_deadline).toBe('2026-02-15T00:00:00.000Z');
  });

  it('should update notes with optimistic update', async () => {
    mockGraphql
      .mockResolvedValueOnce({
        data: {
          listInvoices: {
            items: [{ ...mockInvoice1 }],
            nextToken: null,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          updateInvoice: { id: 'inv-1', notes: 'Follow up needed' },
        },
      });

    const { result } = renderHook(() => useInvoiceTracker(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.updateNotes('inv-1', 'Follow up needed');
    });

    expect(result.current.invoices[0].notes).toBe('Follow up needed');
  });

  it('should propagate error when mutation fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGraphql
      .mockResolvedValueOnce({
        data: {
          listInvoices: {
            items: [{ ...mockInvoice1 }],
            nextToken: null,
          },
        },
      })
      .mockRejectedValueOnce(new Error('Mutation failed'));

    const { result } = renderHook(() => useInvoiceTracker(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let caughtError: Error | null = null;
    await act(async () => {
      try {
        await result.current.markAsPaid('inv-1', '2026-02-10T00:00:00.000Z');
      } catch (err) {
        caughtError = err as Error;
      }
    });

    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toBe('Mutation failed');
    consoleSpy.mockRestore();
  });

  it('should compute horizon stats correctly', async () => {
    // Both invoices have deadlines in the past relative to the real current date (2026-03-29),
    // so mockInvoice1 (unpaid, deadline 2026-01-22) will be overdue
    // and mockInvoice2 (paid) will be counted as paid
    mockGraphql.mockResolvedValueOnce({
      data: {
        listInvoices: {
          items: [
            { ...mockInvoice1 },
            { ...mockInvoice2 },
          ],
          nextToken: null,
        },
      },
    });

    const { result } = renderHook(() => useInvoiceTracker(), { wrapper });

    await waitFor(() => {
      expect(result.current.invoices).toHaveLength(2);
    });

    const stats = result.current.getHorizonStats();
    expect(stats.overdueCount).toBe(1);
    expect(stats.paidCount).toBe(1);
    expect(stats.unpaidCount).toBe(1);
    expect(stats.dueSoonCount).toBe(0);
  });

  it('should re-fetch invoices when fetchInvoices is called again', async () => {
    mockGraphql
      .mockResolvedValueOnce({
        data: {
          listInvoices: {
            items: [{ ...mockInvoice1 }],
            nextToken: null,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          listInvoices: {
            items: [{ ...mockInvoice1 }, { ...mockInvoice2 }],
            nextToken: null,
          },
        },
      });

    const { result } = renderHook(() => useInvoiceTracker(), { wrapper });

    await waitFor(() => {
      expect(result.current.invoices).toHaveLength(1);
    });

    await act(async () => {
      await result.current.fetchInvoices();
    });

    expect(result.current.invoices).toHaveLength(2);
  });
});
