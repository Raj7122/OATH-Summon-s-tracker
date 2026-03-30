/**
 * Invoice Tracker Types
 * Types for persistent invoice tracking, payment monitoring, and calendar visualization
 */

/** Payment status for an invoice */
export type InvoicePaymentStatus = 'paid' | 'unpaid';

/** Horizon filter for the invoice calendar */
export type InvoiceHorizonFilter = 'overdue' | 'due_soon' | 'paid' | null;

/** Invoice record from DynamoDB */
export interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  recipient_company: string;
  recipient_attention?: string;
  recipient_address?: string;
  recipient_email?: string;
  total_legal_fees: number;
  total_fines_due: number;
  item_count: number;
  payment_status: InvoicePaymentStatus;
  payment_date?: string | null;
  alert_deadline: string;
  notes?: string | null;
  clientID?: string | null;
  items?: {
    items: InvoiceSummonsItem[];
  };
  createdAt?: string;
  updatedAt?: string;
}

/** Join table record linking an invoice to a summons */
export interface InvoiceSummonsItem {
  id: string;
  invoiceID: string;
  summonsID: string;
  summons_number: string;
  legal_fee: number;
  amount_due?: number | null;
}

/** Horizon stats for the invoice calendar filter chips */
export interface InvoiceHorizonStats {
  overdueCount: number;
  dueSoonCount: number;
  paidCount: number;
  unpaidCount: number;
}

/** Aggregated summary for a time period (week or month) */
export interface InvoicePeriodSummary {
  periodLabel: string;
  periodStart: string;
  totalInvoices: number;
  unpaidCount: number;
  overdueCount: number;
  paidCount: number;
  totalAmountOutstanding: number;
  totalAmountPaid: number;
}
