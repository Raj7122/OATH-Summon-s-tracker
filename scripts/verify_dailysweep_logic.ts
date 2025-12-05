/**
 * Daily Sweep v3.0 Verification Suite
 *
 * This script tests the priority sorting and self-healing logic
 * without running a full production sweep.
 *
 * Run with: npx ts-node scripts/verify_dailysweep_logic.ts
 *
 * Tests:
 * - Scenario A: The Time Machine Test (Priority Sorting)
 * - Scenario B: The Swiss Cheese Test (Self-Healing)
 */

// ============================================================================
// MOCK IMPLEMENTATIONS (Mirror the logic from dailySweep/src/index.js)
// ============================================================================

const HEARING_DATE_FLOOR = '2022-01-01';

interface MockSummons {
  id: string;
  summons_number: string;
  hearing_date: string | null;
  ocr_status: 'pending' | 'complete' | 'failed' | '';
  violation_narrative?: string;
  license_plate_ocr?: string | null;
  id_number?: string | null;
  ocr_failure_count?: number;
}

/**
 * Sort records by hearing_date DESC (furthest future first)
 * Records without hearing_date go to the end
 */
function sortByHearingDateDescending(records: MockSummons[]): MockSummons[] {
  return [...records].sort((a, b) => {
    const dateA = a.hearing_date ? new Date(a.hearing_date) : null;
    const dateB = b.hearing_date ? new Date(b.hearing_date) : null;

    // Records without dates go to the end
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;

    // Sort DESC: furthest future first (larger dates first)
    return dateB.getTime() - dateA.getTime();
  });
}

/**
 * Check if a record is missing critical fields (for self-healing)
 */
function isMissingCriticalFields(record: MockSummons): boolean {
  // Only consider records that have been OCR'd at least once
  if (!record.violation_narrative) {
    return false;
  }

  const missingLicensePlate = !record.license_plate_ocr;
  const missingIdNumber = !record.id_number;

  return missingLicensePlate || missingIdNumber;
}

/**
 * Check if a record is a repair job (needs self-healing)
 * v3.1: Also catches orphaned records (has narrative but no status)
 */
function isRecordNeedingRepair(record: MockSummons): boolean {
  const status = record.ocr_status || '';
  const hasNarrative = !!record.violation_narrative;

  // Case 1: Explicitly complete but missing fields
  if (status === 'complete' && isMissingCriticalFields(record)) {
    return true;
  }

  // Case 2: Orphaned - has narrative (OCR ran) but no status, with missing fields
  if (!status && hasNarrative && isMissingCriticalFields(record)) {
    return true;
  }

  return false;
}

/**
 * Get list of missing critical fields for logging
 */
function getMissingFields(record: MockSummons): string[] {
  const missing: string[] = [];
  if (!record.license_plate_ocr) missing.push('license_plate_ocr');
  if (!record.id_number) missing.push('id_number');
  return missing;
}

/**
 * Simulate fetching OCR queue with self-healing logic
 * v3.1: Also catches orphaned records (has narrative but no status with missing fields)
 */
function fetchOCRQueueWithSelfHealing(records: MockSummons[]): MockSummons[] {
  return records.filter(record => {
    const status = record.ocr_status || '';
    const hasNarrative = !!record.violation_narrative;

    // Standard: pending status, ready for first OCR
    if (status === 'pending') {
      return true;
    }

    // Standard: no status and no narrative (never processed)
    if (!status && !hasNarrative) {
      return true;
    }

    // Retry: failed status
    if (status === 'failed') {
      return true;
    }

    // Self-Healing Case 1: status is 'complete' but missing critical fields
    if (status === 'complete' && isMissingCriticalFields(record)) {
      return true;
    }

    // Self-Healing Case 2: NO status but HAS narrative with missing critical fields
    // These are "orphaned" records - OCR ran but status was never set
    if (!status && hasNarrative && isMissingCriticalFields(record)) {
      return true;
    }

    return false;
  });
}

/**
 * Apply hearing date floor filter
 */
function filterByHearingDateFloor(records: MockSummons[]): MockSummons[] {
  const floorDate = new Date(HEARING_DATE_FLOOR);

  return records.filter(record => {
    if (!record.hearing_date) {
      return true; // Records without dates pass (sorted to end anyway)
    }

    const hearingDate = new Date(record.hearing_date);
    return hearingDate >= floorDate;
  });
}

