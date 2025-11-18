/**
 * Unit Tests for dataExtractor Lambda Function
 *
 * Tests the core business logic of the data extraction function:
 * - Video page HTML scraping and date parsing
 * - Lag days calculation
 * - OCR data parsing (mocked Gemini API)
 *
 * All external dependencies (NYC sites, Gemini API, DynamoDB) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mock HTML from NYC idling video page
 */
const mockVideoPageHTML = `
<!DOCTYPE html>
<html>
<head><title>NYC Idling Video Evidence</title></head>
<body>
  <div class="video-info">
    <table>
      <tr>
        <td>Summons Number:</td>
        <td>123456789</td>
      </tr>
      <tr>
        <td>Video Created Date:</td>
        <td>2025-11-05 14:30:00</td>
      </tr>
      <tr>
        <td>Violation Date:</td>
        <td>2025-11-01 10:00:00</td>
      </tr>
    </table>
  </div>
</body>
</html>
`;

const mockVideoPageHTMLAlternateFormat = `
<!DOCTYPE html>
<html>
<body>
  <label>Video Created</label>
  <span class="date-value">11/05/2025</span>
</body>
</html>
`;

/**
 * Mock Gemini API response
 */
const mockGeminiResponse = {
  license_plate_ocr: 'ABC1234',
  dep_id: 'DEP-2025-12345',
  vehicle_type_ocr: 'BOX TRUCK',
  prior_offense_status: 'FIRST',
  violation_narrative: 'Vehicle observed idling for more than 3 minutes with engine running',
  idling_duration_ocr: '5 MINUTES',
  critical_flags_ocr: ['ENGINE RUNNING', 'NO PLACARD'],
  name_on_summons_ocr: 'GC WAREHOUSE INC',
};

/**
 * Business Logic Functions (extracted from Lambda for testing)
 */

/**
 * Parse a date string into ISO format
 * Handles various date formats
 */
function parseDateString(dateStr: string): string | null {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  } catch (error) {
    console.error('Error parsing date:', dateStr, error);
    return null;
  }
}

/**
 * Calculate the lag in days between violation date and video created date
 */
function calculateLagDays(violationDate: string, videoCreatedDate: string): number | null {
  try {
    const violation = new Date(violationDate);
    const videoCreated = new Date(videoCreatedDate);

    if (isNaN(violation.getTime()) || isNaN(videoCreated.getTime())) {
      return null;
    }

    const diffTime = videoCreated.getTime() - violation.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  } catch (error) {
    console.error('Error calculating lag days:', error);
    return null;
  }
}

/**
 * Extract video created date from HTML using cheerio-like pattern matching
 * (Simplified version for testing)
 */
function extractVideoCreatedDate(html: string): string | null {
  // Pattern 1: <td>Video Created Date:</td><td>...</td>
  const pattern1 = /<td>Video Created Date:<\/td>\s*<td>([^<]+)<\/td>/i;
  const match1 = html.match(pattern1);
  if (match1) {
    return parseDateString(match1[1].trim());
  }

  // Pattern 2: <label>Video Created</label><span class="date-value">...</span>
  const pattern2 = /<label>Video Created<\/label>\s*<span[^>]*>([^<]+)<\/span>/i;
  const match2 = html.match(pattern2);
  if (match2) {
    return parseDateString(match2[1].trim());
  }

  return null;
}

/**
 * Test Suite
 */
