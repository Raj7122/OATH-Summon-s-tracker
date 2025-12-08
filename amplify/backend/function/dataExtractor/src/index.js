/**
 * NYC OATH Summons Tracker - Data Extractor Lambda Function
 *

* This function is invoked by the dailySweep Phase 2 Priority Queue.
 * It performs:
 *   1. Safety check: Skip if violation_narrative already exists (immutability)
 *   2. Web scraping of the video page to extract "Video Created Date"
 *   3. PDF OCR using Google Gemini API to extract structured data
 *   4. Updates the summons record with all extracted data
 *
 * CONSTRAINTS (from Priority Queue Strategy):
 * - Daily Quota: 500 OCR requests max (enforced by dailySweep)
 * - Rate Limit: 2 seconds between requests (enforced by dailySweep)
 * - Immutability: Never re-OCR a successfully processed PDF
 *
 * FR-09: Automated Data Extraction (OCR & Scraper)
 */

const AWS = require('aws-sdk');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const dynamodb = new AWS.DynamoDB.DocumentClient();

// Environment variables (configured in AWS Console)
const SUMMONS_TABLE = process.env.SUMMONS_TABLE || 'Summons-dev';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Retry configuration for NYC PDF server (often rate-limits or times out)
const MAX_FETCH_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000; // Start with 1 second
const MAX_RETRY_DELAY_MS = 10000; // Cap at 10 seconds

// Initialize Google Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * Main handler for the data extractor Lambda function
 */
exports.handler = async (event) => {
  console.log('Starting data extraction...', JSON.stringify(event));

  try {
    // Parse DynamoDB Stream event format
    let summons_id, summons_number, pdf_link, video_link, violation_date;
    let healingMode = false; // Backend flag to force re-OCR on partial records

    if (event.Records && event.Records.length > 0) {
      // DynamoDB Stream trigger format
      const record = event.Records[0];
      const newImage = record.dynamodb.NewImage;

      // Unmarshall DynamoDB attribute values
      summons_id = newImage.id?.S;
      summons_number = newImage.summons_number?.S;
      pdf_link = newImage.summons_pdf_link?.S;
      video_link = newImage.video_link?.S;
      violation_date = newImage.violation_date?.S;

      console.log('Parsed DynamoDB stream event:', { summons_id, summons_number, pdf_link, video_link });
    } else {
      // Direct invocation format (for testing or healing)
      ({ summons_id, summons_number, pdf_link, video_link, violation_date, healingMode } = event);
      healingMode = healingMode || false;
      console.log('Direct invocation event:', { summons_id, summons_number, pdf_link, video_link, healingMode });
    }

    if (!summons_id || !summons_number) {
      throw new Error('Missing required parameters: summons_id or summons_number');
    }

    // SAFETY CHECK: Fetch current record to verify it hasn't been OCR'd already
    // This prevents wasting OCR credits on already-processed records
    const existingRecord = await fetchExistingRecord(summons_id);

    // Check if record needs healing (has violation_narrative but missing key OCR fields)
    const needsHealing = existingRecord &&
      existingRecord.violation_narrative &&
      existingRecord.violation_narrative.length > 0 &&
      (!existingRecord.id_number || !existingRecord.license_plate_ocr);

    // Skip if already fully OCR'd, UNLESS healing mode is enabled for partial records
    if (existingRecord && existingRecord.violation_narrative && existingRecord.violation_narrative.length > 0) {
      if (healingMode && needsHealing) {
        // Healing mode: Allow re-OCR for records with partial data
        console.log(`HEALING MODE: ${summons_number} has partial OCR data, re-extracting...`);
        console.log(`  - Missing id_number: ${!existingRecord.id_number}`);
        console.log(`  - Missing license_plate_ocr: ${!existingRecord.license_plate_ocr}`);
      } else if (healingMode && !needsHealing) {
        // Healing mode but record is already complete
        console.log(`SKIPPED (healing): ${summons_number} already fully OCR'd`);
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Skipped - already fully OCR\'d',
            summons_id,
            skipped: true,
            hasOCRData: true, // Signal success to dailySweep
          }),
        };
      } else {
        // Normal mode: Skip any record with existing OCR data
        console.log(`SKIPPED: ${summons_number} already has OCR data (immutability check)`);
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Skipped - already has OCR data',
            summons_id,
            skipped: true,
            hasOCRData: true, // Signal success to dailySweep (fixes failure count bug)
          }),
        };
      }
    }

    const extractedData = {};

    // Part A: Web Scraper - Extract Video Created Date
    if (video_link) {
      try {
        const videoData = await scrapeVideoPage(video_link);
        if (videoData.video_created_date) {
          extractedData.video_created_date = videoData.video_created_date;

          // Calculate lag days if we have both dates
          if (violation_date) {
            const lagDays = calculateLagDays(violation_date, videoData.video_created_date);
            extractedData.lag_days = lagDays;
          }
        }
        console.log('Video scraping completed:', videoData);
      } catch (error) {
        console.error('Video scraping failed (non-fatal):', error.message);
        // Continue processing even if video scraping fails
      }
    }

    // Part B: PDF OCR - Extract data using Google Gemini
    if (pdf_link) {
      try {
        const ocrData = await extractPDFData(pdf_link);
        Object.assign(extractedData, ocrData);
        console.log('PDF OCR completed:', ocrData);
      } catch (error) {
        console.error('PDF OCR failed (non-fatal):', error.message);
        // Continue processing even if OCR fails
      }
    }

    // Part C: Update Database with extracted data and add activity log entry
    if (Object.keys(extractedData).length > 0) {
      // Create activity log entry for OCR completion
      const activityEntry = {
        date: new Date().toISOString(),
        type: 'OCR_COMPLETE',
        description: `Document scan completed. Extracted: ${Object.keys(extractedData).filter(k => extractedData[k]).join(', ')}`,
        old_value: null,
        new_value: extractedData.violation_narrative ? extractedData.violation_narrative.substring(0, 100) + '...' : 'Data extracted',
      };

      await updateSummonsWithExtractedDataAndLog(summons_id, extractedData, activityEntry);
      console.log(`Updated summons ${summons_number} with extracted data and activity log`);
    } else {
      console.log('No data extracted, skipping database update');
    }

    // Check if we extracted meaningful OCR data (beyond just video scraping)
    const hasOCRData = !!(
      extractedData.violation_narrative ||
      extractedData.license_plate_ocr ||
      extractedData.id_number ||
      extractedData.vehicle_type_ocr
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: hasOCRData ? 'Data extraction completed' : 'No OCR data extracted',
        summons_id,
        extractedFields: Object.keys(extractedData),
        hasOCRData, // Flag for dailySweep to know if OCR succeeded
      }),
    };
  } catch (error) {
    // Critical error logging (TRD Section 18, Rule 1)
    console.error('Data extraction failed:', error);
    console.error('Error stack:', error.stack);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Data extraction failed',
        message: error.message,
      }),
    };
  }
};

