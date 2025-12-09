/**
 * Shared Summons Type Definitions
 * 
 * Centralized type definitions for the NYC OATH Summons Tracker application.
 * These types match the GraphQL schema and are used across all components.
 * 
 * @module types/summons
 */

/**
 * Summons interface matching the GraphQL schema
 * All fields correspond to the DynamoDB table structure via Amplify
 */
/**
 * Attribution data for tracking who performed an action and when
 * Used for audit trails on evidence tracking checkboxes and fields
 */
export interface AttributionData {
  completed: boolean;
  by?: string;       // User name who performed the action
  userId?: string;   // User ID for reference
  date?: string;     // ISO timestamp of when action was performed
}

/**
 * DEP File Date attribution (includes the date value itself)
 */
export interface DepFileDateAttribution {
  value?: string;    // The DEP file creation date (ISO string)
  by?: string;       // User name who updated this field
  userId?: string;   // User ID for reference
  date?: string;     // ISO timestamp of when field was updated
}

export interface Summons {
  id: string;
  clientID: string;
  summons_number: string;
  respondent_name: string;
  hearing_date: string;
  hearing_time?: string;
  hearing_result?: string;
  status: string;
  license_plate: string;
  base_fine: number;
  amount_due: number;
  paid_amount?: number;
  penalty_imposed?: number;
  violation_date: string;
  violation_time?: string;
  violation_location: string;
  code_description?: string;
  summons_pdf_link: string;
  video_link: string;
  video_created_date?: string;
  lag_days?: number;
  notes?: string;
  // Legacy boolean fields (kept for backward compatibility)
  added_to_calendar: boolean;
  evidence_reviewed: boolean;
  evidence_requested: boolean;
  evidence_requested_date?: string;
  evidence_received: boolean;
  // New attribution-enabled evidence tracking fields
  evidence_reviewed_attr?: AttributionData;
  added_to_calendar_attr?: AttributionData;
  evidence_requested_attr?: AttributionData;
  evidence_received_attr?: AttributionData;
  // DEP File Date with attribution (for delay tracking)
  dep_file_date_attr?: DepFileDateAttribution;
  license_plate_ocr?: string;
  /** @deprecated Use id_number instead */
  dep_id?: string;
  /** ID Number / DEP Complaint Number in format YYYY-NNNNNN (e.g., 2025-030846) */
  id_number?: string;
  vehicle_type_ocr?: string;
  prior_offense_status?: string;
  violation_narrative?: string;
  idling_duration_ocr?: string;
  critical_flags_ocr?: string[];
  name_on_summons_ocr?: string;
  // TRD v1.8: Client Feedback Updates
  internal_status?: string;
  offense_level?: string;
  agency_id_number?: string;
  // Change Tracking (for UPDATED badge transparency)
  last_change_summary?: string;
  last_change_at?: string;
  // OCR Processing Status (for Priority Queue Strategy)
  ocr_status?: 'pending' | 'complete' | 'failed';
  last_scan_date?: string;
  ocr_failure_count?: number;
  ocr_failure_reason?: string;
  // Sync Tracking ("Proof of Life")
  last_metadata_sync?: string;
  // Ghost Detection
  api_miss_count?: number;
  is_archived?: boolean;
  archived_at?: string;
  archived_reason?: string;
  // Activity Log (Summons Lifecycle Audit)
  activity_log?: ActivityLogEntry[];
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
  __typename?: string;
}

/**
 * Activity Log Entry for Summons Lifecycle Audit
 *
 * Types:
 * - CREATED: Summons first discovered and added
 * - STATUS_CHANGE: Case status changed (e.g., PENDING → DEFAULT)
 * - RESCHEDULE: Hearing date changed (adjournment/reschedule)
 * - RESULT_CHANGE: Hearing result changed (e.g., Pending → GUILTY)
 * - AMOUNT_CHANGE: Balance due changed
 * - PAYMENT: Payment recorded
 * - AMENDMENT: Violation code/description changed
 * - OCR_COMPLETE: Document scan completed
 * - ARCHIVED: Record archived (missing from API or case closed)
 */
export interface ActivityLogEntry {
  date: string;
  type: 'CREATED' | 'STATUS_CHANGE' | 'RESCHEDULE' | 'RESULT_CHANGE' | 'AMOUNT_CHANGE' | 'PAYMENT' | 'AMENDMENT' | 'OCR_COMPLETE' | 'ARCHIVED';
  description: string;
  old_value: string | null;
  new_value: string | null;
}

/**
 * Client interface matching the GraphQL schema
 */
export interface Client {
  id: string;
  name: string;
  akas?: string[];
  contact_name?: string;
  contact_address?: string;
  contact_phone1?: string;
  contact_email1?: string;
  contact_phone2?: string;
  contact_email2?: string;
  createdAt?: string;
  updatedAt?: string;
  __typename?: string;
}

/**
 * SyncStatus interface for "Proof of Life" tracking
 * Provides data freshness indicators for the frontend header
 */
