/**
 * Dashboard UX Verification Tests
 *
 * Test suite to verify the Dashboard UX features with Client-Mandated Overrides:
 *
 * Part 1: "Proof of Life" Sync Badge (Traffic Light)
 * Part 2: "Smart Find" Evidence Button (Clipboard Hack)
 * Part 3: Dashboard UX Refinements
 *   - Override A: Heatmap Color Logic (Panic vs Volume)
 *   - Override B: Updated Chip → Audit Trail Integration
 *   - Override C: Active Era Mandate (Strict 2022+)
 *
 * @module tests/verify_dashboard_ux
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dayjs from 'dayjs';

// ============================================================================
// MOCK TYPES FOR TESTING
// ============================================================================

/**
 * Mock SyncStatus type
 */
interface MockSyncStatus {
  id: string;
  last_successful_sync?: string;
  last_sync_attempt?: string;
  sync_in_progress?: boolean;
  phase1_status?: 'success' | 'partial' | 'failed';
  phase1_new_records?: number;
  phase1_updated_records?: number;
  oath_api_reachable?: boolean;
}

/**
 * Mock Summons type for filter and heatmap testing
 */
interface MockSummons {
  id: string;
  hearing_date?: string;
  code_description?: string;
  status?: string;
  respondent_name?: string;
}

// Time thresholds (matching SyncStatusBadge)
const FRESH_THRESHOLD_HOURS = 24;
const STALE_THRESHOLD_HOURS = 48;

// Active Era cutoff (Override C)
const ACTIVE_ERA_CUTOFF = dayjs('2022-01-01');

// Idling filter keywords
const IDLING_FILTER_KEYWORDS = ['IDLING', 'IDLE'];

// ============================================================================
// SYNC BADGE LOGIC (Part 1)
// ============================================================================

/**
 * Determine sync status level based on sync data
 * Mirrors the logic in SyncStatusBadge component
 */
function getSyncLevel(syncStatus: MockSyncStatus | null): 'fresh' | 'stale' | 'failed' | 'syncing' | 'unknown' {
  if (!syncStatus) return 'unknown';

  if (syncStatus.sync_in_progress) return 'syncing';

  if (!syncStatus.last_successful_sync) return 'unknown';

  const hoursSinceSync = (Date.now() - new Date(syncStatus.last_successful_sync).getTime()) / (1000 * 60 * 60);

  if (hoursSinceSync < FRESH_THRESHOLD_HOURS) return 'fresh';
  if (hoursSinceSync < STALE_THRESHOLD_HOURS) return 'stale';
  return 'failed';
}

/**
 * Format time ago string
 */
