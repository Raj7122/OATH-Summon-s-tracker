/**
 * Unit tests for the hearing-result advanced filter
 *
 * Tests the pure utilities in src/lib/advancedFilter.ts that back Jacky's
 * "Hearing Result" filter: getHearingResultOptions() (dropdown options) and the
 * hearingResults branch of applyAdvancedFilters() (row matching + composition).
 */

import {
  applyAdvancedFilters,
  getHearingResultOptions,
  isAdvancedFilterActive,
  EMPTY_ADVANCED_FILTERS,
  AdvancedFilterCriteria,
} from '../src/lib/advancedFilter';
import { Summons } from '../src/types/summons';

// Helper to create a minimal summons for testing
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

function criteria(overrides: Partial<AdvancedFilterCriteria> = {}): AdvancedFilterCriteria {
  return { ...EMPTY_ADVANCED_FILTERS, ...overrides };
}

describe('getHearingResultOptions', () => {
  it('returns distinct, sorted, non-empty hearing_result values', () => {
    const summonses = [
      makeSummons({ id: 's1', hearing_result: 'IN VIOLATION' }),
      makeSummons({ id: 's2', hearing_result: 'DISMISSED' }),
      makeSummons({ id: 's3', hearing_result: 'DISMISSED' }), // duplicate
      makeSummons({ id: 's4', hearing_result: '' }), // empty ignored
      makeSummons({ id: 's5', hearing_result: undefined }), // missing ignored
      makeSummons({ id: 's6', hearing_result: '   ' }), // whitespace-only ignored
    ];
    expect(getHearingResultOptions(summonses)).toEqual(['DISMISSED', 'IN VIOLATION']);
  });

  it('returns an empty list when no results are present', () => {
    const summonses = [makeSummons({ hearing_result: '' }), makeSummons({ hearing_result: undefined })];
    expect(getHearingResultOptions(summonses)).toEqual([]);
  });

  it('trims surrounding whitespace when collecting options', () => {
    const summonses = [makeSummons({ hearing_result: '  DISMISSED  ' })];
    expect(getHearingResultOptions(summonses)).toEqual(['DISMISSED']);
  });
});

describe('isAdvancedFilterActive', () => {
  it('is active when hearingResults is non-empty', () => {
    expect(isAdvancedFilterActive(criteria({ hearingResults: ['DISMISSED'] }))).toBe(true);
  });

  it('is inactive for the empty criteria', () => {
    expect(isAdvancedFilterActive(EMPTY_ADVANCED_FILTERS)).toBe(false);
  });
});

describe('applyAdvancedFilters — hearingResults', () => {
  const summonses = [
    makeSummons({ id: 's1', hearing_result: 'DISMISSED' }),
    makeSummons({ id: 's2', hearing_result: 'IN VIOLATION' }),
    makeSummons({ id: 's3', hearing_result: '' }), // pending / no result
  ];

  it('returns all rows when hearingResults is empty (filter inactive)', () => {
    const result = applyAdvancedFilters(summonses, criteria({ hearingResults: [] }));
    expect(result).toHaveLength(3);
  });

  it('keeps only rows matching a selected result', () => {
    const result = applyAdvancedFilters(summonses, criteria({ hearingResults: ['DISMISSED'] }));
    expect(result.map((s) => s.id)).toEqual(['s1']);
  });

  it('excludes non-matching rows, including empty/pending results', () => {
    const result = applyAdvancedFilters(summonses, criteria({ hearingResults: ['IN VIOLATION'] }));
    expect(result.map((s) => s.id)).toEqual(['s2']);
  });

  it('supports selecting multiple results (OR within the filter)', () => {
    const result = applyAdvancedFilters(
      summonses,
      criteria({ hearingResults: ['DISMISSED', 'IN VIOLATION'] })
    );
    expect(result.map((s) => s.id)).toEqual(expect.arrayContaining(['s1', 's2']));
    expect(result).toHaveLength(2);
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    const rows = [makeSummons({ id: 'x1', hearing_result: '  Dismissed  ' })];
    const result = applyAdvancedFilters(rows, criteria({ hearingResults: ['DISMISSED'] }));
    expect(result).toHaveLength(1);
  });

  it('uses exact (not substring) matching so partial values do not match', () => {
    const rows = [makeSummons({ id: 'x1', hearing_result: 'HEARING COMPLETED - DISMISSED' })];
    // "DISMISSED" should NOT match the compound value under exact-equality semantics
    const result = applyAdvancedFilters(rows, criteria({ hearingResults: ['DISMISSED'] }));
    expect(result).toHaveLength(0);
  });
});

describe('applyAdvancedFilters — composition (AND) with other filters', () => {
  const summonses = [
    makeSummons({ id: 's1', status: 'HEARING COMPLETED', hearing_result: 'DISMISSED', hearing_date: '2026-03-05T00:00:00.000Z' }),
    makeSummons({ id: 's2', status: 'HEARING COMPLETED', hearing_result: 'IN VIOLATION', hearing_date: '2026-03-05T00:00:00.000Z' }),
    makeSummons({ id: 's3', status: 'SCHEDULED', hearing_result: 'DISMISSED', hearing_date: '2026-06-01T00:00:00.000Z' }),
  ];

  it('ANDs hearing result with status', () => {
    const result = applyAdvancedFilters(
      summonses,
      criteria({ statuses: ['HEARING COMPLETED'], hearingResults: ['DISMISSED'] })
    );
    // s1: status + result both match; s2 wrong result; s3 wrong status
    expect(result.map((s) => s.id)).toEqual(['s1']);
  });

  it('ANDs hearing result with the hearing date range', () => {
    const result = applyAdvancedFilters(
      summonses,
      criteria({
        hearingResults: ['DISMISSED'],
        dateFrom: new Date('2026-03-01'),
        dateTo: new Date('2026-03-31'),
      })
    );
    // s1 in range + DISMISSED; s3 DISMISSED but out of range
    expect(result.map((s) => s.id)).toEqual(['s1']);
  });
});
