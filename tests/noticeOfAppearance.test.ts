/**
 * Integration tests for the Notice of Appearance DOCX generators.
 *
 * These tests unzip the produced .docx and read word/document.xml to confirm
 * the row order the dashboard expects is actually what ends up in the file.
 * The goal is to protect the contract "what Arthur sees in the grid is what
 * OATH sees in the DOCX."
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import JSZip from 'jszip';
import { Summons } from '../src/types/summons';

// Capture saveAs calls instead of letting file-saver try to trigger a download.
const savedFiles: Array<{ blob: Blob; filename: string }> = [];
vi.mock('file-saver', () => ({
  saveAs: (blob: Blob, filename: string) => {
    savedFiles.push({ blob, filename });
  },
}));

import {
  generateNoticeOfAppearance,
  generateWeekNoticeOfAppearance,
} from '../src/utils/noticeOfAppearance';

function makeSummons(overrides: Partial<Summons> & { id: string; summons_number: string }): Summons {
  return {
    id: overrides.id,
    clientID: 'client-1',
    respondent_name: 'Test Corp',
    status: 'SCHEDULED',
    license_plate: 'ABC1234',
    base_fine: 350,
    amount_due: 0,
    hearing_date: '2026-04-15T09:00:00.000Z',
    violation_date: '2026-01-01T00:00:00.000Z',
    violation_location: '123 Test St',
    summons_pdf_link: '',
    video_link: '',
    added_to_calendar: false,
    evidence_reviewed: false,
    evidence_requested: false,
    evidence_received: false,
    ...overrides,
  } as Summons;
}

async function extractDocumentXml(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('word/document.xml not found in DOCX');
  return file.async('string');
}

/** Returns the positions of each needle in text; -1 if missing. */
function positionsOf(text: string, needles: string[]): number[] {
  return needles.map((n) => text.indexOf(n));
}

beforeEach(() => {
  savedFiles.length = 0;
});

describe('generateNoticeOfAppearance (single day)', () => {
  it('produces exactly one file with the date in the filename', async () => {
    const summonses = [
      makeSummons({ id: '1', summons_number: '2026-111111', respondent_name: 'Alpha Co' }),
      makeSummons({ id: '2', summons_number: '2026-222222', respondent_name: 'Beta Co' }),
    ];
    await generateNoticeOfAppearance(summonses, 'Wednesday, April 15, 2026');
    expect(savedFiles).toHaveLength(1);
    expect(savedFiles[0].filename).toContain('April');
    expect(savedFiles[0].filename).toContain('2026');
    expect(savedFiles[0].filename.endsWith('.docx')).toBe(true);
  });

  it('writes rows in the exact caller-supplied order', async () => {
    const summonses = [
      makeSummons({ id: '1', summons_number: '2026-000003', respondent_name: 'Charlie' }),
      makeSummons({ id: '2', summons_number: '2026-000001', respondent_name: 'Alpha' }),
      makeSummons({ id: '3', summons_number: '2026-000002', respondent_name: 'Bravo' }),
    ];
    await generateNoticeOfAppearance(summonses, 'Wednesday, April 15, 2026');
    const xml = await extractDocumentXml(savedFiles[0].blob);

    // Expect Charlie → Alpha → Bravo (dashboard order), not alphabetical.
    const [p1, p2, p3] = positionsOf(xml, ['Charlie', 'Alpha', 'Bravo']);
    expect(p1).toBeGreaterThan(-1);
    expect(p2).toBeGreaterThan(p1);
    expect(p3).toBeGreaterThan(p2);

    // Summons numbers appear in the same order.
    const [s1, s2, s3] = positionsOf(xml, ['2026-000003', '2026-000001', '2026-000002']);
    expect(s1).toBeGreaterThan(-1);
    expect(s2).toBeGreaterThan(s1);
    expect(s3).toBeGreaterThan(s2);
  });

  it('includes the date in the title and footer', async () => {
    await generateNoticeOfAppearance(
      [makeSummons({ id: '1', summons_number: '2026-000001' })],
      'Wednesday, April 15, 2026'
    );
    const xml = await extractDocumentXml(savedFiles[0].blob);
    expect(xml).toContain('OATH NOTICE OF APPEARANCE FOR WEDNESDAY, APRIL 15, 2026');
    expect(xml).toContain('SCHEDULED FOR HEARINGS BY YOUR AGENCY FOR WEDNESDAY, APRIL 15, 2026');
  });
});

