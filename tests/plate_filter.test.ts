/**
 * Unit tests for per-client license plate filtering utility
 *
 * Tests the pure utility functions in src/lib/plateFilter.ts
 */

import { applyClientPlateFilter, applyPlateFilters } from '../src/lib/plateFilter';
import { Summons, Client } from '../src/types/summons';

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

// Helper to create a minimal client for testing
function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client-1',
    name: 'Test Corp',
    ...overrides,
  };
}

describe('applyClientPlateFilter', () => {
  const summonses: Summons[] = [
    makeSummons({ id: 's1', license_plate: 'ABC1234', license_plate_ocr: undefined }),
    makeSummons({ id: 's2', license_plate: 'XYZ9999', license_plate_ocr: 'XYZ9999' }),
    makeSummons({ id: 's3', license_plate: 'DEF5678', license_plate_ocr: 'DEF5678' }),
    makeSummons({ id: 's4', license_plate: '', license_plate_ocr: undefined }), // No plate data
  ];

  it('returns all summonses when filter is OFF', () => {
    const client = makeClient({ plate_filter_enabled: false, plate_filter_list: ['ABC1234'] });
    const result = applyClientPlateFilter(summonses, client);
    expect(result).toHaveLength(4);
  });

  it('returns all summonses when plate_filter_enabled is undefined', () => {
    const client = makeClient({});
    const result = applyClientPlateFilter(summonses, client);
    expect(result).toHaveLength(4);
  });

  it('returns all summonses when filter is ON but plate list is empty', () => {
    const client = makeClient({ plate_filter_enabled: true, plate_filter_list: [] });
    const result = applyClientPlateFilter(summonses, client);
    expect(result).toHaveLength(4);
  });

  it('returns all summonses when filter is ON but plate list is undefined', () => {
    const client = makeClient({ plate_filter_enabled: true });
    const result = applyClientPlateFilter(summonses, client);
    expect(result).toHaveLength(4);
  });

  it('filters to only matching plates when filter is ON', () => {
    const client = makeClient({ plate_filter_enabled: true, plate_filter_list: ['ABC1234'] });
    const result = applyClientPlateFilter(summonses, client);
    // s1 matches (API plate), s4 has no plate data (included conservatively)
    expect(result).toHaveLength(2);
    expect(result.map(s => s.id)).toContain('s1');
    expect(result.map(s => s.id)).toContain('s4');
  });

  it('returns empty array when no plates match (except no-plate records)', () => {
    const client = makeClient({ plate_filter_enabled: true, plate_filter_list: ['NOMATCH'] });
    const result = applyClientPlateFilter(summonses, client);
    // Only s4 (no plate data) is included
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s4');
  });

  it('handles case insensitive plate matching', () => {
    const client = makeClient({ plate_filter_enabled: true, plate_filter_list: ['abc1234'] });
    const result = applyClientPlateFilter(summonses, client);
    expect(result.map(s => s.id)).toContain('s1');
  });

  it('checks both license_plate_ocr and license_plate fields', () => {
    const client = makeClient({ plate_filter_enabled: true, plate_filter_list: ['XYZ9999'] });
    const result = applyClientPlateFilter(summonses, client);
    expect(result.map(s => s.id)).toContain('s2');
  });

  it('matches via OCR plate even when API plate differs', () => {
    const mixed = [
      makeSummons({ id: 'm1', license_plate: 'WRONG', license_plate_ocr: 'CORRECT' }),
    ];
    const client = makeClient({ plate_filter_enabled: true, plate_filter_list: ['CORRECT'] });
    const result = applyClientPlateFilter(mixed, client);
    expect(result).toHaveLength(1);
  });

  it('includes summonses with no plate data when filter is ON (conservative)', () => {
    const noPlate = [
      makeSummons({ id: 'np1', license_plate: '', license_plate_ocr: undefined }),
      makeSummons({ id: 'np2', license_plate: '', license_plate_ocr: '' }),
    ];
    const client = makeClient({ plate_filter_enabled: true, plate_filter_list: ['ABC1234'] });
    const result = applyClientPlateFilter(noPlate, client);
    expect(result).toHaveLength(2);
  });

  it('handles plates with whitespace', () => {
    const spacedSummons = [
      makeSummons({ id: 'sp1', license_plate: '  ABC1234  ' }),
    ];
    const client = makeClient({ plate_filter_enabled: true, plate_filter_list: ['ABC1234'] });
    const result = applyClientPlateFilter(spacedSummons, client);
    expect(result).toHaveLength(1);
  });

  it('supports multiple plates in the filter list', () => {
    const client = makeClient({
      plate_filter_enabled: true,
      plate_filter_list: ['ABC1234', 'DEF5678'],
    });
    const result = applyClientPlateFilter(summonses, client);
    // s1 (ABC1234), s3 (DEF5678), s4 (no plate)
    expect(result).toHaveLength(3);
    expect(result.map(s => s.id)).toEqual(expect.arrayContaining(['s1', 's3', 's4']));
  });
});

