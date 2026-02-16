/**
 * Verification Script - Compare NYC Open Data API with Application Data
 *
 * This script queries the NYC Open Data API directly to find all IDLING violations
 * for registered clients and compares them with the application's current data.
 *
 * Usage: node verify-summons.js
 */

const fetch = require('node-fetch');

// NYC Open Data API Configuration
const NYC_API_URL = 'https://data.cityofnewyork.us/resource/jz4z-kudi.json';

// Add your NYC Open Data app token here if you have one (optional but recommended)
const NYC_API_TOKEN = process.env.NYC_OPEN_DATA_APP_TOKEN || '';

/**
 * Normalize a company name for fuzzy matching (same logic as dailySweep)
 */
function normalizeCompanyName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*(llc|inc|corp|co|ltd|l\.l\.c\.|i\.n\.c\.)\s*$/i, '')
    .trim();
}

/**
 * Build a map of client names (including AKAs) to client objects
 */
function buildClientNameMap(clients) {
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
}

/**
 * Check if summons matches any client name/AKA
 */
function matchesToClient(summons, clientNameMap) {
  const respondentFirstName = summons.respondent_first_name || '';
  const respondentLastName = summons.respondent_last_name || '';
  const respondentFullName = `${respondentFirstName} ${respondentLastName}`.trim();

  if (!respondentFullName) return null;

  const normalizedName = normalizeCompanyName(respondentFullName);
  const noSpaceName = normalizedName.replace(/\s/g, '');

  return clientNameMap.get(normalizedName) || clientNameMap.get(noSpaceName) || null;
}

/**
 * Check if this is an IDLING violation (same logic as dailySweep)
 */
function isIdlingViolation(summons) {
  const codeDescription = summons.charge_1_code_description || summons.charge_2_code_description || '';
  return codeDescription.toUpperCase().includes('IDLING');
}

/**
 * Check if hearing date is 2022 or later
 */
function isValidHearingDate(summons) {
  if (!summons.hearing_date) return false;
  const hearingDate = new Date(summons.hearing_date);
  return hearingDate.getFullYear() >= 2022;
}

/**
 * Query NYC Open Data API for a specific search term
 */
async function queryNYCAPI(searchTerm) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (NYC_API_TOKEN) {
    headers['X-App-Token'] = NYC_API_TOKEN;
  }

  const url = new URL(NYC_API_URL);
  url.searchParams.append('$limit', 5000);
  const escapedTerm = searchTerm.replace(/'/g, "''");
  url.searchParams.append('$where', `upper(respondent_last_name) like '%${escapedTerm}%'`);

  const response = await fetch(url.toString(), { headers });

  if (!response.ok) {
    throw new Error(`NYC API error: ${response.status}`);
  }

  return response.json();
}

// CLIENTS AND AKAS - UPDATE THIS WITH YOUR ACTUAL DATA
// This is a placeholder - you'll need to fill in your actual clients
const CLIENTS = [
  // Example format:
  // { name: 'Client Name LLC', akas: ['AKA 1', 'AKA 2'] },
];

