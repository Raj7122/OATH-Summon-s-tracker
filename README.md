# NYC OATH Summons Tracker

A private, automated web application for the Law Office of Arthur L. Miller to track and manage NYC OATH summonses for idling violations.

## Project Overview

This system replaces the firm's manual process of downloading and filtering public spreadsheets. It automatically finds, tracks, and persists all NYC OATH "IDLING" violation summonses relevant to the firm's clients, providing a centralized dashboard for case management.



## Quick Start

```bash
# Install dependencies
npm install

# Run locally (requires Amplify backend to be deployed first)
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Deploy backend to AWS
amplify push

# Deploy frontend + backend to production
amplify publish
```

See [Getting Started](#getting-started) below for full setup instructions including AWS Amplify configuration.

## Features

- ✅ User authentication (Amazon Cognito)
- ✅ Client management CRUD with contact information
- ✅ Automated daily data sweep from NYC Open Data API
- ✅ Main dashboard with sortable, filterable data table
- ✅ Evidence tracking system (reviewed, requested, received)
- ✅ Notes field for internal case documentation
- ✅ Manual calendar handoff tracking
- ✅ CSV export functionality
- ✅ Invoice generation (PDF and DOCX) with summons cart
- ✅ Automated OCR using Google Gemini AI
- ✅ Web scraping for video evidence metadata
- ✅ Responsive design for mobile access

## Architecture

### System Overview

The NYC OATH Summons Tracker follows a serverless, event-driven architecture built on AWS Amplify Gen 1:

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│  React SPA (Vite) + MUI Components + Amplify DataStore Client  │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTPS (Amplify Hosting)
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AWS AMPLIFY (API LAYER)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Cognito    │  │   AppSync    │  │  EventBridge Cron    │  │
│  │  User Pool   │  │   GraphQL    │  │  (Daily @ 6:00 UTC)  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│         │                 │                      ▼              │
│         │                 │            ┌──────────────────┐     │
│         │                 │            │ dailySweep       │     │
│         │                 │            │ Lambda Function  │     │
│         │                 │            └─────────┬────────┘     │
│         │                 │                      │              │
│         ▼                 ▼                      ▼              │
└─────────────────────────────────────────────────────────────────┘
                        │ DynamoDB Streams
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                 │
│  ┌──────────────────────────────┐  ┌──────────────────────────┐│
│  │  DynamoDB Table: Client      │  │  DynamoDB Table: Summons ││
│  │  - PK: id (owner-specific)   │  │  - PK: id                ││
│  │  - name, akas, contacts      │  │  - GSI: clientID         ││
│  │  - @auth(owner isolation)    │  │  - @auth(owner isolation)││
│  └──────────────────────────────┘  └──────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼ (Triggers on INSERT)
              ┌──────────────────────┐
              │  dataExtractor       │
              │  Lambda Function     │
              │  - Scrapes NYC site  │
              │  - Calls Gemini OCR  │
              │  - Updates Summons   │
              └──────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                             │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐│
│  │ NYC Open     │  │ Google       │  │ NYC PDF/Video Services ││
│  │ Data API     │  │ Gemini API   │  │ - Summons PDFs         ││
│  │ (OATH Data)  │  │ (OCR)        │  │ - Idling Video Portal  ││
│  └──────────────┘  └──────────────┘  └────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

#### 1. Daily Sweep Flow (Automated)
```
EventBridge Scheduler (6:00 AM UTC)
  → Trigger dailySweep Lambda
    → Fetch IDLING summonses from NYC Open Data API
    → Query all Clients from DynamoDB (with owner context)
    → Match respondent_name to client.name or client.akas[]
    → For each match:
      → Check if summons exists (by summons_number)
      → INSERT new summons OR UPDATE existing summons
      → Generate PDF link, video link
    → Return summary (e.g., "10 new, 5 updated")
  → DynamoDB Stream triggers dataExtractor Lambda (for new summonses only)
```

#### 2. Data Extraction Flow (Automated)
```
DynamoDB Stream (on Summons INSERT)
  → Trigger dataExtractor Lambda
    → Web Scrape: Fetch video_created_date from NYC idling portal
    → OCR: Download PDF summons → Send to Gemini API
    → Parse Gemini response (JSON with license_plate_ocr, dep_id, etc.)
    → UPDATE summons record with all extracted fields
  → User sees updated data in DataGrid (auto-refresh via DataStore)
```

#### 3. User Interaction Flow
```
User Login
  → Cognito authenticates
  → AuthContext sets user state
  → Protected routes allow access

Dashboard Page Load
  → DataStore.query(Summons) with @auth filter (owner-specific)
  → Display all matching summonses in DataGrid
  → Calculate dashboard summary widgets (critical deadlines, top clients)

User Edits Evidence Checkbox
  → handleCheckboxChange() → DataStore.save()
  → AppSync GraphQL mutation with @auth check
  → DynamoDB UPDATE (if owner matches)
  → DataStore sync → UI updates immediately
```

### Security Architecture

**Multi-Layer Security:**

1. **Authentication**: AWS Cognito User Pools with email/password
2. **Authorization**: GraphQL `@auth(rules: [{ allow: owner }])` on all models
3. **Data Isolation**: DynamoDB queries automatically filter by `owner` (Cognito sub)
4. **API Security**:
   - NYC API token in Lambda environment variables (not exposed to frontend)
   - Gemini API key in Lambda environment variables (not exposed to frontend)
5. **HTTPS**: Enforced by AWS Amplify Hosting (TLS 1.2+)

### Scalability Considerations

- **DynamoDB**: Auto-scales read/write capacity
- **Lambda**: Auto-scales with concurrent executions
- **AppSync**: GraphQL queries support pagination via `@connection`
- **Amplify DataStore**: Offline-first sync with conflict resolution

---

## Tech Stack

### Frontend
- **Framework**: React 18+ with Vite
- **UI Library**: Material UI (MUI) v5+
  - `@mui/material` - Core components
  - `@mui/x-data-grid` - Professional DataGrid with sorting, filtering, CSV export
  - `@mui/x-date-pickers` - Date picker for evidence tracking
  - `@mui/x-charts` - Dashboard summary widgets (FR-10)
  - `@mui/icons-material` - Material Design icons
- **Routing**: React Router v6+
- **State Management**: React Context API (`AuthContext`)
- **Data Fetching**: AWS Amplify DataStore (GraphQL client)
- **Date Handling**: date-fns library

### Backend (AWS Amplify Gen 1)
- **Authentication**: Amazon Cognito User Pools
- **Database**: Amazon DynamoDB (NoSQL)
- **API**: AWS AppSync (GraphQL with subscriptions)
- **Functions**: AWS Lambda (Node.js runtime)
- **Scheduling**: Amazon EventBridge Scheduler
- **Hosting**: AWS Amplify Hosting (CDN + CI/CD)
- **Storage**: Amazon S3 (for deployment artifacts)

### External Services
- **NYC Open Data API**: OATH Hearings Division Case Status
  - Endpoint: `https://data.cityofnewyork.us/resource/jz4z-kudi.json`
  - Rate Limit: 1,000 requests/day with app token
- **NYC Summons PDF Service**: PDF document retrieval
  - Pattern: `https://a820-ecbticketfinder.nyc.gov/GetViolationImage?violationNumber={summons_number}`
- **NYC Idling Video Portal**: Web scraping for video metadata
  - Pattern: `https://nycidling.azurewebsites.net/idlingevidence/video/{summons_number}`
- **Google Gemini API**: OCR for PDF summons extraction
  - Model: `gemini-2.5-flash`
  - Rate Limit: Check Google Cloud Console quota

---

## API Endpoints

### GraphQL API (AWS AppSync)

All API requests go through AWS AppSync GraphQL endpoint. Authentication is required via Cognito JWT token.

#### Client Queries

```graphql
# Get all clients (filtered by owner)
query ListClients {
  listClients {
    items {
      id
      name
      akas
      contact_name
      contact_address
      contact_phone1
      contact_email1
      contact_phone2
      contact_email2
      createdAt
      updatedAt
    }
  }
}

# Get single client by ID
query GetClient {
  getClient(id: "abc-123") {
    id
    name
    summonses {
      items {
        id
        summons_number
        hearing_date
        status
      }
    }
  }
}

# Create client
mutation CreateClient {
  createClient(input: {
    name: "GC Warehouse Inc"
    akas: ["G.C. Whse", "GC Whse Inc"]
    contact_name: "John Smith"
    contact_phone1: "(555) 123-4567"
    contact_email1: "john@gcwarehouse.com"
  }) {
    id
    name
  }
}

# Update client
mutation UpdateClient {
  updateClient(input: {
    id: "abc-123"
    contact_phone2: "(555) 987-6543"
  }) {
    id
    name
  }
}

# Delete client
mutation DeleteClient {
  deleteClient(input: { id: "abc-123" }) {
    id
  }
}
```

#### Summons Queries

```graphql
# Get all summonses (filtered by owner)
query ListSummonses {
  listSummonses(limit: 100) {
    items {
      id
      clientID
      summons_number
      respondent_name
      hearing_date
      status
      amount_due
      lag_days
      evidence_reviewed
      added_to_calendar
      notes
    }
    nextToken
  }
}

# Get summonses for specific client
query SummonsesByClient {
  summonsesByClient(
    clientID: "abc-123"
    sortDirection: DESC
  ) {
    items {
      id
      summons_number
      hearing_date
      status
    }
  }
}

# Get single summons
query GetSummons {
  getSummons(id: "summons-456") {
    id
    summons_number
    respondent_name
    hearing_date
    status
    license_plate
    license_plate_ocr
    dep_id
    vehicle_type_ocr
    violation_date
    violation_location
    violation_narrative
    idling_duration_ocr
    prior_offense_status
    base_fine
    amount_due
    summons_pdf_link
    video_link
    video_created_date
    lag_days
    evidence_reviewed
    evidence_requested
    evidence_requested_date
    evidence_received
    added_to_calendar
    notes
    critical_flags_ocr
    createdAt
    updatedAt
  }
}

# Update summons (evidence tracking, notes)
mutation UpdateSummons {
  updateSummons(input: {
    id: "summons-456"
    evidence_reviewed: true
    notes: "Reviewed video evidence - strong case for dismissal"
  }) {
    id
    evidence_reviewed
    notes
  }
}
```

### Lambda Function APIs (Internal - Not Exposed to Frontend)

#### dailySweep Lambda

**Trigger**: EventBridge Scheduler (daily at 6:00 AM UTC)

**Environment Variables**:
- `NYC_OPEN_DATA_APP_TOKEN` - NYC Open Data API token

**Logic**:
1. Fetch up to 5,000 recent IDLING summonses from NYC Open Data
2. Query all Clients for the authenticated owner
3. Match `respondent_name` to `client.name` or `client.akas[]` (case-insensitive)
4. For each match:
   - Generate `summons_pdf_link` and `video_link`
   - Check if summons exists by `summons_number`
   - INSERT new summons or UPDATE existing summons
5. Return summary (e.g., "10 new, 5 updated")

**NYC Open Data API Request**:
```
GET https://data.cityofnewyork.us/resource/jz4z-kudi.json
  ?$limit=5000
  &code_description=IDLING
  &$order=hearing_date DESC
Headers:
  X-App-Token: {NYC_OPEN_DATA_APP_TOKEN}
```

**NYC Open Data Response Fields Used**:
- `summons_number` (unique identifier)
- `respondent_name` (matched to clients)
- `hearing_date` (ISO 8601 timestamp)
- `status` (e.g., "HEARING SCHEDULED", "DEFAULT JUDGMENT")
- `violation_date` (ISO 8601 timestamp)
- `violation_location` (street address)
- `license_plate` (from API, may be redacted)
- `base_fine` (float)
- `amount_due` (float)

#### dataExtractor Lambda

**Trigger**: DynamoDB Stream (on Summons INSERT)

**Environment Variables**:
- `GEMINI_API_KEY` - Google Gemini API key

**Logic**:
1. Receive new summons event from DynamoDB Stream
2. **Web Scraping**:
   - Fetch HTML from `https://nycidling.azurewebsites.net/idlingevidence/video/{summons_number}`
   - Use cheerio to extract "Video Created Date" from page
   - Calculate `lag_days` = days between `video_created_date` and `violation_date`
3. **OCR Extraction**:
   - Fetch PDF from `summons_pdf_link`
   - Send PDF buffer to Google Gemini API with structured extraction prompt
   - Parse JSON response containing:
     - `license_plate_ocr` (OCR'd license plate)
     - `dep_id` (DEP identification number)
     - `vehicle_type_ocr` (e.g., "BOX TRUCK")
     - `prior_offense_status` (e.g., "FIRST", "REPEAT")
     - `violation_narrative` (full narrative description)
     - `idling_duration_ocr` (e.g., "3+ MINUTES")
     - `critical_flags_ocr` (array of flags like "NO PLACARD", "ENGINE RUNNING")
     - `name_on_summons_ocr` (respondent name from PDF)
4. UPDATE summons record with all extracted fields

**Google Gemini API Request**:
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
Headers:
  Content-Type: application/json
  Authorization: Bearer {GEMINI_API_KEY}
Body:
{
  "contents": [{
    "parts": [
      { "text": "Extract structured data from this NYC OATH summons PDF..." },
      { "inline_data": { "mime_type": "application/pdf", "data": "<base64>" } }
    ]
  }]
}
```

**Gemini Response Format** (JSON extraction):
```json
{
  "license_plate": "ABC1234",
  "dep_id": "DEP-2024-12345",
  "vehicle_type": "BOX TRUCK",
  "prior_offense": "FIRST",
  "violation_narrative": "Vehicle observed idling for more than 3 minutes...",
  "idling_duration": "5 MINUTES",
  "critical_flags": ["ENGINE RUNNING", "NO PLACARD"],
  "name_on_summons": "GC Warehouse Inc"
}
```

---

## External API Documentation

### NYC Open Data OATH API

**Base URL**: `https://data.cityofnewyork.us/resource/jz4z-kudi.json`

**Authentication**: X-App-Token header (sign up at data.cityofnewyork.us)

**Rate Limits**:
- Without token: 1,000 requests/day
- With token: 50,000 requests/day

**Query Parameters**:
- `$limit` - Number of records (max 50,000 per request)
- `$offset` - Pagination offset
- `$order` - Sort field (e.g., `hearing_date DESC`)
- `code_description` - Filter by violation type (use `IDLING`)
- `$where` - SQL-like filter (e.g., `hearing_date > '2025-01-01'`)

**Example Request**:
```bash
curl -X GET \
  'https://data.cityofnewyork.us/resource/jz4z-kudi.json?$limit=10&code_description=IDLING&$order=hearing_date DESC' \
  -H 'X-App-Token: YOUR_TOKEN'
```

**Sample Response**:
```json
[
  {
    "summons_number": "123456789",
    "respondent_name": "GC WAREHOUSE INC",
    "hearing_date": "2025-12-15T09:30:00.000",
    "status": "HEARING SCHEDULED",
    "violation_date": "2025-11-01T14:20:00.000",
    "violation_location": "123 MAIN ST, BROOKLYN",
    "license_plate": "ABC1234",
    "base_fine": "350.00",
    "amount_due": "350.00",
    "code_description": "IDLING"
  }
]
```

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or later) - [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **AWS Account** - [Sign up](https://aws.amazon.com/)
- **Amplify CLI** - Install globally:
  ```bash
  npm install -g @aws-amplify/cli
  ```
- **Git** - [Download](https://git-scm.com/)

## Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd OATH-Summon-s-tracker
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure AWS Amplify

#### Initialize Amplify

```bash
amplify init
```

You'll be prompted to configure your project:

```
? Enter a name for the project: oathsummonstracker
? Enter a name for the environment: dev
? Choose your default editor: Visual Studio Code (or your preference)
? Choose the type of app that you're building: javascript
? What javascript framework are you using: react
? Source Directory Path: src
? Distribution Directory Path: dist
? Build Command: npm run build
? Start Command: npm run dev
? Do you want to use an AWS profile? Yes
? Please choose the profile you want to use: default (or your AWS profile)
```

#### Add Authentication (Cognito)

```bash
amplify add auth
```

Choose the following options:
```
? Do you want to use the default authentication and security configuration? Default configuration
? How do you want users to be able to sign in? Email
? Do you want to configure advanced settings? No, I am done
```

#### Add API (GraphQL with DynamoDB)

```bash
amplify add api
```

Choose the following options:
```
? Select from one of the below mentioned services: GraphQL
? Here is the GraphQL API that we will create. Select a setting to edit or continue: Continue
? Choose a schema template: Single object with fields
```

Then replace the generated `amplify/backend/api/[api-name]/schema.graphql` with the schema already in this repo at `amplify/backend/api/schema.graphql`.

#### Add Lambda Functions

**Daily Sweep Function:**

```bash
amplify add function
```

Options:
```
? Select which capability you want to add: Lambda function
? Provide an AWS Lambda function name: dailySweep
? Choose the runtime that you want to use: NodeJS
? Do you want to configure advanced settings? Yes
? Do you want to access other resources in this project from your Lambda function? Yes
? Select the categories you want this function to have access to: API
? Do you want to invoke this function on a recurring schedule? Yes
? At which interval should the function be invoked: Daily
? Select the time (UTC) when the function should be invoked: 06:00 (or your preference)
? Do you want to enable Lambda layers for this function? No
? Do you want to configure environment variables for this function? Yes
```

Copy the code from `amplify/backend/function/dailySweep/index.js` in this repo.

**Data Extractor Function:**

```bash
amplify add function
```

Options:
```
? Select which capability you want to add: Lambda function
? Provide an AWS Lambda function name: dataExtractor
? Choose the runtime that you want to use: NodeJS
? Do you want to configure advanced settings? Yes
? Do you want to access other resources in this project from your Lambda function? Yes
? Select the categories you want this function to have access to: API
? Do you want to invoke this function on a recurring schedule? No
? Do you want to enable Lambda layers for this function? No
? Do you want to configure environment variables for this function? Yes
```

Copy the code from `amplify/backend/function/dataExtractor/index.js` in this repo.

### 4. Deploy Backend to AWS

```bash
amplify push
```

This will:
- Create DynamoDB tables (Client, Summons)
- Set up AppSync GraphQL API
- Create Cognito User Pool
- Deploy Lambda functions
- Set up EventBridge scheduler for daily sweep

⏱️ This process takes 10-20 minutes.

### 5. Configure Environment Variables

After deployment, configure the following in the **AWS Console**:

#### Lambda Function: `dailySweep-dev`

1. Go to AWS Lambda Console
2. Find the `dailySweep-dev` function
3. Go to Configuration → Environment variables
4. Add:
   - `NYC_OPEN_DATA_APP_TOKEN`: Your NYC API token from [data.cityofnewyork.us](https://data.cityofnewyork.us/login)

#### Lambda Function: `dataExtractor-dev`

1. Go to AWS Lambda Console
2. Find the `dataExtractor-dev` function
3. Go to Configuration → Environment variables
4. Add:
   - `GEMINI_API_KEY`: Your Google Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

### 6. Create Initial Users

```bash
amplify console auth
```

This opens the Cognito Console. Navigate to:
1. User Pools → [Your Pool]
2. Users → Create user
3. Add users for Arthur, Jackie, and Jelly

### 7. Run the Application Locally

```bash
npm run dev
```

The app will open at `http://localhost:3000`.

## Deployment to Production

### Deploy Frontend and Backend

```bash
amplify add hosting
```

Choose:
```
? Select the plugin module to execute: Hosting with Amplify Console
? Choose a type: Manual deployment
```

Then:

```bash
amplify publish
```

This will deploy both the backend (if not already deployed) and the frontend to AWS Amplify Hosting.

## Project Structure

```
/
├── amplify/                      # AWS Amplify configuration
│   └── backend/
│       ├── api/
│       │   └── schema.graphql    # GraphQL schema (Client, Summons)
│       └── function/
│           ├── dailySweep/       # Daily data sweep Lambda
│           └── dataExtractor/    # OCR & scraper Lambda
├── src/
│   ├── pages/
│   │   ├── Login.tsx             # Authentication page
│   │   ├── Dashboard.tsx         # Main summons dashboard
│   │   ├── Clients.tsx           # Client management CRUD
│   │   ├── Account.tsx           # User account settings
│   │   └── InvoiceBuilder.tsx    # Invoice generation page
│   ├── components/
│   │   ├── Layout.tsx            # App shell
│   │   ├── Header.tsx            # Navigation bar
│   │   ├── SummonsTable.tsx      # MUI DataGrid for summons
│   │   ├── ClientForm.tsx        # Client add/edit form
│   │   └── ProtectedRoute.tsx    # Auth route guard
│   ├── lib/
│   │   └── amplifyClient.ts      # Amplify configuration
│   ├── contexts/
│   │   ├── AuthContext.tsx       # Authentication state
│   │   └── InvoiceContext.tsx    # Invoice cart state
│   ├── constants/
│   │   └── invoiceDefaults.ts    # Invoice template defaults
│   ├── utils/
│   │   └── invoiceGenerator.ts   # PDF/DOCX generation
│   ├── types/
│   │   └── invoice.ts            # Invoice TypeScript types
│   ├── theme.ts                  # MUI theme
│   ├── App.tsx                   # Main app component
│   └── main.tsx                  # Entry point
├── public/
├── tests/                        # Unit tests
├── .env.example                  # Environment variables template
├── package.json
├── vite.config.ts
├── TRD.md                        # Technical Requirements Document
├── CLAUDE.md                     # AI Assistant Guide
└── README.md                     # This file
```

## Testing

### Run Unit Tests (Lambda Functions)

```bash
# Install test dependencies for Lambda functions
cd amplify/backend/function/dailySweep
npm install
npm test

cd ../dataExtractor
npm install
npm test
```

### Run Frontend Tests

```bash
npm test
```

## Daily Operations

### How the System Works

1. **Daily Sweep (Automated)**
   - Runs every day at 6:00 AM UTC via EventBridge
   - Fetches up to 5,000 recent IDLING summonses from NYC Open Data API
   - Matches respondent names to registered clients (case-insensitive, includes AKAs)
   - Creates new summons records or updates existing ones
   - Triggers data extraction for new summonses

2. **Data Extraction (Automated)**
   - Scrapes the NYC idling video page for "Video Created Date"
   - Fetches the PDF summons and sends it to Google Gemini
   - Extracts structured data (license plate, vehicle type, violation narrative, etc.)
   - Updates the summons record with all extracted data

3. **User Workflow**
   - Users log in to view the dashboard
   - All matched summonses appear in a sortable, filterable table
   - Users can:
     - Mark evidence as reviewed, requested, or received
     - Add internal notes
     - Flag when a summons has been added to the calendar
     - Export filtered data to CSV
   - All user data is isolated (User A cannot see User B's data)

## Maintenance

### View Logs

```bash
# View Lambda function logs
amplify console function
```

Or use CloudWatch directly in the AWS Console.

### Update GraphQL Schema

1. Edit `amplify/backend/api/[api-name]/schema.graphql`
2. Run `amplify push` to apply changes

### Update Lambda Functions

1. Edit the function code in `amplify/backend/function/[function-name]/`
2. Run `amplify push` to deploy changes

## Troubleshooting

### Issue: Frontend can't connect to backend

**Solution**: Ensure you ran `amplify push` and the `aws-exports.js` file was generated. Check that your `amplifyClient.ts` imports this file.

### Issue: Daily sweep not running

**Solution**: Check EventBridge in AWS Console. Verify the rule is enabled and the Lambda function has the correct permissions.

### Issue: OCR not working

**Solution**:
1. Verify `GEMINI_API_KEY` is set in Lambda environment variables
2. Check CloudWatch logs for errors
3. Ensure Google Gemini API is enabled and has quota

### Issue: User can't sign in

**Solution**:
1. Verify user exists in Cognito User Pool
2. Check that user's account is confirmed
3. Reset password if needed

## Security

- **Data Isolation**: All database queries are protected by Amplify's `@auth(rules: [{ allow: owner }])` directive
- **Secrets**: Never commit `.env` files or API keys to version control
- **Access Control**: Only authenticated users can access the application
- **HTTPS**: All data in transit is encrypted (enforced by Amplify Hosting)

## API Rate Limits

- **NYC Open Data**: 1,000 requests/day with app token
- **Google Gemini**: Check your quota at [Google Cloud Console](https://console.cloud.google.com/)

## Support

For issues or questions:
1. Check the TRD.md for complete technical specifications
2. Review CloudWatch logs for Lambda function errors
3. Consult the AWS Amplify documentation: https://docs.amplify.aws/

---

## Backup & Recovery

### Code Backup

The application code is stored in a GitHub repository. The owner can download a complete backup at any time:

1. Go to the GitHub repository URL (provided separately)
2. Click the green "Code" button
3. Select "Download ZIP"
4. Save the ZIP file to a safe location

This ZIP contains all frontend code, Lambda functions, and configuration files needed to redeploy the application.

### Data Backup

Data is automatically backed up by AWS DynamoDB's continuous backup feature. Additionally:

1. **Export to CSV**: Users can export summons data from the Dashboard at any time
2. **DynamoDB Exports**: The account owner can use AWS Console to export full table backups to S3

### Disaster Recovery

If the application needs to be redeployed to a new AWS account:

1. Download the code ZIP from GitHub
2. Create new AWS and Google Cloud accounts (see `FOR_ARTHUR_ACCOUNT_SETUP.md`)
3. Follow the "Getting Started" section above to redeploy
4. Import any backed-up data using DynamoDB import tools

---

## Handoff Documentation

This repository includes additional documentation for project handoff:

| Document | Purpose |
|----------|---------|
| `FOR_ARTHUR_ACCOUNT_SETUP.md` | Account setup guide for the non-technical client |
| `CLIENT_USER_MANUAL.md` | End-user manual for Arthur, Jackie, and Jelly |
| `TRD.md` | Complete Technical Requirements Document |
| `CLAUDE.md` | AI Assistant context and coding guidelines |
| `CONTRIBUTING.md` | Guidelines for contributing to the project |
| `LICENSE` | Proprietary software license |

---

## License

Private - Law Office of Arthur L. Miller

## Contributors

- Arthur L. Miller (Attorney)
- Jackie (Assistant)
- Jelly (Admin)

---

**Last Updated**: December 21, 2025
**Version**: 1.0.0 (MVP)
