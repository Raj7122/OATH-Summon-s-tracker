/**
 * Export Logic Verification Tests
 *
 * Test suite to verify the Dynamic Export Manager functionality.
 * Tests critical scenarios including:
 * - "Invisible Data" Test: Ensures ALL records export (no pagination cap)
 * - "Column Selection" Test: Dynamic column inclusion/exclusion
 * - "Excel Safety" Test: Leading zeros preserved, proper escaping
 *
 * @module tests/verify_export_logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EXPORT_COLUMNS,
  generateCSV,
  formatDate,
  escapeCSVValue,
  formatCellValue,
  getDefaultSelectedColumns,
  getColumnsByCategory,
  ExportConfig,
  sanitizeFilename,
  generateFilename,
} from '../src/lib/csvExport';
import { Summons } from '../src/types/summons';

// ============================================================================
// TEST DATA
// ============================================================================

/**
 * Generate mock summons data for testing
 */
function generateMockSummonses(count: number): Summons[] {
  const summonses: Summons[] = [];

  for (let i = 1; i <= count; i++) {
    summonses.push({
      id: `summons-${i}`,
      clientID: 'client-1',
      summons_number: `0${String(i).padStart(9, '0')}`, // Leading zeros!
      respondent_name: `Test Company ${i}`,
      hearing_date: `2024-0${(i % 9) + 1}-15T10:00:00.000Z`,
      status: i % 2 === 0 ? 'CLOSED' : 'OPEN',
      license_plate: `ABC${String(i).padStart(4, '0')}`,
      base_fine: 350,
      amount_due: i % 2 === 0 ? 0 : 500.50,
      violation_date: `2024-0${(i % 9) + 1}-01T08:00:00.000Z`,
      violation_location: `123 Test Street, Floor ${i}`,
      notes: i % 3 === 0 ? `Special note with, comma and "quotes"` : '',
      evidence_reviewed: i % 2 === 0,
      evidence_requested: i % 3 === 0,
      evidence_received: i % 4 === 0,
      added_to_calendar: i % 5 === 0,
      is_invoiced: i % 2 === 0,
      legal_fee_paid: i % 3 === 0,
    } as Summons);
  }

  return summonses;
}

// ============================================================================
// SCENARIO A: "INVISIBLE DATA" TEST
// ============================================================================

describe('Scenario A: Invisible Data Test', () => {
  it('should export all 150 records without pagination cap', () => {
    // Arrange: Create 150 mock summonses
    const summonses = generateMockSummonses(150);

    const config: ExportConfig = {
      columns: ['summons_number', 'status', 'amount_due'],
      dateFormat: 'us',
      includeHistorical: true,
    };

    // Act: Generate CSV
    const csvContent = generateCSV(summonses, config);

    // Assert: Should have 151 lines (1 header + 150 data rows)
    const lines = csvContent.split('\n');
    expect(lines.length).toBe(151);

    // Verify header
    expect(lines[0]).toBe('Summons Number,Status,Amount Due');

    // Verify data rows exist
    expect(lines[1]).toContain('0000000001'); // First summons (with leading zeros preserved)
    expect(lines[150]).toContain('0000000150'); // Last summons
  });

  it('should handle 500+ records without memory issues', () => {
    // Arrange: Create 500 mock summonses
    const summonses = generateMockSummonses(500);

    const config: ExportConfig = {
      columns: ['summons_number', 'respondent_name'],
      dateFormat: 'us',
      includeHistorical: true,
    };

    // Act & Assert: Should not throw
    expect(() => generateCSV(summonses, config)).not.toThrow();

    const csvContent = generateCSV(summonses, config);
    const lines = csvContent.split('\n');

    // 1 header + 500 data rows
    expect(lines.length).toBe(501);
  });

  it('should report progress during large exports', () => {
    const summonses = generateMockSummonses(300);
    const progressCalls: { current: number; total: number; message: string }[] = [];

    const config: ExportConfig = {
      columns: ['summons_number'],
      dateFormat: 'us',
      includeHistorical: true,
    };

    // Act
    generateCSV(summonses, config, (current, total, message) => {
      progressCalls.push({ current, total, message });
    });

    // Assert: Progress was reported (every 100 rows)
    expect(progressCalls.length).toBeGreaterThan(0);

    // Should have reported progress at row 0, 100, 200, and completion
    expect(progressCalls.some((p) => p.current === 0)).toBe(true);
    expect(progressCalls.some((p) => p.current === 100)).toBe(true);
    expect(progressCalls.some((p) => p.current === 200)).toBe(true);
    expect(progressCalls.some((p) => p.message.includes('complete'))).toBe(true);
  });
});