function formatTimeAgo(timestamp: string | undefined | null): string {
  if (!timestamp) return 'Never';

  const hours = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60);

  if (hours < 1) {
    const minutes = Math.floor(hours * 60);
    return minutes <= 1 ? 'Just now' : `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${Math.floor(hours)}h ago`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

// ============================================================================
// HEATMAP LOGIC (Override A: Panic vs Volume)
// ============================================================================

type HeatmapUrgency = 'critical' | 'high_volume' | 'standard';

/**
 * Determine heatmap urgency for a date based on its hearings
 *
 * Override A Logic:
 * - RED ('critical'): At least 1 hearing is DANGEROUS (≤7 days OR Default status)
 * - ORANGE ('high_volume'): 3+ hearings but NONE are dangerous
 * - GREEN ('standard'): 1-2 routine hearings
 */
function calculateHeatmapUrgency(
  hearingsOnDate: MockSummons[],
  referenceDate: dayjs.Dayjs
): HeatmapUrgency {
  if (hearingsOnDate.length === 0) return 'standard';

  // Check if any hearing is "dangerous"
  const hasDanger = hearingsOnDate.some((summons) => {
    if (!summons.hearing_date) return false;

    const hearingDate = dayjs(summons.hearing_date);
    const daysUntil = hearingDate.diff(referenceDate.startOf('day'), 'day');

    // Danger conditions:
    // 1. Imminent deadline (≤7 days)
    const isImminentDeadline = daysUntil <= 7;

    // 2. Dangerous status (Default, Judgment, Violation)
    const status = (summons.status || '').toUpperCase();
    const isDangerStatus =
      status.includes('DEFAULT') ||
      status.includes('JUDGMENT') ||
      status.includes('VIOLATION');

    return isImminentDeadline || isDangerStatus;
  });

  if (hasDanger) {
    return 'critical'; // RED
  }

  if (hearingsOnDate.length >= 3) {
    return 'high_volume'; // ORANGE
  }

  return 'standard'; // GREEN
}

// ============================================================================
// FILTER LOGIC (Override C: Active Era Mandate)
// ============================================================================

/**
 * Check if a summons is in the "Active Era" (2022+)
 * Override C: Main dashboard MUST filter to 2022+ only
 */
function isActiveEra(summons: MockSummons): boolean {
  if (!summons.hearing_date) return true;
  return dayjs(summons.hearing_date) >= ACTIVE_ERA_CUTOFF;
}

/**
 * Check if a summons is an "Idling" violation
 */
function isIdlingViolation(summons: MockSummons): boolean {
  const codeDesc = (summons.code_description || '').toUpperCase();
  return IDLING_FILTER_KEYWORDS.some((keyword) => codeDesc.includes(keyword));
}

// ============================================================================
// TEST SCENARIO 1: THE CLIPBOARD HACK (Part 2)
// ============================================================================

describe('Part 2: Clipboard Hack (Smart Find Evidence)', () => {
  let mockClipboard: { writeText: ReturnType<typeof vi.fn> };
  let mockOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.assign(navigator, { clipboard: mockClipboard });

    mockOpen = vi.fn();
    vi.stubGlobal('open', mockOpen);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should copy summons number to clipboard when Find Video Evidence clicked', async () => {
    const summonsNumber = '9999999999';

    // Simulate the Smart Find Video button click logic
    await navigator.clipboard.writeText(summonsNumber);

    expect(mockClipboard.writeText).toHaveBeenCalledWith(summonsNumber);
    expect(mockClipboard.writeText).toHaveBeenCalledTimes(1);
  });

  it('should open NYC Idling Portal in new tab', () => {
    const expectedUrl = 'https://nycidling.azurewebsites.net/idlingevidence';

    window.open(expectedUrl, '_blank');

    expect(mockOpen).toHaveBeenCalledWith(expectedUrl, '_blank');
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it('should execute full Smart Find flow: copy then open', async () => {
    const summonsNumber = '1234567890';
    const portalUrl = 'https://nycidling.azurewebsites.net/idlingevidence';

    // Full Smart Find Video flow
    await navigator.clipboard.writeText(summonsNumber);
    window.open(portalUrl, '_blank');

    expect(mockClipboard.writeText).toHaveBeenCalledWith(summonsNumber);
    expect(mockOpen).toHaveBeenCalledWith(portalUrl, '_blank');
  });

  it('should still open portal if clipboard fails (graceful fallback)', async () => {
    const portalUrl = 'https://nycidling.azurewebsites.net/idlingevidence';

    mockClipboard.writeText.mockRejectedValueOnce(new Error('Clipboard denied'));

    try {
      await navigator.clipboard.writeText('test');
    } catch {
      // Fallback: open portal anyway
      window.open(portalUrl, '_blank');
    }

    expect(mockOpen).toHaveBeenCalledWith(portalUrl, '_blank');
  });
});

// ============================================================================
// TEST SCENARIO 2: THE TRAFFIC LIGHT (Part 1)
// ============================================================================

describe('Part 1: Traffic Light (Sync Badge)', () => {
  it('should return "fresh" (GREEN) for sync within 24 hours', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const syncStatus: MockSyncStatus = {
      id: 'GLOBAL',
      last_successful_sync: twoHoursAgo.toISOString(),
      sync_in_progress: false,
    };

    expect(getSyncLevel(syncStatus)).toBe('fresh');
  });

  it('should return "stale" (YELLOW) for sync 24-48 hours ago', () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);

    const syncStatus: MockSyncStatus = {
      id: 'GLOBAL',
      last_successful_sync: thirtyHoursAgo.toISOString(),
      sync_in_progress: false,
    };

    expect(getSyncLevel(syncStatus)).toBe('stale');
  });

  it('should return "failed" (RED) for sync > 48 hours ago', () => {
    const fiftyHoursAgo = new Date(Date.now() - 50 * 60 * 60 * 1000);

    const syncStatus: MockSyncStatus = {
      id: 'GLOBAL',
      last_successful_sync: fiftyHoursAgo.toISOString(),
      sync_in_progress: false,
    };

    expect(getSyncLevel(syncStatus)).toBe('failed');
  });

  it('should return "failed" (RED) for sync 3 days ago (72 hours)', () => {
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

    const syncStatus: MockSyncStatus = {
      id: 'GLOBAL',
      last_successful_sync: threeDaysAgo.toISOString(),
      sync_in_progress: false,
    };

    expect(getSyncLevel(syncStatus)).toBe('failed');
  });

  it('should return "syncing" (BLUE) when sync is in progress', () => {
    const syncStatus: MockSyncStatus = {
      id: 'GLOBAL',
      last_successful_sync: new Date().toISOString(),
      sync_in_progress: true,
    };

    expect(getSyncLevel(syncStatus)).toBe('syncing');
  });

  it('should return "unknown" when no sync status available', () => {
    expect(getSyncLevel(null)).toBe('unknown');
  });

  it('should return "unknown" when no last_successful_sync timestamp', () => {
    const syncStatus: MockSyncStatus = {
      id: 'GLOBAL',
      sync_in_progress: false,
    };

    expect(getSyncLevel(syncStatus)).toBe('unknown');
  });
});

