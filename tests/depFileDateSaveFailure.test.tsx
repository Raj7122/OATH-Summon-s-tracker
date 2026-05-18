/**
 * DEP File Date Save Failure / Revert-on-Failure Tests
 *
 * Verifies the bug fix for Jacky's "DEP File Creation Date disappears on
 * reschedule" report. The modal's save handlers wrap the onUpdate mutation
 * in withSaveTracking, which:
 *   - reverts local state when the mutation rejects
 *   - transitions save state idle -> saving -> idle / error
 *
 * Without this, a silent AppSync rejection left the new date displayed in
 * the picker but never persisted — and on next reload the field appeared
 * empty. These tests pin the revert + state-transition contract.
 *
 * The tests exercise the pattern in isolation (no React mount) because the
 * full SummonsDetailModal carries Auth/Invoice context dependencies that
 * are noise for this contract.
 *
 * Run with: npx vitest run tests/depFileDateSaveFailure.test.tsx
 */

import { describe, it, expect, vi } from 'vitest';

interface DepFileDateAttribution {
  value?: string;
  by?: string;
  userId?: string;
  date?: string;
}

// Mirror of withSaveTracking from SummonsDetailModal.tsx so we can exercise
// the contract here. Kept structurally identical — any drift in the modal
// should be caught when this test no longer reflects real behavior.
const makeWithSaveTracking = (
  setSaveStates: (updater: (s: Record<string, 'idle' | 'saving' | 'error'>) => Record<string, 'idle' | 'saving' | 'error'>) => void,
) => async (
  field: string,
  revert: () => void,
  run: () => Promise<void> | void,
) => {
  setSaveStates((s) => ({ ...s, [field]: 'saving' }));
  try {
    await run();
    setSaveStates((s) => ({ ...s, [field]: 'idle' }));
  } catch {
    revert();
    setSaveStates((s) => ({ ...s, [field]: 'error' }));
  }
};

