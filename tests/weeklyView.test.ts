/**
 * Weekly View Unit Tests
 *
 * Pure vitest tests for the week filtering utilities.
 * No React rendering — just logic verification.
 *
 * @module tests/weeklyView
 */

import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import utc from 'dayjs/plugin/utc';

dayjs.extend(isoWeek);
dayjs.extend(utc);

import {
  getISOWeekRange,
  filterSummonsesByWeek,
  filterByStatus,
} from '../src/utils/weekFilters';
import { generateCSV, ExportConfig } from '../src/lib/csvExport';
import { Summons } from '../src/types/summons';

// ============================================================================
// HELPERS
// ============================================================================

/** Build a minimal Summons stub for testing */
function makeSummons(overrides: Partial<Summons> & { hearing_date: string; summons_number: string }): Summons {
  return {
    id: overrides.summons_number,
    clientID: 'client-1',
    respondent_name: 'Test Corp',
    status: 'SCHEDULED',
    license_plate: 'ABC1234',
    base_fine: 350,
    amount_due: 0,
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

// ============================================================================
// 1. ISO WEEK BOUNDARIES
// ============================================================================

describe('getISOWeekRange', () => {
  it('returns Monday–Sunday for a mid-week Wednesday', () => {
    // 2026-02-18 is a Wednesday
    const anchor = dayjs('2026-02-18');
    const { start, end } = getISOWeekRange(anchor);

    expect(start.format('YYYY-MM-DD')).toBe('2026-02-16'); // Monday
    expect(end.format('YYYY-MM-DD')).toBe('2026-02-22');   // Sunday
    expect(start.isoWeekday()).toBe(1); // Monday = 1
    expect(end.isoWeekday()).toBe(7);   // Sunday = 7
  });

  it('returns same week when anchor is Monday', () => {
    const anchor = dayjs('2026-02-16'); // Monday
    const { start, end } = getISOWeekRange(anchor);

    expect(start.format('YYYY-MM-DD')).toBe('2026-02-16');
    expect(end.format('YYYY-MM-DD')).toBe('2026-02-22');
  });

  it('returns same week when anchor is Sunday', () => {
    const anchor = dayjs('2026-02-22'); // Sunday
    const { start, end } = getISOWeekRange(anchor);

    expect(start.format('YYYY-MM-DD')).toBe('2026-02-16');
    expect(end.format('YYYY-MM-DD')).toBe('2026-02-22');
  });

  it('handles month boundary (week spanning Jan–Feb)', () => {
    // 2026-02-01 is a Sunday — its ISO week starts Mon Jan 26
    const anchor = dayjs('2026-02-01');
    const { start, end } = getISOWeekRange(anchor);

    expect(start.format('YYYY-MM-DD')).toBe('2026-01-26'); // Monday in January
    expect(end.format('YYYY-MM-DD')).toBe('2026-02-01');   // Sunday in February
  });

  it('handles year boundary (week spanning Dec–Jan)', () => {
    // 2025-12-31 is a Wednesday
    const anchor = dayjs('2025-12-31');
    const { start, end } = getISOWeekRange(anchor);

    expect(start.format('YYYY-MM-DD')).toBe('2025-12-29'); // Monday in December
    expect(end.format('YYYY-MM-DD')).toBe('2026-01-04');   // Sunday in January
  });
});

// ============================================================================
// 2. WEEK RANGE FILTERING
// ============================================================================

describe('filterSummonsesByWeek', () => {
  const weekStart = dayjs('2026-02-16'); // Monday
  const weekEnd = dayjs('2026-02-22');   // Sunday

  const summonses: Summons[] = [
    makeSummons({ summons_number: 'S-MON', hearing_date: '2026-02-16T00:00:00.000Z' }),
    makeSummons({ summons_number: 'S-WED', hearing_date: '2026-02-18T10:00:00.000Z' }),
    makeSummons({ summons_number: 'S-SUN', hearing_date: '2026-02-22T23:59:59.000Z' }),
    makeSummons({ summons_number: 'S-BEFORE', hearing_date: '2026-02-15T00:00:00.000Z' }),
    makeSummons({ summons_number: 'S-AFTER', hearing_date: '2026-02-23T00:00:00.000Z' }),
    makeSummons({ summons_number: 'S-NULL', hearing_date: '' }),
  ];

  it('includes summonses on Monday (start of week)', () => {
    const result = filterSummonsesByWeek(summonses, weekStart, weekEnd);
    expect(result.some((s) => s.summons_number === 'S-MON')).toBe(true);
  });

  it('includes summonses mid-week', () => {
    const result = filterSummonsesByWeek(summonses, weekStart, weekEnd);
    expect(result.some((s) => s.summons_number === 'S-WED')).toBe(true);
  });

  it('includes summonses on Sunday (end of week)', () => {
    const result = filterSummonsesByWeek(summonses, weekStart, weekEnd);
    expect(result.some((s) => s.summons_number === 'S-SUN')).toBe(true);
  });

  it('excludes summonses before the week', () => {
    const result = filterSummonsesByWeek(summonses, weekStart, weekEnd);
    expect(result.some((s) => s.summons_number === 'S-BEFORE')).toBe(false);
  });

  it('excludes summonses after the week', () => {
    const result = filterSummonsesByWeek(summonses, weekStart, weekEnd);
    expect(result.some((s) => s.summons_number === 'S-AFTER')).toBe(false);
  });

  it('excludes summonses with empty/null hearing_date', () => {
    const result = filterSummonsesByWeek(summonses, weekStart, weekEnd);
    expect(result.some((s) => s.summons_number === 'S-NULL')).toBe(false);
  });

  it('returns empty array when no summonses match', () => {
    const farWeekStart = dayjs('2030-01-01');
    const farWeekEnd = dayjs('2030-01-07');
    const result = filterSummonsesByWeek(summonses, farWeekStart, farWeekEnd);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    const result = filterSummonsesByWeek([], weekStart, weekEnd);
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// 3. STATUS SUB-FILTERING
// ============================================================================

describe('filterByStatus', () => {
  const summonses: Summons[] = [
    makeSummons({ summons_number: 'S1', hearing_date: '2026-02-16T00:00:00.000Z', status: 'SCHEDULED' }),
    makeSummons({ summons_number: 'S2', hearing_date: '2026-02-17T00:00:00.000Z', status: 'DEFAULT' }),
    makeSummons({ summons_number: 'S3', hearing_date: '2026-02-18T00:00:00.000Z', status: 'HEARING HELD' }),
    makeSummons({ summons_number: 'S4', hearing_date: '2026-02-19T00:00:00.000Z', status: 'DISMISSED' }),
    makeSummons({ summons_number: 'S5', hearing_date: '2026-02-20T00:00:00.000Z', status: '' }),
  ];

  it('returns all when filter is null', () => {
    expect(filterByStatus(summonses, null)).toHaveLength(5);
  });

  it('returns all when filter is empty string', () => {
    expect(filterByStatus(summonses, '')).toHaveLength(5);
  });

  it('returns all when filter is undefined', () => {
    expect(filterByStatus(summonses, undefined)).toHaveLength(5);
  });

  it('filters by SCHEDULED (case-insensitive)', () => {
    const result = filterByStatus(summonses, 'scheduled');
    expect(result).toHaveLength(1);
    expect(result[0].summons_number).toBe('S1');
  });

  it('filters by DEFAULT', () => {
    const result = filterByStatus(summonses, 'DEFAULT');
    expect(result).toHaveLength(1);
    expect(result[0].summons_number).toBe('S2');
  });

  it('filters by HEARING (substring match)', () => {
    const result = filterByStatus(summonses, 'HEARING');
    expect(result).toHaveLength(1);
    expect(result[0].summons_number).toBe('S3');
  });

  it('filters by DISMISSED', () => {
    const result = filterByStatus(summonses, 'DISMISSED');
    expect(result).toHaveLength(1);
    expect(result[0].summons_number).toBe('S4');
  });

  it('returns empty when no statuses match', () => {
    expect(filterByStatus(summonses, 'NONEXISTENT')).toHaveLength(0);
  });
});

// ============================================================================
// 4. CSV GENERATION WITH WEEK-FILTERED DATA
// ============================================================================

describe('CSV generation with week-filtered data', () => {
  const weekSummonses: Summons[] = [
    makeSummons({
      summons_number: '0000000001',
      hearing_date: '2026-02-16T00:00:00.000Z',
      respondent_name: 'Alpha Corp',
      status: 'SCHEDULED',
      license_plate: 'AAA1111',
      amount_due: 500,
    }),
    makeSummons({
      summons_number: '0000000002',
      hearing_date: '2026-02-18T00:00:00.000Z',
      respondent_name: 'Beta Inc',
      status: 'DEFAULT',
      license_plate: 'BBB2222',
      amount_due: 1000,
    }),
  ];

  const config: ExportConfig = {
    columns: ['hearing_date', 'respondent_name', 'summons_number', 'license_plate', 'status', 'amount_due'],
    dateFormat: 'us',
    includeHistorical: true,
  };

  it('produces correct number of rows (header + data)', () => {
    const csv = generateCSV(weekSummonses, config);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // header + 2 data rows
  });

  it('includes all expected column headers', () => {
    const csv = generateCSV(weekSummonses, config);
    const header = csv.split('\n')[0];
    expect(header).toContain('Summons Number');
    expect(header).toContain('Hearing Date');
    expect(header).toContain('Respondent Name');
    expect(header).toContain('Status');
    expect(header).toContain('Amount Due');
  });

  it('contains data from both summonses', () => {
    const csv = generateCSV(weekSummonses, config);
    expect(csv).toContain('Alpha Corp');
    expect(csv).toContain('Beta Inc');
    expect(csv).toContain('0000000001');
    expect(csv).toContain('0000000002');
  });

  it('exports only status-filtered rows when combined with filterByStatus', () => {
    const filtered = filterByStatus(weekSummonses, 'SCHEDULED');
    const csv = generateCSV(filtered, config);
    const lines = csv.split('\n');

    expect(lines).toHaveLength(2); // header + 1 matching row
    expect(csv).toContain('Alpha Corp');
    expect(csv).not.toContain('Beta Inc');
  });
});

// ============================================================================
// 5. EDGE CASES
// ============================================================================

describe('Edge cases', () => {
  it('empty week returns zero summonses', () => {
    const summonses = [
      makeSummons({ summons_number: 'S1', hearing_date: '2026-03-01T00:00:00.000Z' }),
    ];
    // Week of Feb 16-22 has no matches for March data
    const result = filterSummonsesByWeek(summonses, dayjs('2026-02-16'), dayjs('2026-02-22'));
    expect(result).toHaveLength(0);
  });

  it('month-boundary week includes dates from both months', () => {
    const summonses = [
      makeSummons({ summons_number: 'S-JAN', hearing_date: '2026-01-26T00:00:00.000Z' }),
      makeSummons({ summons_number: 'S-FEB', hearing_date: '2026-02-01T00:00:00.000Z' }),
    ];
    // ISO week of Feb 1 (Sunday) starts Mon Jan 26
    const { start, end } = getISOWeekRange(dayjs('2026-02-01'));
    const result = filterSummonsesByWeek(summonses, start, end);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.summons_number).sort()).toEqual(['S-FEB', 'S-JAN']);
  });

  it('handles hearing_date at midnight boundary correctly', () => {
    const summonses = [
      makeSummons({ summons_number: 'S-MIDNIGHT', hearing_date: '2026-02-16T00:00:00.000Z' }),
      makeSummons({ summons_number: 'S-END', hearing_date: '2026-02-22T23:59:59.999Z' }),
    ];
    const result = filterSummonsesByWeek(summonses, dayjs('2026-02-16'), dayjs('2026-02-22'));
    expect(result).toHaveLength(2);
  });

  it('getISOWeekRange + filterSummonsesByWeek compose correctly', () => {
    // Simulate the flow: user clicks a date → compute week → filter
    const anchor = dayjs('2026-02-18'); // Wednesday
    const { start, end } = getISOWeekRange(anchor);

    const summonses = [
      makeSummons({ summons_number: 'IN', hearing_date: '2026-02-19T00:00:00.000Z' }),
      makeSummons({ summons_number: 'OUT', hearing_date: '2026-02-25T00:00:00.000Z' }),
    ];

    const result = filterSummonsesByWeek(summonses, start, end);
    expect(result).toHaveLength(1);
    expect(result[0].summons_number).toBe('IN');
  });
});