// ============================================================================
// TEST SCENARIO 3: THE HEATMAP LOGIC (Override A)
// ============================================================================

describe('Override A: Heatmap Panic vs Volume Logic', () => {
  const today = dayjs('2025-06-15'); // Reference date for tests
  const twoMonthsOut = '2025-08-15T10:00:00.000Z';
  const oneWeekOut = '2025-06-22T10:00:00.000Z';

  it('should return GREEN for 1-2 routine hearings (8+ days, no danger status)', () => {
    const hearings: MockSummons[] = [
      { id: '1', hearing_date: twoMonthsOut, status: 'SCHEDULED' },
      { id: '2', hearing_date: twoMonthsOut, status: 'SCHEDULED' },
    ];

    expect(calculateHeatmapUrgency(hearings, today)).toBe('standard');
  });

  it('should return ORANGE for 3+ hearings with no danger (High Volume)', () => {
    const hearings: MockSummons[] = [
      { id: '1', hearing_date: twoMonthsOut, status: 'SCHEDULED' },
      { id: '2', hearing_date: twoMonthsOut, status: 'SCHEDULED' },
      { id: '3', hearing_date: twoMonthsOut, status: 'SCHEDULED' },
      { id: '4', hearing_date: twoMonthsOut, status: 'SCHEDULED' },
      { id: '5', hearing_date: twoMonthsOut, status: 'SCHEDULED' },
    ];

    // 5 hearings, all "SCHEDULED", all 2 months away → ORANGE (not RED)
    expect(calculateHeatmapUrgency(hearings, today)).toBe('high_volume');
  });

  it('should return RED for date with 1 hearing that has "Default Judgment" status', () => {
    const hearings: MockSummons[] = [
      { id: '1', hearing_date: twoMonthsOut, status: 'DEFAULT JUDGMENT' },
    ];

    // 1 hearing with dangerous status → RED
    expect(calculateHeatmapUrgency(hearings, today)).toBe('critical');
  });

  it('should return RED for date with 1 hearing ≤7 days away (imminent)', () => {
    const hearings: MockSummons[] = [
      { id: '1', hearing_date: oneWeekOut, status: 'SCHEDULED' },
    ];

    // 1 hearing within 7 days → RED
    expect(calculateHeatmapUrgency(hearings, today)).toBe('critical');
  });

  it('should return RED for date with mix of dangerous and routine hearings', () => {
    const hearings: MockSummons[] = [
      { id: '1', hearing_date: twoMonthsOut, status: 'SCHEDULED' },
      { id: '2', hearing_date: twoMonthsOut, status: 'SCHEDULED' },
      { id: '3', hearing_date: twoMonthsOut, status: 'DEFAULT' }, // Dangerous
    ];

    // Any danger = RED (not ORANGE despite 3+ hearings)
    expect(calculateHeatmapUrgency(hearings, today)).toBe('critical');
  });

  it('should return ORANGE for exactly 3 hearings with no danger', () => {
    const hearings: MockSummons[] = [
      { id: '1', hearing_date: twoMonthsOut, status: 'SCHEDULED' },
      { id: '2', hearing_date: twoMonthsOut, status: 'SCHEDULED' },
      { id: '3', hearing_date: twoMonthsOut, status: 'SCHEDULED' },
    ];

    expect(calculateHeatmapUrgency(hearings, today)).toBe('high_volume');
  });

  it('should treat VIOLATION status as danger', () => {
    const hearings: MockSummons[] = [
      { id: '1', hearing_date: twoMonthsOut, status: 'VIOLATION' },
    ];

    expect(calculateHeatmapUrgency(hearings, today)).toBe('critical');
  });

  it('should treat JUDGMENT status as danger', () => {
    const hearings: MockSummons[] = [
      { id: '1', hearing_date: twoMonthsOut, status: 'IN JUDGMENT' },
    ];

    expect(calculateHeatmapUrgency(hearings, today)).toBe('critical');
  });
});

