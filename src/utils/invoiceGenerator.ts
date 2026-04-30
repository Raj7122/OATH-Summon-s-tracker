import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Document,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  AlignmentType,
  BorderStyle,
  Packer,
  UnderlineType,
  HeadingLevel,
  ExternalHyperlink,
  ShadingType,
} from 'docx';
import { saveAs } from 'file-saver';
import { InvoiceCartItem, InvoiceExtraLineItem, InvoiceRecipient, InvoiceOptions } from '../types/invoice';
import {
  SENDER,
  INVOICE_SUBJECT,
  INVOICE_SUBTITLE,
  COURT_NAME,
  SERVICES_DESCRIPTION,
  FOOTER_TEXT,
} from '../constants/invoiceDefaults';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

// Helper to format dates as M/DD/YY
const formatDate = (dateString: string | null): string => {
  if (!dateString) return '';
  // Use dayjs.utc() to avoid timezone shift on date-only fields stored as UTC midnight
  const date = dayjs.utc(dateString);
  return date.isValid() ? date.format('M/DD/YY') : '';
};

// Helper to format currency
const formatCurrency = (amount: number | null): string => {
  if (amount === null || amount === undefined) return 'N/A';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

// Helper to format currency with decimals for totals
const formatCurrencyWithDecimals = (amount: number): string => {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Parse a user-typed currency string into a number for totals math.
// Accepts "250", "$250.00", "1,500", etc. Returns 0 for empty/non-numeric input.
export const parseExtraAmount = (raw: string | null | undefined): number => {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return 0;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

// Sum extras' legal_fee contributions. Extras' amount_due is intentionally
// excluded from totals per user spec (Fines Due rolls only from summons rows).
export const sumExtrasLegalFees = (extras: InvoiceExtraLineItem[] | undefined): number => {
  if (!extras || extras.length === 0) return 0;
  return extras.reduce((sum, e) => sum + parseExtraAmount(e.legal_fee), 0);
};

// Yellow marker color used for both PDF (RGB) and DOCX (hex) highlights.
const HIGHLIGHT_RGB: [number, number, number] = [255, 245, 157];
const HIGHLIGHT_HEX = 'FFF59D';

// Draw text with an optional yellow highlight box behind it (jsPDF).
// jsPDF's text() draws at the baseline; we position the rect slightly above
// the baseline (~ascent for size 10) and size it to cover all wrapped lines.
const drawFooterParagraph = (
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  highlight: boolean,
  lineHeight = 5,
): number => {
  const lines = doc.splitTextToSize(text, width);
  if (highlight) {
    doc.setFillColor(...HIGHLIGHT_RGB);
    doc.rect(x - 1, y - 3.5, width + 2, lines.length * lineHeight + 1, 'F');
  }
  doc.text(lines, x, y);
  return lines.length * lineHeight;
};

// Build the docx shading config for a highlighted paragraph or cell.
const docxHighlightShading = {
  type: ShadingType.CLEAR,
  fill: HIGHLIGHT_HEX,
  color: 'auto',
} as const;

/**
 * Generate PDF invoice using jsPDF
 */
export const generatePDF = async (
  items: InvoiceCartItem[],
  recipient: InvoiceRecipient,
  options: InvoiceOptions,
  extras: InvoiceExtraLineItem[] = []
): Promise<{ blob: Blob; filename: string }> => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let yPos = 20;

  // Header - Law Office Name (left side)
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(SENDER.name, margin, yPos);
  const nameWidth = doc.getTextWidth(SENDER.name);

  // Title underlined - centered under name
  yPos += 6;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const titleWidth = doc.getTextWidth(SENDER.title);
  const titleX = margin + (nameWidth - titleWidth) / 2;
  doc.text(SENDER.title, titleX, yPos);
  // Draw underline (centered with title)
  doc.line(titleX, yPos + 1, titleX + titleWidth, yPos + 1);

  // Right side - Address block
  const rightX = pageWidth - margin;
  let rightY = 20;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(SENDER.address, rightX, rightY, { align: 'right' });
  rightY += 5;
  doc.text(SENDER.cityStateZip, rightX, rightY, { align: 'right' });
  rightY += 5;
  doc.text(`${SENDER.phone}`, rightX, rightY, { align: 'right' });
  rightY += 5;
  doc.text(`${SENDER.fax}`, rightX, rightY, { align: 'right' });
  rightY += 5;
  doc.text(SENDER.email, rightX, rightY, { align: 'right' });

  // Date
  rightY += 8;
  const invoiceDate = dayjs().format('MMMM D, YYYY');
  doc.text(invoiceDate, rightX, rightY, { align: 'right' });

  // Recipient block - Contact name first, then company, address, etc.
  yPos = 50;
  doc.setFontSize(10);
  if (recipient.attention) {
    doc.text(recipient.attention, margin, yPos);
    yPos += 5;
  }
  if (recipient.companyName) {
    doc.text(recipient.companyName, margin, yPos);
    yPos += 5;
  }
  if (recipient.address) {
    doc.text(recipient.address, margin, yPos);
    yPos += 5;
  }
  if (recipient.cityStateZip) {
    doc.text(recipient.cityStateZip, margin, yPos);
    yPos += 5;
  }
  if (recipient.email) {
    doc.text(`Email: ${recipient.email}`, margin, yPos);
    yPos += 5;
  }

  // INVOICE title
  yPos += 10;
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', pageWidth / 2, yPos, { align: 'center' });
  yPos += 6;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('And Case Status', pageWidth / 2, yPos, { align: 'center' });

  // Re: section
  yPos += 12;
  doc.setFontSize(10);
  doc.text('Re:', margin, yPos);
  const reX = margin + 15;
  doc.text(INVOICE_SUBJECT, reX, yPos);
  yPos += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(INVOICE_SUBTITLE, reX, yPos);
  doc.setFont('helvetica', 'normal');
  yPos += 5;
  doc.text(`Ticket No.:`, reX, yPos);
  doc.text('See below', reX + 30, yPos);
  yPos += 5;
  doc.text(`Defendant:`, reX, yPos);
  doc.setFont('helvetica', 'bold');
  doc.text(recipient.companyName || 'COMPANY NAME', reX + 30, yPos);
  doc.setFont('helvetica', 'normal');
  yPos += 5;
  doc.text(`Court:`, reX, yPos);
  doc.text(COURT_NAME, reX + 30, yPos);
  yPos += 5;
  doc.text(`Court Dates:`, reX, yPos);
  doc.text('As described below', reX + 30, yPos);

  // Services description
  yPos += 12;
  doc.setFontSize(10);
  const splitText = doc.splitTextToSize(SERVICES_DESCRIPTION, pageWidth - 2 * margin);
  doc.text(splitText, margin, yPos);
  yPos += splitText.length * 5;

  // LEGAL FEE total (right aligned, large). Includes extras' legal_fee.
  const totalLegalFees =
    items.reduce((sum, item) => sum + item.legal_fee, 0) + sumExtrasLegalFees(extras);
  yPos += 5;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('LEGAL FEE', rightX, yPos, { align: 'right' });
  yPos += 8;
  doc.setFontSize(16);
  doc.text(formatCurrencyWithDecimals(totalLegalFees), rightX, yPos, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  // Data table
  yPos += 10;
  autoTable(doc, {
    startY: yPos,
    head: [
      [
        { content: 'Summons\nNumber', styles: { halign: 'left' } },
        { content: 'Violation Date', styles: { halign: 'left' } },
        { content: 'Hearing Status', styles: { halign: 'left' } },
        { content: 'Results', styles: { halign: 'left' } },
        { content: 'Hearing Date', styles: { halign: 'left' } },
        { content: 'FINE\nDUE', styles: { halign: 'right' } },
        { content: 'LEGAL FEE', styles: { halign: 'right' } },
      ],
    ],
    body: [
      ...items.map((item) => [
        item.summons_number,
        formatDate(item.violation_date),
        item.status || '',
        item.hearing_result || '',
        formatDate(item.hearing_date),
        formatCurrency(item.amount_due),
        formatCurrency(item.legal_fee),
      ]),
      ...extras.map((e) => [
        e.summons_number,
        e.violation_date,
        e.status,
        e.hearing_result,
        e.hearing_date,
        e.amount_due,
        e.legal_fee,
      ]),
    ],
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 9,
      lineWidth: 0.1,
      lineColor: [0, 0, 0],
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontSize: 9,
      lineWidth: 0.1,
      lineColor: [0, 0, 0],
    },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 22 },
      2: { cellWidth: 28 },
      3: { cellWidth: 25 },
      4: { cellWidth: 22 },
      5: { cellWidth: 20, halign: 'right' },
      6: { cellWidth: 25, halign: 'right' },
    },
    margin: { left: margin, right: margin },
    theme: 'grid',
    // Keep rows intact at page boundaries. Without this, a wrapped cell
    // (e.g. extra line with "STATUS REVIEW") can be sliced between its
    // lines — first line on page 1, second on page 2.
    rowPageBreak: 'avoid',
    // Apply yellow background to body rows whose corresponding cart item or
    // extra has highlighted=true. Body order: items[] then extras[].
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const idx = data.row.index;
      const isHighlighted =
        idx < items.length
          ? !!items[idx]?.highlighted
          : !!extras[idx - items.length]?.highlighted;
      if (isHighlighted) {
        data.cell.styles.fillColor = HIGHLIGHT_RGB;
      }
    },
  });

  // Get the final Y position after the table
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  yPos = finalY + 15;

  // Footer text - editable fields from options, rest hardcoded from FOOTER_TEXT.
  // Highlighted paragraphs render with a yellow rectangle behind the text.
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  const textWidth = pageWidth - 2 * margin;
  const hl = options.highlightedSections ?? {};

  // 1. Payment Instructions (editable, conditional to avoid gap when empty)
  if (options.paymentInstructions.trim()) {
    const used = drawFooterParagraph(doc, options.paymentInstructions, margin, yPos, textWidth, !!hl.payment);
    yPos += used + 5;
  }

  // 2. Review Text (editable, conditional to avoid gap when empty)
  if (options.reviewText.trim()) {
    const used = drawFooterParagraph(doc, options.reviewText, margin, yPos, textWidth, !!hl.review);
    yPos += used + 10;
  }

  // 3. Overdue Section (toggleable) — highlight wraps both the text and the CityPay link.
  if (options.showOverdue) {
    const overdueLines = doc.splitTextToSize(options.overdueText, textWidth);
    const linkLineHeight = 5;
    const blockHeight = overdueLines.length * 5 + linkLineHeight + 1;
    if (hl.overdue) {
      doc.setFillColor(...HIGHLIGHT_RGB);
      doc.rect(margin - 1, yPos - 3.5, textWidth + 2, blockHeight, 'F');
    }
    doc.text(overdueLines, margin, yPos);
    yPos += overdueLines.length * 5 + 5;

    // Payment link
    doc.setTextColor(0, 0, 255);
    doc.textWithLink(FOOTER_TEXT.cityPayUrl, margin, yPos, { url: FOOTER_TEXT.cityPayUrl });
    doc.setTextColor(0, 0, 0);
    yPos += 10;
  }

  // 4. Custom middle paragraph (editable, conditional, optional highlight)
  const customMiddle = options.customMiddleText?.trim() ?? '';
  if (customMiddle) {
    const used = drawFooterParagraph(doc, customMiddle, margin, yPos, textWidth, !!hl.customMiddle);
    yPos += used + 8;
  }

  // 5. Questions Text (hardcoded)
  doc.text(FOOTER_TEXT.questions, margin, yPos);
  yPos += 8;

  // 6. Additional notes (editable, if provided)
  if (options.additionalNotes) {
    const used = drawFooterParagraph(doc, options.additionalNotes, margin, yPos, textWidth, !!hl.additional);
    yPos += used + 5;
  }

  // 7. Closing Text (hardcoded)
  doc.text(FOOTER_TEXT.closing, margin, yPos);

  // Save the PDF
  const filename = `Invoice-${recipient.companyName || 'Client'}-${dayjs().format('YYYY-MM-DD')}.pdf`.replace(/[^a-zA-Z0-9-_.]/g, '_');
  const blob = doc.output('blob');
  doc.save(filename);
  return { blob, filename };
};

