/**
 * NYC OATH Summons Tracker - Daily Sweep Lambda Function
 *
 * INCREMENTAL SYNC WITH PRIORITY QUEUING STRATEGY (v2.0)
 *
 * This function implements a two-phase approach to optimize OCR usage:
 *
 * ============================================================================
 * PHASE 1: METADATA SYNC (Unlimited Cost)
 * ============================================================================
 * - Fetches ALL cases from NYC Open Data API for registered clients
 * - Updates hearing_date, case_status, amount_due for ALL records
 * - Updates last_metadata_sync for "Proof of Life" tracking
 * - Does NOT trigger OCR - only syncs metadata
 * - New cases: Creates record with ocr_status = 'pending'
 * - Ghost Detection: Archives records missing from API for 3+ consecutive days
 *
 * ============================================================================
 * PHASE 2: PRIORITY QUEUE OCR (The "Smart" 500)
 * ============================================================================
 * - Queries DB for records where ocr_status == 'pending'
 * - Excludes records with ocr_failure_count >= 3 (max retry limit)
 * - Sorts by TIERED PRIORITY SCORING:
 *   TIER 1 (0-99): CRITICAL - Hearing within 7 days
 *   TIER 2 (100-199): URGENT - Hearing within 30 days
 *   TIER 3 (200-299): STANDARD - Hearing 30-90 days out
 *   TIER 4 (300-399): LOW - Hearing 90+ days out
 *   TIER 5 (400+): ARCHIVE - Past hearings
 * - Takes Top 500 from sorted list (respects daily counter)
 * - Throttles requests (2 seconds between calls) to avoid rate limits
 * - On success: Sets ocr_status = 'complete', last_scan_date = NOW()
 * - On fail: Increments ocr_failure_count (retry tomorrow if < 3)
 *
 * CONSTRAINTS:
 * - Daily Quota: 500 OCR requests max (tracked in SyncStatus)
 * - Rate Limit: 1 request every 2 seconds
 * - Immutability: Never re-OCR a successfully processed PDF
 * - Retry Limit: Max 3 OCR attempts per record
 *
 * FR-03: Automated Daily Data Sweep
 */

const AWS = require('aws-sdk');
const fetch = require('node-fetch');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();

// Environment variables
const CLIENTS_TABLE = process.env.CLIENTS_TABLE || 'Client-dev';
const SUMMONS_TABLE = process.env.SUMMONS_TABLE || 'Summons-dev';
const SYNC_STATUS_TABLE = process.env.SYNC_STATUS_TABLE || 'SyncStatus-dev';
const NYC_API_TOKEN = process.env.NYC_OPEN_DATA_APP_TOKEN;
const DATA_EXTRACTOR_FUNCTION = process.env.DATA_EXTRACTOR_FUNCTION;

// NYC Open Data API Configuration
const NYC_API_URL = 'https://data.cityofnewyork.us/resource/jz4z-kudi.json';

// Priority Queue Configuration
const MAX_OCR_REQUESTS_PER_DAY = 500;
const OCR_THROTTLE_MS = 2000; // 2 seconds between requests
const MAX_OCR_FAILURES = 3; // Max retry attempts before giving up
const GHOST_GRACE_DAYS = 3; // Days before archiving missing records

/**
 * Main handler for the daily sweep Lambda function
 */
exports.handler = async (event) => {
  console.log('='.repeat(60));
  console.log('DAILY SWEEP - INCREMENTAL SYNC WITH PRIORITY QUEUING v2.0');
  console.log('Started:', new Date().toISOString());
  console.log('='.repeat(60));

  const syncStartTime = new Date().toISOString();

  try {
    // Mark sync as in progress
    await updateSyncStatus({
      sync_in_progress: true,
      last_sync_attempt: syncStartTime,
    });

    // Check and reset daily OCR counter if needed
    const ocrCounter = await getOrResetDailyOCRCounter();
    console.log(`Daily OCR Counter: ${ocrCounter.ocr_processed_today}/${MAX_OCR_REQUESTS_PER_DAY}`);

    // ========================================================================
    // PHASE 1: METADATA SYNC
    // ========================================================================
    console.log('\n' + '='.repeat(60));
    console.log('PHASE 1: METADATA SYNC (Unlimited Cost)');
    console.log('='.repeat(60));

    const phase1Results = await executePhase1MetadataSync();
    console.log('\nPhase 1 Complete:', phase1Results);

    // Update SyncStatus with Phase 1 results
    await updateSyncStatus({
      phase1_status: phase1Results.errors > 0 ? 'partial' : 'success',
      phase1_completed_at: new Date().toISOString(),
      phase1_new_records: phase1Results.newRecordsCreated,
      phase1_updated_records: phase1Results.recordsUpdated,
      phase1_unchanged_records: phase1Results.recordsSkipped,
      oath_api_reachable: true,
      oath_api_last_check: new Date().toISOString(),
    });

    // ========================================================================
    // PHASE 2: PRIORITY QUEUE OCR
    // ========================================================================
    console.log('\n' + '='.repeat(60));
    console.log('PHASE 2: PRIORITY QUEUE OCR (Smart 500)');
    console.log('='.repeat(60));

    const remainingQuota = MAX_OCR_REQUESTS_PER_DAY - ocrCounter.ocr_processed_today;
    console.log(`Remaining OCR quota for today: ${remainingQuota}`);

    const phase2Results = await executePhase2PriorityOCR(remainingQuota);
    console.log('\nPhase 2 Complete:', phase2Results);

    // Update SyncStatus with Phase 2 results
    await updateSyncStatus({
      phase2_status: phase2Results.ocrFailed > 0 ? 'partial' : 'success',
      phase2_completed_at: new Date().toISOString(),
      phase2_ocr_processed: phase2Results.ocrSuccess,
      phase2_ocr_remaining: phase2Results.pendingRecords - phase2Results.recordsProcessed,
      phase2_ocr_failed: phase2Results.ocrFailed,
      ocr_processed_today: ocrCounter.ocr_processed_today + phase2Results.ocrSuccess,
    });

    // ========================================================================
    // SUMMARY
    // ========================================================================
    const summary = {
      phase1: phase1Results,
      phase2: phase2Results,
      completedAt: new Date().toISOString(),
    };

    // Mark sync as complete
    await updateSyncStatus({
      sync_in_progress: false,
      last_successful_sync: new Date().toISOString(),
    });

    console.log('\n' + '='.repeat(60));
    console.log('DAILY SWEEP COMPLETE');
    console.log('='.repeat(60));
    console.log(JSON.stringify(summary, null, 2));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Daily sweep completed successfully',
        ...summary,
      }),
    };
  } catch (error) {
    console.error('Daily sweep failed:', error);
    console.error('Error stack:', error.stack);

    // Update SyncStatus with failure
    await updateSyncStatus({
      sync_in_progress: false,
      phase1_status: 'failed',
      oath_api_error: error.message,
    }).catch(e => console.error('Failed to update sync status:', e));

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Daily sweep failed',
        message: error.message,
      }),
    };
  }
};

