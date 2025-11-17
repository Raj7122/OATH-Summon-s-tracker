# NYC OATH Summons Tracker

## BATTLE-TESTED TRD (AI-NATIVE, CODING-AGENT READY)

**Version:** 1.4
**Date:** November 17, 2025
**Status:** FOR DEVELOPMENT

---

## 1. System Overview

### Purpose:
This system provides a private, automated web application for the Law Office of Arthur L. Miller. It replaces the firm's current 100% manual, error-prone process of downloading and filtering public spreadsheets. It will automatically find, track, and persist all NYC OATH summonses (specifically "IDLING" violations) relevant to the firm's clients, providing a central dashboard for case management and handoff.

### Users:

- **Arthur (Attorney)**: Primary user. Manages caseload, reviews data, makes legal decisions.
- **Jackie (Assistant)**: Co-manages the app, monitors the dashboard, performs data entry (notes, evidence tracking), and handles calendar handoffs.
- **Jelly (Admin)**: Tertiary user. Consumes data for billing and scheduling (outside the app).

### High-level summary:
The system is a React (Vite) + Material UI (MUI) frontend that connects to an AWS Amplify backend. Amplify will provide the NoSQL database (DynamoDB), User Authentication (Cognito), and serverless Functions (AWS Lambda) for automated data sweeps and data extraction.

---

## 2. Scope

### In Scope (for this Dec 18 MVP build)

- User login system for 3 users (Arthur, Jackie, Jelly).
- A "Manage Clients" page (CRUD) for ~53 clients and their AKAs.
- **NEW**: Additional fields on the "Clients" table: Contact Name, Address, Phone (x2), Email (x2).
- An automated, daily data sweep (via AWS Lambda + Amazon EventBridge) of the NYC Open Data API.
- A main "Dashboard" data table showing all summonses for all clients, built with MUI DataGrid.
- A manual "Added to Calendar" checkbox for each summons.
- A free-text "Notes" field for each summons.
- **NEW**: A simple "Evidence Tracking" system per summons:
  - Checkbox: Was file reviewed internally? (Y/N)
  - Checkbox: Did we ask client for evidence? (Y/N)
  - Date Field: When did we ask for evidence? (using MUI-X DatePicker)
  - Checkbox: Did we receive evidence? (Y/N)