/**
 * Generate DOCX invoice using docx library
 */
export const generateDOCX = async (
  items: InvoiceCartItem[],
  recipient: InvoiceRecipient,
  options: InvoiceOptions,
  extras: InvoiceExtraLineItem[] = []
): Promise<{ blob: Blob; filename: string }> => {
  const totalLegalFees =
    items.reduce((sum, item) => sum + item.legal_fee, 0) + sumExtrasLegalFees(extras);
  const invoiceDate = dayjs().format('MMMM D, YYYY');

  const doc = new Document({
    sections: [
      {
        children: [
          // Header - Name and Title
          new Paragraph({
            children: [
              new TextRun({ text: SENDER.name, bold: true, size: 32 }),
            ],
          }),
          new Paragraph({
            indent: { left: 240 }, // ~0.17 inches to center under name
            children: [
              new TextRun({
                text: SENDER.title,
                underline: { type: UnderlineType.SINGLE },
                size: 22,
              }),
            ],
          }),
          new Paragraph({ children: [] }), // Spacer

          // Address block (right-aligned in template, but DOCX makes this tricky - using table instead)
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: SENDER.address, size: 20 })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: SENDER.cityStateZip, size: 20 })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: SENDER.phone, size: 20 })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: SENDER.fax, size: 20 })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: SENDER.email, size: 20 })],
          }),
          new Paragraph({ children: [] }), // Spacer before date
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: invoiceDate, size: 20 })],
          }),
          new Paragraph({ children: [] }), // Spacer

          // Recipient - Contact name first, then company, address, etc.
          new Paragraph({
            children: [new TextRun({ text: recipient.attention, size: 20 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: recipient.companyName, size: 20 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: recipient.address, size: 20 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: recipient.cityStateZip, size: 20 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: recipient.email ? `Email: ${recipient.email}` : '', size: 20 })],
          }),
          new Paragraph({ children: [] }), // Spacer

          // INVOICE title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: 'INVOICE', bold: true, size: 36 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'And Case Status', size: 22 })],
          }),
          new Paragraph({ children: [] }), // Spacer

          // Re: section
          new Paragraph({
            children: [
              new TextRun({ text: 'Re:\t', size: 20 }),
              new TextRun({ text: INVOICE_SUBJECT, size: 20 }),
            ],
          }),
          new Paragraph({
            indent: { left: 720 },
            children: [new TextRun({ text: INVOICE_SUBTITLE, bold: true, size: 20 })],
          }),
          new Paragraph({
            indent: { left: 720 },
            children: [
              new TextRun({ text: 'Ticket No.:\t\t', size: 20 }),
              new TextRun({ text: 'See below', size: 20 }),
            ],
          }),
          new Paragraph({
            indent: { left: 720 },
            children: [
              new TextRun({ text: 'Defendant:\t\t', size: 20 }),
              new TextRun({ text: recipient.companyName || 'COMPANY NAME', bold: true, size: 20 }),
            ],
          }),
          new Paragraph({
            indent: { left: 720 },
            children: [
              new TextRun({ text: 'Court:\t\t\t', size: 20 }),
              new TextRun({ text: COURT_NAME, size: 20 }),
            ],
          }),
          new Paragraph({
            indent: { left: 720 },
            children: [
              new TextRun({ text: 'Court Dates:\t', size: 20 }),
              new TextRun({ text: 'As described below', size: 20 }),
            ],
          }),
          new Paragraph({ children: [] }), // Spacer

          // Services description
          new Paragraph({
            children: [new TextRun({ text: SERVICES_DESCRIPTION, size: 20 })],
          }),
          new Paragraph({ children: [] }), // Spacer

          // LEGAL FEE total
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'LEGAL FEE', bold: true, size: 22 })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: formatCurrencyWithDecimals(totalLegalFees),
                bold: true,
                size: 32,
              }),
            ],
          }),
          new Paragraph({ children: [] }), // Spacer

          // Data table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              // Header row
              new TableRow({
                cantSplit: true,
                children: [
                  createHeaderCell('Summons\nNumber'),
                  createHeaderCell('Violation Date'),
                  createHeaderCell('Hearing Status'),
                  createHeaderCell('Results'),
                  createHeaderCell('Hearing Date'),
                  createHeaderCell('FINE\nDUE'),
                  createHeaderCell('LEGAL FEE'),
                ],
              }),
              // Data rows. When highlighted=true, every cell in the row gets
              // yellow shading so the entire row reads as a marker stripe.
              ...items.map(
                (item) =>
                  new TableRow({
                    cantSplit: true,
                    children: [
                      createDataCell(item.summons_number, item.highlighted),
                      createDataCell(formatDate(item.violation_date), item.highlighted),
                      createDataCell(item.status || '', item.highlighted),
                      createDataCell(item.hearing_result || '', item.highlighted),
                      createDataCell(formatDate(item.hearing_date), item.highlighted),
                      createDataCell(formatCurrency(item.amount_due), item.highlighted),
                      createDataCell(formatCurrency(item.legal_fee), item.highlighted),
                    ],
                  })
              ),
              // Manual extra-line rows (research fee, etc.) — values are
              // free text exactly as entered by the user.
              ...extras.map(
                (e) =>
                  new TableRow({
                    cantSplit: true,
                    children: [
                      createDataCell(e.summons_number, e.highlighted),
                      createDataCell(e.violation_date, e.highlighted),
                      createDataCell(e.status, e.highlighted),
                      createDataCell(e.hearing_result, e.highlighted),
                      createDataCell(e.hearing_date, e.highlighted),
                      createDataCell(e.amount_due, e.highlighted),
                      createDataCell(e.legal_fee, e.highlighted),
                    ],
                  })
              ),
            ],
          }),
          new Paragraph({ children: [] }), // Spacer

          // Footer — editable fields from options, rest hardcoded from FOOTER_TEXT.
          // Each paragraph's `shading` is set conditionally so highlights match
          // the on-screen preview and the PDF output.
          // 1. Payment Instructions (editable, conditional to avoid gap when empty)
          ...(options.paymentInstructions.trim()
            ? [
                new Paragraph({
                  ...(options.highlightedSections?.payment ? { shading: docxHighlightShading } : {}),
                  children: [new TextRun({ text: options.paymentInstructions, italics: true, size: 20 })],
                }),
                new Paragraph({ children: [] }),
              ]
            : []),
          // 2. Review Text (editable, conditional to avoid gap when empty)
          ...(options.reviewText.trim()
            ? [
                new Paragraph({
                  ...(options.highlightedSections?.review ? { shading: docxHighlightShading } : {}),
                  children: [new TextRun({ text: options.reviewText, italics: true, size: 20 })],
                }),
                new Paragraph({ children: [] }),
              ]
            : []),
          // 3. Overdue Section (toggleable). Highlight applies to both the
          // overdue text and the CityPay link paragraph.
          ...(options.showOverdue
            ? [
                new Paragraph({
                  ...(options.highlightedSections?.overdue ? { shading: docxHighlightShading } : {}),
                  children: [new TextRun({ text: options.overdueText, italics: true, size: 20 })],
                }),
                new Paragraph({
                  ...(options.highlightedSections?.overdue ? { shading: docxHighlightShading } : {}),
                  children: [
                    new ExternalHyperlink({
                      children: [
                        new TextRun({
                          text: FOOTER_TEXT.cityPayUrl,
                          style: 'Hyperlink',
                          size: 20,
                        }),
                      ],
                      link: FOOTER_TEXT.cityPayUrl,
                    }),
                  ],
                }),
                new Paragraph({ children: [] }),
              ]
            : []),
          // 4. Custom middle paragraph (conditional, optional highlight).
          ...(options.customMiddleText?.trim()
            ? [
                new Paragraph({
                  ...(options.highlightedSections?.customMiddle ? { shading: docxHighlightShading } : {}),
                  children: [new TextRun({ text: options.customMiddleText, italics: true, size: 20 })],
                }),
                new Paragraph({ children: [] }),
              ]
            : []),
          // 5. Questions Text (hardcoded)
          new Paragraph({
            children: [new TextRun({ text: FOOTER_TEXT.questions, italics: true, size: 20 })],
          }),
          // 6. Additional notes (editable, if provided)
          ...(options.additionalNotes
            ? [
                new Paragraph({
                  ...(options.highlightedSections?.additional ? { shading: docxHighlightShading } : {}),
                  children: [new TextRun({ text: options.additionalNotes, italics: true, size: 20 })],
                }),
              ]
            : []),
          // 7. Closing Text (hardcoded)
          new Paragraph({
            children: [new TextRun({ text: FOOTER_TEXT.closing, italics: true, size: 20 })],
          }),
        ],
      },
    ],
  });

  // Generate and save the file
  const blob = await Packer.toBlob(doc);
  const filename = `Invoice-${recipient.companyName || 'Client'}-${dayjs().format('YYYY-MM-DD')}.docx`.replace(/[^a-zA-Z0-9-_.]/g, '_');
  saveAs(blob, filename);
  return { blob, filename };
};

// Helper to create header cell for DOCX table
function createHeaderCell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 18 })],
      }),
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
    },
  });
}

// Helper to create data cell for DOCX table. When `highlighted` is true,
// the cell gets yellow shading; combined across the row this paints a marker stripe.
function createDataCell(text: string, highlighted?: boolean | null): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 18 })],
      }),
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
    },
    ...(highlighted ? { shading: docxHighlightShading } : {}),
  });
}