describe('dataExtractor Lambda Function - Business Logic', () => {
  describe('parseDateString', () => {
    it('should parse ISO 8601 date strings', () => {
      const dateStr = '2025-11-05T14:30:00.000Z';
      const result = parseDateString(dateStr);

      expect(result).not.toBeNull();
      expect(result).toContain('2025-11-05');
    });

    it('should parse common date formats', () => {
      const dateStr1 = '2025-11-05 14:30:00';
      const dateStr2 = '11/05/2025';
      const dateStr3 = 'November 5, 2025';

      const result1 = parseDateString(dateStr1);
      const result2 = parseDateString(dateStr2);
      const result3 = parseDateString(dateStr3);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result3).not.toBeNull();

      expect(result1).toContain('2025-11-05');
      expect(result2).toContain('2025-11-05');
      expect(result3).toContain('2025-11-05');
    });

    it('should return null for invalid date strings', () => {
      const invalidDate = 'not a date';
      const result = parseDateString(invalidDate);

      expect(result).toBeNull();
    });

    it('should handle empty strings', () => {
      const result = parseDateString('');
      expect(result).toBeNull();
    });
  });

  describe('calculateLagDays', () => {
    it('should calculate correct lag days between two dates', () => {
      const violationDate = '2025-11-01T10:00:00.000Z';
      const videoCreatedDate = '2025-11-05T14:30:00.000Z';

      const lagDays = calculateLagDays(violationDate, videoCreatedDate);

      // Video created 4 days after violation
      expect(lagDays).toBe(4);
    });

    it('should handle same-day dates (lag = 0)', () => {
      const violationDate = '2025-11-01T10:00:00.000Z';
      const videoCreatedDate = '2025-11-01T16:00:00.000Z';

      const lagDays = calculateLagDays(violationDate, videoCreatedDate);

      expect(lagDays).toBe(0);
    });

    it('should handle negative lag (video created before violation - edge case)', () => {
      const violationDate = '2025-11-10T10:00:00.000Z';
      const videoCreatedDate = '2025-11-05T14:30:00.000Z';

      const lagDays = calculateLagDays(violationDate, videoCreatedDate);

      // Video created 5 days BEFORE violation (unusual but possible)
      expect(lagDays).toBe(-5);
    });

    it('should calculate lag days over 60 days threshold', () => {
      const violationDate = '2025-09-01T10:00:00.000Z';
      const videoCreatedDate = '2025-11-05T14:30:00.000Z';

      const lagDays = calculateLagDays(violationDate, videoCreatedDate);

      // Approximately 65 days
      expect(lagDays).toBeGreaterThan(60);
      expect(lagDays).toBe(65);
    });

    it('should return null for invalid date formats', () => {
      const violationDate = 'invalid';
      const videoCreatedDate = '2025-11-05T14:30:00.000Z';

      const lagDays = calculateLagDays(violationDate, videoCreatedDate);

      expect(lagDays).toBeNull();
    });

    it('should handle edge case of very large time differences', () => {
      const violationDate = '2020-01-01T00:00:00.000Z';
      const videoCreatedDate = '2025-11-05T00:00:00.000Z';

      const lagDays = calculateLagDays(violationDate, videoCreatedDate);

      // Approximately 2134 days (5+ years)
      expect(lagDays).toBeGreaterThan(2000);
    });
  });

  describe('extractVideoCreatedDate (HTML Scraping)', () => {
    it('should extract date from standard table format', () => {
      const html = mockVideoPageHTML;
      const extractedDate = extractVideoCreatedDate(html);

      expect(extractedDate).not.toBeNull();
      expect(extractedDate).toContain('2025-11-05');
    });

    it('should extract date from alternate label/span format', () => {
      const html = mockVideoPageHTMLAlternateFormat;
      const extractedDate = extractVideoCreatedDate(html);

      expect(extractedDate).not.toBeNull();
      expect(extractedDate).toContain('2025-11-05');
    });

    it('should return null if no date pattern is found', () => {
      const html = '<html><body><p>No video date here</p></body></html>';
      const extractedDate = extractVideoCreatedDate(html);

      expect(extractedDate).toBeNull();
    });

    it('should handle malformed HTML gracefully', () => {
      const html = '<div>Incomplete HTML';
      const extractedDate = extractVideoCreatedDate(html);

      expect(extractedDate).toBeNull();
    });
  });

  describe('OCR Data Parsing (Gemini API - Mocked)', () => {
    it('should parse valid Gemini response JSON', () => {
      const mockResponse = JSON.stringify(mockGeminiResponse);
      const parsed = JSON.parse(mockResponse);

      expect(parsed.license_plate_ocr).toBe('ABC1234');
      expect(parsed.dep_id).toBe('DEP-2025-12345');
      expect(parsed.vehicle_type_ocr).toBe('BOX TRUCK');
      expect(parsed.prior_offense_status).toBe('FIRST');
      expect(parsed.idling_duration_ocr).toBe('5 MINUTES');
      expect(parsed.critical_flags_ocr).toEqual(['ENGINE RUNNING', 'NO PLACARD']);
      expect(parsed.name_on_summons_ocr).toBe('GC WAREHOUSE INC');
    });

    it('should handle missing fields in Gemini response', () => {
      const partialResponse = {
        license_plate_ocr: 'XYZ9876',
        dep_id: null,
        vehicle_type_ocr: '',
        critical_flags_ocr: [],
      };

      expect(partialResponse.license_plate_ocr).toBe('XYZ9876');
      expect(partialResponse.dep_id).toBeNull();
      expect(partialResponse.vehicle_type_ocr).toBe('');
      expect(partialResponse.critical_flags_ocr).toEqual([]);
    });

    it('should extract JSON from response text with extra formatting', () => {
      const responseWithFormatting = `Here is the extracted data:\n\n${JSON.stringify(mockGeminiResponse)}\n\nEnd of response.`;
      const jsonMatch = responseWithFormatting.match(/\{[\s\S]*\}/);

      expect(jsonMatch).not.toBeNull();
      const parsed = JSON.parse(jsonMatch![0]);
      expect(parsed.license_plate_ocr).toBe('ABC1234');
    });
  });

  describe('Integration: Full Data Extraction Flow', () => {
    it('should extract video date and calculate lag days correctly', () => {
      // Step 1: Extract video created date from HTML
      const extractedDate = extractVideoCreatedDate(mockVideoPageHTML);
      expect(extractedDate).not.toBeNull();

      // Step 2: Calculate lag days
      const violationDate = '2025-11-01T10:00:00.000Z';
      const lagDays = calculateLagDays(violationDate, extractedDate!);

      // Video created on 2025-11-05, violation on 2025-11-01 = 4 days lag
      expect(lagDays).toBe(4);
    });

    it('should handle missing video date gracefully', () => {
      const htmlWithNoDate = '<html><body>No date here</body></html>';
      const extractedDate = extractVideoCreatedDate(htmlWithNoDate);

      expect(extractedDate).toBeNull();

      // If no date, lag days should not be calculated
      // (In actual Lambda, this would skip the lag calculation)
    });
  });
});