/**
 * Scrape the NYC idling video page to extract "Video Created Date"
 * Uses cheerio for HTML parsing
 *
 * @param {string} videoUrl - URL of the video page
 * @returns {Promise<Object>} Extracted video data
 */
async function scrapeVideoPage(videoUrl) {
  try {
    // Use retry logic for video page fetch as well
    const response = await fetchWithRetry(videoUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Find the "Video Created Date" element
    // This selector may need adjustment based on actual HTML structure
    let videoCreatedDate = null;

    // Common patterns to look for
    const datePatterns = [
      () => $('label:contains("Video Created")').next().text(),
      () => $('td:contains("Video Created")').next().text(),
      () => $('[id*="videoCreated"]').text(),
      () => $('[class*="video-created"]').text(),
    ];

    for (const pattern of datePatterns) {
      const dateText = pattern();
      if (dateText && dateText.trim()) {
        videoCreatedDate = parseDateString(dateText.trim());
        if (videoCreatedDate) break;
      }
    }

    return { video_created_date: videoCreatedDate };
  } catch (error) {
    console.error('Error scraping video page:', error);
    throw new Error(`Video scraping failed: ${error.message}`);
  }
}

/**
 * Fetch with retry and exponential backoff
 * Handles connection resets and rate limiting from NYC PDF server
 *
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<Response>} Fetch response
 */
async function fetchWithRetry(url, options = {}, maxRetries = MAX_FETCH_RETRIES) {
  let lastError;
  let delay = INITIAL_RETRY_DELAY_MS;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

      // Non-retryable HTTP error (4xx)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Server error (5xx) - retryable
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      console.log(`Fetch attempt ${attempt}/${maxRetries} failed with ${response.status}, retrying in ${delay}ms...`);
    } catch (error) {
      lastError = error;

      // Check if this is a retryable error
      const isRetryable =
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED' ||
        error.type === 'system' ||
        error.name === 'AbortError' ||
        error.message.includes('socket hang up') ||
        error.message.includes('network');

      if (!isRetryable || attempt === maxRetries) {
        throw lastError;
      }

      console.log(`Fetch attempt ${attempt}/${maxRetries} failed: ${error.message}, retrying in ${delay}ms...`);
    }

    // Wait before retry with exponential backoff
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS); // Exponential backoff capped at max
  }

  throw lastError;
}