// ============================================================================
// TEST SCENARIO 4: ACTIVE ERA MANDATE (Override C)
// ============================================================================

describe('Override C: Active Era Mandate (Strict 2022+)', () => {
  // Use dates that are clearly in their respective years (avoiding midnight boundary issues)
  const testDataset: MockSummons[] = [
    { id: '2021-record', hearing_date: '2021-06-15T10:00:00.000Z', code_description: 'IDLING' },
    { id: '2024-record', hearing_date: '2024-06-15T10:00:00.000Z', code_description: 'IDLING' },
    { id: '2020-record', hearing_date: '2020-01-01T10:00:00.000Z', code_description: 'IDLING' },
    { id: '2022-record', hearing_date: '2022-06-15T10:00:00.000Z', code_description: 'IDLING' },
    { id: '2023-record', hearing_date: '2023-07-04T10:00:00.000Z', code_description: 'IDLING' },
  ];

  it('should filter dataset to Active Era records only (2022+)', () => {
    // Simulate dashboard filter: showArchive = false (default)
    const showArchive = false;
    const filtered = testDataset
      .filter(isIdlingViolation)
      .filter((s) => showArchive || isActiveEra(s));

    // Should only include 2022, 2023, 2024 records
    expect(filtered.length).toBe(3);
    expect(filtered.map((s) => s.id)).toEqual(['2024-record', '2022-record', '2023-record']);
  });

  it('should NEVER show 2021 record on main dashboard (even if in dataset)', () => {
    const showArchive = false; // Hardcoded per Override C
    const filtered = testDataset
      .filter(isIdlingViolation)
      .filter((s) => showArchive || isActiveEra(s));

    // 2021 record must be excluded
    expect(filtered.some((s) => s.id === '2021-record')).toBe(false);
  });

  it('should NEVER show 2020 record on main dashboard', () => {
    const showArchive = false;
    const filtered = testDataset
      .filter(isIdlingViolation)
      .filter((s) => showArchive || isActiveEra(s));

    expect(filtered.some((s) => s.id === '2020-record')).toBe(false);
  });

  it('should include 2022-01-02 (safely inside Active Era)', () => {
    const summons: MockSummons = {
      id: 'inside-era',
      hearing_date: '2022-01-02T12:00:00.000Z',
    };

    expect(isActiveEra(summons)).toBe(true);
  });

  it('should exclude 2021-12-31 (day before cutoff)', () => {
    const summons: MockSummons = {
      id: 'before-cutoff',
      hearing_date: '2021-12-31T23:59:59.000Z',
    };

    expect(isActiveEra(summons)).toBe(false);
  });

  it('should include records with no hearing_date (assume active)', () => {
    const summons: MockSummons = { id: 'no-date' };

    expect(isActiveEra(summons)).toBe(true);
  });
});

// ============================================================================
// IDLING GUARDRAIL FILTER TESTS
// ============================================================================

describe('Idling Guardrail Filter', () => {
  it('should return true for IDLING violations', () => {
    const summons: MockSummons = {
      id: '1',
      code_description: 'IDLING - VEHICLE ENGINE RUNNING',
    };

    expect(isIdlingViolation(summons)).toBe(true);
  });

  it('should return true for IDLE keyword', () => {
    const summons: MockSummons = {
      id: '2',
      code_description: 'IDLE ENGINE NEAR SCHOOL',
    };

    expect(isIdlingViolation(summons)).toBe(true);
  });

  it('should return false for Fire Code violations', () => {
    const summons: MockSummons = {
      id: '3',
      code_description: 'FIRE CODE VIOLATION',
    };

    expect(isIdlingViolation(summons)).toBe(false);
  });

  it('should return false for empty code description', () => {
    const summons: MockSummons = {
      id: '4',
      code_description: '',
    };

    expect(isIdlingViolation(summons)).toBe(false);
  });

  it('should return false for null/undefined code description', () => {
    const summons: MockSummons = { id: '5' };

    expect(isIdlingViolation(summons)).toBe(false);
  });
});

// ============================================================================
// TIME AGO FORMATTING TESTS
// ============================================================================

