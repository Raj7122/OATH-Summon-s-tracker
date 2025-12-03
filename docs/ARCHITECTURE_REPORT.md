# Architectural Report: NYC OATH Summons Tracker
## Incremental Sync, Priority Queuing, and Panic Management System

**Version:** 2.0 (Technical Specification)
**Date:** November 30, 2025
**Status:** Architecture Review Draft
**Author:** Systems Architecture Review

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Pillar 1: Database Schema Strategy](#pillar-1-database-schema-strategy)cr
3. [Pillar 2: Two-Phase Sweep Logic](#pillar-2-two-phase-sweep-logic)
4. [Pillar 3: Proof of Life Data Flow](#pillar-3-proof-of-life-data-flow)
5. [Pillar 4: Edge Case & Failure Analysis](#pillar-4-edge-case--failure-analysis)
6. [Summary: Logic Gap Analysis](#summary-logic-gap-analysis)

---

## Executive Summary

This document provides a detailed technical specification for the NYC OATH Summons Tracker's data synchronization system. The architecture addresses three core constraints:

1. **500 OCR requests/day** (Google Gemini quota)
2. **Rate limits** (2-second minimum between OCR calls)
3. **Data integrity** (never overwrite user edits, never re-scan processed PDFs)

---

## Pillar 1: Database Schema Strategy

### 1.1 Enhanced Summons Schema

```graphql
type Summons @model @auth(rules: [{ allow: private }]) {
  id: ID!
  clientID: ID! @index(name: "byClient", sortKeyFields: ["hearing_date"])

  # ─────────────────────────────────────────────────────────────
  # CORE FIELDS (from NYC Open Data API)
  # Source: OATH API - These CAN be overwritten by sync
  # ─────────────────────────────────────────────────────────────
  summons_number: String! @index(name: "bySummonsNumber")
  respondent_name: String
  hearing_date: AWSDateTime
  hearing_time: String
  hearing_result: String
  status: String
  code_description: String
  violation_date: AWSDateTime
  violation_time: String
  violation_location: String
  license_plate: String
  base_fine: Float
  amount_due: Float
  paid_amount: Float
  penalty_imposed: Float

  # Generated Links (computed, always updated)
  summons_pdf_link: AWSURL
  video_link: AWSURL

  # ─────────────────────────────────────────────────────────────
  # SYNC TRACKING FIELDS (New for Time-Travel)
  # ─────────────────────────────────────────────────────────────

  # Phase 1: Metadata Sync Tracking
  last_metadata_sync: AWSDateTime      # When we last pulled from OATH API
  api_data_hash: String                # MD5 hash of API response for this summons
  sync_source: String                  # 'OATH_API' | 'MANUAL' | 'OCR'

  # Phase 2: OCR Processing Tracking
  ocr_status: String @default(value: "pending")  # 'pending' | 'complete' | 'failed' | 'skipped'
  ocr_priority_score: Int              # Calculated priority (lower = higher priority)
  last_ocr_attempt: AWSDateTime        # When we last tried OCR
  ocr_failure_count: Int @default(value: "0")    # Retry tracking
  ocr_failure_reason: String           # Last error message

  # Archive/Soft Delete
  is_archived: Boolean @default(value: "false")  # True if disappeared from API
  archived_at: AWSDateTime
  archived_reason: String              # 'DISMISSED' | 'PAID' | 'API_MISSING' | 'MANUAL'

  # Ghost Detection
  api_miss_count: Int @default(value: "0")  # Consecutive API misses
  last_api_miss: AWSDateTime                # When last missed

  # ─────────────────────────────────────────────────────────────
  # USER-OWNED FIELDS (Protected from sync overwrites)
  # Source: Arthur's manual input - NEVER overwritten by automation
  # ─────────────────────────────────────────────────────────────
  notes: String                        # Protected
  added_to_calendar: Boolean           # Protected
  evidence_reviewed: Boolean           # Protected
  evidence_requested: Boolean          # Protected
  evidence_requested_date: AWSDateTime # Protected
  evidence_received: Boolean           # Protected
  internal_status: String              # Protected ('New', 'Reviewing', etc.)

  # ─────────────────────────────────────────────────────────────
  # OCR-EXTRACTED FIELDS (Immutable after first extraction)
  # Source: Gemini OCR - Set once, never updated
  # ─────────────────────────────────────────────────────────────
  license_plate_ocr: String            # Immutable after set
  dep_id: String                       # Immutable after set
  vehicle_type_ocr: String             # Immutable after set
  prior_offense_status: String         # Immutable after set
  violation_narrative: String          # Immutable after set (KEY IMMUTABILITY FLAG)
  idling_duration_ocr: String          # Immutable after set
  critical_flags_ocr: [String]         # Immutable after set
  name_on_summons_ocr: String          # Immutable after set

  # ─────────────────────────────────────────────────────────────
  # ACTIVITY LOG (Time-Travel History)
  # ─────────────────────────────────────────────────────────────
  activity_log: AWSJSON                # Array of ActivityLogEntry

  # Change Summary (for UPDATED badge)
  last_change_summary: String
  last_change_at: AWSDateTime

  # Timestamps
  createdAt: AWSDateTime
  updatedAt: AWSDateTime
}
```

### 1.2 Activity Log JSON Structure

```typescript
interface ActivityLogEntry {
  id: string;                    // UUID for uniqueness
  date: string;                  // ISO 8601 timestamp
  type: ActivityType;            // Enum of change types
  description: string;           // Human-readable description
  old_value: string | null;      // Previous value (for diff display)
  new_value: string | null;      // New value
  source: 'OATH_API' | 'OCR' | 'MANUAL';  // Who made this change
  metadata?: {                   // Optional additional context
    api_field?: string;          // Which API field changed
    days_shifted?: number;       // For reschedules: how many days moved
    amount_delta?: number;       // For financial changes: difference
  };
}

type ActivityType =
  | 'CREATED'           // First discovery of summons
  | 'STATUS_CHANGE'     // Case status changed (PENDING → DEFAULT)
  | 'RESCHEDULE'        // Hearing date moved
  | 'RESULT_CHANGE'     // Hearing result updated (Pending → GUILTY)
  | 'AMOUNT_CHANGE'     // Balance due changed (not payment)
  | 'PAYMENT'           // paid_amount increased
  | 'AMENDMENT'         // Violation code/description changed
  | 'OCR_COMPLETE'      // Document scan finished
  | 'ARCHIVED'          // Record archived/soft-deleted
  | 'RESTORED';         // Record un-archived
```

**Example Activity Log Entry (Hearing Rescheduled):**

```json
{
  "id": "act_abc123",
  "date": "2025-11-30T14:32:00.000Z",
  "type": "RESCHEDULE",
  "description": "Hearing rescheduled from Nov 15, 2025 to Dec 10, 2025",
  "old_value": "2025-11-15T00:00:00.000Z",
  "new_value": "2025-12-10T00:00:00.000Z",
  "source": "OATH_API",
  "metadata": {
    "api_field": "hearing_date",
    "days_shifted": 25
  }
}
```

### 1.3 Data Source Protection Matrix

| Field Category | Source | Can API Overwrite? | Can OCR Overwrite? | Can User Edit? |
|----------------|--------|-------------------|-------------------|----------------|
| Core API Fields | OATH API | ✅ Yes (with logging) | ❌ No | ❌ No |
| User-Owned Fields | Manual | ❌ No | ❌ No | ✅ Yes |
| OCR Fields | Gemini | ❌ No | ❌ No (immutable) | ❌ No |
| Sync Tracking | System | ✅ Yes | ✅ Yes | ❌ No |

**Protection Implementation:**

```javascript
// Fields that the API sync can NEVER touch
const PROTECTED_FIELDS = [
  'notes',
  'added_to_calendar',
  'evidence_reviewed',
  'evidence_requested',
  'evidence_requested_date',
  'evidence_received',
  'internal_status',
];

// Fields that OCR sets once and never updates
const IMMUTABLE_OCR_FIELDS = [
  'violation_narrative',  // PRIMARY immutability check
  'license_plate_ocr',
  'dep_id',
  'vehicle_type_ocr',
  'prior_offense_status',
  'idling_duration_ocr',
  'critical_flags_ocr',
  'name_on_summons_ocr',
];
```

---

## Pillar 2: Two-Phase Sweep Logic

### 2.1 High-Level Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DAILY SWEEP (6:00 AM ET)                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: METADATA SYNC (Unlimited API calls)                          │
│  ─────────────────────────────────────────────────────────────────────  │
│  1. Fetch ALL clients + AKAs from DynamoDB                              │
│  2. Query NYC Open Data API for each client name                        │
│  3. For each summons returned:                                          │
│     a. Check if exists in DB (by summons_number)                        │
│     b. If NEW → Create record with activity_log = [CREATED]             │
│     c. If EXISTS → Run Diff Engine, log changes, update metadata        │
│  4. Detect "Ghost" summons (in DB but missing from API)                 │
│  5. Update last_metadata_sync timestamp                                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: PRIORITY QUEUE OCR (Max 500 requests/day)                    │
│  ─────────────────────────────────────────────────────────────────────  │
│  1. Query all summons WHERE ocr_status = 'pending'                      │
│  2. Calculate priority_score for each                                   │
│  3. Sort by priority_score ASC (lowest = highest priority)              │
│  4. Take TOP 500 from sorted queue                                      │
│  5. Process sequentially with 2-second throttle                         │
│  6. Update ocr_status and activity_log for each                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PHASE 3: CLEANUP & REPORTING                                           │
│  ─────────────────────────────────────────────────────────────────────  │
│  1. Update global sync_status record with results                       │
│  2. Log summary to CloudWatch                                           │
│  3. If critical failures → Trigger alert (future: email/Slack)          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Phase 1: Diff Engine Pseudo-Code

```javascript
/**
 * PHASE 1: Metadata Sync (Unlimited)
 *
 * Purpose: Pull latest data from NYC Open Data API without consuming OCR credits.
 * Constraint: No limit on API calls (they're free)
 */

async function phaseOneMetadataSync(clients) {
  const syncStartTime = new Date().toISOString();
  const results = {
    newRecords: 0,
    updatedRecords: 0,
    unchangedRecords: 0,
    archivedRecords: 0,
    errors: [],
  };

  // Track all summons_numbers we see from the API
  const seenSummonsNumbers = new Set();

  for (const client of clients) {
    // Build list of names to search (primary + AKAs)
    const searchNames = [client.name, ...(client.akas || [])];

    for (const searchName of searchNames) {
      try {
        // Query NYC Open Data API
        const apiSummonses = await queryNYCOpenDataAPI({
          respondent_name: searchName,
          code_description: 'IDLING',
        });

        for (const apiData of apiSummonses) {
          seenSummonsNumbers.add(apiData.summons_number);

          // Check if summons exists in our database
          const existingRecord = await getSummonsBySummonsNumber(apiData.summons_number);

          if (!existingRecord) {
            // ═══════════════════════════════════════════════════════════
            // NEW RECORD: Create with initial activity log
            // ═══════════════════════════════════════════════════════════
            await createNewSummons(apiData, client.id, syncStartTime);
            results.newRecords++;
          } else {
            // ═══════════════════════════════════════════════════════════
            // EXISTING RECORD: Run Diff Engine
            // ═══════════════════════════════════════════════════════════
            const diffResult = runDiffEngine(existingRecord, apiData);

            if (diffResult.hasChanges) {
              await updateSummonsWithChanges(existingRecord, apiData, diffResult, syncStartTime);
              results.updatedRecords++;
            } else {
              // Just update the sync timestamp
              await updateSyncTimestamp(existingRecord.id, syncStartTime);
              results.unchangedRecords++;
            }
          }
        }
      } catch (error) {
        results.errors.push({ client: client.name, searchName, error: error.message });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GHOST DETECTION: Find summons in our DB that weren't in the API response
  // ═══════════════════════════════════════════════════════════════════════
  const ghostCount = await detectAndHandleGhostSummons(seenSummonsNumbers, syncStartTime);
  results.archivedRecords = ghostCount;

  return results;
}

/**
 * DIFF ENGINE: Detects and categorizes changes between existing and incoming data
 */
function runDiffEngine(existingRecord, incomingApiData) {
  const changes = [];
  const activityEntries = [];
  const now = new Date().toISOString();

  // ─────────────────────────────────────────────────────────────────────
  // CHECK 1: Status Change (e.g., "SCHEDULED" → "DEFAULT JUDGMENT")
  // ─────────────────────────────────────────────────────────────────────
  if (existingRecord.status !== incomingApiData.status) {
    changes.push({
      field: 'status',
      old: existingRecord.status,
      new: incomingApiData.status,
    });

    activityEntries.push({
      id: generateUUID(),
      date: now,
      type: 'STATUS_CHANGE',
      description: `Status changed from "${existingRecord.status}" to "${incomingApiData.status}"`,
      old_value: existingRecord.status,
      new_value: incomingApiData.status,
      source: 'OATH_API',
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // CHECK 2: Hearing Date Change (Reschedule/Adjournment)
  // ─────────────────────────────────────────────────────────────────────
  const existingDate = normalizeDate(existingRecord.hearing_date);
  const incomingDate = normalizeDate(incomingApiData.hearing_date);

  if (existingDate !== incomingDate) {
    const daysShifted = calculateDaysDifference(existingDate, incomingDate);

    changes.push({
      field: 'hearing_date',
      old: existingDate,
      new: incomingDate,
    });

    activityEntries.push({
      id: generateUUID(),
      date: now,
      type: 'RESCHEDULE',
      description: `Hearing ${daysShifted > 0 ? 'postponed' : 'moved up'} from ${formatDate(existingDate)} to ${formatDate(incomingDate)}`,
      old_value: existingDate,
      new_value: incomingDate,
      source: 'OATH_API',
      metadata: {
        api_field: 'hearing_date',
        days_shifted: daysShifted,
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // CHECK 3: Hearing Result Change
  // ─────────────────────────────────────────────────────────────────────
  if (existingRecord.hearing_result !== incomingApiData.hearing_result) {
    changes.push({
      field: 'hearing_result',
      old: existingRecord.hearing_result,
      new: incomingApiData.hearing_result,
    });

    activityEntries.push({
      id: generateUUID(),
      date: now,
      type: 'RESULT_CHANGE',
      description: `Hearing result: ${incomingApiData.hearing_result || 'Pending'}`,
      old_value: existingRecord.hearing_result || 'Pending',
      new_value: incomingApiData.hearing_result || 'Pending',
      source: 'OATH_API',
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // CHECK 4: Financial Changes
  // ─────────────────────────────────────────────────────────────────────
  const existingDue = existingRecord.amount_due || 0;
  const incomingDue = incomingApiData.balance_due || 0;
  const existingPaid = existingRecord.paid_amount || 0;
  const incomingPaid = incomingApiData.paid_amount || 0;

  // Payment detected (paid_amount increased)
  if (incomingPaid > existingPaid) {
    const paymentAmount = incomingPaid - existingPaid;

    changes.push({ field: 'paid_amount', old: existingPaid, new: incomingPaid });

    activityEntries.push({
      id: generateUUID(),
      date: now,
      type: 'PAYMENT',
      description: `Payment received: $${paymentAmount.toFixed(2)}`,
      old_value: `$${existingPaid.toFixed(2)}`,
      new_value: `$${incomingPaid.toFixed(2)}`,
      source: 'OATH_API',
      metadata: { amount_delta: paymentAmount },
    });
  }

  // Balance change (not from payment - could be penalty or adjustment)
  if (Math.abs(existingDue - incomingDue) > 0.01 && incomingPaid === existingPaid) {
    const delta = incomingDue - existingDue;

    changes.push({ field: 'amount_due', old: existingDue, new: incomingDue });

    activityEntries.push({
      id: generateUUID(),
      date: now,
      type: 'AMOUNT_CHANGE',
      description: `Balance ${delta > 0 ? 'increased' : 'decreased'} by $${Math.abs(delta).toFixed(2)}`,
      old_value: `$${existingDue.toFixed(2)}`,
      new_value: `$${incomingDue.toFixed(2)}`,
      source: 'OATH_API',
      metadata: { amount_delta: delta },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // CHECK 5: Violation Code Amendment
  // ─────────────────────────────────────────────────────────────────────
  if (existingRecord.code_description !== incomingApiData.code_description) {
    changes.push({
      field: 'code_description',
      old: existingRecord.code_description,
      new: incomingApiData.code_description,
    });

    activityEntries.push({
      id: generateUUID(),
      date: now,
      type: 'AMENDMENT',
      description: `Violation code changed`,
      old_value: existingRecord.code_description,
      new_value: incomingApiData.code_description,
      source: 'OATH_API',
    });
  }

  return {
    hasChanges: changes.length > 0,
    changes,
    activityEntries,
    changeSummary: changes.map(c => `${c.field}: ${c.old} → ${c.new}`).join('; '),
  };
}
```

### 2.3 Phase 2: Priority Queue Algorithm

```javascript
/**
 * PHASE 2: Priority Queue OCR Processing
 *
 * Constraint: Maximum 500 OCR requests per day
 * Constraint: Minimum 2-second gap between requests (rate limit)
 */

async function phaseTwoOCRProcessing() {
  const MAX_DAILY_OCR = 500;
  const THROTTLE_MS = 2000;  // 2 seconds between requests

  const results = {
    processed: 0,
    skipped: 0,
    failed: 0,
    remaining: 0,
  };

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: Build the Priority Queue
  // ═══════════════════════════════════════════════════════════════════════
  const pendingOCR = await queryPendingOCRSummons();

  // Calculate priority score for each
  const scoredQueue = pendingOCR.map(summons => ({
    ...summons,
    priority_score: calculatePriorityScore(summons),
  }));

  // Sort by priority (lowest score = highest priority)
  scoredQueue.sort((a, b) => a.priority_score - b.priority_score);

  // Take only top 500
  const processingBatch = scoredQueue.slice(0, MAX_DAILY_OCR);
  results.remaining = Math.max(0, scoredQueue.length - MAX_DAILY_OCR);

  console.log(`OCR Queue: ${scoredQueue.length} pending, processing ${processingBatch.length}`);

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: Process with Throttling
  // ═══════════════════════════════════════════════════════════════════════
  for (let i = 0; i < processingBatch.length; i++) {
    const summons = processingBatch[i];

    // IMMUTABILITY CHECK: Skip if already has OCR data
    if (summons.violation_narrative && summons.violation_narrative.length > 0) {
      console.log(`SKIP: ${summons.summons_number} already has OCR data`);
      await markOCRComplete(summons.id, 'skipped');
      results.skipped++;
      continue;
    }

    try {
      // Process OCR
      const ocrData = await performOCRExtraction(summons);
      await saveOCRResults(summons.id, ocrData);
      results.processed++;

      console.log(`OCR ${i + 1}/${processingBatch.length}: ${summons.summons_number} ✓`);
    } catch (error) {
      console.error(`OCR failed for ${summons.summons_number}:`, error.message);
      await markOCRFailed(summons.id, error.message);
      results.failed++;
    }

    // THROTTLE: Wait 2 seconds before next request (except for last one)
    if (i < processingBatch.length - 1) {
      await sleep(THROTTLE_MS);
    }
  }

  return results;
}

/**
 * PRIORITY SCORING ALGORITHM
 *
 * Lower score = Higher priority
 *
 * Priority Tiers:
 * 1. CRITICAL (0-99): Hearing within 7 days, needs immediate OCR
 * 2. URGENT (100-199): Hearing within 30 days
 * 3. STANDARD (200-299): Hearing 30-90 days out
 * 4. LOW (300-399): Hearing 90+ days out
 * 5. ARCHIVE (400+): Past hearings, process when bandwidth allows
 */
function calculatePriorityScore(summons) {
  const now = new Date();
  const hearingDate = new Date(summons.hearing_date);
  const daysUntilHearing = Math.floor((hearingDate - now) / (1000 * 60 * 60 * 24));

  let baseScore;

  // ─────────────────────────────────────────────────────────────────────
  // TIER 1: CRITICAL - Hearing within 7 days
  // ─────────────────────────────────────────────────────────────────────
  if (daysUntilHearing >= 0 && daysUntilHearing <= 7) {
    // Score 0-70 based on urgency (0 = tomorrow, 70 = 7 days out)
    baseScore = daysUntilHearing * 10;
  }

  // ─────────────────────────────────────────────────────────────────────
  // TIER 2: URGENT - Hearing within 30 days
  // ─────────────────────────────────────────────────────────────────────
  else if (daysUntilHearing > 7 && daysUntilHearing <= 30) {
    // Score 100-130
    baseScore = 100 + (daysUntilHearing - 7);
  }

  // ─────────────────────────────────────────────────────────────────────
  // TIER 3: STANDARD - Hearing 30-90 days out
  // ─────────────────────────────────────────────────────────────────────
  else if (daysUntilHearing > 30 && daysUntilHearing <= 90) {
    // Score 200-260
    baseScore = 200 + (daysUntilHearing - 30);
  }

  // ─────────────────────────────────────────────────────────────────────
  // TIER 4: LOW - Hearing 90+ days out
  // ─────────────────────────────────────────────────────────────────────
  else if (daysUntilHearing > 90) {
    // Score 300-399 (capped)
    baseScore = Math.min(399, 300 + (daysUntilHearing - 90));
  }

  // ─────────────────────────────────────────────────────────────────────
  // TIER 5: ARCHIVE - Past hearings (negative days)
  // ─────────────────────────────────────────────────────────────────────
  else {
    // Score 400+ for past hearings
    // More recent past hearings get slightly lower scores
    const daysPast = Math.abs(daysUntilHearing);
    baseScore = 400 + Math.min(100, daysPast);
  }

  // ─────────────────────────────────────────────────────────────────────
  // MODIFIERS: Adjust score based on other factors
  // ─────────────────────────────────────────────────────────────────────

  // Bonus: New records get -20 (prioritize new discoveries)
  if (summons.createdAt) {
    const hoursSinceCreation = (now - new Date(summons.createdAt)) / (1000 * 60 * 60);
    if (hoursSinceCreation <= 24) {
      baseScore -= 20;
    }
  }

  // Penalty: Previous failures get +50 per failure (avoid retry storms)
  if (summons.ocr_failure_count > 0) {
    baseScore += summons.ocr_failure_count * 50;
  }

  // Penalty: High balance cases get -10 (prioritize expensive tickets)
  if (summons.amount_due > 1000) {
    baseScore -= 10;
  }

  return Math.max(0, baseScore);  // Never negative
}

/**
 * IMMUTABILITY CHECK
 *
 * Determines if a summons should skip OCR processing
 */
function shouldSkipOCR(summons) {
  // PRIMARY CHECK: violation_narrative is the immutability flag
  if (summons.violation_narrative && summons.violation_narrative.trim().length > 0) {
    return { skip: true, reason: 'Already has violation narrative (OCR complete)' };
  }

  // SECONDARY CHECK: ocr_status explicitly marked complete
  if (summons.ocr_status === 'complete') {
    return { skip: true, reason: 'OCR status is complete' };
  }

  // TERTIARY CHECK: Too many failures (avoid infinite retry)
  if (summons.ocr_failure_count >= 3) {
    return { skip: true, reason: 'Max retry attempts exceeded' };
  }

  return { skip: false, reason: null };
}
```

### 2.4 Throttle Mechanism Detail

```javascript
/**
 * THROTTLE IMPLEMENTATION
 *
 * Ensures we don't exceed rate limits:
 * - Google Gemini: ~30 requests/minute (we use 2-second gaps = 30/min max)
 * - Per-minute tracking to catch edge cases
 */

class ThrottledOCRProcessor {
  constructor() {
    this.requestsThisMinute = 0;
    this.minuteStartTime = Date.now();
    this.MIN_GAP_MS = 2000;         // 2 seconds between requests
    this.MAX_PER_MINUTE = 25;       // Stay under 30/min limit with buffer
    this.lastRequestTime = 0;
  }

  async processWithThrottle(summons) {
    // Check minute-level rate limit
    this.checkMinuteReset();

    if (this.requestsThisMinute >= this.MAX_PER_MINUTE) {
      const waitTime = 60000 - (Date.now() - this.minuteStartTime);
      console.log(`Rate limit approaching, waiting ${waitTime}ms for minute reset`);
      await sleep(waitTime);
      this.resetMinuteCounter();
    }

    // Enforce minimum gap between requests
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_GAP_MS) {
      await sleep(this.MIN_GAP_MS - timeSinceLastRequest);
    }

    // Make the request
    this.lastRequestTime = Date.now();
    this.requestsThisMinute++;

    return await this.performOCR(summons);
  }

  checkMinuteReset() {
    if (Date.now() - this.minuteStartTime >= 60000) {
      this.resetMinuteCounter();
    }
  }

  resetMinuteCounter() {
    this.requestsThisMinute = 0;
    this.minuteStartTime = Date.now();
  }
}
```

---

## Pillar 3: Proof of Life Data Flow

### 3.1 Sync Status Tracking

```graphql
# New model for tracking overall sync health
type SyncStatus @model @auth(rules: [{ allow: private }]) {
  id: ID!                           # Always "GLOBAL" (singleton)
  last_successful_sync: AWSDateTime  # When Phase 1+2 last completed
  last_sync_attempt: AWSDateTime     # When we last tried
  sync_in_progress: Boolean          # True while running

  # Phase 1 Results
  phase1_status: String              # 'success' | 'partial' | 'failed'
  phase1_completed_at: AWSDateTime
  phase1_new_records: Int
  phase1_updated_records: Int
  phase1_errors: [String]

  # Phase 2 Results
  phase2_status: String
  phase2_completed_at: AWSDateTime
  phase2_ocr_processed: Int
  phase2_ocr_remaining: Int
  phase2_ocr_failed: Int

  # API Health
  oath_api_reachable: Boolean
  oath_api_last_check: AWSDateTime
  oath_api_error: String
}
```

### 3.2 Frontend Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND DATA FLOW                              │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐    GraphQL Query     ┌──────────────────────────────┐
│                  │ ──────────────────► │                              │
│   App Header     │   getSyncStatus()    │     AWS AppSync + DynamoDB   │
│   Component      │ ◄────────────────── │                              │
│                  │    SyncStatus        │                              │
└────────┬─────────┘                      └──────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  HEADER BADGE LOGIC                                                      │
│  ────────────────────────────────────────────────────────────────────── │
│                                                                          │
│  if (syncStatus.sync_in_progress) {                                      │
│    return <Badge color="blue">Syncing...</Badge>                         │
│  }                                                                       │
│                                                                          │
│  const hoursSinceSync = (now - last_successful_sync) / (1000*60*60);     │
│                                                                          │
│  if (hoursSinceSync < 24) {                                              │
│    return <Badge color="green">Data Fresh (synced {hoursSinceSync}h ago) │
│  }                                                                       │
│                                                                          │
│  if (hoursSinceSync < 48) {                                              │
│    return <Badge color="yellow">Data may be stale ({hoursSinceSync}h)    │
│  }                                                                       │
│                                                                          │
│  return <Badge color="red">⚠️ Sync failed - data may be outdated         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐                      ┌──────────────────────────────┐
│  Case Detail     │   GraphQL Query      │                              │
│  Modal           │ ──────────────────► │     Summons Record           │
│                  │   getSummons(id)     │     (includes activity_log)  │
│                  │ ◄────────────────── │                              │
└────────┬─────────┘                      └──────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  CASE HISTORY TIMELINE RENDERING                                         │
│  ────────────────────────────────────────────────────────────────────── │
│                                                                          │
│  const sortedLog = summons.activity_log                                  │
│    .sort((a, b) => new Date(b.date) - new Date(a.date));  // Newest first│
│                                                                          │
│  return (                                                                 │
│    <Timeline>                                                            │
│      {sortedLog.map(entry => (                                           │
│        <TimelineItem key={entry.id}>                                     │
│          <TimelineDate>{formatDate(entry.date)}</TimelineDate>           │
│          <TimelineIcon color={getColorForType(entry.type)} />            │
│          <TimelineContent>                                               │
│            <Chip label={entry.type} />                                   │
│            <Typography>{entry.description}</Typography>                  │
│            {entry.old_value && entry.new_value && (                      │
│              <DiffDisplay old={entry.old_value} new={entry.new_value} /> │
│            )}                                                            │
│          </TimelineContent>                                              │
│        </TimelineItem>                                                   │
│      ))}                                                                 │
│    </Timeline>                                                           │
│  );                                                                      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Failure State UI Handling

```typescript
/**
 * FAILURE STATE DETECTION & UI RESPONSE
 */

interface SyncHealthIndicator {
  status: 'healthy' | 'warning' | 'error';
  message: string;
  details?: string;
  lastSuccess?: Date;
  actionRequired?: string;
}

function calculateSyncHealth(syncStatus: SyncStatus): SyncHealthIndicator {
  const now = new Date();
  const lastSync = new Date(syncStatus.last_successful_sync);
  const hoursSince = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);

  // ─────────────────────────────────────────────────────────────────────
  // SCENARIO 1: Currently syncing
  // ─────────────────────────────────────────────────────────────────────
  if (syncStatus.sync_in_progress) {
    return {
      status: 'healthy',
      message: 'Sync in progress...',
      details: 'Data is being updated. This may take a few minutes.',
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // SCENARIO 2: OATH API unreachable
  // ─────────────────────────────────────────────────────────────────────
  if (!syncStatus.oath_api_reachable) {
    return {
      status: 'error',
      message: '⚠️ OATH website unreachable',
      details: syncStatus.oath_api_error || 'Cannot connect to NYC Open Data',
      lastSuccess: lastSync,
      actionRequired: 'Data may be outdated. Check back later.',
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // SCENARIO 3: Phase 1 failed
  // ─────────────────────────────────────────────────────────────────────
  if (syncStatus.phase1_status === 'failed') {
    return {
      status: 'error',
      message: '⚠️ Sync failed',
      details: `Errors: ${syncStatus.phase1_errors?.join(', ') || 'Unknown'}`,
      lastSuccess: lastSync,
      actionRequired: 'Contact support if this persists.',
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // SCENARIO 4: Stale data (>48 hours)
  // ─────────────────────────────────────────────────────────────────────
  if (hoursSince > 48) {
    return {
      status: 'error',
      message: `⚠️ Data is ${Math.floor(hoursSince)} hours old`,
      details: 'Automatic sync may have failed.',
      lastSuccess: lastSync,
      actionRequired: 'Verify scheduled job is running.',
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // SCENARIO 5: Slightly stale (24-48 hours)
  // ─────────────────────────────────────────────────────────────────────
  if (hoursSince > 24) {
    return {
      status: 'warning',
      message: `Data synced ${Math.floor(hoursSince)} hours ago`,
      details: 'Next sync should run soon.',
      lastSuccess: lastSync,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // SCENARIO 6: Healthy
  // ─────────────────────────────────────────────────────────────────────
  return {
    status: 'healthy',
    message: `Data fresh (${Math.floor(hoursSince)}h ago)`,
    lastSuccess: lastSync,
  };
}
```

---

## Pillar 4: Edge Case & Failure Analysis

### 4.1 The "Reschedule" Trap

**Scenario:** A hearing is rescheduled from "Tomorrow" (priority score: 10) to "Next Month" (priority score: 130).

**Problem:** If we've already queued the summons for OCR based on tomorrow's hearing, should we still process it?

**Solution:**

```javascript
/**
 * DYNAMIC PRIORITY RECALCULATION
 *
 * Priority scores are calculated fresh each day during Phase 2.
 * This automatically handles reschedules.
 */

// In phaseTwoOCRProcessing():
async function phaseTwoOCRProcessing() {
  // Priority scores are calculated FRESH at the start of Phase 2
  // This means a rescheduled hearing automatically gets re-prioritized

  const pendingOCR = await queryPendingOCRSummons();

  // Recalculate priority for ALL pending summons
  const scoredQueue = pendingOCR.map(summons => ({
    ...summons,
    priority_score: calculatePriorityScore(summons),  // Uses CURRENT hearing_date
  }));

  // Sort and process top 500
  // The rescheduled case now has a lower priority and may not make the cut
  scoredQueue.sort((a, b) => a.priority_score - b.priority_score);

  // ...
}

/**
 * EXAMPLE:
 *
 * Before Reschedule (Day 1):
 * - Summons A: Hearing Dec 1 (tomorrow), priority_score = 10 ← Will be processed
 * - Summons B: Hearing Dec 15 (14 days), priority_score = 100
 *
 * After Reschedule (Day 2, after Phase 1 updates hearing_date):
 * - Summons A: Hearing Jan 15 (45 days), priority_score = 215 ← Deprioritized
 * - Summons B: Hearing Dec 15 (13 days), priority_score = 100 ← Now higher priority
 *
 * Result: Resources automatically shift to more urgent cases.
 */
```

**Key Insight:** Priority scores are ephemeral. They're recalculated each day based on current data, not stored. This ensures reschedules are always reflected.

---

### 4.2 The "Ghost" Summons

**Scenario:** A summons exists in our database but is no longer returned by the NYC API.

**Possible Reasons:**
1. Case was dismissed
2. Case was paid in full
3. Data entry error corrected by OATH
4. API pagination issue (rare)

**Solution:**

```javascript
/**
 * GHOST DETECTION & HANDLING
 *
 * Philosophy: NEVER delete data. Archive it for audit trail.
 */

async function detectAndHandleGhostSummons(seenSummonsNumbers, syncTime) {
  // Get all active (non-archived) summons from our database
  const allActiveSummons = await queryAllActiveSummons();

  let archivedCount = 0;

  for (const dbSummons of allActiveSummons) {
    // Check if this summons was seen in the API response
    if (!seenSummonsNumbers.has(dbSummons.summons_number)) {

      // ─────────────────────────────────────────────────────────────────
      // GRACE PERIOD: Don't archive immediately
      // API might have had a hiccup. Wait for 3 consecutive misses.
      // ─────────────────────────────────────────────────────────────────
      const missCount = (dbSummons.api_miss_count || 0) + 1;

      if (missCount < 3) {
        // Just increment the miss counter
        await updateSummons(dbSummons.id, {
          api_miss_count: missCount,
          last_api_miss: syncTime,
        });
        console.log(`Ghost warning: ${dbSummons.summons_number} missing from API (${missCount}/3)`);
        continue;
      }

      // ─────────────────────────────────────────────────────────────────
      // ARCHIVE: Summons missing for 3+ days
      // ─────────────────────────────────────────────────────────────────
      const archiveReason = inferArchiveReason(dbSummons);

      await updateSummons(dbSummons.id, {
        is_archived: true,
        archived_at: syncTime,
        archived_reason: archiveReason,
        api_miss_count: missCount,
      });

      // Add to activity log
      await appendActivityLog(dbSummons.id, {
        id: generateUUID(),
        date: syncTime,
        type: 'ARCHIVED',
        description: `Case archived: ${archiveReason}`,
        old_value: dbSummons.status,
        new_value: 'ARCHIVED',
        source: 'OATH_API',
      });

      archivedCount++;
      console.log(`Archived: ${dbSummons.summons_number} (${archiveReason})`);
    } else {
      // Summons found - reset miss counter if it was set
      if (dbSummons.api_miss_count > 0) {
        await updateSummons(dbSummons.id, { api_miss_count: 0 });
      }
    }
  }

  return archivedCount;
}

/**
 * INFER ARCHIVE REASON based on last known state
 */
function inferArchiveReason(summons) {
  // If status was DISMISSED, it was probably dismissed
  if (summons.status?.toUpperCase().includes('DISMISS')) {
    return 'DISMISSED';
  }

  // If paid_amount >= amount_due, probably paid off
  if (summons.paid_amount >= summons.amount_due && summons.amount_due > 0) {
    return 'PAID';
  }

  // If hearing was in the past and result was recorded
  if (summons.hearing_result && new Date(summons.hearing_date) < new Date()) {
    return 'CASE_CLOSED';
  }

  // Default: Unknown reason
  return 'API_MISSING';
}

/**
 * RESTORATION: If a "ghost" reappears, un-archive it
 */
async function handleRestoredSummons(summons, apiData, syncTime) {
  if (summons.is_archived) {
    await updateSummons(summons.id, {
      is_archived: false,
      archived_at: null,
      archived_reason: null,
    });

    await appendActivityLog(summons.id, {
      id: generateUUID(),
      date: syncTime,
      type: 'RESTORED',
      description: 'Case reappeared in OATH system',
      old_value: 'ARCHIVED',
      new_value: apiData.status,
      source: 'OATH_API',
    });
  }
}
```

**Schema Addition:**

```graphql
# Add to Summons type
api_miss_count: Int @default(value: "0")  # Consecutive API misses
last_api_miss: AWSDateTime                # When last missed
```

---

### 4.3 The "Friday Dump" Problem

**Scenario:** 600 new summonses arrive on Friday afternoon. Daily quota is 500.

**Problem Analysis:**

| Event | Day | Queue Size | Processed | Remaining |
|-------|-----|------------|-----------|-----------|
| Friday Dump | Fri | 600 | 500 | 100 |
| Saturday Sweep | Sat | 100 + new | 500 | ? |
| Monday Check | Mon | ? | ? | ? |

**Solution:**

```javascript
/**
 * QUEUE OVERFLOW HANDLING
 *
 * Key Principle: No summons is ever "lost."
 * The queue persists in DynamoDB via ocr_status = 'pending'.
 */

// The queue is the database itself
// Any summons with ocr_status = 'pending' is in the queue

async function phaseTwoOCRProcessing() {
  const MAX_DAILY_OCR = 500;

  // Query ALL pending summons (no limit)
  const allPending = await queryPendingOCRSummons();

  console.log(`Queue depth: ${allPending.length} summonses need OCR`);

  // Calculate priorities and sort
  const sorted = allPending
    .map(s => ({ ...s, priority_score: calculatePriorityScore(s) }))
    .sort((a, b) => a.priority_score - b.priority_score);

  // Take ONLY top 500
  const toProcess = sorted.slice(0, MAX_DAILY_OCR);
  const overflow = sorted.slice(MAX_DAILY_OCR);

  if (overflow.length > 0) {
    console.warn(`⚠️ OVERFLOW: ${overflow.length} summonses queued for tomorrow`);

    // Log overflow details for monitoring
    const overflowSummary = {
      count: overflow.length,
      oldest: overflow[overflow.length - 1]?.summons_number,
      lowestPriority: overflow[overflow.length - 1]?.priority_score,
    };

    // Store overflow count in sync status for UI warning
    await updateSyncStatus({
      phase2_ocr_remaining: overflow.length,
      phase2_overflow_warning: overflow.length > 100,  // Flag if backlog growing
    });
  }

  // Process the 500
  for (const summons of toProcess) {
    // ... OCR processing
  }

  return {
    processed: toProcess.length,
    queued: overflow.length,
  };
}

/**
 * FRIDAY DUMP SCENARIO WALKTHROUGH
 *
 * Friday 6 AM: Daily sweep runs
 * - Phase 1: 600 new summonses discovered, all inserted with ocr_status = 'pending'
 * - Phase 2: Query pending → 600 found
 *   - Priority calculated for all 600
 *   - Sorted by priority (urgent hearings first)
 *   - Top 500 processed (with 2-second throttle = ~17 minutes)
 *   - 100 remain with ocr_status = 'pending'
 *   - SyncStatus.phase2_ocr_remaining = 100
 *
 * Saturday 6 AM: Daily sweep runs
 * - Phase 1: Maybe 5 new summonses discovered
 * - Phase 2: Query pending → 100 (Friday overflow) + 5 (new) = 105
 *   - Priority recalculated (Friday's may have shifted)
 *   - All 105 processed (under 500 limit)
 *   - Queue cleared
 *
 * UI Impact:
 * - Friday afternoon: Badge shows "100 summonses awaiting document scan"
 * - Saturday afternoon: Badge shows "All summonses processed"
 */
```

**UI Warning for Overflow:**

```typescript
// In Header component
function OCRBacklogIndicator({ syncStatus }) {
  const remaining = syncStatus.phase2_ocr_remaining || 0;

  if (remaining === 0) return null;

  return (
    <Tooltip title={`${remaining} summonses awaiting document scan. They will be processed in priority order over the next ${Math.ceil(remaining / 500)} day(s).`}>
      <Chip
        icon={<HourglassIcon />}
        label={`${remaining} in queue`}
        color={remaining > 200 ? 'warning' : 'default'}
        size="small"
      />
    </Tooltip>
  );
}
```

---

## Summary: Logic Gap Analysis

### Identified Gaps (Now Addressed)

| Gap | Risk | Mitigation |
|-----|------|------------|
| Reschedule not recalculating priority | Medium | Priority scores calculated fresh each day |
| Ghost summons deleted | High | 3-day grace period + soft archive |
| Friday dump overflow | Medium | Queue persists in DB, processed next day |
| OCR retry storms | Medium | Failure counter + exponential backoff |
| User data overwritten | Critical | Protected fields list in schema |
| Rate limit exceeded | Medium | Throttle class with per-minute tracking |

### Recommended Monitoring Metrics

1. **Queue Depth Trend** - Is backlog growing over time?
2. **OCR Success Rate** - Percentage of OCR attempts that succeed
3. **Ghost Rate** - How many summonses disappear per week?
4. **API Latency** - Is NYC Open Data slowing down?
5. **Data Freshness** - P95 of hours since last sync

### Open Questions for Business Decision

1. **Archive Policy:** Should archived summonses be hidden from the dashboard by default?
2. **Retry Limit:** After 3 OCR failures, should we stop trying or flag for manual review?
3. **Weekend Processing:** Should we run sweeps on weekends, or batch for Monday?

---

## Appendix A: Schema Field Reference

### Protected Fields (Never Overwritten by Automation)

```javascript
const PROTECTED_FIELDS = [
  'notes',
  'added_to_calendar',
  'evidence_reviewed',
  'evidence_requested',
  'evidence_requested_date',
  'evidence_received',
  'internal_status',
];
```

### Immutable OCR Fields (Set Once, Never Updated)

```javascript
const IMMUTABLE_OCR_FIELDS = [
  'violation_narrative',  // PRIMARY immutability check
  'license_plate_ocr',
  'dep_id',
  'vehicle_type_ocr',
  'prior_offense_status',
  'idling_duration_ocr',
  'critical_flags_ocr',
  'name_on_summons_ocr',
];
```

### Activity Log Types

| Type | Trigger | Color | Icon |
|------|---------|-------|------|
| CREATED | New summons discovered | Blue | AddCircle |
| STATUS_CHANGE | Case status changed | Orange | Warning |
| RESCHEDULE | Hearing date moved | Orange | Schedule |
| RESULT_CHANGE | Hearing result updated | Purple | Gavel |
| AMOUNT_CHANGE | Balance due changed | Red | AttachMoney |
| PAYMENT | Payment received | Green | Payment |
| AMENDMENT | Violation code changed | Brown | Edit |
| OCR_COMPLETE | Document scan finished | Blue-gray | DocumentScanner |
| ARCHIVED | Record soft-deleted | Gray | Archive |
| RESTORED | Record un-archived | Teal | Restore |

---

## Appendix B: Priority Score Reference

| Tier | Score Range | Days Until Hearing | Description |
|------|-------------|-------------------|-------------|
| CRITICAL | 0-99 | 0-7 days | Immediate action required |
| URGENT | 100-199 | 8-30 days | Process soon |
| STANDARD | 200-299 | 31-90 days | Normal priority |
| LOW | 300-399 | 90+ days | Process when bandwidth allows |
| ARCHIVE | 400+ | Past hearings | Lowest priority |

### Score Modifiers

| Modifier | Effect | Rationale |
|----------|--------|-----------|
| New record (< 24h) | -20 | Prioritize new discoveries |
| High balance (> $1000) | -10 | Expensive tickets matter more |
| Previous OCR failure | +50 per failure | Avoid retry storms |

---

*End of Architectural Report*

*Document generated: November 30, 2025*
