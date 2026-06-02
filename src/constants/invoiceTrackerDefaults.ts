/**
 * Invoice Tracker Constants
 */

/** Default number of days after invoice creation for the alert deadline */
export const DEFAULT_ALERT_DAYS = 7;

/** Number of days before alert deadline to flag as "due soon" */
export const DUE_SOON_THRESHOLD_DAYS = 3;

/** Invoice payment status values */
export const INVOICE_STATUS = {
  PAID: 'paid' as const,
  UNPAID: 'unpaid' as const,
};
