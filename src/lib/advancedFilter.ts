/**
 * Advanced Filter — multi-status + hearing date range
 *
 * Pure, reusable predicate applied on top of any other in-memory filtering
 * the Dashboard / ClientDetail pages already perform. Keeps the existing
 * single-select chip filters intact and composes (AND) with them.
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Summons } from '../types/summons';

dayjs.extend(utc);

export interface AdvancedFilterCriteria {
  statuses: string[];
  dateFrom: Date | null;
  dateTo: Date | null;
}

export const EMPTY_ADVANCED_FILTERS: AdvancedFilterCriteria = {
  statuses: [],
  dateFrom: null,
  dateTo: null,
};

export function isAdvancedFilterActive(criteria: AdvancedFilterCriteria): boolean {
  return (
    criteria.statuses.length > 0 ||
    criteria.dateFrom !== null ||
    criteria.dateTo !== null
  );
}

/**
 * Canonical NYC OATH status categories, always shown in the dropdown so
 * top-level filters like DISMISSED are pickable even if the underlying data
 * stores them as compound values (e.g. "HEARING COMPLETED - DISMISSED").
 * Mirrors the labels used in CalendarDashboard's week-mode status dropdown.
 */
export const CANONICAL_STATUSES: string[] = [
  'SCHEDULED',
  'RESCHEDULED',
  'HEARING COMPLETED',
  'DISMISSED',
  'PAID IN FULL',
  'DEFAULT',
  'DOCKETED',
];

/**
 * Sorted, deduplicated list of canonical statuses union'd with whatever
 * distinct values the loaded data contains. Canonical entries are always
 * present so the user can filter for DISMISSED / HEARING COMPLETED / etc.
 * even when the underlying data only has compound variants.
 */
export function getStatusOptions(summonses: Summons[]): string[] {
  const set = new Set<string>(CANONICAL_STATUSES);
  for (const s of summonses) {
    const v = (s.status || '').trim();
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Apply the multi-status + hearing date range filter.
 * - Empty `statuses` → status filter inactive.
 * - `dateFrom` / `dateTo` are inclusive; either may be null.
 *
 * Hearing dates are stored as date-only ISO strings in UTC; using
 * `dayjs.utc(...).startOf('day')` matches how SummonsTable / ClientDetail
 * already render them and avoids local-timezone off-by-one bugs.
 */
export function applyAdvancedFilters(
  summonses: Summons[],
  criteria: AdvancedFilterCriteria
): Summons[] {
  if (!isAdvancedFilterActive(criteria)) return summonses;

  // Status match is case-insensitive substring so picking "DISMISSED" also
  // captures compound values like "HEARING COMPLETED - DISMISSED". Mirrors
  // the existing week-mode status filter.
  const statusNeedles =
    criteria.statuses.length > 0
      ? criteria.statuses.map((v) => v.toUpperCase())
      : null;

  const fromMs = criteria.dateFrom
    ? dayjs.utc(dayjs(criteria.dateFrom).format('YYYY-MM-DD')).startOf('day').valueOf()
    : null;
  const toMs = criteria.dateTo
    ? dayjs.utc(dayjs(criteria.dateTo).format('YYYY-MM-DD')).endOf('day').valueOf()
    : null;

  return summonses.filter((s) => {
    if (statusNeedles) {
      const hay = (s.status || '').toUpperCase();
      if (!statusNeedles.some((needle) => hay.includes(needle))) {
        return false;
      }
    }

    if (fromMs !== null || toMs !== null) {
      if (!s.hearing_date) return false;
      const hearingMs = dayjs.utc(s.hearing_date).valueOf();
      if (Number.isNaN(hearingMs)) return false;
      if (fromMs !== null && hearingMs < fromMs) return false;
      if (toMs !== null && hearingMs > toMs) return false;
    }

    return true;
  });
}
