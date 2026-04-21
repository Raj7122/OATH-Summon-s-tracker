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
      client_notes
      plate_filter_enabled
      plate_filter_list
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
      client_notes
      plate_filter_enabled
      plate_filter_list
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
      client_notes
      plate_filter_enabled
      plate_filter_list
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
        client_notes
        plate_filter_enabled
        plate_filter_list
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
      evidence_reviewed_date
      added_to_calendar_date
      attachments
      internal_status
      internal_status_attr
      evidence_reviewed_attr
      added_to_calendar_attr
      evidence_requested_attr
      evidence_received_attr
      dep_file_date_attr
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
      is_invoiced
      invoice_date
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
        client_notes
        plate_filter_enabled
        plate_filter_list
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
      evidence_reviewed_date
      added_to_calendar_date
      attachments
      internal_status
      internal_status_attr
      evidence_reviewed_attr
      added_to_calendar_attr
      evidence_requested_attr
      evidence_received_attr
      dep_file_date_attr
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
      is_invoiced
      invoice_date
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
        client_notes
        plate_filter_enabled
        plate_filter_list
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
      evidence_reviewed_date
      added_to_calendar_date
      attachments
      internal_status
      internal_status_attr
      evidence_reviewed_attr
      added_to_calendar_attr
      evidence_requested_attr
      evidence_received_attr
      dep_file_date_attr
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
      is_invoiced
      invoice_date
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
      phase1_clients_processed
      phase1_cases_from_api
      phase1_new_records
      phase1_updated_records
      phase1_unchanged_records
      phase1_flagged_for_ocr
      phase1_records_archived
      phase1_error_count
      phase1_errors
      phase2_status
      phase2_completed_at
      phase2_ocr_processed
      phase2_ocr_remaining
      phase2_ocr_failed
      phase2_ocr_healed
      phase2_ocr_skipped
      phase2_excluded_max_failures
      phase2_excluded_old_hearings
      phase2_graceful_exit
      phase2_rate_limit_hits
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
      phase1_clients_processed
      phase1_cases_from_api
      phase1_new_records
      phase1_updated_records
      phase1_unchanged_records
      phase1_flagged_for_ocr
      phase1_records_archived
      phase1_error_count
      phase1_errors
      phase2_status
      phase2_completed_at
      phase2_ocr_processed
      phase2_ocr_remaining
      phase2_ocr_failed
      phase2_ocr_healed
      phase2_ocr_skipped
      phase2_excluded_max_failures
      phase2_excluded_old_hearings
      phase2_graceful_exit
      phase2_rate_limit_hits
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
      phase1_clients_processed
      phase1_cases_from_api
      phase1_new_records
      phase1_updated_records
      phase1_unchanged_records
      phase1_flagged_for_ocr
      phase1_records_archived
      phase1_error_count
      phase1_errors
      phase2_status
      phase2_completed_at
      phase2_ocr_processed
      phase2_ocr_remaining
      phase2_ocr_failed
      phase2_ocr_healed
      phase2_ocr_skipped
      phase2_excluded_max_failures
      phase2_excluded_old_hearings
      phase2_graceful_exit
      phase2_rate_limit_hits
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
export const onCreateInvoice = /* GraphQL */ `
  subscription OnCreateInvoice($filter: ModelSubscriptionInvoiceFilterInput) {
    onCreateInvoice(filter: $filter) {
      id
      invoice_number
      invoice_date
      recipient_company
      recipient_attention
      recipient_address
      recipient_email
      total_legal_fees
      total_fines_due
      item_count
      payment_status
      payment_date
      alert_deadline
      notes
      clientID
      pdf_s3_key
      extra_line_items
      items {
        nextToken
        __typename
      }
      createdAt
      updatedAt
      __typename
    }
  }
`;
export const onUpdateInvoice = /* GraphQL */ `
  subscription OnUpdateInvoice($filter: ModelSubscriptionInvoiceFilterInput) {
    onUpdateInvoice(filter: $filter) {
      id
      invoice_number
      invoice_date
      recipient_company
      recipient_attention
      recipient_address
      recipient_email
      total_legal_fees
      total_fines_due
      item_count
      payment_status
      payment_date
      alert_deadline
      notes
      clientID
      pdf_s3_key
      extra_line_items
      items {
        nextToken
        __typename
      }
      createdAt
      updatedAt
      __typename
    }
  }
`;
export const onDeleteInvoice = /* GraphQL */ `
  subscription OnDeleteInvoice($filter: ModelSubscriptionInvoiceFilterInput) {
    onDeleteInvoice(filter: $filter) {
      id
      invoice_number
      invoice_date
      recipient_company
      recipient_attention
      recipient_address
      recipient_email
      total_legal_fees
      total_fines_due
      item_count
      payment_status
      payment_date
      alert_deadline
      notes
      clientID
      pdf_s3_key
      extra_line_items
      items {
        nextToken
        __typename
      }
      createdAt
      updatedAt
      __typename
    }
  }
`;
export const onCreateInvoiceSummons = /* GraphQL */ `
  subscription OnCreateInvoiceSummons(
    $filter: ModelSubscriptionInvoiceSummonsFilterInput
  ) {
    onCreateInvoiceSummons(filter: $filter) {
      id
      invoiceID
      summonsID
      summons_number
      legal_fee
      amount_due
      invoice {
        id
        invoice_number
        invoice_date
        recipient_company
        recipient_attention
        recipient_address
        recipient_email
        total_legal_fees
        total_fines_due
        item_count
        payment_status
        payment_date
        alert_deadline
        notes
        clientID
        pdf_s3_key
        extra_line_items
        createdAt
        updatedAt
        __typename
      }
      createdAt
      updatedAt
      __typename
    }
  }
`;
export const onUpdateInvoiceSummons = /* GraphQL */ `
  subscription OnUpdateInvoiceSummons(
    $filter: ModelSubscriptionInvoiceSummonsFilterInput
  ) {
    onUpdateInvoiceSummons(filter: $filter) {
      id
      invoiceID
      summonsID
      summons_number
      legal_fee
      amount_due
      invoice {
        id
        invoice_number
        invoice_date
        recipient_company
        recipient_attention
        recipient_address
        recipient_email
        total_legal_fees
        total_fines_due
        item_count
        payment_status
        payment_date
        alert_deadline
        notes
        clientID
        pdf_s3_key
        extra_line_items
        createdAt
        updatedAt
        __typename
      }
      createdAt
      updatedAt
      __typename
    }
  }
`;
export const onDeleteInvoiceSummons = /* GraphQL */ `
  subscription OnDeleteInvoiceSummons(
    $filter: ModelSubscriptionInvoiceSummonsFilterInput
  ) {
    onDeleteInvoiceSummons(filter: $filter) {
      id
      invoiceID
      summonsID
      summons_number
      legal_fee
      amount_due
      invoice {
        id
        invoice_number
        invoice_date
        recipient_company
        recipient_attention
        recipient_address
        recipient_email
        total_legal_fees
        total_fines_due
        item_count
        payment_status
        payment_date
        alert_deadline
        notes
        clientID
        pdf_s3_key
        extra_line_items
        createdAt
        updatedAt
        __typename
      }
      createdAt
      updatedAt
      __typename
    }
  }
`;
