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
      internal_status
      offense_level
      agency_id_number
      last_change_summary
      last_change_at
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
        internal_status
        offense_level
        agency_id_number
        last_change_summary
        last_change_at
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
        internal_status
        offense_level
        agency_id_number
        last_change_summary
        last_change_at
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
        internal_status
        offense_level
        agency_id_number
        last_change_summary
        last_change_at
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
        __typename
      }
      nextToken
      __typename
    }
  }
`;
