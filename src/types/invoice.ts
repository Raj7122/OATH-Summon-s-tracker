/**
 * Invoice Cart Item - Represents a summons staged for invoicing
 * Contains subset of Summons data needed for invoice generation
 */
export interface InvoiceCartItem {
  id: string;
  summons_number: string;
  respondent_name: string;
  clientID: string;
  violation_date: string | null;
  hearing_date: string | null;
  hearing_result: string | null;
  status: string;
  amount_due: number | null;
  legal_fee: number; // Default $250, user-editable
  addedAt: string; // ISO timestamp when added to cart
}

/**
 * Invoice Recipient - Contact information for the invoice
 */
export interface InvoiceRecipient {
  companyName: string;
  address: string;
  cityStateZip: string;
  attention: string;
  email: string;
}

/**
 * Generated Invoice metadata
 */
export interface InvoiceMetadata {
  invoiceDate: string; // ISO date
  generatedAt: string; // ISO timestamp
  totalLegalFees: number; // Sum of all legal_fee
  totalFinesDue: number; // Sum of all amount_due
  itemCount: number; // Number of summonses
}

/**
 * Minimal summons data needed to add to cart
 * (Avoids passing full Summons object with all fields)
 */
export interface SummonsForInvoice {
  id: string;
  summons_number: string;
  respondent_name: string | null;
  clientID: string;
  violation_date: string | null;
  hearing_date: string | null;
  hearing_result: string | null;
  status: string | null;
  amount_due: number | null;
}

/**
 * Invoice Context State
 */
export interface InvoiceContextState {
  cartItems: InvoiceCartItem[];
  recipient: InvoiceRecipient;
}

/**
 * Invoice Context Actions
 */
export interface InvoiceContextActions {
  addToCart: (summons: SummonsForInvoice) => void;
  removeFromCart: (summonsId: string) => void;
  updateLegalFee: (summonsId: string, newFee: number) => void;
  updateAmountDue: (summonsId: string, newAmount: number | null) => void;
  clearCart: () => void;
  isInCart: (summonsId: string) => boolean;
  setRecipient: (recipient: InvoiceRecipient) => void;
  updateRecipientField: (field: keyof InvoiceRecipient, value: string) => void;
  getCartCount: () => number;
  getTotalLegalFees: () => number;
  getTotalFinesDue: () => number;
}

export type InvoiceContextType = InvoiceContextState & InvoiceContextActions;

/**
 * Options for invoice generation (editable footer fields)
 */
export interface InvoiceOptions {
  paymentInstructions: string;
  additionalNotes: string;
}
