# NYC OATH Summons Tracker - User Manual

**For:** Arthur, Jackie, and Jelly at the Law Office of Arthur L. Miller

**Version:** 1.0 | December 2025

---

## Table of Contents

1. [What This App Does](#1-what-this-app-does)
2. [Getting Started](#2-getting-started)
3. [The Dashboard](#3-the-dashboard)
4. [Managing Your Clients](#4-managing-your-clients)
5. [Working with Summonses](#5-working-with-summonses)
6. [Evidence Tracking](#6-evidence-tracking)
7. [Exporting Data](#7-exporting-data)
8. [Troubleshooting](#8-troubleshooting)
9. [Maintenance & Support](#9-maintenance--support)

---

## 1. What This App Does

### The Problem It Solves

Before this app, you had to:
1. Go to the NYC Open Data website
2. Download a large spreadsheet
3. Search through thousands of rows to find your clients
4. Check for new summonses manually
5. Track hearing dates in a separate calendar
6. Hope you didn't miss anything

### How This App Helps

The NYC OATH Summons Tracker **automatically**:
- Scans the NYC database every day for your clients' summonses
- Finds new idling violations as soon as they're posted
- Extracts important details from summons PDFs (like license plates and violation descriptions)
- Alerts you to upcoming hearings with deadline tracking
- Keeps a complete history of all changes to each case

**You never have to download spreadsheets again.** Just open the app and see everything relevant to your clients, automatically updated daily.

---

## 2. Getting Started

### How to Log In

1. **Open your web browser** (Chrome, Safari, Firefox, or Edge)

2. **Go to the app website:**
   - Your specific URL will be provided after setup
   - Bookmark this page for easy access

3. **Enter your login credentials:**
   - Email: (provided by Rajiv)
   - Password: (provided by Rajiv)

4. **First-time login:** You'll be asked to set a new password
   - Choose something secure (at least 8 characters)
   - Include a mix of letters and numbers

5. **You're in!** You'll see the Dashboard

### What You'll See First

After logging in, you'll land on the **Dashboard** - a calendar-based view showing all upcoming hearings for your clients.

---

## 3. The Dashboard

The Dashboard is your "home base." It shows you what needs attention right now.

### The Calendar View (Main Dashboard)

The main dashboard shows a **calendar** with all upcoming hearings:

- **Red dates** = Hearings with critical deadlines (within 7 business days)
- **Orange dates** = Approaching deadlines (8-21 business days)
- **Click any date** to see the summonses scheduled for that day

### Quick Filter Cards

At the top of the legacy dashboard, you'll see colored cards:

| Card | What It Shows |
|------|---------------|
| **Critical Deadlines** (Red) | Hearings within 7 business days |
| **Approaching Deadlines** (Orange) | Hearings in 8-21 business days |
| **Hearing Complete** (Green) | Cases marked as completed |
| **Evidence Pending** (Blue) | Cases where you've requested evidence but haven't received it |

**Click any card** to filter the table below to show only those cases.

### Activity Badges

Summonses can have badges showing recent activity:

- **NEW** (Blue badge) - A new summons was discovered in the last 72 hours
- **UPDATED** (Orange badge) - The NYC database changed something about this case in the last 72 hours (like a rescheduled hearing date or updated balance)

Use the toggle buttons at the top to filter by these badges.

### The Audit Trail

Click the **Audit Trail** button to see a complete history of all changes detected by the daily scan. This is useful for:
- Understanding why a case shows "UPDATED"
- Seeing when hearing dates were rescheduled
- Tracking payment activity

---

## 4. Managing Your Clients

### Adding a New Client

1. Click **"Manage Clients"** in the top navigation
2. Click the **"Add Client"** button
3. Fill in the client information:
   - **Client Name** (required) - The company name as it appears on summonses
   - **AKAs** - Other names the company might appear as (e.g., "ABC Corp" might also appear as "A.B.C. Corporation")
   - **Contact Information** - Phone, email, address

4. Click **"Save"**

### Why AKAs Matter

The NYC database doesn't always spell company names the same way. Adding AKAs (Also Known As) helps the system find all summonses for a client, even if the name varies.

**Example:**
- Client Name: "GC Warehouse LLC"
- AKAs: "G.C. Warehouse", "GC Whse", "G C Warehouse"

### Editing a Client

1. Go to **"Manage Clients"**
2. Find the client in the list
3. Click the **Edit** icon (pencil)
4. Make your changes
5. Click **"Save"**

### Viewing a Client's Cases

1. Go to **"Clients"** in the navigation (not "Manage Clients")
2. Click on a client name
3. You'll see all summonses associated with that client

---

## 5. Working with Summonses

### The Summons Table

The main table shows all summonses with these columns:

| Column | What It Means |
|--------|---------------|
| **Summons #** | The official NYC summons number |
| **Client** | Which of your clients received this summons |
| **Hearing Date** | When the hearing is scheduled |
| **Status** | Current case status (Pending, Default, Guilty, etc.) |
| **Amount Due** | How much is owed |
| **Violation** | Type of violation (usually "IDLING") |

### Viewing Summons Details

Click on any row to see full details, including:
- The complete violation narrative (extracted from the PDF)
- Vehicle information (license plate, vehicle type)
- Links to the original PDF and video evidence
- Your notes and evidence tracking checkboxes

### The PDF and Video Links

Each summons has two important links:

1. **View PDF** - Opens the original summons document from NYC
2. **View Video** - Opens the video evidence page (if available)

These open in new browser tabs so you don't lose your place.

---

## 6. Evidence Tracking

### The Evidence Checkboxes

Each summons has checkboxes to track evidence status:

| Checkbox | What It Means |
|----------|---------------|
| **Evidence Reviewed** | You've watched the video evidence |
| **Evidence Requested** | You've submitted a FOIL request for additional evidence |
| **Evidence Received** | You've received the requested evidence |
| **Added to Calendar** | You've added this hearing to your calendar system |

**These save automatically** when you check/uncheck them.

### Evidence Request Date

When you check "Evidence Requested," a date field appears. This records when you made the request, which is useful for follow-up.

### Adding Notes

Click on a summons to open the detail view, then use the **Notes** section to add comments. Notes are visible to all users on the account.

---

## 7. Exporting Data

### Exporting to Excel/CSV

1. On the Dashboard or legacy dashboard, find the export button (usually in the top right of the table)
2. Click **"Export"**
3. Choose your format (CSV works with Excel)
4. The file will download to your computer

### What Gets Exported

The export includes all visible columns plus additional data like:
- Full violation narrative
- All contact information
- Evidence tracking status
- Notes

---

## 8. Troubleshooting

### Problem: "I can't log in"

**Possible causes and solutions:**

1. **Wrong password**
   - Try resetting your password
   - Contact Rajiv if you're completely locked out

2. **Account not set up yet**
   - Make sure Rajiv has created your user account

3. **Browser cache issue**
   - Try opening the site in a "Private" or "Incognito" window
   - Or clear your browser's cache

### Problem: "The data seems old"

**What to check:**

1. **Look at the Sync Status** in the header
   - It should show when the last successful scan occurred
   - If it's been more than 24 hours, there may be an issue

2. **The NYC database might not have updated yet**
   - The NYC Open Data portal updates on their schedule
   - Sometimes there's a delay of 1-2 days

3. **Report the issue** (see below)

### Problem: "A summons PDF won't open"

**Possible causes:**

1. **NYC's website is temporarily down**
   - Try again in a few minutes

2. **The summons number might be incorrect**
   - This is rare but can happen
   

### Problem: "The scan failed" or "OCR failed"

**What this means:**

- The system couldn't read a particular PDF
- This happens occasionally with poorly scanned documents
- The system will retry automatically the next day (up to 3 times)

**What to do:**

- Wait for the automatic retry
- If it keeps failing, you can still click the PDF link to view it manually

### Reporting an Issue

**Before contacting Rajiv, write down:**

1. **Exact date and time** the problem occurred
2. **What you were trying to do** when it happened
3. **Any error message** you saw (take a screenshot if possible)
4. **The summons number** (if it involves a specific case)

This information helps diagnose and fix the issue faster.

---

## 9. Maintenance & Support

### Daily Automatic Updates

The system runs a scan every day (usually overnight) that:
- Checks for new summonses for all your clients
- Updates hearing dates and case statuses
- Scans new PDFs to extract information

**You don't need to do anything** - this happens automatically.

### What's Included (No Charge)

- Daily automated scanning
- Data storage
- Bug fixes for existing features
- Security updates

### Paid Hourly Support

The following services are billed at an hourly rate:

- Adding new features
- Custom report development
- Training sessions beyond initial setup
- Troubleshooting issues caused by user error
- Integration with other systems

**To request paid support:** Email or call Rajiv with a description of what you need. He'll provide a time estimate before starting work.

### Backup Information

Your data is automatically backed up by AWS. However, you can also:

1. **Export to CSV** regularly (see Section 7)
2. **Download the code** from GitHub (for archival purposes)

The code repository is at: `[GitHub URL will be provided]`

---

## Quick Reference Card

### Daily Workflow

1. **Open the app** and check the Dashboard
2. **Look for RED cards** - Critical deadlines need immediate attention
3. **Check NEW badges** - Review any newly discovered summonses
4. **Check UPDATED badges** - See what changed overnight
5. **Update your checkboxes** as you work through cases

### Keyboard Shortcuts

- **Escape** - Close any open dialog
- **Enter** - Submit a form

### Getting Help

- **App questions:** Refer to this manual
- **Technical issues:** Contact Rajiv (see reporting guidelines above)
- **Account/billing questions:** Contact Rajiv

---

**Thank you for using the NYC OATH Summons Tracker!**

*This manual was created for the Law Office of Arthur L. Miller.*