export interface SyncStatus {
  id: string;
  // Overall Sync Status
  last_successful_sync?: string;
  last_sync_attempt?: string;
  sync_in_progress?: boolean;
  // Phase 1 Results
  phase1_status?: 'success' | 'partial' | 'failed';
  phase1_completed_at?: string;
  phase1_new_records?: number;
  phase1_updated_records?: number;
  phase1_unchanged_records?: number;
  // Phase 2 Results
  phase2_status?: 'success' | 'partial' | 'failed';
  phase2_completed_at?: string;
  phase2_ocr_processed?: number;
  phase2_ocr_remaining?: number;
  phase2_ocr_failed?: number;
  // Daily OCR Counter
  ocr_processed_today?: number;
  ocr_processing_date?: string;
  // API Health
  oath_api_reachable?: boolean;
  oath_api_last_check?: string;
  oath_api_error?: string;
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Activity filter type for NEW/UPDATED badges
 */
export type ActivityFilter = 'all' | 'updated' | 'new';

/**
 * Deadline filter type for summary cards
 */
export type DeadlineFilter = 'critical' | 'approaching' | 'hearing_complete' | 'evidence_pending' | null;

/**
 * Check if a summons is a new record (created within last 72 hours)
 * Brand new: created within last 72 hours AND createdAt matches updatedAt (never updated)
 * 
 * TRD v1.9: 72-hour window ensures Arthur sees Friday afternoon updates on Monday morning.
 */
export function isNewRecord(summons: Summons): boolean {
  if (!summons.createdAt || !summons.updatedAt) return false;

  const createdDate = new Date(summons.createdAt);
  const updatedDate = new Date(summons.updatedAt);
  const now = new Date();
  const hoursSinceCreation = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);

  // Brand new: created within last 72 hours AND createdAt matches updatedAt (never updated)
  const createdTimeStr = createdDate.toISOString().slice(0, 16);
  const updatedTimeStr = updatedDate.toISOString().slice(0, 16);
  return hoursSinceCreation <= 72 && createdTimeStr === updatedTimeStr;
}

/**
 * Check if a summons was recently updated BY THE DAILY SWEEP (not manual user edits)
 *
 * Uses last_change_at (set by daily sweep when NYC API changes detected) instead of
 * updatedAt (which updates on any change including user notes/checkboxes).
 *
 * TRD v1.9: 72-hour window ensures Arthur sees Friday afternoon updates on Monday morning.
 */
export function isUpdatedRecord(summons: Summons): boolean {
  // Use last_change_at which is only set by the daily sweep when API changes are detected
  // This excludes manual user edits (notes, checkboxes) from triggering the UPDATED badge
  if (!summons.last_change_at) return false;

  // Must not be a new record (new records get NEW badge, not UPDATED)
  if (isNewRecord(summons)) return false;

  const lastChangeDate = new Date(summons.last_change_at);
  const now = new Date();
  const hoursSinceChange = (now.getTime() - lastChangeDate.getTime()) / (1000 * 60 * 60);

  // Show UPDATED badge if daily sweep detected changes within last 72 hours
  return hoursSinceChange <= 72;
}

/**
 * Check if a summons is "fresh" (new or updated in last 72 hours)
 */
export function isFreshSummons(summons: Summons): boolean {
  return isNewRecord(summons) || isUpdatedRecord(summons);
}

/**
 * Calculate the number of business days (weekdays) between two dates
 * 
 * TRD v1.8: Business Day Logic - Excludes weekends (Saturday and Sunday)
 * Used for deadline calculations to match firm's business operations.
 */
export function getBusinessDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);

  // Normalize time to avoid time zone issues
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    // Count if it's a weekday (1 = Monday, 5 = Friday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Get MUI color for Status chip based on text value
 * 
 * Implements "Don't Make Me Think" principle via visual signaling:
 * - Red (error): DEFAULT JUDGMENT, DOCKETED - urgent action required
 * - Blue (info): SCHEDULED/HEARING - active case
 * - Green (success): DISMISSED/CLOSED/PAID IN FULL - completed case
 * - Gray (default): Unknown status
 */
export function getStatusColor(status: string): 'error' | 'info' | 'success' | 'default' {
  const statusUpper = status?.toUpperCase() || '';
  // Red: Danger statuses requiring urgent attention
  if (statusUpper.includes('DEFAULT') || statusUpper.includes('JUDGMENT') || statusUpper.includes('VIOLATION') || statusUpper.includes('DOCKETED')) return 'error';
  // Green: Resolved/completed statuses (PAID IN FULL = emerald green via success)
  if (statusUpper.includes('DISMISS') || statusUpper.includes('CLOSED') || statusUpper.includes('PAID')) return 'success';
  // Blue: Active case statuses
  if (statusUpper.includes('SCHEDULED') || statusUpper.includes('HEARING') || statusUpper.includes('RESCHEDULED')) return 'info';
  return 'default';
}

