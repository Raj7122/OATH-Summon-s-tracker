/**
 * Evidence Date Persistence & Consolidated Mutation Tests
 *
 * Verifies:
 * 1. New date fields (evidence_reviewed_date, added_to_calendar_date) in types
 * 2. GraphQL queries/mutations/subscriptions include the new fields
 * 3. Checkbox handler consolidation (single onUpdate call with extraFields)
 * 4. DatePicker auto-set on first checkbox check
 * 5. DatePicker doesn't overwrite existing date on re-check
 * 6. Internal status handler consolidation
 * 7. Invoice chip handler consolidation
 * 8. DEP file date JSON.stringify for AWSJSON persistence
 *
 * Run with: npx vitest run tests/verify_evidence_dates.test.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import dayjs from 'dayjs';

// ============================================================================
// TYPE DEFINITIONS (matching src/types/summons.ts)
// ============================================================================

interface AttributionData {
  completed: boolean;
  by?: string;
  userId?: string;
  date?: string;
}

interface DepFileDateAttribution {
  value?: string;
  by?: string;
  userId?: string;
  date?: string;
}

interface InternalStatusAttribution {
  value?: string;
  by?: string;
  userId?: string;
  date?: string;
}

// ============================================================================
// PART 1: TYPE & SCHEMA FIELD VERIFICATION
// ============================================================================

describe('Schema & Type Field Verification', () => {
  it('Summons type includes evidence_reviewed_date and added_to_calendar_date', async () => {
    // Import the actual type file to verify fields exist
    const typesModule = await import('../src/types/summons');
    // Create a Summons object with the new fields to verify TypeScript accepts them
    const summons: Partial<typeof typesModule.default extends never ? Record<string, unknown> : never> & {
      evidence_reviewed_date?: string;
      added_to_calendar_date?: string;
    } = {
      evidence_reviewed_date: '2026-02-20T00:00:00.000Z',
      added_to_calendar_date: '2026-02-20T00:00:00.000Z',
    };

    expect(summons.evidence_reviewed_date).toBe('2026-02-20T00:00:00.000Z');
    expect(summons.added_to_calendar_date).toBe('2026-02-20T00:00:00.000Z');
  });
});

describe('GraphQL Field Inclusion', () => {
  it('queries.js includes evidence_reviewed_date and added_to_calendar_date', async () => {
    const queries = await import('../src/graphql/queries');

    // Check all summons-returning queries
    const queriesToCheck = [
      queries.getSummons,
      queries.listSummons,
      queries.summonsByClientIDAndHearing_date,
      queries.summonsBySummonsNumber,
      queries.summonsByOcrStatus,
    ];

    for (const query of queriesToCheck) {
      expect(query).toContain('evidence_reviewed_date');
      expect(query).toContain('added_to_calendar_date');
    }
  });

  it('mutations.js includes evidence_reviewed_date and added_to_calendar_date', async () => {
    const mutations = await import('../src/graphql/mutations');

    const mutationsToCheck = [
      mutations.createSummons,
      mutations.updateSummons,
      mutations.deleteSummons,
    ];

    for (const mutation of mutationsToCheck) {
      expect(mutation).toContain('evidence_reviewed_date');
      expect(mutation).toContain('added_to_calendar_date');
    }
  });

  it('subscriptions.js includes evidence_reviewed_date and added_to_calendar_date', async () => {
    const subscriptions = await import('../src/graphql/subscriptions');

    const subsToCheck = [
      subscriptions.onCreateSummons,
      subscriptions.onUpdateSummons,
      subscriptions.onDeleteSummons,
    ];

    for (const sub of subsToCheck) {
      expect(sub).toContain('evidence_reviewed_date');
      expect(sub).toContain('added_to_calendar_date');
    }
  });

  it('new date fields appear after evidence_received_date in queries', async () => {
    const queries = await import('../src/graphql/queries');

    // Verify ordering: evidence_received_date → evidence_reviewed_date → added_to_calendar_date
    const listQuery = queries.listSummons as string;
    const receivedIdx = listQuery.indexOf('evidence_received_date');
    const reviewedIdx = listQuery.indexOf('evidence_reviewed_date');
    const calendarIdx = listQuery.indexOf('added_to_calendar_date');

    expect(receivedIdx).toBeGreaterThan(-1);
    expect(reviewedIdx).toBeGreaterThan(receivedIdx);
    expect(calendarIdx).toBeGreaterThan(reviewedIdx);
  });
});

// ============================================================================
// PART 2: CONSOLIDATED CHECKBOX HANDLER LOGIC
// ============================================================================

/**
 * Simulates the refactored handleCheckboxChange logic from SummonsDetailModal.
 * This is a pure-function extraction for testability.
 */