// ============================================================================
// SCENARIO B: "COLUMN SELECTION" TEST
// ============================================================================

describe('Scenario B: Column Selection Test', () => {
  const mockSummons: Summons = {
    id: 'test-1',
    clientID: 'client-1',
    summons_number: '0123456789',
    respondent_name: 'Test Corp',
    hearing_date: '2024-06-15T10:00:00.000Z',
    status: 'OPEN',
    license_plate: 'ABC1234',
    base_fine: 350,
    amount_due: 500.50,
    violation_date: '2024-06-01T08:00:00.000Z',
    notes: 'Test notes',
    evidence_reviewed: true,
  } as Summons;

  it('should include only selected columns in header', () => {
    const config: ExportConfig = {
      columns: ['summons_number', 'status'],
      dateFormat: 'us',
      includeHistorical: true,
    };

    const csv = generateCSV([mockSummons], config);
    const header = csv.split('\n')[0];

    expect(header).toBe('Summons Number,Status');
    expect(header).not.toContain('Amount Due');
    expect(header).not.toContain('Notes');
  });

  it('should exclude unchecked columns from output', () => {
    // Only select financial columns
    const config: ExportConfig = {
      columns: ['amount_due', 'base_fine'],
      dateFormat: 'us',
      includeHistorical: true,
    };

    const csv = generateCSV([mockSummons], config);
    const lines = csv.split('\n');

    // Header should only have financial columns
    expect(lines[0]).toBe('Amount Due,Base Fine');

    // Data row should only have financial values
    expect(lines[1]).toBe('500.50,350.00');

    // Should NOT contain status, notes, etc.
    expect(csv).not.toContain('OPEN');
    expect(csv).not.toContain('Test notes');
  });

  it('should handle all default columns', () => {
    const defaultColumns = getDefaultSelectedColumns();

    const config: ExportConfig = {
      columns: defaultColumns,
      dateFormat: 'us',
      includeHistorical: true,
    };

    const csv = generateCSV([mockSummons], config);
    const header = csv.split('\n')[0];

    // Default columns should include core fields
    expect(header).toContain('Summons Number');
    expect(header).toContain('Hearing Date');
    expect(header).toContain('License Plate');
    expect(header).toContain('Status');
  });

  it('should return correct columns by category', () => {
    const byCategory = getColumnsByCategory();

    // Verify categories exist
    expect(byCategory.core.length).toBeGreaterThan(0);
    expect(byCategory.financial.length).toBeGreaterThan(0);
    expect(byCategory.evidence.length).toBeGreaterThan(0);
    expect(byCategory.internal.length).toBeGreaterThan(0);
    expect(byCategory.ocr.length).toBeGreaterThan(0);

    // Core should include summons_number
    expect(byCategory.core.some((c) => c.key === 'summons_number')).toBe(true);

    // Financial should include amount_due
    expect(byCategory.financial.some((c) => c.key === 'amount_due')).toBe(true);

    // Evidence should include checkboxes
    expect(byCategory.evidence.some((c) => c.key === 'evidence_reviewed')).toBe(true);
  });

  it('should preserve column order as defined in EXPORT_COLUMNS', () => {
    const config: ExportConfig = {
      columns: ['hearing_date', 'summons_number', 'status'],
      dateFormat: 'us',
      includeHistorical: true,
    };

    const csv = generateCSV([mockSummons], config);
    const header = csv.split('\n')[0];

    // Order should follow EXPORT_COLUMNS definition, not the config array order
    // In EXPORT_COLUMNS: summons_number comes before hearing_date
    expect(header).toBe('Summons Number,Hearing Date,Status');
  });
});

// ============================================================================
// SCENARIO C: "EXCEL SAFETY" TEST
// ============================================================================

