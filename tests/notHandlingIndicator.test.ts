/**
 * "Not Handling" Indicator Tests
 *
 * Guards the dashboard grid (SimpleSummonsTable) and the per-client grid
 * (ClientDetail) behavior for summonses marked internal_status = "Not Handling":
 *
 * 1. Row-class precedence: a "Not Handling" row must be flagged as
 *    `not-handling-row` EVEN when it would otherwise qualify for the
 *    `fresh-row` (new/updated) highlight — the firm-set status wins so the
 *    row doesn't also glow as new.
 * 2. Badge predicate: the bold purple "NOT HANDLING" chip shows iff
 *    internal_status === 'Not Handling'.
 *
 * These mirror the inline logic in:
 *   - src/components/SimpleSummonsTable.tsx  (getRowClassName + renderStatusCell)
 *   - src/pages/ClientDetail.tsx             (getRowClassName + status renderCell)
 *
 * @module tests/notHandlingIndicator
 */

import { describe, it, expect } from 'vitest';

interface MockRow {
  internal_status?: string;
  isFresh?: boolean; // stand-in for isFreshSummons(row) on the dashboard grid
}

const NOT_HANDLING = 'Not Handling';

/**
 * Mirror of SimpleSummonsTable's getRowClassName precedence:
 *   "Not Handling" -> 'not-handling-row' (takes precedence over fresh)
 *   otherwise fresh -> 'fresh-row'
 *   otherwise ''
 */
function dashboardRowClass(row: MockRow): string {
  if (row.internal_status === NOT_HANDLING) return 'not-handling-row';
  return row.isFresh ? 'fresh-row' : '';
}

/** Mirror of the badge visibility predicate used in both status cells. */
function showsNotHandlingBadge(row: MockRow): boolean {
  return row.internal_status === NOT_HANDLING;
}

describe('Not Handling — row class precedence (dashboard grid)', () => {
  it('flags a Not Handling row as not-handling-row', () => {
    expect(dashboardRowClass({ internal_status: NOT_HANDLING })).toBe('not-handling-row');
  });

  it('takes precedence over the fresh-row highlight', () => {
    // Recently updated AND not handling → not-handling-row wins (no yellow glow)
    expect(dashboardRowClass({ internal_status: NOT_HANDLING, isFresh: true })).toBe('not-handling-row');
  });

  it('still shows fresh-row for a fresh, non-Not-Handling summons', () => {
    expect(dashboardRowClass({ internal_status: 'New', isFresh: true })).toBe('fresh-row');
  });

  it('applies no special class for a normal, non-fresh summons', () => {
    expect(dashboardRowClass({ internal_status: 'Reviewing', isFresh: false })).toBe('');
  });

  it('does not match on other statuses', () => {
    for (const status of ['New', 'Reviewing', 'Hearing Complete', 'Summons Paid', 'Archived', undefined]) {
      expect(dashboardRowClass({ internal_status: status })).not.toBe('not-handling-row');
    }
  });
});

describe('Not Handling — badge predicate', () => {
  it('shows the badge only when internal_status is exactly "Not Handling"', () => {
    expect(showsNotHandlingBadge({ internal_status: NOT_HANDLING })).toBe(true);
    expect(showsNotHandlingBadge({ internal_status: 'not handling' })).toBe(false); // case-sensitive
    expect(showsNotHandlingBadge({ internal_status: 'New' })).toBe(false);
    expect(showsNotHandlingBadge({})).toBe(false);
  });
});
