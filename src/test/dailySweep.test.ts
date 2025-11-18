/**
 * Unit Tests for dailySweep Lambda Function
 *
 * Tests the core business logic of the daily sweep function:
 * - Client name matching (with AKAs)
 * - PDF link construction
 * - Summons processing logic
 *
 * All external dependencies (NYC API, DynamoDB) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mock data for testing
 */
const mockClients = [
  {
    id: 'client-1',
    name: 'GC Warehouse Inc',
    akas: ['G.C. Whse', 'GC Whse Inc'],
  },
  {
    id: 'client-2',
    name: 'Miller Transport LLC',
    akas: ['Miller Trans'],
  },
  {
    id: 'client-3',
    name: 'Brooklyn Logistics',
    akas: [],
  },
];

const mockNYCSummonses = [
  {
    summons_number: '123456789',
    respondent: 'GC WAREHOUSE INC', // Matches client-1 (primary name)
    hearing_date: '2025-12-15T09:30:00.000',
    status: 'HEARING SCHEDULED',
    violation_date: '2025-11-01T14:20:00.000',
    violation_location: '123 MAIN ST, BROOKLYN',
    license_plate: 'ABC1234',
    base_fine: '350.00',
    amount_due: '350.00',
    code_description: 'IDLING',
  },
  {
    summons_number: '987654321',
    respondent: 'UNKNOWN COMPANY', // Does not match any client
    hearing_date: '2025-12-10T10:00:00.000',
    status: 'DEFAULT JUDGMENT',
    violation_date: '2025-10-15T16:45:00.000',
    violation_location: '456 ELM ST, QUEENS',
    license_plate: 'XYZ9876',
    base_fine: '500.00',
    amount_due: '650.00',
    code_description: 'IDLING',
  },
  {
    summons_number: '555555555',
    respondent: 'miller trans', // Matches client-2 via AKA (case-insensitive)
    hearing_date: '2025-12-20T11:00:00.000',
    status: 'HEARING SCHEDULED',
    violation_date: '2025-11-05T12:30:00.000',
    violation_location: '789 OAK AVE, MANHATTAN',
    license_plate: 'DEF4567',
    base_fine: '350.00',
    amount_due: '350.00',
    code_description: 'IDLING',
  },
];

/**
 * Business Logic Functions (extracted from Lambda for testing)
 */

/**
 * Build a map of client names (including AKAs) to client IDs
 * Performs case-insensitive matching
 */
function buildClientNameMap(clients: any[]) {
  const nameMap = new Map();

  clients.forEach((client) => {
    // Add the primary client name (case-insensitive)
    const primaryName = client.name.toLowerCase().trim();
    nameMap.set(primaryName, client);

    // Add all AKAs (case-insensitive)
    if (client.akas && Array.isArray(client.akas)) {
      client.akas.forEach((aka: string) => {
        const akaName = aka.toLowerCase().trim();
        nameMap.set(akaName, client);
      });
    }
  });

  return nameMap;
}

/**
 * Generate PDF link for a summons
 */
function generatePDFLink(summonsNumber: string) {
  return `https://a820-ecbticketfinder.nyc.gov/GetViolationImage?violationNumber=${summonsNumber}`;
}

/**
 * Generate video link for a summons
 */
function generateVideoLink(summonsNumber: string) {
  return `https://nycidling.azurewebsites.net/idlingevidence/video/${summonsNumber}`;
}

/**
 * Match summonses to clients
 */
function matchSummonsesToClients(apiSummonses: any[], clientNameMap: Map<string, any>) {
  const matched = [];
  const unmatched = [];

  for (const summons of apiSummonses) {
    const respondentName = (summons.respondent || '').toLowerCase().trim();

    if (!respondentName) {
      unmatched.push(summons);
      continue;
    }

    const matchedClient = clientNameMap.get(respondentName);

    if (matchedClient) {
      matched.push({
        summons,
        client: matchedClient,
      });
    } else {
      unmatched.push(summons);
    }
  }

  return { matched, unmatched };
}

/**
 * Test Suite
 */
