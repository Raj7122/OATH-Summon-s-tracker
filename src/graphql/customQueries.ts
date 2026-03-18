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
