/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const onCreateClient = /* GraphQL */ `
  subscription OnCreateClient($filter: ModelSubscriptionClientFilterInput) {
    onCreateClient(filter: $filter) {
      id
      name
      akas
      contact_name
      contact_address
      contact_phone1
      contact_email1
      contact_phone2
      contact_email2
      summonses {
        nextToken
        __typename
      }
      createdAt
      updatedAt
      __typename
    }
  }
`;
export const onUpdateClient = /* GraphQL */ `
  subscription OnUpdateClient($filter: ModelSubscriptionClientFilterInput) {
    onUpdateClient(filter: $filter) {
      id
      name
      akas
      contact_name
      contact_address
      contact_phone1
      contact_email1
      contact_phone2
      contact_email2
      summonses {
        nextToken
        __typename
      }
      createdAt
      updatedAt
      __typename
    }
  }
`;
export const onDeleteClient = /* GraphQL */ `
  subscription OnDeleteClient($filter: ModelSubscriptionClientFilterInput) {
    onDeleteClient(filter: $filter) {
      id
      name
      akas
      contact_name
      contact_address
      contact_phone1
      contact_email1
      contact_phone2
      contact_email2
      summonses {
        nextToken
        __typename
      }
      createdAt
      updatedAt
      __typename
    }
  }
`;
export const onCreateSummons = /* GraphQL */ `
  subscription OnCreateSummons($filter: ModelSubscriptionSummonsFilterInput) {
    onCreateSummons(filter: $filter) {
      id
      clientID
      client {
        id
        name
        akas
        contact_name
        contact_address
        contact_phone1
        contact_email1
        contact_phone2
        contact_email2
        createdAt
        updatedAt
        __typename
      }
      summons_number
      respondent_name
      hearing_date
      hearing_time
      hearing_result
      status
      code_description
      violation_date
      violation_time
      violation_location
      license_plate
      base_fine
      amount_due
      paid_amount
      penalty_imposed
      summons_pdf_link
      video_link
      video_created_date
      lag_days
      notes
      notes_comments
      added_to_calendar
      evidence_reviewed
      evidence_requested
      evidence_requested_date
      evidence_received
      internal_status
      internal_status_attr
      offense_level
      agency_id_number
      last_change_summary
      last_change_at
      id_number
      license_plate_ocr
      vehicle_type_ocr
      prior_offense_status
      violation_narrative
      idling_duration_ocr
      critical_flags_ocr
      name_on_summons_ocr
      ocr_status
      last_scan_date
      ocr_failure_count
      ocr_failure_reason
      last_metadata_sync
      api_miss_count
      is_archived
      archived_at
      archived_reason
      activity_log
      createdAt
      updatedAt
      __typename
    }
  }
`;
export const onUpdateSummons = /* GraphQL */ `
  subscription OnUpdateSummons($filter: ModelSubscriptionSummonsFilterInput) {
    onUpdateSummons(filter: $filter) {
      id
      clientID
      client {
        id
        name
        akas
        contact_name
        contact_address
        contact_phone1
        contact_email1
        contact_phone2
        contact_email2
        createdAt
        updatedAt
        __typename
      }
      summons_number
      respondent_name
      hearing_date
      hearing_time
      hearing_result
      status
      code_description
      violation_date
      violation_time
      violation_location
      license_plate
      base_fine
      amount_due
      paid_amount
      penalty_imposed
      summons_pdf_link
      video_link
      video_created_date
      lag_days
      notes
      notes_comments
      added_to_calendar
      evidence_reviewed
      evidence_requested
      evidence_requested_date
      evidence_received
      internal_status
      internal_status_attr
      offense_level
      agency_id_number
      last_change_summary
      last_change_at
      id_number
      license_plate_ocr
      vehicle_type_ocr
      prior_offense_status
      violation_narrative
      idling_duration_ocr
      critical_flags_ocr
      name_on_summons_ocr
      ocr_status
      last_scan_date
      ocr_failure_count
      ocr_failure_reason
      last_metadata_sync
      api_miss_count
      is_archived
      archived_at
      archived_reason
      activity_log
      createdAt
      updatedAt
      __typename
    }
  }
`;
export const onDeleteSummons = /* GraphQL */ `
  subscription OnDeleteSummons($filter: ModelSubscriptionSummonsFilterInput) {
    onDeleteSummons(filter: $filter) {
      id
      clientID
      client {
        id
        name
        akas
        contact_name
        contact_address
        contact_phone1
        contact_email1
        contact_phone2
        contact_email2
        createdAt
        updatedAt
        __typename
      }
      summons_number
      respondent_name
      hearing_date
      hearing_time
      hearing_result
      status
      code_description
      violation_date
      violation_time
      violation_location
      license_plate
      base_fine
      amount_due
      paid_amount
      penalty_imposed
      summons_pdf_link
      video_link
      video_created_date
      lag_days
      notes
      notes_comments
      added_to_calendar
      evidence_reviewed
      evidence_requested
      evidence_requested_date
      evidence_received
      internal_status
      internal_status_attr
      offense_level
      agency_id_number
      last_change_summary
      last_change_at
      id_number
      license_plate_ocr
      vehicle_type_ocr
      prior_offense_status
      violation_narrative
      idling_duration_ocr
      critical_flags_ocr
      name_on_summons_ocr
      ocr_status
      last_scan_date
      ocr_failure_count
      ocr_failure_reason
      last_metadata_sync
      api_miss_count
      is_archived
      archived_at
      archived_reason
      activity_log
      createdAt
      updatedAt
      __typename
    }
  }
`;
export const onCreateSyncStatus = /* GraphQL */ `
  subscription OnCreateSyncStatus(
    $filter: ModelSubscriptionSyncStatusFilterInput
  ) {
    onCreateSyncStatus(filter: $filter) {
      id
      last_successful_sync
      last_sync_attempt
      sync_in_progress
      phase1_status
      phase1_completed_at
      phase1_new_records
      phase1_updated_records
      phase1_unchanged_records
      phase1_errors
      phase2_status
      phase2_completed_at
      phase2_ocr_processed
      phase2_ocr_remaining
      phase2_ocr_failed
      ocr_processed_today
      ocr_processing_date
      oath_api_reachable
      oath_api_last_check
      oath_api_error
      createdAt
      updatedAt
      __typename
    }
  }
`;
export const onUpdateSyncStatus = /* GraphQL */ `
  subscription OnUpdateSyncStatus(
    $filter: ModelSubscriptionSyncStatusFilterInput
  ) {
    onUpdateSyncStatus(filter: $filter) {
      id
      last_successful_sync
      last_sync_attempt
      sync_in_progress
      phase1_status
      phase1_completed_at
      phase1_new_records
      phase1_updated_records
      phase1_unchanged_records
      phase1_errors
      phase2_status
      phase2_completed_at
      phase2_ocr_processed
      phase2_ocr_remaining
      phase2_ocr_failed
      ocr_processed_today
      ocr_processing_date
      oath_api_reachable
      oath_api_last_check
      oath_api_error
      createdAt
      updatedAt
      __typename
    }
  }
`;
export const onDeleteSyncStatus = /* GraphQL */ `
  subscription OnDeleteSyncStatus(
    $filter: ModelSubscriptionSyncStatusFilterInput
  ) {
    onDeleteSyncStatus(filter: $filter) {
      id
      last_successful_sync
      last_sync_attempt
      sync_in_progress
      phase1_status
      phase1_completed_at
      phase1_new_records
      phase1_updated_records
      phase1_unchanged_records
      phase1_errors
      phase2_status
      phase2_completed_at
      phase2_ocr_processed
      phase2_ocr_remaining
      phase2_ocr_failed
      ocr_processed_today
      ocr_processing_date
      oath_api_reachable
      oath_api_last_check
      oath_api_error
      createdAt
      updatedAt
      __typename
    }
  }
`;
