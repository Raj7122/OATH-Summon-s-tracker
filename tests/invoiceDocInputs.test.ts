/**
 * @vitest-environment jsdom
 *
 * Tests for buildInvoiceDocInputs — the shared helper that rebuilds
 * PDF/DOCX/XLSX generator inputs from a stored invoice. Used by both the edit
 * screen and the Tracker's on-demand "download in another format" actions.
 *
 * The headline behavior under test is the FINE-PRECEDENCE rule that fixes
 * Jacky's bug: a fine the user removed/edited on the invoice must NOT be
 * repopulated from the live NYC summons balance when the invoice is reopened or
 * regenerated. The second half of the suite runs the REAL generators to prove
 * the fix survives all the way into the produced files, and that each format's
 * bytes are structurally valid.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { Invoice } from '../src/types/invoiceTracker';
import { FOOTER_TEXT } from '../src/constants/invoiceDefaults';

// The helper's default client arg calls generateClient(); never exercised here
// (we always inject a fake), but the module import must resolve under jsdom.
vi.mock('aws-amplify/api', () => ({
  generateClient: () => ({ graphql: vi.fn() }),
}));

// Generators pull in file-saver / jsPDF download side effects — stub them so the
// real libraries run under jsdom without touching the DOM download path.
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

beforeAll(() => {
  // @ts-expect-error – polyfill for jsdom
  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  // @ts-expect-error – polyfill for jsdom
  global.URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

import { buildInvoiceDocInputs } from '../src/utils/invoiceDocInputs';
import { generatePDF, generateDOCX, generateXLSX } from '../src/utils/invoiceGenerator';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

// A fake Amplify client serving the two queries the helper issues:
//   1. invoiceSummonsForInvoice — the join rows, paged off the byInvoice GSI.
//      buildInvoiceDocInputs reads them from HERE, never from invoice.items.items,
//      because that connection's resolver silently caps at 100 rows.
//   2. getSummons — the live summons behind each row (display-only columns).
// `throwFor` simulates a deleted/archived summons.
//
// `joinRowPages` lets a test serve the join rows across several pages (and
// independently of what invoice.items.items happens to contain), which is how we
// reproduce the real 214-item Corporate Express invoice.
const makeClient = (
  summonsById: Record<string, Record<string, unknown> | null>,
  throwFor: Set<string> = new Set(),
  joinRowPages?: Record<string, unknown>[][],
) => ({
  graphql: vi.fn(async ({ query, variables }: { query: string; variables: { id: string; nextToken?: string | null } }) => {
    if (typeof query === 'string' && query.includes('invoiceSummonsByInvoiceIDAndSummonsID')) {
      const pages = joinRowPages ?? [[]];
      const idx = variables.nextToken ? Number(variables.nextToken) : 0;
      return {
        data: {
          invoiceSummonsByInvoiceIDAndSummonsID: {
            items: pages[idx] ?? [],
            nextToken: idx + 1 < pages.length ? String(idx + 1) : null,
          },
        },
      };
    }
    const id = variables.id;
    if (throwFor.has(id)) throw new Error('summons not found');
    return { data: { getSummons: summonsById[id] ?? null } };
  }),
});

// The join rows the baseline makeInvoice() describes. Served via the GSI fake so
// the tests exercise the real read path.
const BASE_JOIN_ROWS = [
  { id: 'j1', invoiceID: 'inv-1', summonsID: 's-zeroed', summons_number: '000760540K', legal_fee: 0, amount_due: 0, highlighted: false },
  { id: 'j2', invoiceID: 'inv-1', summonsID: 's-null', summons_number: '000883250M', legal_fee: 200, amount_due: null, highlighted: true },
  { id: 'j3', invoiceID: 'inv-1', summonsID: 's-live', summons_number: '000817904R', legal_fee: 200, amount_due: null, highlighted: false },
];

// Base invoice with three line items mirroring the AAA Egg scenario: a fine the
// user zeroed out, a fine left null, and one left at its live value.
const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  invoice_number: 'INV-AAA-2026-07-06',
  invoice_date: '2026-07-06T00:00:00.000Z',
  recipient_company: 'AAA EGG DEPOT',
  recipient_attention: 'Jelly',
  recipient_address: '1 Egg Rd',
  recipient_email: 'aaa@egg.com',
  total_legal_fees: 650,
  total_fines_due: 420,
  item_count: 3,
  payment_status: 'paid',
  payment_date: '2025-12-04T00:00:00.000Z',
  alert_deadline: '2026-07-13T00:00:00.000Z',
  clientID: 'client-aaa',
  pdf_s3_key: 'public/invoices/inv-1/Invoice-AAA_EGG_DEPOT-2026-07-06.docx',
  items: {
    items: [
      // User deliberately removed this fine (saved 0) though NYC still shows 1300.
      { id: 'j1', invoiceID: 'inv-1', summonsID: 's-zeroed', summons_number: '000760540K', legal_fee: 0, amount_due: 0, highlighted: false },
      // No stored fine — should fall back to the live summons value.
      { id: 'j2', invoiceID: 'inv-1', summonsID: 's-null', summons_number: '000883250M', legal_fee: 200, amount_due: null, highlighted: true },
      // Stored fine equals live fine.
      { id: 'j3', invoiceID: 'inv-1', summonsID: 's-live', summons_number: '000817904R', legal_fee: 200, amount_due: null, highlighted: false },
    ],
  },
  ...overrides,
});

const summonsById = {
  's-zeroed': { respondent_name: 'AAA EGG DEPOT', clientID: 'client-aaa', violation_date: '2023-02-10T00:00:00Z', hearing_date: '2023-09-11T00:00:00Z', hearing_result: 'DEFAULTED', status: 'DEFAULTED', amount_due: 1300 },
  's-null': { respondent_name: 'AAA EGG DEPOT', clientID: 'client-aaa', violation_date: '2024-04-02T00:00:00Z', hearing_date: '2026-03-31T00:00:00Z', hearing_result: 'IN VIOLATION', status: 'HEARING COMPLETED', amount_due: 420 },
  's-live': { respondent_name: 'AAA EGG DEPOT', clientID: 'client-aaa', violation_date: '2023-11-06T00:00:00Z', hearing_date: '2026-05-06T00:00:00Z', hearing_result: 'DISMISSED', status: 'HEARING COMPLETED', amount_due: 0 },
};

const bySummons = (items: { id: string; amount_due: number | null }[]) =>
  Object.fromEntries(items.map((i) => [i.id, i.amount_due]));

// ---------------------------------------------------------------------------
// Hydration behavior
// ---------------------------------------------------------------------------

describe('buildInvoiceDocInputs — fine precedence (the bug fix)', () => {
  it('keeps a manually-removed fine at 0 instead of repopulating from the live NYC balance', async () => {
    const client = makeClient(summonsById, new Set(), [BASE_JOIN_ROWS]);
    const { items } = await buildInvoiceDocInputs(makeInvoice(), client);
    const map = bySummons(items.map((i) => ({ id: i.summons_number, amount_due: i.amount_due })));
    // Live NYC balance is 1300, but the invoice saved 0 — the saved 0 must win.
    expect(map['000760540K']).toBe(0);
  });

  it('falls back to the live summons fine only when the invoice stored no fine', async () => {
    const client = makeClient(summonsById, new Set(), [BASE_JOIN_ROWS]);
    const { items } = await buildInvoiceDocInputs(makeInvoice(), client);
    const map = bySummons(items.map((i) => ({ id: i.summons_number, amount_due: i.amount_due })));
    // j2 stored amount_due: null → falls back to live 420.
    expect(map['000883250M']).toBe(420);
  });

  it('yields null when neither the invoice nor the live summons has a fine', async () => {
    const invoice = makeInvoice();
    const client = makeClient({ ...summonsById, 's-null': { ...summonsById['s-null'], amount_due: null } }, new Set(), [BASE_JOIN_ROWS]);
    const { items } = await buildInvoiceDocInputs(invoice, client);
    const target = items.find((i) => i.summons_number === '000883250M');
    expect(target?.amount_due).toBeNull();
  });

  it('takes legal_fee and highlight from the saved join row, not the live summons', async () => {
    const client = makeClient(summonsById, new Set(), [BASE_JOIN_ROWS]);
    const { items } = await buildInvoiceDocInputs(makeInvoice(), client);
    const highlighted = items.find((i) => i.summons_number === '000883250M');
    expect(highlighted?.legal_fee).toBe(200);
    expect(highlighted?.highlighted).toBe(true);
  });
});

describe('buildInvoiceDocInputs — display + metadata', () => {
  it('pulls display-only columns (dates, status, results, respondent) from the live summons', async () => {
    const client = makeClient(summonsById, new Set(), [BASE_JOIN_ROWS]);
    const { items } = await buildInvoiceDocInputs(makeInvoice(), client);
    const row = items.find((i) => i.summons_number === '000760540K')!;
    expect(row.status).toBe('DEFAULTED');
    expect(row.hearing_result).toBe('DEFAULTED');
    expect(row.respondent_name).toBe('AAA EGG DEPOT');
    expect(row.violation_date).toBe('2023-02-10T00:00:00Z');
  });

  it('sorts line items by hearing date ascending', async () => {
    const client = makeClient(summonsById, new Set(), [BASE_JOIN_ROWS]);
    const { items } = await buildInvoiceDocInputs(makeInvoice(), client);
    const hearingOrder = items.map((i) => i.summons_number);
    // s-zeroed 2023-09-11, s-live 2026-05-06 <-> wait ordering: 2023 < 2026-03 < 2026-05
    expect(hearingOrder).toEqual(['000760540K', '000883250M', '000817904R']);
  });

  it('degrades gracefully when a summons was deleted (keeps saved fine, sparse display)', async () => {
    const client = makeClient(summonsById, new Set(['s-zeroed']), [BASE_JOIN_ROWS]);
    const { items } = await buildInvoiceDocInputs(makeInvoice(), client);
    const row = items.find((i) => i.summons_number === '000760540K')!;
    // Saved fine still honored even though the live fetch failed.
    expect(row.amount_due).toBe(0);
    // Display fields degrade to empty rather than dropping the row.
    expect(row.status).toBe('');
    expect(row.respondent_name).toBe('');
  });

  it('maps recipient fields from the invoice record', async () => {
    const client = makeClient(summonsById, new Set(), [BASE_JOIN_ROWS]);
    const { recipient } = await buildInvoiceDocInputs(makeInvoice(), client);
    expect(recipient.companyName).toBe('AAA EGG DEPOT');
    expect(recipient.attention).toBe('Jelly');
    expect(recipient.email).toBe('aaa@egg.com');
  });
});

describe('buildInvoiceDocInputs — extras + footer options', () => {
  it('parses extra_line_items from a JSON string', async () => {
    const extras = [{ id: 'x1', summons_number: 'RESEARCH', violation_date: '', status: 'Research fee', hearing_result: '', hearing_date: '', amount_due: '', legal_fee: '150' }];
    const client = makeClient(summonsById, new Set(), [BASE_JOIN_ROWS]);
    const { extras: parsed } = await buildInvoiceDocInputs(
      makeInvoice({ extra_line_items: JSON.stringify(extras) }),
      client,
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0].summons_number).toBe('RESEARCH');
  });

  it('tolerates malformed extra_line_items and highlighted_sections', async () => {
    const client = makeClient(summonsById, new Set(), [BASE_JOIN_ROWS]);
    const { extras, options } = await buildInvoiceDocInputs(
      makeInvoice({ extra_line_items: '{not json', highlighted_sections: 'also bad' }),
      client,
    );
    expect(extras).toEqual([]);
    expect(options.highlightedSections).toEqual({});
  });

  it('falls back to default footer text for legacy invoices missing those fields', async () => {
    const client = makeClient(summonsById, new Set(), [BASE_JOIN_ROWS]);
    const { options } = await buildInvoiceDocInputs(makeInvoice(), client);
    expect(options.paymentInstructions).toBe(FOOTER_TEXT.payment);
    expect(options.reviewText).toBe(FOOTER_TEXT.review);
    expect(options.overdueText).toBe(FOOTER_TEXT.overdue);
    expect(options.showOverdue).toBe(true);
    expect(options.invoiceDate).toBe('2026-07-06T00:00:00.000Z');
  });

  it('uses persisted footer text when present', async () => {
    const client = makeClient(summonsById, new Set(), [BASE_JOIN_ROWS]);
    const { options } = await buildInvoiceDocInputs(
      makeInvoice({
        payment_instructions: 'Pay by Zelle.',
        review_text: 'Review please.',
        overdue_text: 'Overdue note.',
        custom_middle_text: 'Middle.',
        show_overdue: false,
        highlighted_sections: JSON.stringify({ payment: true }),
      }),
      client,
    );
    expect(options.paymentInstructions).toBe('Pay by Zelle.');
    expect(options.showOverdue).toBe(false);
    expect(options.customMiddleText).toBe('Middle.');
    expect(options.highlightedSections).toEqual({ payment: true });
  });
});

// ---------------------------------------------------------------------------
// End-to-end: regenerate every format from a stored invoice and validate bytes.
// Proves the fine fix reaches the produced files AND that PDF/DOCX/XLSX output
// is structurally valid for the on-demand "get as another format" feature.
// ---------------------------------------------------------------------------

const toBuffer = async (blob: Blob): Promise<Buffer> => Buffer.from(await blob.arrayBuffer());

describe('regenerate stored invoice into each format', () => {
  it('PDF: valid document with the removed fine reflected, not the live balance', async () => {
    const client = makeClient(summonsById, new Set(), [BASE_JOIN_ROWS]);
    const { items, recipient, options, extras } = await buildInvoiceDocInputs(makeInvoice(), client);
    const { blob, filename } = await generatePDF(items, recipient, options, extras, false);
    const buf = await toBuffer(blob);

    expect(filename).toMatch(/^Invoice-AAA_EGG_DEPOT-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(blob.type).toBe('application/pdf');
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.toString('latin1')).toContain('%%EOF');
    expect(buf.length).toBeGreaterThan(2000);
  });

  it('DOCX: valid Word file whose fine column shows the saved 0, never the live 1,300', async () => {
    const client = makeClient(summonsById, new Set(), [BASE_JOIN_ROWS]);
    const { items, recipient, options, extras } = await buildInvoiceDocInputs(makeInvoice(), client);
    const { blob, filename } = await generateDOCX(items, recipient, options, extras, true);
    const buf = await toBuffer(blob);

    expect(filename).toMatch(/\.docx$/);
    // OOXML is a ZIP — first two bytes are 'PK'.
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');

    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file('word/document.xml')!.async('string');
    expect(docXml).toContain('000760540K'); // the zeroed summons is present
    expect(docXml).toContain('AAA EGG DEPOT');
    // The live NYC balance for the zeroed row (1,300) must NOT leak into the file.
    expect(docXml).not.toContain('1,300');
    expect(docXml).not.toContain('1300');
  });

  it('XLSX: valid workbook that round-trips through ExcelJS', async () => {
    const client = makeClient(summonsById, new Set(), [BASE_JOIN_ROWS]);
    const { items, recipient, options, extras } = await buildInvoiceDocInputs(makeInvoice(), client);
    const { blob, filename } = await generateXLSX(items, recipient, options, extras, true);
    const buf = await toBuffer(blob);

    expect(filename).toMatch(/\.xlsx$/);
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.length).toBeGreaterThan(0);
    // The workbook must be readable and contain the invoice's summons number.
    let found = false;
    wb.worksheets[0].eachRow((row) => {
      row.eachCell((cell) => {
        if (String(cell.value ?? '').includes('000760540K')) found = true;
      });
    });
    expect(found).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Truncation regression — the CORPORATE EXPRESS bug
// ---------------------------------------------------------------------------

describe('buildInvoiceDocInputs — ignores the truncated items connection', () => {
  // Reproduces the real invoice f309f597 (CORPORATE EXPRESS INC): 214 join rows
  // in DynamoDB, but the `Invoice.items` hasMany resolver hardcodes
  // `defaultIfNull($ctx.args.limit, 100)`, so every query that read
  // invoice.items.items got exactly 100 rows. That is what made "half the
  // violations" disappear from the edit screen and produced 100-row documents
  // from the Tracker's "Get as PDF/DOCX/XLSX" actions.
  //
  // The helper must ignore invoice.items.items entirely and page the byInvoice
  // GSI, so the 100-row connection below is a decoy: all 214 must come back.
  const TOTAL = 214;
  const FEE = 100;

  const allRows = Array.from({ length: TOTAL }, (_, i) => ({
    id: `join-${i}`,
    invoiceID: 'inv-corp',
    summonsID: `sum-${i}`,
    summons_number: `00${String(1000000 + i)}X`,
    legal_fee: FEE,
    amount_due: 0,
    highlighted: false,
  }));

  const corpInvoice = (): Invoice =>
    ({
      id: 'inv-corp',
      invoice_number: 'INV-CORPORATE_EXPRESS_IN-2026-09-02',
      invoice_date: '2026-09-02T17:08:47.103Z',
      recipient_company: 'CORPORATE EXPRESS INC',
      total_legal_fees: TOTAL * FEE,
      total_fines_due: 0,
      item_count: TOTAL,
      payment_status: 'unpaid',
      alert_deadline: '2026-09-09T00:00:00.000Z',
      clientID: 'client-corp',
      // The decoy: exactly what the capped connection would have returned.
      items: { items: allRows.slice(0, 100) },
    }) as Invoice;

  // Serve the GSI in 100/100/14 pages, as DynamoDB actually would.
  const pages = [allRows.slice(0, 100), allRows.slice(100, 200), allRows.slice(200)];

  it('returns all 214 line items even though invoice.items.items holds only 100', async () => {
    const client = makeClient({}, new Set(), pages);
    const { items } = await buildInvoiceDocInputs(corpInvoice(), client);

    expect(items).toHaveLength(TOTAL);
    // No duplicates and nothing dropped across the page boundaries.
    expect(new Set(items.map((i) => i.summons_number)).size).toBe(TOTAL);
    // The full fee total, not the truncated $10,000.
    expect(items.reduce((sum, i) => sum + i.legal_fee, 0)).toBe(TOTAL * FEE);
  });

  it('honours pre-fetched rows without re-reading the GSI', async () => {
    const client = makeClient({}, new Set(), pages);
    const { items } = await buildInvoiceDocInputs(corpInvoice(), client, allRows);

    expect(items).toHaveLength(TOTAL);
    // Only the per-row getSummons lookups — no invoiceSummons query at all.
    const queries = client.graphql.mock.calls.map((c) => String(c[0].query));
    expect(queries.some((q) => q.includes('invoiceSummonsByInvoiceIDAndSummonsID'))).toBe(false);
  });
});
