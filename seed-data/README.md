# Client Seed Data

This directory contains seed data to bulk-import all 53 clients into the NYC OATH Summons Tracker.

## 📋 Files

- **clients.json** - List of 53 clients with primary names and aliases
- **seed-clients.js** - Node.js script to bulk import clients into DynamoDB
- **package.json** - Dependencies for the seed script

## 🚀 Quick Start

### Step 1: Install Dependencies

```bash
cd seed-data
npm install
```

### Step 2: Get Your DynamoDB Table Name

1. Go to: https://console.aws.amazon.com/dynamodbv2/
2. Click **Tables** (left sidebar)
3. Find your Client table: `Client-dev-XXXXX` (copy the full name)

### Step 3: Run the Seed Script

```bash
node seed-clients.js <owner-email> <table-name> <region>
```

**Example:**
```bash
node seed-clients.js arthur@millerlaw.com Client-dev-abc123xyz us-east-1
```

**Parameters:**
- `owner-email` - The Cognito user email (arthur@millerlaw.com, jackie@millerlaw.com, or jelly@millerlaw.com)
- `table-name` - Your DynamoDB Client table name (from Step 2)
- `region` - AWS region (usually `us-east-1`)

### Step 4: Verify Import

1. Log into the app with the email you used
2. Go to **Clients** page
3. You should see all 53 clients!

---

## 📊 Client List Overview

Total Clients: **53**

### Notable Clients with Multiple Aliases:

- **CENTENNIAL** (3 aliases)
  - CENTENNIAL
  - CSI SECURITY & ELECTRIC INC
  - CENTENNIAL SECURITY INTEGRATION

- **N Y P** (3 aliases)
  - N Y P
  - NYP
  - NEW YORK PRESBYTERIAN

- **USPS** (3 aliases)
  - USPS
  - UNITED STATES POSTAL SERVICE
  - POSTAL SERVICE

- **EXQUISITE** (3 aliases)
  - EXQUISITE
  - EWF
  - E W F

### Why This Matters:

The Daily Sweep Lambda function matches NYC OATH summonses using **case-insensitive matching** on both:
1. Primary client name
2. All aliases (AKAs)

**Example:** If a summons shows respondent as "csi security & electric inc" (lowercase), it will match the CENTENNIAL client because "CSI SECURITY & ELECTRIC INC" is in the aliases.

---

## 🔍 Troubleshooting

### Error: "Access Denied"

**Solution:** Configure AWS credentials

```bash
# Option 1: Use AWS CLI
aws configure

# Option 2: Set environment variables
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_REGION=us-east-1
```

### Error: "Table not found"

**Solution:** Double-check the table name

```bash
# List all DynamoDB tables
aws dynamodb list-tables --region us-east-1
```

### Error: "ValidationException: One or more parameter values were invalid"

**Solution:** This usually means a required field is missing. Check that:
- `owner` field is set correctly
- All required Client schema fields are present

### Clients appear in database but not in app

**Cause:** The `owner` field doesn't match the logged-in user

**Solution:** The `owner` field must exactly match the Cognito user's email. If you seeded with `arthur@millerlaw.com`, you must log in with that exact email.

---

## 🔐 Security Note

The `owner` field is **critical** for data isolation. Amplify's `@auth(rules: [{ allow: owner }])` ensures:

- Arthur can only see clients where `owner = "arthur@millerlaw.com"`
- Jackie can only see clients where `owner = "jackie@millerlaw.com"`
- Jelly can only see clients where `owner = "jelly@millerlaw.com"`

**Best Practice:** Seed clients for each user separately if they need different client lists.

---

## 📝 Adding More Clients

To add more clients to the seed data:

1. Edit `clients.json`
2. Add new client in this format:
   ```json
   {
     "primary_name": "NEW CLIENT NAME",
     "aliases": [
       "NEW CLIENT NAME",
       "ALIAS 1",
       "ALIAS 2"
     ]
   }
   ```
3. Run the seed script again (it will add new clients without duplicating existing ones)

---

## 🧹 Clearing All Clients

**⚠️ CAUTION: This deletes all clients permanently!**

```bash
# Install AWS CLI
aws dynamodb scan --table-name Client-dev-XXXXX --attributes-to-get id --output json | \
jq -r '.Items[].id.S' | \
xargs -I {} aws dynamodb delete-item --table-name Client-dev-XXXXX --key '{"id":{"S":"{}"}}'
```

Or use the AWS Console:
1. Go to DynamoDB → Tables → Client-dev-XXXXX
2. Click **Explore table items**
3. Select items → **Actions** → **Delete items**

---

## 📚 Next Steps After Seeding

1. **Test the Daily Sweep:**
   - Go to AWS Lambda Console
   - Click `dailySweep` function
   - Click **Test** → Run test event
   - Check CloudWatch logs

2. **Verify Matching:**
   - The sweep should find summonses for clients like:
     - GC Warehouse (very common in NYC)
     - PEPSI
     - USPS
     - TARGET
   - Check the Summons table in DynamoDB

3. **View in Dashboard:**
   - Log into the app
   - Go to Dashboard
   - You should see matched summonses!

---

## 💡 Pro Tips

1. **Start with Arthur's email** - He's the primary attorney, so seed all clients under his account first

2. **Jackie can share Arthur's clients** - Instead of seeding separately, you can use the same `owner` email for both Arthur and Jackie

3. **Test with a subset first** - Edit `clients.json` to only include 5-10 clients for initial testing, then run the full seed

4. **Monitor the first sweep** - After seeding, manually trigger the daily-sweep Lambda and watch the CloudWatch logs to see how many summonses are matched

---

## 🎯 Expected Results

After seeding and running the first daily sweep, you should see:

- **53 clients** in the Client table
- **Hundreds of summonses** in the Summons table (depending on current NYC data)
- **Multiple matches** for high-volume clients like:
  - PEPSI (national delivery company)
  - USPS (mail delivery trucks)
  - TARGET (retail delivery)
  - SYSCO (food distribution)

The number of summonses varies based on:
- How many violations these companies have in NYC's system
- The date range of data in the NYC OATH database
- How recently the violations occurred
