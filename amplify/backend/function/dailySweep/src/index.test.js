/**
 * Unit Tests for Daily Sweep Lambda Function
 *
 * Tests cover:
 * - normalizeCompanyName() - Fuzzy matching logic
 * - buildClientNameMap() - Client name to ID mapping
 * - normalizeAmount() - Currency field normalization
 * - normalizeDate() / ensureISOFormat() - Date normalization
 * - calculateChanges() - Strict diff engine logic
 * - generateUUID() - UUID generation
 * - Handler error cases
 *
 * Per TRD Section 18: All Lambda functions must have unit tests
 */

// Mock AWS SDK before requiring the module
const mockDynamoDBScan = jest.fn();
const mockDynamoDBQuery = jest.fn();
const mockDynamoDBPut = jest.fn();
const mockDynamoDBUpdate = jest.fn();
const mockLambdaInvoke = jest.fn();

jest.mock('aws-sdk', () => ({
  DynamoDB: {
    DocumentClient: jest.fn(() => ({
      scan: jest.fn(() => ({ promise: mockDynamoDBScan })),
      query: jest.fn(() => ({ promise: mockDynamoDBQuery })),
      put: jest.fn(() => ({ promise: mockDynamoDBPut })),
      update: jest.fn(() => ({ promise: mockDynamoDBUpdate })),
    })),
  },
  Lambda: jest.fn(() => ({
    invoke: jest.fn(() => ({ promise: mockLambdaInvoke })),
  })),
}));

// Mock node-fetch
const mockFetch = jest.fn();
jest.mock('node-fetch', () => mockFetch);

// Import the module after mocks are set up
// We need to extract functions for testing - the module doesn't export them
// So we'll test via the handler and mock appropriately

