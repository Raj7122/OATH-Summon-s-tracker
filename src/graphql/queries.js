/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const getClient = /* GraphQL */ `
  query GetClient($id: ID!) {
    getClient(id: $id) {
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
export const listClients = /* GraphQL */ `
  query ListClients(
    $filter: ModelClientFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listClients(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
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
      nextToken
      __typename
    }
  }
`;
export const getSummons = /* GraphQL */ `
  query GetSummons($id: ID!) {
    getSummons(id: $id) {
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
      evidence_received_date
      attachments
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
export const listSummons = /* GraphQL */ `
  query ListSummons(
    $filter: ModelSummonsFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listSummons(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        clientID
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
        evidence_received_date
        attachments
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
      nextToken
      __typename
    }
  }
`;
export const getSyncStatus = /* GraphQL */ `
  query GetSyncStatus($id: ID!) {
    getSyncStatus(id: $id) {
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
export const listSyncStatuses = /* GraphQL */ `
  query ListSyncStatuses(
    $filter: ModelSyncStatusFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listSyncStatuses(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
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
      nextToken
      __typename
    }
  }
`;
export const summonsByClientIDAndHearing_date = /* GraphQL */ `
  query SummonsByClientIDAndHearing_date(
    $clientID: ID!
    $hearing_date: ModelStringKeyConditionInput
    $sortDirection: ModelSortDirection
    $filter: ModelSummonsFilterInput
    $limit: Int
    $nextToken: String
  ) {
    summonsByClientIDAndHearing_date(
      clientID: $clientID
      hearing_date: $hearing_date
      sortDirection: $sortDirection
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        clientID
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
        evidence_received_date
        attachments
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
      nextToken
      __typename
    }
  }
`;
export const summonsBySummonsNumber = /* GraphQL */ `
  query SummonsBySummonsNumber(
    $summons_number: String!
    $sortDirection: ModelSortDirection
    $filter: ModelSummonsFilterInput
    $limit: Int
    $nextToken: String
  ) {
    summonsBySummonsNumber(
      summons_number: $summons_number
      sortDirection: $sortDirection
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        clientID
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
        evidence_received_date
        attachments
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
      nextToken
      __typename
    }
  }
`;
export const summonsByOcrStatus = /* GraphQL */ `
  query SummonsByOcrStatus(
    $ocr_status: String!
    $sortDirection: ModelSortDirection
    $filter: ModelSummonsFilterInput
    $limit: Int
    $nextToken: String
  ) {
    summonsByOcrStatus(
      ocr_status: $ocr_status
      sortDirection: $sortDirection
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        clientID
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
        evidence_received_date
        attachments
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
      nextToken
      __typename
    }
  }
`;