// ============================================================================
// PHASE 1: METADATA SYNC
// ============================================================================

/**
 * Phase 1: Sync metadata for all cases without triggering OCR
 * - Fetches all cases from NYC API
 * - Updates or creates records with latest metadata
 * - Updates last_metadata_sync for "Proof of Life" tracking
 * - Flags new/incomplete records with ocr_status = 'pending'
 * - Detects "ghost" records missing from API for 3+ days
 */
async function executePhase1MetadataSync() {
  const results = {
    clientsProcessed: 0,
    casesFromAPI: 0,
    newRecordsCreated: 0,
    recordsUpdated: 0,
    recordsSkipped: 0,
    recordsFlaggedForOCR: 0,
    recordsArchived: 0,
    errors: 0,
  };

  const syncTime = new Date().toISOString();
  const seenSummonsNumbers = new Set(); // Track all summons seen from API

  // Step 1: Fetch all clients
  const clients = await fetchAllClients();
  results.clientsProcessed = clients.length;
  console.log(`Fetched ${clients.length} clients from database`);

  if (clients.length === 0) {
    console.log('No clients found. Skipping Phase 1.');
    return results;
  }

  // Step 2: Build client name map for matching
  const clientNameMap = buildClientNameMap(clients);
  console.log(`Built name map with ${clientNameMap.size} unique names`);

  // Step 3: Fetch all summonses from NYC API
  const apiSummonses = await fetchNYCDataForClients(clients);
  results.casesFromAPI = apiSummonses.length;
  console.log(`Fetched ${apiSummonses.length} summonses from NYC API`);

  // Step 4: Process each summons - UPDATE METADATA ONLY
  for (const apiSummons of apiSummonses) {
    try {
      const ticketNumber = apiSummons.ticket_number;
      seenSummonsNumbers.add(ticketNumber);

      const processResult = await processSummonsMetadataOnly(apiSummons, clientNameMap, syncTime);

      if (processResult.action === 'created') {
        results.newRecordsCreated++;
        results.recordsFlaggedForOCR++;
      } else if (processResult.action === 'updated') {
        results.recordsUpdated++;
        if (processResult.flaggedForOCR) {
          results.recordsFlaggedForOCR++;
        }
      } else if (processResult.action === 'skipped') {
        results.recordsSkipped++;
      }
    } catch (error) {
      console.error(`Error processing summons ${apiSummons.ticket_number}:`, error.message);
      results.errors++;
    }
  }

  // Step 5: Ghost Detection - Find records missing from API
  console.log('\nRunning Ghost Detection...');
  const ghostResults = await detectAndHandleGhostSummons(seenSummonsNumbers, syncTime);
  results.recordsArchived = ghostResults.archived;
  console.log(`Ghost Detection: ${ghostResults.warnings} warnings, ${ghostResults.archived} archived`);

  return results;
}

/**
 * Process a single summons - UPDATE METADATA ONLY (no OCR trigger)
 * Now includes Activity Log for audit trail and last_metadata_sync tracking
 */