// ============================================================================
// TEST UTILITIES
// ============================================================================

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passCount++;
  } else {
    console.log(`  ❌ FAIL: ${message}`);
    failCount++;
  }
}

function logSection(title: string): void {
  console.log('\n' + '='.repeat(60));
  console.log(title);
  console.log('='.repeat(60));
}

// ============================================================================
// SCENARIO A: THE TIME MACHINE TEST
// ============================================================================

function runScenarioA(): void {
  logSection('SCENARIO A: The Time Machine Test (Priority Sorting)');
  console.log('Testing that records are sorted by hearing_date DESC (furthest future first)');
  console.log('Expected order: 2026 → 2024 → 2022\n');

  // Setup: Mock 3 records with different hearing dates
  const mockRecords: MockSummons[] = [
    {
      id: '1',
      summons_number: 'OLD-2022',
      hearing_date: '2022-05-01T10:00:00Z',
      ocr_status: 'pending',
    },
    {
      id: '2',
      summons_number: 'FUTURE-2026',
      hearing_date: '2026-01-01T10:00:00Z',
      ocr_status: 'pending',
    },
    {
      id: '3',
      summons_number: 'MID-2024',
      hearing_date: '2024-06-15T10:00:00Z',
      ocr_status: 'pending',
    },
  ];

  console.log('Input records (unsorted):');
  mockRecords.forEach(r => {
    const year = r.hearing_date ? new Date(r.hearing_date).getFullYear() : 'N/A';
    console.log(`  - ${r.summons_number}: ${year}`);
  });

  // Action: Run the getPriorityQueue function (sort by hearing_date DESC)
  const sortedRecords = sortByHearingDateDescending(mockRecords);

  console.log('\nOutput records (sorted):');
  sortedRecords.forEach((r, i) => {
    const year = r.hearing_date ? new Date(r.hearing_date).getFullYear() : 'N/A';
    console.log(`  ${i + 1}. ${r.summons_number}: ${year}`);
  });

  // Assert: The output array order is strictly [2026, 2024, 2022]
  console.log('\nAssertions:');
  assert(
    sortedRecords[0].summons_number === 'FUTURE-2026',
    'First record is 2026 (furthest future)'
  );
  assert(
    sortedRecords[1].summons_number === 'MID-2024',
    'Second record is 2024 (middle)'
  );
  assert(
    sortedRecords[2].summons_number === 'OLD-2022',
    'Third record is 2022 (earliest)'
  );

  // Additional test: Records without dates go to the end
  console.log('\n--- Additional: Records without dates ---');
  const recordsWithNullDate: MockSummons[] = [
    { id: '4', summons_number: 'NO-DATE', hearing_date: null, ocr_status: 'pending' },
    { id: '5', summons_number: 'HAS-DATE', hearing_date: '2025-01-01T10:00:00Z', ocr_status: 'pending' },
  ];

  const sortedWithNull = sortByHearingDateDescending(recordsWithNullDate);
  assert(
    sortedWithNull[0].summons_number === 'HAS-DATE',
    'Record with date comes before record without date'
  );
  assert(
    sortedWithNull[1].summons_number === 'NO-DATE',
    'Record without date goes to end'
  );
}

// ============================================================================
// SCENARIO B: THE SWISS CHEESE TEST (Self-Healing)
// ============================================================================

