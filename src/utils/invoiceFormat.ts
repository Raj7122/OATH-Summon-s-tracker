/**
 * Invoice file-format helpers.
 *
 * The app does not persist an explicit "format" attribute on an invoice — the
 * stored file's format is carried entirely by the extension on its S3 key
 * (`pdf_s3_key`). These helpers derive the format from that key and provide a
 * human-friendly label so viewers can show the ACTUAL file type (Word / Excel /
 * PDF) instead of always assuming PDF.
 */

/** The three formats an invoice can be generated/stored in. */
export type InvoiceFormat = 'pdf' | 'docx' | 'xlsx';

/**
 * Derive the stored invoice format from its S3 key's file extension.
 * Falls back to 'pdf' for a null / empty / unrecognized key so legacy records
 * (saved before multi-format support) still render a sensible default.
 */
export const formatFromKey = (key?: string | null): InvoiceFormat => {
  const lower = (key ?? '').toLowerCase();
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  return 'pdf';
};

/** Short human label for a format, e.g. for tooltips and buttons. */
export const formatLabel = (format: InvoiceFormat): string => {
  switch (format) {
    case 'docx':
      return 'Word';
    case 'xlsx':
      return 'Excel';
    case 'pdf':
    default:
      return 'PDF';
  }
};

/** MIME type for each stored/regenerated invoice format. */
export const formatMime = (format: InvoiceFormat): string => {
  switch (format) {
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'pdf':
    default:
      return 'application/pdf';
  }
};