describe('applyPlateFilters', () => {
  it('returns all summonses when no clients have plate filtering enabled', () => {
    const summonses = [
      makeSummons({ id: 's1', clientID: 'c1', license_plate: 'ABC1234' }),
      makeSummons({ id: 's2', clientID: 'c2', license_plate: 'XYZ9999' }),
    ];
    const clients = [
      makeClient({ id: 'c1', plate_filter_enabled: false }),
      makeClient({ id: 'c2' }),
    ];
    const result = applyPlateFilters(summonses, clients);
    expect(result).toHaveLength(2);
  });

  it('filters summonses for clients with plate filtering enabled', () => {
    const summonses = [
      makeSummons({ id: 's1', clientID: 'c1', license_plate: 'ABC1234' }),
      makeSummons({ id: 's2', clientID: 'c1', license_plate: 'XYZ9999' }),
      makeSummons({ id: 's3', clientID: 'c2', license_plate: 'QRS4567' }),
    ];
    const clients = [
      makeClient({ id: 'c1', plate_filter_enabled: true, plate_filter_list: ['ABC1234'] }),
      makeClient({ id: 'c2', plate_filter_enabled: false }),
    ];
    const result = applyPlateFilters(summonses, clients);
    // s1 matches c1's filter, s2 doesn't match, s3 belongs to c2 (no filter)
    expect(result).toHaveLength(2);
    expect(result.map(s => s.id)).toEqual(expect.arrayContaining(['s1', 's3']));
  });

  it('handles different clients with different plate settings', () => {
    const summonses = [
      makeSummons({ id: 's1', clientID: 'c1', license_plate: 'PLATE_A' }),
      makeSummons({ id: 's2', clientID: 'c1', license_plate: 'PLATE_B' }),
      makeSummons({ id: 's3', clientID: 'c2', license_plate: 'PLATE_C' }),
      makeSummons({ id: 's4', clientID: 'c2', license_plate: 'PLATE_D' }),
    ];
    const clients = [
      makeClient({ id: 'c1', plate_filter_enabled: true, plate_filter_list: ['PLATE_A'] }),
      makeClient({ id: 'c2', plate_filter_enabled: true, plate_filter_list: ['PLATE_D'] }),
    ];
    const result = applyPlateFilters(summonses, clients);
    expect(result).toHaveLength(2);
    expect(result.map(s => s.id)).toEqual(expect.arrayContaining(['s1', 's4']));
  });

  it('passes through summonses for unknown clientIDs (not in client list)', () => {
    const summonses = [
      makeSummons({ id: 's1', clientID: 'unknown', license_plate: 'ABC1234' }),
    ];
    const clients = [
      makeClient({ id: 'c1', plate_filter_enabled: true, plate_filter_list: ['XYZ'] }),
    ];
    const result = applyPlateFilters(summonses, clients);
    expect(result).toHaveLength(1);
  });

  it('includes no-plate summonses for filtered clients (conservative)', () => {
    const summonses = [
      makeSummons({ id: 's1', clientID: 'c1', license_plate: '', license_plate_ocr: undefined }),
    ];
    const clients = [
      makeClient({ id: 'c1', plate_filter_enabled: true, plate_filter_list: ['ABC1234'] }),
    ];
    const result = applyPlateFilters(summonses, clients);
    expect(result).toHaveLength(1);
  });
});