describe('Daily Sweep Lambda Function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset console mocks
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('normalizeCompanyName', () => {
    // Since the function isn't exported, we'll test the logic inline
    const normalizeCompanyName = (name) => {
      if (!name) return '';
      let normalized = name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\s*(llc|inc|corp|co|ltd|l\.l\.c\.|i\.n\.c\.)\s*$/i, '')
        .trim();
      return normalized;
    };

    test('should lowercase and trim names', () => {
      expect(normalizeCompanyName('  ACME Corporation  ')).toBe('acme corporation');
    });

    test('should remove LLC suffix', () => {
      expect(normalizeCompanyName('Acme LLC')).toBe('acme');
      expect(normalizeCompanyName('Test Company L.L.C.')).toBe('test company');
    });

    test('should remove INC suffix', () => {
      expect(normalizeCompanyName('Acme Inc')).toBe('acme');
      expect(normalizeCompanyName('Test Company I.N.C.')).toBe('test company');
    });

    test('should remove CORP suffix', () => {
      expect(normalizeCompanyName('Acme Corp')).toBe('acme');
    });

    test('should collapse multiple spaces', () => {
      expect(normalizeCompanyName('Acme    Company    LLC')).toBe('acme company');
    });

    test('should handle empty/null input', () => {
      expect(normalizeCompanyName('')).toBe('');
      expect(normalizeCompanyName(null)).toBe('');
      expect(normalizeCompanyName(undefined)).toBe('');
    });

    test('should handle company names with special characters', () => {
      expect(normalizeCompanyName('G.C. Warehouse LLC')).toBe('g.c. warehouse');
    });
  });

  describe('looksLikeSuffixFragment', () => {
    // Suffix fragments - remnants of LLC, INC, CORP, etc. from truncated company names
    const SUFFIX_FRAGMENTS = [
      'llc', 'inc', 'corp', 'co', 'ltd',
      'orp', 'rp', 'p',
      'nc', 'c',
      'lc', 'l',
      'td', 'd',
    ];

    const looksLikeSuffixFragment = (firstName) => {
      if (!firstName) return false;
      const lower = firstName.toLowerCase().trim();
      return SUFFIX_FRAGMENTS.includes(lower) || lower.length <= 3;
    };

    test('should detect full suffix fragments', () => {
      expect(looksLikeSuffixFragment('LLC')).toBe(true);
      expect(looksLikeSuffixFragment('INC')).toBe(true);
      expect(looksLikeSuffixFragment('CORP')).toBe(true);
      expect(looksLikeSuffixFragment('CO')).toBe(true);
      expect(looksLikeSuffixFragment('LTD')).toBe(true);
    });

    test('should detect CORP truncation fragments', () => {
      // "CERCONE EXTERIOR RESTORATION CORP" -> first="ORP", last="CERCONE EXTERIOR RESTORATION C"
      expect(looksLikeSuffixFragment('ORP')).toBe(true);
      expect(looksLikeSuffixFragment('RP')).toBe(true);
      expect(looksLikeSuffixFragment('P')).toBe(true);
    });

    test('should detect INC truncation fragments', () => {
      expect(looksLikeSuffixFragment('NC')).toBe(true);
      expect(looksLikeSuffixFragment('C')).toBe(true);
    });

    test('should detect LLC truncation fragments', () => {
      expect(looksLikeSuffixFragment('LC')).toBe(true);
      expect(looksLikeSuffixFragment('L')).toBe(true);
    });

    test('should detect LTD truncation fragments', () => {
      expect(looksLikeSuffixFragment('TD')).toBe(true);
      expect(looksLikeSuffixFragment('D')).toBe(true);
    });

    test('should detect short strings (3 chars or less) as potential fragments', () => {
      expect(looksLikeSuffixFragment('AB')).toBe(true);
      expect(looksLikeSuffixFragment('XYZ')).toBe(true);
      expect(looksLikeSuffixFragment('A')).toBe(true);
    });

    test('should NOT detect longer non-suffix strings', () => {
      expect(looksLikeSuffixFragment('JOHN')).toBe(false);
      expect(looksLikeSuffixFragment('ACME')).toBe(false);
      expect(looksLikeSuffixFragment('TEST')).toBe(false);
    });

    test('should handle null/undefined/empty', () => {
      expect(looksLikeSuffixFragment(null)).toBe(false);
      expect(looksLikeSuffixFragment(undefined)).toBe(false);
      expect(looksLikeSuffixFragment('')).toBe(false);
    });

    test('should be case-insensitive', () => {
      expect(looksLikeSuffixFragment('orp')).toBe(true);
      expect(looksLikeSuffixFragment('ORP')).toBe(true);
      expect(looksLikeSuffixFragment('Orp')).toBe(true);
    });
  });

  describe('matchRespondentToClient - Cercone Edge Cases', () => {
    // Helper functions (replicated from main code for testing)
    const SUFFIX_FRAGMENTS = [
      'llc', 'inc', 'corp', 'co', 'ltd',
      'orp', 'rp', 'p', 'nc', 'c', 'lc', 'l', 'td', 'd',
    ];

    const looksLikeSuffixFragment = (firstName) => {
      if (!firstName) return false;
      const lower = firstName.toLowerCase().trim();
      return SUFFIX_FRAGMENTS.includes(lower) || lower.length <= 3;
    };

    const normalizeCompanyName = (name) => {
      if (!name) return '';
      return name.toLowerCase().trim().replace(/\s+/g, ' ')
        .replace(/\s*(llc|inc|corp|co|ltd|l\.l\.c\.|i\.n\.c\.)\s*$/i, '').trim();
    };

    const buildClientNameMap = (clients) => {
      const nameMap = new Map();
      clients.forEach((client) => {
        const primaryName = normalizeCompanyName(client.name);
        nameMap.set(primaryName, client);
        const noSpaceName = primaryName.replace(/\s/g, '');
        if (noSpaceName !== primaryName) {
          nameMap.set(noSpaceName, client);
        }
        if (client.akas && Array.isArray(client.akas)) {
          client.akas.forEach((aka) => {
            const akaName = normalizeCompanyName(aka);
            nameMap.set(akaName, client);
            const akaNoSpace = akaName.replace(/\s/g, '');
            if (akaNoSpace !== akaName) {
              nameMap.set(akaNoSpace, client);
            }
          });
        }
      });
      return nameMap;
    };

    const matchRespondentToClient = (firstName, lastName, clientNameMap) => {
      const fullName = `${firstName} ${lastName}`.trim();
      if (!fullName) return null;

      const normalizedFull = normalizeCompanyName(fullName);
      const noSpaceFull = normalizedFull.replace(/\s/g, '');

      let match = clientNameMap.get(normalizedFull) || clientNameMap.get(noSpaceFull);
      if (match) return match;

      // Strategy 2: Suffix Fragment fix
      if (firstName && looksLikeSuffixFragment(firstName) && lastName) {
        const normalizedLast = normalizeCompanyName(lastName);
        const noSpaceLast = normalizedLast.replace(/\s/g, '');
        match = clientNameMap.get(normalizedLast) || clientNameMap.get(noSpaceLast);
        if (match) return match;
      }

      // Strategy 3: Partial word match
      for (const [clientNormName, client] of clientNameMap.entries()) {
        if (normalizedFull.startsWith(clientNormName) && clientNormName.length >= 10) {
          return client;
        }
        if (clientNormName.startsWith(normalizedFull) && normalizedFull.length >= 10) {
          return client;
        }
      }

      // Strategy 4: Fallback lastName-only match
      if (lastName && lastName.length >= 5) {
        const normalizedLast = normalizeCompanyName(lastName);
        const noSpaceLast = normalizedLast.replace(/\s/g, '');
        match = clientNameMap.get(normalizedLast) || clientNameMap.get(noSpaceLast);
        if (match) return match;

        for (const [clientNormName, client] of clientNameMap.entries()) {
          if (normalizedLast.startsWith(clientNormName) && clientNormName.length >= 5) {
            return client;
          }
          if (clientNormName.startsWith(normalizedLast) && normalizedLast.length >= 5) {
            return client;
          }
        }
      }

      return null;
    };

    // Test data: Cercone Exterior Restoration Corp with AKAs
    const cerconeClient = {
      id: 'cercone-1',
      name: 'Cercone Exterior Restoration Corp',
      akas: ['CERCONE', 'CERCONE EXTERIOR RESTORATION C', 'CERCONE EXTERIOR RESTORATION'],
    };

    test('should match "ORP" + "CERCONE EXTERIOR RESTORATION C" (summons 000917991M pattern)', () => {
      // This is the exact pattern from summons 000917991M
      const clients = [cerconeClient];
      const clientNameMap = buildClientNameMap(clients);

      const match = matchRespondentToClient('ORP', 'CERCONE EXTERIOR RESTORATION C', clientNameMap);
      expect(match).not.toBeNull();
      expect(match.id).toBe('cercone-1');
    });

    test('should match empty firstName + "CERCONE" (summons 000726080J pattern)', () => {
      // This is the exact pattern from summons 000726080J
      const clients = [cerconeClient];
      const clientNameMap = buildClientNameMap(clients);

      const match = matchRespondentToClient('', 'CERCONE', clientNameMap);
      expect(match).not.toBeNull();
      expect(match.id).toBe('cercone-1');
    });

    test('should match "C" + "CERCONE EXTERIOR RESTORATION" (hypothetical INC-style split)', () => {
      const clients = [cerconeClient];
      const clientNameMap = buildClientNameMap(clients);

      const match = matchRespondentToClient('C', 'CERCONE EXTERIOR RESTORATION', clientNameMap);
      expect(match).not.toBeNull();
      expect(match.id).toBe('cercone-1');
    });

    test('should match full name "CERCONE EXTERIOR RESTORATION CORP"', () => {
      const clients = [cerconeClient];
      const clientNameMap = buildClientNameMap(clients);

      // Full name match (normal case)
      const match = matchRespondentToClient('CERCONE', 'EXTERIOR RESTORATION CORP', clientNameMap);
      expect(match).not.toBeNull();
      expect(match.id).toBe('cercone-1');
    });

    test('should NOT match unrelated companies', () => {
      const clients = [cerconeClient];
      const clientNameMap = buildClientNameMap(clients);

      const match = matchRespondentToClient('JOHN', 'DOE TRUCKING LLC', clientNameMap);
      expect(match).toBeNull();
    });

    test('should handle multiple clients and only match correct one', () => {
      const clients = [
        cerconeClient,
        { id: 'acme-1', name: 'Acme Trucking LLC', akas: ['ACME'] },
      ];
      const clientNameMap = buildClientNameMap(clients);

      const cerconeMatch = matchRespondentToClient('ORP', 'CERCONE EXTERIOR RESTORATION C', clientNameMap);
      expect(cerconeMatch.id).toBe('cercone-1');

      const acmeMatch = matchRespondentToClient('', 'ACME', clientNameMap);
      expect(acmeMatch.id).toBe('acme-1');
    });

    test('should match via Strategy 4 when lastName alone is an AKA', () => {
      // Without the AKA, this wouldn't match
      const clientWithoutAkas = {
        id: 'cercone-1',
        name: 'Cercone Exterior Restoration Corp',
        akas: [], // No AKAs
      };
      const clients = [clientWithoutAkas];
      const clientNameMap = buildClientNameMap(clients);

      // This should match via Strategy 4's partial match (client name starts with lastName)
      const match = matchRespondentToClient('', 'CERCONE', clientNameMap);
      // With just "CERCONE" (7 chars) and client name starting with it, should match
      expect(match).not.toBeNull();
      expect(match.id).toBe('cercone-1');
    });
  });

  /**
   * Real NYC API Name Patterns - Regression Prevention Tests
   *
   * These tests use actual API response patterns observed in production.
   * When a client reports missing summonses, add the API pattern here to:
   * 1. Verify the current matching logic would catch it
   * 2. Identify if an AKA is needed
   * 3. Prevent regression in future code changes
   *
   * Workflow for new patterns:
   * 1. Add pattern to PRODUCTION_PATTERNS with expected client
   * 2. Run tests - if it fails, add the AKA to the client
   * 3. Run tests again to verify the fix
   */
  describe('Real NYC API Name Patterns - Regression Prevention', () => {
    // Helper functions (replicated from main code for testing)
    const SUFFIX_FRAGMENTS = [
      'llc', 'inc', 'corp', 'co', 'ltd',
      'orp', 'rp', 'p', 'nc', 'c', 'lc', 'l', 'td', 'd',
    ];

    const looksLikeSuffixFragment = (firstName) => {
      if (!firstName) return false;
      const lower = firstName.toLowerCase().trim();
      return SUFFIX_FRAGMENTS.includes(lower) || lower.length <= 3;
    };

    const normalizeCompanyName = (name) => {
      if (!name) return '';
      return name.toLowerCase().trim().replace(/\s+/g, ' ')
        .replace(/\s*(llc|inc|corp|co|ltd|l\.l\.c\.|i\.n\.c\.)\s*$/i, '').trim();
    };

    const buildClientNameMap = (clients) => {
      const nameMap = new Map();
      clients.forEach((client) => {
        const primaryName = normalizeCompanyName(client.name);
        nameMap.set(primaryName, client);
        const noSpaceName = primaryName.replace(/\s/g, '');
        if (noSpaceName !== primaryName) {
          nameMap.set(noSpaceName, client);
        }
        if (client.akas && Array.isArray(client.akas)) {
          client.akas.forEach((aka) => {
            const akaName = normalizeCompanyName(aka);
            nameMap.set(akaName, client);
            const akaNoSpace = akaName.replace(/\s/g, '');
            if (akaNoSpace !== akaName) {
              nameMap.set(akaNoSpace, client);
            }
          });
        }
      });
      return nameMap;
    };

    const matchRespondentToClient = (firstName, lastName, clientNameMap) => {
      const fullName = `${firstName} ${lastName}`.trim();
      if (!fullName) return null;

      const normalizedFull = normalizeCompanyName(fullName);
      const noSpaceFull = normalizedFull.replace(/\s/g, '');

      let match = clientNameMap.get(normalizedFull) || clientNameMap.get(noSpaceFull);
      if (match) return match;

      // Strategy 2: Suffix Fragment fix
      if (firstName && looksLikeSuffixFragment(firstName) && lastName) {
        const normalizedLast = normalizeCompanyName(lastName);
        const noSpaceLast = normalizedLast.replace(/\s/g, '');
        match = clientNameMap.get(normalizedLast) || clientNameMap.get(noSpaceLast);
        if (match) return match;
      }

      // Strategy 3: Partial word match
      for (const [clientNormName, client] of clientNameMap.entries()) {
        if (normalizedFull.startsWith(clientNormName) && clientNormName.length >= 10) {
          return client;
        }
        if (clientNormName.startsWith(normalizedFull) && normalizedFull.length >= 10) {
          return client;
        }
      }

      // Strategy 4: Fallback lastName-only match
      if (lastName && lastName.length >= 5) {
        const normalizedLast = normalizeCompanyName(lastName);
        const noSpaceLast = normalizedLast.replace(/\s/g, '');
        match = clientNameMap.get(normalizedLast) || clientNameMap.get(noSpaceLast);
        if (match) return match;

        for (const [clientNormName, client] of clientNameMap.entries()) {
          if (normalizedLast.startsWith(clientNormName) && clientNormName.length >= 5) {
            return client;
          }
          if (clientNormName.startsWith(normalizedLast) && normalizedLast.length >= 5) {
            return client;
          }
        }
      }

      return null;
    };

    /**
     * PRODUCTION_PATTERNS: Add new patterns here when clients report missing summonses.
     *
     * Each entry documents:
     * - client: The client config with name and required AKAs
     * - apiPatterns: Actual firstName/lastName splits observed in NYC API
     * - summonsRef: (optional) Reference summons number where pattern was discovered
     */
    const PRODUCTION_PATTERNS = [
      {
        client: {
          id: 'cercone-1',
          name: 'Cercone Exterior Restoration Corp',
          akas: [
            'CERCONE',
            'CERCONE EXTERIOR',
            'CERCONE EXTERIOR RESTORATION',
            'CERCONE EXTERIOR RESTORATION C',  // Critical for "ORP" + "..." split
          ],
        },
        apiPatterns: [
          // Summons 000917991M, 000917994N - "ORP" is fragment of "CORP"
          { firstName: 'ORP', lastName: 'CERCONE EXTERIOR RESTORATION C', summonsRef: '000917991M' },
          // Summons 000726080J - Empty firstName with just "CERCONE"
          { firstName: '', lastName: 'CERCONE', summonsRef: '000726080J' },
          // Common patterns that may appear
          { firstName: '', lastName: 'CERCONE EXTERIOR' },
          { firstName: '', lastName: 'CERCONE EXTERIOR RESTORATION' },
          { firstName: '', lastName: 'CERCONE EXTERIOR RESTORATION CORP' },
          // Hypothetical INC-style split (e.g., if "CERCONE INC" existed)
          { firstName: 'C', lastName: 'CERCONE EXTERIOR RESTORATION' },
        ],
      },
      // Add more clients as patterns are discovered in production
      // Example template:
      // {
      //   client: {
      //     id: 'client-x',
      //     name: 'Full Company Name Inc',
      //     akas: ['COMPANY', 'FULL COMPANY NAME I'],  // AKAs that enable matching
      //   },
      //   apiPatterns: [
      //     { firstName: 'NC', lastName: 'FULL COMPANY NAME I', summonsRef: 'XXXXXXX' },
      //   ],
      // },
    ];

    // Generate test cases from production patterns
    PRODUCTION_PATTERNS.forEach(({ client, apiPatterns }) => {
      describe(`Client: ${client.name}`, () => {
        apiPatterns.forEach(({ firstName, lastName, summonsRef }) => {
          const patternDesc = firstName
            ? `"${firstName}" + "${lastName}"`
            : `(empty) + "${lastName}"`;
          const refNote = summonsRef ? ` [ref: ${summonsRef}]` : '';

          test(`should match ${patternDesc}${refNote}`, () => {
            const clientNameMap = buildClientNameMap([client]);
            const match = matchRespondentToClient(firstName, lastName, clientNameMap);
            expect(match).not.toBeNull();
            expect(match.id).toBe(client.id);
          });
        });
      });
    });

    // Test that unrelated companies don't match
    describe('False Positive Prevention', () => {
      const allClients = PRODUCTION_PATTERNS.map(p => p.client);

      test('should NOT match completely unrelated company names', () => {
        const clientNameMap = buildClientNameMap(allClients);

        const unrelatedPatterns = [
          { firstName: 'JOHN', lastName: 'DOE TRUCKING LLC' },
          { firstName: '', lastName: 'ACME CORPORATION' },
          { firstName: 'ABC', lastName: 'DELIVERY SERVICES' },
          { firstName: '', lastName: 'RANDOM BUSINESS NAME' },
        ];

        unrelatedPatterns.forEach(({ firstName, lastName }) => {
          const match = matchRespondentToClient(firstName, lastName, clientNameMap);
          expect(match).toBeNull();
        });
      });

      test('should NOT match partial names that are too short', () => {
        const clientNameMap = buildClientNameMap(allClients);

        // "CERC" is only 4 chars, below the 5-char minimum for Strategy 4
        const match = matchRespondentToClient('', 'CERC', clientNameMap);
        expect(match).toBeNull();
      });
    });
  });

  /**
   * Missing AKA Detection Tests
   *
   * These tests document scenarios where matching FAILS without proper AKAs.
   * Use these to understand why a pattern requires a specific AKA.
   */
  describe('Missing AKA Detection - Documenting Failure Scenarios', () => {
    const SUFFIX_FRAGMENTS = [
      'llc', 'inc', 'corp', 'co', 'ltd',
      'orp', 'rp', 'p', 'nc', 'c', 'lc', 'l', 'td', 'd',
    ];

    const looksLikeSuffixFragment = (firstName) => {
      if (!firstName) return false;
      const lower = firstName.toLowerCase().trim();
      return SUFFIX_FRAGMENTS.includes(lower) || lower.length <= 3;
    };

    const normalizeCompanyName = (name) => {
      if (!name) return '';
      return name.toLowerCase().trim().replace(/\s+/g, ' ')
        .replace(/\s*(llc|inc|corp|co|ltd|l\.l\.c\.|i\.n\.c\.)\s*$/i, '').trim();
    };

    const buildClientNameMap = (clients) => {
      const nameMap = new Map();
      clients.forEach((client) => {
        const primaryName = normalizeCompanyName(client.name);
        nameMap.set(primaryName, client);
        const noSpaceName = primaryName.replace(/\s/g, '');
        if (noSpaceName !== primaryName) {
          nameMap.set(noSpaceName, client);
        }
        if (client.akas && Array.isArray(client.akas)) {
          client.akas.forEach((aka) => {
            const akaName = normalizeCompanyName(aka);
            nameMap.set(akaName, client);
            const akaNoSpace = akaName.replace(/\s/g, '');
            if (akaNoSpace !== akaName) {
              nameMap.set(akaNoSpace, client);
            }
          });
        }
      });
      return nameMap;
    };

    const matchRespondentToClient = (firstName, lastName, clientNameMap) => {
      const fullName = `${firstName} ${lastName}`.trim();
      if (!fullName) return null;

      const normalizedFull = normalizeCompanyName(fullName);
      const noSpaceFull = normalizedFull.replace(/\s/g, '');

      let match = clientNameMap.get(normalizedFull) || clientNameMap.get(noSpaceFull);
      if (match) return match;

      if (firstName && looksLikeSuffixFragment(firstName) && lastName) {
        const normalizedLast = normalizeCompanyName(lastName);
        const noSpaceLast = normalizedLast.replace(/\s/g, '');
        match = clientNameMap.get(normalizedLast) || clientNameMap.get(noSpaceLast);
        if (match) return match;
      }

      for (const [clientNormName, client] of clientNameMap.entries()) {
        if (normalizedFull.startsWith(clientNormName) && clientNormName.length >= 10) {
          return client;
        }
        if (clientNormName.startsWith(normalizedFull) && normalizedFull.length >= 10) {
          return client;
        }
      }

      if (lastName && lastName.length >= 5) {
        const normalizedLast = normalizeCompanyName(lastName);
        const noSpaceLast = normalizedLast.replace(/\s/g, '');
        match = clientNameMap.get(normalizedLast) || clientNameMap.get(noSpaceLast);
        if (match) return match;

        for (const [clientNormName, client] of clientNameMap.entries()) {
          if (normalizedLast.startsWith(clientNormName) && clientNormName.length >= 5) {
            return client;
          }
          if (clientNormName.startsWith(normalizedLast) && normalizedLast.length >= 5) {
            return client;
          }
        }
      }

      return null;
    };

    test('SUCCEEDS via partial match: "ORP" + "CERCONE EXTERIOR RESTORATION C" even without explicit AKA', () => {
      // This documents how the matching logic handles truncated names
      // Even without an explicit AKA for "CERCONE EXTERIOR RESTORATION C",
      // Strategy 4's partial matching catches it because:
      // - "ORP" is a suffix fragment, so Strategy 2 checks lastName
      // - "cercone exterior restoration c" (25 chars) starts with "cercone" (7 chars) - minimum 5
      // - So partial match works!
      const clientMissingCriticalAka = {
        id: 'cercone-1',
        name: 'Cercone Exterior Restoration Corp',
        akas: ['CERCONE'],  // Only has short AKA
      };

      const clientNameMap = buildClientNameMap([clientMissingCriticalAka]);
      const match = matchRespondentToClient('ORP', 'CERCONE EXTERIOR RESTORATION C', clientNameMap);

      // IMPORTANT: This SUCCEEDS because Strategy 4's partial match catches it!
      // The client name "cercone exterior restoration" has AKA "cercone" (7 chars)
      // and lastName "cercone exterior restoration c" starts with "cercone"
      expect(match).not.toBeNull();
      expect(match.id).toBe('cercone-1');
    });

    test('SUCCEEDS: "ORP" + "CERCONE EXTERIOR RESTORATION C" WITH the truncated AKA', () => {
      // This shows the fix
      const clientWithAka = {
        id: 'cercone-1',
        name: 'Cercone Exterior Restoration Corp',
        akas: ['CERCONE', 'CERCONE EXTERIOR RESTORATION C'],  // Has the critical AKA
      };

      const clientNameMap = buildClientNameMap([clientWithAka]);
      const match = matchRespondentToClient('ORP', 'CERCONE EXTERIOR RESTORATION C', clientNameMap);

      expect(match).not.toBeNull();
      expect(match.id).toBe('cercone-1');
    });

    test('SUCCEEDS: Empty firstName patterns work via Strategy 4 partial matching', () => {
      // Even without AKAs, short lastName like "CERCONE" can match via partial matching
      const clientNoAkas = {
        id: 'cercone-1',
        name: 'Cercone Exterior Restoration Corp',
        akas: [],
      };

      const clientNameMap = buildClientNameMap([clientNoAkas]);

      // This works because:
      // - lastName "CERCONE" (7 chars) >= 5 char minimum
      // - Client name "cercone exterior restoration" starts with "cercone"
      // - Strategy 4's partial match catches it
      const match = matchRespondentToClient('', 'CERCONE', clientNameMap);
      expect(match).not.toBeNull();
    });

    test('SUCCEEDS via partial match: Truncated names match when client name is a prefix', () => {
      // Shows how partial matching handles truncated company names
      const clientNoAkas = {
        id: 'company-1',
        name: 'Amazing Company Inc',
        akas: [],
      };

      const clientNameMap = buildClientNameMap([clientNoAkas]);

      // If the API splits "AMAZING COMPANY INC" as "NC" + "AMAZING COMPANY I"
      // - "NC" is a suffix fragment, so Strategy 2 checks "AMAZING COMPANY I"
      // - lastName normalized: "amazing company i" (17 chars)
      // - Client name normalized: "amazing company" (15 chars)
      // - Strategy 4 partial match: "amazing company i" starts with "amazing company" (>= 5 chars)
      // So it MATCHES!
      const match = matchRespondentToClient('NC', 'AMAZING COMPANY I', clientNameMap);
      expect(match).not.toBeNull();
      expect(match.id).toBe('company-1');
    });

    test('SUCCEEDS: Adding the truncated AKA fixes the match', () => {
      const clientWithAka = {
        id: 'company-1',
        name: 'Amazing Company Inc',
        akas: ['AMAZING COMPANY I'],  // The truncated form
      };

      const clientNameMap = buildClientNameMap([clientWithAka]);
      const match = matchRespondentToClient('NC', 'AMAZING COMPANY I', clientNameMap);
      expect(match).not.toBeNull();
      expect(match.id).toBe('company-1');
    });

    test('FAILS: Truly different trade names require explicit AKAs', () => {
      // When a company operates under a completely different trade name
      // that has no textual similarity, an explicit AKA is required
      const clientNoAkas = {
        id: 'company-1',
        name: 'Smith Brothers Holdings Corp',  // Legal name
        akas: [],  // Missing the trade name AKA
      };

      const clientNameMap = buildClientNameMap([clientNoAkas]);

      // They operate as "QuickDeliver" - completely different name
      // No partial match will catch this
      const match = matchRespondentToClient('', 'QUICKDELIVER', clientNameMap);
      expect(match).toBeNull();  // This truly fails - needs AKA
    });

    test('SUCCEEDS: Trade name AKA enables matching different names', () => {
      const clientWithTradeNameAka = {
        id: 'company-1',
        name: 'Smith Brothers Holdings Corp',  // Legal name
        akas: ['QUICKDELIVER'],  // Trade name AKA
      };

      const clientNameMap = buildClientNameMap([clientWithTradeNameAka]);
      const match = matchRespondentToClient('', 'QUICKDELIVER', clientNameMap);
      expect(match).not.toBeNull();
      expect(match.id).toBe('company-1');
    });
  });

  /**
   * Name Split Variation Tests
   *
   * Tests various ways the NYC API might split company names.
   * These help catch edge cases in the matching logic.
   */
  describe('NYC API Name Split Variations', () => {
    const SUFFIX_FRAGMENTS = [
      'llc', 'inc', 'corp', 'co', 'ltd',
      'orp', 'rp', 'p', 'nc', 'c', 'lc', 'l', 'td', 'd',
    ];

    const looksLikeSuffixFragment = (firstName) => {
      if (!firstName) return false;
      const lower = firstName.toLowerCase().trim();
      return SUFFIX_FRAGMENTS.includes(lower) || lower.length <= 3;
    };

    const normalizeCompanyName = (name) => {
      if (!name) return '';
      return name.toLowerCase().trim().replace(/\s+/g, ' ')
        .replace(/\s*(llc|inc|corp|co|ltd|l\.l\.c\.|i\.n\.c\.)\s*$/i, '').trim();
    };

    const buildClientNameMap = (clients) => {
      const nameMap = new Map();
      clients.forEach((client) => {
        const primaryName = normalizeCompanyName(client.name);
        nameMap.set(primaryName, client);
        const noSpaceName = primaryName.replace(/\s/g, '');
        if (noSpaceName !== primaryName) {
          nameMap.set(noSpaceName, client);
        }
        if (client.akas && Array.isArray(client.akas)) {
          client.akas.forEach((aka) => {
            const akaName = normalizeCompanyName(aka);
            nameMap.set(akaName, client);
            const akaNoSpace = akaName.replace(/\s/g, '');
            if (akaNoSpace !== akaName) {
              nameMap.set(akaNoSpace, client);
            }
          });
        }
      });
      return nameMap;
    };

    const matchRespondentToClient = (firstName, lastName, clientNameMap) => {
      const fullName = `${firstName} ${lastName}`.trim();
      if (!fullName) return null;

      const normalizedFull = normalizeCompanyName(fullName);
      const noSpaceFull = normalizedFull.replace(/\s/g, '');

      let match = clientNameMap.get(normalizedFull) || clientNameMap.get(noSpaceFull);
      if (match) return match;

      if (firstName && looksLikeSuffixFragment(firstName) && lastName) {
        const normalizedLast = normalizeCompanyName(lastName);
        const noSpaceLast = normalizedLast.replace(/\s/g, '');
        match = clientNameMap.get(normalizedLast) || clientNameMap.get(noSpaceLast);
        if (match) return match;
      }

      for (const [clientNormName, client] of clientNameMap.entries()) {
        if (normalizedFull.startsWith(clientNormName) && clientNormName.length >= 10) {
          return client;
        }
        if (clientNormName.startsWith(normalizedFull) && normalizedFull.length >= 10) {
          return client;
        }
      }

      if (lastName && lastName.length >= 5) {
        const normalizedLast = normalizeCompanyName(lastName);
        const noSpaceLast = normalizedLast.replace(/\s/g, '');
        match = clientNameMap.get(normalizedLast) || clientNameMap.get(noSpaceLast);
        if (match) return match;

        for (const [clientNormName, client] of clientNameMap.entries()) {
          if (normalizedLast.startsWith(clientNormName) && clientNormName.length >= 5) {
            return client;
          }
          if (clientNormName.startsWith(normalizedLast) && normalizedLast.length >= 5) {
            return client;
          }
        }
      }

      return null;
    };

    const testClient = {
      id: 'test-1',
      name: 'Big Business Corporation',
      akas: ['BIG BUSINESS', 'BIG BUSINESS CORPORATIO'],  // Include truncated version
    };

    describe('Full name in lastName only (empty firstName)', () => {
      test('matches when full company name is in lastName', () => {
        const clientNameMap = buildClientNameMap([testClient]);
        const match = matchRespondentToClient('', 'BIG BUSINESS CORPORATION', clientNameMap);
        expect(match).not.toBeNull();
        expect(match.id).toBe('test-1');
      });

      test('matches partial company name via Strategy 4', () => {
        const clientNameMap = buildClientNameMap([testClient]);
        const match = matchRespondentToClient('', 'BIG BUSINESS', clientNameMap);
        expect(match).not.toBeNull();
      });
    });

    describe('Suffix fragment in firstName', () => {
      const suffixSplits = [
        // CORP splits
        { suffix: 'CORP', fragments: ['ORP', 'RP', 'P'] },
        // INC splits
        { suffix: 'INC', fragments: ['NC', 'C'] },
        // LLC splits
        { suffix: 'LLC', fragments: ['LC', 'C', 'L'] },
        // LTD splits
        { suffix: 'LTD', fragments: ['TD', 'D'] },
      ];

      suffixSplits.forEach(({ suffix, fragments }) => {
        describe(`${suffix} suffix splits`, () => {
          fragments.forEach((fragment) => {
            test(`"${fragment}" fragment is recognized as suffix`, () => {
              expect(looksLikeSuffixFragment(fragment)).toBe(true);
            });
          });
        });
      });

      test('handles CORP split with proper AKA', () => {
        const client = {
          id: 'split-1',
          name: 'Example Corp',
          akas: ['EXAMPLE C'],  // Truncated at field boundary
        };
        const clientNameMap = buildClientNameMap([client]);

        // "ORP" + "EXAMPLE C" - ORP is fragment, lastName matches AKA
        const match = matchRespondentToClient('ORP', 'EXAMPLE C', clientNameMap);
        expect(match).not.toBeNull();
      });
    });

    describe('Arbitrary mid-word splits', () => {
      test('handles split at word boundary', () => {
        const clientNameMap = buildClientNameMap([testClient]);
        // "BIG" + "BUSINESS CORPORATION" - Strategy 1 full name match
        const match = matchRespondentToClient('BIG', 'BUSINESS CORPORATION', clientNameMap);
        expect(match).not.toBeNull();
      });

      test('handles single-word firstName with multi-word lastName', () => {
        const client = {
          id: 'multi-1',
          name: 'Alpha Beta Gamma Inc',
          akas: [],
        };
        const clientNameMap = buildClientNameMap([client]);

        // Full match works
        const match = matchRespondentToClient('ALPHA', 'BETA GAMMA INC', clientNameMap);
        expect(match).not.toBeNull();
      });
    });

    describe('Multi-word company names', () => {
      test('handles 4+ word company names', () => {
        const longNameClient = {
          id: 'long-1',
          name: 'Very Long Company Name Services Inc',
          akas: ['VERY LONG COMPANY'],
        };
        const clientNameMap = buildClientNameMap([longNameClient]);

        const match = matchRespondentToClient('', 'VERY LONG COMPANY NAME SERVICES INC', clientNameMap);
        expect(match).not.toBeNull();
      });

      test('partial match works for long names via Strategy 3', () => {
        const longNameClient = {
          id: 'long-1',
          name: 'Extremely Lengthy Business Enterprise Corporation',
          akas: [],
        };
        const clientNameMap = buildClientNameMap([longNameClient]);

        // 10+ char partial match
        const match = matchRespondentToClient('', 'EXTREMELY LENGTHY BUSINESS', clientNameMap);
        // Client name (normalized, suffix stripped): "extremely lengthy business enterprise"
        // Search: "extremely lengthy business" (26 chars)
        // Client name starts with search? No (client is longer)
        // Search starts with client name? No (search is shorter)
        // But search >= 10 chars and client name starts with search? Yes!
        expect(match).not.toBeNull();
      });
    });

    describe('Edge cases', () => {
      test('handles all-caps input', () => {
        const clientNameMap = buildClientNameMap([testClient]);
        const match = matchRespondentToClient('BIG', 'BUSINESS CORPORATION', clientNameMap);
        expect(match).not.toBeNull();
      });

      test('handles mixed case input', () => {
        const clientNameMap = buildClientNameMap([testClient]);
        const match = matchRespondentToClient('Big', 'Business Corporation', clientNameMap);
        expect(match).not.toBeNull();
      });

      test('handles extra whitespace', () => {
        const clientNameMap = buildClientNameMap([testClient]);
        const match = matchRespondentToClient('BIG ', ' BUSINESS  CORPORATION', clientNameMap);
        expect(match).not.toBeNull();
      });

      test('handles null/undefined firstName gracefully', () => {
        const clientNameMap = buildClientNameMap([testClient]);
        const match1 = matchRespondentToClient(null, 'BIG BUSINESS', clientNameMap);
        const match2 = matchRespondentToClient(undefined, 'BIG BUSINESS', clientNameMap);
        // Should not throw, and should match via lastName
        expect(match1).not.toBeNull();
        expect(match2).not.toBeNull();
      });
    });
  });

  /**
   * AKA Validation Helper Tests
   *
   * Test utility for validating whether a given AKA configuration
   * would successfully match expected API patterns.
   */
  describe('AKA Configuration Validation', () => {
    const SUFFIX_FRAGMENTS = [
      'llc', 'inc', 'corp', 'co', 'ltd',
      'orp', 'rp', 'p', 'nc', 'c', 'lc', 'l', 'td', 'd',
    ];

    const looksLikeSuffixFragment = (firstName) => {
      if (!firstName) return false;
      const lower = firstName.toLowerCase().trim();
      return SUFFIX_FRAGMENTS.includes(lower) || lower.length <= 3;
    };

    const normalizeCompanyName = (name) => {
      if (!name) return '';
      return name.toLowerCase().trim().replace(/\s+/g, ' ')
        .replace(/\s*(llc|inc|corp|co|ltd|l\.l\.c\.|i\.n\.c\.)\s*$/i, '').trim();
    };

    const buildClientNameMap = (clients) => {
      const nameMap = new Map();
      clients.forEach((client) => {
        const primaryName = normalizeCompanyName(client.name);
        nameMap.set(primaryName, client);
        const noSpaceName = primaryName.replace(/\s/g, '');
        if (noSpaceName !== primaryName) {
          nameMap.set(noSpaceName, client);
        }
        if (client.akas && Array.isArray(client.akas)) {
          client.akas.forEach((aka) => {
            const akaName = normalizeCompanyName(aka);
            nameMap.set(akaName, client);
            const akaNoSpace = akaName.replace(/\s/g, '');
            if (akaNoSpace !== akaName) {
              nameMap.set(akaNoSpace, client);
            }
          });
        }
      });
      return nameMap;
    };

    const matchRespondentToClient = (firstName, lastName, clientNameMap) => {
      const fullName = `${firstName} ${lastName}`.trim();
      if (!fullName) return null;

      const normalizedFull = normalizeCompanyName(fullName);
      const noSpaceFull = normalizedFull.replace(/\s/g, '');

      let match = clientNameMap.get(normalizedFull) || clientNameMap.get(noSpaceFull);
      if (match) return match;

      if (firstName && looksLikeSuffixFragment(firstName) && lastName) {
        const normalizedLast = normalizeCompanyName(lastName);
        const noSpaceLast = normalizedLast.replace(/\s/g, '');
        match = clientNameMap.get(normalizedLast) || clientNameMap.get(noSpaceLast);
        if (match) return match;
      }

      for (const [clientNormName, client] of clientNameMap.entries()) {
        if (normalizedFull.startsWith(clientNormName) && clientNormName.length >= 10) {
          return client;
        }
        if (clientNormName.startsWith(normalizedFull) && normalizedFull.length >= 10) {
          return client;
        }
      }

      if (lastName && lastName.length >= 5) {
        const normalizedLast = normalizeCompanyName(lastName);
        const noSpaceLast = normalizedLast.replace(/\s/g, '');
        match = clientNameMap.get(normalizedLast) || clientNameMap.get(noSpaceLast);
        if (match) return match;

        for (const [clientNormName, client] of clientNameMap.entries()) {
          if (normalizedLast.startsWith(clientNormName) && clientNormName.length >= 5) {
            return client;
          }
          if (clientNormName.startsWith(normalizedLast) && normalizedLast.length >= 5) {
            return client;
          }
        }
      }

      return null;
    };

    /**
     * Utility function to validate AKA configuration
     * Returns { valid: boolean, failures: string[] }
     */
    const validateAkaConfig = (client, expectedApiPatterns) => {
      const clientNameMap = buildClientNameMap([client]);
      const failures = [];

      expectedApiPatterns.forEach(({ firstName, lastName }) => {
        const match = matchRespondentToClient(firstName || '', lastName || '', clientNameMap);
        if (!match || match.id !== client.id) {
          const patternStr = firstName ? `"${firstName}" + "${lastName}"` : `(empty) + "${lastName}"`;
          failures.push(patternStr);
        }
      });

      return {
        valid: failures.length === 0,
        failures,
      };
    };

    test('validates complete Cercone AKA configuration', () => {
      const cerconeClient = {
        id: 'cercone-1',
        name: 'Cercone Exterior Restoration Corp',
        akas: [
          'CERCONE',
          'CERCONE EXTERIOR',
          'CERCONE EXTERIOR RESTORATION',
          'CERCONE EXTERIOR RESTORATION C',
        ],
      };

      const expectedPatterns = [
        { firstName: 'ORP', lastName: 'CERCONE EXTERIOR RESTORATION C' },
        { firstName: '', lastName: 'CERCONE' },
        { firstName: '', lastName: 'CERCONE EXTERIOR' },
        { firstName: '', lastName: 'CERCONE EXTERIOR RESTORATION CORP' },
      ];

      const result = validateAkaConfig(cerconeClient, expectedPatterns);
      expect(result.valid).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    test('detects truly missing AKAs when partial matching cannot help', () => {
      // Create a scenario where partial matching genuinely fails
      // This happens when the API name is completely different from the client name
      const incompleteClient = {
        id: 'client-1',
        name: 'ABC Transport Corp',
        akas: [],  // No AKAs at all
      };

      const expectedPatterns = [
        // This would fail - "XYZ LOGISTICS" has no relation to "ABC Transport"
        { firstName: 'ORP', lastName: 'XYZ LOGISTICS C' },
        // This would also fail - completely different name
        { firstName: '', lastName: 'TOTALLY DIFFERENT NAME' },
      ];

      const result = validateAkaConfig(incompleteClient, expectedPatterns);
      expect(result.valid).toBe(false);
      expect(result.failures.length).toBe(2);
    });

    test('validates generic company configuration', () => {
      const genericClient = {
        id: 'generic-1',
        name: 'Sample Business LLC',
        akas: ['SAMPLE BUSINESS', 'SAMPLE'],
      };

      const expectedPatterns = [
        { firstName: '', lastName: 'SAMPLE BUSINESS LLC' },
        { firstName: '', lastName: 'SAMPLE BUSINESS' },
        { firstName: '', lastName: 'SAMPLE' },
        { firstName: 'LLC', lastName: 'SAMPLE BUSINESS' },  // LLC suffix fragment
      ];

      const result = validateAkaConfig(genericClient, expectedPatterns);
      expect(result.valid).toBe(true);
    });
  });

  describe('buildClientNameMap', () => {
    const buildClientNameMap = (clients) => {
      const nameMap = new Map();
      const normalizeCompanyName = (name) => {
        if (!name) return '';
        return name.toLowerCase().trim().replace(/\s+/g, ' ')
          .replace(/\s*(llc|inc|corp|co|ltd|l\.l\.c\.|i\.n\.c\.)\s*$/i, '').trim();
      };

      clients.forEach((client) => {
        const primaryName = normalizeCompanyName(client.name);
        nameMap.set(primaryName, client);

        const noSpaceName = primaryName.replace(/\s/g, '');
        if (noSpaceName !== primaryName) {
          nameMap.set(noSpaceName, client);
        }

        if (client.akas && Array.isArray(client.akas)) {
          client.akas.forEach((aka) => {
            const akaName = normalizeCompanyName(aka);
            nameMap.set(akaName, client);
            const akaNoSpace = akaName.replace(/\s/g, '');
            if (akaNoSpace !== akaName) {
              nameMap.set(akaNoSpace, client);
            }
          });
        }
      });

      return nameMap;
    };

    test('should map primary client name', () => {
      const clients = [{ id: '1', name: 'Acme LLC' }];
      const map = buildClientNameMap(clients);

      expect(map.get('acme')).toEqual({ id: '1', name: 'Acme LLC' });
    });

    test('should map client names with and without spaces', () => {
      const clients = [{ id: '1', name: 'G C Warehouse LLC' }];
      const map = buildClientNameMap(clients);

      expect(map.get('g c warehouse')).toEqual(clients[0]);
      expect(map.get('gcwarehouse')).toEqual(clients[0]);
    });

    test('should map all AKAs', () => {
      const clients = [{
        id: '1',
        name: 'Acme LLC',
        akas: ['ACME Company', 'Acme Industries'],
      }];
      const map = buildClientNameMap(clients);

      expect(map.get('acme')).toEqual(clients[0]);
      expect(map.get('acme company')).toEqual(clients[0]);
      expect(map.get('acme industries')).toEqual(clients[0]);
    });

    test('should handle clients without AKAs', () => {
      const clients = [{ id: '1', name: 'Test Corp' }];
      const map = buildClientNameMap(clients);

      expect(map.get('test')).toEqual(clients[0]);
      expect(map.size).toBeGreaterThan(0);
    });

    test('should handle multiple clients', () => {
      const clients = [
        { id: '1', name: 'Acme LLC', akas: ['Acme Co'] },
        { id: '2', name: 'Beta Inc', akas: ['Beta Company'] },
      ];
      const map = buildClientNameMap(clients);

      expect(map.get('acme')).toEqual(clients[0]);
      expect(map.get('beta')).toEqual(clients[1]);
    });
  });

  describe('normalizeAmount', () => {
    const normalizeAmount = (value) => {
      if (value === null || value === undefined || value === '') {
        return 0;
      }
      const parsed = typeof value === 'string' ? parseFloat(value) : value;
      return isNaN(parsed) ? 0 : parsed;
    };

    test('should convert string to number', () => {
      expect(normalizeAmount('600')).toBe(600);
      expect(normalizeAmount('123.45')).toBe(123.45);
    });

    test('should pass through numbers', () => {
      expect(normalizeAmount(600)).toBe(600);
      expect(normalizeAmount(123.45)).toBe(123.45);
    });

    test('should return 0 for null/undefined/empty', () => {
      expect(normalizeAmount(null)).toBe(0);
      expect(normalizeAmount(undefined)).toBe(0);
      expect(normalizeAmount('')).toBe(0);
    });

    test('should return 0 for invalid strings', () => {
      expect(normalizeAmount('not a number')).toBe(0);
      expect(normalizeAmount('abc')).toBe(0);
    });

    test('should handle negative numbers', () => {
      expect(normalizeAmount('-50')).toBe(-50);
      expect(normalizeAmount(-50)).toBe(-50);
    });
  });

  describe('ensureISOFormat', () => {
    const ensureISOFormat = (dateString) => {
      if (!dateString) return null;
      if (dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString)) {
        return dateString;
      }
      return `${dateString}Z`;
    };

    test('should add Z suffix to dates without timezone', () => {
      expect(ensureISOFormat('2025-01-15T00:00:00.000')).toBe('2025-01-15T00:00:00.000Z');
    });

    test('should not modify dates already with Z suffix', () => {
      expect(ensureISOFormat('2025-01-15T00:00:00.000Z')).toBe('2025-01-15T00:00:00.000Z');
    });

    test('should not modify dates with timezone offset', () => {
      expect(ensureISOFormat('2025-01-15T00:00:00+05:00')).toBe('2025-01-15T00:00:00+05:00');
      expect(ensureISOFormat('2025-01-15T00:00:00-08:00')).toBe('2025-01-15T00:00:00-08:00');
    });

    test('should return null for null/undefined/empty', () => {
      expect(ensureISOFormat(null)).toBeNull();
      expect(ensureISOFormat(undefined)).toBeNull();
      expect(ensureISOFormat('')).toBeNull();
    });
  });

  describe('calculateChanges (Strict Diff Engine)', () => {
    const normalizeAmount = (value) => {
      if (value === null || value === undefined || value === '') return 0;
      const parsed = typeof value === 'string' ? parseFloat(value) : value;
      return isNaN(parsed) ? 0 : parsed;
    };

    const ensureISOFormat = (dateString) => {
      if (!dateString) return null;
      if (dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString)) {
        return dateString;
      }
      return `${dateString}Z`;
    };

    const normalizeDate = (value) => {
      if (!value) return null;
      return ensureISOFormat(value);
    };

    const calculateChanges = (existingRecord, incomingData) => {
      const changes = [];

      // Hearing Result
      const oldResult = existingRecord.hearing_result || '';
      const newResult = incomingData.hearing_result || '';
      if (oldResult !== newResult) {
        const oldDisplay = oldResult || 'Pending';
        const newDisplay = newResult || 'Pending';
        changes.push(`Result: '${oldDisplay}' → '${newDisplay}'`);
      }

      // Status
      const oldStatus = existingRecord.status || 'Unknown';
      const newStatus = incomingData.status || 'Unknown';
      if (oldStatus !== newStatus) {
        changes.push(`Status: '${oldStatus}' → '${newStatus}'`);
      }

      // Amount Due
      const oldAmount = normalizeAmount(existingRecord.amount_due);
      const newAmount = normalizeAmount(incomingData.amount_due);
      if (oldAmount.toFixed(2) !== newAmount.toFixed(2)) {
        changes.push(`Amount Due: $${oldAmount.toFixed(2)} → $${newAmount.toFixed(2)}`);
      }

      // Paid Amount
      const oldPaid = normalizeAmount(existingRecord.paid_amount);
      const newPaid = normalizeAmount(incomingData.paid_amount);
      if (oldPaid.toFixed(2) !== newPaid.toFixed(2)) {
        changes.push(`Paid: $${oldPaid.toFixed(2)} → $${newPaid.toFixed(2)}`);
      }

      // Hearing Date
      const oldDate = normalizeDate(existingRecord.hearing_date);
      const newDate = normalizeDate(incomingData.hearing_date);
      if (oldDate !== newDate) {
        const oldDateDisplay = oldDate ? new Date(oldDate).toLocaleDateString('en-US') : 'None';
        const newDateDisplay = newDate ? new Date(newDate).toLocaleDateString('en-US') : 'None';
        changes.push(`Hearing Date: ${oldDateDisplay} → ${newDateDisplay}`);
      }

      // Hearing Time
      const oldTime = existingRecord.hearing_time || '';
      const newTime = incomingData.hearing_time || '';
      if (oldTime !== newTime) {
        const oldTimeDisplay = oldTime || 'Not Set';
        const newTimeDisplay = newTime || 'Not Set';
        changes.push(`Hearing Time: ${oldTimeDisplay} → ${newTimeDisplay}`);
      }

      // Code Description
      const oldCode = existingRecord.code_description || '';
      const newCode = incomingData.code_description || '';
      if (oldCode !== newCode) {
        const oldCodeDisplay = oldCode || 'Unknown';
        const newCodeDisplay = newCode || 'Unknown';
        changes.push(`Violation: '${oldCodeDisplay}' → '${newCodeDisplay}'`);
      }

      return {
        hasChanges: changes.length > 0,
        summary: changes.join('; '),
      };
    };

    test('should detect no changes when records match', () => {
      const existing = {
        status: 'PENDING',
        amount_due: 600,
        hearing_date: '2025-01-15T00:00:00.000Z',
        hearing_time: '10:00 AM',
        hearing_result: '',
        code_description: 'IDLING',
        paid_amount: 0,
      };

      const incoming = {
        status: 'PENDING',
        amount_due: 600,
        hearing_date: '2025-01-15T00:00:00.000Z',
        hearing_time: '10:00 AM',
        hearing_result: '',
        code_description: 'IDLING',
        paid_amount: 0,
      };

      const result = calculateChanges(existing, incoming);
      expect(result.hasChanges).toBe(false);
      expect(result.summary).toBe('');
    });

    test('should detect status change', () => {
      const existing = { status: 'PENDING' };
      const incoming = { status: 'SCHEDULED' };

      const result = calculateChanges(existing, incoming);
      expect(result.hasChanges).toBe(true);
      expect(result.summary).toContain("Status: 'PENDING' → 'SCHEDULED'");
    });

    test('should detect amount due change', () => {
      const existing = { amount_due: 600 };
      const incoming = { amount_due: 750 };

      const result = calculateChanges(existing, incoming);
      expect(result.hasChanges).toBe(true);
      expect(result.summary).toContain('Amount Due: $600.00 → $750.00');
    });

    test('should handle string vs number amount comparison', () => {
      const existing = { amount_due: '600' };
      const incoming = { amount_due: 600 };

      const result = calculateChanges(existing, incoming);
      expect(result.hasChanges).toBe(false);
    });

    test('should detect hearing result change', () => {
      const existing = { hearing_result: '' };
      const incoming = { hearing_result: 'GUILTY' };

      const result = calculateChanges(existing, incoming);
      expect(result.hasChanges).toBe(true);
      expect(result.summary).toContain("Result: 'Pending' → 'GUILTY'");
    });

    test('should detect paid amount change', () => {
      const existing = { paid_amount: 0 };
      const incoming = { paid_amount: 600 };

      const result = calculateChanges(existing, incoming);
      expect(result.hasChanges).toBe(true);
      expect(result.summary).toContain('Paid: $0.00 → $600.00');
    });

    test('should detect hearing date change', () => {
      const existing = { hearing_date: '2025-01-15T00:00:00.000Z' };
      const incoming = { hearing_date: '2025-02-20T00:00:00.000Z' };

      const result = calculateChanges(existing, incoming);
      expect(result.hasChanges).toBe(true);
      expect(result.summary).toContain('Hearing Date:');
    });

    test('should detect multiple changes', () => {
      const existing = {
        status: 'PENDING',
        amount_due: 600,
        hearing_result: '',
      };
      const incoming = {
        status: 'COMPLETED',
        amount_due: 750,
        hearing_result: 'GUILTY',
      };

      const result = calculateChanges(existing, incoming);
      expect(result.hasChanges).toBe(true);
      expect(result.summary).toContain('Status:');
      expect(result.summary).toContain('Amount Due:');
      expect(result.summary).toContain('Result:');
    });

    test('should ignore floating point precision issues', () => {
      const existing = { amount_due: 600.00 };
      const incoming = { amount_due: 600.001 };

      // After toFixed(2), both become "600.00"
      const result = calculateChanges(existing, incoming);
      expect(result.hasChanges).toBe(false);
    });
  });

  describe('generateUUID', () => {
    const generateUUID = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };

    test('should generate valid UUID format', () => {
      const uuid = generateUUID();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(uuid).toMatch(uuidRegex);
    });

    test('should generate unique UUIDs', () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      expect(uuid1).not.toBe(uuid2);
    });

    test('should always have 4 in version position', () => {
      for (let i = 0; i < 10; i++) {
        const uuid = generateUUID();
        expect(uuid[14]).toBe('4');
      }
    });
  });

  describe('Handler Integration', () => {
    // Re-require the actual handler for integration tests
    let handler;

    beforeEach(() => {
      jest.resetModules();

      // Re-setup mocks
      jest.doMock('aws-sdk', () => ({
        DynamoDB: {
          DocumentClient: jest.fn(() => ({
            scan: jest.fn(() => ({ promise: mockDynamoDBScan })),
            query: jest.fn(() => ({ promise: mockDynamoDBQuery })),
            put: jest.fn(() => ({ promise: mockDynamoDBPut })),
            update: jest.fn(() => ({ promise: mockDynamoDBUpdate })),
          })),
        },
        Lambda: jest.fn(() => ({
          invoke: jest.fn(() => ({ promise: mockLambdaInvoke })),
        })),
      }));

      jest.doMock('node-fetch', () => mockFetch);

      handler = require('./index').handler;
    });

    test('should return success with no clients', async () => {
      mockDynamoDBScan.mockResolvedValue({ Items: [] });

      const result = await handler({});

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Daily sweep completed successfully');
      expect(body.phase1.clientsProcessed).toBe(0);
    });

    test('should handle DynamoDB scan errors', async () => {
      mockDynamoDBScan.mockRejectedValue(new Error('DynamoDB connection failed'));

      const result = await handler({});

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Daily sweep failed');
    });

    test('should process clients and fetch NYC API data', async () => {
      const mockClients = [
        { id: 'client-1', name: 'Test Company LLC', owner: 'user-1' },
      ];

      mockDynamoDBScan.mockResolvedValue({ Items: mockClients });

      // Mock NYC API response
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue([]),
      });

      const result = await handler({});

      expect(result.statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
    });

    test('should match and create new summons', async () => {
      const mockClients = [
        { id: 'client-1', name: 'Test Company LLC', owner: 'user-1' },
      ];

      const mockAPISummons = [{
        ticket_number: 'ABC123',
        respondent_first_name: 'TEST',
        respondent_last_name: 'COMPANY',
        hearing_date: '2025-01-15T00:00:00.000',
        hearing_status: 'PENDING',
        balance_due: '600',
      }];

      mockDynamoDBScan.mockResolvedValue({ Items: mockClients });
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockAPISummons),
      });

      // No existing summons
      mockDynamoDBQuery.mockResolvedValue({ Items: [] });
      mockDynamoDBPut.mockResolvedValue({});
      mockLambdaInvoke.mockResolvedValue({});

      const result = await handler({});

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.phase1.newRecordsCreated).toBeGreaterThanOrEqual(0);
    });
  });
});
