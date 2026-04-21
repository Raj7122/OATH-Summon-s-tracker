import { describe, it, expect } from 'vitest';
import { compareByHearingDateAsc } from '../src/utils/invoiceOrdering';

type Row = { hearing_date: string | null; summons_number: string };

const r = (summons_number: string, hearing_date: string | null): Row => ({
  summons_number,
  hearing_date,
});

describe('compareByHearingDateAsc', () => {
  it('sorts by hearing_date ascending when both are set', () => {
    const rows: Row[] = [
      r('S-3', '2026-03-10T09:00:00.000Z'),
      r('S-1', '2026-01-05T09:00:00.000Z'),
      r('S-2', '2026-02-20T09:00:00.000Z'),
    ];
    const sorted = [...rows].sort(compareByHearingDateAsc);
    expect(sorted.map((x) => x.summons_number)).toEqual(['S-1', 'S-2', 'S-3']);
  });

  it('places null hearing_date rows after rows with a hearing_date', () => {
    const rows: Row[] = [
      r('S-NULL', null),
      r('S-LATE', '2026-04-01T09:00:00.000Z'),
      r('S-EARLY', '2026-01-01T09:00:00.000Z'),
    ];
    const sorted = [...rows].sort(compareByHearingDateAsc);
    expect(sorted.map((x) => x.summons_number)).toEqual(['S-EARLY', 'S-LATE', 'S-NULL']);
  });

  it('tiebreaks null-vs-null rows by summons_number ascending', () => {
    const rows: Row[] = [
      r('S-B', null),
      r('S-A', null),
      r('S-C', null),
    ];
    const sorted = [...rows].sort(compareByHearingDateAsc);
    expect(sorted.map((x) => x.summons_number)).toEqual(['S-A', 'S-B', 'S-C']);
  });

  it('is a pure comparator — does not mutate the input when caller copies first', () => {
    const rows: Row[] = [
      r('S-2', '2026-02-20T09:00:00.000Z'),
      r('S-1', '2026-01-05T09:00:00.000Z'),
    ];
    const snapshot = rows.map((x) => x.summons_number);
    [...rows].sort(compareByHearingDateAsc);
    expect(rows.map((x) => x.summons_number)).toEqual(snapshot);
  });
});
