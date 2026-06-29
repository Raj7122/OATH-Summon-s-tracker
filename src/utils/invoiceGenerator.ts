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
import ExcelJS from 'exceljs';
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
// ExcelJS argb is alpha-first (8 hex digits); fully-opaque yellow = FF + FFF59D.
const HIGHLIGHT_ARGB = 'FFFFF59D';

// MIME types for the generated office documents. Exported so callers can pass
// the correct content-type when uploading the file to S3.
export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Top margin used when paginating footer paragraphs onto a fresh page.
const FOOTER_PAGE_TOP = 20;
// Bottom keep-out: footer paragraphs that would draw past (pageHeight - this)
// get pushed to the next page instead of being clipped.
const FOOTER_BOTTOM_MARGIN = 20;

// If a block of `blockHeight` mm would overflow the current page, start a new
// page and reset the cursor. Returns the (possibly updated) y-position.
const ensureRoomFor = (
  doc: jsPDF,
  yPos: number,
  blockHeight: number,
  pageHeight: number,
): number => {
  if (yPos + blockHeight > pageHeight - FOOTER_BOTTOM_MARGIN) {
    doc.addPage();
    return FOOTER_PAGE_TOP;
  }
  return yPos;
};

// Draw a footer paragraph with optional yellow highlight, paginating to a new
// page if the whole block won't fit on the current page. jsPDF's text() draws
// at the baseline, so the highlight rect is placed ~3.5mm above to cover the
// ascenders of all wrapped lines.
const drawFooterParagraph = (
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  highlight: boolean,
  pageHeight: number,
  lineHeight = 5,
): { y: number; used: number } => {
  const lines = doc.splitTextToSize(text, width);
  const blockHeight = lines.length * lineHeight + (highlight ? 1 : 0);
  const yStart = ensureRoomFor(doc, y, blockHeight, pageHeight);
  if (highlight) {
    doc.setFillColor(...HIGHLIGHT_RGB);
    doc.rect(x - 1, yStart - 3.5, width + 2, lines.length * lineHeight + 1, 'F');
  }
  doc.text(lines, x, yStart);
  return { y: yStart, used: lines.length * lineHeight };
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
  const pageHeight = doc.internal.pageSize.getHeight();
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

  // Date — use the invoice's stored date when provided (so each invoice shows its
  // own date), falling back to today for newly-created invoices. dayjs.utc avoids a
  // timezone shift on UTC-midnight stored values, matching formatDate above.
  rightY += 8;
  const invoiceDate = (options.invoiceDate ? dayjs.utc(options.invoiceDate) : dayjs())
    .format('MMMM D, YYYY');
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

  // Each footer paragraph is treated as an atomic block: if it doesn't fit on
  // the current page, the whole block moves to a new page (no mid-paragraph
  // splits). drawFooterParagraph handles its own pagination via ensureRoomFor.

  // 1. Payment Instructions (editable, conditional to avoid gap when empty)
  if (options.paymentInstructions.trim()) {
    const r = drawFooterParagraph(doc, options.paymentInstructions, margin, yPos, textWidth, !!hl.payment, pageHeight);
    yPos = r.y + r.used + 5;
  }

  // 2. Review Text (editable, conditional to avoid gap when empty)
  if (options.reviewText.trim()) {
    const r = drawFooterParagraph(doc, options.reviewText, margin, yPos, textWidth, !!hl.review, pageHeight);
    yPos = r.y + r.used + 10;
  }

  // 3. Overdue Section (toggleable). The text and the CityPay link must stay
  // on the same page so the highlight rect (when enabled) wraps both as one
  // continuous block. We measure text + link together, page-break the whole
  // thing, then draw.
  if (options.showOverdue) {
    const overdueLines = doc.splitTextToSize(options.overdueText, textWidth);
    const linkLineHeight = 5;
    const blockHeight = overdueLines.length * 5 + linkLineHeight + 1;
    yPos = ensureRoomFor(doc, yPos, blockHeight + 5, pageHeight);
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
    const r = drawFooterParagraph(doc, customMiddle, margin, yPos, textWidth, !!hl.customMiddle, pageHeight);
    yPos = r.y + r.used + 8;
  }

  // 5. Questions Text (hardcoded). Single line, but wrap-measure for safety
  // and page-break check before drawing.
  {
    const lines = doc.splitTextToSize(FOOTER_TEXT.questions, textWidth);
    yPos = ensureRoomFor(doc, yPos, lines.length * 5, pageHeight);
    doc.text(lines, margin, yPos);
    yPos += lines.length * 5 + 3;
  }

  // 6. Additional notes (editable, if provided)
  if (options.additionalNotes) {
    const r = drawFooterParagraph(doc, options.additionalNotes, margin, yPos, textWidth, !!hl.additional, pageHeight);
    yPos = r.y + r.used + 5;
  }

  // 7. Closing Text (hardcoded)
  {
    const lines = doc.splitTextToSize(FOOTER_TEXT.closing, textWidth);
    yPos = ensureRoomFor(doc, yPos, lines.length * 5, pageHeight);
    doc.text(lines, margin, yPos);
  }

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
  // Use the invoice's stored date when provided; fall back to today for new invoices.
  const invoiceDate = (options.invoiceDate ? dayjs.utc(options.invoiceDate) : dayjs())
    .format('MMMM D, YYYY');

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

/**
 * Generate XLSX invoice using ExcelJS.
 *
 * Mirrors the PDF/DOCX layout in a single worksheet so the spreadsheet reads
 * like the document: sender/recipient blocks, the Re: section, the line-item
 * table, and the conditional footer paragraphs. Highlighted rows/sections get
 * the same yellow marker fill (FFF59D) as the other two formats.
 */
export const generateXLSX = async (
  items: InvoiceCartItem[],
  recipient: InvoiceRecipient,
  options: InvoiceOptions,
  extras: InvoiceExtraLineItem[] = []
): Promise<{ blob: Blob; filename: string }> => {
  const totalLegalFees =
    items.reduce((sum, item) => sum + item.legal_fee, 0) + sumExtrasLegalFees(extras);
  // Use the invoice's stored date when provided; fall back to today for new invoices.
  const invoiceDate = (options.invoiceDate ? dayjs.utc(options.invoiceDate) : dayjs())
    .format('MMMM D, YYYY');
  const hl = options.highlightedSections ?? {};

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Invoice');

  // The line-item table spans 7 columns (A–G); every other block aligns to it.
  const LAST_COL = 7;
  const HIGHLIGHT_FILL = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HIGHLIGHT_ARGB },
  } as const;
  const CELL_BORDER = {
    top: { style: 'thin' as const },
    bottom: { style: 'thin' as const },
    left: { style: 'thin' as const },
    right: { style: 'thin' as const },
  };

  let r = 0;

  // Write one full-width paragraph row (merged across A:G), optionally italic /
  // bold / centered / highlighted. Used for headers, the Re: block, and footers.
  const addLine = (
    text: string,
    opts: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      size?: number;
      align?: 'left' | 'center' | 'right';
      highlight?: boolean;
    } = {}
  ): ExcelJS.Row => {
    r += 1;
    ws.mergeCells(r, 1, r, LAST_COL);
    const row = ws.getRow(r);
    const cell = row.getCell(1);
    cell.value = text;
    cell.font = {
      bold: !!opts.bold,
      italic: !!opts.italic,
      underline: !!opts.underline,
      size: opts.size ?? 10,
    };
    cell.alignment = { horizontal: opts.align ?? 'left', wrapText: true, vertical: 'top' };
    if (opts.highlight) {
      // Fill the whole merged range so the marker stripe spans the row.
      for (let c = 1; c <= LAST_COL; c++) row.getCell(c).fill = HIGHLIGHT_FILL;
    }
    return row;
  };

  // --- Sender block ---------------------------------------------------------
  addLine(SENDER.name, { bold: true, size: 16 });
  addLine(SENDER.title, { underline: true });
  addLine(SENDER.address);
  addLine(SENDER.cityStateZip);
  addLine(SENDER.phone);
  addLine(SENDER.fax);
  addLine(SENDER.email);
  addLine('');
  addLine(invoiceDate);
  addLine('');

  // --- Recipient block (skip empty lines, matching the PDF/DOCX) ------------
  if (recipient.attention) addLine(recipient.attention);
  if (recipient.companyName) addLine(recipient.companyName);
  if (recipient.address) addLine(recipient.address);
  if (recipient.cityStateZip) addLine(recipient.cityStateZip);
  if (recipient.email) addLine(`Email: ${recipient.email}`);
  addLine('');

  // --- INVOICE title --------------------------------------------------------
  addLine('INVOICE', { bold: true, size: 18, align: 'center' });
  addLine('And Case Status', { align: 'center' });
  addLine('');

  // --- Re: section ----------------------------------------------------------
  addLine(`Re:  ${INVOICE_SUBJECT}`);
  addLine(INVOICE_SUBTITLE, { bold: true });
  addLine('Ticket No.:  See below');
  // Defendant value is bold — use rich text so only the company name is bold.
  {
    r += 1;
    ws.mergeCells(r, 1, r, LAST_COL);
    const cell = ws.getRow(r).getCell(1);
    cell.value = {
      richText: [
        { text: 'Defendant:  ', font: { size: 10 } },
        { text: recipient.companyName || 'COMPANY NAME', font: { size: 10, bold: true } },
      ],
    };
    cell.alignment = { horizontal: 'left', wrapText: true, vertical: 'top' };
  }
  addLine(`Court:  ${COURT_NAME}`);
  addLine('Court Dates:  As described below');
  addLine('');

  // --- Services description -------------------------------------------------
  addLine(SERVICES_DESCRIPTION);
  addLine('');

  // --- LEGAL FEE total (right-aligned, echoing the document) ----------------
  r += 1;
  {
    const row = ws.getRow(r);
    const labelCell = row.getCell(LAST_COL - 1);
    labelCell.value = 'LEGAL FEE';
    labelCell.font = { bold: true, size: 11 };
    labelCell.alignment = { horizontal: 'right' };
    const valueCell = row.getCell(LAST_COL);
    valueCell.value = formatCurrencyWithDecimals(totalLegalFees);
    valueCell.font = { bold: true, size: 14 };
    valueCell.alignment = { horizontal: 'right' };
  }
  addLine('');

  // --- Data table -----------------------------------------------------------
  const headers = [
    'Summons Number',
    'Violation Date',
    'Hearing Status',
    'Results',
    'Hearing Date',
    'FINE DUE',
    'LEGAL FEE',
  ];
  r += 1;
  {
    const headerRow = ws.getRow(r);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 9 };
      cell.border = CELL_BORDER;
      // Money columns (FINE DUE, LEGAL FEE) right-align like the PDF/DOCX.
      cell.alignment = { horizontal: i >= 5 ? 'right' : 'left', wrapText: true, vertical: 'top' };
    });
  }

  // Write one table data row, applying the yellow fill when highlighted. Values
  // arrive pre-formatted (summons items) or as free text (manual extras).
  const addTableRow = (values: string[], highlighted?: boolean | null) => {
    r += 1;
    const row = ws.getRow(r);
    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = { size: 9 };
      cell.border = CELL_BORDER;
      cell.alignment = { horizontal: i >= 5 ? 'right' : 'left', wrapText: true, vertical: 'top' };
      if (highlighted) cell.fill = HIGHLIGHT_FILL;
    });
  };

  items.forEach((item) =>
    addTableRow(
      [
        item.summons_number,
        formatDate(item.violation_date),
        item.status || '',
        item.hearing_result || '',
        formatDate(item.hearing_date),
        formatCurrency(item.amount_due),
        formatCurrency(item.legal_fee),
      ],
      item.highlighted
    )
  );
  // Manual extra-line rows (research fee, etc.) — free text exactly as entered.
  extras.forEach((e) =>
    addTableRow(
      [
        e.summons_number,
        e.violation_date,
        e.status,
        e.hearing_result,
        e.hearing_date,
        e.amount_due,
        e.legal_fee,
      ],
      e.highlighted
    )
  );
  addLine('');

  // --- Footer paragraphs (same conditional logic as PDF/DOCX) ---------------
  // 1. Payment Instructions
  if (options.paymentInstructions.trim()) {
    addLine(options.paymentInstructions, { italic: true, highlight: !!hl.payment });
    addLine('');
  }
  // 2. Review Text
  if (options.reviewText.trim()) {
    addLine(options.reviewText, { italic: true, highlight: !!hl.review });
    addLine('');
  }
  // 3. Overdue Section — text + CityPay hyperlink, both highlighted together.
  if (options.showOverdue) {
    addLine(options.overdueText, { italic: true, highlight: !!hl.overdue });
    r += 1;
    ws.mergeCells(r, 1, r, LAST_COL);
    const linkRow = ws.getRow(r);
    const cell = linkRow.getCell(1);
    cell.value = { text: FOOTER_TEXT.cityPayUrl, hyperlink: FOOTER_TEXT.cityPayUrl };
    cell.font = { italic: true, size: 10, color: { argb: 'FF0000FF' }, underline: true };
    cell.alignment = { horizontal: 'left', wrapText: true, vertical: 'top' };
    if (hl.overdue) {
      for (let c = 1; c <= LAST_COL; c++) linkRow.getCell(c).fill = HIGHLIGHT_FILL;
    }
    addLine('');
  }
  // 4. Custom middle paragraph
  if (options.customMiddleText?.trim()) {
    addLine(options.customMiddleText, { italic: true, highlight: !!hl.customMiddle });
    addLine('');
  }
  // 5. Questions Text (hardcoded)
  addLine(FOOTER_TEXT.questions, { italic: true });
  // 6. Additional notes (editable, if provided)
  if (options.additionalNotes) {
    addLine(options.additionalNotes, { italic: true, highlight: !!hl.additional });
  }
  // 7. Closing Text (hardcoded)
  addLine(FOOTER_TEXT.closing, { italic: true });

  // Column widths roughly proportional to the PDF column widths.
  const widths = [20, 14, 16, 14, 14, 12, 14];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  // Generate and save the file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: XLSX_MIME });
  const filename = `Invoice-${recipient.companyName || 'Client'}-${dayjs().format('YYYY-MM-DD')}.xlsx`.replace(/[^a-zA-Z0-9-_.]/g, '_');
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
