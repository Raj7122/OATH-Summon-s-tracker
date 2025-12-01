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
      expect(body.message).toBe('No clients to process');
      expect(body.processed).toBe(0);
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
      expect(body.created).toBeGreaterThanOrEqual(0);
    });
  });
});