- Hyperlinks to the city's summons PDF and any available video links.
- **NEW**: Automated web scraping of the idling complaint page to find the "Video Created Date".
- **NEW**: Automated AI/OCR (using Google Gemini) of summons PDFs to extract key data.
- A "CSV Export" button (using MUI DataGrid's built-in functionality).
- A secure, production-ready deployment on AWS Amplify Hosting.

### Out of Scope (Must NOT be built)

- **NO** file uploads or document storage (Arthur will use Google Drive/OneDrive and paste links into the Notes field).
- **NO** Invoicing, billing, or "fee template" system. This is a [P2] feature.
- **NO** automated Google Calendar integration (the Added to Calendar checkbox is a manual flag). This is a [P1] feature.
- **NO** automated email alerts or reminders (e.g., "3 days prior"). This is a [P2] feature.

---

## 3. Functional Requirements

### FR-01: User Authentication

**Description**: Users must log in to access the system.

**User Story**: "As a user, I want to log in with my email and password so that I can access the secure dashboard."

**Inputs**: Email, Password (using MUI `<TextField>`).

**Outputs**: A valid session.

**Process / Logic**:
- Use AWS Amplify Authentication (backed by Amazon Cognito).
- Protect all pages (except Login) behind auth.
- Implement a "Forgot Password" flow (via Amplify Auth).
- All database queries must be protected by Amplify's GraphQL auth rules.

---

### FR-02: Client Management (CRUD)

**Description**: A dedicated page to create, read, update, and delete clients.

**User Story**: "As Jackie, I want to add a new client and their AKAs, address, and contact info so the daily sweep can track them."

**Inputs**: (All fields implemented using MUI `<TextField>`)
- `name` (text, required)
- `akas` (array of text)
- `contact_name` (text, nullable)
- `contact_address` (text, nullable)
- `contact_phone1` (text, nullable)
- `contact_email1` (text, nullable)
- `contact_phone2` (text, nullable)
- `contact_email2` (text, nullable)

**Outputs**: A list/table of all clients (using MUI `<DataGrid>`).

**Process / Logic**:
- Create a new page `/clients`.
- Display all clients from the `Client` data model in a `<DataGrid>`.
- Provide a form (in a `<Modal>` or new page) to add a new client.
- Provide "Edit" and "Delete" buttons for each client.

---

### FR-03: Automated Daily Data Sweep

**Description**: A backend function that runs automatically to find new summonses.

**User Story**: "As a system, I want to check the NYC Open Data API every 24 hours to find new 'IDLING' summonses for my registered clients."

**Process / Logic**:

This must be an **AWS Lambda Function** (managed by Amplify, e.g., `/amplify/functions/daily-sweep`).

It must be triggered daily by an **Amazon EventBridge Scheduler** (e.g., `rate(1 day)`).

**Step 1: Get Clients**: Fetch all records from the `Client` table (DynamoDB). Create a list of all `name` and `akas` values.

**Step 2: Fetch API Data**: Make an HTTP GET request to the NYC Open Data API.
- URL: `https://data.cityofnewyork.us/resource/jz4z-kudi.json`
- Query Params:
  - `$limit`: 5000 (to get a large recent batch)
  - `code_description`: IDLING
  - `$order`: hearing_date DESC

**Step 3: Process & Match**:
- Iterate through all summonses returned from the API.
- Perform a case-insensitive check of the `respondent` field against the list of client `name` and `akas`.
- For each match:
  - Auto-generate Links:
    - `pdf_link = "https://a820-ecbticketfinder.nyc.gov/GetViolationImage?violationNumber=" + summons_number`
    - `video_link = "https://nycidling.azurewebsites.net/idlingevidence/video/" + summons_number`
  - Check if `summons_number` already exists in the `Summons` table.
  - If **NO**: This is a new summons. Create a new record in the `Summons` table, mapping API fields. Store the `pdf_link` and `video_link`. Asynchronously invoke the `data-extractor` function (FR-09).
  - If **YES**: This is an update. Compare the `status` and `amount_due` fields. If they are different, update the existing record.

---

### FR-04: Main Summons Dashboard

**Description**: The main landing page, showing all tracked summonses in a table.

**User Story**: "As Arthur, I want to see a sortable, filterable table of all my client summonses so I can see what work needs to be done."

**Outputs**: A large data table (using MUI `<DataGrid>`).

**Columns**:
- Client Name
- Summons Number
- Hearing Date
- Status
- License Plate (from API)
- License Plate (from OCR)
- Violation Date
- Video Created Date
- Lag (Days)
- Base Fine (from API)
- Amount Due (from API)
- Summons PDF (Hyperlink)
- Video Link (Hyperlink)
- ... (and all other FR-05, FR-07 fields)

---

### FR-05: Evidence Tracking

**Description**: A set of checkboxes and a date field on the main dashboard for each summons.

**User Story**: "As Jackie, I want to mark a summons as 'Reviewed' and track when I 'Requested' and 'Received' evidence from the client."

**Inputs**:
- `evidence_reviewed` (MUI `<Checkbox>`)
- `evidence_requested` (MUI `<Checkbox>`)
- `evidence_requested_date` (MUI-X `<DatePicker>`)
- `evidence_received` (MUI `<Checkbox>`)

**Process / Logic**:
- These are fields in the `Summons` data model, editable within the `<DataGrid>`.
- When a user checks/unchecks or enters a date, the frontend will call the Amplify DataStore API to UPDATE that single summons record.

---

### FR-06: Notes Field

**Description**: A text field for internal notes on each summons.

**User Story**: "As Arthur, I want to add a note like 'Client claims refrigeration unit was on' to a summons so I don't forget the defense details."

**Inputs**: `notes` (MUI `<TextField>`, multiline).

**Process / Logic**:
- This is a field in the `Summons` data model, likely edited via a `<Modal>` or cell click.
- When a user adds/edits a note, the frontend will UPDATE the record.

---

### FR-07: Manual Calendar Handoff

**Description**: A single checkbox to flag that a summons has been manually added to an external calendar.

**User Story**: "As Jackie, I want to check 'Added to Calendar' so Arthur and I know this item has been processed and handed off to Clio/Google Calendar."

**Inputs**: `added_to_calendar` (MUI `<Checkbox>`).

**Process /Logic**:
- This is a field in the `Summons` data model, editable in the `<DataGrid>`.
- When a user checks/unchecks, the frontend will UPDATE the record.

---

### FR-08: CSV Export

**Description**: A button to export the current dashboard view to a CSV.

**User Story**: "As Arthur, I want to export my current filtered view to a CSV so I can use it in other programs or create reports."

**Process / Logic**:
- Implement the MUI `<DataGrid>` toolbar
- Enable the built-in CSV Export functionality of the DataGrid.

---

### FR-09: Automated Data Extraction (OCR & Scraper)

**Description**: An automated backend function to extract data from the PDF summons and the video complaint page.

**User Story**: "As a system, I want to automatically read the PDF and scrape the video page for every new summons to populate advanced data fields and save Arthur time."

**Trigger**: Invoked (async) by FR-03 after a new summons is created.

**Inputs**: `{ "summons_id": "uuid", "summons_number": "text", "pdf_link": "text", "video_link": "text", "violation_date": "timestamptz" }`

**Process / Logic**:

This must be an **AWS Lambda Function** (managed by Amplify, `/amplify/functions/data-extractor`).

**Part A: Web Scraper (Video Date)**
- Make an HTTP GET request to the `video_link`.
- Use `cheerio` to parse the HTML. Find the element containing the "Video Created Date".
- Parse this date string into a timestamt (`video_created_date`).
- Calculate `lag_days = video_created_date - violation_date`.

**Part B: PDF OCR (AI Extraction)**
- Make an HTTP GET request to the `pdf_link` to get the PDF file as a buffer.
- Call the **Google Gemini API** (e.g., `gemini-2.5-flash`).
- Prompt: "You are an expert legal assistant. Extract the following fields from this PDF summons and return ONLY a valid JSON object.
`{ "license_plate_ocr": "...", "dep_id": "...", "vehicle_type": "...", "prior_offense_status": "...", "violation_narrative": "...", "idling_duration_ocr": "...", "critical_flags_ocr": ["...", "..."], "name_on_summons_ocr": "..." }`"

**Part C: Update Database**
- Collect all extracted data (`video_created_date`, `lag_days`, and all fields from the AI JSON).
- UPDATE the `Summons` table (via Amplify DataStore) `SET ... WHERE id = summons_id`.

**Edge Cases**:
- If PDF or video link is 404, log the error and return.
- If HTML selector is not found, log the error and return.
- If Gemini API fails or returns invalid JSON, log the error and return.

---

## 4. Data Model / Database Schema

(This is an AWS Amplify (GraphQL/NoSQL) schema. This `schema.graphql` file will be used by Amplify to provision DynamoDB tables and the AppSync API.)

```graphql
# This is an Amplify GraphQL Schema

type Client @model @auth(rules: [{ allow: owner }]) {
  id: ID!
  name: String!
  akas: [String]
  contact_name: String
  contact_address: String
  contact_phone1: String
  contact_email1: String
  contact_phone2: String
  contact_email2: String
  summonses: [Summons] @hasMany(indexName: "byClient", fields: ["id"])
}

type Summons @model @auth(rules: [{ allow: owner }]) {
  id: ID!
  clientID: ID! @index(name: "byClient", sortKeyFields: ["hearing_date"])
  client: Client @belongsTo(fields: ["clientID"])

  # Core API Fields
  summons_number: String! @index(name: "bySummonsNumber", queryField: "summonsBySummonsNumber")
  respondent_name: String
  hearing_date: AWSDateTime
  status: String
  license_plate: String
  base_fine: Float
  amount_due: Float
  violation_date: AWSDateTime
  violation_location: String

  # Generated Links
  summons_pdf_link: AWSURL
  video_link: AWSURL

  # Scraper Fields
  video_created_date: AWSDateTime
  lag_days: Int

  # User-Input Fields
  notes: String
  added_to_calendar: Boolean @default(value: "false")
  evidence_reviewed: Boolean @default(value: "false")
  evidence_requested: Boolean @default(value: "false")
  evidence_requested_date: AWSDateTime
  evidence_received: Boolean @default(value: "false")

  # OCR (Gemini) Fields
  dep_id: String
  license_plate_ocr: String
  vehicle_type_ocr: String
  prior_offense_status: String
  violation_narrative: String
  idling_duration_ocr: String
  critical_flags_ocr: [String]
  name_on_summons_ocr: String
}
```

---

## 5. API Requirements (Frontend ↔ Backend Contract)

- **API Type**: GraphQL (managed by AWS AppSync, provisioned by Amplify).
- **Authentication**: All requests will be authenticated using Amazon Cognito session tokens, handled automatically by the Amplify client library.
- **Frontend-Backend Contract**: The contract is the `schema.graphql` file in Section 4. The Amplify client library will auto-generate all necessary mutations (create, update, delete) and queries (get, list) for the frontend to use.

---

## 6. Application Architecture

### Tech Stack:

- **Frontend**: React (Vite), React Router, MUI (`@mui/material`, `@mui/x-data-grid`, `@mui/x-date-pickers`, `@mui/icons-material`), `@emotion/react`, `@emotion/styled`
- **Backend**: AWS Amplify (Cognito, DynamoDB, AppSync, AWS Lambda, EventBridge)
- **Libraries**: `aws-amplify`, `cheerio` (for scraping)

### Frontend Architecture:

- Standard Vite/React project structure.
- Use MUI for all UI components.
- Use React Context for managing Amplify auth state.
- Use Amplify DataStore (or React Query) for data fetching.

### Backend Architecture:

- **Auth**: Amazon Cognito (managed by Amplify).
- **DB**: Amazon DynamoDB (managed by Amplify DataStore).
- **API**: AWS AppSync (GraphQL, managed by Amplify).
- **Functions**: AWS Lambda (managed by Amplify).
- **Cron**: Amazon EventBridge Scheduler to trigger the `daily-sweep` Lambda.
- **Reliability**: AWS Amplify's serverless infrastructure is inherently "always on," resolving the "sleeping app" problem from the Supabase free tier.

---

## 7. Component & File Structure (Frontend)

```
/src
  /pages
    Login.tsx
    Dashboard.tsx
    Clients.tsx
    Account.tsx
  /components
    Layout.tsx
    Header.tsx
    SummonsTable.tsx   (Will implement MUI <DataGrid>)
    ClientForm.tsx     (Will use MUI <TextField>, <Button>)
  /lib
    amplifyClient.ts  (Initializes the Amplify client)
  /contexts
    AuthContext.tsx
  /models             (Auto-generated by Amplify)
  theme.ts            (MUI theme configuration)
  App.tsx
  main.tsx
```

---

## 8. System Flow / Sequence Diagrams

### Daily Sweep Flow:
```
Amazon EventBridge (Daily) → AWS Lambda: daily-sweep → NYC Open Data API (Fetch) → Amplify DataStore (Get Clients) → [Logic: Compare] → Amplify DataStore (INSERT Summons) → (Async) AWS Lambda: data-extractor
```

### Data Extraction Flow:
```
data-extractor → (Parallel) NYC PDF (GET) → (Parallel) NYC Video Page (GET) → [Scrape HTML w/ Cheerio] → [Send PDF to Google Gemini API] → Amplify DataStore (UPDATE Summons)
```

### User Dashboard Load Flow:
```
User Logs In → React App Mounts → Amplify DataStore (List Summonses) → [Data synced from DynamoDB] → React UI Renders Table (MUI DataGrid)
```

---

## 9. Non-Functional Requirements (NFRs)

- **Performance**: Dashboard load (cold) < 5s. Table interactions (sort, filter) < 500ms. OCR/Scrape function (async) < 60s.
- **Security**: All access must be controlled via Amplify auth rules (per Section 4).
- **Reliability**: The system will use AWS serverless infrastructure, which is highly available.
- **UX**: The app must be responsive and usable on a mobile phone (for Arthur).

---

## 10. Environment Configuration

- `VITE_AMPLIFY_CONFIG_...` (public, auto-generated)
- `NYC_OPEN_DATA_APP_TOKEN` (secret, for Lambda function)
- `GEMINI_API_KEY` (secret, for Lambda function)

---

## 11. External APIs & Integrations

### Service 1: NYC Open Data

- **Endpoint**: OATH Hearings Division Case Status
- **Base URL**: `https://data.cityofnewyork.us/resource/jz4z-kudi.json`
- **Auth**: App Token (`NYC_OPEN_DATA_APP_TOKEN`)
- **Key Fields**: `respondent`, `summons_number`, `hearing_date`, `status`, `license_plate`, `violation_date`, `fine_amount`, `amount_due`

### Service 2: NYC OATH Summons PDF

- **Endpoint**: GetViolationImage
- **URL Pattern**: `https://a820-ecbticketfinder.nyc.gov/GetViolationImage?violationNumber={summons_number}`
- **Auth**: None.
- **Use**: To auto-generate a hyperlink and as the source for FR-09 OCR.

### Service 3: NYC Idling Complaints (Videos)

- **Endpoint**: Idling Evidence Video
- **URL Pattern**: `https://nycidling.azurewebsites.net/idlingevidence/video/{summons_number}`
- **Auth**: None.
- **Use**: To auto-generate a hyperlink and as the source for FR-09 web scraping.

### Service 4: AI Model (OCR)

- **Endpoint**: Google Gemini API (e.g., `v1beta/models/gemini-2.5-flash:generateContent`)
- **Auth**: API Key (`GEMINI_API_KEY`)
- **Use**: To extract structured JSON data from PDF buffers (see FR-09).

---

## 12. Error Handling Standards

- All AWS Lambda Functions must use the built-in `console.log` / `console.error` for logging, which will be viewable in Amazon CloudWatch.
- Log critical errors, especially during the `daily-sweep` (e.g., API failure, DB insert failure) and `data-extractor` (e.g., OCR failure, scrape failure).

---

## 13. Logging, Telemetry & Observability

- All logging via Amazon CloudWatch (managed by Amplify).

---

## 14. DevOps Requirements

- **Frontend & Backend**: Deploy to AWS Amplify Hosting.
- **CI/CD**: Connect Amplify Hosting to the GitHub repo for auto-deploys on `main` branch.
- **Cron Job**: The Amazon EventBridge Scheduler must be configured to trigger the `daily-sweep` Lambda.

---

## 15. Acceptance Criteria (Binary Pass/Fail Tests)

- [Pass/Fail] A new user can sign up, log in, and is taken to the dashboard.
- [Pass/Fail] A user can create, edit, and delete a Client.
- [Pass/Fail] The `daily-sweep` function runs and successfully pulls data from the NYC API.
- [Pass/Fail] A summons matching a client's name/AKA appears in the dashboard.
- [Pass/Fail] A summons not matching any client does not appear.
- [Pass/Fail] A user can check the "Evidence Reviewed" box, and the state persists on page reload.
- [Pass/Fail] A user can add text to the "Notes" field, and the text persists on page reload.
- [Pass/Fail] A user can click the "CSV Export" button (in the MUI DataGrid) and a CSV file downloads.
- [Pass/Fail] A user (User A) cannot see any client or summons data created by another user (User B) (as enforced by `@auth(rules: [{ allow: owner }])`).
- [Pass/Fail] The application is viewable and usable on a mobile phone.
- [Pass/Fail] After a new summons is found, the `data-extractor` function is triggered.
- [Pass/Fail] The `video_created_date` column is successfully populated by the scraper.
- [Pass/Fail] At least one OCR field (e.g., `license_plate_ocr`) is successfully populated by the Gemini model.

---

## 16. Deliverables the Coding Agent Must Output

- The complete, runnable React (Vite) + MUI frontend codebase.
- All AWS Amplify backend function code (e.g., `/amplify/functions/daily-sweep`, `/amplify/functions/data-extractor`).
- The `schema.graphql` file (from Section 4) that defines the entire data model.
- A `README.md` with setup and deployment instructions for the Amplify CLI.
- An `.env.example` file (from Section 10).

---

## 17. Constraints / "Do Not Do This"

- **Do NOT** build any file upload system.
- **Do NOT** build any invoicing or billing features.
- **Do NOT** build any automated calendar integration.
- **Do NOT** build any automated email/reminder system.
- **Do NOT** use Supabase or Firebase. The backend must be AWS Amplify.
- **Do NOT** use OpenAI or Claude. The AI must be Google Gemini.
- **Do NOT** write all logic in the frontend. Heavy lifting (like the sweep and extraction) must be in a Lambda Function.
- **Do NOT** forget the `@auth(rules: [{ allow: owner }])` directive on the GraphQL schema. It is the most critical security requirement.
- The web scraper must be lightweight (using `cheerio`) and not a full headless browser.

---

## 18. Critical Coding Rules (For AI Agent)

1. **Robust Error Handling & Logging**: All Lambda function logic (in `daily-sweep` and `data-extractor`) must be wrapped in `try/catch` blocks. All errors must be logged to CloudWatch (using `console.error`). The function must return a structured JSON error response.

2. **Specific State Management**: For frontend state management, use React Context API for global state (like the authenticated user) and `useState` for all local component state. Do NOT use Redux, Zustand, or MobX.

3. **Async-First Performance**: All I/O operations (API calls to NYC Open Data, Google Gemini, or the Amplify DataStore) must use `async/await` and be non-blocking.

4. **Concrete Testing Deliverables**: Deliver unit tests (using Jest/Vitest) for the core business logic within the `daily-sweep` and `data-extractor` Lambda functions. The agent must mock all external API calls.

5. **Strict Input Validation**: All user-facing forms (e.g., the 'Client Management' form) must use MUI's built-in validation (e.g., `required`, `type='email'`).

6. **Practical Commenting**: Add inline code comments (`// comment`) to explain any complex business logic. This is required for the client-matching logic in `daily-sweep` and the HTML scraping selectors in `data-extractor`.

---

## 19. Appendix

### Glossary of Domain Terms:

- **OATH**: Office of Administrative Trials and Hearings (the city agency).
- **Summons**: A ticket or violation.
- **Respondent**: The entity (company) receiving the summons.
- **AKA**: "Also Known As." An alias for a company (e.g., "GC Warehouse" vs "G.C. Whse").
- **Sweep**: The automated process of checking the public API.
