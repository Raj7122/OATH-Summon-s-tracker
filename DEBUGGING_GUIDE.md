# NYC OATH Summons Tracker - Debugging Journey

**Date**: November 23, 2025
**Session**: Initial Dashboard Load Issues
**Status**: ✅ Resolved
**Branch**: `claude/debug-previous-issues-01XxebKo458BpQwrxvWK86Nz`

---

## Executive Summary

This document chronicles the debugging process for resolving critical issues preventing the NYC OATH Summons Tracker dashboard from loading. We encountered and resolved **4 major layers** of issues spanning frontend configuration, backend Lambda functions, database data integrity, and UI rendering.

**Final Result**: Dashboard successfully loads and displays summons records without errors.

---

## Table of Contents

1. [Initial Problem](#initial-problem)
2. [Layer 1: Amplify Configuration Issues](#layer-1-amplify-configuration-issues)
3. [Layer 2: Lambda Function Data Format Issues](#layer-2-lambda-function-data-format-issues)
4. [Layer 3: Database Data Repair](#layer-3-database-data-repair)
5. [Layer 4: UI Rendering Issues](#layer-4-ui-rendering-issues)
6. [Key Learnings](#key-learnings)
7. [Prevention Strategies](#prevention-strategies)
8. [Related Resources](#related-resources)

---

## Initial Problem

### Symptoms

**Browser Console Errors:**
```
Amplify has not been configured. Please call Amplify.configure() before using this service.

Error loading summonses: Object
```

**User Impact:**
- Dashboard fails to load
- Summons table is empty
- No data visible to users

### Root Cause Analysis

Through systematic investigation, we identified a chain of issues:

1. **Frontend**: Wrong Amplify v6 configuration format
2. **Backend**: Lambda functions creating malformed database records
3. **Database**: Existing records missing required fields and using invalid date formats
4. **UI**: DataGrid components unable to handle mixed data types

---

## Layer 1: Amplify Configuration Issues

### Problem 1.1: Wrong Amplify Version Configuration

**Error Message:**
```
Amplify has not been configured. Please call Amplify.configure() before using this service.
```

**Investigation:**
```bash
# Check package.json
cat package.json | grep aws-amplify
# Result: "aws-amplify": "^6.0.12"

# Check amplifyClient.ts configuration format
cat src/lib/amplifyClient.ts
# Result: Using v5 configuration format!
```

**Root Cause:**
- Project uses Amplify v6 (`aws-amplify@6.0.12`)
- Configuration file used Amplify v5 format
- v5 and v6 have incompatible configuration schemas

**Solution:**

**File**: `src/lib/amplifyClient.ts`

```typescript
// ❌ BEFORE (v5 format - incompatible)
const amplifyConfig = {
  aws_project_region: 'us-east-1',
  aws_cognito_region: 'us-east-1',
  aws_user_pools_id: 'us-east-1_HXL5eyt3G',
  aws_user_pools_web_client_id: '5u3iqbnppofude6c0jao41pl06',
  // ...
};

// ✅ AFTER (v6 format - correct)
const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: 'us-east-1_HXL5eyt3G',
      userPoolClientId: '5u3iqbnppofude6c0jao41pl06',
    }
  },
  API: {
    GraphQL: {
      endpoint: 'https://vp3li2qm6ffstf5gjbe5rnrs6u.appsync-api.us-east-1.amazonaws.com/graphql',
      region: 'us-east-1',
      defaultAuthMode: 'userPool',
    },
  },
};
```

**Commit**: `b289fac` - "fix(amplify): update to v6 configuration format"

---

### Problem 1.2: Import Order Issue

**Symptom:**
Even with correct v6 configuration, Amplify was sometimes not initialized when components tried to use it.

**Investigation:**
```typescript
// Check import order in main.tsx
import App from './App'
import { theme } from './theme'
import './lib/amplifyClient'  // ❌ Imported AFTER App
```

**Root Cause:**
- Components in `App` started executing before `amplifyClient` was imported
- JavaScript module loading order matters
- Side effects (like `Amplify.configure()`) need to run before dependent code

**Solution:**

**File**: `src/main.tsx`

```typescript
// ✅ CORRECT ORDER
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
// CRITICAL: Import Amplify configuration BEFORE App
import './lib/amplifyClient'  // ← Must be first!
import App from './App'       // ← Then App
import { theme } from './theme'
```

**Commit**: `b289fac` (same commit as above)

---

### Problem 1.3: Weak Error Logging

**Issue:**
When errors occurred, we only saw generic error objects in the console:
```javascript
console.error('Error loading summonses:', error);
// Output: Error loading summonses: Object
```

**Solution:**

**File**: `src/pages/Dashboard.tsx`

```typescript
// ❌ BEFORE
catch (error) {
  console.error('Error loading summonses:', error);
}

// ✅ AFTER
catch (error) {
  console.error('Error loading summonses:', error);
  // Log detailed error information for debugging
  if (error instanceof Error) {
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
  }
  // Log the full error object
  console.error('Full error object:', JSON.stringify(error, null, 2));
}
```

**Why This Matters:**
- Reveals nested error details (e.g., GraphQL errors array)
- Shows stack traces for debugging
- Exposes serialization errors that would otherwise be hidden

**Commit**: `b289fac`

---

## Layer 2: Lambda Function Data Format Issues

### Problem 2.1: Missing Required Amplify Fields

**Error Message (from enhanced logging):**
```json
{
  "errors": [
    {
      "message": "Cannot return null for non-nullable type: 'AWSDateTime' within parent 'Summons' (/listSummons/items[0]/createdAt)"
    },
    {
      "message": "Cannot return null for non-nullable type: 'AWSDateTime' within parent 'Summons' (/listSummons/items[0]/updatedAt)"
    }
  ]
}
```

**Investigation:**
```javascript
// Check dailySweep Lambda function
const newSummons = {
  id: generateUUID(),
  clientID: matchedClient.id,
  summons_number: ticketNumber,
  hearing_date: apiSummons.hearing_date,
  // ❌ Missing: createdAt, updatedAt, owner
};
```

**Root Cause:**
- Amplify's `@model` directive automatically adds `createdAt` and `updatedAt` fields to GraphQL schema
- These fields are marked as non-nullable (`AWSDateTime!`)
- Lambda was bypassing Amplify and inserting directly into DynamoDB
- Direct DynamoDB inserts don't auto-populate Amplify's managed fields

**Solution:**

**File**: `amplify/backend/function/dailySweep/src/index.js`

```javascript
// ❌ BEFORE
const newSummons = {
  id: generateUUID(),
  clientID: matchedClient.id,
  summons_number: ticketNumber,
  hearing_date: apiSummons.hearing_date,
  // ... other fields
};

// ✅ AFTER
const now = new Date().toISOString();

const newSummons = {
  id: generateUUID(),
  clientID: matchedClient.id,
  summons_number: ticketNumber,
  hearing_date: hearingDate,
  // ... other fields
  createdAt: now,              // Required by @model
  updatedAt: now,              // Required by @model
  owner: matchedClient.owner,  // Required by @auth(rules: [{ allow: private }])
};
```

**Also Updated**: `updateSummons()` function to always set `updatedAt`:

```javascript
// CRITICAL: Always update updatedAt timestamp
updateExpressions.push('updatedAt = :updatedAt');
expressionAttributeValues[':updatedAt'] = new Date().toISOString();
```

**Commit**: `b463e6c` - "fix(lambda): ensure proper ISO 8601 dates and Amplify timestamps"

---

### Problem 2.2: Invalid DateTime Format

**Error Message:**
```json
{
  "errors": [
    {
      "message": "Can't serialize value (/listSummons/items[0]/hearing_date) : Unable to serialize `2026-05-06T00:00:00.000` as a valid DateTime Object."
    }
  ]
}
```

**Investigation:**
```javascript
// NYC API returns dates like this:
"hearing_date": "2026-05-06T00:00:00.000"  // ❌ Missing timezone!

// AWS AWSDateTime type requires:
"hearing_date": "2026-05-06T00:00:00.000Z"  // ✅ With timezone
```

**Root Cause:**
- NYC Open Data API returns dates in ISO 8601 format WITHOUT timezone suffix
- AWS `AWSDateTime` type requires full ISO 8601 with timezone (Z or +00:00)
- GraphQL serializer rejects dates without timezone information

**Solution:**

Created helper function `ensureISOFormat()`:

**File**: `amplify/backend/function/dailySweep/src/index.js`

```javascript
/**
 * Ensure date is in proper ISO 8601 format with timezone
 * NYC API returns dates like "2026-05-06T00:00:00.000" without timezone
 * AWS requires "2026-05-06T00:00:00.000Z" format
 */
function ensureISOFormat(dateString) {
  if (!dateString) return null;

  // If date already has timezone (Z or +00:00), return as-is
  if (dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString)) {
    return dateString;
  }

  // Add 'Z' timezone suffix for UTC
  return `${dateString}Z`;
}

// Usage:
const hearingDate = apiSummons.hearing_date
  ? ensureISOFormat(apiSummons.hearing_date)
  : null;
```

**Applied to All Date Fields:**
- `hearing_date`
- `violation_date`
- `video_created_date`
- `evidence_requested_date`
- `last_change_at`

**Commit**: `b463e6c`

---

### Problem 2.3: dataExtractor Lambda Also Missing updatedAt

**Issue:**
The `dataExtractor` Lambda was updating summons records after OCR/scraping, but not setting `updatedAt`.

**Solution:**

**File**: `amplify/backend/function/dataExtractor/src/index.js`

```javascript
// In updateSummonsWithExtractedData()

// CRITICAL: Always update updatedAt timestamp (required by Amplify @model)
const updatedAtAttr = `#attr${attrIndex}`;
const updatedAtValue = `:val${attrIndex}`;
updateExpressions.push(`${updatedAtAttr} = ${updatedAtValue}`);
expressionAttributeNames[updatedAtAttr] = 'updatedAt';
expressionAttributeValues[updatedAtValue] = new Date().toISOString();
```

**Commit**: `b463e6c`

---

## Layer 3: Database Data Repair

### Problem 3.1: Existing Records Have Malformed Data

**Situation:**
- Lambda functions are now fixed (deployed via `amplify push`)
- Future records will be created correctly
- **But existing records still have the old problems!**

**Challenge:**
Can't just delete and recreate existing records - they may have user-entered data (notes, checkboxes, etc.)

**Solution Strategy:**
Create a repair script to scan and fix existing records in-place.

---

### Script Development: fix-database-timestamps.js

**Attempt 1: CommonJS Script**

```javascript
// ❌ FAILED
const AWS = require('aws-sdk');
// Error: require is not defined in ES module scope
```

**Issue**: Project has `"type": "module"` in package.json

---

**Attempt 2: ES Modules with AWS SDK v2**

```javascript
// ❌ FAILED - Can't use import with aws-sdk v2
import AWS from 'aws-sdk';
```

**Issue**: `aws-sdk` (v2) is CommonJS-only

---

**Attempt 3: ES Modules with AWS SDK v3**

```javascript
// ✅ SUCCESS
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
```

**Changes Required:**
1. Install AWS SDK v3 packages
2. Convert to ES module syntax
3. Update DynamoDB operations to use v3 commands

**File**: `package.json`

```json
"devDependencies": {
  "@aws-sdk/client-dynamodb": "^3.682.0",
  "@aws-sdk/lib-dynamodb": "^3.682.0",
  // ...
}
```

**Commit**: `8825dcd` - "fix(scripts): convert repair script to ES modules and add AWS SDK v3"

---

### Problem 3.2: AWS SDK v3 Null Parameter Handling

**Error:**
```
TypeError: Cannot convert undefined or null to object
```

**Investigation:**
```javascript
// ❌ FAILED
const scanParams = {
  TableName: SUMMONS_TABLE,
  ExclusiveStartKey: lastEvaluatedKey,  // null on first iteration!
};
```

**Root Cause:**
AWS SDK v3 doesn't accept `null` or `undefined` in command parameters (SDK v2 did).

**Solution:**

```javascript
// ✅ SUCCESS - Use conditional spread
const scanParams = {
  TableName: SUMMONS_TABLE,
  ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey }),
};
```

**Commit**: `e25aa53` - "fix(scripts): handle null ExclusiveStartKey in scan operation"

---

### Repair Script Execution

**File**: `scripts/fix-database-timestamps.js`

**What It Does:**
1. Scans all records in the Summons table
2. For each record, checks for:
   - Missing `createdAt` or `updatedAt`
   - Dates without timezone suffix (`Z`)
3. Fixes malformed fields in-place
4. Reports summary

**Execution:**
```bash
node scripts/fix-database-timestamps.js
```

**Output:**
```
========================================
NYC OATH Summons Tracker
Database Timestamp Repair Script
========================================

Starting database repair...

Table: Summons-y3ftocckkvaqrn43xz6cn6vfgq-dev
Region: us-east-1

Fixing summons: 000974656X (ID: 1bea5fc3-8c65-4b72-b78c-8a0b3e06c24f)
Problems found: missing createdAt, missing updatedAt, malformed hearing_date: 2026-05-06T00:00:00.000, malformed violation_date: 2024-12-18T00:00:00.000
✓ Fixed successfully

=== REPAIR SUMMARY ===
Scanned: 1 records
Fixed: 1 records
Errors: 0 records
======================

✓ Database repair completed successfully!
```

**Commit**: `7135ef8` - "feat(scripts): add database timestamp repair utility"

---

## Layer 4: UI Rendering Issues

### Problem 4.1: DataGrid Currency Formatter Crash

**Error Message:**
```
TypeError: value.toFixed is not a function
    at Object.valueFormatter (SummonsTable.tsx:627:61)
```

**Investigation:**
```typescript
// Check the data type
console.log('Loaded summonses:', result.data.listSummons.items);
// Result: amount_due is a string "0" or null, not a number!
```

**Root Cause:**
- DynamoDB stores `amount_due` and `base_fine` as numbers
- But GraphQL may return them as strings depending on serialization
- Some values might be `null`
- DataGrid `valueFormatter` assumed values were always numbers

**Solution:**

**File**: `src/components/SummonsTable.tsx`

```typescript
// ❌ BEFORE
{
  field: 'amount_due',
  headerName: 'Amount Due',
  valueFormatter: (value: number) => (value ? `$${value.toFixed(2)}` : ''),
}

// ✅ AFTER
{
  field: 'amount_due',
  headerName: 'Amount Due',
  valueFormatter: (value: number | string | null) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return num != null && !isNaN(num) ? `$${num.toFixed(2)}` : '';
  },
}
```

**Why This Works:**
1. Accept `number | string | null` as input type
2. Parse strings to floats
3. Check for `null`, `undefined`, and `NaN`
4. Only call `.toFixed()` on valid numbers
5. Return empty string for invalid values

**Applied To:**
- `amount_due` formatter
- `base_fine` formatter

**Commit**: `54503e7` - "fix(ui): handle string and null values in currency valueFormatters"

---

## Key Learnings

### 1. AWS Amplify v6 Migration

**Lesson**: Always check library version compatibility when migrating.

**Key Changes in v6:**
```typescript
// v5 Format
{
  aws_user_pools_id: '...',
  aws_user_pools_web_client_id: '...',
}

// v6 Format
{
  Auth: {
    Cognito: {
      userPoolId: '...',
      userPoolClientId: '...',
    }
  }
}
```

**Resources:**
- [Amplify v6 Migration Guide](https://docs.amplify.aws/javascript/build-a-backend/auth/set-up-auth/)

---

### 2. Amplify @model Directive Requirements

**Lesson**: When bypassing Amplify's APIs, you must manually populate managed fields.

**Managed Fields:**
- `createdAt: AWSDateTime!` (required, auto-populated by Amplify)
- `updatedAt: AWSDateTime!` (required, auto-updated by Amplify)
- `owner: String` (required when using `@auth(rules: [{ allow: owner }])`)

**When to Add Manually:**
- Direct DynamoDB operations (Lambda functions)
- Bulk imports
- Data migrations

**Best Practice:**
```javascript
const now = new Date().toISOString();

const record = {
  // ... your fields
  createdAt: now,
  updatedAt: now,
  owner: userId,  // if using owner-based auth
};
```

---

### 3. ISO 8601 Date Format Requirements

**Lesson**: AWS services are strict about date formats.

**Common Pitfalls:**
```javascript
// ❌ Invalid for AWS
"2026-05-06T00:00:00.000"     // Missing timezone
"2026-05-06"                   // Date only
"05/06/2026"                   // Wrong format

// ✅ Valid for AWS
"2026-05-06T00:00:00.000Z"    // UTC
"2026-05-06T00:00:00-05:00"   // With offset
```

**Solution Pattern:**
```javascript
function ensureISOFormat(dateString) {
  if (!dateString) return null;
  if (dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString)) {
    return dateString;
  }
  return `${dateString}Z`;
}
```

---

### 4. AWS SDK v2 vs v3

**Key Differences:**

| Feature | SDK v2 | SDK v3 |
|---------|--------|--------|
| Module System | CommonJS | ES Modules |
| Import Style | `require('aws-sdk')` | `import { DynamoDBClient } from '@aws-sdk/client-dynamodb'` |
| Package Size | Monolithic | Modular |
| Null Params | Tolerant | Strict |
| Promise Style | `.promise()` | Native `async/await` |

**Migration Example:**
```javascript
// v2
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const result = await dynamodb.scan(params).promise();

// v3
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(client);
const result = await dynamodb.send(new ScanCommand(params));
```

---

### 5. TypeScript Type Guards for UI Components

**Lesson**: Always handle mixed types in UI formatters.

**Problem Pattern:**
```typescript
// ❌ Assumes value is always a number
valueFormatter: (value: number) => `$${value.toFixed(2)}`
```

**Solution Pattern:**
```typescript
// ✅ Handles string | number | null
valueFormatter: (value: number | string | null) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num != null && !isNaN(num) ? `$${num.toFixed(2)}` : '';
}
```

**Why This Matters:**
- GraphQL can serialize numbers as strings
- Database migrations might change types
- Null/undefined values are common
- Prevents runtime crashes

---

### 6. JavaScript Module Import Order

**Lesson**: Side effects must run before dependent code.

**Critical Pattern:**
```typescript
// main.tsx
import './lib/amplifyClient'  // ← Side effect (Amplify.configure())
import App from './App'        // ← Uses Amplify

// If reversed, App tries to use Amplify before it's configured!
```

**When Order Matters:**
- Global configuration (Amplify, Firebase, etc.)
- Polyfills
- CSS imports
- Environment variable loading

---

### 7. Progressive Error Logging

**Lesson**: Log errors at multiple levels for effective debugging.

**Levels:**
```typescript
try {
  const result = await operation();
} catch (error) {
  // Level 1: Basic
  console.error('Operation failed:', error);

  // Level 2: Structured (Error instance)
  if (error instanceof Error) {
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
  }

  // Level 3: Full object (nested details)
  console.error('Full error object:', JSON.stringify(error, null, 2));
}
```

**What This Reveals:**
- GraphQL errors array (hidden in Error objects)
- Nested validation errors
- API response details
- Stack traces for debugging

---

## Prevention Strategies

### 1. Pre-Deployment Validation

**Add to CI/CD:**
```bash
# Validate Amplify config
amplify status

# Check Lambda function syntax
cd amplify/backend/function/dailySweep
node --check src/index.js

# Run database migration tests
npm run test:migrations
```

---

### 2. Data Validation Layer

**In Lambda Functions:**
```javascript
function validateSummonsData(data) {
  const errors = [];

  if (!data.createdAt) errors.push('Missing createdAt');
  if (!data.updatedAt) errors.push('Missing updatedAt');
  if (data.hearing_date && !data.hearing_date.endsWith('Z')) {
    errors.push('Invalid hearing_date format');
  }

  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }

  return data;
}

// Usage:
const newSummons = validateSummonsData({
  // ... fields
});
await createSummons(newSummons);
```

---

### 3. Type Safety in UI

**Create Type-Safe Formatters:**
```typescript
// utils/formatters.ts
export const formatCurrency = (
  value: number | string | null | undefined
): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num != null && !isNaN(num) ? `$${num.toFixed(2)}` : '';
};

// Use in DataGrid columns:
{
  field: 'amount_due',
  valueFormatter: formatCurrency,
}
```

---

### 4. Database Health Checks

**Regular Monitoring Script:**
```javascript
// scripts/check-database-health.js
async function checkDatabaseHealth() {
  const issues = [];

  const records = await scanAllRecords();

  for (const record of records) {
    if (!record.createdAt) {
      issues.push(`Record ${record.id}: Missing createdAt`);
    }
    if (!record.hearing_date?.endsWith('Z')) {
      issues.push(`Record ${record.id}: Invalid date format`);
    }
  }

  return issues;
}
```

**Run Weekly via Cron:**
```bash
# Every Monday at 9am
0 9 * * 1 node scripts/check-database-health.js
```

---

### 5. Amplify Version Lock

**In package.json:**
```json
{
  "dependencies": {
    "aws-amplify": "6.0.12"  // ← Lock exact version (no ^)
  }
}
```

**Why**: Prevents automatic minor version updates that could break configuration.

---

## Related Resources

### Official Documentation

- [AWS Amplify v6 Documentation](https://docs.amplify.aws/javascript/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [AWS AppSync DateTime Format](https://docs.aws.amazon.com/appsync/latest/devguide/scalars.html)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)

### Project Files Modified

1. `src/lib/amplifyClient.ts` - Amplify v6 configuration
2. `src/main.tsx` - Import order fix
3. `src/pages/Dashboard.tsx` - Enhanced error logging
4. `amplify/backend/function/dailySweep/src/index.js` - Lambda timestamp fixes
5. `amplify/backend/function/dataExtractor/src/index.js` - Lambda timestamp fixes
6. `src/components/SummonsTable.tsx` - UI type safety
7. `scripts/fix-database-timestamps.js` - Database repair utility
8. `scripts/README.md` - Repair script documentation
9. `package.json` - AWS SDK v3 dependencies

### Commits in Order

```
b289fac - fix(amplify): update to v6 configuration format and fix initialization order
b463e6c - fix(lambda): ensure proper ISO 8601 dates and Amplify timestamps
7135ef8 - feat(scripts): add database timestamp repair utility
ee48487 - fix(scripts): update DynamoDB table name for repair script
8825dcd - fix(scripts): convert repair script to ES modules and add AWS SDK v3
e25aa53 - fix(scripts): handle null ExclusiveStartKey in scan operation
54503e7 - fix(ui): handle string and null values in currency valueFormatters
```

---

## Conclusion

This debugging session demonstrated the importance of:

1. **Systematic Investigation** - Work through layers methodically
2. **Enhanced Logging** - Make errors visible before you can fix them
3. **Type Safety** - Validate data at every boundary
4. **Documentation** - Record solutions for future reference
5. **Testing** - Verify fixes work before moving to the next issue

**Final Status**: ✅ All 4 layers resolved, dashboard fully operational.

**Total Time**: ~3 hours of debugging across 7 commits.

**Lessons Applied**: Moving forward, all these patterns are now standard practice for the project.

---

**Prepared by**: Claude Code
**Date**: November 23, 2025
**Version**: 1.0