async function processSummonsMetadataOnly(apiSummons, clientNameMap, syncTime) {
  const ticketNumber = apiSummons.ticket_number;
  const respondentFirstName = apiSummons.respondent_first_name || '';
  const respondentLastName = apiSummons.respondent_last_name || '';
  const respondentFullName = `${respondentFirstName} ${respondentLastName}`.trim();

  if (!respondentFullName) {
    return { action: 'skipped', reason: 'no respondent name' };
  }

  // Match to client
  const normalizedName = normalizeCompanyName(respondentFullName);
  const noSpaceName = normalizedName.replace(/\s/g, '');
  let matchedClient = clientNameMap.get(normalizedName) || clientNameMap.get(noSpaceName);

  if (!matchedClient) {
    return { action: 'skipped', reason: 'no client match' };
  }

  // Check if summons already exists
  const existingSummons = await findExistingSummons(ticketNumber);

  // Extract and normalize NYC API data
  const incomingData = extractAPIMetadata(apiSummons);

  if (existingSummons) {
    // EXISTING RECORD: Check for changes, build activity log entries, and update metadata
    const changeResult = calculateChangesWithActivityLog(existingSummons, incomingData);

    // Reset api_miss_count since we found this record
    const resetMissCount = existingSummons.api_miss_count > 0;

    if (changeResult.hasChanges) {
      // Determine if record needs OCR (has no violation_narrative)
      const needsOCR = !existingSummons.violation_narrative && existingSummons.ocr_status !== 'complete';

      // Get existing activity log and append new entries
      const existingLog = existingSummons.activity_log || [];
      const updatedLog = [...existingLog, ...changeResult.activityEntries];

      await updateSummonsMetadataWithLog(
        existingSummons.id,
        incomingData,
        changeResult.summary,
        needsOCR,
        updatedLog,
        syncTime,
        resetMissCount
      );
      console.log(`✓ Updated: ${ticketNumber} - ${changeResult.summary} (${changeResult.activityEntries.length} log entries)`);
      return { action: 'updated', flaggedForOCR: needsOCR };
    } else {
      // No changes - but still update last_metadata_sync ("Proof of Life")
      const needsOCR = !existingSummons.violation_narrative && existingSummons.ocr_status !== 'complete';
      await updateMetadataSyncTimestamp(existingSummons.id, syncTime, needsOCR, resetMissCount);
      return { action: 'skipped', reason: 'no changes' };
    }
  } else {
    // NEW RECORD: Create with ocr_status = 'pending' and initial activity log
    const pdfLink = `https://a820-ecbticketfinder.nyc.gov/GetViolationImage?violationNumber=${ticketNumber}`;
    const videoLink = `https://nycidling.azurewebsites.net/idlingevidence/video/${ticketNumber}`;

    // Create initial activity log entry
    const initialActivityLog = [
      {
        date: syncTime,
        type: 'CREATED',
        description: 'Summons discovered and added to tracking',
        old_value: null,
        new_value: incomingData.status || 'Unknown',
      },
    ];

    const newSummons = {
      id: generateUUID(),
      clientID: matchedClient.id,
      summons_number: ticketNumber,
      respondent_name: respondentFullName,
      ...incomingData,
      summons_pdf_link: pdfLink,
      video_link: videoLink,
      added_to_calendar: false,
      evidence_reviewed: false,
      evidence_requested: false,
      evidence_received: false,
      ocr_status: 'pending', // Flag for Phase 2 OCR
      ocr_failure_count: 0,
      api_miss_count: 0,
      is_archived: false,
      last_metadata_sync: syncTime, // "Proof of Life" tracking
      activity_log: initialActivityLog, // Initial audit trail
      createdAt: syncTime,
      updatedAt: syncTime,
      owner: matchedClient.owner,
    };

    await createSummons(newSummons);
    console.log(`+ Created: ${ticketNumber} (flagged for OCR)`);
    return { action: 'created' };
  }
}

/**
 * Extract metadata fields from NYC API response
 */
function extractAPIMetadata(apiSummons) {
  const hearingDate = apiSummons.hearing_date ? ensureISOFormat(apiSummons.hearing_date) : null;
  const violationDate = apiSummons.violation_date ? ensureISOFormat(apiSummons.violation_date) : null;

  const violationLocation = [
    apiSummons.violation_location_house,
    apiSummons.violation_location_street_name,
    apiSummons.violation_location_city,
    apiSummons.violation_location_zip_code
  ].filter(Boolean).join(', ');

  return {
    hearing_date: hearingDate,
    hearing_time: apiSummons.hearing_time || '',
    hearing_result: apiSummons.hearing_result || '',
    status: apiSummons.hearing_status || apiSummons.hearing_result || 'Unknown',
    code_description: apiSummons.charge_1_code_description || apiSummons.charge_2_code_description || '',
    violation_date: violationDate,
    violation_time: apiSummons.violation_time || '',
    violation_location: violationLocation,
    license_plate: apiSummons.license_plate || '',
    base_fine: normalizeAmount(apiSummons.total_violation_amount),
    amount_due: normalizeAmount(apiSummons.balance_due),
    paid_amount: normalizeAmount(apiSummons.paid_amount),
    penalty_imposed: normalizeAmount(apiSummons.penalty_imposed),
  };
}

/**
 * Update metadata fields with activity log (no OCR trigger)
 * Includes the full activity log for audit trail and last_metadata_sync
 */
async function updateSummonsMetadataWithLog(id, metadata, changeSummary, flagForOCR, activityLog, syncTime, resetMissCount = false) {
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  // Add metadata fields
  const fieldsToUpdate = [
    'status', 'hearing_result', 'hearing_time', 'hearing_date',
    'amount_due', 'paid_amount', 'penalty_imposed', 'code_description'
  ];

  fieldsToUpdate.forEach((field) => {
    if (metadata[field] !== undefined) {
      if (field === 'status') {
        updateExpressions.push('#status = :status');
        expressionAttributeNames['#status'] = 'status';
        expressionAttributeValues[':status'] = metadata[field];
      } else {
        updateExpressions.push(`${field} = :${field}`);
        expressionAttributeValues[`:${field}`] = metadata[field];
      }
    }
  });

  // Add change tracking
  if (changeSummary) {
    updateExpressions.push('last_change_summary = :changeSummary');
    expressionAttributeValues[':changeSummary'] = changeSummary;
    updateExpressions.push('last_change_at = :changeAt');
    expressionAttributeValues[':changeAt'] = syncTime;
  }

  // Add activity log
  if (activityLog && activityLog.length > 0) {
    updateExpressions.push('activity_log = :activityLog');
    expressionAttributeValues[':activityLog'] = activityLog;
  }

  // Flag for OCR if needed
  if (flagForOCR) {
    updateExpressions.push('ocr_status = :ocrStatus');
    expressionAttributeValues[':ocrStatus'] = 'pending';
  }

  // Always update last_metadata_sync ("Proof of Life")
  updateExpressions.push('last_metadata_sync = :syncTime');
  expressionAttributeValues[':syncTime'] = syncTime;

  // Reset api_miss_count if needed (record found in API)
  if (resetMissCount) {
    updateExpressions.push('api_miss_count = :missCount');
    expressionAttributeValues[':missCount'] = 0;
  }

  // Always update updatedAt
  updateExpressions.push('updatedAt = :updatedAt');
  expressionAttributeValues[':updatedAt'] = syncTime;

  const params = {
    TableName: SUMMONS_TABLE,
    Key: { id },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeValues: expressionAttributeValues,
  };

  if (Object.keys(expressionAttributeNames).length > 0) {
    params.ExpressionAttributeNames = expressionAttributeNames;
  }

  await dynamodb.update(params).promise();
}

