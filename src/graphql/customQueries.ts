/**
 * Custom GraphQL queries for fields not yet deployed to AppSync.
 *
 * plate_filter_enabled and plate_filter_list are in the local schema but
 * haven't been pushed via `amplify push`. AppSync rejects the entire query
 * when it encounters unknown fields, so we isolate them here behind
 * try/catch callers that gracefully degrade.
 */

// Used by Dashboard and CalendarDashboard (multi-client plate filtering)
export const listClientsWithPlateFilter = /* GraphQL */ `
  query ListClientsWithPlateFilter(
    $filter: ModelClientFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listClients(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        name
        akas
        plate_filter_enabled
        plate_filter_list
        __typename
      }
      nextToken
      __typename
    }
  }
`;

// Used by ClientDetail (single-client plate filtering)
export const getClientWithPlateFilter = /* GraphQL */ `
  query GetClientWithPlateFilter($id: ID!) {
    getClient(id: $id) {
      id
      plate_filter_enabled
      plate_filter_list
    }
  }
`;

// Used by Clients.tsx to save plate filter fields separately.
// Gracefully degrades if schema hasn't been deployed yet.
export const updateClientPlateFilter = /* GraphQL */ `
  mutation UpdateClientPlateFilter($input: UpdateClientInput!) {
    updateClient(input: $input) {
      id
      plate_filter_enabled
      plate_filter_list
    }
  }
`;

// ---------------------------------------------------------------------------
// Invoice Tracker Queries
// ---------------------------------------------------------------------------

// List all invoices with their linked summons items
export const listInvoicesWithItems = /* GraphQL */ `
  query ListInvoicesWithItems(
    $filter: ModelInvoiceFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listInvoices(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
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
        pdf_s3_key
        clientID
        items {
          items {
            id
            invoiceID
            summonsID
            summons_number
            legal_fee
            amount_due
          }
        }
        createdAt
        updatedAt
        __typename
      }
      nextToken
      __typename
    }
  }
`;

// Query InvoiceSummons by summonsID to check if a summons was previously invoiced
export const invoiceSummonsItemsBySummons = /* GraphQL */ `
  query InvoiceSummonsItemsBySummons(
    $summonsID: ID!
    $limit: Int
    $nextToken: String
  ) {
    invoiceSummonsesBySummonsID: listInvoiceSummonses(
      filter: { summonsID: { eq: $summonsID } }
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
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
          payment_status
          payment_date
        }
      }
      nextToken
      __typename
    }
  }
`;

// Create a new invoice record
export const createInvoiceRecord = /* GraphQL */ `
  mutation CreateInvoiceRecord($input: CreateInvoiceInput!) {
    createInvoice(input: $input) {
      id
      invoice_number
      invoice_date
      recipient_company
      total_legal_fees
      total_fines_due
      item_count
      payment_status
      alert_deadline
      pdf_s3_key
      clientID
      extra_line_items
    }
  }
`;

// Create an invoice-summons join record
export const createInvoiceSummonsRecord = /* GraphQL */ `
  mutation CreateInvoiceSummonsRecord($input: CreateInvoiceSummonsInput!) {
    createInvoiceSummons(input: $input) {
      id
      invoiceID
      summonsID
      summons_number
      legal_fee
      amount_due
    }
  }
`;

// Update invoice (for marking paid/unpaid, changing deadline, notes)
export const updateInvoiceRecord = /* GraphQL */ `
  mutation UpdateInvoiceRecord($input: UpdateInvoiceInput!) {
    updateInvoice(input: $input) {
      id
      payment_status
      payment_date
      alert_deadline
      notes
      pdf_s3_key
      extra_line_items
    }
  }
`;

// List invoices for a specific client (basic fields, no nested items).
// Used by ClientInvoicesDialog. Linked InvoiceSummons items are fetched
// separately per invoice so a partial failure of the hasMany resolver
// doesn't prevent the list from rendering.
export const invoicesByClientBasic = /* GraphQL */ `
  query InvoicesByClientBasic(
    $clientID: ID!
    $limit: Int
    $nextToken: String
  ) {
    invoicesByClientID(
      clientID: $clientID
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
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
      }
      nextToken
    }
  }
`;

// Fetch InvoiceSummons rows for a single invoice. Uses the byInvoice index.
export const invoiceSummonsForInvoice = /* GraphQL */ `
  query InvoiceSummonsForInvoice(
    $invoiceID: ID!
    $limit: Int
    $nextToken: String
  ) {
    invoiceSummonsByInvoiceIDAndSummonsID(
      invoiceID: $invoiceID
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        invoiceID
        summonsID
        summons_number
        legal_fee
        amount_due
      }
      nextToken
    }
  }
`;

// Fetch a single invoice's S3 key for viewing the saved file
export const getInvoicePdfKey = /* GraphQL */ `
  query GetInvoicePdfKey($id: ID!) {
    getInvoice(id: $id) {
      id
      pdf_s3_key
    }
  }
`;

// Delete an invoice record
export const deleteInvoiceRecord = /* GraphQL */ `
  mutation DeleteInvoiceRecord($input: DeleteInvoiceInput!) {
    deleteInvoice(input: $input) {
      id
    }
  }
`;

// Delete an invoice-summons join record
export const deleteInvoiceSummonsRecord = /* GraphQL */ `
  mutation DeleteInvoiceSummonsRecord($input: DeleteInvoiceSummonsInput!) {
    deleteInvoiceSummons(input: $input) {
      id
    }
  }
`;

// Fetch a single invoice with its join-table items.
// Used when entering edit mode so we can hydrate the builder with the invoice's
// current line items, recipient info, and alert deadline.
export const getInvoiceWithItems = /* GraphQL */ `
  query GetInvoiceWithItems($id: ID!) {
    getInvoice(id: $id) {
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
        items {
          id
          invoiceID
          summonsID
          summons_number
          legal_fee
          amount_due
        }
      }
      createdAt
      updatedAt
    }
  }
`;

// Update an invoice-summons join record (for changing legal_fee / amount_due).
export const updateInvoiceSummonsRecord = /* GraphQL */ `
  mutation UpdateInvoiceSummonsRecord($input: UpdateInvoiceSummonsInput!) {
    updateInvoiceSummons(input: $input) {
      id
      invoiceID
      summonsID
      summons_number
      legal_fee
      amount_due
    }
  }
`;

// Fetch all summonses for a client, with just the fields needed for the
// "Add summonses to invoice" picker. Uses the existing byClient GSI.
export const summonsesByClientForPicker = /* GraphQL */ `
  query SummonsesByClientForPicker(
    $clientID: ID!
    $limit: Int
    $nextToken: String
  ) {
    summonsByClientIDAndHearing_date(
      clientID: $clientID
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        clientID
        summons_number
        respondent_name
        hearing_date
        hearing_result
        status
        violation_date
        amount_due
        is_invoiced
        invoice_date
      }
      nextToken
    }
  }
`;