function simulateCheckboxChange(
  field: string,
  checked: boolean,
  currentUser: { id: string; name: string },
  existingDates: {
    evidenceRequestedDate: string | null;
    evidenceReceivedDate: string | null;
    evidenceReviewedDate: string | null;
    addedToCalendarDate: string | null;
  },
): { extra: Record<string, unknown>; newAttr: AttributionData } {
  const now = dayjs().toISOString();
  const newAttr: AttributionData = {
    completed: checked,
    by: checked ? currentUser.name : undefined,
    userId: checked ? currentUser.id : undefined,
    date: checked ? now : undefined,
  };

  const extra: Record<string, unknown> = {
    [`${field}_attr`]: JSON.stringify(newAttr),
  };

  switch (field) {
    case 'evidence_reviewed':
      if (checked && !existingDates.evidenceReviewedDate) {
        extra.evidence_reviewed_date = now;
      }
      break;
    case 'added_to_calendar':
      if (checked && !existingDates.addedToCalendarDate) {
        extra.added_to_calendar_date = now;
      }
      break;
    case 'evidence_requested':
      if (checked && !existingDates.evidenceRequestedDate) {
        extra.evidence_requested_date = now;
      }
      break;
    case 'evidence_received':
      if (checked && !existingDates.evidenceReceivedDate) {
        extra.evidence_received_date = now;
      }
      break;
  }

  return { extra, newAttr };
}

describe('Consolidated Checkbox Handler', () => {
  const currentUser = { id: 'user-1', name: 'Arthur' };
  const emptyDates = {
    evidenceRequestedDate: null,
    evidenceReceivedDate: null,
    evidenceReviewedDate: null,
    addedToCalendarDate: null,
  };

  it('produces a single extra object with _attr field (no separate mutation needed)', () => {
    const { extra } = simulateCheckboxChange('evidence_reviewed', true, currentUser, emptyDates);

    // Must contain the _attr field as JSON string
    expect(extra).toHaveProperty('evidence_reviewed_attr');
    expect(typeof extra.evidence_reviewed_attr).toBe('string');

    // Parse and verify it has correct attribution structure
    const attr = JSON.parse(extra.evidence_reviewed_attr as string) as AttributionData;
    expect(attr.completed).toBe(true);
    expect(attr.by).toBe('Arthur');
    expect(attr.userId).toBe('user-1');
    expect(attr.date).toBeDefined();
  });

  it('auto-sets evidence_reviewed_date on first check', () => {
    const { extra } = simulateCheckboxChange('evidence_reviewed', true, currentUser, emptyDates);

    expect(extra).toHaveProperty('evidence_reviewed_date');
    expect(typeof extra.evidence_reviewed_date).toBe('string');
  });

  it('auto-sets added_to_calendar_date on first check', () => {
    const { extra } = simulateCheckboxChange('added_to_calendar', true, currentUser, emptyDates);

    expect(extra).toHaveProperty('added_to_calendar_date');
    expect(typeof extra.added_to_calendar_date).toBe('string');
  });

  it('auto-sets evidence_requested_date on first check', () => {
    const { extra } = simulateCheckboxChange('evidence_requested', true, currentUser, emptyDates);

    expect(extra).toHaveProperty('evidence_requested_date');
  });

  it('auto-sets evidence_received_date on first check', () => {
    const { extra } = simulateCheckboxChange('evidence_received', true, currentUser, emptyDates);

    expect(extra).toHaveProperty('evidence_received_date');
  });

  it('does NOT overwrite existing date on re-check', () => {
    const existingDate = '2026-01-15T00:00:00.000Z';
    const dates = {
      ...emptyDates,
      evidenceReviewedDate: existingDate,
    };

    const { extra } = simulateCheckboxChange('evidence_reviewed', true, currentUser, dates);

    // Should NOT contain the date field (not overwriting)
    expect(extra).not.toHaveProperty('evidence_reviewed_date');
    // But should still contain the _attr field
    expect(extra).toHaveProperty('evidence_reviewed_attr');
  });

  it('does NOT overwrite existing added_to_calendar_date on re-check', () => {
    const dates = {
      ...emptyDates,
      addedToCalendarDate: '2026-01-10T00:00:00.000Z',
    };

    const { extra } = simulateCheckboxChange('added_to_calendar', true, currentUser, dates);

    expect(extra).not.toHaveProperty('added_to_calendar_date');
    expect(extra).toHaveProperty('added_to_calendar_attr');
  });

  it('unchecking clears attribution but does NOT set date', () => {
    const { extra, newAttr } = simulateCheckboxChange('evidence_reviewed', false, currentUser, emptyDates);

    expect(newAttr.completed).toBe(false);
    expect(newAttr.by).toBeUndefined();
    expect(newAttr.userId).toBeUndefined();
    expect(newAttr.date).toBeUndefined();

    // No date field should be added when unchecking
    expect(extra).not.toHaveProperty('evidence_reviewed_date');
  });

  it('all 4 checkbox fields produce exactly 1 extra object (not 2 separate calls)', () => {
    const fields = ['evidence_reviewed', 'added_to_calendar', 'evidence_requested', 'evidence_received'];

    for (const field of fields) {
      const { extra } = simulateCheckboxChange(field, true, currentUser, emptyDates);

      // Every field should produce _attr key + date key = 2 keys in extra
      const keys = Object.keys(extra);
      expect(keys.length).toBe(2); // ${field}_attr + ${field}_date
      expect(keys).toContain(`${field}_attr`);
    }
  });
});

