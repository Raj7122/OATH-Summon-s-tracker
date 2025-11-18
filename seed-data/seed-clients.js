/**
 * Seed Script - Bulk Import Clients
 *
 * This script imports all 53 clients from clients.json into DynamoDB
 *
 * Usage:
 *   node seed-clients.js <owner-email> <table-name> <region>
 *
 * Example:
 *   node seed-clients.js arthur@millerlaw.com Client-dev-abc123 us-east-1
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Parse command line arguments
const [,, ownerEmail, tableName, region = 'us-east-1'] = process.argv;

if (!ownerEmail || !tableName) {
  console.error('❌ Error: Missing required arguments');
  console.log('');
  console.log('Usage:');
  console.log('  node seed-clients.js <owner-email> <table-name> <region>');
  console.log('');
  console.log('Example:');
  console.log('  node seed-clients.js arthur@millerlaw.com Client-dev-abc123 us-east-1');
  console.log('');
  console.log('To find your table name:');
  console.log('  1. Go to: https://console.aws.amazon.com/dynamodbv2/');
  console.log('  2. Look for: Client-dev-XXXXX');
  process.exit(1);
}

// Configure AWS SDK
AWS.config.update({ region });
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Read clients data
const clientsPath = path.join(__dirname, 'clients.json');
const clientsData = JSON.parse(fs.readFileSync(clientsPath, 'utf8'));

console.log('🚀 NYC OATH Summons Tracker - Client Seed Script');
console.log('================================================');
console.log(`Owner: ${ownerEmail}`);
console.log(`Table: ${tableName}`);
console.log(`Region: ${region}`);
console.log(`Clients to import: ${clientsData.length}`);
console.log('');

/**
 * Create a DynamoDB item for a client
 */
function createClientItem(clientData, owner) {
  const now = new Date().toISOString();
  const timestamp = Date.now();

  return {
    id: uuidv4(),
    name: clientData.primary_name,
    akas: clientData.aliases || [],
    owner: owner,

    // Optional contact fields (empty for now, can be added via UI)
    contact_name: null,
    contact_address: null,
    contact_phone1: null,
    contact_email1: null,
    contact_phone2: null,
    contact_email2: null,

    // Amplify DataStore metadata
    _version: 1,
    _lastChangedAt: timestamp,
    _deleted: null,

    // Timestamps
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Insert a client into DynamoDB
 */
async function insertClient(client) {
  const params = {
    TableName: tableName,
    Item: client,
  };

  try {
    await dynamodb.put(params).promise();
    return { success: true, client };
  } catch (error) {
    return { success: false, client, error: error.message };
  }
}

/**
 * Batch insert all clients
 */
async function seedClients() {
  console.log('⏳ Starting import...\n');

  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  for (let i = 0; i < clientsData.length; i++) {
    const clientData = clientsData[i];
    const client = createClientItem(clientData, ownerEmail);

    process.stdout.write(`[${i + 1}/${clientsData.length}] Importing: ${client.name}...`);

    const result = await insertClient(client);

    if (result.success) {
      successCount++;
      console.log(' ✅');
    } else {
      errorCount++;
      console.log(` ❌ ${result.error}`);
      errors.push({ name: client.name, error: result.error });
    }
  }

  console.log('\n================================================');
  console.log('📊 Import Summary:');
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);

  if (errors.length > 0) {
    console.log('\n🔍 Failed Imports:');
    errors.forEach(err => {
      console.log(`  - ${err.name}: ${err.error}`);
    });
  }

  console.log('\n✨ Seed complete!');

  if (successCount > 0) {
    console.log(`\n📌 Next Steps:`);
    console.log(`1. Log into the app with: ${ownerEmail}`);
    console.log(`2. Go to the Clients page to view all ${successCount} imported clients`);
    console.log(`3. Run the daily-sweep Lambda function to fetch summonses`);
  }
}

// Run the seed script
seedClients().catch(error => {
  console.error('\n❌ Seed failed:', error);
  process.exit(1);
});
