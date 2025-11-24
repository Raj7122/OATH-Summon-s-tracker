# NYC OATH Summons Tracker - Dashboard Wireframe & UX Guide

**Version**: 1.1
**Date**: November 24, 2025 (Updated to TRD v1.9 specifications)
**Purpose**: User Experience documentation for the main Dashboard interface

---

## Table of Contents

1. [Overview](#overview)
2. [Dashboard Layout Wireframe](#dashboard-layout-wireframe)
3. [Field-by-Field Breakdown](#field-by-field-breakdown)
4. [Progressive Disclosure Design](#progressive-disclosure-design)
5. [UX Design Principles Applied](#ux-design-principles-applied)
6. [User Workflows](#user-workflows)

---

## Overview

The NYC OATH Summons Tracker Dashboard is the primary interface for managing idling violation summonses. It follows evidence-based UX design principles to minimize cognitive load while maximizing actionability.

### Key Statistics
- **9 visible columns** by default (the "Actionable 7" + 2 essential)
- **30+ total columns** available via column selector
- **Master-Detail pattern** for progressive disclosure
- **Mobile-responsive** with bottom sheet UI for touch devices

---

## Dashboard Layout Wireframe

### Desktop View (Full Layout)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  NYC OATH Summons Tracker - Dashboard                      [Refresh] [User] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  DASHBOARD SUMMARY CARDS (Top Row - 4 Cards)                        │   │
│  ├─────────────┬─────────────┬─────────────┬─────────────────────────┤   │
│  │  CRITICAL   │  APPROACHING│  EVIDENCE   │  HEARING COMPLETE       │   │
│  │  (Red)      │  (Yellow)   │  PENDING    │  (Green)                │   │
│  │             │             │  (Blue)     │                         │   │
│  │  [Count]    │  [Count]    │  [Count]    │  [Count]                │   │
│  │  ≤7 bus.days│  8-21 b.day │  Requested  │  Done                   │   │
│  └─────────────┴─────────────┴─────────────┴─────────────────────────┘   │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  SUMMONS DATA GRID                                                  │   │
│  ├──┬────────────────┬──────────┬─────────────┬───────────┬──────────┤   │
│  │▼ │ Client         │ Summons# │ Hearing Date│ Status    │ Amt Due  │   │
│  ├──┼────────────────┼──────────┼─────────────┼───────────┼──────────┤   │
│  │▶ │ GC WAREHOUSE   │ 00097... │ May 6, 2026 │ NEW [NEW] │ $600.00  │   │
│  ├──┼────────────────┼──────────┼─────────────┼───────────┼──────────┤   │
│  │  │ [more rows]                                                      │   │
│  └──┴───────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  EXPANDED ROW DETAILS (when arrow clicked)                          │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  Violation Info        │  Vehicle Info      │  Financial Info      │   │
│  │  ───────────────────  │  ────────────────  │  ──────────────────  │   │
│  │  Date: Dec 18, 2024   │  License: 14685MM  │  Base Fine: $600.00  │   │
│  │  Location: 38 E 18th  │  Type: TRUCK       │  Amount Due: $600.00 │   │
│  │  Duration: 3+ min     │  ID: 2024-121183   │                      │   │
│  │                                                                      │   │
│  │  Documents                                                           │   │
│  │  ──────────                                                          │   │
│  │  [View Summons PDF]  [View Video Evidence]                          │   │
│  │  Video Created: N/A                                                  │   │
│  │                                                                      │   │
│  │  Violation Narrative (OCR)                                           │   │
│  │  ─────────────────────────                                           │   │
│  │  "Respondent caused or permitted the idling of a motor vehicle..."  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Mobile View

```
┌───────────────────────────┐
│  OATH Tracker    [≡] [@]  │
├───────────────────────────┤
│  ┌───────────────────────┐│
│  │ CRITICAL      [5]     ││
│  ├───────────────────────┤│
│  │ APPROACHING   [12]    ││
│  └───────────────────────┘│
│                            │
│  ┌───────────────────────┐│
│  │ GC WAREHOUSE    [▶]   ││
│  │ 000974656X            ││
│  │ May 6, 2026           ││
│  │ NEW ISSUANCE    $600  ││
│  └───────────────────────┘│
│                            │
│  [Tap row for details]     │
└───────────────────────────┘

When row tapped:
┌───────────────────────────┐
│  ← Back                   │
├───────────────────────────┤
│  GC WAREHOUSE             │
│  Summons: 000974656X      │
│                            │
│  ┌───────────────────────┐│
│  │ Evidence Reviewed     ││
│  │         [○────]       ││  ← Large Switch (44px)
│  ├───────────────────────┤│
│  │ Evidence Requested    ││
│  │         [●────]       ││
│  ├───────────────────────┤│
│  │ Evidence Received     ││
│  │         [○────]       ││
│  └───────────────────────┘│
│                            │
│  [View PDF]  [View Video]  │
└───────────────────────────┘
```

---

## Field-by-Field Breakdown

### Primary Visible Columns (Default View)

#### 1. **Expand/Collapse Button** (`▶` / `▼`)
- **Location**: Far left column
- **Purpose**: Progressive disclosure control
- **UX Rationale**:
  - Allows users to see "just enough" information at a glance
  - Reveals additional details on-demand
  - Follows Miller's Law (7±2 items) - keeps visible info minimal
- **Interaction**: Click to toggle row expansion
- **Width**: 50px
- **Mobile**: Hidden (use tap on entire row instead)

---

#### 2. **Client** (respondent_name)
- **Location**: Second column (leftmost data)
- **Format**: Text (e.g., "GC WAREHOUSE LLC")
- **Purpose**: Identify which client this summons belongs to
- **UX Rationale**:
  - Most important identifier for law office users
  - First column users scan (F-pattern reading)
  - Clickable to open notes dialog (desktop) or drawer (mobile)
- **Interaction**:
  - Click opens notes/comments dialog
  - Hover shows underline (affordance)
- **Width**: 200px
- **Data Source**: `respondent_name` from NYC Open Data API

**Why this field matters:**
> Users need to quickly identify "is this my client?" before caring about any other details. This field answers the primary triage question.

---

#### 3. **Summons #** (summons_number)
- **Location**: Third column
- **Format**: Alphanumeric (e.g., "000974656X")
- **Purpose**: Unique identifier for the violation
- **UX Rationale**:
  - Required for all official communications with NYC OATH
  - Used to look up PDFs and video evidence
  - Needed for filing responses
- **Interaction**: Static text (no interaction)
- **Width**: 130px
- **Data Source**: `summons_number` from NYC API (also called `ticket_number`)

**Why this field matters:**
> The summons number is the "primary key" in NYC's system. Every phone call, email, or legal filing references this number.

---

#### 4. **Hearing Date** (hearing_date)
- **Location**: Fourth column
- **Format**: Human-readable date (e.g., "May 6, 2026")
- **Purpose**: When the client must appear or respond
- **UX Rationale**:
  - **CRITICAL** deadline information
  - Drives urgency (color-coded via status chips)
  - Enables sorting by urgency
- **Format Logic**:
  ```
  Database: "2026-05-06T00:00:00.000Z" (ISO 8601)
  Display:  "May 6, 2026" (human-readable)
  ```
- **Interaction**: Sortable column
- **Width**: 150px
- **Data Source**: `hearing_date` from NYC API, formatted via `date-fns`

**Why this field matters:**
> Missing a hearing date can result in default judgments. This is the most time-sensitive piece of information in the entire system. Business day calculation ensures Arthur doesn't miss Friday deadlines over the weekend.

**Related Dashboard Summary Cards (TRD v1.9 - Business Days):**
- **CRITICAL**: Hearings ≤ 7 business days away (RED)
- **APPROACHING**: Hearings 8-21 business days away (YELLOW/ORANGE)
- **EVIDENCE PENDING**: Requested but not received (BLUE)
- **HEARING COMPLETE**: User-marked as done (GREEN)

---

#### 5. **Status** (status)
- **Location**: Fifth column
- **Format**: Color-coded chip with optional activity badges
- **Purpose**: Current state of the summons in NYC's system + recent activity tracking
- **UX Rationale**:
  - **Visual triage** using color psychology (Don't Make Me Think principle)
  - Instant recognition without reading text
  - Activity badges create urgency (Hooked Model - variable rewards)
  - **72-hour freshness window** (TRD v1.9: covers weekends for Monday login)

**Status Types & Colors:**
```
┌─────────────────┬───────┬──────────────────────────┐
│ Status Text     │ Color │ User Action Needed       │
├─────────────────┼───────┼──────────────────────────┤
│ NEW ISSUANCE    │ RED   │ Urgent - review ASAP     │
│ SCHEDULED       │ BLUE  │ Calendar entry needed    │
│ DECISION ISSUED │ GREEN │ Review outcome           │
│ DISMISSED       │ GREEN │ No action needed         │
│ DEFAULT         │ RED   │ URGENT - missed hearing  │
└─────────────────┴───────┴──────────────────────────┘
```

**Activity Badge Logic (TRD v1.9):**
- **[NEW]** (Blue chip): Summons created in last **72 hours**
  - Logic: `createdAt` equals `updatedAt` (within 1 second)
- **[UPDATED]** (Orange chip): Status/amount/date changed in last **72 hours**
  - Logic: `updatedAt` is newer than `createdAt` by at least 1 second
  - **Hover tooltip**: Shows exact change summary and timestamp
    - Example: "Change Detected: Status: 'SCHEDULED' → 'DEFAULT JUDGMENT' (11/22/2024 3:45 PM)"
  - Data source: `last_change_summary` field from database
- **Removed automatically after 72 hours**
- **Weekend Coverage**: Friday afternoon updates visible on Monday morning

**Interaction**:
- Status chip: Static display (no click)
- UPDATED badge: Hover to see tooltip with change details
- **Width**: 180px
- **Data Source**: `status` from NYC API + `updatedAt`/`createdAt` for badges + `last_change_summary` for tooltip

**Why this field matters:**
> Users can instantly see priority (red = urgent, blue = scheduled, green = done) without reading any text. The 72-hour activity badges ensure Arthur sees Friday's critical changes on Monday morning. The UPDATED tooltip provides transparency ("why is this orange?") without cluttering the UI.

---

#### 6. **Amount Due** (amount_due)
- **Location**: Sixth column
- **Format**: Currency (e.g., "$600.00")
- **Purpose**: Current financial liability
- **UX Rationale**:
  - Clients care about "how much will this cost?"
  - Important for settlement negotiations
  - Drives decision to contest vs. pay
- **Format Logic**:
  ```javascript
  Database: 600 (number) or "600" (string)
  Display:  "$600.00" (formatted currency)
  ```
- **Interaction**: Sortable column
- **Width**: 120px
- **Data Source**: `amount_due` from NYC API (balance_due field)

**Why this field matters:**
> Financial impact is a primary decision factor. Clients immediately ask "how much?" when discussing summonses.

---

#### 7. **Lag (Days)** (lag_days)
- **Location**: Seventh column
- **Format**: Number with conditional color (e.g., "45" in orange/red if >60)
- **Purpose**: Days between violation and video upload
- **UX Rationale**:
  - **Legal defense angle**: NYC law requires video evidence within 10 days of violation
  - Videos uploaded >60 days later may be inadmissible
  - Visual warning (red text) for actionable cases
- **Color Logic**:
  ```
  < 60 days: Black text (normal)
  ≥ 60 days: Red/orange text (potential defense)
  ```
- **Calculation**:
  ```javascript
  lag_days = video_created_date - violation_date (in days)
  ```
- **Interaction**: Sortable column
- **Width**: 110px
- **Data Source**:
  - `violation_date` from NYC API
  - `video_created_date` from web scraping
  - Calculated in Lambda function

**Why this field matters:**
> This is a potential legal defense. If video evidence was uploaded too late (>10 days, definitely >60 days), it may be inadmissible. This field highlights winnable cases.

---

#### 8. **Internal Status** (internal_status)
- **Location**: Eighth column
- **Format**: Dropdown select (editable)
- **Purpose**: Law office's internal workflow tracking
- **UX Rationale**:
  - NYC's status doesn't match law office workflow
  - Needed for internal case management
  - Dropdown for quick updates without opening full edit form

**Internal Status Options:**
```
┌─────────────────┬────────────────────────────────┐
│ Status          │ Meaning                        │
├─────────────────┼────────────────────────────────┤
│ New             │ Just discovered, not reviewed  │
│ Reviewing       │ Lawyer is evaluating case      │
│ Hearing Complete│ Hearing done, awaiting decision│
│ Summons Paid    │ Client paid the fine           │
│ Archived        │ Case closed, no further action │
└─────────────────┴────────────────────────────────┘
```

**Interaction**:
- Click opens dropdown
- Select new status → auto-saves
- **Width**: 170px
- **Data Source**: `internal_status` field (user-managed, not from NYC)

**Why this field matters:**
> NYC's "SCHEDULED" status isn't enough. The law office needs to track: "Have we reviewed this? Did the client pay? Is this case closed?" This field bridges NYC's system and the law office's workflow.

---

#### 9. **Offense Level** (offense_level)
- **Location**: Ninth column
- **Format**: Text (e.g., "First Offense", "Repeat Offense")
- **Purpose**: Indicates if this is a repeat violator
- **UX Rationale**:
  - Repeat offenses have higher fines
  - Affects defense strategy
  - Client needs to know severity
- **Interaction**: Static text
- **Width**: 130px
- **Data Source**: `offense_level` (manual input or OCR-extracted)

**Why this field matters:**
> Fines escalate for repeat offenders. This field helps law office advise clients on potential costs and defense strategy.

---

### Evidence Tracking Columns (Visible on Desktop, Hidden on Mobile)

#### 10. **Reviewed** (evidence_reviewed)
- **Location**: After Offense Level
- **Format**: Checkbox (desktop) / Large switch (mobile)
- **Purpose**: Track if lawyer has reviewed evidence
- **UX Rationale**:
  - Quick checkbox for desktop (small, precise mouse)
  - Large 44px switch for mobile (Fitts's Law - finger-friendly)
  - Persistent (auto-saves on change)
- **Interaction**: Click checkbox → auto-saves
- **Width**: 90px
- **Data Source**: `evidence_reviewed` boolean field

---

#### 11. **Requested** (evidence_requested)
- **Location**: After Reviewed
- **Format**: Checkbox (desktop) / Large switch (mobile)
- **Purpose**: Track if evidence was requested from NYC
- **UX Rationale**: Same as Reviewed
- **Interaction**: Click checkbox → auto-saves
- **Width**: 90px
- **Data Source**: `evidence_requested` boolean field

---

#### 12. **Received** (evidence_received)
- **Location**: After Requested
- **Format**: Checkbox (desktop) / Large switch (mobile)
- **Purpose**: Track if NYC sent the evidence
- **UX Rationale**:
  - Completes the evidence workflow: Review → Request → Receive
  - Enables filtering for "pending evidence" cases
- **Interaction**: Click checkbox → auto-saves
- **Width**: 90px
- **Data Source**: `evidence_received` boolean field

**Why these 3 fields matter:**
> Evidence workflow is critical for case preparation. These checkboxes let lawyers track:
> 1. "Have I looked at the PDF/video?" (Reviewed)
> 2. "Did I ask NYC for better quality files?" (Requested)
> 3. "Did NYC respond with the files?" (Received)

---

#### 13. **Calendar** (added_to_calendar)
- **Location**: After evidence columns
- **Format**: Checkbox
- **Purpose**: Track if hearing date was added to lawyer's calendar
- **UX Rationale**:
  - No automated calendar integration (per TRD constraints)
  - Manual checkbox to prevent double-booking
  - Visual reminder: "Did I put this in my Google Calendar?"
- **Interaction**: Click checkbox → auto-saves
- **Width**: 80px
- **Data Source**: `added_to_calendar` boolean field

**Why this field matters:**
> Missing court dates has severe consequences. This checkbox serves as a "double-check" system: "Yes, I manually added this to my calendar."

---

### Secondary Columns (Hidden by Default - Progressive Disclosure)

These columns are available via the column selector (3-dot menu → Columns) but hidden by default to reduce cognitive load.

#### 14. **License Plate** (license_plate_ocr)
- **Purpose**: Vehicle identification
- **Data Source**: OCR-extracted from summons PDF
- **Why hidden**: Only needed for client confirmation ("is this your truck?")
- **Width**: 120px

---

#### 15. **Violation Date** (violation_date)
- **Purpose**: When the violation actually occurred
- **Format**: "December 18, 2024"
- **Data Source**: NYC API
- **Why hidden**: Less urgent than Hearing Date; available in detail panel
- **Width**: 140px

---

#### 16. **Video Created** (video_created_date)
- **Purpose**: When video evidence was uploaded by citizen
- **Format**: "December 20, 2024" or N/A
- **Data Source**: Web-scraped from NYC video portal
- **Why hidden**: Used to calculate Lag Days; raw date less important
- **Width**: 140px

---

#### 17. **Base Fine** (base_fine)
- **Purpose**: Original fine amount (before fees/interest)
- **Format**: "$600.00"
- **Data Source**: NYC API
- **Why hidden**: Amount Due (with fees) is more relevant; available in detail panel
- **Width**: 100px

---

#### 18. **PDF Link** (summons_pdf_link)
- **Purpose**: Direct link to official summons document
- **Format**: "View PDF" link button
- **Data Source**: Auto-generated URL pattern
- **Why hidden**: Accessible via detail panel; not needed in main table
- **Width**: 80px

---

#### 19. **Video Link** (video_link)
- **Purpose**: Direct link to idling evidence video
- **Format**: "View Video" link button
- **Data Source**: Auto-generated URL pattern
- **Why hidden**: Accessible via detail panel; not needed in main table
- **Width**: 80px

---

#### 20. **ID Number** (dep_id)
- **Purpose**: NYC Department of Environmental Protection ID
- **Data Source**: OCR-extracted from summons
- **Why hidden**: Technical reference number; rarely needed
- **Width**: 120px

---

#### 21. **Vehicle Type** (vehicle_type_ocr)
- **Purpose**: Type of vehicle (TRUCK, VAN, etc.)
- **Data Source**: OCR-extracted from summons
- **Why hidden**: Less critical than license plate; available in detail panel
- **Width**: 120px

---

#### 22. **Prior Offense** (prior_offense_status)
- **Purpose**: Whether this is a repeat offense
- **Data Source**: OCR-extracted from summons
- **Why hidden**: Covered by Offense Level field; additional detail
- **Width**: 120px

---

#### 23. **Idling Duration** (idling_duration_ocr)
- **Purpose**: How long the vehicle was idling (e.g., "longer than three minutes")
- **Data Source**: OCR-extracted from summons
- **Why hidden**: Nice-to-have detail; not actionable
- **Width**: 130px

---

#### 24. **Violation Location** (violation_location)
- **Purpose**: Street address of violation
- **Format**: "38 E 18th St, New York, NY 10003"
- **Data Source**: NYC API
- **Why hidden**: Available in detail panel; long text breaks table layout
- **(Not shown as column, only in detail panel)**

---

#### 25. **Violation Narrative** (violation_narrative)
- **Purpose**: Full text description from summons
- **Format**: Long-form text (100-300 characters)
- **Data Source**: OCR-extracted from summons PDF
- **Why hidden**: Too long for table cell; shown in detail panel only
- **(Not shown as column, only in detail panel)**

---

#### 26. **Last Updated** (updatedAt)
- **Purpose**: Timestamp of last modification
- **Format**: ISO 8601 date
- **Data Source**: Amplify auto-managed timestamp
- **Why hidden**: Used internally for "NEW" badge logic; not user-facing
- **Width**: 150px (if shown)

---

#### 27. **Created At** (createdAt)
- **Purpose**: Timestamp of record creation
- **Format**: ISO 8601 date
- **Data Source**: Amplify auto-managed timestamp
- **Why hidden**: Rarely needed; administrative data
- **Width**: 150px (if shown)

---

### User-Input Fields (Not Columns, Accessed via Dialogs)

#### 28. **Notes** (notes)
- **Location**: Opens in dialog when user clicks Client name
- **Purpose**: Lawyer's private notes about the case
- **Format**: Multiline text area (unlimited length)
- **UX Rationale**:
  - Too long for table cell
  - Needs full-screen focus area
  - Auto-saves 1 second after typing stops (debounced)
- **Interaction**:
  - Desktop: Click client name → modal dialog opens
  - Mobile: Tap row → bottom sheet slides up
- **Data Source**: `notes` field (user-entered)

**Why this field matters:**
> Lawyers need to document: "Client says truck was off", "Need to request dashcam footage", "Settlement offer: $300". This is their case workbench.

---

#### 29. **Evidence Requested Date** (evidence_requested_date)
- **Location**: Date picker in evidence tracking section
- **Purpose**: Track when evidence was requested from NYC
- **Format**: Date (e.g., "November 20, 2024")
- **UX Rationale**:
  - Follow-up timeline: If requested >2 weeks ago and not received, escalate
- **Interaction**: Click calendar icon → date picker opens
- **Data Source**: `evidence_requested_date` timestamp

---

## Progressive Disclosure Design

### Why 9 Visible Columns (Not 30)?

**Miller's Law**: Humans can hold 7±2 items in working memory. By showing only 9 essential columns, we:
1. Reduce cognitive load
2. Faster scanning
3. Less horizontal scrolling
4. Better mobile experience

### 3-Tier Information Architecture

```
TIER 1: Always Visible (9 columns)
├─ Client, Summons#, Hearing Date, Status, Amount Due
├─ Lag Days, Internal Status, Offense Level
└─ Evidence Tracking Checkboxes

TIER 2: On-Demand (Detail Panel)
├─ Click ▶ arrow to expand row
├─ Shows: Violation info, Vehicle info, Financial details
├─ Documents: PDF/Video links
└─ OCR Narrative (full text)

TIER 3: Advanced (Column Selector)
├─ Click 3-dot menu → Columns
├─ Choose from 30+ total columns
├─ License Plate, Violation Date, Video Created, etc.
└─ Expert users customize their view
```

### Interaction Flow

```
1. User opens Dashboard
   ↓
2. Scans summary cards (Critical, Approaching, etc.)
   ↓
3. Identifies urgent summons (RED status chips)
   ↓
4. Clicks ▶ to expand row
   ↓
5. Reviews violation details, clicks "View PDF"
   ↓
6. Clicks Client name to add notes
   ↓
7. Checks "Reviewed" checkbox
   ↓
8. Updates Internal Status to "Reviewing"
```

---

## UX Design Principles Applied

### 1. **Don't Make Me Think** (Steve Krug)

**Application**: Color-coded status chips
- ❌ **Before**: User reads "NEW ISSUANCE" and decides if urgent
- ✅ **After**: User sees RED chip and instantly knows "urgent"

**Application**: Hearing date formatting
- ❌ **Before**: "2026-05-06T00:00:00.000Z" (requires parsing)
- ✅ **After**: "May 6, 2026" (instant comprehension)

---

### 2. **Miller's Law** (7±2 items)

**Application**: 9 visible columns (not 30)
- Keeps working memory load manageable
- Users can scan entire row without losing context

**Application**: Dashboard summary cards (4 cards)
- Critical, Approaching, Complete, Evidence Pending
- 4 < 7, so users can hold all categories in memory

---

### 3. **Fitts's Law** (Target size & distance)

**Application**: Mobile switches (44px touch targets)
- Desktop checkboxes: 16px (fine for mouse precision)
- Mobile switches: 44px (thumb-friendly)

**Application**: Click entire client name (200px wide)
- Not just a tiny icon
- Large clickable area reduces misclicks

---

### 4. **Hooked Model** (Nir Eyal - Variable Rewards)

**Application**: Activity badges (NEW and UPDATED)
- Appears on summonses created/updated in last **72 hours** (TRD v1.9)
- Creates anticipation: "What changed?"
- Variable reward: Sometimes badge appears, sometimes not
- **Weekend coverage**: Friday updates visible on Monday morning

**Application**: Auto-save feedback
- Snackbar notification: "✓ Saved" appears after checkbox toggle
- Immediate feedback creates satisfaction loop

---

### 5. **Progressive Enhancement**

**Application**: Mobile-first design
- Mobile: Touch-optimized, minimal columns
- Tablet: Medium complexity
- Desktop: Full feature set with hover states

**Application**: Master-Detail pattern
- Basic: See essential info in collapsed row
- Enhanced: Expand row to see more details
- Advanced: Open column selector for custom view

---

## User Workflows

### Workflow 1: Daily Triage

**Goal**: Identify urgent summonses requiring immediate action

```
1. Open Dashboard
2. Look at CRITICAL summary card (red) → See "5 hearings ≤ 7 business days"
   - Notice UPDATED badges (orange chips) showing Friday's status changes
3. Click CRITICAL card → Table filters to show only critical items
4. Scan RED status chips in Status column
   - Hover over UPDATED badges to see change details in tooltip
5. Click ▶ on first critical summons
6. Review hearing date and violation details (expanded row)
7. Note Agency ID Number visible by default (TRD v1.9)
8. Click "View PDF" to see actual summons
9. Make decision: Contest or advise client to pay
10. Add notes: "Called client - will contest based on lag days"
11. Check "Reviewed" checkbox
12. Update Internal Status to "Reviewing"
13. Move to next critical summons
```

**Time**: ~2 minutes per summons

**Business Days Logic**: The Critical card uses business day calculation (excludes weekends), ensuring Arthur doesn't miss Friday deadlines over the weekend.

---

### Workflow 2: Evidence Request Workflow

**Goal**: Request evidence from NYC for a specific summons

```
1. Find summons in table (search or filter)
2. Click ▶ to expand row
3. Click "View Video" to watch idling evidence
4. Notice video quality is poor / need better copy
5. Check "Evidence Requested" checkbox
6. Open evidence requested date picker
7. Select today's date
8. System auto-saves
9. (2 weeks later) Check if "Evidence Received" checkbox is checked
10. If not received after 2 weeks, follow up with NYC
```

**Time**: ~1 minute to request, ~30 seconds to track

---

### Workflow 3: Prepare for Hearing

**Goal**: Gather all case materials before court appearance

```
1. Filter table by Hearing Date (sort ascending)
2. Identify summonses with hearings next week
3. For each summons:
   a. Click ▶ to expand
   b. Click "View PDF" → Download to case folder
   c. Click "View Video" → Download video file
   d. Check Lag Days column → Note if >60 days (defense angle)
   e. Read Violation Narrative (OCR) for exact claims
   f. Click Client name → Review notes for client conversations
   g. Check "Evidence Reviewed" checkbox
   h. Update Internal Status to "Hearing Complete" (after hearing)
4. For hearings this week:
   - Check "Calendar" checkbox to confirm in lawyer's calendar
   - Print PDF summons for court binder
```

**Time**: ~5-10 minutes per summons

---

### Workflow 4: Client Consultation

**Goal**: Review summons with client over phone/in-person

```
1. Client calls: "I got a ticket for idling, number 000974656X"
2. Search table for summons number
3. Click ▶ to expand row
4. Tell client:
   - Hearing Date: "Your hearing is May 6, 2026"
   - Amount Due: "The fine is $600"
   - Offense Level: "This shows as a repeat offense"
   - Violation Details: "Says your truck idled for 3+ minutes"
5. Click "View Video" while on phone with client
6. Discuss: "I can see video evidence from citizen complaint"
7. Check Lag Days: "Video was uploaded 45 days late - possible defense"
8. Advise client on options:
   - Pay fine ($600)
   - Contest based on late video evidence
9. Click Client name → Add notes:
   "Client says driver was making delivery, engine off. Contest on lag days."
10. Update Internal Status: "Reviewing"
11. Check "Calendar" when hearing date added to Google Calendar
```

**Time**: ~5 minutes during call

---

### Workflow 5: CSV Export for Reporting

**Goal**: Generate monthly report of all summonses

```
1. Open Dashboard
2. (Optional) Apply date range filter: "November 2024"
3. Click toolbar → "Export" button (MUI DataGrid built-in)
4. Save CSV file: "oath-summonses-november-2024.csv"
5. Open in Excel/Google Sheets
6. Create pivot table:
   - Sum of Amount Due by Client
   - Count of summonses by Internal Status
   - List of hearings scheduled for next month
7. Send report to law office partners
```

**Time**: ~2 minutes to export, ~10 minutes to analyze in Excel

---

## Mobile-Specific Considerations

### Responsive Breakpoints

```
Mobile:  < 768px  → Bottom sheet UI, minimal columns
Tablet:  768-1024px → Medium layout, some hidden columns
Desktop: > 1024px → Full layout, all features
```

### Mobile UI Changes

1. **Summary Cards**: Stack vertically (not horizontal)
2. **Table Columns**: Show only Client, Summons#, Hearing Date, Status
3. **Expand Arrow**: Hidden (tap entire row instead)
4. **Evidence Checkboxes**: Hidden in table, shown in bottom sheet as large switches
5. **Notes Dialog**: Full-screen bottom sheet instead of centered modal
6. **Date Picker**: Native iOS/Android date picker

### Mobile Interaction Pattern

```
Tap Row
   ↓
Bottom Sheet Slides Up (80% height)
   ├─ Client Name (header)
   ├─ Summons # and Hearing Date
   ├─ Large switches (44px) for checkboxes
   ├─ [View PDF] [View Video] buttons
   └─ [Add Notes] button
```

---

## Accessibility Features

### Keyboard Navigation
- **Tab**: Move between interactive elements
- **Enter/Space**: Activate buttons and checkboxes
- **Arrow Keys**: Navigate table rows
- **Escape**: Close dialogs

### Screen Reader Support
- Proper ARIA labels on all interactive elements
- Status chips announce color ("Red: NEW ISSUANCE")
- Table headers properly associated with cells
- Loading states announced

### Color Blindness
- Status chips use patterns + colors:
  - Red = Bold text
  - Blue = Medium text
  - Green = Light text
- Not relying solely on color for critical info

---

## Summary Statistics

**Dashboard Metrics:**
- **9** visible columns (default)
- **30+** total columns (via selector)
- **4** summary cards (top row)
- **3** evidence tracking checkboxes
- **1** notes field (full-screen dialog)
- **44px** mobile touch targets (Fitts's Law)
- **7±2** items per row (Miller's Law)
- **72 hours** activity badge duration (TRD v1.9 - weekend coverage)
- **1 second** auto-save debounce delay
- **< 500ms** table sort/filter response time
- **Business days** for deadline calculations (excludes weekends)

**User Efficiency Gains:**
- **Before**: Manual spreadsheet → 5-10 minutes to find a summons
- **After**: Dashboard → 5-10 seconds to find a summons
- **ROI**: ~95% time savings for daily triage

---

## Future Enhancements (Not Yet Implemented)

1. **Bulk Actions**: Select multiple rows → Update Internal Status for all
2. **Advanced Filters**: "Show me repeat offenders with hearings next month"
3. **Saved Views**: "My Critical Cases", "Evidence Pending", etc.
4. **Email Notifications**: Alert when critical summons detected
5. **Dashboard Widgets**: Drag-and-drop summary cards
6. **Client Portal**: Read-only view for clients to track their cases

---

**Last Updated**: November 24, 2025
**Version**: 1.0
**Maintained By**: Claude Code
**Questions?** Reference TRD.md for technical specifications