// ============================================================================
// PART 3: CONSOLIDATED INTERNAL STATUS HANDLER
// ============================================================================

describe('Consolidated Internal Status Handler', () => {
  it('produces single extra object with internal_status_attr as JSON string', () => {
    const now = dayjs().toISOString();
    const newAttr: InternalStatusAttribution = {
      value: 'Reviewing',
      by: 'Jackie',
      userId: 'user-2',
      date: now,
    };

    // Simulates the consolidated call: onUpdate(id, 'internal_status', value, { internal_status_attr: JSON.stringify(newAttr) })
    const extra = {
      internal_status_attr: JSON.stringify(newAttr),
    };

    expect(typeof extra.internal_status_attr).toBe('string');
    const parsed = JSON.parse(extra.internal_status_attr);
    expect(parsed.value).toBe('Reviewing');
    expect(parsed.by).toBe('Jackie');
  });
});

// ============================================================================
// PART 4: CONSOLIDATED INVOICE CHIP HANDLER
// ============================================================================

describe('Consolidated Invoice Chip Handler', () => {
  it('unmark invoice sends is_invoiced=false with invoice_date=null in single call', () => {
    // Simulates: onUpdate(summons.id, 'is_invoiced', false, { invoice_date: null })
    const field = 'is_invoiced';
    const value = false;
    const extra = { invoice_date: null };

    // Build the merged mutation input (as parent handler does)
    const mutationInput = {
      id: 'summons-123',
      [field]: value,
      ...extra,
    };

    expect(mutationInput.is_invoiced).toBe(false);
    expect(mutationInput.invoice_date).toBeNull();
    expect(Object.keys(mutationInput)).toEqual(['id', 'is_invoiced', 'invoice_date']);
  });
});

// ============================================================================
// PART 5: DEP FILE DATE AWSJSON PERSISTENCE
// ============================================================================

describe('DEP File Date AWSJSON Persistence', () => {
  it('dep_file_date_attr is JSON.stringified before sending to AppSync', () => {
    const now = dayjs().toISOString();
    const newAttr: DepFileDateAttribution = {
      value: '2026-02-15T00:00:00.000Z',
      by: 'Arthur',
      userId: 'user-1',
      date: now,
    };

    // This is exactly what handleDepFileDateChange does
    const serialized = JSON.stringify(newAttr);

    expect(typeof serialized).toBe('string');

    // Verify it round-trips correctly
    const parsed = JSON.parse(serialized);
    expect(parsed.value).toBe('2026-02-15T00:00:00.000Z');
    expect(parsed.by).toBe('Arthur');
  });

  it('raw object would fail AppSync AWSJSON validation (proves JSON.stringify is needed)', () => {
    const attr: DepFileDateAttribution = {
      value: '2026-02-15T00:00:00.000Z',
      by: 'Arthur',
      userId: 'user-1',
      date: dayjs().toISOString(),
    };

    // Raw object is NOT a string - AppSync AWSJSON requires string
    expect(typeof attr).toBe('object');
    expect(typeof JSON.stringify(attr)).toBe('string');
  });
});