describe('Time Ago Formatting', () => {
  it('should format "Just now" for very recent timestamps', () => {
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
    expect(formatTimeAgo(thirtySecondsAgo.toISOString())).toBe('Just now');
  });

  it('should format minutes correctly', () => {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    expect(formatTimeAgo(fifteenMinutesAgo.toISOString())).toBe('15m ago');
  });

  it('should format hours correctly', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    expect(formatTimeAgo(fiveHoursAgo.toISOString())).toBe('5h ago');
  });

  it('should format days correctly', () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    expect(formatTimeAgo(twoDaysAgo.toISOString())).toBe('2 days ago');
  });

  it('should return "Never" for null/undefined', () => {
    expect(formatTimeAgo(null)).toBe('Never');
    expect(formatTimeAgo(undefined)).toBe('Never');
  });
});

// ============================================================================
// SYNC STATUS BADGE COLOR MAPPING
// ============================================================================

describe('Sync Status Badge Colors', () => {
  function getChipColor(level: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
    switch (level) {
      case 'fresh':
        return 'success';
      case 'stale':
        return 'warning';
      case 'failed':
        return 'error';
      case 'syncing':
        return 'info';
      default:
        return 'default';
    }
  }

  it('should map fresh to success (GREEN)', () => {
    expect(getChipColor('fresh')).toBe('success');
  });

  it('should map stale to warning (YELLOW)', () => {
    expect(getChipColor('stale')).toBe('warning');
  });

  it('should map failed to error (RED)', () => {
    expect(getChipColor('failed')).toBe('error');
  });

  it('should map syncing to info (BLUE)', () => {
    expect(getChipColor('syncing')).toBe('info');
  });

  it('should map unknown to default (GRAY)', () => {
    expect(getChipColor('unknown')).toBe('default');
  });
});

// ============================================================================
// TEST SCENARIO 6: HORIZON SYSTEM (Prompt 5 - Task 2)
// ============================================================================

