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
  highlighted?: boolean;
}

/**
 * Manual non-summons line item (e.g., research fee).
 * Every field is free-text; stored as JSON on the Invoice record.
 */
export interface InvoiceExtraLineItem {
  id: string;
  summons_number: string;
  violation_date: string;
  status: string;
  hearing_result: string;
  hearing_date: string;
  amount_due: string;
  legal_fee: string;
  highlighted?: boolean;
}

/**
 * Map of which footer paragraphs should render with a yellow highlight.
 */
export interface HighlightedSections {
  payment?: boolean;
  review?: boolean;
  overdue?: boolean;
  customMiddle?: boolean;
  additional?: boolean;
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
  alertDeadline: string | null;
}

/**
 * Invoice Context Actions
 */
export interface InvoiceContextActions {
  addToCart: (summons: SummonsForInvoice) => void;
  removeFromCart: (summonsId: string) => void;
  removeManyFromCart: (summonsIds: string[]) => void;
  updateLegalFee: (summonsId: string, newFee: number) => void;
  updateAmountDue: (summonsId: string, newAmount: number | null) => void;
  updateStatus: (summonsId: string, newStatus: string) => void;
  updateHearingResult: (summonsId: string, newResult: string | null) => void;
  toggleSummonsHighlight: (summonsId: string) => void;
  clearCart: () => void;
  isInCart: (summonsId: string) => boolean;
  setRecipient: (recipient: InvoiceRecipient) => void;
  updateRecipientField: (field: keyof InvoiceRecipient, value: string) => void;
  getCartCount: () => number;
  getTotalLegalFees: () => number;
  getTotalFinesDue: () => number;
  setAlertDeadline: (date: string | null) => void;
}

export type InvoiceContextType = InvoiceContextState & InvoiceContextActions;

/**
 * Options for invoice generation (editable footer fields)
 * Only 3 fields are user-editable; other footer text uses hardcoded defaults
 */
export interface InvoiceOptions {
  paymentInstructions: string;
  reviewText: string;
  additionalNotes: string;
  showOverdue: boolean;
  overdueText: string;
  customMiddleText?: string;
  highlightedSections?: HighlightedSections;
}
