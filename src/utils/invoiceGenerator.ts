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
} from 'docx';
import { saveAs } from 'file-saver';
import { InvoiceCartItem, InvoiceRecipient, InvoiceOptions } from '../types/invoice';
import {
  SENDER,
  INVOICE_SUBJECT,
  INVOICE_SUBTITLE,
  COURT_NAME,
  SERVICES_DESCRIPTION,
  FOOTER_TEXT,
} from '../constants/invoiceDefaults';
import dayjs from 'dayjs';

// Helper to format dates as M/DD/YY
const formatDate = (dateString: string | null): string => {
  if (!dateString) return '';
  const date = dayjs(dateString);
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

/**
 * Generate PDF invoice using jsPDF
 */
export const generatePDF = async (
  items: InvoiceCartItem[],
  recipient: InvoiceRecipient,
  options: InvoiceOptions
): Promise<void> => {
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

  // LEGAL FEE total (right aligned, large)
  const totalLegalFees = items.reduce((sum, item) => sum + item.legal_fee, 0);
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
    body: items.map((item) => [
      item.summons_number,
      formatDate(item.violation_date),
      item.status || '',
      item.hearing_result || '',
      formatDate(item.hearing_date),
      formatCurrency(item.amount_due),
      formatCurrency(item.legal_fee),
    ]),
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
  });

  // Get the final Y position after the table
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  yPos = finalY + 15;

  // Footer text - use passed payment instructions
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  const paymentText = doc.splitTextToSize(options.paymentInstructions, pageWidth - 2 * margin);
  doc.text(paymentText, margin, yPos);
  yPos += paymentText.length * 5 + 5;

  doc.text(doc.splitTextToSize(FOOTER_TEXT.review, pageWidth - 2 * margin), margin, yPos);
  yPos += 15;

  doc.text(doc.splitTextToSize(FOOTER_TEXT.overdue, pageWidth - 2 * margin), margin, yPos);
  yPos += 10;

  // Single payment link (not per-summons)
  doc.setTextColor(0, 0, 255);
  const paymentUrl = FOOTER_TEXT.cityPayUrl;
  doc.textWithLink(paymentUrl, margin, yPos, { url: paymentUrl });
  yPos += 5;
  doc.setTextColor(0, 0, 0);
  yPos += 5;

  doc.text(FOOTER_TEXT.questions, margin, yPos);
  yPos += 8;

  // Additional notes (if provided)
  if (options.additionalNotes) {
    const additionalText = doc.splitTextToSize(options.additionalNotes, pageWidth - 2 * margin);
    doc.text(additionalText, margin, yPos);
    yPos += additionalText.length * 5 + 5;
  }

  doc.text(FOOTER_TEXT.closing, margin, yPos);

  // Save the PDF
  const filename = `Invoice-${recipient.companyName || 'Client'}-${dayjs().format('YYYY-MM-DD')}.pdf`;
  doc.save(filename.replace(/[^a-zA-Z0-9-_.]/g, '_'));
};

/**
 * Generate DOCX invoice using docx library
 */
export const generateDOCX = async (
  items: InvoiceCartItem[],
  recipient: InvoiceRecipient,
  options: InvoiceOptions
): Promise<void> => {
  const totalLegalFees = items.reduce((sum, item) => sum + item.legal_fee, 0);
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
              // Data rows
              ...items.map(
                (item) =>
                  new TableRow({
                    children: [
                      createDataCell(item.summons_number),
                      createDataCell(formatDate(item.violation_date)),
                      createDataCell(item.status || ''),
                      createDataCell(item.hearing_result || ''),
                      createDataCell(formatDate(item.hearing_date)),
                      createDataCell(formatCurrency(item.amount_due)),
                      createDataCell(formatCurrency(item.legal_fee)),
                    ],
                  })
              ),
            ],
          }),
          new Paragraph({ children: [] }), // Spacer

          // Footer - use passed payment instructions
          new Paragraph({
            children: [new TextRun({ text: options.paymentInstructions, italics: true, size: 20 })],
          }),
          new Paragraph({ children: [] }),
          new Paragraph({
            children: [new TextRun({ text: FOOTER_TEXT.review, italics: true, size: 20 })],
          }),
          new Paragraph({ children: [] }),
          new Paragraph({
            children: [new TextRun({ text: FOOTER_TEXT.overdue, italics: true, size: 20 })],
          }),
          // Single payment link (not per-summons)
          new Paragraph({
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
          new Paragraph({
            children: [new TextRun({ text: FOOTER_TEXT.questions, italics: true, size: 20 })],
          }),
          // Additional notes (if provided)
          ...(options.additionalNotes
            ? [
                new Paragraph({
                  children: [new TextRun({ text: options.additionalNotes, italics: true, size: 20 })],
                }),
              ]
            : []),
          new Paragraph({
            children: [new TextRun({ text: FOOTER_TEXT.closing, italics: true, size: 20 })],
          }),
        ],
      },
    ],
  });

  // Generate and save the file
  const blob = await Packer.toBlob(doc);
  const filename = `Invoice-${recipient.companyName || 'Client'}-${dayjs().format('YYYY-MM-DD')}.docx`;
  saveAs(blob, filename.replace(/[^a-zA-Z0-9-_.]/g, '_'));
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

// Helper to create data cell for DOCX table
function createDataCell(text: string): TableCell {
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
  });
}