/**
 * Update only the last_metadata_sync timestamp (for records with no changes)
 * This is the "Proof of Life" update - shows the system checked this record
 */
async function updateMetadataSyncTimestamp(id, syncTime, flagForOCR = false, resetMissCount = false) {
  const updateExpressions = ['last_metadata_sync = :syncTime', 'updatedAt = :updatedAt'];
  const expressionAttributeValues = {
    ':syncTime': syncTime,
    ':updatedAt': syncTime,
  };

  if (flagForOCR) {
    updateExpressions.push('ocr_status = :ocrStatus');
    expressionAttributeValues[':ocrStatus'] = 'pending';
  }

  if (resetMissCount) {
    updateExpressions.push('api_miss_count = :missCount');
    expressionAttributeValues[':missCount'] = 0;
  }

  await dynamodb.update({
    TableName: SUMMONS_TABLE,
    Key: { id },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeValues: expressionAttributeValues,
  }).promise();
}

/**
 * Detect and handle "ghost" summons - records in our DB but missing from API
 * Uses 3-day grace period before archiving
 */
async function detectAndHandleGhostSummons(seenSummonsNumbers, syncTime) {
  const results = { warnings: 0, archived: 0 };

  // Get all active (non-archived) summons from our database
  const allActiveSummons = await fetchAllActiveSummons();

  for (const dbSummons of allActiveSummons) {
    // Check if this summons was seen in the API response
    if (!seenSummonsNumbers.has(dbSummons.summons_number)) {
      const missCount = (dbSummons.api_miss_count || 0) + 1;

      if (missCount < GHOST_GRACE_DAYS) {
        // Grace period - just increment counter
        await dynamodb.update({
          TableName: SUMMONS_TABLE,
          Key: { id: dbSummons.id },
          UpdateExpression: 'SET api_miss_count = :missCount, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':missCount': missCount,
            ':updatedAt': syncTime,
          },
        }).promise();
        console.log(`⚠ Ghost warning: ${dbSummons.summons_number} missing (${missCount}/${GHOST_GRACE_DAYS})`);
        results.warnings++;
      } else {
        // Archive the record
        const archiveReason = inferArchiveReason(dbSummons);
        const existingLog = dbSummons.activity_log || [];
        const updatedLog = [...existingLog, {
          date: syncTime,
          type: 'ARCHIVED',
          description: `Case archived: ${archiveReason} (missing from OATH API for ${GHOST_GRACE_DAYS}+ days)`,
          old_value: dbSummons.status || 'Unknown',
          new_value: 'ARCHIVED',
        }];

        await dynamodb.update({
          TableName: SUMMONS_TABLE,
          Key: { id: dbSummons.id },
          UpdateExpression: 'SET is_archived = :archived, archived_at = :archivedAt, archived_reason = :reason, api_miss_count = :missCount, activity_log = :log, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':archived': true,
            ':archivedAt': syncTime,
            ':reason': archiveReason,
            ':missCount': missCount,
            ':log': updatedLog,
            ':updatedAt': syncTime,
          },
        }).promise();
        console.log(`📦 Archived: ${dbSummons.summons_number} (${archiveReason})`);
        results.archived++;
      }
    }
  }

  return results;
}

/**
 * Infer why a record was archived based on its last known state
 */
function inferArchiveReason(summons) {
  const status = (summons.status || '').toUpperCase();

  if (status.includes('DISMISS')) return 'DISMISSED';
  if (summons.paid_amount >= summons.amount_due && summons.amount_due > 0) return 'PAID';
  if (summons.hearing_result && new Date(summons.hearing_date) < new Date()) return 'CASE_CLOSED';

  return 'API_MISSING';
}

/**
 * Fetch all active (non-archived) summons from database
 */
