/**
 * Week Filtering Utilities
 *
 * Pure functions for ISO week range calculation and summons filtering.
 * Extracted for testability — no React or UI dependencies.
 *
 * @module utils/weekFilters
 */

import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import utc from 'dayjs/plugin/utc';

dayjs.extend(isoWeek);
dayjs.extend(utc);

import { Summons } from '../types/summons';

/**
 * Get the ISO week range (Monday–Sunday) for a given anchor date.
 *
 * Uses dayjs isoWeek plugin so Monday is always the start of the week,
 * matching the standard ISO 8601 convention used across the app.
 */
export function getISOWeekRange(anchor: Dayjs): { start: Dayjs; end: Dayjs } {
  return {
    start: anchor.startOf('isoWeek'),
    end: anchor.endOf('isoWeek'),
  };
}

/**
 * Filter summonses whose hearing_date falls within [weekStart, weekEnd] (inclusive).
 *
 * hearing_date is stored as ISO UTC (e.g. "2026-02-16T00:00:00.000Z").
 * We compare date-only strings to avoid timezone edge cases.
 */
export function filterSummonsesByWeek(
  summonses: Summons[],
  weekStart: Dayjs,
  weekEnd: Dayjs,
): Summons[] {
  const startStr = weekStart.format('YYYY-MM-DD');
  const endStr = weekEnd.format('YYYY-MM-DD');

  return summonses.filter((s) => {
    if (!s.hearing_date) return false;
    const key = dayjs.utc(s.hearing_date).format('YYYY-MM-DD');
    return key >= startStr && key <= endStr;
  });
}

/**
 * Sub-filter by case status (case-insensitive substring match).
 * Returns the original array when statusFilter is null/undefined/empty.
 */
export function filterByStatus(
  summonses: Summons[],
  statusFilter: string | null | undefined,
): Summons[] {
  if (!statusFilter) return summonses;
  const upper = statusFilter.toUpperCase();
  return summonses.filter((s) =>
    (s.status || '').toUpperCase().includes(upper),
  );
}