describe('generateWeekNoticeOfAppearance', () => {
  it('produces exactly one file (not one-per-day)', async () => {
    const summonses = [
      makeSummons({ id: '1', summons_number: '2026-000001', hearing_date: '2026-04-15T09:00:00.000Z' }),
      makeSummons({ id: '2', summons_number: '2026-000002', hearing_date: '2026-04-17T09:00:00.000Z' }),
      makeSummons({ id: '3', summons_number: '2026-000003', hearing_date: '2026-04-15T09:00:00.000Z' }),
    ];
    await generateWeekNoticeOfAppearance(summonses, 'Apr 13\u2013Apr 19, 2026');
    // Critical: single file, regardless of how many hearing days are spanned.
    expect(savedFiles).toHaveLength(1);
    expect(savedFiles[0].filename).toContain('Week');
  });

  it('preserves caller-supplied order across mixed hearing dates', async () => {
    // Dashboard is sorted by status; hearing dates are interleaved.
    const summonses = [
      makeSummons({ id: '1', summons_number: '2026-111111', respondent_name: 'Exquisite Wood', hearing_date: '2026-04-17T09:00:00.000Z' }),
      makeSummons({ id: '2', summons_number: '2026-222222', respondent_name: 'Platinum Alpha', hearing_date: '2026-04-15T09:00:00.000Z' }),
      makeSummons({ id: '3', summons_number: '2026-333333', respondent_name: 'Platinum Bravo', hearing_date: '2026-04-15T09:00:00.000Z' }),
    ];
    await generateWeekNoticeOfAppearance(summonses, 'Apr 13\u2013Apr 19, 2026');
    const xml = await extractDocumentXml(savedFiles[0].blob);

    const [p1, p2, p3] = positionsOf(xml, ['Exquisite Wood', 'Platinum Alpha', 'Platinum Bravo']);
    expect(p1).toBeGreaterThan(-1);
    expect(p2).toBeGreaterThan(p1);
    expect(p3).toBeGreaterThan(p2);
  });

  it('includes a Hearing Date column with each case\u2019s hearing date', async () => {
    const summonses = [
      makeSummons({ id: '1', summons_number: '2026-000001', hearing_date: '2026-04-15T09:00:00.000Z' }),
      makeSummons({ id: '2', summons_number: '2026-000002', hearing_date: '2026-04-17T09:00:00.000Z' }),
    ];
    await generateWeekNoticeOfAppearance(summonses, 'Apr 13\u2013Apr 19, 2026');
    const xml = await extractDocumentXml(savedFiles[0].blob);
    expect(xml).toContain('Hearing Date');
    expect(xml).toContain('Apr 15, 2026');
    expect(xml).toContain('Apr 17, 2026');
  });

  it('references the week range in the title and footer', async () => {
    await generateWeekNoticeOfAppearance(
      [makeSummons({ id: '1', summons_number: '2026-000001' })],
      'Apr 13\u2013Apr 19, 2026'
    );
    const xml = await extractDocumentXml(savedFiles[0].blob);
    expect(xml).toContain('OATH NOTICE OF APPEARANCE FOR WEEK OF APR 13');
    expect(xml).toContain('APR 19, 2026');
    expect(xml).toContain('DURING THE WEEK OF APR 13');
  });

  it('does not pad with empty rows (unlike single-day)', async () => {
    const summonses = [makeSummons({ id: '1', summons_number: '2026-000001', respondent_name: 'Solo Inc' })];
    await generateWeekNoticeOfAppearance(summonses, 'Apr 13\u2013Apr 19, 2026');
    const xml = await extractDocumentXml(savedFiles[0].blob);
    // In the single-day version row 16 would appear (padding). Here only row 1.
    expect(xml).toContain('Solo Inc');
    // A crude guard: row number "16" should not appear as a cell value when
    // there is only one real case. It can appear in styles/pt-sizes etc., so
    // we just make sure no "2" row is present instead of asserting absence.
    expect(xml).not.toContain('>2<'); // no "2." cell text
  });
});