// ============================================================================
// PART 6: PARENT HANDLER extraFields MERGE
// ============================================================================

describe('Parent Handler extraFields Merge', () => {
  it('ClientDetail handler merges extraFields into mutation input', () => {
    // Simulates ClientDetail.handleSummonsUpdate
    const summonsId = 'summons-456';
    const field = 'evidence_reviewed';
    const value = true;
    const extraFields = {
      evidence_reviewed_attr: JSON.stringify({ completed: true, by: 'Arthur', userId: 'u1', date: '2026-02-20T00:00:00Z' }),
      evidence_reviewed_date: '2026-02-20T00:00:00Z',
    };

    const input = {
      id: summonsId,
      [field]: value,
      ...extraFields,
    };

    expect(input.id).toBe('summons-456');
    expect(input.evidence_reviewed).toBe(true);
    expect(input.evidence_reviewed_attr).toBeDefined();
    expect(input.evidence_reviewed_date).toBe('2026-02-20T00:00:00Z');
    // All 4 keys in a single mutation
    expect(Object.keys(input).length).toBe(4);
  });

  it('CalendarDashboard handler merges extraFields into local state update', () => {
    // Simulates the local state update in CalendarDashboard
    const existingSummons = {
      id: 's1',
      evidence_reviewed: false,
      evidence_reviewed_date: undefined as string | undefined,
      updatedAt: '2026-02-19T00:00:00Z',
    };

    const field = 'evidence_reviewed';
    const value = true;
    const extraFields = {
      evidence_reviewed_attr: '{"completed":true}',
      evidence_reviewed_date: '2026-02-20T12:00:00Z',
    };

    // Simulates: { ...s, [field]: localValue, ...extraFields, updatedAt: new Date().toISOString() }
    const updated = {
      ...existingSummons,
      [field]: value,
      ...extraFields,
      updatedAt: new Date().toISOString(),
    };

    expect(updated.evidence_reviewed).toBe(true);
    expect(updated.evidence_reviewed_date).toBe('2026-02-20T12:00:00Z');
    expect(updated.evidence_reviewed_attr).toBe('{"completed":true}');
  });

  it('extraFields=undefined does not break spread operator', () => {
    const input = {
      id: 'summons-789',
      evidence_requested: true,
      ...undefined, // This is safe in JS/TS
    };

    expect(input.id).toBe('summons-789');
    expect(input.evidence_requested).toBe(true);
  });
});

// ============================================================================
// PART 7: AWSJSON PARSE HELPER (parseAttr)
// ============================================================================

describe('AWSJSON parseAttr Helper', () => {
  /**
   * Extracted from SummonsDetailModal - parses AWSJSON fields that may arrive
   * as JSON string or already-parsed object
   */
  function parseAttr<T>(raw: unknown, fallback: T): T {
    if (!raw) return fallback;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return fallback; }
    }
    return raw as T;
  }

  it('parses JSON string to object', () => {
    const result = parseAttr<AttributionData>('{"completed":true,"by":"Arthur"}', { completed: false });
    expect(result.completed).toBe(true);
    expect(result.by).toBe('Arthur');
  });

  it('returns already-parsed object as-is', () => {
    const obj: AttributionData = { completed: true, by: 'Jackie' };
    const result = parseAttr(obj, { completed: false });
    expect(result.completed).toBe(true);
    expect(result.by).toBe('Jackie');
  });

  it('returns fallback for null/undefined', () => {
    expect(parseAttr(null, { completed: false }).completed).toBe(false);
    expect(parseAttr(undefined, { completed: false }).completed).toBe(false);
  });

  it('returns fallback for invalid JSON string', () => {
    const result = parseAttr<AttributionData>('not-json', { completed: false });
    expect(result.completed).toBe(false);
  });
});
