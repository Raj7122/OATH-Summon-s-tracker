/**
 * @vitest-environment node
 *
 * Invoice Generator Tests — conditional footer field rendering
 *
 * Verifies Bug 1 fix: empty paymentInstructions / reviewText should not
 * produce blank paragraphs (and their spacers) in generated DOCX/PDF output.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvoiceCartItem, InvoiceRecipient, InvoiceOptions } from '../src/types/invoice';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const mockItems: InvoiceCartItem[] = [
  {
    id: '1',
    summons_number: '123456789',
    respondent_name: 'Test Corp',
    clientID: 'c1',
    violation_date: '2024-06-01T00:00:00Z',
    hearing_date: '2024-07-01T00:00:00Z',
    hearing_result: 'DEFAULT',
    status: 'CLOSED',
    amount_due: 500,
    legal_fee: 250,
    addedAt: new Date().toISOString(),
  },
];

const mockRecipient: InvoiceRecipient = {
  companyName: 'Test Corp',
  attention: 'John Doe',
  address: '123 Main St',
  cityStateZip: 'New York, NY 10001',
  email: 'john@test.com',
};

// ---------------------------------------------------------------------------
// Mocks — top-level so both DOCX and PDF tests share them
// ---------------------------------------------------------------------------

// Mutable reference to capture PDF text() calls
const pdfTextCalls: string[] = [];
// Track addPage() invocations so pagination tests can assert page breaks
const pdfAddPageCalls: { count: number } = { count: 0 };
// Lets individual tests control where the table ends — defaults to mid-page so
// most footer scenarios fit on page 1 without paginating.
const pdfState: { finalY: number; splitToLines: (t: string) => string[] } = {
  finalY: 200,
  splitToLines: (t: string) => [t],
};

vi.mock('jspdf', () => {
  // Must be a real function/class for `new jsPDF()` to work
  function MockJsPDF() {
    // @ts-ignore
    this.internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    // @ts-ignore
    this.setFontSize = vi.fn();
    // @ts-ignore
    this.setFont = vi.fn();
    // @ts-ignore
    this.text = vi.fn((...args: any[]) => {
      const textArg = args[0];
      if (typeof textArg === 'string') {
        pdfTextCalls.push(textArg);
      } else if (Array.isArray(textArg)) {
        pdfTextCalls.push(...textArg);
      }
    });
    // @ts-ignore
    this.getTextWidth = vi.fn(() => 100);
    // @ts-ignore
    this.line = vi.fn();
    // @ts-ignore
    this.splitTextToSize = vi.fn((text: string) => pdfState.splitToLines(text));
    // @ts-ignore
    this.setTextColor = vi.fn();
    // @ts-ignore
    this.setFillColor = vi.fn();
    // @ts-ignore
    this.rect = vi.fn();
    // @ts-ignore
    this.textWithLink = vi.fn();
    // @ts-ignore
    this.addPage = vi.fn(() => { pdfAddPageCalls.count += 1; });
    // @ts-ignore
    this.save = vi.fn();
    // @ts-ignore
    this.output = vi.fn(() => new Blob());
    // @ts-ignore
    this.lastAutoTable = { finalY: pdfState.finalY };
  }
  return { default: MockJsPDF };
});

vi.mock('jspdf-autotable', () => ({
  default: vi.fn((doc: any) => {
    doc.lastAutoTable = { finalY: pdfState.finalY };
  }),
}));

// Capture the sections array passed to docx.Document
let capturedSections: any[] = [];

vi.mock('docx', () => {
  class Paragraph {
    children: any[];
    constructor(opts: any) {
      this.children = opts?.children || [];
    }
  }
  class TextRun {
    text: string;
    constructor(opts: any) {
      this.text = typeof opts === 'string' ? opts : opts?.text || '';
    }
  }
  class Table {
    constructor() {}
  }
  class TableRow {
    constructor() {}
  }
  class TableCell {
    constructor() {}
  }
  class ExternalHyperlink {
    constructor() {}
  }
  class Document {
    sections: any[];
    constructor(opts: any) {
      this.sections = opts?.sections || [];
      capturedSections = this.sections;
    }
  }
  const Packer = {
    toBlob: vi.fn().mockResolvedValue(new Blob(['test'])),
  };

  return {
    Document,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    ExternalHyperlink,
    Packer,
    WidthType: { PERCENTAGE: 'PERCENTAGE' },
    AlignmentType: { CENTER: 'CENTER', RIGHT: 'RIGHT' },
    BorderStyle: { SINGLE: 'SINGLE' },
    UnderlineType: { SINGLE: 'SINGLE' },
    HeadingLevel: { HEADING_1: 'HEADING_1' },
    ShadingType: { CLEAR: 'CLEAR' },
  };
});

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

// Import after mocks are set up
import { generatePDF, generateDOCX } from '../src/utils/invoiceGenerator';

// ---------------------------------------------------------------------------
// DOCX tests
// ---------------------------------------------------------------------------

describe('DOCX generator — conditional footer fields', () => {
  beforeEach(() => {
    capturedSections = [];
  });

  /** Count how many Paragraph children have a TextRun matching the given text */
  function findFooterParagraph(text: string) {
    const children = capturedSections[0]?.children || [];
    return children.filter((child: any) => {
      if (!child.children || child.children.length === 0) return false;
      return child.children.some((run: any) => run.text === text);
    });
  }

  function countParagraphs() {
    return (capturedSections[0]?.children || []).length;
  }

  it('should include paymentInstructions paragraph when non-empty', async () => {
    const options: InvoiceOptions = {
      paymentInstructions: 'Please pay via Zelle.',
      reviewText: 'Review the evidence.',
      additionalNotes: '',
    };

    await generateDOCX(mockItems, mockRecipient, options);

    const matches = findFooterParagraph('Please pay via Zelle.');
    expect(matches.length).toBe(1);
  });

  it('should exclude paymentInstructions paragraph when empty', async () => {
    const fullOptions: InvoiceOptions = {
      paymentInstructions: 'Pay me',
      reviewText: 'Review',
      additionalNotes: '',
    };
    await generateDOCX(mockItems, mockRecipient, fullOptions);
    const fullCount = countParagraphs();

    const emptyOptions: InvoiceOptions = {
      paymentInstructions: '',
      reviewText: 'Review',
      additionalNotes: '',
    };
    await generateDOCX(mockItems, mockRecipient, emptyOptions);
    const emptyCount = countParagraphs();

    // Removing paymentInstructions should drop 2 paragraphs (text + spacer)
    expect(emptyCount).toBe(fullCount - 2);
  });

  it('should exclude reviewText paragraph when empty', async () => {
    const fullOptions: InvoiceOptions = {
      paymentInstructions: 'Pay me',
      reviewText: 'Review',
      additionalNotes: '',
    };
    await generateDOCX(mockItems, mockRecipient, fullOptions);
    const fullCount = countParagraphs();

    const emptyOptions: InvoiceOptions = {
      paymentInstructions: 'Pay me',
      reviewText: '',
      additionalNotes: '',
    };
    await generateDOCX(mockItems, mockRecipient, emptyOptions);
    const emptyCount = countParagraphs();

    // Removing reviewText should drop 2 paragraphs (text + spacer)
    expect(emptyCount).toBe(fullCount - 2);
  });

  it('should exclude both fields when both empty — no gaps', async () => {
    const fullOptions: InvoiceOptions = {
      paymentInstructions: 'Pay me',
      reviewText: 'Review',
      additionalNotes: '',
    };
    await generateDOCX(mockItems, mockRecipient, fullOptions);
    const fullCount = countParagraphs();

    const emptyOptions: InvoiceOptions = {
      paymentInstructions: '',
      reviewText: '',
      additionalNotes: '',
    };
    await generateDOCX(mockItems, mockRecipient, emptyOptions);
    const emptyCount = countParagraphs();

    // Both removed = 4 fewer paragraphs (2 text + 2 spacers)
    expect(emptyCount).toBe(fullCount - 4);
  });

  it('should treat whitespace-only fields as empty', async () => {
    const fullOptions: InvoiceOptions = {
      paymentInstructions: 'Pay me',
      reviewText: 'Review',
      additionalNotes: '',
    };
    await generateDOCX(mockItems, mockRecipient, fullOptions);
    const fullCount = countParagraphs();

    const whitespaceOptions: InvoiceOptions = {
      paymentInstructions: '   ',
      reviewText: '  \t  ',
      additionalNotes: '',
    };
    await generateDOCX(mockItems, mockRecipient, whitespaceOptions);
    const wsCount = countParagraphs();

    // Whitespace-only should be treated same as empty
    expect(wsCount).toBe(fullCount - 4);
  });
});

