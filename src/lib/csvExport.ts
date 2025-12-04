/**
 * CSV Export Utilities
 *
 * Handles CSV generation for the NYC OATH Summons Tracker.
 * Designed for Arthur's practice management needs with proper Excel compatibility.
 *
 * Key Features:
 * - Dynamic column selection
 * - Excel-safe formatting (leading zeros preserved, no currency symbols)
 * - Date formatting (ISO or US locale)
 * - Boolean to Yes/No conversion
 * - Proper CSV escaping for special characters
 *
 * @module lib/csvExport
 */

import { Summons } from '../types/summons';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Available columns for export
 * Each column has a key (field name), label (header), and category
 */
export interface ExportColumn {
  key: string;
  label: string;
  category: 'core' | 'financial' | 'evidence' | 'ocr' | 'internal';
  defaultChecked: boolean;
  formatter?: (value: unknown, row: Summons) => string;
}

/**
 * Export configuration options
 */
export interface ExportConfig {
  columns: string[];
  dateFormat: 'iso' | 'us';
  includeHistorical: boolean;
  clientName?: string;
}

/**
 * Export progress callback
 */
export type ProgressCallback = (current: number, total: number, message: string) => void;

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

/**
 * All available export columns with their configurations
 * Order matters for default column presentation
 */
export const EXPORT_COLUMNS: ExportColumn[] = [
  // Core Fields (Default Checked)
  {
    key: 'summons_number',
    label: 'Summons Number',
    category: 'core',
    defaultChecked: true,
    // CRITICAL: Preserve leading zeros for Excel safety
    formatter: (value) => value ? `="${String(value)}"` : '',
  },
  {
    key: 'violation_date',
    label: 'Violation Date',
    category: 'core',
    defaultChecked: true,
  },
  {
    key: 'hearing_date',
    label: 'Hearing Date',
    category: 'core',
    defaultChecked: true,
  },
  {
    key: 'license_plate',
    label: 'License Plate',
    category: 'core',
    defaultChecked: true,
    formatter: (_value, row) => String(row.license_plate_ocr || row.license_plate || ''),
  },
  {
    key: 'status',
    label: 'Status',
    category: 'core',
    defaultChecked: true,
  },
  {
    key: 'respondent_name',
    label: 'Respondent Name',
    category: 'core',
    defaultChecked: false,
  },
  {
    key: 'hearing_time',
    label: 'Hearing Time',
    category: 'core',
    defaultChecked: false,
  },
  {
    key: 'hearing_result',
    label: 'Hearing Result',
    category: 'core',
    defaultChecked: false,
  },
  {
    key: 'violation_location',
    label: 'Violation Location',
    category: 'core',
    defaultChecked: false,
  },
  {
    key: 'code_description',
    label: 'Violation Description',
    category: 'core',
    defaultChecked: false,
  },

  // Financial Fields (Unchecked by default)
  {
    key: 'amount_due',
    label: 'Amount Due',
    category: 'financial',
    defaultChecked: false,
    // No $ symbol for Excel math compatibility
    formatter: (value) => value != null ? Number(value).toFixed(2) : '0.00',
  },
  {
    key: 'base_fine',
    label: 'Base Fine',
    category: 'financial',
    defaultChecked: false,
    formatter: (value) => value != null ? Number(value).toFixed(2) : '0.00',
  },
  {
    key: 'paid_amount',
    label: 'Paid Amount',
    category: 'financial',
    defaultChecked: false,
    formatter: (value) => value != null ? Number(value).toFixed(2) : '0.00',
  },
  {
    key: 'penalty_imposed',
    label: 'Penalty Imposed',
    category: 'financial',
    defaultChecked: false,
    formatter: (value) => value != null ? Number(value).toFixed(2) : '0.00',
  },

  // Evidence Fields (Unchecked by default)
  {
    key: 'evidence_reviewed',
    label: 'Evidence Reviewed',
    category: 'evidence',
    defaultChecked: false,
    formatter: (value) => value ? 'Yes' : 'No',
  },
  {
    key: 'evidence_requested',
    label: 'Evidence Requested',
    category: 'evidence',
    defaultChecked: false,
    formatter: (value) => value ? 'Yes' : 'No',
  },
  {
    key: 'evidence_received',
    label: 'Evidence Received',
    category: 'evidence',
    defaultChecked: false,
    formatter: (value) => value ? 'Yes' : 'No',
  },
  {
    key: 'added_to_calendar',
    label: 'Added to Calendar',
    category: 'evidence',
    defaultChecked: false,
    formatter: (value) => value ? 'Yes' : 'No',
  },

  // Internal/Billing Fields (Unchecked by default)
  {
    key: 'is_invoiced',
    label: 'Invoiced',
    category: 'internal',
    defaultChecked: false,
    formatter: (value) => value ? 'Yes' : 'No',
  },
  {
    key: 'legal_fee_paid',
    label: 'Legal Fee Paid',
    category: 'internal',
    defaultChecked: false,
    formatter: (value) => value ? 'Yes' : 'No',
  },
  {
    key: 'internal_status',
    label: 'Internal Status',
    category: 'internal',
    defaultChecked: false,
  },
  {
    key: 'notes',
    label: 'Notes',
    category: 'internal',
    defaultChecked: false,
  },

  // OCR Fields (Unchecked by default)
  {
    key: 'vehicle_type_ocr',
    label: 'Vehicle Type',
    category: 'ocr',
    defaultChecked: false,
  },
  {
    key: 'violation_narrative',
    label: 'Violation Narrative',
    category: 'ocr',
    defaultChecked: false,
  },
];

