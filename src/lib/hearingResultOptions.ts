/**
 * Hearing Result value options for the DataGrid's native `singleSelect` filter.
 *
 * Shared by the Dashboard grid (SummonsTable) and the Client Detail grid so the
 * "Filters" toolbar menu offers a dropdown of the hearing-result values that
 * actually exist in the loaded data (e.g. ADMIT IN-VIO, DEFAULTED, DISMISSED),
 * plus a "Pending" entry for summonses with no result yet.
 */

export interface HearingResultOption {
  value: string;
  label: string;
}

/**
 * Minimal structural shape this util needs. Accepting just `{ hearing_result }`
 * (rather than the full `Summons`) lets both the canonical `types/summons.ts`
 * model and the pages' local `Summons` interfaces pass without type friction.
 */
interface HasHearingResult {
  hearing_result?: string | null;
}

/**
 * Build the `valueOptions` array for the hearing_result column.
 *
 * - Distinct, trimmed, non-empty `hearing_result` values, sorted alphabetically.
 * - Always prepends `{ value: '', label: 'Pending' }` so blank results are
 *   filterable as "Pending" and so MUI's singleSelect doesn't warn about empty
 *   cell values being absent from valueOptions.
 */
export function getHearingResultValueOptions(summonses: HasHearingResult[]): HearingResultOption[] {
  const set = new Set<string>();
  for (const s of summonses) {
    const v = (s.hearing_result || '').trim();
    if (v) set.add(v);
  }
  const options = Array.from(set)
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ value: v, label: v }));

  // Blank hearing_result → "Pending"; keep it first so it's easy to find.
  return [{ value: '', label: 'Pending' }, ...options];
}