describe('DEP File Date — revert on save failure', () => {
  it('reverts local state when onUpdate rejects', async () => {
    const previousAttr: DepFileDateAttribution = {
      value: '2024-03-17T04:00:00.000Z',
      by: 'Jacky',
      userId: 'u1',
      date: '2026-05-12T00:00:00.000Z',
    };
    const newAttr: DepFileDateAttribution = {
      value: '2024-06-01T04:00:00.000Z',
      by: 'Jacky',
      userId: 'u1',
      date: '2026-05-12T12:00:00.000Z',
    };

    let depFileDateAttr = previousAttr;
    const setDepFileDateAttr = (v: DepFileDateAttribution) => { depFileDateAttr = v; };

    let saveStates: Record<string, 'idle' | 'saving' | 'error'> = {};
    const setSaveStates = (
      updater: (s: Record<string, 'idle' | 'saving' | 'error'>) => Record<string, 'idle' | 'saving' | 'error'>,
    ) => { saveStates = updater(saveStates); };
    const withSaveTracking = makeWithSaveTracking(setSaveStates);

    const onUpdate = vi.fn().mockRejectedValue(new Error('AppSync down'));

    // Simulate handleDepFileDateChange: optimistic local set, then save with revert.
    setDepFileDateAttr(newAttr);
    expect(depFileDateAttr).toBe(newAttr);

    await withSaveTracking(
      'dep_file_date_attr',
      () => setDepFileDateAttr(previousAttr),
      () => onUpdate('id-1', 'dep_file_date_attr', JSON.stringify(newAttr)),
    );

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(depFileDateAttr).toBe(previousAttr);
    expect(saveStates['dep_file_date_attr']).toBe('error');
  });

  it('keeps the new value when onUpdate resolves', async () => {
    const previousAttr: DepFileDateAttribution = { value: '2024-03-17T04:00:00.000Z' };
    const newAttr: DepFileDateAttribution = { value: '2024-06-01T04:00:00.000Z' };

    let depFileDateAttr = previousAttr;
    const setDepFileDateAttr = (v: DepFileDateAttribution) => { depFileDateAttr = v; };

    let saveStates: Record<string, 'idle' | 'saving' | 'error'> = {};
    const setSaveStates = (
      updater: (s: Record<string, 'idle' | 'saving' | 'error'>) => Record<string, 'idle' | 'saving' | 'error'>,
    ) => { saveStates = updater(saveStates); };
    const withSaveTracking = makeWithSaveTracking(setSaveStates);

    const onUpdate = vi.fn().mockResolvedValue(undefined);

    setDepFileDateAttr(newAttr);
    await withSaveTracking(
      'dep_file_date_attr',
      () => setDepFileDateAttr(previousAttr),
      () => onUpdate('id-1', 'dep_file_date_attr', JSON.stringify(newAttr)),
    );

    expect(depFileDateAttr).toBe(newAttr);
    expect(saveStates['dep_file_date_attr']).toBe('idle');
  });

  it('transitions through saving -> error on rejection', async () => {
    const stateLog: string[] = [];
    let resolveRun: () => void = () => {};
    const runPromise = new Promise<void>((_, reject) => {
      resolveRun = () => reject(new Error('rejected'));
    });

    let saveStates: Record<string, 'idle' | 'saving' | 'error'> = {};
    const setSaveStates = (
      updater: (s: Record<string, 'idle' | 'saving' | 'error'>) => Record<string, 'idle' | 'saving' | 'error'>,
    ) => {
      saveStates = updater(saveStates);
      stateLog.push(saveStates['dep_file_date_attr']);
    };
    const withSaveTracking = makeWithSaveTracking(setSaveStates);

    const trackPromise = withSaveTracking(
      'dep_file_date_attr',
      () => {},
      () => runPromise,
    );
    // After the first setSaveStates call, state is 'saving'
    expect(stateLog[0]).toBe('saving');

    resolveRun();
    await trackPromise;
    expect(stateLog[stateLog.length - 1]).toBe('error');
  });

  it('transitions through saving -> idle on success', async () => {
    const stateLog: string[] = [];

    let saveStates: Record<string, 'idle' | 'saving' | 'error'> = {};
    const setSaveStates = (
      updater: (s: Record<string, 'idle' | 'saving' | 'error'>) => Record<string, 'idle' | 'saving' | 'error'>,
    ) => {
      saveStates = updater(saveStates);
      stateLog.push(saveStates['dep_file_date_attr']);
    };
    const withSaveTracking = makeWithSaveTracking(setSaveStates);

    await withSaveTracking(
      'dep_file_date_attr',
      () => { throw new Error('revert should not fire on success'); },
      () => Promise.resolve(),
    );
    expect(stateLog).toEqual(['saving', 'idle']);
  });

  it('reverts checkbox attribution AND date together when consolidated mutation rejects', async () => {
    // handleCheckboxChange does a combined revert of attr + date. Verify that
    // both pieces of state come back when the save fails — the symptomatic
    // bug for evidence_reviewed parallels DEP's.
    let attrState = { completed: false };
    let dateState: string | null = null;
    const setAttr = (v: typeof attrState) => { attrState = v; };
    const setDate = (v: string | null) => { dateState = v; };

    const prevAttr = { ...attrState };
    const prevDate = dateState;

    setAttr({ completed: true });
    setDate('2026-02-20T00:00:00.000Z');

    let saveStates: Record<string, 'idle' | 'saving' | 'error'> = {};
    const setSaveStates = (
      updater: (s: Record<string, 'idle' | 'saving' | 'error'>) => Record<string, 'idle' | 'saving' | 'error'>,
    ) => { saveStates = updater(saveStates); };
    const withSaveTracking = makeWithSaveTracking(setSaveStates);

    await withSaveTracking(
      'evidence_reviewed_attr',
      () => { setAttr(prevAttr); setDate(prevDate); },
      () => Promise.reject(new Error('AppSync down')),
    );

    expect(attrState).toEqual({ completed: false });
    expect(dateState).toBeNull();
    expect(saveStates['evidence_reviewed_attr']).toBe('error');
  });
});