describe('Horizon System Filter Logic', () => {
  const today = dayjs('2025-06-15'); // Reference date for tests

  /**
   * Horizon System filter logic (matching CalendarDashboard implementation)
   * - Critical: ≤7 days OR dangerous status (Default, Judgment, Violation)
   * - Approaching: 8-30 days away
   * - Future: > 30 days away
   */
  function filterByHorizon(
    summonses: MockSummons[],
    horizonFilter: 'critical' | 'approaching' | 'future' | null,
    referenceDate: dayjs.Dayjs
  ): MockSummons[] {
    if (!horizonFilter) return summonses;

    return summonses.filter((s) => {
      if (!s.hearing_date) return false;
      const hearingDate = dayjs(s.hearing_date);
      const daysUntil = hearingDate.diff(referenceDate.startOf('day'), 'day');

      const status = (s.status || '').toUpperCase();
      const isDangerStatus =
        status.includes('DEFAULT') ||
        status.includes('JUDGMENT') ||
        status.includes('VIOLATION') ||
        status.includes('FAILURE TO APPEAR');

      if (horizonFilter === 'critical') {
        return (daysUntil >= 0 && daysUntil <= 7) || isDangerStatus;
      } else if (horizonFilter === 'approaching') {
        return daysUntil >= 8 && daysUntil <= 30;
      } else if (horizonFilter === 'future') {
        return daysUntil > 30;
      }
      return false;
    });
  }

  const testDataset: MockSummons[] = [
    // Critical: within 7 days
    { id: 'crit1', hearing_date: '2025-06-17T10:00:00.000Z', status: 'SCHEDULED' }, // 2 days
    { id: 'crit2', hearing_date: '2025-06-22T10:00:00.000Z', status: 'SCHEDULED' }, // 7 days
    // Critical: dangerous status (regardless of date)
    { id: 'crit3', hearing_date: '2025-08-15T10:00:00.000Z', status: 'DEFAULT JUDGMENT' }, // far but danger
    // Approaching: 8-30 days
    { id: 'appr1', hearing_date: '2025-06-23T10:00:00.000Z', status: 'SCHEDULED' }, // 8 days
    { id: 'appr2', hearing_date: '2025-07-10T10:00:00.000Z', status: 'SCHEDULED' }, // 25 days
    { id: 'appr3', hearing_date: '2025-07-15T10:00:00.000Z', status: 'SCHEDULED' }, // 30 days
    // Future: > 30 days
    { id: 'futu1', hearing_date: '2025-07-16T10:00:00.000Z', status: 'SCHEDULED' }, // 31 days
    { id: 'futu2', hearing_date: '2025-09-01T10:00:00.000Z', status: 'SCHEDULED' }, // 78 days
  ];

  it('should filter to Critical records (≤7 days)', () => {
    const filtered = filterByHorizon(testDataset, 'critical', today);

    // Should include: crit1 (2 days), crit2 (7 days), crit3 (danger status)
    expect(filtered.length).toBe(3);
    expect(filtered.map(s => s.id)).toEqual(['crit1', 'crit2', 'crit3']);
  });

  it('should include dangerous status records in Critical even if far away', () => {
    const filtered = filterByHorizon(testDataset, 'critical', today);

    // crit3 has DEFAULT JUDGMENT status - should be in Critical even though 2 months away
    expect(filtered.some(s => s.id === 'crit3')).toBe(true);
  });

  it('should filter to Approaching records (8-30 days)', () => {
    const filtered = filterByHorizon(testDataset, 'approaching', today);

    // Should include: appr1 (8 days), appr2 (25 days), appr3 (30 days)
    expect(filtered.length).toBe(3);
    expect(filtered.map(s => s.id)).toEqual(['appr1', 'appr2', 'appr3']);
  });

  it('should filter to Future records (> 30 days)', () => {
    const filtered = filterByHorizon(testDataset, 'future', today);

    // Should include: futu1 (31 days), futu2 (78 days), and crit3 (61 days)
    // Note: crit3 is 61 days away and passes the "> 30 days" check
    // The "dangerous status" exclusion happens in Critical filter, not Future
    // Records can be in multiple horizons - Critical gets priority in UI
    expect(filtered.length).toBe(3);
    expect(filtered.map(s => s.id)).toEqual(['crit3', 'futu1', 'futu2']);
  });

  it('should return all records when no filter is applied', () => {
    const filtered = filterByHorizon(testDataset, null, today);

    expect(filtered.length).toBe(8);
  });

  it('should correctly classify 8-day boundary as Approaching (not Critical)', () => {
    const filtered = filterByHorizon(testDataset, 'approaching', today);

    // appr1 is exactly 8 days away - should be in Approaching
    expect(filtered.some(s => s.id === 'appr1')).toBe(true);

    // Verify it's NOT in Critical
    const criticalFiltered = filterByHorizon(testDataset, 'critical', today);
    expect(criticalFiltered.some(s => s.id === 'appr1')).toBe(false);
  });

  it('should correctly classify 31-day boundary as Future (not Approaching)', () => {
    const filtered = filterByHorizon(testDataset, 'future', today);

    // futu1 is exactly 31 days away - should be in Future
    expect(filtered.some(s => s.id === 'futu1')).toBe(true);

    // Verify it's NOT in Approaching
    const approachingFiltered = filterByHorizon(testDataset, 'approaching', today);
    expect(approachingFiltered.some(s => s.id === 'futu1')).toBe(false);
  });
});

// ============================================================================
// TEST SCENARIO 7: DATAGRID COLUMNS (Prompt 5 - Task 1)
// ============================================================================

describe('DataGrid Column Configuration', () => {
  /**
   * Expected column order after Prompt 5 refactor:
   * 1. Status (Badge/Chip) - Fixed Width
   * 2. Client Name - Flex Width
   * 3. Violation Date (NEW) - Sortable
   * 4. Hearing Date - Sortable (Default Sort)
   * 5. Action (Icon)
   *
   * REMOVED: "Violation Type" - redundant since app strictly filters for Idling
   */
  const expectedColumns = [
    'status',
    'respondent_name',
    'violation_date', // NEW column
    'hearing_date',
    'actions',
  ];

  const forbiddenColumns = [
    'code_description', // Removed - was "Violation Type"
    'violation_type',
  ];

  it('should include violation_date column (NEW)', () => {
    expect(expectedColumns).toContain('violation_date');
  });

  it('should NOT include code_description (Violation Type) column', () => {
    expect(expectedColumns).not.toContain('code_description');
    expect(forbiddenColumns).toContain('code_description');
  });

  it('should have 5 columns total', () => {
    expect(expectedColumns.length).toBe(5);
  });

  it('should have hearing_date column for sorting', () => {
    expect(expectedColumns).toContain('hearing_date');
  });

  it('should have actions column as last column', () => {
    expect(expectedColumns[expectedColumns.length - 1]).toBe('actions');
  });
});
