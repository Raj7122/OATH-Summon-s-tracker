/**
 * OATH Notice of Appearance DOCX Generator
 *
 * Generates a Word document listing summonses scheduled for a hearing day.
 * The document is sent to OATH so the hearing manager can copy/paste case data.
 *
 * Template structure:
 * 1. Title
 * 2. 3-column table: [#, Summons Number, Respondent Name] — padded to 16 rows
 * 3. Footer paragraph (all caps, bold) requesting telephone link
 * 4. Note about split court call notifications
 * 5. Signature block
 */

import {
  Document,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  Packer,
  BorderStyle,
  WidthType,
  AlignmentType,
} from 'docx';
import { saveAs } from 'file-saver';
import { SENDER } from '../constants/invoiceDefaults';
import type { Summons } from '../types/summons';

const MIN_TABLE_ROWS = 16;

const CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 1 },
  bottom: { style: BorderStyle.SINGLE, size: 1 },
  left: { style: BorderStyle.SINGLE, size: 1 },
  right: { style: BorderStyle.SINGLE, size: 1 },
};

function createHeaderCell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 22 })],
      }),
    ],
    borders: CELL_BORDERS,
  });
}

function createDataCell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 20 })],
      }),
    ],
    borders: CELL_BORDERS,
  });
}

/**
 * Generate and download a Notice of Appearance DOCX for a single hearing day.
 *
 * @param summonses - Summons objects to include (already filtered by caller)
 * @param dateLabel - Human-readable date, e.g. "Tuesday, January 27, 2026"
 */
export async function generateNoticeOfAppearance(
  summonses: Summons[],
  dateLabel: string
): Promise<void> {
  // Build data rows from summonses
  const dataRows = summonses.map(
    (s, i) =>
      new TableRow({
        children: [
          createDataCell(String(i + 1)),
          createDataCell(s.summons_number || ''),
          createDataCell(s.respondent_name || ''),
        ],
      })
  );

  // Pad with empty rows to reach minimum 16
  const paddingCount = Math.max(0, MIN_TABLE_ROWS - summonses.length);
  for (let i = 0; i < paddingCount; i++) {
    dataRows.push(
      new TableRow({
        children: [
          createDataCell(String(summonses.length + i + 1)),
          createDataCell(''),
          createDataCell(''),
        ],
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        children: [
          // Title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `OATH NOTICE OF APPEARANCE FOR ${dateLabel.toUpperCase()}`,
                bold: true,
                size: 28,
              }),
            ],
          }),
          new Paragraph({ children: [] }), // Spacer

          // 3-column table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              // Header row
              new TableRow({
                children: [
                  createHeaderCell('#'),
                  createHeaderCell('Summons Number'),
                  createHeaderCell('Respondent Name'),
                ],
              }),
              ...dataRows,
            ],
          }),
          new Paragraph({ children: [] }), // Spacer

          // Footer paragraph — all caps, bold
          new Paragraph({
            spacing: { before: 200, after: 200 },
            children: [
              new TextRun({
                text:
                  `THE ABOVE MATTERS HAVE BEEN SCHEDULED FOR HEARINGS BY YOUR AGENCY FOR ${dateLabel.toUpperCase()}. ` +
                  'I REPRESENT EACH OF THE NAMED RESPONDENTS. I HEREBY APPEAR ON THE LISTED MATTERS AND REQUEST THE ' +
                  'TELEPHONE LINK SO I CAN PARTICIPATE IN THE HEARING ON BEHALF OF MY CLIENTS.',
                bold: true,
                size: 20,
              }),
            ],
          }),

          // Note paragraph
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text:
                  "NOTE: IF THE MATTERS ARE SPLIT INTO MORE THAN ONE COURT CALL NOTIFICATION, PLEASE MARK EACH NOTICE '1 of 2', ETC. TO AVOID CONFUSION",
                size: 20,
              }),
            ],
          }),
          new Paragraph({ children: [] }), // Spacer

          // Thank you
          new Paragraph({
            children: [new TextRun({ text: 'THANK YOU.', bold: true, size: 20 })],
          }),
          new Paragraph({ children: [] }), // Spacer

          // Signature block
          new Paragraph({
            children: [new TextRun({ text: `${SENDER.name}, Esq.`, size: 20 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: SENDER.address, size: 20 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: SENDER.cityStateZip, size: 20 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: SENDER.email, size: 20 })],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  // Sanitize filename: replace anything not alphanumeric, dash, underscore, or dot
  const filename = `OATH_Notice_of_Appearance_${dateLabel}.docx`.replace(/[^a-zA-Z0-9-_.]/g, '_');
  saveAs(blob, filename);
}
