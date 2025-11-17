# NYC OATH Summons Tracker

A private, automated web application for the Law Office of Arthur L. Miller to track and manage NYC OATH summonses for idling violations.

## Project Overview

This system replaces the firm's manual process of downloading and filtering public spreadsheets. It automatically finds, tracks, and persists all NYC OATH "IDLING" violation summonses relevant to the firm's clients, providing a centralized dashboard for case management.

**Target MVP Date**: December 18, 2025

## Features

- ✅ User authentication (Amazon Cognito)
- ✅ Client management CRUD with contact information
- ✅ Automated daily data sweep from NYC Open Data API
- ✅ Main dashboard with sortable, filterable data table
- ✅ Evidence tracking system (reviewed, requested, received)
- ✅ Notes field for internal case documentation
- ✅ Manual calendar handoff tracking
- ✅ CSV export functionality
- ✅ Automated OCR using Google Gemini AI
- ✅ Web scraping for video evidence metadata
- ✅ Responsive design for mobile access

## Tech Stack

### Frontend
- **Framework**: React 18+ with Vite
- **UI Library**: Material UI (MUI) v5+
- **Routing**: React Router v6+
- **State Management**: React Context API
- **Data Fetching**: AWS Amplify DataStore

### Backend (AWS Amplify)
- **Authentication**: Amazon Cognito
- **Database**: Amazon DynamoDB
- **API**: AWS AppSync (GraphQL)
- **Functions**: AWS Lambda
- **Scheduling**: Amazon EventBridge
- **Hosting**: AWS Amplify Hosting

### External Services
- NYC Open Data API (OATH Hearings)
- NYC Summons PDF Service
- NYC Idling Video Evidence Portal
- Google Gemini API (OCR)

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
│   │   └── Account.tsx           # User account settings
│   ├── components/
│   │   ├── Layout.tsx            # App shell
│   │   ├── Header.tsx            # Navigation bar
│   │   ├── SummonsTable.tsx      # MUI DataGrid for summons
│   │   ├── ClientForm.tsx        # Client add/edit form
│   │   └── ProtectedRoute.tsx    # Auth route guard
│   ├── lib/
│   │   └── amplifyClient.ts      # Amplify configuration
│   ├── contexts/
│   │   └── AuthContext.tsx       # Authentication state
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

## License

Private - Law Office of Arthur L. Miller

## Contributors

- Arthur L. Miller (Attorney)
- Jackie (Assistant)
- Jelly (Admin)

---

**Last Updated**: November 17, 2025
**Version**: 1.0.0 (MVP)
