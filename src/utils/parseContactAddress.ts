/**
 * Splits a stored client `contact_address` into a street portion and a
 * city/state/zip portion for the invoice recipient block.
 *
 * The client model stores the whole address in a single multiline field, e.g.
 * "144-47 27 AVENUE\nFLUSHING NY 11354". Invoices render the street and the
 * city/state/zip on separate lines, so we split them here.
 *
 * Convention: the LAST non-empty line is the city/state/zip line; everything
 * before it is the street address.
 */
export interface ParsedAddress {
  address: string; // street line(s)
  cityStateZip: string; // city / state / zip line
}

export function parseContactAddress(raw?: string | null): ParsedAddress {
  const value = (raw || '').trim();
  if (!value) return { address: '', cityStateZip: '' };

  // Primary: split on newlines — last non-empty line is city/state/zip.
  const lines = value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length > 1) {
    return {
      address: lines.slice(0, -1).join('\n'),
      cityStateZip: lines[lines.length - 1],
    };
  }

  // Fallback: a single line that bundles street + city/state/zip.
  const single = lines[0];

  // A comma is the conventional street/city separator — split on the last one,
  // e.g. "123 Main St, New York NY 10001" -> "123 Main St" + "New York NY 10001".
  const lastComma = single.lastIndexOf(',');
  if (lastComma !== -1) {
    return {
      address: single.slice(0, lastComma).trim(),
      cityStateZip: single.slice(lastComma + 1).trim(),
    };
  }

  // No comma — detect a trailing "CITY ST 12345" (optional ZIP+4). City is taken
  // as the single word before the state, since we can't reliably tell where the
  // street ends, e.g. "144-47 27 AVENUE FLUSHING NY 11354" -> "FLUSHING NY 11354".
  const match = single.match(/^(.+?)\s+([A-Za-z.]+\s+[A-Za-z]{2}\s+\d{5}(?:-\d{4})?)$/);
  if (match) {
    return {
      address: match[1].trim(),
      cityStateZip: match[2].trim(),
    };
  }

  // No city/state/zip detectable — keep it all in the street field.
  return { address: lines[0], cityStateZip: '' };
}
