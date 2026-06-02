/**
 * OATH Notice of Appearance DOCX Generator
 *
 * Two flavors:
 *   - generateNoticeOfAppearance(summonses, dateLabel)
 *       Single hearing day. 3-column table [#, Summons Number, Respondent Name],
 *       padded to 16 rows. Title and footer reference one specific date.
 *
 *   - generateWeekNoticeOfAppearance(summonses, weekLabel)
 *       Full week. 4-column table adds a Hearing Date column so OATH knows
 *       which day each case belongs to. Title and footer reference the week
 *       range. No padding — a week notice shows only the real cases.
 *
 * The `docx` library is used to build the Word document; `file-saver` triggers
 * the browser download. Callers are responsible for ordering the input
 * summonses array (see utils/noticeOrdering.ts) — the DOCX numbers rows in
 * whatever order they arrive in, so the dashboard's sort is preserved.
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
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { saveAs } from 'file-saver';
import { SENDER } from '../constants/invoiceDefaults';
import type { Summons } from '../types/summons';

dayjs.extend(utc);

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

function buildSignatureBlock(): Paragraph[] {
  return [
    new Paragraph({
      children: [new TextRun({ text: 'THANK YOU.', bold: true, size: 20 })],
    }),
    new Paragraph({ children: [] }),
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
  ];
}

const SPLIT_CALL_NOTE =
  "NOTE: IF THE MATTERS ARE SPLIT INTO MORE THAN ONE COURT CALL NOTIFICATION, PLEASE MARK EACH NOTICE '1 of 2', ETC. TO AVOID CONFUSION";

function sanitizeFilename(name: string): string {
  // Allow alphanumeric, dash, underscore, period. Replace everything else.
  return name.replace(/[^a-zA-Z0-9-_.]/g, '_');
}

function formatHearingDate(rawDate: string | null | undefined): string {
  if (!rawDate) return '';
  const d = dayjs.utc(rawDate);
  return d.isValid() ? d.format('MMM D, YYYY') : '';
}

/**
 * Generate and download a Notice of Appearance DOCX for a single hearing day.
 *
 * @param summonses - Summonses to include, in the desired row order.
 * @param dateLabel - Human-readable date, e.g. "Tuesday, January 27, 2026".
 */
export async function generateNoticeOfAppearance(
  summonses: Summons[],
  dateLabel: string
): Promise<void> {
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

  // Pad with empty rows to reach the minimum (per the firm's template).
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
          new Paragraph({ children: [] }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
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
          new Paragraph({ children: [] }),

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

          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: SPLIT_CALL_NOTE, size: 20 })],
          }),
          new Paragraph({ children: [] }),

          ...buildSignatureBlock(),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = sanitizeFilename(`OATH_Notice_of_Appearance_${dateLabel}.docx`);
  saveAs(blob, filename);
}

/**
 * Generate and download a Notice of Appearance DOCX for an entire week.
 *
 * One file, multiple hearing days. The table has 4 columns and includes a
 * Hearing Date column so OATH can tell which case goes with which day.
 * No row padding — a week notice lists only real cases.
 *
 * @param summonses - Summonses to include, in the desired row order (usually
 *                    the dashboard's current sort).
 * @param weekLabel - Human-readable week range, e.g. "Apr 13–Apr 19, 2026".
 */
export async function generateWeekNoticeOfAppearance(
  summonses: Summons[],
  weekLabel: string
): Promise<void> {
  const dataRows = summonses.map(
    (s, i) =>
      new TableRow({
        children: [
          createDataCell(String(i + 1)),
          createDataCell(s.summons_number || ''),
          createDataCell(s.respondent_name || ''),
          createDataCell(formatHearingDate(s.hearing_date)),
        ],
      })
  );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `OATH NOTICE OF APPEARANCE FOR WEEK OF ${weekLabel.toUpperCase()}`,
                bold: true,
                size: 28,
              }),
            ],
          }),
          new Paragraph({ children: [] }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  createHeaderCell('#'),
                  createHeaderCell('Summons Number'),
                  createHeaderCell('Respondent Name'),
                  createHeaderCell('Hearing Date'),
                ],
              }),
              ...dataRows,
            ],
          }),
          new Paragraph({ children: [] }),

          new Paragraph({
            spacing: { before: 200, after: 200 },
            children: [
              new TextRun({
                text:
                  `THE ABOVE MATTERS HAVE BEEN SCHEDULED FOR HEARINGS BY YOUR AGENCY DURING THE WEEK OF ${weekLabel.toUpperCase()}. ` +
                  'I REPRESENT EACH OF THE NAMED RESPONDENTS. I HEREBY APPEAR ON THE LISTED MATTERS AND REQUEST THE ' +
                  'TELEPHONE LINK SO I CAN PARTICIPATE IN THE HEARINGS ON BEHALF OF MY CLIENTS.',
                bold: true,
                size: 20,
              }),
            ],
          }),

          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: SPLIT_CALL_NOTE, size: 20 })],
          }),
          new Paragraph({ children: [] }),

          ...buildSignatureBlock(),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = sanitizeFilename(`OATH_Notice_of_Appearance_Week_${weekLabel}.docx`);
  saveAs(blob, filename);
}
