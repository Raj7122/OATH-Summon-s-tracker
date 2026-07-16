/**
 * Unit tests for getHearingResultValueOptions — the valueOptions builder that
 * powers the hearing_result column's native DataGrid singleSelect filter on the
 * Dashboard and Client Detail grids.
 */

import { getHearingResultValueOptions } from '../src/lib/hearingResultOptions';
import { Summons } from '../src/types/summons';

function makeSummons(overrides: Partial<Summons> = {}): Summons {
  return {
    id: 'summons-1',
    clientID: 'client-1',
    summons_number: 'SN-001',
    respondent_name: 'Test Corp',
    hearing_date: '2026-03-01T00:00:00.000Z',
    status: 'SCHEDULED',
    license_plate: '',
    base_fine: 350,
    amount_due: 350,
    violation_date: '2026-01-15T00:00:00.000Z',
    violation_location: 'NYC',
    summons_pdf_link: '',
    video_link: '',
    added_to_calendar: false,
    evidence_reviewed: false,
    evidence_requested: false,
    evidence_received: false,
    ...overrides,
  };
}

describe('getHearingResultValueOptions', () => {
  it('always prepends the "Pending" option for blank results', () => {
    const options = getHearingResultValueOptions([]);
    expect(options[0]).toEqual({ value: '', label: 'Pending' });
    expect(options).toHaveLength(1);
  });

  it('returns distinct, sorted non-empty values after Pending', () => {
    const summonses = [
      makeSummons({ id: 's1', hearing_result: 'IN VIOLATION' }),
      makeSummons({ id: 's2', hearing_result: 'ADMIT IN-VIO' }),
      makeSummons({ id: 's3', hearing_result: 'DEFAULTED' }),
      makeSummons({ id: 's4', hearing_result: 'DEFAULTED' }), // duplicate
    ];
    const options = getHearingResultValueOptions(summonses);
    expect(options).toEqual([
      { value: '', label: 'Pending' },
      { value: 'ADMIT IN-VIO', label: 'ADMIT IN-VIO' },
      { value: 'DEFAULTED', label: 'DEFAULTED' },
      { value: 'IN VIOLATION', label: 'IN VIOLATION' },
    ]);
  });

  it('ignores empty, whitespace-only, and missing results for the real values', () => {
    const summonses = [
      makeSummons({ id: 's1', hearing_result: '' }),
      makeSummons({ id: 's2', hearing_result: '   ' }),
      makeSummons({ id: 's3', hearing_result: undefined }),
      makeSummons({ id: 's4', hearing_result: 'DISMISSED' }),
    ];
    const options = getHearingResultValueOptions(summonses);
    expect(options).toEqual([
      { value: '', label: 'Pending' },
      { value: 'DISMISSED', label: 'DISMISSED' },
    ]);
  });

  it('trims surrounding whitespace when collecting values', () => {
    const summonses = [makeSummons({ hearing_result: '  STIPULATED  ' })];
    const options = getHearingResultValueOptions(summonses);
    expect(options).toContainEqual({ value: 'STIPULATED', label: 'STIPULATED' });
  });
});
