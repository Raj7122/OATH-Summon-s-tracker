# Testing Guide - NYC OATH Summons Tracker

## Current Status

✅ **Completed:**
- Amplify backend deployed with corrected Lambda functions
- DynamoDB Stream trigger configured for dataExtractor
- Cognito authentication with password change flow implemented
- GraphQL CRUD operations for clients working
- Frontend AKAs column display fixed
- User "Arthur" created and tested

⏳ **Remaining:**
- Create Cognito users: Jackie and Jelly
- Test dailySweep Lambda function manually
- Verify end-to-end application flow

---

## 1. Pull Latest Changes

Before testing, pull the latest code from the branch:

```bash
git pull origin claude/cli-performance-investigation-01DEiEpVzwHAKt3GHbN8hX1m
```

This includes the fix for the AKAs column display issue.

---

## 2. Create Remaining Cognito Users

### Via AWS Console:

1. Go to: **AWS Console → Cognito → User Pools → `oathsummonstracker8a6d84c8`**
2. Click **"Users"** tab → **"Create user"**

**For Jackie:**
- Username: `jackie@arthurmillerlaw.com`
- Email: `jackie@arthurmillerlaw.com`
- ✅ Mark email as verified
- Temporary password: `TempPass123!`
- ❌ Uncheck "Send invitation"

**For Jelly:**
- Username: `jelly@arthurmillerlaw.com`
- Email: `jelly@arthurmillerlaw.com`
- ✅ Mark email as verified
- Temporary password: `TempPass123!`
- ❌ Uncheck "Send invitation"

---

## 3. Test Local Application

### Start the dev server:
```bash
npm run dev
```

### Test Authentication Flow:
1. **Login with Arthur** (existing user)
   - Email: `arthur@arthurmillerlaw.com`
   - Password: Use the new password set during first login
   - ✅ Should navigate to dashboard

2. **Login with Jackie** (first time)
   - Email: `jackie@arthurmillerlaw.com`
   - Temporary password: `TempPass123!`
   - ✅ Should prompt for password change
   - Set new password (at least 8 characters)
   - ✅ Should navigate to dashboard

3. **Login with Jelly** (first time)
   - Repeat same flow as Jackie

### Test Client Management:
1. Navigate to **"Clients"** page
2. **Create a test client:**
   - Name: `Test Warehouse Inc`
   - AKAs: `Test Whse`, `Test WH`
   - Contact Name: `John Smith`
   - Contact Email: `john@testwarehouse.com`
   - Contact Phone: `212-555-1234`
   - Click **"Save"**
   - ✅ Client should appear in the data grid
   - ✅ AKAs should display as: `Test Whse, Test WH`

3. **Edit the client:**
   - Click edit icon on the test client
   - Add Contact Address: `123 Test St, New York, NY 10001`
   - Click **"Save"**
   - ✅ Changes should persist

4. **Verify user isolation:**
   - Login as Jackie (different user)
   - Navigate to Clients page
   - ✅ Should NOT see Arthur's clients
   - ✅ Should only see Jackie's own clients

---

## 4. Test dailySweep Lambda Function

The dailySweep function fetches IDLING summonses from NYC Open Data and matches them to registered clients.

### Prerequisites:
- At least one client exists in the database (create via Clients page)
- NYC_OPEN_DATA_APP_TOKEN environment variable is set in Lambda

### Manual Test via AWS Console:

1. Go to: **AWS Console → Lambda → Functions → `dailySweep-dev`**

2. Click **"Test"** tab → **"Create new test event"**
   - Event name: `manual-sweep-test`
   - Event JSON: `{}`
   - Click **"Save"**

3. Click **"Test"** button

4. **Expected response:**
```json
{
  "statusCode": 200,
  "body": "{\"message\":\"Daily sweep completed successfully\",\"matched\":X,\"created\":Y,\"updated\":Z,\"errors\":0}"
}
```

5. **Check CloudWatch Logs:**
   - Click **"Monitor"** tab → **"View CloudWatch logs"**
   - Look for log entries showing:
     - `Fetched X clients from database`
     - `Fetched Y summonses from NYC API`
     - `Created new summons: [summons_number]`

6. **Verify summonses were created:**
   - Go to: **DynamoDB → Tables → `Summons-dev` → "Explore table items"**
   - ✅ Should see new summons records with matching clientID

### Common Issues:

**❌ "No clients found"**
- Create at least one client via the Clients page first

**❌ "Failed to fetch NYC data: 401"**
- NYC_OPEN_DATA_APP_TOKEN environment variable is missing or invalid
- Get a valid token from: https://data.cityofnewyork.us/profile/app_tokens
- Add it to Lambda: Configuration → Environment variables → Edit

**❌ "Error finding existing summons: ValidationException"**
- The `bySummonsNumber` index may not exist on the Summons table
- Go to: DynamoDB → Tables → `Summons-dev` → Indexes
- If missing, you'll need to recreate the index via Amplify schema update

---

## 5. Test dataExtractor Lambda Function

The dataExtractor function scrapes video evidence dates and extracts OCR data from summons PDFs.

### Automatic Trigger Test:

After dailySweep creates a new summons, dataExtractor should automatically trigger via DynamoDB Stream.

1. **Check that DynamoDB Stream is enabled:**
   - Go to: **DynamoDB → Tables → `Summons-dev` → "Exports and streams"**
   - ✅ Stream should show: **Enabled (New image)**

