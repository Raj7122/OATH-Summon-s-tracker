/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const onCreateClient = /* GraphQL */ `
  subscription OnCreateClient(
    $filter: ModelSubscriptionClientFilterInput
    $owner: String
  ) {
    onCreateClient(filter: $filter, owner: $owner) {
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
      owner
      __typename
    }
  }
`;
export const onUpdateClient = /* GraphQL */ `
  subscription OnUpdateClient(
    $filter: ModelSubscriptionClientFilterInput
    $owner: String
  ) {
    onUpdateClient(filter: $filter, owner: $owner) {
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
      owner
      __typename
    }
  }
`;
export const onDeleteClient = /* GraphQL */ `
  subscription OnDeleteClient(
    $filter: ModelSubscriptionClientFilterInput
    $owner: String
  ) {
    onDeleteClient(filter: $filter, owner: $owner) {
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
      owner
      __typename
    }
  }
`;
export const onCreateSummons = /* GraphQL */ `
  subscription OnCreateSummons(
    $filter: ModelSubscriptionSummonsFilterInput
    $owner: String
  ) {
    onCreateSummons(filter: $filter, owner: $owner) {
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
        owner
        __typename
      }
      summons_number
      respondent_name
      hearing_date
      status
      license_plate
      base_fine
      amount_due
      violation_date
      violation_location
      summons_pdf_link
      video_link
      video_created_date
      lag_days
      notes
      added_to_calendar
      evidence_reviewed
      evidence_requested
      evidence_requested_date
      evidence_received
      dep_id
      license_plate_ocr
      vehicle_type_ocr
      prior_offense_status
      violation_narrative
      idling_duration_ocr
      critical_flags_ocr
      name_on_summons_ocr
      createdAt
      updatedAt
      owner
      __typename
    }
  }
`;
export const onUpdateSummons = /* GraphQL */ `
  subscription OnUpdateSummons(
    $filter: ModelSubscriptionSummonsFilterInput
    $owner: String
  ) {
    onUpdateSummons(filter: $filter, owner: $owner) {
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
        owner
        __typename
      }
      summons_number
      respondent_name
      hearing_date
      status
      license_plate
      base_fine
      amount_due
      violation_date
      violation_location
      summons_pdf_link
      video_link
      video_created_date
      lag_days
      notes
      added_to_calendar
      evidence_reviewed
      evidence_requested
      evidence_requested_date
      evidence_received
      dep_id
      license_plate_ocr
      vehicle_type_ocr
      prior_offense_status
      violation_narrative
      idling_duration_ocr
      critical_flags_ocr
      name_on_summons_ocr
      createdAt
      updatedAt
      owner
      __typename
    }
  }
`;
export const onDeleteSummons = /* GraphQL */ `
  subscription OnDeleteSummons(
    $filter: ModelSubscriptionSummonsFilterInput
    $owner: String
  ) {
    onDeleteSummons(filter: $filter, owner: $owner) {
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
        owner
        __typename
      }
      summons_number
      respondent_name
      hearing_date
      status
      license_plate
      base_fine
      amount_due
      violation_date
      violation_location
      summons_pdf_link
      video_link
      video_created_date
      lag_days
      notes
      added_to_calendar
      evidence_reviewed
      evidence_requested
      evidence_requested_date
      evidence_received
      dep_id
      license_plate_ocr
      vehicle_type_ocr
      prior_offense_status
      violation_narrative
      idling_duration_ocr
      critical_flags_ocr
      name_on_summons_ocr
      createdAt
      updatedAt
      owner
      __typename
    }
  }
`;