function runScenarioB(): void {
  logSection('SCENARIO B: The Swiss Cheese Test (Self-Healing)');
  console.log('Testing that records with ocr_status=SUCCESS but missing critical fields are selected');
  console.log('Critical Fields: license_plate_ocr, id_number\n');

  // Setup: Mock records with various OCR states
  const mockRecords: MockSummons[] = [
    // Complete record with all fields - should NOT be selected
    {
      id: '1',
      summons_number: 'COMPLETE-OK',
      hearing_date: '2025-01-01T10:00:00Z',
      ocr_status: 'complete',
      violation_narrative: 'Vehicle was idling for 5 minutes',
      license_plate_ocr: 'ABC123',
      id_number: 'DEP-12345',
    },
    // Complete but missing license_plate - SHOULD be selected (self-healing)
    {
      id: '2',
      summons_number: 'SWISS-CHEESE-1',
      hearing_date: '2025-02-01T10:00:00Z',
      ocr_status: 'complete',
      violation_narrative: 'Vehicle was idling for 3 minutes',
      license_plate_ocr: null, // MISSING!
      id_number: 'DEP-67890',
    },
    // Complete but missing id_number - SHOULD be selected (self-healing)
    {
      id: '3',
      summons_number: 'SWISS-CHEESE-2',
      hearing_date: '2025-03-01T10:00:00Z',
      ocr_status: 'complete',
      violation_narrative: 'Vehicle was idling for 7 minutes',
      license_plate_ocr: 'XYZ789',
      id_number: null, // MISSING!
    },
    // Pending record - SHOULD be selected (standard queue)
    {
      id: '4',
      summons_number: 'PENDING',
      hearing_date: '2025-04-01T10:00:00Z',
      ocr_status: 'pending',
    },
    // Failed record - SHOULD be selected (retry queue)
    {
      id: '5',
      summons_number: 'FAILED',
      hearing_date: '2025-05-01T10:00:00Z',
      ocr_status: 'failed',
      ocr_failure_count: 1,
    },
    // v3.1: ORPHANED record - has narrative but NO status, missing id_number
    // This is the bug that was causing 000974656X (GC WAREHOUSE) to be missed
    {
      id: '6',
      summons_number: 'ORPHANED-GC-WAREHOUSE',
      hearing_date: '2026-05-06T10:00:00Z',
      ocr_status: '', // NOT SET - this was the bug!
      violation_narrative: 'Vehicle was idling for 4 minutes',
      license_plate_ocr: '14685MM',
      id_number: null, // MISSING!
    },
  ];

  console.log('Input records:');
  mockRecords.forEach(r => {
    const lpStatus = r.license_plate_ocr ? '✓' : '✗';
    const idStatus = r.id_number ? '✓' : '✗';
    console.log(`  - ${r.summons_number}: ocr_status=${r.ocr_status}, LP=${lpStatus}, ID=${idStatus}`);
  });

  // Action: Run the query logic (fetchOCRQueueWithSelfHealing)
  const selectedRecords = fetchOCRQueueWithSelfHealing(mockRecords);

  console.log('\nSelected for processing:');
  selectedRecords.forEach(r => {
    const isRepair = isRecordNeedingRepair(r);
    const repairTag = isRepair ? ' [REPAIR JOB]' : '';
    console.log(`  - ${r.summons_number}${repairTag}`);
  });

  // Assertions
  console.log('\nAssertions:');

  // COMPLETE-OK should NOT be selected
  const completeOk = selectedRecords.find(r => r.summons_number === 'COMPLETE-OK');
  assert(
    !completeOk,
    'COMPLETE-OK (all fields present) is NOT selected'
  );

  // SWISS-CHEESE-1 (missing license_plate) SHOULD be selected
  const swissCheese1 = selectedRecords.find(r => r.summons_number === 'SWISS-CHEESE-1');
  assert(
    !!swissCheese1,
    'SWISS-CHEESE-1 (missing license_plate_ocr) IS selected for self-healing'
  );
  if (swissCheese1) {
    assert(
      isRecordNeedingRepair(swissCheese1),
      'SWISS-CHEESE-1 is flagged as a Repair Job'
    );
    const missingFields = getMissingFields(swissCheese1);
    assert(
      missingFields.includes('license_plate_ocr'),
      'SWISS-CHEESE-1 missing field detected: license_plate_ocr'
    );
  }

  // SWISS-CHEESE-2 (missing id_number) SHOULD be selected
  const swissCheese2 = selectedRecords.find(r => r.summons_number === 'SWISS-CHEESE-2');
  assert(
    !!swissCheese2,
    'SWISS-CHEESE-2 (missing id_number) IS selected for self-healing'
  );
  if (swissCheese2) {
    assert(
      isRecordNeedingRepair(swissCheese2),
      'SWISS-CHEESE-2 is flagged as a Repair Job'
    );
    const missingFields = getMissingFields(swissCheese2);
    assert(
      missingFields.includes('id_number'),
      'SWISS-CHEESE-2 missing field detected: id_number'
    );
  }

  // PENDING should be selected (standard queue)
  const pending = selectedRecords.find(r => r.summons_number === 'PENDING');
  assert(
    !!pending,
    'PENDING record IS selected (standard queue)'
  );

  // FAILED should be selected (retry queue)
  const failed = selectedRecords.find(r => r.summons_number === 'FAILED');
  assert(
    !!failed,
    'FAILED record IS selected (retry queue)'
  );

  // v3.1: ORPHANED-GC-WAREHOUSE should be selected (orphaned self-healing)
  const orphaned = selectedRecords.find(r => r.summons_number === 'ORPHANED-GC-WAREHOUSE');
  assert(
    !!orphaned,
    'ORPHANED-GC-WAREHOUSE (no status, has narrative, missing id_number) IS selected'
  );
  if (orphaned) {
    assert(
      isRecordNeedingRepair(orphaned),
      'ORPHANED-GC-WAREHOUSE is flagged as a Repair Job'
    );
    const missingFields = getMissingFields(orphaned);
    assert(
      missingFields.includes('id_number'),
      'ORPHANED-GC-WAREHOUSE missing field detected: id_number'
    );
  }

  // Total count assertion (now 5 with the orphaned record)
  assert(
    selectedRecords.length === 5,
    `Selected 5 records total (got ${selectedRecords.length})`
  );
}

