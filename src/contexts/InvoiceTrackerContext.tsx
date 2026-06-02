/**
 * Invoice Tracker Context
 *
 * Manages persistent invoice tracking state via AWS Amplify GraphQL.
 * Separate from InvoiceContext (which handles the cart/generation workflow).
 * This context handles the read/update path for tracking invoices after creation.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import { Invoice, InvoiceHorizonStats } from '../types/invoiceTracker';
import { listInvoicesWithItems, updateInvoiceRecord, deleteInvoiceRecord, deleteInvoiceSummonsRecord } from '../graphql/customQueries';
import { isOverdue, isDueSoon } from '../utils/invoiceTrackerHelpers';

const client = generateClient();
const MAX_FETCHES = 50;

interface InvoiceTrackerContextType {
  invoices: Invoice[];
  loading: boolean;
  error: string | null;
  fetchInvoices: () => Promise<void>;
  markAsPaid: (invoiceId: string, paymentDate: string) => Promise<void>;
  markAsUnpaid: (invoiceId: string) => Promise<void>;
  updateAlertDeadline: (invoiceId: string, newDeadline: string) => Promise<void>;
  updateNotes: (invoiceId: string, notes: string) => Promise<void>;
  deleteInvoice: (invoice: Invoice) => Promise<void>;
  getHorizonStats: () => InvoiceHorizonStats;
}

const InvoiceTrackerContext = createContext<InvoiceTrackerContextType | undefined>(undefined);

export const InvoiceTrackerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paginated fetch of all invoices with their summons items
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allInvoices: Invoice[] = [];
      let currentToken: string | null = null;
      let fetchCount = 0;

      while (fetchCount < MAX_FETCHES) {
        const result: any = await client.graphql({
          query: listInvoicesWithItems,
          variables: {
            limit: 1000,
            nextToken: currentToken,
          },
        });

        // Check for GraphQL errors in the response (partial errors don't throw)
        if (result.errors && result.errors.length > 0) {
          console.error('GraphQL errors in listInvoices response:', result.errors);
        }

        const items = result.data?.listInvoices?.items || [];
        allInvoices.push(...items);
        currentToken = result.data?.listInvoices?.nextToken || null;
        fetchCount++;

        if (!currentToken) break;
      }

      console.log(`Invoice Tracker: fetched ${allInvoices.length} invoices`);
      setInvoices(allInvoices);
    } catch (err: any) {
      // Log the full error for debugging
      console.error('Error fetching invoices:', err);

      // Gracefully degrade only if Invoice tables genuinely don't exist yet
      const isSchemaNotDeployed =
        err?.errors?.some((e: any) =>
          e.errorType === 'DynamoDB:ResourceNotFoundException' ||
          e.message?.includes('Cannot return null for non-nullable')
        );

      if (isSchemaNotDeployed) {
        console.log('Invoice tables not yet deployed — showing empty state');
        setInvoices([]);
      } else {
        setError('Failed to load invoices');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Mark an invoice as paid
  const markAsPaid = useCallback(async (invoiceId: string, paymentDate: string) => {
    try {
      await client.graphql({
        query: updateInvoiceRecord,
        variables: {
          input: {
            id: invoiceId,
            payment_status: 'paid',
            payment_date: paymentDate,
          },
        },
      });
      // Optimistic update
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? { ...inv, payment_status: 'paid' as const, payment_date: paymentDate }
            : inv
        )
      );
    } catch (err) {
      console.error('Error marking invoice as paid:', err);
      throw err;
    }
  }, []);

  // Mark an invoice as unpaid (reverse payment)
  const markAsUnpaid = useCallback(async (invoiceId: string) => {
    try {
      await client.graphql({
        query: updateInvoiceRecord,
        variables: {
          input: {
            id: invoiceId,
            payment_status: 'unpaid',
            payment_date: null,
          },
        },
      });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId
            ? { ...inv, payment_status: 'unpaid' as const, payment_date: null }
            : inv
        )
      );
    } catch (err) {
      console.error('Error marking invoice as unpaid:', err);
      throw err;
    }
  }, []);

  // Update alert deadline
  const updateAlertDeadline = useCallback(async (invoiceId: string, newDeadline: string) => {
    try {
      await client.graphql({
        query: updateInvoiceRecord,
        variables: {
          input: {
            id: invoiceId,
            alert_deadline: newDeadline,
          },
        },
      });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId ? { ...inv, alert_deadline: newDeadline } : inv
        )
      );
    } catch (err) {
      console.error('Error updating alert deadline:', err);
      throw err;
    }
  }, []);

  // Update notes
  const updateNotes = useCallback(async (invoiceId: string, notes: string) => {
    try {
      await client.graphql({
        query: updateInvoiceRecord,
        variables: {
          input: {
            id: invoiceId,
            notes,
          },
        },
      });
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId ? { ...inv, notes } : inv
        )
      );
    } catch (err) {
      console.error('Error updating invoice notes:', err);
      throw err;
    }
  }, []);

  // Delete an invoice and its linked InvoiceSummons join records
  const deleteInvoice = useCallback(async (invoice: Invoice) => {
    try {
      // Delete join records first
      const items = invoice.items?.items || [];
      if (items.length > 0) {
        await Promise.all(items.map((item) =>
          client.graphql({
            query: deleteInvoiceSummonsRecord,
            variables: { input: { id: item.id } },
          })
        ));
      }

      // Delete the invoice itself
      await client.graphql({
        query: deleteInvoiceRecord,
        variables: { input: { id: invoice.id } },
      });

      // Remove from local state
      setInvoices((prev) => prev.filter((inv) => inv.id !== invoice.id));
    } catch (err) {
      console.error('Error deleting invoice:', err);
      throw err;
    }
  }, []);

  // Compute horizon stats from current invoice list
  const getHorizonStats = useCallback((): InvoiceHorizonStats => {
    let overdueCount = 0;
    let dueSoonCount = 0;
    let paidCount = 0;
    let unpaidCount = 0;

    for (const inv of invoices) {
      if (inv.payment_status === 'paid') {
        paidCount++;
      } else {
        unpaidCount++;
        if (isOverdue(inv)) overdueCount++;
        else if (isDueSoon(inv)) dueSoonCount++;
      }
    }

    return { overdueCount, dueSoonCount, paidCount, unpaidCount };
  }, [invoices]);

  // Fetch invoices on mount
  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const value: InvoiceTrackerContextType = {
    invoices,
    loading,
    error,
    fetchInvoices,
    markAsPaid,
    markAsUnpaid,
    updateAlertDeadline,
    updateNotes,
    deleteInvoice,
    getHorizonStats,
  };

  return (
    <InvoiceTrackerContext.Provider value={value}>
      {children}
    </InvoiceTrackerContext.Provider>
  );
};

export const useInvoiceTracker = () => {
  const context = useContext(InvoiceTrackerContext);
  if (context === undefined) {
    throw new Error('useInvoiceTracker must be used within an InvoiceTrackerProvider');
  }
  return context;
};
