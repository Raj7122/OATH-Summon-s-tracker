/**
 * NYC OATH Summons Tracker - Data Extractor Lambda Function
 *
 * This function is invoked asynchronously after a new summons is created.
 * It performs:
 *   1. Web scraping of the video page to extract "Video Created Date"
 *   2. PDF OCR using Google Gemini API to extract structured data
 *   3. Updates the summons record with all extracted data
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
      // Direct invocation format (for testing)
      ({ summons_id, summons_number, pdf_link, video_link, violation_date } = event);
      console.log('Direct invocation event:', { summons_id, summons_number, pdf_link, video_link });
    }

    if (!summons_id || !summons_number) {
      throw new Error('Missing required parameters: summons_id or summons_number');
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

    // Part C: Update Database with extracted data
    if (Object.keys(extractedData).length > 0) {
      await updateSummonsWithExtractedData(summons_id, extractedData);
      console.log(`Updated summons ${summons_number} with extracted data`);
    } else {
      console.log('No data extracted, skipping database update');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Data extraction completed',
        summons_id,
        extractedFields: Object.keys(extractedData),
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
    const response = await fetch(videoUrl);

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
 * Extract structured data from PDF using Google Gemini API
 *
 * @param {string} pdfUrl - URL of the PDF summons
 * @returns {Promise<Object>} Extracted OCR data
 */
async function extractPDFData(pdfUrl) {
  try {
    // Fetch the PDF as a buffer
    const response = await fetch(pdfUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const pdfBuffer = await response.buffer();

    // Convert PDF buffer to base64 for Gemini API
    const pdfBase64 = pdfBuffer.toString('base64');

    // Initialize Gemini model (using Gemini 2.0 stable version)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash' // Stable 2.0 version (not experimental)
    });

    // Prompt for structured extraction (from TRD FR-09)
    const prompt = `You are an expert legal assistant analyzing a NYC OATH summons PDF for an idling violation. Extract the following fields and return ONLY a valid JSON object with no additional text or formatting:

{
  "license_plate_ocr": "license plate number",
  "dep_id": "DEP ID or case number",
  "vehicle_type_ocr": "vehicle type (e.g., truck, van, car)",
  "prior_offense_status": "first offense, repeat offense, or unknown",
  "violation_narrative": "brief description of the violation",
  "idling_duration_ocr": "how long the vehicle was idling (e.g., '15 minutes')",
  "critical_flags_ocr": ["array of important flags like 'refrigeration unit', 'no driver present', etc."],
  "name_on_summons_ocr": "respondent/company name on the summons"
}

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

    // Return with consistent field names
    return {
      license_plate_ocr: ocrData.license_plate_ocr || null,
      dep_id: ocrData.dep_id || null,
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
 * Update summons record with extracted data
 *
 * @param {string} summonsId - Summons ID
 * @param {Object} extractedData - Data to update
 */
async function updateSummonsWithExtractedData(summonsId, extractedData) {
  try {
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

    const params = {
      TableName: SUMMONS_TABLE,
      Key: { id: summonsId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    };

    await dynamodb.update(params).promise();
    console.log('Summons updated successfully with extracted data');
  } catch (error) {
    console.error('Error updating summons:', error);
    throw new Error(`Database update failed: ${error.message}`);
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
