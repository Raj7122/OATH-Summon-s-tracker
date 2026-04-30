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

vi.mock('jspdf', () => {
  // Must be a real function/class for `new jsPDF()` to work
  function MockJsPDF() {
    // @ts-ignore
    this.internal = { pageSize: { getWidth: () => 210 } };
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
    this.splitTextToSize = vi.fn((text: string) => [text]);
    // @ts-ignore
    this.setTextColor = vi.fn();
    // @ts-ignore
    this.textWithLink = vi.fn();
    // @ts-ignore
    this.save = vi.fn();
    // @ts-ignore
    this.lastAutoTable = { finalY: 200 };
  }
  return { default: MockJsPDF };
});

vi.mock('jspdf-autotable', () => ({
  default: vi.fn((doc: any) => {
    doc.lastAutoTable = { finalY: 200 };
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
    // Hardcoded footer text should still be present
    expect(pdfTextCalls.some((t) => t.includes('overdue'))).toBe(true);
  });
});