async function main() {
  console.log('='.repeat(70));
  console.log('NYC OATH SUMMONS VERIFICATION');
  console.log('='.repeat(70));
  console.log('');

  if (CLIENTS.length === 0) {
    console.log('ERROR: No clients defined!');
    console.log('');
    console.log('Please update the CLIENTS array in this script with your actual clients.');
    console.log('');
    console.log('Example format:');
    console.log('const CLIENTS = [');
    console.log('  { name: "Company A LLC", akas: ["Company A", "COMPANY A INC"] },');
    console.log('  { name: "Company B Corp", akas: ["Comp B", "COMPANY-B"] },');
    console.log('];');
    console.log('');
    console.log('Then run: node verify-summons.js');
    return;
  }

  // Build client name map for matching
  const clientNameMap = buildClientNameMap(CLIENTS);
  console.log(`Loaded ${CLIENTS.length} clients with ${clientNameMap.size} searchable names`);
  console.log('');

  // Build unique search terms
  const searchTerms = new Set();
  CLIENTS.forEach(client => {
    const mainName = client.name.replace(/\s+(llc|inc|corp|co|ltd)\.?$/i, '').trim();
    if (mainName.length > 3) searchTerms.add(mainName.toUpperCase());

    if (client.akas && Array.isArray(client.akas)) {
      client.akas.forEach(aka => {
        const akaMain = aka.replace(/\s+(llc|inc|corp|co|ltd)\.?$/i, '').trim();
        if (akaMain.length > 3) searchTerms.add(akaMain.toUpperCase());
      });
    }
  });

  console.log(`Querying NYC API for ${searchTerms.size} search terms...`);
  console.log('-'.repeat(70));

  // Query API for each search term
  const allSummonses = [];
  const seenTickets = new Set();

  for (const term of searchTerms) {
    try {
      const results = await queryNYCAPI(term);
      let newCount = 0;

      for (const summons of results) {
        if (!seenTickets.has(summons.ticket_number)) {
          seenTickets.add(summons.ticket_number);
          allSummonses.push(summons);
          newCount++;
        }
      }

      console.log(`  "${term}": ${results.length} results (${newCount} new)`);
    } catch (error) {
      console.log(`  "${term}": ERROR - ${error.message}`);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('');
  console.log('-'.repeat(70));
  console.log(`Total summonses from API: ${allSummonses.length}`);
  console.log('');

  // Filter for IDLING violations with hearing dates >= 2022 that match clients
  const matchingSummonses = [];
  const summonsesPerClient = {};

  for (const summons of allSummonses) {
    // Check if IDLING
    if (!isIdlingViolation(summons)) continue;

    // Check hearing date
    if (!isValidHearingDate(summons)) continue;

    // Check if matches a client
    const matchedClient = matchesToClient(summons, clientNameMap);
    if (!matchedClient) continue;

    matchingSummonses.push({
      ticket_number: summons.ticket_number,
      respondent: `${summons.respondent_first_name || ''} ${summons.respondent_last_name || ''}`.trim(),
      client: matchedClient.name,
      hearing_date: summons.hearing_date,
      status: summons.hearing_status || summons.hearing_result || 'Unknown',
      violation_date: summons.violation_date,
      charge: summons.charge_1_code_description || summons.charge_2_code_description || '',
    });

    // Count per client
    if (!summonsesPerClient[matchedClient.name]) {
      summonsesPerClient[matchedClient.name] = [];
    }
    summonsesPerClient[matchedClient.name].push(summons.ticket_number);
  }

  console.log('='.repeat(70));
  console.log('RESULTS: Matching IDLING Summonses (Hearing Date >= 2022)');
  console.log('='.repeat(70));
  console.log('');
  console.log(`TOTAL MATCHING SUMMONSES: ${matchingSummonses.length}`);
  console.log('');

  // Show breakdown by client
  console.log('BREAKDOWN BY CLIENT:');
  console.log('-'.repeat(70));

  Object.entries(summonsesPerClient)
    .sort((a, b) => b[1].length - a[1].length) // Sort by count descending
    .forEach(([clientName, tickets]) => {
      console.log(`  ${clientName}: ${tickets.length} summonses`);
    });

  console.log('');
  console.log('='.repeat(70));
  console.log('FULL LIST OF MATCHING SUMMONSES:');
  console.log('='.repeat(70));

  // Sort by hearing date (newest first)
  matchingSummonses.sort((a, b) => new Date(b.hearing_date) - new Date(a.hearing_date));

  matchingSummonses.forEach((s, i) => {
    const hearingDate = s.hearing_date ? new Date(s.hearing_date).toLocaleDateString() : 'N/A';
    console.log(`${i + 1}. ${s.ticket_number} | ${s.respondent} | ${hearingDate} | ${s.status}`);
  });

  console.log('');
  console.log('='.repeat(70));
  console.log('VERIFICATION COMPLETE');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Your application has: 259 summonses`);
  console.log(`NYC API has: ${matchingSummonses.length} matching IDLING summonses (2022+)`);
  console.log('');

  if (matchingSummonses.length > 259) {
    console.log(`POTENTIAL MISSING: ${matchingSummonses.length - 259} summonses may not be in your app`);
    console.log('');
    console.log('NOTE: "GC Warehouse Building Supplies" was just added, so those summonses');
    console.log('should appear after the next sweep runs.');
  } else if (matchingSummonses.length === 259) {
    console.log('MATCH! Your application has captured all the summonses.');
  } else {
    console.log(`Your app may have ${259 - matchingSummonses.length} extra summonses.`);
    console.log('This could be due to:');
    console.log('  - Summonses removed from API (archived/paid)');
    console.log('  - Different matching criteria');
  }
}

main().catch(console.error);