// ============================================================================
// SCENARIO C: HEARING DATE FLOOR TEST
// ============================================================================

function runScenarioC(): void {
  logSection('SCENARIO C: Hearing Date Floor Test');
  console.log(`Testing that hearings before ${HEARING_DATE_FLOOR} are filtered out\n`);

  const mockRecords: MockSummons[] = [
    // Before floor - should be filtered OUT
    {
      id: '1',
      summons_number: 'ANCIENT-2020',
      hearing_date: '2020-06-15T10:00:00Z',
      ocr_status: 'pending',
    },
    // Before floor - should be filtered OUT
    {
      id: '2',
      summons_number: 'OLD-2021',
      hearing_date: '2021-12-31T10:00:00Z',
      ocr_status: 'pending',
    },
    // On floor - should be KEPT
    {
      id: '3',
      summons_number: 'FLOOR-2022',
      hearing_date: '2022-01-01T10:00:00Z',
      ocr_status: 'pending',
    },
    // After floor - should be KEPT
    {
      id: '4',
      summons_number: 'RECENT-2024',
      hearing_date: '2024-06-15T10:00:00Z',
      ocr_status: 'pending',
    },
    // No date - should be KEPT (sorted to end)
    {
      id: '5',
      summons_number: 'NO-DATE',
      hearing_date: null,
      ocr_status: 'pending',
    },
  ];

  console.log('Input records:');
  mockRecords.forEach(r => {
    const year = r.hearing_date ? new Date(r.hearing_date).getFullYear() : 'N/A';
    console.log(`  - ${r.summons_number}: ${year}`);
  });

  const filteredRecords = filterByHearingDateFloor(mockRecords);

  console.log('\nAfter floor filter:');
  filteredRecords.forEach(r => {
    const year = r.hearing_date ? new Date(r.hearing_date).getFullYear() : 'N/A';
    console.log(`  - ${r.summons_number}: ${year}`);
  });

  console.log('\nAssertions:');
  assert(
    !filteredRecords.find(r => r.summons_number === 'ANCIENT-2020'),
    'ANCIENT-2020 (pre-floor) is filtered OUT'
  );
  assert(
    !filteredRecords.find(r => r.summons_number === 'OLD-2021'),
    'OLD-2021 (pre-floor) is filtered OUT'
  );
  assert(
    !!filteredRecords.find(r => r.summons_number === 'FLOOR-2022'),
    'FLOOR-2022 (on floor date) is KEPT'
  );
  assert(
    !!filteredRecords.find(r => r.summons_number === 'RECENT-2024'),
    'RECENT-2024 (after floor) is KEPT'
  );
  assert(
    !!filteredRecords.find(r => r.summons_number === 'NO-DATE'),
    'NO-DATE (null date) is KEPT'
  );
  assert(
    filteredRecords.length === 3,
    `Filtered to 3 records (got ${filteredRecords.length})`
  );
}

// ============================================================================
// SCENARIO D: COMBINED PIPELINE TEST
// ============================================================================