/**
 * Extract structured data from PDF using Google Gemini API
 *
 * @param {string} pdfUrl - URL of the PDF summons
 * @returns {Promise<Object>} Extracted OCR data
 */
async function extractPDFData(pdfUrl) {
  try {
    // Fetch the PDF as a buffer with retry logic
    const response = await fetchWithRetry(pdfUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const pdfBuffer = await response.buffer();

    // Convert PDF buffer to base64 for Gemini API
    const pdfBase64 = pdfBuffer.toString('base64');

    // Initialize Gemini model for OCR
    // Using gemini-2.5-flash - best accuracy, no rate limit issues on this account
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash'
    });

    // Prompt for structured extraction (from TRD FR-09)
    // ID Number format: YYYY-NNNNN or YYYY-NNNNNN (4-digit year, hyphen, 5 or 6 digits)
    const prompt = `You are an expert legal assistant analyzing a NYC OATH summons PDF for an idling violation. Extract the following fields and return ONLY a valid JSON object with no additional text or formatting:

{
  "license_plate_ocr": "license plate number",
  "id_number": "Look for the field labeled 'ID Number:' on the document. Format is YYYY-NNNNN or YYYY-NNNNNN (4-digit year, hyphen, then 5 or 6 digits). Examples: '2025-30846', '2025-030846'. CRITICAL: Only look for 'ID Number:' label - do NOT use any other field.",
  "vehicle_type_ocr": "vehicle type (e.g., truck, van, car)",
  "prior_offense_status": "first offense, repeat offense, or unknown",
  "violation_narrative": "brief description of the violation",
  "idling_duration_ocr": "how long the vehicle was idling (e.g., '15 minutes')",
  "critical_flags_ocr": ["array of important flags like 'refrigeration unit', 'no driver present', etc."],
  "name_on_summons_ocr": "respondent/company name on the summons"
}

CRITICAL DISTINCTION - ID Number vs Summons Number:
- ID Number (what we want): Look for "ID Number:" label. Format is 4-digit year, hyphen, then 5 or 6 digits (e.g., '2025-30846' or '2025-030846')
- Summons Number (DO NOT USE): Format 9 digits + 1 letter (e.g., '000954041L', '000969803K')

If you see a 9-digit number followed by a letter, that is the Summons Number - DO NOT return it as id_number.
Only return id_number if it matches the pattern: 4 digits, hyphen, 5 or 6 digits.

Return ONLY the JSON object. If a field cannot be determined, use null or an empty string.`;

    // Generate content using Gemini
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: pdfBase64,
        },
      },
    ]);

    const responseText = result.response.text();
    console.log('Gemini API response:', responseText);

    // Parse the JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in Gemini response');
    }

    const ocrData = JSON.parse(jsonMatch[0]);

    // Validate and sanitize id_number field
    // MUST match pattern YYYY-NNNNN or YYYY-NNNNNN (e.g., 2025-30846 or 2025-030846)
    // MUST NOT match summons number pattern (9 digits + 1 letter)
    // Note: Gemini sometimes returns this as "dep_id" instead of "id_number", so check both
    let validatedIdNumber = null;
    const rawIdNumber = ocrData.id_number || ocrData.dep_id || null;

    if (rawIdNumber) {
      // Pattern for valid ID Number: exactly 4 digits, hyphen, 5 or 6 digits
      const validIdPattern = /^\d{4}-\d{5,6}$/;
      // Pattern for invalid Summons Number: 9+ digits followed by optional letter
      const invalidSummonsPattern = /^\d{9,}\d*[A-Za-z]?$/;

      if (validIdPattern.test(rawIdNumber)) {
        // Valid ID Number format
        validatedIdNumber = rawIdNumber;
        console.log(`ID Number validated: ${rawIdNumber}`);
      } else if (invalidSummonsPattern.test(rawIdNumber)) {
        // This is a summons number, not an ID number - reject it
        console.warn(`REJECTED: "${rawIdNumber}" matches Summons Number format, not ID Number`);
        validatedIdNumber = null;
      } else {
        // Unknown format - reject to be safe
        console.warn(`REJECTED: "${rawIdNumber}" does not match expected ID Number format YYYY-NNNNN or YYYY-NNNNNN`);
        validatedIdNumber = null;
      }
    }

    // Return with consistent field names
    return {
      license_plate_ocr: ocrData.license_plate_ocr || null,
      id_number: validatedIdNumber,
      vehicle_type_ocr: ocrData.vehicle_type_ocr || null,
      prior_offense_status: ocrData.prior_offense_status || null,
      violation_narrative: ocrData.violation_narrative || null,
      idling_duration_ocr: ocrData.idling_duration_ocr || null,
      critical_flags_ocr: ocrData.critical_flags_ocr || [],
      name_on_summons_ocr: ocrData.name_on_summons_ocr || null,
    };
  } catch (error) {
    console.error('Error extracting PDF data:', error);
    throw new Error(`PDF OCR failed: ${error.message}`);
  }
}