describe('Scenario C: Excel Safety Test', () => {
  it('should preserve leading zeros with Excel formula wrapper', () => {
    const mockSummons: Summons = {
      id: 'test-1',
      clientID: 'client-1',
      summons_number: '0123456789', // Leading zero!
    } as Summons;

    const column = EXPORT_COLUMNS.find((c) => c.key === 'summons_number')!;
    const formatted = column.formatter!(mockSummons.summons_number, mockSummons);

    // Should use Excel formula format to preserve leading zeros
    expect(formatted).toBe('="0123456789"');
  });

  it('should format currency without $ symbol for Excel math', () => {
    const mockSummons: Summons = {
      id: 'test-1',
      clientID: 'client-1',
      amount_due: 1234.56,
    } as Summons;

    const column = EXPORT_COLUMNS.find((c) => c.key === 'amount_due')!;
    const formatted = column.formatter!(mockSummons.amount_due, mockSummons);

    // Should be plain number with 2 decimal places, no $
    expect(formatted).toBe('1234.56');
    expect(formatted).not.toContain('$');
  });

  it('should handle null/undefined financial values', () => {
    const column = EXPORT_COLUMNS.find((c) => c.key === 'amount_due')!;

    expect(column.formatter!(null, {} as Summons)).toBe('0.00');
    expect(column.formatter!(undefined, {} as Summons)).toBe('0.00');
  });

  it('should escape commas in values', () => {
    const value = 'Test, with comma';
    const escaped = escapeCSVValue(value);

    expect(escaped).toBe('"Test, with comma"');
  });

  it('should escape double quotes by doubling them', () => {
    const value = 'Test "quoted" value';
    const escaped = escapeCSVValue(value);

    expect(escaped).toBe('"Test ""quoted"" value"');
  });

  it('should escape newlines in values', () => {
    const value = 'Line 1\nLine 2';
    const escaped = escapeCSVValue(value);

    expect(escaped).toBe('"Line 1\nLine 2"');
  });

  it('should handle complex escape scenarios', () => {
    const value = 'Test, "quoted", with\nnewline';
    const escaped = escapeCSVValue(value);

    expect(escaped).toBe('"Test, ""quoted"", with\nnewline"');
  });

  it('should convert boolean to Yes/No', () => {
    const mockSummons: Summons = {
      id: 'test-1',
      clientID: 'client-1',
      evidence_reviewed: true,
      evidence_requested: false,
    } as Summons;

    const reviewedColumn = EXPORT_COLUMNS.find((c) => c.key === 'evidence_reviewed')!;
    const requestedColumn = EXPORT_COLUMNS.find((c) => c.key === 'evidence_requested')!;

    expect(reviewedColumn.formatter!(true, mockSummons)).toBe('Yes');
    expect(requestedColumn.formatter!(false, mockSummons)).toBe('No');
  });
});

// ============================================================================
// DATE FORMATTING TESTS
// ============================================================================

describe('Date Formatting', () => {
  it('should format dates in US format (MM/DD/YYYY)', () => {
    const result = formatDate('2024-06-15T10:00:00.000Z', 'us');
    expect(result).toBe('06/15/2024');
  });

  it('should format dates in ISO format (YYYY-MM-DD)', () => {
    const result = formatDate('2024-06-15T10:00:00.000Z', 'iso');
    expect(result).toBe('2024-06-15');
  });

  it('should handle null/undefined dates', () => {
    expect(formatDate(null, 'us')).toBe('');
    expect(formatDate(undefined, 'us')).toBe('');
  });

  it('should handle invalid date strings', () => {
    expect(formatDate('not-a-date', 'us')).toBe('');
  });
});

// ============================================================================
// FILENAME GENERATION TESTS
// ============================================================================

describe('Filename Generation', () => {
  beforeEach(() => {
    // Mock Date to ensure consistent filenames
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00.000Z'));
  });

  it('should generate client-specific filename', () => {
    const filename = generateFilename('Test Company');
    expect(filename).toBe('Test_Company_SummonsReport_2024-06-15.csv');
  });

  it('should generate global export filename', () => {
    const filename = generateFilename(undefined, true);
    expect(filename).toBe('AllClients_SummonsReport_2024-06-15.csv');
  });

  it('should sanitize special characters in client name', () => {
    const sanitized = sanitizeFilename('Test/Company<>Inc.');
    expect(sanitized).not.toContain('/');
    expect(sanitized).not.toContain('<');
    expect(sanitized).not.toContain('>');
    expect(sanitized).not.toContain('.');
  });

  it('should replace spaces with underscores', () => {
    const sanitized = sanitizeFilename('Test Company Inc');
    expect(sanitized).toBe('Test_Company_Inc');
  });

  it('should truncate long filenames', () => {
    const longName = 'A'.repeat(100);
    const sanitized = sanitizeFilename(longName);
    expect(sanitized.length).toBeLessThanOrEqual(50);
  });
});

