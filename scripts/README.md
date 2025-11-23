# Database Maintenance Scripts

This directory contains utility scripts for maintaining and repairing the NYC OATH Summons Tracker database.

## fix-database-timestamps.js

**Purpose**: Fixes malformed Summons records in DynamoDB that have incorrect date formats or missing Amplify-required timestamps.

### When to Use This Script

Run this script if you see GraphQL errors like:
```
Can't serialize value (/listSummons/items[0]/hearing_date) : Unable to serialize `2026-05-06T00:00:00.000` as a valid DateTime Object.
```
or
```
Cannot return null for non-nullable type: 'AWSDateTime' within parent 'Summons' (/listSummons/items[0]/createdAt)
```

### What It Fixes

1. **Missing Timestamps**: Adds `createdAt` and `updatedAt` timestamps to records that lack them (required by Amplify's `@model` directive)
2. **Malformed Dates**: Converts dates without timezone suffixes to proper ISO 8601 format:
   - `2026-05-06T00:00:00.000` → `2026-05-06T00:00:00.000Z`
3. **All Date Fields**: Fixes `hearing_date`, `violation_date`, `video_created_date`, `evidence_requested_date`, and `last_change_at`

### Prerequisites

1. **AWS Credentials Configured**:
   ```bash
   aws configure
   # OR set environment variables:
   export AWS_ACCESS_KEY_ID=your-key
   export AWS_SECRET_ACCESS_KEY=your-secret
   export AWS_REGION=us-east-1
   ```

2. **Find Your DynamoDB Table Name**:
   ```bash
   amplify status
   # Look for "Summons-<env-id>-<env-name>" table
   # OR check in AWS Console → DynamoDB → Tables
   ```

3. **Update the Script**:
   Edit `scripts/fix-database-timestamps.js` and change line 22:
   ```javascript
   const SUMMONS_TABLE = 'Summons-q2d5w5h7ifepzeykhhw3zcjzsu-dev'; // CHANGE THIS
   ```

### Usage

```bash
# From project root directory
cd /path/to/OATH-Summon-s-tracker

# Run the repair script
node scripts/fix-database-timestamps.js
```

### Expected Output

```
========================================
NYC OATH Summons Tracker
Database Timestamp Repair Script
========================================

Starting database repair...

Table: Summons-q2d5w5h7ifepzeykhhw3zcjzsu-dev
Region: us-east-1

Fixing summons: 123456789 (ID: abc-123-def)
Problems found: malformed hearing_date: 2026-05-06T00:00:00.000, missing createdAt, missing updatedAt
✓ Fixed successfully

=== REPAIR SUMMARY ===
Scanned: 15 records
Fixed: 3 records
Errors: 0 records
======================

✓ Database repair completed successfully!
```

### After Running the Script

1. **Refresh your browser** to clear cached GraphQL responses
2. **Check the Dashboard** - summonses should now load without errors
3. **Verify in AWS Console** - check DynamoDB to confirm timestamps are present

### Troubleshooting

**Error: "Access Denied"**
- Check your AWS credentials are configured correctly
- Verify your IAM user has DynamoDB read/write permissions

**Error: "ResourceNotFoundException"**
- The `SUMMONS_TABLE` name is incorrect
- Run `amplify status` to find the correct table name

**Script finds 0 records**
- The table is empty (no summonses exist yet)
- The `SUMMONS_TABLE` name is incorrect

**Script fixes records but errors persist**
- Run `amplify push` to deploy the Lambda function fixes
- Clear your browser cache and refresh

### When to Re-run This Script

You should re-run this script if:
1. You manually inserted data into DynamoDB (bypassing Amplify)
2. You migrated data from another system
3. You restored from a backup that predates the Lambda fixes
4. GraphQL errors reappear after adding new summonses

### Preventing Future Issues

After deploying the Lambda function fixes (`amplify push`), all **new** summons records created by the `dailySweep` Lambda will automatically have:
- Proper ISO 8601 dates with timezone (`Z` suffix)
- Required `createdAt` and `updatedAt` timestamps
- Correct `owner` field for auth

You should **NOT** need to run this script again unless you manually insert data.

---

**Created**: 2025-11-23
**Last Updated**: 2025-11-23
**Maintainer**: Claude Code