async function fetchAllActiveSummons() {
  const allRecords = [];
  let lastEvaluatedKey = null;

  do {
    const params = {
      TableName: SUMMONS_TABLE,
      FilterExpression: 'is_archived <> :archived OR attribute_not_exists(is_archived)',
      ExpressionAttributeValues: {
        ':archived': true,
      },
    };

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await dynamodb.scan(params).promise();
    allRecords.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return allRecords;
}

// ============================================================================
// PHASE 2: PRIORITY QUEUE OCR
// ============================================================================

/**
 * Phase 2: Process OCR requests using priority queue
 * - Fetches records with ocr_status = 'pending' (excluding max failures)
 * - Calculates TIERED PRIORITY SCORE for each
 * - Sorts by priority score (lower = higher priority)
 * - Processes up to remaining daily quota with throttling
 */
async function executePhase2PriorityOCR(remainingQuota = MAX_OCR_REQUESTS_PER_DAY) {
  const results = {
    pendingRecords: 0,
    recordsProcessed: 0,
    ocrSuccess: 0,
    ocrHealed: 0, // Records with partial data that were re-OCR'd
    ocrFailed: 0,
    ocrSkipped: 0,
    ocrExcludedMaxFailures: 0,
  };

  if (remainingQuota <= 0) {
    console.log('Daily OCR quota exhausted. Skipping Phase 2.');
    return results;
  }

  // Step 1: Fetch all pending OCR records (excluding max failures)
  const pendingRecords = await fetchPendingOCRRecords();

  // Filter out records that have exceeded max retry attempts
  const eligibleRecords = pendingRecords.filter(record => {
    const failureCount = record.ocr_failure_count || 0;
    if (failureCount >= MAX_OCR_FAILURES) {
      results.ocrExcludedMaxFailures++;
      return false;
    }
    return true;
  });

  results.pendingRecords = eligibleRecords.length;
  console.log(`Found ${pendingRecords.length} pending, ${eligibleRecords.length} eligible (${results.ocrExcludedMaxFailures} excluded due to max failures)`);

  if (eligibleRecords.length === 0) {
    console.log('No eligible OCR records. Phase 2 complete.');
    return results;
  }

  // Step 2: Calculate priority scores and sort
  const scoredRecords = eligibleRecords.map(record => ({
    ...record,
    priority_score: calculateTieredPriorityScore(record),
  }));

  // Sort by priority score (lower = higher priority)
  scoredRecords.sort((a, b) => a.priority_score - b.priority_score);
  console.log('Records sorted by tiered priority score (CRITICAL → URGENT → STANDARD → LOW → ARCHIVE)');

  // Step 3: Take up to remaining quota
  const recordsToProcess = scoredRecords.slice(0, remainingQuota);
  console.log(`Processing ${recordsToProcess.length} records (quota: ${remainingQuota})`);

  // Log priority breakdown
  logTieredPriorityBreakdown(recordsToProcess);

  // Step 4: Process with throttling
  for (let i = 0; i < recordsToProcess.length; i++) {
    const record = recordsToProcess[i];
    results.recordsProcessed++;

    // Safety check: Don't OCR if we already have data (immutability)
    if (hasExistingOCRData(record)) {
      console.log(`⊘ Skipped (already has data): ${record.summons_number}`);
      await markOCRComplete(record.id);
      results.ocrSkipped++;
      continue;
    }

    try {
      // Check if this record needs healing (has partial OCR data)
      const requiresHealing = needsOCRHealing(record);
      if (requiresHealing) {
        console.log(`[${i + 1}/${recordsToProcess.length}] HEALING: ${record.summons_number} (score: ${record.priority_score})`);
      } else {
        console.log(`[${i + 1}/${recordsToProcess.length}] Processing: ${record.summons_number} (score: ${record.priority_score})`);
      }

      // Invoke OCR with healing mode if needed
      const ocrResult = await invokeOCRExtractor(record, requiresHealing);

      if (ocrResult.success) {
        await markOCRComplete(record.id);
        if (ocrResult.skipped) {
          results.ocrSkipped++;
          console.log(`  ⊘ Skipped (already complete): ${record.summons_number}`);
        } else if (requiresHealing) {
          results.ocrHealed++;
          console.log(`  ✓ HEALED: ${record.summons_number}`);
        } else {
          results.ocrSuccess++;
          console.log(`  ✓ OCR complete: ${record.summons_number}`);
        }
      } else {
        // Increment failure count (will retry tomorrow if < max)
        await incrementOCRFailureCount(record.id, ocrResult.error);
        results.ocrFailed++;
        console.log(`  ✗ OCR failed (attempt ${(record.ocr_failure_count || 0) + 1}/${MAX_OCR_FAILURES}): ${record.summons_number}`);
      }
    } catch (error) {
      await incrementOCRFailureCount(record.id, error.message);
      results.ocrFailed++;
      console.error(`  ✗ OCR error (attempt ${(record.ocr_failure_count || 0) + 1}/${MAX_OCR_FAILURES}): ${record.summons_number} - ${error.message}`);
    }

    // Throttle: Wait 2 seconds between requests (except for last one)
    if (i < recordsToProcess.length - 1) {
      await sleep(OCR_THROTTLE_MS);
    }
  }

  return results;
}

/**
 * TIERED PRIORITY SCORING ALGORITHM
 *
 * Lower score = Higher priority
 *
 * TIER 1 (0-99): CRITICAL - Hearing within 7 days
 * TIER 2 (100-199): URGENT - Hearing within 30 days
 * TIER 3 (200-299): STANDARD - Hearing 30-90 days out
 * TIER 4 (300-399): LOW - Hearing 90+ days out
 * TIER 5 (400+): ARCHIVE - Past hearings
 *
 * Modifiers:
 * - New records (< 24h): -20 bonus
 * - High balance (> $1000): -10 bonus
 * - Previous failures: +50 penalty per failure
 */
function calculateTieredPriorityScore(summons) {
  const now = new Date();
  const hearingDate = summons.hearing_date ? new Date(summons.hearing_date) : null;

  let baseScore;

  if (!hearingDate) {
    // No hearing date - treat as archive
    baseScore = 450;
  } else {
    const daysUntilHearing = Math.floor((hearingDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntilHearing >= 0 && daysUntilHearing <= 7) {
      // TIER 1: CRITICAL - Hearing within 7 days
      // Score 0-70 (closer = lower score = higher priority)
      baseScore = daysUntilHearing * 10;
    } else if (daysUntilHearing > 7 && daysUntilHearing <= 30) {
      // TIER 2: URGENT - Hearing 8-30 days out
      // Score 100-130
      baseScore = 100 + (daysUntilHearing - 7);
    } else if (daysUntilHearing > 30 && daysUntilHearing <= 90) {
      // TIER 3: STANDARD - Hearing 31-90 days out
      // Score 200-260
      baseScore = 200 + Math.floor((daysUntilHearing - 30) / 2);
    } else if (daysUntilHearing > 90) {
      // TIER 4: LOW - Hearing 90+ days out
      // Score 300-399 (capped)
      baseScore = Math.min(399, 300 + Math.floor((daysUntilHearing - 90) / 3));
    } else {
      // TIER 5: ARCHIVE - Past hearings (negative days)
      // Score 400+ (more recent past = slightly lower)
      const daysPast = Math.abs(daysUntilHearing);
      baseScore = 400 + Math.min(100, daysPast);
    }
  }

  // MODIFIERS

  // Bonus: New records get -20 (prioritize new discoveries)
  if (summons.createdAt) {
    const hoursSinceCreation = (now - new Date(summons.createdAt)) / (1000 * 60 * 60);
    if (hoursSinceCreation <= 24) {
      baseScore -= 20;
    }
  }

  // Bonus: High balance cases get -10 (prioritize expensive tickets)
  if ((summons.amount_due || 0) > 1000) {
    baseScore -= 10;
  }

  // Penalty: Previous failures get +50 per failure (avoid retry storms)
  const failureCount = summons.ocr_failure_count || 0;
  if (failureCount > 0) {
    baseScore += failureCount * 50;
  }

  return Math.max(0, baseScore); // Never negative
}

/**
 * Fetch all records with ocr_status = 'pending' (non-archived)
 */
async function fetchPendingOCRRecords() {
  const allRecords = [];
  let lastEvaluatedKey = null;

  do {
    const params = {
      TableName: SUMMONS_TABLE,
      FilterExpression: '(ocr_status = :pending OR (attribute_not_exists(ocr_status) AND attribute_not_exists(violation_narrative))) AND (is_archived <> :archived OR attribute_not_exists(is_archived))',
      ExpressionAttributeValues: {
        ':pending': 'pending',
        ':archived': true,
      },
    };

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await dynamodb.scan(params).promise();
    allRecords.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return allRecords;
}

/**
 * Log the tiered priority breakdown of records being processed
 */
function logTieredPriorityBreakdown(records) {
  let critical = 0, urgent = 0, standard = 0, low = 0, archive = 0;

  records.forEach((record) => {
    const score = record.priority_score;
    if (score < 100) critical++;
    else if (score < 200) urgent++;
    else if (score < 300) standard++;
    else if (score < 400) low++;
    else archive++;
  });

  console.log('\nTiered Priority Breakdown:');
  console.log(`  TIER 1 - CRITICAL (≤7 days):    ${critical}`);
  console.log(`  TIER 2 - URGENT (8-30 days):    ${urgent}`);
  console.log(`  TIER 3 - STANDARD (31-90 days): ${standard}`);
  console.log(`  TIER 4 - LOW (90+ days):        ${low}`);
  console.log(`  TIER 5 - ARCHIVE (past):        ${archive}`);
  console.log('');
}

/**
 * Increment OCR failure count for a record
 */
async function incrementOCRFailureCount(id, errorReason) {
  await dynamodb.update({
    TableName: SUMMONS_TABLE,
    Key: { id },
    UpdateExpression: 'SET ocr_failure_count = if_not_exists(ocr_failure_count, :zero) + :inc, ocr_failure_reason = :reason, last_ocr_attempt = :attempt, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':zero': 0,
      ':inc': 1,
      ':reason': errorReason || 'Unknown error',
      ':attempt': new Date().toISOString(),
      ':updatedAt': new Date().toISOString(),
    },
  }).promise();
}

/**
 * Check if record already has OCR data (safety check)
 */
function hasExistingOCRData(record) {
  return !!(
    record.violation_narrative &&
    record.violation_narrative.length > 0
  );
}

/**
 * Check if a record needs healing (has partial OCR data)
 * A record needs healing if it has violation_narrative but is missing key fields
 */
function needsOCRHealing(record) {
  const hasNarrative = record.violation_narrative && record.violation_narrative.length > 0;
  const missingIdNumber = !record.id_number;
  const missingLicensePlate = !record.license_plate_ocr;

  return hasNarrative && (missingIdNumber || missingLicensePlate);
}

/**
 * Invoke the OCR extractor Lambda synchronously
 * @param {Object} record - The summons record to process
 * @param {boolean} healingMode - If true, allows re-OCR on partial records
 */
async function invokeOCRExtractor(record, healingMode = false) {
  try {
    const payload = {
      summons_id: record.id,
      summons_number: record.summons_number,
      pdf_link: record.summons_pdf_link,
      video_link: record.video_link,
      violation_date: record.violation_date,
      synchronous: true, // Tell extractor to return result
      healingMode: healingMode, // Backend flag for partial record healing
    };

    const params = {
      FunctionName: DATA_EXTRACTOR_FUNCTION,
      InvocationType: 'RequestResponse', // Synchronous for Phase 2
      Payload: JSON.stringify(payload),
    };

    const result = await lambda.invoke(params).promise();
    const response = JSON.parse(result.Payload);

    if (response.statusCode === 200) {
      // Parse the body to check if OCR data was actually extracted
      const body = JSON.parse(response.body || '{}');
      if (body.hasOCRData || body.skipped) {
        // Success: either new OCR data extracted or record was safely skipped
        return { success: true, skipped: body.skipped || false };
      } else {
        // statusCode 200 but no OCR data (e.g., quota exceeded, extraction failed)
        return { success: false, error: body.message || 'No OCR data extracted' };
      }
    } else {
      return { success: false, error: response.body || 'Unknown error' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Mark a record as OCR complete
 */
async function markOCRComplete(id) {
  await dynamodb.update({
    TableName: SUMMONS_TABLE,
    Key: { id },
    UpdateExpression: 'SET ocr_status = :status, last_scan_date = :scanDate, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':status': 'complete',
      ':scanDate': new Date().toISOString(),
      ':updatedAt': new Date().toISOString(),
    },
  }).promise();
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fetch all clients from DynamoDB
 */
async function fetchAllClients() {
  try {
    const result = await dynamodb.scan({ TableName: CLIENTS_TABLE }).promise();
    return result.Items || [];
  } catch (error) {
    console.error('Error fetching clients:', error);
    throw new Error(`Failed to fetch clients: ${error.message}`);
  }
}

/**
 * Normalize a company name for fuzzy matching
 */
function normalizeCompanyName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*(llc|inc|corp|co|ltd|l\.l\.c\.|i\.n\.c\.)\s*$/i, '')
    .trim();
}

/**
 * Build a map of client names (including AKAs) to client objects
 */
function buildClientNameMap(clients) {
  const nameMap = new Map();

  clients.forEach((client) => {
    const primaryName = normalizeCompanyName(client.name);
    nameMap.set(primaryName, client);

    const noSpaceName = primaryName.replace(/\s/g, '');
    if (noSpaceName !== primaryName) {
      nameMap.set(noSpaceName, client);
    }

    if (client.akas && Array.isArray(client.akas)) {
      client.akas.forEach((aka) => {
        const akaName = normalizeCompanyName(aka);
        nameMap.set(akaName, client);
        const akaNoSpace = akaName.replace(/\s/g, '');
        if (akaNoSpace !== akaName) {
          nameMap.set(akaNoSpace, client);
        }
      });
    }
  });

  return nameMap;
}

/**
 * Fetch OATH summonses from NYC Open Data API for specific client names
 */
async function fetchNYCDataForClients(clients) {
  const allSummonses = [];
  const seenTickets = new Set();

  const headers = {
    'X-App-Token': NYC_API_TOKEN,
    'Content-Type': 'application/json',
  };

  // Build unique search terms from client names and AKAs
  const searchTerms = new Set();
  clients.forEach(client => {
    const mainName = client.name.replace(/\s+(llc|inc|corp|co|ltd)\.?$/i, '').trim();
    if (mainName.length > 3) searchTerms.add(mainName.toUpperCase());

    if (client.akas && Array.isArray(client.akas)) {
      client.akas.forEach(aka => {
        const akaMain = aka.replace(/\s+(llc|inc|corp|co|ltd)\.?$/i, '').trim();
        if (akaMain.length > 3) searchTerms.add(akaMain.toUpperCase());
      });
    }
  });

  console.log(`Searching for ${searchTerms.size} unique client name patterns...`);

  for (const searchTerm of searchTerms) {
    try {
      const url = new URL(NYC_API_URL);
      url.searchParams.append('$limit', 500);
      const escapedTerm = searchTerm.replace(/'/g, "''");
      url.searchParams.append('$where', `upper(respondent_last_name) like '%${escapedTerm}%'`);

      const response = await fetch(url.toString(), { headers });

      if (!response.ok) {
        console.error(`NYC API error for "${searchTerm}": ${response.status}`);
        continue;
      }

      const data = await response.json();

      for (const summons of data) {
        if (!seenTickets.has(summons.ticket_number)) {
          seenTickets.add(summons.ticket_number);
          allSummonses.push(summons);
        }
      }

      console.log(`  Found ${data.length} for "${searchTerm}"`);
    } catch (error) {
      console.error(`Error querying for "${searchTerm}":`, error.message);
    }
  }

  return allSummonses;
}

/**
 * Find existing summons by summons_number
 */
async function findExistingSummons(summonsNumber) {
  try {
    const params = {
      TableName: SUMMONS_TABLE,
      IndexName: 'bySummonsNumber',
      KeyConditionExpression: 'summons_number = :summonsNumber',
      ExpressionAttributeValues: {
        ':summonsNumber': summonsNumber,
      },
    };

    const result = await dynamodb.query(params).promise();
    return result.Items && result.Items.length > 0 ? result.Items[0] : null;
  } catch (error) {
    console.error('Error finding existing summons:', error);
    throw error;
  }
}

/**
 * Create a new summons record
 */
async function createSummons(summons) {
  try {
    await dynamodb.put({
      TableName: SUMMONS_TABLE,
      Item: summons,
    }).promise();
  } catch (error) {
    console.error('Error creating summons:', error);
    throw new Error(`Failed to create summons: ${error.message}`);
  }
}

/**
 * Normalize amount values
 */
function normalizeAmount(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Ensure date is in proper ISO format
 */
function ensureISOFormat(dateString) {
  if (!dateString) return null;
  if (dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString)) {
    return dateString;
  }
  return `${dateString}Z`;
}

/**
 * Calculate changes between existing and incoming records
 * Now generates activity log entries for audit trail
 *
 * Activity Log Types:
 * - STATUS_CHANGE: Case status changed (e.g., PENDING → DEFAULT)
 * - RESCHEDULE: Hearing date changed (adjournment/reschedule)
 * - RESULT_CHANGE: Hearing result changed (e.g., Pending → GUILTY)
 * - AMOUNT_CHANGE: Balance due or paid amount changed
 * - VIOLATION_CHANGE: Violation code/description changed (possible amendment)
 */
function calculateChangesWithActivityLog(existingRecord, incomingData) {
  const changes = [];
  const activityEntries = [];
  const now = new Date().toISOString();

  // Helper to format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return 'None';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Check 1: Status Change
  const oldStatus = existingRecord.status || 'Unknown';
  const newStatus = incomingData.status || 'Unknown';
  if (oldStatus !== newStatus) {
    changes.push(`Status: '${oldStatus}' → '${newStatus}'`);
    activityEntries.push({
      date: now,
      type: 'STATUS_CHANGE',
      description: `Status changed from "${oldStatus}" to "${newStatus}"`,
      old_value: oldStatus,
      new_value: newStatus,
    });
  }

  // Check 2: Hearing Date Change (Reschedule/Adjournment)
  const oldDate = existingRecord.hearing_date ? ensureISOFormat(existingRecord.hearing_date) : null;
  const newDate = incomingData.hearing_date;
  if (oldDate !== newDate) {
    const oldDateDisplay = formatDate(oldDate);
    const newDateDisplay = formatDate(newDate);
    changes.push(`Hearing: ${oldDateDisplay} → ${newDateDisplay}`);
    activityEntries.push({
      date: now,
      type: 'RESCHEDULE',
      description: `Hearing rescheduled from ${oldDateDisplay} to ${newDateDisplay}`,
      old_value: oldDate,
      new_value: newDate,
    });
  }

  // Check 3: Hearing Result Change
  const oldResult = existingRecord.hearing_result || '';
  const newResult = incomingData.hearing_result || '';
  if (oldResult !== newResult) {
    const oldDisplay = oldResult || 'Pending';
    const newDisplay = newResult || 'Pending';
    changes.push(`Result: '${oldDisplay}' → '${newDisplay}'`);
    activityEntries.push({
      date: now,
      type: 'RESULT_CHANGE',
      description: `Hearing result: "${oldDisplay}" → "${newDisplay}"`,
      old_value: oldDisplay,
      new_value: newDisplay,
    });
  }

  // Check 4: Amount Due Change
  const oldAmount = normalizeAmount(existingRecord.amount_due);
  const newAmount = normalizeAmount(incomingData.amount_due);
  if (oldAmount.toFixed(2) !== newAmount.toFixed(2)) {
    changes.push(`Amount Due: $${oldAmount.toFixed(2)} → $${newAmount.toFixed(2)}`);
    activityEntries.push({
      date: now,
      type: 'AMOUNT_CHANGE',
      description: `Balance due changed from $${oldAmount.toFixed(2)} to $${newAmount.toFixed(2)}`,
      old_value: `$${oldAmount.toFixed(2)}`,
      new_value: `$${newAmount.toFixed(2)}`,
    });
  }

  // Check 5: Paid Amount Change
  const oldPaid = normalizeAmount(existingRecord.paid_amount);
  const newPaid = normalizeAmount(incomingData.paid_amount);
  if (oldPaid.toFixed(2) !== newPaid.toFixed(2)) {
    changes.push(`Paid: $${oldPaid.toFixed(2)} → $${newPaid.toFixed(2)}`);
    activityEntries.push({
      date: now,
      type: 'PAYMENT',
      description: `Payment recorded: $${oldPaid.toFixed(2)} → $${newPaid.toFixed(2)}`,
      old_value: `$${oldPaid.toFixed(2)}`,
      new_value: `$${newPaid.toFixed(2)}`,
    });
  }

  // Check 6: Violation Code Change (Possible Amendment)
  const oldCode = existingRecord.code_description || '';
  const newCode = incomingData.code_description || '';
  if (oldCode && newCode && oldCode !== newCode) {
    changes.push(`Violation: '${oldCode}' → '${newCode}'`);
    activityEntries.push({
      date: now,
      type: 'AMENDMENT',
      description: `Violation amended: "${oldCode}" → "${newCode}"`,
      old_value: oldCode,
      new_value: newCode,
    });
  }

  return {
    hasChanges: changes.length > 0,
    summary: changes.join('; '),
    activityEntries,
  };
}

/**
 * Generate a UUID
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// SYNC STATUS FUNCTIONS
// ============================================================================

/**
 * Update the global SyncStatus record
 * Uses singleton pattern with id = "GLOBAL"
 */
async function updateSyncStatus(updates) {
  const updateExpressions = [];
  const expressionAttributeValues = {};
  const expressionAttributeNames = {};

  Object.entries(updates).forEach(([key, value], index) => {
    const attrName = `#attr${index}`;
    const attrValue = `:val${index}`;

    // Handle reserved words
    if (key === 'status') {
      expressionAttributeNames[attrName] = key;
      updateExpressions.push(`${attrName} = ${attrValue}`);
    } else {
      updateExpressions.push(`${key} = ${attrValue}`);
    }
    expressionAttributeValues[attrValue] = value;
  });

  // Add updatedAt
  updateExpressions.push('updatedAt = :updatedAt');
  expressionAttributeValues[':updatedAt'] = new Date().toISOString();

  const params = {
    TableName: SYNC_STATUS_TABLE,
    Key: { id: 'GLOBAL' },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeValues: expressionAttributeValues,
  };

  if (Object.keys(expressionAttributeNames).length > 0) {
    params.ExpressionAttributeNames = expressionAttributeNames;
  }

  try {
    await dynamodb.update(params).promise();
  } catch (error) {
    // If record doesn't exist, create it
    if (error.code === 'ValidationException') {
      await dynamodb.put({
        TableName: SYNC_STATUS_TABLE,
        Item: {
          id: 'GLOBAL',
          ...updates,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }).promise();
    } else {
      console.error('Error updating sync status:', error);
      throw error;
    }
  }
}

/**
 * Get or reset the daily OCR counter
 * Resets to 0 if the date has changed since last processing
 */
async function getOrResetDailyOCRCounter() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    const result = await dynamodb.get({
      TableName: SYNC_STATUS_TABLE,
      Key: { id: 'GLOBAL' },
    }).promise();

    const syncStatus = result.Item;

    if (!syncStatus) {
      // Create initial record
      await dynamodb.put({
        TableName: SYNC_STATUS_TABLE,
        Item: {
          id: 'GLOBAL',
          ocr_processed_today: 0,
          ocr_processing_date: today,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }).promise();
      return { ocr_processed_today: 0, ocr_processing_date: today };
    }

    // Check if we need to reset the counter (new day)
    if (syncStatus.ocr_processing_date !== today) {
      console.log(`Resetting OCR counter for new day: ${today}`);
      await dynamodb.update({
        TableName: SYNC_STATUS_TABLE,
        Key: { id: 'GLOBAL' },
        UpdateExpression: 'SET ocr_processed_today = :zero, ocr_processing_date = :today, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':zero': 0,
          ':today': today,
          ':updatedAt': new Date().toISOString(),
        },
      }).promise();
      return { ocr_processed_today: 0, ocr_processing_date: today };
    }

    return {
      ocr_processed_today: syncStatus.ocr_processed_today || 0,
      ocr_processing_date: syncStatus.ocr_processing_date || today,
    };
  } catch (error) {
    console.error('Error getting OCR counter:', error);
    // Return safe defaults
    return { ocr_processed_today: 0, ocr_processing_date: today };
  }
}