// ============================================================================
// INTEGRATION TEST: FULL CSV GENERATION
// ============================================================================

describe('Full CSV Generation Integration', () => {
  it('should generate a complete, valid CSV file', () => {
    const summonses: Summons[] = [
      {
        id: 'sum-1',
        clientID: 'client-1',
        summons_number: '0123456789',
        respondent_name: 'Test Corp, LLC',
        hearing_date: '2024-06-15T10:00:00.000Z',
        status: 'OPEN',
        license_plate: 'ABC1234',
        amount_due: 500.50,
        evidence_reviewed: true,
        notes: 'Note with "quotes"',
      } as Summons,
      {
        id: 'sum-2',
        clientID: 'client-1',
        summons_number: '0987654321',
        respondent_name: 'Another Corp',
        hearing_date: '2024-07-20T14:00:00.000Z',
        status: 'CLOSED',
        license_plate: 'XYZ9999',
        amount_due: 0,
        evidence_reviewed: false,
        notes: '',
      } as Summons,
    ];

    const config: ExportConfig = {
      columns: ['summons_number', 'respondent_name', 'hearing_date', 'status', 'amount_due', 'evidence_reviewed', 'notes'],
      dateFormat: 'us',
      includeHistorical: true,
    };

    const csv = generateCSV(summonses, config);
    const lines = csv.split('\n');

    // Verify structure
    expect(lines.length).toBe(3); // Header + 2 data rows

    // Verify header (order follows EXPORT_COLUMNS definition)
    expect(lines[0]).toBe('Summons Number,Hearing Date,Status,Respondent Name,Amount Due,Evidence Reviewed,Notes');

    // Verify first data row (with special characters properly escaped)
    // Note: The ="..." formula gets CSV-escaped to "=""..."""
    expect(lines[1]).toContain('0123456789'); // Leading zeros preserved (in Excel formula format)
    expect(lines[1]).toContain('Test Corp, LLC'); // Comma escaped with quotes
    expect(lines[1]).toContain('06/15/2024'); // US date format
    expect(lines[1]).toContain('OPEN');
    expect(lines[1]).toContain('500.50'); // No $ symbol
    expect(lines[1]).toContain('Yes'); // Boolean as Yes
    expect(lines[1]).toContain('quotes'); // Note text included

    // Verify second data row
    expect(lines[2]).toContain('0987654321'); // In Excel formula format
    expect(lines[2]).toContain('CLOSED');
    expect(lines[2]).toContain('0.00');
    expect(lines[2]).toContain('No');
  });
});

// ============================================================================
// EXPORT COLUMNS DEFINITION TESTS
// ============================================================================

describe('Export Columns Definition', () => {
  it('should have all required core columns', () => {
    const coreColumns = EXPORT_COLUMNS.filter((c) => c.category === 'core');

    const requiredCore = ['summons_number', 'hearing_date', 'status', 'license_plate'];
    requiredCore.forEach((key) => {
      expect(coreColumns.some((c) => c.key === key)).toBe(true);
    });
  });

  it('should have all financial columns', () => {
    const financialColumns = EXPORT_COLUMNS.filter((c) => c.category === 'financial');

    expect(financialColumns.some((c) => c.key === 'amount_due')).toBe(true);
    expect(financialColumns.some((c) => c.key === 'base_fine')).toBe(true);
  });

  it('should have all evidence tracking columns', () => {
    const evidenceColumns = EXPORT_COLUMNS.filter((c) => c.category === 'evidence');

    const requiredEvidence = ['evidence_reviewed', 'evidence_requested', 'evidence_received', 'added_to_calendar'];
    requiredEvidence.forEach((key) => {
      expect(evidenceColumns.some((c) => c.key === key)).toBe(true);
    });
  });

  it('should have default columns marked correctly', () => {
    const defaultColumns = EXPORT_COLUMNS.filter((c) => c.defaultChecked);

    // Core default columns
    expect(defaultColumns.some((c) => c.key === 'summons_number')).toBe(true);
    expect(defaultColumns.some((c) => c.key === 'hearing_date')).toBe(true);
    expect(defaultColumns.some((c) => c.key === 'status')).toBe(true);
    expect(defaultColumns.some((c) => c.key === 'license_plate')).toBe(true);

    // Non-default columns
    expect(defaultColumns.some((c) => c.key === 'notes')).toBe(false);
    expect(defaultColumns.some((c) => c.key === 'amount_due')).toBe(false);
  });
});