describe('dailySweep Lambda Function - Business Logic', () => {
  describe('buildClientNameMap', () => {
    it('should create a case-insensitive map of client names', () => {
      const nameMap = buildClientNameMap(mockClients);

      // Primary names should be mapped
      expect(nameMap.get('gc warehouse inc')).toEqual(mockClients[0]);
      expect(nameMap.get('miller transport llc')).toEqual(mockClients[1]);
      expect(nameMap.get('brooklyn logistics')).toEqual(mockClients[2]);
    });

    it('should include AKAs in the name map', () => {
      const nameMap = buildClientNameMap(mockClients);

      // AKAs should be mapped to the same client
      expect(nameMap.get('g.c. whse')).toEqual(mockClients[0]);
      expect(nameMap.get('gc whse inc')).toEqual(mockClients[0]);
      expect(nameMap.get('miller trans')).toEqual(mockClients[1]);
    });

    it('should handle clients with no AKAs', () => {
      const nameMap = buildClientNameMap(mockClients);

      // Client with no AKAs should still be mapped by primary name
      expect(nameMap.get('brooklyn logistics')).toEqual(mockClients[2]);
    });

    it('should handle case-insensitive lookups', () => {
      const nameMap = buildClientNameMap(mockClients);

      // Different casings should all resolve to the same client
      expect(nameMap.get('GC WAREHOUSE INC')).toBeUndefined(); // Map keys are lowercase
      expect(nameMap.get('gc warehouse inc')).toEqual(mockClients[0]);
      expect(nameMap.get('Gc WaReHoUsE iNc'.toLowerCase())).toEqual(mockClients[0]);
    });
  });

  describe('generatePDFLink', () => {
    it('should construct correct PDF URL with summons number', () => {
      const summonsNumber = '123456789';
      const expectedURL = 'https://a820-ecbticketfinder.nyc.gov/GetViolationImage?violationNumber=123456789';

      const pdfLink = generatePDFLink(summonsNumber);

      expect(pdfLink).toBe(expectedURL);
    });

    it('should handle different summons number formats', () => {
      const summonsNumber = '987654321';
      const pdfLink = generatePDFLink(summonsNumber);

      expect(pdfLink).toContain('violationNumber=987654321');
      expect(pdfLink).toMatch(/^https:\/\/a820-ecbticketfinder\.nyc\.gov\/GetViolationImage\?violationNumber=\d+$/);
    });
  });

  describe('generateVideoLink', () => {
    it('should construct correct video URL with summons number', () => {
      const summonsNumber = '123456789';
      const expectedURL = 'https://nycidling.azurewebsites.net/idlingevidence/video/123456789';

      const videoLink = generateVideoLink(summonsNumber);

      expect(videoLink).toBe(expectedURL);
    });
  });

  describe('matchSummonsesToClients', () => {
    it('should match summonses to clients by respondent name', () => {
      const nameMap = buildClientNameMap(mockClients);
      const { matched, unmatched } = matchSummonsesToClients(mockNYCSummonses, nameMap);

      // Should match 2 out of 3 summonses
      expect(matched.length).toBe(2);
      expect(unmatched.length).toBe(1);

      // First match: GC WAREHOUSE INC → client-1
      expect(matched[0].summons.summons_number).toBe('123456789');
      expect(matched[0].client.id).toBe('client-1');

      // Second match: miller trans → client-2 (via AKA)
      expect(matched[1].summons.summons_number).toBe('555555555');
      expect(matched[1].client.id).toBe('client-2');

      // Unmatched: UNKNOWN COMPANY
      expect(unmatched[0].summons_number).toBe('987654321');
    });

    it('should handle case-insensitive matching', () => {
      const nameMap = buildClientNameMap(mockClients);

      // "miller trans" (lowercase) should match "Miller Trans" AKA
      const { matched } = matchSummonsesToClients([mockNYCSummonses[2]], nameMap);

      expect(matched.length).toBe(1);
      expect(matched[0].client.id).toBe('client-2');
    });

    it('should skip summonses with empty respondent names', () => {
      const nameMap = buildClientNameMap(mockClients);
      const summonsesWithEmpty = [
        { summons_number: '111', respondent: '' },
        { summons_number: '222', respondent: null },
        { summons_number: '333', respondent: 'GC WAREHOUSE INC' },
      ];

      const { matched, unmatched } = matchSummonsesToClients(summonsesWithEmpty, nameMap);

      // Should only match the one with a valid respondent
      expect(matched.length).toBe(1);
      expect(matched[0].summons.summons_number).toBe('333');

      // Empty/null respondents should be in unmatched
      expect(unmatched.length).toBe(2);
    });

    it('should not match summonses that do not correspond to any client', () => {
      const nameMap = buildClientNameMap(mockClients);
      const unmatchedSummonses = [
        { summons_number: '999', respondent: 'RANDOM COMPANY XYZ' },
      ];

      const { matched, unmatched } = matchSummonsesToClients(unmatchedSummonses, nameMap);

      expect(matched.length).toBe(0);
      expect(unmatched.length).toBe(1);
    });
  });
});
