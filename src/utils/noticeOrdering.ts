/**
 * Pure helpers that decide which summonses go on a Notice of Appearance
 * and in what order.
 *
 * The rules:
 *   1. The grid's live sort order (sortedIds) drives the final row order.
 *      This is what the user sees on the dashboard.
 *   2. When the "Select cases" toggle is on AND at least one row is checked,
 *      only those rows are included — still in grid-sort order.
 *   3. IDs that aren't in the current source collection are dropped
 *      (e.g., hidden by an upstream filter).
 *
 * Kept as a pure function so the ordering logic can be unit tested without
 * a rendered DataGrid.
 */

import type { Summons } from '../types/summons';

export interface BuildOrderedSummonsesArgs {
  /** All summonses currently eligible for the notice (e.g., weeklyFilteredSummonses). */
  source: Summons[];
  /**
   * Row IDs in the grid's current displayed sort order. Typically from
   * `useGridApiRef().current.getSortedRowIds()`. If unavailable (e.g., grid
   * not yet mounted), pass `null` and the caller's `source` array order is used.
   */
  sortedIds: ReadonlyArray<string | number> | null;
  /** IDs the user has checked via the selection toggle. */
  selectedIds: ReadonlyArray<string | number>;
  /** Whether the "Select cases" toggle is on. */
  selectionEnabled: boolean;
}

export function buildOrderedSummonses({
  source,
  sortedIds,
  selectedIds,
  selectionEnabled,
}: BuildOrderedSummonsesArgs): Summons[] {
  // Fall back to source order when the grid hasn't reported a sort yet.
  const orderedIds: ReadonlyArray<string | number> =
    sortedIds ?? source.map((s) => s.id);

  const selectedSet = new Set(selectedIds.map(String));
  const applySelection = selectionEnabled && selectedSet.size > 0;

  const pickIds = applySelection
    ? orderedIds.filter((id) => selectedSet.has(String(id)))
    : orderedIds;

  const byId = new Map(source.map((s) => [s.id, s]));
  return pickIds
    .map((id) => byId.get(String(id)))
    .filter((s): s is Summons => Boolean(s));
}
