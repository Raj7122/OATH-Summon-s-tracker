/**
 * Unit tests for buildOrderedSummonses.
 *
 * The function decides which summonses appear on a Notice of Appearance and
 * in what order. These tests lock in the contract the dashboard relies on:
 * the DOCX must match what the user sees in the grid.
 */

import { describe, it, expect } from 'vitest';
import { buildOrderedSummonses } from '../src/utils/noticeOrdering';
import { Summons } from '../src/types/summons';

function makeSummons(overrides: Partial<Summons> & { id: string; summons_number: string }): Summons {
  return {
    id: overrides.id,
    clientID: 'client-1',
    respondent_name: 'Test Corp',
    status: 'SCHEDULED',
    license_plate: 'ABC1234',
    base_fine: 350,
    amount_due: 0,
    hearing_date: '2026-04-15T09:00:00.000Z',
    violation_date: '2026-01-01T00:00:00.000Z',
    violation_location: '123 Test St',
    summons_pdf_link: '',
    video_link: '',
    added_to_calendar: false,
    evidence_reviewed: false,
    evidence_requested: false,
    evidence_received: false,
    ...overrides,
  } as Summons;
}

describe('buildOrderedSummonses', () => {
  const a = makeSummons({ id: 'A', summons_number: '2026-000001' });
  const b = makeSummons({ id: 'B', summons_number: '2026-000002' });
  const c = makeSummons({ id: 'C', summons_number: '2026-000003' });
  const source = [a, b, c];

  describe('no selection', () => {
    it('returns all rows in sortedIds order', () => {
      const result = buildOrderedSummonses({
        source,
        sortedIds: ['C', 'A', 'B'],
        selectedIds: [],
        selectionEnabled: false,
      });
      expect(result.map((s) => s.id)).toEqual(['C', 'A', 'B']);
    });

    it('ignores selectedIds when selectionEnabled is false', () => {
      // Even if selectedIds is populated, selection mode off → all rows.
      const result = buildOrderedSummonses({
        source,
        sortedIds: ['A', 'B', 'C'],
        selectedIds: ['A'],
        selectionEnabled: false,
      });
      expect(result.map((s) => s.id)).toEqual(['A', 'B', 'C']);
    });

    it('falls back to source order when sortedIds is null', () => {
      const result = buildOrderedSummonses({
        source,
        sortedIds: null,
        selectedIds: [],
        selectionEnabled: false,
      });
      expect(result.map((s) => s.id)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('with selection', () => {
    it('returns only selected rows in sortedIds order', () => {
      const result = buildOrderedSummonses({
        source,
        sortedIds: ['C', 'A', 'B'],
        selectedIds: ['A', 'B'],
        selectionEnabled: true,
      });
      expect(result.map((s) => s.id)).toEqual(['A', 'B']);
    });

    it('preserves sort order even when selectedIds is given in a different order', () => {
      // Caller passes selectedIds in arbitrary order — grid sort still wins.
      const result = buildOrderedSummonses({
        source,
        sortedIds: ['A', 'B', 'C'],
        selectedIds: ['C', 'A'],
        selectionEnabled: true,
      });
      expect(result.map((s) => s.id)).toEqual(['A', 'C']);
    });

    it('treats empty selection as "no selection" → all rows', () => {
      const result = buildOrderedSummonses({
        source,
        sortedIds: ['A', 'B', 'C'],
        selectedIds: [],
        selectionEnabled: true,
      });
      expect(result.map((s) => s.id)).toEqual(['A', 'B', 'C']);
    });

    it('drops selected IDs not present in sortedIds', () => {
      // Happens if a filter hides a row that was previously checked.
      const result = buildOrderedSummonses({
        source,
        sortedIds: ['A', 'B'], // C hidden by filter
        selectedIds: ['A', 'C'],
        selectionEnabled: true,
      });
      expect(result.map((s) => s.id)).toEqual(['A']);
    });

    it('handles numeric IDs in selectedIds', () => {
      // MUI GridRowSelectionModel values can be strings or numbers.
      const result = buildOrderedSummonses({
        source,
        sortedIds: ['A', 'B', 'C'],
        selectedIds: [0, 'B'] as Array<string | number>,
        selectionEnabled: true,
      });
      expect(result.map((s) => s.id)).toEqual(['B']);
    });
  });

  describe('edge cases', () => {
    it('returns empty array when source is empty', () => {
      const result = buildOrderedSummonses({
        source: [],
        sortedIds: ['A'],
        selectedIds: [],
        selectionEnabled: false,
      });
      expect(result).toEqual([]);
    });

    it('drops sortedIds not present in source (stale IDs)', () => {
      const result = buildOrderedSummonses({
        source: [a, b],
        sortedIds: ['A', 'X', 'B'], // X doesn't exist
        selectedIds: [],
        selectionEnabled: false,
      });
      expect(result.map((s) => s.id)).toEqual(['A', 'B']);
    });

    it('reorders when user changes the grid sort', () => {
      // Simulate user sorting by status ascending vs hearing_date descending.
      const r1 = buildOrderedSummonses({
        source,
        sortedIds: ['A', 'B', 'C'],
        selectedIds: [],
        selectionEnabled: false,
      });
      const r2 = buildOrderedSummonses({
        source,
        sortedIds: ['C', 'B', 'A'],
        selectedIds: [],
        selectionEnabled: false,
      });
      expect(r1.map((s) => s.id)).toEqual(['A', 'B', 'C']);
      expect(r2.map((s) => s.id)).toEqual(['C', 'B', 'A']);
    });
  });
});