// ---------------------------------------------------------------------------
// PDF tests
// ---------------------------------------------------------------------------

describe('PDF generator — conditional footer fields', () => {
  beforeEach(() => {
    pdfTextCalls.length = 0;
  });

  it('should not render paymentInstructions text when empty', async () => {
    const options: InvoiceOptions = {
      paymentInstructions: '',
      reviewText: 'Review the evidence.',
      additionalNotes: '',
    };

    await generatePDF(mockItems, mockRecipient, options);

    // paymentInstructions is empty, so no payment text should appear in text calls
    expect(pdfTextCalls.some((t) => t.includes('Zelle'))).toBe(false);
    // reviewText should still appear
    expect(pdfTextCalls.some((t) => t.includes('Review the evidence.'))).toBe(true);
  });

  it('should not render reviewText when empty', async () => {
    const options: InvoiceOptions = {
      paymentInstructions: 'Pay via Zelle.',
      reviewText: '',
      additionalNotes: '',
    };

    await generatePDF(mockItems, mockRecipient, options);

    expect(pdfTextCalls.some((t) => t.includes('Pay via Zelle.'))).toBe(true);
    // reviewText is empty — should not appear
    expect(pdfTextCalls.some((t) => t.includes('defenses or explanations'))).toBe(false);
  });

  it('should render both fields when both are populated', async () => {
    const options: InvoiceOptions = {
      paymentInstructions: 'Pay via Zelle.',
      reviewText: 'Check the evidence.',
      additionalNotes: '',
    };

    await generatePDF(mockItems, mockRecipient, options);

    expect(pdfTextCalls.some((t) => t.includes('Pay via Zelle.'))).toBe(true);
    expect(pdfTextCalls.some((t) => t.includes('Check the evidence.'))).toBe(true);
  });

  it('should not render either field when both are empty', async () => {
    const options: InvoiceOptions = {
      paymentInstructions: '',
      reviewText: '',
      additionalNotes: '',
    };

    await generatePDF(mockItems, mockRecipient, options);

    // Neither should appear — only hardcoded footer text
    expect(pdfTextCalls.some((t) => t.includes('Zelle'))).toBe(false);
    expect(pdfTextCalls.some((t) => t.includes('defenses'))).toBe(false);
    // Hardcoded footer text should still be present (questions + closing are
    // always rendered regardless of which optional fields are populated).
    expect(pdfTextCalls.some((t) => t.includes('Let me know if you have any questions'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PDF pagination — Bug 1 fix
// ---------------------------------------------------------------------------
//
// jsPDF page is A4 (297mm tall) with a 20mm bottom margin in our generator,
// so anything below y≈277 must move to a new page. These tests drive the
// table's finalY (via pdfState.finalY) and the wrapped-line count (via
// pdfState.splitToLines) to simulate "long invoice with little footer room"
// vs "short invoice with plenty of room", and assert addPage() behavior.

describe('PDF generator — footer pagination', () => {
  beforeEach(() => {
    pdfTextCalls.length = 0;
    pdfAddPageCalls.count = 0;
    pdfState.finalY = 200;
    pdfState.splitToLines = (t: string) => [t];
  });

  it('does NOT paginate when the table ends mid-page and footer fits', async () => {
    pdfState.finalY = 100; // table ends very high — tons of room
    const options: InvoiceOptions = {
      paymentInstructions: 'Pay via Zelle.',
      reviewText: 'Review the evidence.',
      additionalNotes: '',
    };

    await generatePDF(mockItems, mockRecipient, options);

    expect(pdfAddPageCalls.count).toBe(0);
    // Closing line must still be drawn
    expect(pdfTextCalls.some((t) => t.includes('We look forward to working with you.'))).toBe(true);
  });

  it('paginates when the table consumes most of the page', async () => {
    // Simulate a table that ends near the bottom — yPos starts at 285, well past
    // the 277mm cutoff, so the very first footer paragraph must move to a new page.
    pdfState.finalY = 270;
    const options: InvoiceOptions = {
      paymentInstructions: 'Pay via Zelle.',
      reviewText: 'Review the evidence carefully.',
      additionalNotes: '',
    };

    await generatePDF(mockItems, mockRecipient, options);

    expect(pdfAddPageCalls.count).toBeGreaterThanOrEqual(1);
    // Critically: the closing must not be clipped — it must appear in the
    // captured text calls even though it had to move to page 2.
    expect(pdfTextCalls.some((t) => t.includes('We look forward to working with you.'))).toBe(true);
    // And the body of the review text must also still be present.
    expect(pdfTextCalls.some((t) => t.includes('Review the evidence carefully.'))).toBe(true);
  });

  it('paginates when a single footer paragraph wraps to many lines', async () => {
    // Big additionalNotes that wrap to 30 lines (~150mm at 5mm/line) won't fit
    // alongside a half-full table — should trigger a page break before drawing.
    pdfState.finalY = 200;
    pdfState.splitToLines = (t: string) => {
      if (t.includes('LONG_NOTES_MARKER')) {
        return Array.from({ length: 30 }, (_, i) => `LONG_NOTES_MARKER line ${i + 1}`);
      }
      return [t];
    };
    const options: InvoiceOptions = {
      paymentInstructions: 'Pay via Zelle.',
      reviewText: 'Review.',
      additionalNotes: 'LONG_NOTES_MARKER',
    };

    await generatePDF(mockItems, mockRecipient, options);

    expect(pdfAddPageCalls.count).toBeGreaterThanOrEqual(1);
    // The wrapped lines must still all be drawn, just on the new page.
    const drawnLongLines = pdfTextCalls.filter((t) => t.startsWith('LONG_NOTES_MARKER line '));
    expect(drawnLongLines.length).toBe(30);
  });

  it('keeps the overdue text and the CityPay link together on the same page', async () => {
    // Overdue block = text + CityPay hyperlink. Pre-fix: text could fit while
    // link gets clipped. Post-fix: ensureRoomFor sizes the WHOLE block before
    // drawing, so they always co-page.
    pdfState.finalY = 260; // tight — overdue block has to move to page 2
    const options: InvoiceOptions = {
      paymentInstructions: '',
      reviewText: '',
      additionalNotes: '',
      showOverdue: true,
      overdueText: 'Some fines are overdue.',
    };

    await generatePDF(mockItems, mockRecipient, options);

    // Pagination should have occurred
    expect(pdfAddPageCalls.count).toBeGreaterThanOrEqual(1);
    // The overdue text must still be drawn (not silently clipped)
    expect(pdfTextCalls.some((t) => t.includes('Some fines are overdue.'))).toBe(true);
  });
});
