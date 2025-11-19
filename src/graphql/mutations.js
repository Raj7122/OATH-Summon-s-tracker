/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const createClient = /* GraphQL */ `
  mutation CreateClient(
    $input: CreateClientInput!
    $condition: ModelClientConditionInput
  ) {
    createClient(input: $input, condition: $condition) {
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
export const updateClient = /* GraphQL */ `
  mutation UpdateClient(
    $input: UpdateClientInput!
    $condition: ModelClientConditionInput
  ) {
    updateClient(input: $input, condition: $condition) {
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
export const deleteClient = /* GraphQL */ `
  mutation DeleteClient(
    $input: DeleteClientInput!
    $condition: ModelClientConditionInput
  ) {
    deleteClient(input: $input, condition: $condition) {
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
export const createSummons = /* GraphQL */ `
  mutation CreateSummons(
    $input: CreateSummonsInput!
    $condition: ModelSummonsConditionInput
  ) {
    createSummons(input: $input, condition: $condition) {
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
export const updateSummons = /* GraphQL */ `
  mutation UpdateSummons(
    $input: UpdateSummonsInput!
    $condition: ModelSummonsConditionInput
  ) {
    updateSummons(input: $input, condition: $condition) {
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
export const deleteSummons = /* GraphQL */ `
  mutation DeleteSummons(
    $input: DeleteSummonsInput!
    $condition: ModelSummonsConditionInput
  ) {
    deleteSummons(input: $input, condition: $condition) {
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