/**
 * Get default selected columns
 */
export function getDefaultSelectedColumns(): string[] {
  return EXPORT_COLUMNS
    .filter((col) => col.defaultChecked)
    .map((col) => col.key);
}

/**
 * Get columns grouped by category
 */
export function getColumnsByCategory(): Record<string, ExportColumn[]> {
  const grouped: Record<string, ExportColumn[]> = {
    core: [],
    financial: [],
    evidence: [],
    internal: [],
    ocr: [],
  };

  EXPORT_COLUMNS.forEach((col) => {
    grouped[col.category].push(col);
  });

  return grouped;
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format a date value based on the specified format
 */
export function formatDate(value: string | undefined | null, format: 'iso' | 'us'): string {
  if (!value) return '';

  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';

    if (format === 'iso') {
      // YYYY-MM-DD
      return date.toISOString().split('T')[0];
    } else {
      // MM/DD/YYYY
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    }
  } catch {
    return '';
  }
}

/**
 * Escape a value for CSV (handles quotes, newlines, commas)
 * CRITICAL: This ensures Excel properly interprets the data
 */
export function escapeCSVValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';

  const stringValue = String(value);

  // Check if the value needs quoting
  const needsQuoting =
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r');

  if (needsQuoting) {
    // Escape double quotes by doubling them
    const escaped = stringValue.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return stringValue;
}

/**
 * Format a single cell value based on column configuration
 */
export function formatCellValue(
  column: ExportColumn,
  row: Summons,
  dateFormat: 'iso' | 'us'
): string {
  const rawValue = row[column.key as keyof Summons];

  // Use custom formatter if provided
  if (column.formatter) {
    return column.formatter(rawValue, row);
  }

  // Handle date fields
  if (column.key.includes('date')) {
    return formatDate(rawValue as string, dateFormat);
  }

  // Handle undefined/null
  if (rawValue === undefined || rawValue === null) {
    return '';
  }

  // Handle boolean
  if (typeof rawValue === 'boolean') {
    return rawValue ? 'Yes' : 'No';
  }

  // Handle arrays
  if (Array.isArray(rawValue)) {
    return rawValue.join('; ');
  }

  return String(rawValue);
}

// ============================================================================
// CSV GENERATION
// ============================================================================

/**
 * Generate CSV content from summons data
 *
 * @param summonses - Array of summons to export
 * @param config - Export configuration
 * @param onProgress - Optional progress callback
 * @returns CSV string content
 */
export function generateCSV(
  summonses: Summons[],
  config: ExportConfig,
  onProgress?: ProgressCallback
): string {
  const selectedColumns = EXPORT_COLUMNS.filter((col) =>
    config.columns.includes(col.key)
  );

  // Generate header row
  const headerRow = selectedColumns.map((col) => escapeCSVValue(col.label)).join(',');

  // Generate data rows
  const dataRows: string[] = [];
  const total = summonses.length;

  for (let i = 0; i < summonses.length; i++) {
    const row = summonses[i];

    // Report progress every 100 rows
    if (onProgress && i % 100 === 0) {
      onProgress(i, total, `Processing record ${i + 1} of ${total}...`);
    }

    const rowValues = selectedColumns.map((col) => {
      const formatted = formatCellValue(col, row, config.dateFormat);
      return escapeCSVValue(formatted);
    });

    dataRows.push(rowValues.join(','));
  }

  if (onProgress) {
    onProgress(total, total, 'CSV generation complete');
  }

  // Combine header and data rows
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Sanitize a client name for use in filename
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .substring(0, 50); // Limit length
}

/**
 * Generate a filename for the export
 */
export function generateFilename(clientName?: string, isGlobal: boolean = false): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  if (isGlobal) {
    return `AllClients_SummonsReport_${date}.csv`;
  }

  if (clientName) {
    const sanitized = sanitizeFilename(clientName);
    return `${sanitized}_SummonsReport_${date}.csv`;
  }

  return `SummonsReport_${date}.csv`;
}

/**
 * Download CSV content as a file
 */
export function downloadCSV(csvContent: string, filename: string): void {
  // Add BOM for Excel UTF-8 compatibility
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });

  // Create download link
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Cleanup
  URL.revokeObjectURL(url);
}

// ============================================================================
// EXPORT FOR TESTING
// ============================================================================

export {
  formatDate as _formatDate,
  escapeCSVValue as _escapeCSVValue,
  formatCellValue as _formatCellValue,
};
