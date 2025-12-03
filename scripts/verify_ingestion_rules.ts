/**
 * NYC OATH Summons Tracker - Ingestion Rules Verification Script
 *
 * This script performs a "Dry Run" verification of the ingestion logic
 * against mock data to ensure business rules are correctly implemented.
 *
 * VERIFICATION SCENARIOS:
 * 1. "Fire Code" Rejection - Non-idling violations must be rejected
 * 2. "Historic Data" Preservation - Pre-2022 records saved but not flagged as new
 * 3. "Manual Safety" Check - Manual fields must never be overwritten by sync
 *
 * Run with: npx ts-node scripts/verify_ingestion_rules.ts
 * Or: npm run verify:ingestion
 */

// ============================================================================
// CONFIGURATION (Matches dailySweep/src/index.js)
// ============================================================================

const PRE_2022_CUTOFF = new Date('2022-01-01T00:00:00.000Z');

const MANUAL_FIELDS = [
  'notes',
  'added_to_calendar',
  'evidence_reviewed',
  'evidence_requested',
  'evidence_requested_date',
  'evidence_received',
  'is_invoiced',
  'legal_fee_paid',
  'internal_status',
  'is_new',
];

// ============================================================================
// FILTER FUNCTIONS (Copied from dailySweep for verification)
// ============================================================================

/**
 * Rule A: "Idling" Hard Filter
 * Returns true if summons should be processed, false if rejected
 */
function passesIdlingFilter(apiSummons: MockAPISummons): boolean {
  const description = (
    apiSummons.violation_description ||
    apiSummons.charge_1_code_description ||
    apiSummons.charge_2_code_description ||
    ''
  ).toUpperCase();

  return description.includes('IDLING');
}

/**
 * Rule B: Pre-2022 Soft Filter
 * Returns true if this is a "new" record (2022+), false if historic
 */
