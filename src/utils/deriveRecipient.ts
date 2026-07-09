/**
 * Builds the invoice "recipient" block (company name, attention, address, email)
 * from a resolved Client record.
 *
 * Why this exists: the invoice recipient must never silently show a *previous*
 * client's data or go blank. The InvoiceBuilder auto-fill effect used to only
 * overwrite the recipient when a fully-resolved Client was cached, so while the
 * client fetch was in flight (or if it never resolved) the form kept whatever was
 * there before — the last client's info, or an empty rehydrated value. Centralize
 * the mapping here so it is deterministic and unit-testable:
 *
 *  - `client` null/undefined (not loaded yet, or failed to resolve) → fall back to
 *    `fallbackCompanyName`, which the caller passes from the cart item's
 *    respondent_name (always present on a cart item).
 *  - `client` resolved but with an empty name → also use the fallback.
 *  - everything else comes from the client when present, else empty string.
 */
import { InvoiceRecipient } from '../types/invoice';
import { parseContactAddress } from './parseContactAddress';

// Minimal client shape needed to build a recipient. Both the local Client
// interface in InvoiceBuilder and the shared Client type in types/summons
// satisfy this structurally.
export interface RecipientClientSource {
  name?: string | null;
  contact_name?: string | null;
  contact_address?: string | null;
  contact_email1?: string | null;
}

export function deriveRecipient(
  client: RecipientClientSource | null | undefined,
  fallbackCompanyName?: string | null,
): InvoiceRecipient {
  // contact_address is one multiline field ("street\nCITY ST ZIP"); split it so
  // the street and city/state/zip land in their own recipient fields.
  const parsed = parseContactAddress(client?.contact_address);
  return {
    companyName: client?.name || fallbackCompanyName || '',
    attention: client?.contact_name || '',
    address: parsed.address,
    cityStateZip: parsed.cityStateZip,
    email: client?.contact_email1 || '',
  };
}
