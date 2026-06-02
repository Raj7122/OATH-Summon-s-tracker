/**
 * Pure comparator for invoice line items and picker candidates.
 *
 * Sort order: hearing_date ascending, null dates last, tiebreak on
 * summons_number ascending so the order is deterministic across reloads.
 */

export interface HearingDateSortable {
  hearing_date: string | null;
  summons_number?: string;
}

export function compareByHearingDateAsc<T extends HearingDateSortable>(a: T, b: T): number {
  const aHas = Boolean(a.hearing_date);
  const bHas = Boolean(b.hearing_date);

  if (aHas && bHas) {
    if (a.hearing_date! < b.hearing_date!) return -1;
    if (a.hearing_date! > b.hearing_date!) return 1;
  } else if (aHas) {
    return -1;
  } else if (bHas) {
    return 1;
  }

  const aNum = a.summons_number || '';
  const bNum = b.summons_number || '';
  if (aNum < bNum) return -1;
  if (aNum > bNum) return 1;
  return 0;
}