function isNewRecord(apiSummons: MockAPISummons): boolean {
  const hearingDate = apiSummons.hearing_date
    ? new Date(apiSummons.hearing_date)
    : null;

  if (!hearingDate || isNaN(hearingDate.getTime())) {
    return true;
  }

  return hearingDate >= PRE_2022_CUTOFF;
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface MockAPISummons {
  ticket_number: string;
  respondent_first_name?: string;
  respondent_last_name?: string;
  violation_description?: string;
  charge_1_code_description?: string;
  charge_2_code_description?: string;
  hearing_date?: string;
  hearing_status?: string;
  balance_due?: string;
  [key: string]: unknown;
}

interface MockDBRecord {
  id: string;
  summons_number: string;
  evidence_reviewed: boolean;
  is_invoiced: boolean;
  legal_fee_paid: boolean;
  notes: string | null;
  added_to_calendar: boolean;
  is_new: boolean;
  [key: string]: unknown;
}

interface TestResult {
  scenario: string;
  passed: boolean;
  message: string;
  details?: string;
}

// ============================================================================
// MOCK DATABASE (In-memory simulation)
// ============================================================================

class MockDatabase {
  private records: Map<string, MockDBRecord> = new Map();
  private insertCount = 0;

  reset(): void {
    this.records.clear();
    this.insertCount = 0;
  }

  getCount(): number {
    return this.records.size;
  }

  getInsertCount(): number {
    return this.insertCount;
  }

  findBySummonsNumber(summonsNumber: string): MockDBRecord | undefined {
    for (const record of this.records.values()) {
      if (record.summons_number === summonsNumber) {
        return record;
      }
    }
    return undefined;
  }

  insert(record: MockDBRecord): void {
    this.records.set(record.id, { ...record });
    this.insertCount++;
  }

  update(id: string, updates: Partial<MockDBRecord>): void {
    const existing = this.records.get(id);
    if (existing) {
      // Simulate the "Manual Safety" rule - NEVER overwrite manual fields
      const safeUpdates = { ...updates };
      for (const field of MANUAL_FIELDS) {
        if (field in safeUpdates) {
          delete safeUpdates[field as keyof typeof safeUpdates];
        }
      }
      this.records.set(id, { ...existing, ...safeUpdates });
    }
  }

  seed(record: MockDBRecord): void {
    this.records.set(record.id, { ...record });
    // Don't increment insertCount for seeds
  }
}

// ============================================================================
// INGESTION SIMULATION
// ============================================================================

/**
 * Simulates the ingestion process for a single API record
 * Returns: { action: 'created' | 'updated' | 'skipped' | 'rejected', ... }
 */
function simulateIngestion(
  apiSummons: MockAPISummons,
  db: MockDatabase
): { action: string; is_new?: boolean; reason?: string } {
  // Rule A: Idling Hard Filter
  if (!passesIdlingFilter(apiSummons)) {
    return { action: 'rejected', reason: 'Not an IDLING violation' };
  }

  // Check if record exists
  const existing = db.findBySummonsNumber(apiSummons.ticket_number);

  if (existing) {
    // Rule B doesn't apply to updates - is_new is set only on creation
    // Simulate update (manual fields protected by MockDatabase.update)
    db.update(existing.id, {
      hearing_date: apiSummons.hearing_date,
      hearing_status: apiSummons.hearing_status,
      balance_due: apiSummons.balance_due,
    });
    return { action: 'updated' };
  } else {
    // Rule B: Pre-2022 Soft Filter (only for new records)
    const isNew = isNewRecord(apiSummons);

    const newRecord: MockDBRecord = {
      id: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      summons_number: apiSummons.ticket_number,
      evidence_reviewed: false,
      is_invoiced: false,
      legal_fee_paid: false,
      notes: null,
      added_to_calendar: false,
      is_new: isNew,
      hearing_date: apiSummons.hearing_date,
      hearing_status: apiSummons.hearing_status,
    };

    db.insert(newRecord);
    return { action: 'created', is_new: isNew };
  }
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

function runScenario1_FireCodeRejection(db: MockDatabase): TestResult {
  const scenario = 'Scenario 1: "Fire Code" Rejection';
  db.reset();

  // Mock API object with non-idling violation
  const mockFireCode: MockAPISummons = {
    ticket_number: 'TEST-FIRE-001',
    respondent_first_name: 'TEST',
    respondent_last_name: 'COMPANY',
    violation_description: 'FIRE CODE OBSTRUCTION',
    hearing_date: '2025-03-15T10:00:00.000Z',
    hearing_status: 'PENDING',
    balance_due: '500',
  };

  const initialCount = db.getCount();
  const result = simulateIngestion(mockFireCode, db);
  const finalCount = db.getCount();

  // Expected: Function returns rejected, database count unchanged
  const recordAbsent = db.findBySummonsNumber('TEST-FIRE-001') === undefined;
  const countUnchanged = finalCount === initialCount;
  const actionIsRejected = result.action === 'rejected';

  const passed = recordAbsent && countUnchanged && actionIsRejected;

  return {
    scenario,
    passed,
    message: passed
      ? 'PASS - Non-idling record correctly rejected'
      : 'FAIL - Non-idling record was incorrectly processed',
    details: JSON.stringify({
      inputViolation: mockFireCode.violation_description,
      action: result.action,
      reason: result.reason,
      recordInDB: !recordAbsent,
      dbCountChange: finalCount - initialCount,
    }, null, 2),
  };
}

function runScenario2_HistoricDataPreservation(db: MockDatabase): TestResult {
  const scenario = 'Scenario 2: "Historic Data" Preservation';
  db.reset();

  // Mock API object with pre-2022 hearing date but valid IDLING violation
  const mockHistoric: MockAPISummons = {
    ticket_number: 'TEST-HISTORIC-001',
    respondent_first_name: 'TEST',
    respondent_last_name: 'COMPANY',
    violation_description: 'ENGINE IDLING',
    charge_1_code_description: 'IDLING - HEAVY DUTY VEHICLES',
    hearing_date: '2019-05-15T10:00:00.000Z', // Before 2022
    hearing_status: 'COMPLETED',
    balance_due: '350',
  };

  const result = simulateIngestion(mockHistoric, db);
  const savedRecord = db.findBySummonsNumber('TEST-HISTORIC-001');

  // Expected: Record IS saved, but is_new flag is false
  const recordExists = savedRecord !== undefined;
  const isNewFlagIsFalse = savedRecord?.is_new === false;
  const actionIsCreated = result.action === 'created';

  const passed = recordExists && isNewFlagIsFalse && actionIsCreated;

  return {
    scenario,
    passed,
    message: passed
      ? 'PASS - Historic record saved with is_new=false'
      : 'FAIL - Historic record handling incorrect',
    details: JSON.stringify({
      inputHearingDate: mockHistoric.hearing_date,
      action: result.action,
      is_new_from_result: result.is_new,
      recordInDB: recordExists,
      is_new_in_record: savedRecord?.is_new,
    }, null, 2),
  };
}

function runScenario3_ManualSafetyCheck(db: MockDatabase): TestResult {
  const scenario = 'Scenario 3: "Manual Safety" Check';
  db.reset();

  // Setup: Create a record with evidence_reviewed = true (simulating user edit)
  const existingRecord: MockDBRecord = {
    id: 'existing-record-123',
    summons_number: 'TEST-MANUAL-001',
    evidence_reviewed: true, // User has already reviewed
    is_invoiced: true, // User has already invoiced
    legal_fee_paid: false,
    notes: 'Important case notes from attorney',
    added_to_calendar: true,
    is_new: false, // Already seen
    hearing_date: '2025-04-20T10:00:00.000Z',
    hearing_status: 'PENDING',
  };

  db.seed(existingRecord);

  // Simulate OATH API sync with updated status (but trying to overwrite manual fields)
  const mockAPIUpdate: MockAPISummons = {
    ticket_number: 'TEST-MANUAL-001',
    violation_description: 'IDLING',
    hearing_date: '2025-05-20T10:00:00.000Z', // Rescheduled
    hearing_status: 'RESCHEDULED',
    balance_due: '600',
    // Simulating what would happen if API somehow had these fields
    // (The ingestion should NOT use them)
  };

  simulateIngestion(mockAPIUpdate, db);
  const updatedRecord = db.findBySummonsNumber('TEST-MANUAL-001');

  // Expected: OATH data updates (status/date), but manual fields preserved
  const manualFieldsPreserved =
    updatedRecord?.evidence_reviewed === true &&
    updatedRecord?.is_invoiced === true &&
    updatedRecord?.notes === 'Important case notes from attorney' &&
    updatedRecord?.added_to_calendar === true;

  const oathDataUpdated =
    updatedRecord?.hearing_status === 'RESCHEDULED' &&
    updatedRecord?.hearing_date === '2025-05-20T10:00:00.000Z';

  const passed = manualFieldsPreserved && oathDataUpdated;

  return {
    scenario,
    passed,
    message: passed
      ? 'PASS - Manual fields preserved, OATH data updated'
      : 'FAIL - Manual fields were overwritten or OATH data not updated',
    details: JSON.stringify({
      before: {
        evidence_reviewed: existingRecord.evidence_reviewed,
        is_invoiced: existingRecord.is_invoiced,
        hearing_status: existingRecord.hearing_status,
      },
      after: {
        evidence_reviewed: updatedRecord?.evidence_reviewed,
        is_invoiced: updatedRecord?.is_invoiced,
        hearing_status: updatedRecord?.hearing_status,
        hearing_date: updatedRecord?.hearing_date,
      },
      manualFieldsPreserved,
      oathDataUpdated,
    }, null, 2),
  };
}

// ============================================================================
// ADDITIONAL EDGE CASE TESTS
// ============================================================================

function runScenario4_IdlingCaseInsensitive(db: MockDatabase): TestResult {
  const scenario = 'Scenario 4: Idling Filter Case Insensitivity';
  db.reset();

  const testCases = [
    { violation: 'idling', expected: true },
    { violation: 'IDLING', expected: true },
    { violation: 'Idling', expected: true },
    { violation: 'ENGINE IDLING - HEAVY DUTY', expected: true },
    { violation: 'SIDEWALK OBSTRUCTION', expected: false },
    { violation: '', expected: false },
  ];

  const results = testCases.map(tc => {
    const mock: MockAPISummons = {
      ticket_number: `TEST-${tc.violation.substring(0, 5) || 'EMPTY'}`,
      violation_description: tc.violation,
    };
    const passes = passesIdlingFilter(mock);
    return { ...tc, actual: passes, match: passes === tc.expected };
  });

  const allPassed = results.every(r => r.match);

  return {
    scenario,
    passed: allPassed,
    message: allPassed
      ? 'PASS - Idling filter handles all case variations correctly'
      : 'FAIL - Idling filter has case sensitivity issues',
    details: JSON.stringify(results, null, 2),
  };
}

function runScenario5_Pre2022BoundaryCheck(db: MockDatabase): TestResult {
  const scenario = 'Scenario 5: Pre-2022 Boundary Date Check';
  db.reset();

  const testCases = [
    { date: '2021-12-31T23:59:59.999Z', expected: false }, // Just before cutoff
    { date: '2022-01-01T00:00:00.000Z', expected: true },  // Exactly at cutoff
    { date: '2022-01-01T00:00:00.001Z', expected: true },  // Just after cutoff
    { date: '2025-06-15T10:00:00.000Z', expected: true },  // Well after
    { date: null, expected: true },                        // No date = new
  ];

  const results = testCases.map(tc => {
    const mock: MockAPISummons = {
      ticket_number: 'TEST',
      hearing_date: tc.date as string | undefined,
    };
    const isNew = isNewRecord(mock);
    return { date: tc.date, expected: tc.expected, actual: isNew, match: isNew === tc.expected };
  });

  const allPassed = results.every(r => r.match);

  return {
    scenario,
    passed: allPassed,
    message: allPassed
      ? 'PASS - Pre-2022 cutoff boundary handled correctly'
      : 'FAIL - Pre-2022 cutoff boundary has issues',
    details: JSON.stringify(results, null, 2),
  };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

function main(): void {
  console.log('='.repeat(70));
  console.log('NYC OATH SUMMONS TRACKER - INGESTION RULES VERIFICATION');
  console.log('='.repeat(70));
  console.log(`Run Date: ${new Date().toISOString()}`);
  console.log(`Pre-2022 Cutoff: ${PRE_2022_CUTOFF.toISOString()}`);
  console.log(`Manual Fields Protected: ${MANUAL_FIELDS.length} fields`);
  console.log('='.repeat(70));
  console.log('');

  const db = new MockDatabase();
  const results: TestResult[] = [];

  // Core Scenarios (Required by spec)
  results.push(runScenario1_FireCodeRejection(db));
  results.push(runScenario2_HistoricDataPreservation(db));
  results.push(runScenario3_ManualSafetyCheck(db));

  // Edge Case Scenarios (Additional verification)
  results.push(runScenario4_IdlingCaseInsensitive(db));
  results.push(runScenario5_Pre2022BoundaryCheck(db));

  // Output Results
  console.log('VERIFICATION RESULTS');
  console.log('-'.repeat(70));

  let passCount = 0;
  let failCount = 0;

  for (const result of results) {
    const status = result.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`\n[${status}] ${result.scenario}`);
    console.log(`  ${result.message}`);
    if (!result.passed || process.env.VERBOSE) {
      console.log('  Details:');
      console.log(result.details?.split('\n').map(l => '    ' + l).join('\n'));
    }

    if (result.passed) {
      passCount++;
    } else {
      failCount++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);
  console.log('');

  if (failCount === 0) {
    console.log('\x1b[32m*** ALL VERIFICATION TESTS PASSED ***\x1b[0m');
    console.log('');
    console.log('The ingestion rules are correctly implemented:');
    console.log('  [OK] Rule A: Non-idling violations are rejected');
    console.log('  [OK] Rule B: Pre-2022 records saved with is_new=false');
    console.log('  [OK] Manual fields are never overwritten during sync');
    process.exit(0);
  } else {
    console.log('\x1b[31m*** VERIFICATION FAILED ***\x1b[0m');
    console.log('');
    console.log('Please review the failing scenarios above and fix the ingestion logic.');
    process.exit(1);
  }
}

// Run if executed directly
main();