/**
 * Update summons record with extracted data and add activity log entry
 *
 * @param {string} summonsId - Summons ID
 * @param {Object} extractedData - Data to update
 * @param {Object} activityEntry - Activity log entry to append
 */
async function updateSummonsWithExtractedDataAndLog(summonsId, extractedData, activityEntry) {
  try {
    // First, fetch the existing record to get the current activity_log
    const existingRecord = await fetchExistingRecord(summonsId);
    const existingLog = existingRecord?.activity_log || [];

    // Append the new activity entry
    const updatedLog = [...existingLog, activityEntry];

    // Build update expression dynamically based on available data
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    let attrIndex = 0;
    for (const [key, value] of Object.entries(extractedData)) {
      if (value !== null && value !== undefined) {
        const attrName = `#attr${attrIndex}`;
        const attrValue = `:val${attrIndex}`;

        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = value;

        attrIndex++;
      }
    }

    if (updateExpressions.length === 0) {
      console.log('No valid data to update');
      return;
    }

    // Add activity_log
    const logAttr = `#attr${attrIndex}`;
    const logValue = `:val${attrIndex}`;
    updateExpressions.push(`${logAttr} = ${logValue}`);
    expressionAttributeNames[logAttr] = 'activity_log';
    expressionAttributeValues[logValue] = updatedLog;
    attrIndex++;

    // CRITICAL: Always update updatedAt timestamp (required by Amplify @model)
    const updatedAtAttr = `#attr${attrIndex}`;
    const updatedAtValue = `:val${attrIndex}`;
    updateExpressions.push(`${updatedAtAttr} = ${updatedAtValue}`);
    expressionAttributeNames[updatedAtAttr] = 'updatedAt';
    expressionAttributeValues[updatedAtValue] = new Date().toISOString();

    const params = {
      TableName: SUMMONS_TABLE,
      Key: { id: summonsId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    };

    await dynamodb.update(params).promise();
    console.log('Summons updated successfully with extracted data and activity log');
  } catch (error) {
    console.error('Error updating summons:', error);
    throw new Error(`Database update failed: ${error.message}`);
  }
}

/**
 * Fetch existing summons record from database
 * Used for safety check before OCR processing
 *
 * @param {string} summonsId - Summons ID
 * @returns {Promise<Object|null>} Summons record or null
 */
async function fetchExistingRecord(summonsId) {
  try {
    const result = await dynamodb.get({
      TableName: SUMMONS_TABLE,
      Key: { id: summonsId },
    }).promise();
    return result.Item || null;
  } catch (error) {
    console.error('Error fetching existing record:', error);
    return null;
  }
}

/**
 * Parse a date string into ISO format
 * Handles various date formats
 *
 * @param {string} dateStr - Date string to parse
 * @returns {string|null} ISO date string or null
 */
function parseDateString(dateStr) {
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
 *
 * @param {string} violationDate - ISO date string
 * @param {string} videoCreatedDate - ISO date string
 * @returns {number} Number of days (lag)
 */
function calculateLagDays(violationDate, videoCreatedDate) {
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