2. **Check Lambda trigger:**
   - Go to: **Lambda → Functions → `dataExtractor-dev` → Configuration → Triggers**
   - ✅ Should show: **DynamoDB - Summons-dev**

3. **After running dailySweep:**
   - Wait 30-60 seconds
   - Go to: **Lambda → Functions → `dataExtractor-dev` → Monitor → View CloudWatch logs**
   - ✅ Should see log entries for each new summons processed

4. **Verify OCR data was extracted:**
   - Go to: **DynamoDB → Tables → `Summons-dev` → Explore table items**
   - Click on a recently created summons
   - ✅ Should see populated fields:
     - `video_created_date` (from web scraping)
     - `lag_days` (calculated)
     - `license_plate_ocr` (from Gemini)
     - `dep_id` (from Gemini)
     - `violation_narrative` (from Gemini)

### Manual Test:

If you need to test dataExtractor directly:

1. Go to: **Lambda → Functions → `dataExtractor-dev` → Test tab**

2. Create test event with real summons data:
```json
{
  "summons_id": "test-summons-id-123",
  "summons_number": "12345678",
  "pdf_link": "https://a820-ecbticketfinder.nyc.gov/GetViolationImage?violationNumber=12345678",
  "video_link": "https://nycidling.azurewebsites.net/idlingevidence/video/12345678",
  "violation_date": "2024-01-15T10:30:00Z"
}
```

3. Click **"Test"** and check CloudWatch logs for:
   - Web scraping results
   - Gemini API response
   - DynamoDB update confirmation

---

## 6. End-to-End Application Test

### Complete workflow test:

1. **Login as Arthur**
2. **Create a client:**
   - Name: `GC Warehouse LLC`
   - AKAs: `GC WHSE`, `G.C. Warehouse`
   - Add all contact details
3. **Manually trigger dailySweep** (AWS Console)
4. **Wait 2-3 minutes** for dataExtractor to finish
5. **Refresh Dashboard page**
6. ✅ **Expected results:**
   - Summonses with respondent name matching "GC Warehouse LLC" or any AKA should appear
   - Evidence tracking checkboxes should be interactive
   - Notes field should save on blur
   - Summons PDF and video links should open when clicked
   - CSV export should download with all visible data

---

## 7. Test EventBridge Scheduler

The dailySweep function should run automatically every day.

### Verify scheduler configuration:

1. Go to: **AWS Console → EventBridge → Schedules**
2. ✅ Should see: `daily-oath-sweep`
3. Click on it to verify:
   - Schedule: `cron(0 9 * * ? *)` (runs at 9 AM UTC daily)
   - Target: `dailySweep-dev` Lambda function
   - State: **Enabled**

### Test scheduler:

- Wait for the next scheduled run
- Check CloudWatch logs for dailySweep at 9 AM UTC
- OR change the schedule to run in the next few minutes for immediate testing

---

## 8. Pre-Demo Checklist (Friday)

Before presenting to Pak Chu:

- [ ] All 3 users can login (Arthur, Jackie, Jelly)
- [ ] Client CRUD operations work (create, edit, delete, view)
- [ ] AKAs display correctly in client list
- [ ] dailySweep successfully pulls summonses from NYC API
- [ ] At least 1 real summons appears in dashboard
- [ ] Evidence tracking checkboxes persist
- [ ] Notes field saves correctly
- [ ] Summons PDF link opens
- [ ] Video evidence link opens
- [ ] CSV export downloads
- [ ] dataExtractor populates OCR fields (verify in DynamoDB)
- [ ] User isolation works (User A can't see User B's data)

---

## Environment Variables Reference

### dailySweep-dev Lambda:
- `CLIENTS_TABLE`: `Client-dev`
- `SUMMONS_TABLE`: `Summons-dev`
- `NYC_OPEN_DATA_APP_TOKEN`: (your app token)
- `DATA_EXTRACTOR_FUNCTION`: `dataExtractor-dev`

### dataExtractor-dev Lambda:
- `SUMMONS_TABLE`: `Summons-dev`
- `GEMINI_API_KEY`: (your Gemini API key)

---

## Troubleshooting

### "Cannot read properties of undefined"
- ✅ **Fixed** in latest commit (renderCell with safe access)
- Pull latest changes: `git pull origin claude/cli-performance-investigation-01DEiEpVzwHAKt3GHbN8hX1m`

### Client not saving
- ✅ **Fixed** in latest commit (GraphQL mutations implemented)
- Pull latest changes

### Client update error with duplicate `id`
- ✅ **Fixed** in latest commit (correct destructuring)
- Pull latest changes

### Login shows spinner but doesn't navigate
- Check user status in Cognito Console
- If "FORCE_CHANGE_PASSWORD", the password change flow should appear
- If not appearing, check browser console for errors

### Summonses not appearing in dashboard
- Verify client name/AKAs match exactly with respondent names in NYC data
- Check CloudWatch logs for dailySweep to see match results
- Remember: matching is case-insensitive but must be exact (including punctuation)

---

## Next Steps After Testing

Once all tests pass:

1. Document any bugs or issues found
2. Prepare demo script for Friday presentation
3. Consider adding sample clients with known NYC summonses
4. Verify mobile responsiveness on phone/tablet
5. Create a README.md with deployment instructions for production

---

*Last Updated: 2025-11-20*
*Branch: `claude/cli-performance-investigation-01DEiEpVzwHAKt3GHbN8hX1m`*
