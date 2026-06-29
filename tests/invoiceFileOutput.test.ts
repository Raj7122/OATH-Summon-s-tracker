/**
 * @vitest-environment jsdom
 *
 * Real file-output tests for the invoice generators.
 *
 * Unlike invoiceGenerator.test.ts (which mocks jsPDF/docx/exceljs to inspect
 * the calls), this suite runs the REAL libraries end-to-end, writes the
 * produced PDF / DOCX / XLSX to disk, and validates the actual bytes:
 *   - PDF:  valid %PDF header + %%EOF trailer
 *   - DOCX: a real ZIP whose word/document.xml carries the invoice content
 *           and the yellow highlight shading
 *   - XLSX: round-tripped back through ExcelJS to assert cell values, the
 *           highlight fill, and column widths survive a real write/read cycle
 *
 * The generated files are left in the scratchpad dir so they can be opened
 * and eyeballed.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { InvoiceCartItem, InvoiceExtraLineItem, InvoiceRecipient, InvoiceOptions } from '../src/types/invoice';

// Real generation, no library mocks. Only stub the browser download side
// effects so jsPDF.save()/file-saver don't fail under jsdom.
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

beforeAll(() => {
  // jsPDF.save() and file-saver use these — jsdom doesn't implement them.
  // @ts-expect-error – polyfilling for the test env
  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  // @ts-expect-error – polyfilling for the test env
  global.URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

// Import the real generators AFTER the file-saver mock is registered.
import { generatePDF, generateDOCX, generateXLSX } from '../src/utils/invoiceGenerator';

const OUT_DIR = join(
  '/private/tmp/claude-502/-Users-rajivsukhnandan-Projects-OATH-Summons-Tracker/c54566ab-0ee9-478b-b60b-d2a0474ca338/scratchpad',
  'invoice-output',
);

// ---------------------------------------------------------------------------
// Rich sample data: 2 summonses (one highlighted) + 1 manual extra, all
// footer fields populated, overdue + custom middle on, two sections highlighted.
// ---------------------------------------------------------------------------

const items: InvoiceCartItem[] = [
  {
    id: 'a',
    summons_number: '0001111111',
    respondent_name: 'Acme Trucking LLC',
    clientID: 'c1',
    violation_date: '2024-06-01T00:00:00Z',
    hearing_date: '2024-07-15T00:00:00Z',
    hearing_result: 'GUILTY',
    status: 'HEARING COMPLETED',
    amount_due: 500,
    legal_fee: 250,
    addedAt: '2024-06-02T00:00:00Z',
    highlighted: true, // <- this row should be yellow in all formats
  },
  {
    id: 'b',
    summons_number: '0002222222',
    respondent_name: 'Acme Trucking LLC',
    clientID: 'c1',
    violation_date: '2024-08-10T00:00:00Z',
    hearing_date: '2024-09-20T00:00:00Z',
    hearing_result: 'NOT GUILTY',
    status: 'DOCKETED',
    amount_due: 0,
    legal_fee: 300,
    addedAt: '2024-08-11T00:00:00Z',
  },
];

const extras: InvoiceExtraLineItem[] = [
  {
    id: 'x',
    summons_number: 'RESEARCH',
    violation_date: '',
    status: 'Research fee',
    hearing_result: '',
    hearing_date: '',
    amount_due: '',
    legal_fee: '150',
  },
];

const recipient: InvoiceRecipient = {
  companyName: 'Acme Trucking LLC',
  attention: 'Jane Roe',
  address: '123 Main St',
  cityStateZip: 'Queens, NY 11101',
  email: 'jane@acme.com',
};

const options: InvoiceOptions = {
  invoiceDate: '2025-03-14T00:00:00Z',
  paymentInstructions: 'Pay via Zelle to office@law.com.',
  reviewText: 'Please review the attached evidence.',
  additionalNotes: 'Thank you for your business.',
  showOverdue: true,
  overdueText: 'Some balances are overdue.',
  customMiddleText: 'Custom middle note.',
  highlightedSections: { payment: true, overdue: true },
};

// Legal fees: 250 + 300 (items) + 150 (extra) = 700.
const EXPECTED_TOTAL = '$700.00';

const toBuffer = async (blob: Blob): Promise<Buffer> =>
  Buffer.from(await blob.arrayBuffer());

beforeAll(() => {
  mkdirSync(OUT_DIR, { recursive: true });
});

describe('PDF output — real jsPDF file', () => {
  it('produces a valid, non-trivial PDF document', async () => {
    const { blob, filename } = await generatePDF(items, recipient, options, extras);
    const buf = await toBuffer(blob);
    writeFileSync(join(OUT_DIR, filename), buf);

    expect(filename).toMatch(/^Invoice-Acme_Trucking_LLC-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(blob.type).toBe('application/pdf');
    // Magic header + EOF trailer = structurally valid PDF.
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.toString('latin1')).toContain('%%EOF');
    // A 2-item + extra invoice with full footer is several KB, not empty.
    expect(buf.length).toBeGreaterThan(3000);
  });
});

describe('DOCX output — real docx file', () => {
  it('produces a ZIP whose document.xml carries the invoice content + highlight', async () => {
    const { blob, filename } = await generateDOCX(items, recipient, options, extras);
    const buf = await toBuffer(blob);
    writeFileSync(join(OUT_DIR, filename), buf);

    expect(filename).toMatch(/^Invoice-Acme_Trucking_LLC-\d{4}-\d{2}-\d{2}\.docx$/);
    // OOXML files are ZIP archives — first two bytes are 'PK'.
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');

    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file('word/document.xml')!.async('string');

    // Core content present
    expect(docXml).toContain('INVOICE');
    expect(docXml).toContain('LEGAL FEE');
    expect(docXml).toContain('0001111111');
    expect(docXml).toContain('0002222222');
    expect(docXml).toContain('RESEARCH'); // manual extra row
    expect(docXml).toContain('Acme Trucking LLC');
    expect(docXml).toContain('March 14, 2025'); // stored invoice date, not today
    expect(docXml).toContain(EXPECTED_TOTAL);
    // Editable footer fields
    expect(docXml).toContain('Pay via Zelle to office@law.com.');
    expect(docXml).toContain('Custom middle note.');
    // Highlight shading (FFF59D) must appear for the highlighted row/sections.
    expect(docXml).toContain('FFF59D');
  });
});

describe('XLSX output — real ExcelJS round-trip', () => {
  it('writes a workbook whose cells, total, highlight, and widths survive read-back', async () => {
    const { blob, filename } = await generateXLSX(items, recipient, options, extras);
    const buf = await toBuffer(blob);
    writeFileSync(join(OUT_DIR, filename), buf);

    expect(filename).toMatch(/^Invoice-Acme_Trucking_LLC-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');

    // Read the file back with a fresh ExcelJS workbook — proves it's a real,
    // parseable .xlsx and that formatting persisted through write+read.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('Invoice');
    expect(ws).toBeDefined();

    // Collect every string cell value + every fill we encounter.
    const stringValues: string[] = [];
    const highlightedValues: string[] = [];
    ws!.eachRow((row) => {
      row.eachCell((cell) => {
        const v = cell.value;
        if (typeof v === 'string') {
          stringValues.push(v);
          const fill = cell.fill as ExcelJS.FillPattern | undefined;
          if (fill?.fgColor?.argb === 'FFFFF59D') highlightedValues.push(v);
        }
      });
    });

    // Content
    expect(stringValues).toContain('0001111111');
    expect(stringValues).toContain('0002222222');
    expect(stringValues).toContain('RESEARCH');
    expect(stringValues).toContain('6/01/24'); // violation_date M/DD/YY
    expect(stringValues).toContain('$500'); // amount_due
    expect(stringValues).toContain('$250'); // legal_fee
    expect(stringValues).toContain(EXPECTED_TOTAL); // LEGAL FEE total
    expect(stringValues).toContain('March 14, 2025'); // stored date
    expect(stringValues).toContain('Pay via Zelle to office@law.com.');

    // The highlighted summons row carried its yellow fill through the round-trip.
    expect(highlightedValues).toContain('0001111111');
    // The non-highlighted row did NOT.
    expect(highlightedValues).not.toContain('0002222222');

    // Column widths were applied (first column is the widest at 20).
    expect(ws!.getColumn(1).width).toBe(20);
  });
});