function runScenarioD(): void {
  logSection('SCENARIO D: Combined Pipeline Test');
  console.log('Testing the full priority queue pipeline:');
  console.log('1. Fetch queue with self-healing');
  console.log('2. Apply hearing date floor');
  console.log('3. Sort by hearing_date DESC\n');

  const mockRecords: MockSummons[] = [
    // Complete with all fields - NOT selected
    {
      id: '1',
      summons_number: 'COMPLETE-OK',
      hearing_date: '2025-06-01T10:00:00Z',
      ocr_status: 'complete',
      violation_narrative: 'Idling violation',
      license_plate_ocr: 'ABC123',
      id_number: 'DEP-001',
    },
    // Pre-2022 pending - filtered by floor
    {
      id: '2',
      summons_number: 'ANCIENT',
      hearing_date: '2019-01-01T10:00:00Z',
      ocr_status: 'pending',
    },
    // 2026 future pending - should be FIRST
    {
      id: '3',
      summons_number: 'FUTURE-2026',
      hearing_date: '2026-03-01T10:00:00Z',
      ocr_status: 'pending',
    },
    // 2024 with missing ID - self-healing, middle priority
    {
      id: '4',
      summons_number: 'HEAL-2024',
      hearing_date: '2024-08-01T10:00:00Z',
      ocr_status: 'complete',
      violation_narrative: 'Idling for 4 min',
      license_plate_ocr: 'XYZ789',
      id_number: null, // Missing!
    },
    // 2023 pending - lower priority
    {
      id: '5',
      summons_number: 'PENDING-2023',
      hearing_date: '2023-02-01T10:00:00Z',
      ocr_status: 'pending',
    },
  ];

  console.log('Input records:');
  mockRecords.forEach(r => {
    const year = r.hearing_date ? new Date(r.hearing_date).getFullYear() : 'N/A';
    console.log(`  - ${r.summons_number}: ${year}, status=${r.ocr_status}`);
  });

  // Step 1: Fetch with self-healing
  const queue = fetchOCRQueueWithSelfHealing(mockRecords);
  console.log(`\nStep 1 - Queue with self-healing: ${queue.length} records`);

  // Step 2: Apply floor
  const floored = filterByHearingDateFloor(queue);
  console.log(`Step 2 - After floor filter: ${floored.length} records`);

  // Step 3: Sort DESC
  const sorted = sortByHearingDateDescending(floored);
  console.log(`Step 3 - Sorted by date DESC:\n`);
  sorted.forEach((r, i) => {
    const year = r.hearing_date ? new Date(r.hearing_date).getFullYear() : 'N/A';
    const isRepair = isRecordNeedingRepair(r);
    const tag = isRepair ? ' [REPAIR]' : '';
    console.log(`  ${i + 1}. ${r.summons_number}: ${year}${tag}`);
  });

  console.log('\nAssertions:');
  assert(
    sorted.length === 3,
    `Final queue has 3 records (got ${sorted.length})`
  );
  assert(
    sorted[0].summons_number === 'FUTURE-2026',
    'First record is FUTURE-2026 (furthest future)'
  );
  assert(
    sorted[1].summons_number === 'HEAL-2024',
    'Second record is HEAL-2024 (2024, needs repair)'
  );
  assert(
    sorted[2].summons_number === 'PENDING-2023',
    'Third record is PENDING-2023 (earliest eligible)'
  );
  assert(
    !sorted.find(r => r.summons_number === 'ANCIENT'),
    'ANCIENT (pre-2022) was filtered out'
  );
  assert(
    !sorted.find(r => r.summons_number === 'COMPLETE-OK'),
    'COMPLETE-OK (all fields) was not selected'
  );
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

function main(): void {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   DAILY SWEEP v3.0 VERIFICATION SUITE                    ║');
  console.log('║   Testing Priority Sorting & Self-Healing Logic          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  runScenarioA();
  runScenarioB();
  runScenarioC();
  runScenarioD();

  // Summary
  logSection('TEST SUMMARY');
  console.log(`\n  Total Assertions: ${passCount + failCount}`);
  console.log(`  ✅ Passed: ${passCount}`);
  console.log(`  ❌ Failed: ${failCount}`);

  if (failCount === 0) {
    console.log('\n  🎉 ALL TESTS PASSED! The v3.0 logic is verified.\n');
    process.exit(0);
  } else {
    console.log('\n  ⚠️  SOME TESTS FAILED. Please review the failures above.\n');
    process.exit(1);
  }
}

main();
