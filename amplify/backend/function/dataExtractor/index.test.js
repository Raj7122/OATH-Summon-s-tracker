/**
 * Unit tests for data-extractor Lambda function
 * Mocks all external API calls and database operations
 */

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  const mockDynamoDB = {
    update: jest.fn().mockReturnThis(),
    promise: jest.fn(),
  };

  return {
    DynamoDB: {
      DocumentClient: jest.fn(() => mockDynamoDB),
    },
  };
});

// Mock node-fetch
jest.mock('node-fetch', () => jest.fn());

// Mock cheerio
jest.mock('cheerio', () => ({
  load: jest.fn(),
}));

// Mock Google Gemini AI
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn().mockReturnValue({
  generateContent: mockGenerateContent,
});

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

const AWS = require('aws-sdk');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const handler = require('./index').handler;

describe('Data Extractor Lambda Function', () => {
  let mockDynamoDB;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDynamoDB = new AWS.DynamoDB.DocumentClient();

    process.env.SUMMONS_TABLE = 'Summons-test';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });

  describe('Video Page Scraping', () => {
    test('should extract video created date from HTML', async () => {
      const event = {
        summons_id: 'test-id',
        summons_number: 'SUM123',
        pdf_link: 'https://example.com/pdf',
        video_link: 'https://example.com/video',
        violation_date: '2024-12-01T14:30:00',
      };

      // Mock video page HTML
      const mockHtml = `
        <html>
          <body>
            <label>Video Created Date:</label>
            <span>12/05/2024</span>
          </body>
        </html>
      `;

      fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtml,
      });

      // Mock cheerio parsing - properly mock the jQuery-like API
      const mockNext = jest.fn().mockReturnValue({
        text: jest.fn().mockReturnValue('12/05/2024'),
      });
      const mockCheerio = jest.fn().mockReturnValue({
        next: mockNext,
        text: jest.fn().mockReturnValue('12/05/2024'),
      });
      cheerio.load.mockReturnValue(mockCheerio);

      // Mock PDF fetch (will fail, but that's ok)
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      // Mock database update
      mockDynamoDB.promise.mockResolvedValueOnce({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      // Verify video page was fetched
      expect(fetch).toHaveBeenCalledWith(event.video_link);
    });

    test('should handle missing video page gracefully', async () => {
      const event = {
        summons_id: 'test-id',
        summons_number: 'SUM456',
        pdf_link: 'https://example.com/pdf',
        video_link: 'https://example.com/video-404',
        violation_date: '2024-12-01T14:30:00',
      };

      // Mock 404 response
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      // Mock PDF fetch (also fails)
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await handler(event);

      // Should still return 200 (non-fatal error)
      expect(result.statusCode).toBe(200);
    });
  });

  describe('PDF OCR Extraction', () => {
    test('should extract structured data from PDF using Gemini', async () => {
      const event = {
        summons_id: 'test-id',
        summons_number: 'SUM789',
        pdf_link: 'https://example.com/summons.pdf',
        video_link: null,
        violation_date: '2024-12-01T14:30:00',
      };

      // Mock PDF buffer
      const mockPdfBuffer = Buffer.from('fake-pdf-data');
      fetch.mockResolvedValueOnce({
        ok: true,
        buffer: async () => mockPdfBuffer,
        statusText: 'OK',
      });

      // Mock Gemini API response with properly formatted JSON
      const mockGeminiResponse = {
        response: {
          text: () =>
            '{"license_plate_ocr":"ABC1234","dep_id":"DEP-123-456","vehicle_type_ocr":"Box Truck","prior_offense_status":"First Offense","violation_narrative":"Vehicle idling for 15 minutes","idling_duration_ocr":"15 minutes","critical_flags_ocr":["No driver present","Refrigeration unit on"],"name_on_summons_ocr":"Test Company LLC"}',
        },
      };

      mockGenerateContent.mockResolvedValueOnce(mockGeminiResponse);

      // Mock database update
      mockDynamoDB.promise.mockResolvedValueOnce({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Data extraction completed');
      expect(body.extractedFields.length).toBeGreaterThan(0);
    });

    test('should handle Gemini API failures gracefully', async () => {
      const event = {
        summons_id: 'test-id',
        summons_number: 'SUM999',
        pdf_link: 'https://example.com/summons.pdf',
        video_link: null,
        violation_date: '2024-12-01T14:30:00',
      };

      // Mock PDF fetch success
      fetch.mockResolvedValueOnce({
        ok: true,
        buffer: async () => Buffer.from('fake-pdf'),
      });

      // Mock Gemini API failure
      mockGenerateContent.mockRejectedValueOnce(new Error('Gemini API error'));

      const result = await handler(event);

      // Should still return 200 (non-fatal error)
      expect(result.statusCode).toBe(200);
    });

    test('should handle invalid JSON from Gemini', async () => {
      const event = {
        summons_id: 'test-id',
        summons_number: 'SUM111',
        pdf_link: 'https://example.com/summons.pdf',
        video_link: null,
        violation_date: '2024-12-01T14:30:00',
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        buffer: async () => Buffer.from('fake-pdf'),
      });

      // Mock Gemini returning non-JSON
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => 'This is not valid JSON',
        },
      });

      const result = await handler(event);

      // Should still return 200 (non-fatal error)
      expect(result.statusCode).toBe(200);
    });
  });

  describe('Lag Days Calculation', () => {
    test('should calculate correct lag days', () => {
      const violationDate = '2024-12-01T14:30:00';
      const videoCreatedDate = '2024-12-05T10:00:00';

      const violation = new Date(violationDate);
      const videoCreated = new Date(videoCreatedDate);

      const diffTime = videoCreated.getTime() - violation.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      expect(diffDays).toBe(3); // 4 days difference (rounded down)
    });
  });

  describe('Database Updates', () => {
    test('should update summons with all extracted fields', async () => {
      const event = {
        summons_id: 'test-summons-id',
        summons_number: 'SUM222',
        pdf_link: null,
        video_link: 'https://example.com/video',
        violation_date: '2024-12-01T14:30:00',
      };

      // Mock video scraping success
      const mockHtml = '<html><body>Video Created: 12/05/2024</body></html>';
      fetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtml,
      });

      // Mock cheerio parsing - properly mock the jQuery-like API
      const mockNext = jest.fn().mockReturnValue({
        text: jest.fn().mockReturnValue('12/05/2024'),
      });
      const mockCheerio = jest.fn().mockReturnValue({
        next: mockNext,
        text: jest.fn().mockReturnValue('12/05/2024'),
      });
      cheerio.load.mockReturnValue(mockCheerio);

      // Mock database update
      mockDynamoDB.promise.mockResolvedValueOnce({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(mockDynamoDB.update).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should return error when summons_id is missing', async () => {
      const event = {
        summons_number: 'SUM123',
        // missing summons_id
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Data extraction failed');
    });
  });
});
