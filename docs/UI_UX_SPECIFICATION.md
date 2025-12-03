# NYC OATH Summons Tracker - UI/UX Specification

**Version**: 2.0
**Date**: December 2, 2025
**Application**: NYC OATH Summons Tracker for Law Office of Arthur L. Miller
**Design Philosophy**: Calendar-Centric Legal Interface with Progressive Disclosure

---

## Table of Contents

1. [Design Overview](#1-design-overview)
2. [Application Shell](#2-application-shell)
3. [Dashboard Page](#3-dashboard-page)
4. [Summons Detail Modal](#4-summons-detail-modal)
5. [Clients Page](#5-clients-page)
6. [Color System](#6-color-system)
7. [Component Inventory](#7-component-inventory)
8. [Data Filters](#8-data-filters)
9. [Export System](#9-export-system)
10. [Mobile Responsiveness](#10-mobile-responsiveness)
11. [UX Principles Applied](#11-ux-principles-applied)
12. [User Workflows](#12-user-workflows)

---

## 1. Design Overview

### 1.1 Core Philosophy

The NYC OATH Summons Tracker uses a **Calendar-Centric Layout** designed for instant deadline visibility. Key design decisions:

| Principle | Implementation |
|-----------|----------------|
| **No Horizontal Scroll** | 5-column DataGrid + Detail Modal |
| **Calendar First** | Heatmap calendar is the primary navigation |
| **Progressive Disclosure** | Click rows to expand details in modal |
| **Traffic Light Status** | Visual sync health indicator |
| **Active Era Default** | 2022+ records only (archive toggle available) |

### 1.2 Target Users

| User | Role | Primary Needs |
|------|------|---------------|
| **Arthur** | Attorney | Fast triage, deadline tracking, hearing prep |
| **Jackie** | Office Manager | Evidence requests, calendar coordination |
| **Jelly** | Legal Assistant | Video review, status updates |

### 1.3 Information Hierarchy

```
LEVEL 1: At-a-Glance (Always Visible)
├── Sync Status Badge (Header)
├── Quick Stats Chips (Critical, New, Updated)
├── Heatmap Calendar
└── 5-Column DataGrid

LEVEL 2: On-Demand (Click to Reveal)
├── Summons Detail Modal (full record)
├── Audit Trail Drawer (all changes)
└── Export Modal (column selection)

LEVEL 3: Deep Dive (Per-Record)
├── Activity Timeline
├── Evidence Checkboxes
└── Notes Section
```

---

## 2. Application Shell

### 2.1 Header Component

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  NYC OATH Tracker    [Dashboard] [Clients]    [Synced: 2h ago] 🟢  [👤]    │
└─────────────────────────────────────────────────────────────────────────────┘
                                                        ↑
                                               Sync Status Badge
```

**Header Elements:**

| Element | Description | Interaction |
|---------|-------------|-------------|
| Logo/Title | "NYC OATH Tracker" | Click → Navigate to Dashboard |
| Dashboard Nav | Primary navigation link | Click → /dashboard |
| Clients Nav | Client management link | Click → /clients |
| **Sync Status Badge** | Traffic light indicator | Click → Popover with details |
| Account Menu | User dropdown | Click → Account settings, Sign out |

### 2.2 Sync Status Badge (NEW)

**Traffic Light Logic:**

| Color | State | Time Since Sync | Label |
|-------|-------|-----------------|-------|
| 🟢 Green | Fresh | < 24 hours | "Synced: Xh ago" |
| 🟡 Yellow | Stale | 24-48 hours | "Data Stale: Xd ago" |
| 🔴 Red | Failed | > 48 hours | "Sync Failed: Xd ago" |
| 🔵 Blue | Syncing | In progress | "Syncing..." (with spinner) |

**Wireframe - Sync Badge Popover:**

```
┌─────────────────────────────────────────┐
│ Sync Status Details                      │
├─────────────────────────────────────────┤
│                                          │
│ Last Full Sweep                          │
│ Dec 2, 2025, 6:00 AM                     │
│                                          │
│ Records Processed                        │
│ 245 total (3 new) (2 updated)            │
│                                          │
│ Metadata Sweep     [success ✓] 2h ago    │
│ OCR Processing     [partial ⚠] 5 pending │
│ NYC OATH API       [Reachable ✓]         │
│                                          │
└─────────────────────────────────────────┘
```

---

## 3. Dashboard Page

### 3.1 Overall Layout (Split View)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Dashboard                    [3 Critical] [5 New] [2 Updated]               │
│                                                                              │
│                              [Show Pre-2022] [Audit Trail] [Refresh]        │
├──────────────────────────────┬──────────────────────────────────────────────┤
│                              │                                               │
│  CALENDAR COMMAND CENTER     │  SUMMONS DATA GRID                           │
│  (35%)                       │  (65%)                                        │
│                              │                                               │
│  ┌──────────────────────┐    │  ┌────────────────────────────────────────┐  │
│  │   December 2025      │    │  │ Filtered: Dec 15, 2025 [Show All]     │  │
│  │                      │    │  ├──────┬────────┬────────┬──────┬──────┤  │
│  │  Su Mo Tu We Th Fr Sa│    │  │Client│Hearing │Status  │Amount│Action│  │
│  │                    1 │    │  ├──────┼────────┼────────┼──────┼──────┤  │
│  │   2  3  4  5  6  7  8│    │  │GC    │Dec 15  │SCHED   │$350  │ [▶]  │  │
│  │   9 10 11 12 13 14 🔴│    │  │Whse  │        │🔵      │      │      │  │
│  │  16 17 18 19 20 21 22│    │  ├──────┼────────┼────────┼──────┼──────┤  │
│  │  23 24 25 26 27 28 29│    │  │Excel │Dec 15  │DEFAULT │$500  │ [▶]  │  │
│  │  30 31               │    │  │Cour. │        │🔴      │      │      │  │
│  └──────────────────────┘    │  └────────────────────────────────────────┘  │
│                              │                                               │
│  Stats:                      │  Showing 2 of 245 summonses                   │
│  • 3 hearings on Dec 15      │                                               │
│  • 45 total this month       │                                               │
│                              │                                               │
└──────────────────────────────┴──────────────────────────────────────────────┘
```

### 3.2 Dashboard Header Elements

**Quick Stats Chips (Clickable Filters):**

```
[3 Critical]   ← Red chip, click to filter hearings ≤7 days
[5 New]        ← Blue chip, click to filter NEW records (72h)
[2 Updated]    ← Orange chip, click to filter UPDATED records (72h)
```

**Action Buttons:**

| Button | Description |
|--------|-------------|
| Show Pre-2022 Toggle | Shows archived records (default OFF) |
| Audit Trail | Opens drawer with all activity history |
| Refresh | Reloads data from API |

### 3.3 Calendar Command Center (Left Column)

**Heatmap Calendar:**

| Visual | Meaning |
|--------|---------|
| 🔴 Red dot | Multiple hearings on date |
| 🟠 Orange dot | 2-3 hearings on date |
| 🟢 Green dot | 1 hearing on date |
| No dot | No hearings |
| Highlighted | Selected date |

**Stats Panel (Below Calendar):**

```
┌─────────────────────────────────────────┐
│ December 2025 Summary                    │
│ • 45 hearings this month                 │
│ • 12 critical (≤7 days)                  │
│ • $15,750 total at stake                 │
└─────────────────────────────────────────┘
```

### 3.4 Summons DataGrid (Right Column)

**Visible Columns (5 - No Horizontal Scroll):**

| # | Column | Width | Description |
|---|--------|-------|-------------|
| 1 | Client | 150px | Respondent name |
| 2 | Hearing Date | 120px | Formatted date |
| 3 | Status | 130px | Color-coded chip |
| 4 | Amount Due | 100px | Currency formatted |
| 5 | Actions | 80px | Click to open modal |

**Status Chip Colors:**

| Status | Color | Visual |
|--------|-------|--------|
| SCHEDULED | Blue | 🔵 |
| NEW ISSUANCE | Red | 🔴 |
| DEFAULT JUDGMENT | Red | 🔴 |
| DISMISSED | Green | 🟢 |
| RESCHEDULED | Orange | 🟠 |

**Activity Badges (72-hour Window):**

| Badge | When | Visual |
|-------|------|--------|
| [NEW] | Record created in last 72h | Blue chip |
| [UPDATED] | Record changed in last 72h | Orange chip |

### 3.5 Audit Trail Drawer (NEW)

**Wireframe:**

```
                                        ┌─────────────────────────────────────┐
                                        │ ← Audit Trail                   [X] │
                                        ├─────────────────────────────────────┤
                                        │ Complete history of all changes     │
                                        │ detected by the daily sweep.        │
                                        ├─────────────────────────────────────┤
                                        │                                     │
                                        │ ┌─────────────────────────────────┐ │
                                        │ │ 🔄 GC WAREHOUSE         Dec 2   │ │
                                        │ │    #000974656X                  │ │
                                        │ │    Status changed               │ │
                                        │ │    SCHEDULED → DEFAULT          │ │
                                        │ └─────────────────────────────────┘ │
                                        │                                     │
                                        │ ┌─────────────────────────────────┐ │
                                        │ │ 💰 EXCEL COURIER        Dec 1   │ │
                                        │ │    #000974789A                  │ │
                                        │ │    Amount increased             │ │
                                        │ │    $350 → $425                  │ │
                                        │ └─────────────────────────────────┘ │
                                        │                                     │
                                        │ [Load More...]                      │
                                        └─────────────────────────────────────┘
```

---

## 4. Summons Detail Modal

### 4.1 Modal Layout

The detail modal uses a **two-column responsive layout** that collapses to single column on mobile.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Summons #000974656X                                  [SCHEDULED 🔵]    [X]  │
│ GC WAREHOUSE LLC                                     [NEW]                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─── LEFT COLUMN ────────────────┐  ┌─── RIGHT COLUMN ───────────────┐    │
│  │                                │  │                                │    │
│  │  📅 HEARING INFORMATION        │  │  🚗 VEHICLE DATA              │    │
│  │  ─────────────────────────     │  │  ─────────────────────────     │    │
│  │  Hearing Date    May 6, 2026   │  │  License Plate    14685MM      │    │
│  │  Hearing Time    9:30 AM       │  │  Vehicle Type     TRUCK        │    │
│  │  Hearing Result  Pending       │  │  ID Number        2024-121183  │    │
│  │  Status          SCHEDULED     │  │  Name on Summons  GC WAREHOUSE │    │
│  │  Lag Days        45            │  │                                │    │
│  │                                │  │                                │    │
│  │  ⚖️ VIOLATION SPECIFICATIONS   │  │  💰 FINANCIAL INFORMATION     │    │
│  │  ─────────────────────────     │  │  ─────────────────────────     │    │
│  │  Violation Type  IDLING        │  │  Base Fine        $350.00      │    │
│  │  Violation Date  Dec 18, 2024  │  │  Amount Due       $350.00      │    │
│  │  Offense Level   First Offense │  │  Paid Amount      $0.00        │    │
│  │                                │  │                                │    │
│  │  📍 LOCATION                   │  │  ✅ EVIDENCE TRACKING         │    │
│  │  ─────────────────────────     │  │  ─────────────────────────     │    │
│  │  38 E 18th Street              │  │  ☐ Evidence Reviewed          │    │
│  │  New York, NY 10003            │  │  ☑ Added to Calendar          │    │
│  │                                │  │  ☑ Evidence Requested         │    │
│  │                                │  │    📅 Request Date: Nov 20    │    │
│  │  📝 VIOLATION NARRATIVE        │  │  ☐ Evidence Received          │    │
│  │  ─────────────────────────     │  │                                │    │
│  │  "Respondent caused or         │  │  Documents:                    │    │
│  │   permitted the idling of a    │  │  [📄 Summons PDF]              │    │
│  │   motor vehicle for longer     │  │  [🎥 Find Video Evidence] ←NEW│    │
│  │   than three minutes..."       │  │                                │    │
│  │                                │  │  📋 INTERNAL NOTES            │    │
│  └────────────────────────────────┘  │  ─────────────────────────     │    │
│                                       │  Status: [Reviewing ▼]        │    │
│                                       │  ┌─────────────────────────┐  │    │
│                                       │  │ Client called, will     │  │    │
│                                       │  │ contest. Check lag...   │  │    │
│                                       │  │            [✓ Saved]    │  │    │
│                                       │  └─────────────────────────┘  │    │
│                                       │                                │    │
│                                       │  📜 CASE HISTORY              │    │
│                                       │  ─────────────────────────     │    │
│                                       │  ● Dec 2 - Status: SCHEDULED  │    │
│                                       │  ● Nov 15 - Created           │    │
│                                       └────────────────────────────────┘    │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Last Updated: Dec 2, 2025 3:45 PM                              [Close]      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Smart Find Video Button (NEW)

When `video_link` is null (video not yet scraped), the modal shows a **Smart Find Video** button:

**Behavior:**
1. Copies `summons_number` to clipboard
2. Shows toast: "Summons # copied! Paste into portal."
3. Opens NYC Idling Portal in new tab

**Why:** NYC portal doesn't support deep linking. User can Cmd+V to search.

```
┌─────────────────────────────────────┐
│ Documents:                           │
│ [📄 Summons PDF]                     │
│ [📋 Find Video Evidence 🔗]  ← NEW   │
│                                      │
│ ┌─────────────────────────────────┐ │
│ │ Summons # copied!               │ │
│ │ Paste into portal.              │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 4.3 Activity Timeline

The Case History section shows a visual timeline of all changes:

| Icon | Type | Color | Example |
|------|------|-------|---------|
| ➕ | CREATED | Blue | "Record created" |
| 🔄 | STATUS_CHANGE | Orange | "SCHEDULED → DEFAULT" |
| 📅 | RESCHEDULE | Orange | "Hearing rescheduled" |
| ⚖️ | RESULT_CHANGE | Purple | "Dismissed" |
| 💰 | AMOUNT_CHANGE | Red | "$350 → $425" |
| 💳 | PAYMENT | Green | "Payment received" |
| ✏️ | AMENDMENT | Brown | "Code amended" |
| 📄 | OCR_COMPLETE | Blue-gray | "Document scanned" |

**Color Coding for Results:**

| Value Contains | Color |
|----------------|-------|
| DEFAULT, GUILTY | Red |
| ADJOURN, RESCHEDUL | Orange |
| DISMISS, PAID | Green |

---

## 5. Clients Page

### 5.1 Client List Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Client Management                                          [+ Add Client]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ [🔍 Search clients...]                           [Export ▼] [Columns] [⚙️]  │
│                                                                              │
│ ┌──────────────────┬──────────────────┬──────────────────┬─────────────────┐│
│ │ Client Name      │ AKAs             │ Contact          │ Actions         ││
│ ├──────────────────┼──────────────────┼──────────────────┼─────────────────┤│
│ │ GC WAREHOUSE LLC │ G C WHSE,        │ John Doe         │ [Edit] [Delete] ││
│ │                  │ GC WAREHOUSE     │ 555-123-4567     │ [View Summonses]││
│ ├──────────────────┼──────────────────┼──────────────────┼─────────────────┤│
│ │ EXCEL COURIER    │ EXCEL CORP       │ Jane Smith       │ [Edit] [Delete] ││
│ │                  │                  │ 555-987-6543     │ [View Summonses]││
│ └──────────────────┴──────────────────┴──────────────────┴─────────────────┘│
│                                                                              │
│                                           Showing 2 of 2 clients             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Add/Edit Client Modal

```
┌─────────────────────────────────────────┐
│ Add New Client                      [X] │
├─────────────────────────────────────────┤
│                                         │
│ Client Name *                           │
│ [_____________________________]         │
│                                         │
│ AKAs (comma-separated)                  │
│ [_____________________________]         │
│                                         │
│ Contact Person                          │
│ [_____________________________]         │
│                                         │
│ Address                                 │
│ [_____________________________]         │
│                                         │
│ Phone 1           Phone 2               │
│ [_____________]   [_____________]       │
│                                         │
│ Email 1           Email 2               │
│ [_____________]   [_____________]       │
│                                         │
│            [Cancel]  [Save Client]      │
└─────────────────────────────────────────┘
```

### 5.3 Client Detail View

Clicking "View Summonses" shows all summonses for that client:

- Same DataGrid as Dashboard
- Pre-filtered to client
- Active Era filter applies
- Export available

---

## 6. Color System

### 6.1 Primary Palette

```
Primary Blue:    #1976d2  (MUI default)
Secondary:       #dc004e  (Error/urgent)
Background:      #f5f5f5  (Page background)
Paper:           #ffffff  (Cards, dialogs)
```

### 6.2 Semantic Colors

| Purpose | Color | Hex |
|---------|-------|-----|
| Error/Critical | Red | #d32f2f |
| Warning/Stale | Orange | #ed6c02 |
| Info/New | Blue | #0288d1 |
| Success/Synced | Green | #2e7d32 |

### 6.3 Status Chip Colors

| Status | MUI Color | Usage |
|--------|-----------|-------|
| SCHEDULED, NEW ISSUANCE | info (blue) | Pending action |
| DEFAULT, FAILURE TO APPEAR | error (red) | Urgent |
| DISMISSED, NOT GUILTY | success (green) | Positive outcome |
| RESCHEDULED, ADJOURNED | warning (orange) | Attention needed |

### 6.4 Sync Badge Colors

| State | MUI Color | Chip Style |
|-------|-----------|------------|
| Fresh (< 24h) | success | Green |
| Stale (24-48h) | warning | Yellow |
| Failed (> 48h) | error | Red |
| Syncing | info | Blue + Spinner |

---

## 7. Component Inventory

### 7.1 MUI Components Used

| Category | Components |
|----------|------------|
| Layout | Box, Grid, Paper, Container |
| Data Display | DataGrid, Typography, Chip, Badge, Divider |
| Inputs | Button, Checkbox, TextField, Select, DatePicker, Switch |
| Navigation | AppBar, Toolbar, Menu, MenuItem, Drawer |
| Feedback | Dialog, Snackbar, Alert, CircularProgress, Tooltip |
| Icons | Material Icons (MUI) |

### 7.2 Custom Components

| Component | Location | Purpose |
|-----------|----------|---------|
| SyncStatusBadge | src/components/ | Header traffic light |
| CalendarCommandCenter | src/components/ | Heatmap calendar |
| SimpleSummonsTable | src/components/ | 5-column DataGrid |
| SummonsDetailModal | src/components/ | Full detail dialog |
| ExportModal | src/components/ | CSV export config |

---

## 8. Data Filters

### 8.1 Global Filters (Always Applied)

| Filter | Logic | Default |
|--------|-------|---------|
| **Idling Guardrail** | `code_description` contains "IDLING" or "IDLE" | ON (cannot disable) |
| **Active Era** | `hearing_date` >= 2022-01-01 | ON (toggle available) |

### 8.2 User-Controlled Filters

| Filter | UI Element | Effect |
|--------|------------|--------|
| Date | Calendar click | Show only selected date |
| Critical | Red chip click | Show hearings ≤7 days |
| New | Blue chip click | Show records created in 72h |
| Updated | Orange chip click | Show records changed in 72h |
| Show Pre-2022 | Toggle switch | Include archived records |

### 8.3 Activity Badge Logic

**72-Hour Window (covers weekends):**

```javascript
// NEW badge
const isNew = (s) => {
  const created = new Date(s.createdAt);
  const updated = new Date(s.updatedAt);
  const isFirstVersion = Math.abs(updated - created) < 1000; // Within 1 second
  const within72h = (Date.now() - created) < 72 * 60 * 60 * 1000;
  return isFirstVersion && within72h;
};

// UPDATED badge
const isUpdated = (s) => {
  const created = new Date(s.createdAt);
  const updated = new Date(s.updatedAt);
  const wasModified = (updated - created) > 1000; // More than 1 second apart
  const within72h = (Date.now() - updated) < 72 * 60 * 60 * 1000;
  return wasModified && within72h;
};
```

---

## 9. Export System

### 9.1 Export Modal

```
┌─────────────────────────────────────────────────────────────────┐
│ Export Data                                                 [X] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Format:  [CSV ▼]                                                │
│                                                                  │
│ Columns to Export:                                               │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ☑ Summons Number    ☑ Client Name    ☑ Hearing Date       │ │
│ │ ☑ Status            ☑ Amount Due     ☐ Base Fine          │ │
│ │ ☐ Violation Date    ☐ License Plate  ☐ OCR Data           │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [Select All]  [Select None]  [Reset to Default]                  │
│                                                                  │
│ Preview (first 3 rows):                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ summons_number,client_name,hearing_date,status,amount_due   │ │
│ │ 000974656X,GC WAREHOUSE,2026-05-06,SCHEDULED,350.00         │ │
│ │ 000974789A,EXCEL COURIER,2025-12-15,DEFAULT,500.00          │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│                        [Cancel]  [Export 245 Records]            │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Export Options

| Option | Values |
|--------|--------|
| Format | CSV, TSV |
| Include Headers | Yes/No |
| Date Format | ISO, US, EU |
| Empty Value | "", "N/A", "-" |

---

## 10. Mobile Responsiveness

### 10.1 Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| xs | < 600px | Single column, stacked |
| sm | 600-900px | Compressed two-column |
| md | 900-1200px | Full split-view |
| lg | > 1200px | Full with extra padding |

### 10.2 Mobile Dashboard

```
┌─────────────────────────────────┐
│ ☰  NYC OATH Tracker         👤 │
├─────────────────────────────────┤
│                                 │
│ [📅 Calendar] [📊 Grid]         │ ← View toggle
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 🔴 Critical: 3              │ │
│ │ 🔵 New: 5                   │ │
│ │ 🟠 Updated: 2               │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ GC WAREHOUSE                │ │
│ │ Dec 15, 2025                │ │
│ │ SCHEDULED 🔵      $350      │ │
│ │                       [▶]   │ │
│ ├─────────────────────────────┤ │
│ │ EXCEL COURIER               │ │
│ │ Dec 15, 2025                │ │
│ │ DEFAULT 🔴        $500      │ │
│ │                       [▶]   │ │
│ └─────────────────────────────┘ │
│                                 │
└─────────────────────────────────┘
```

### 10.3 Mobile Detail Modal

- Full-screen dialog
- Single column layout
- Large touch targets (44px minimum)
- Swipe to close (future enhancement)

---

## 11. UX Principles Applied

### 11.1 Miller's Law (7±2 Items)

| Application | Implementation |
|-------------|----------------|
| DataGrid columns | 5 visible (not 30) |
| Quick stats | 3 chips (Critical, New, Updated) |
| Filter options | 4 choices maximum |

### 11.2 Fitts's Law (Target Size)

| Element | Size | Rationale |
|---------|------|-----------|
| Mobile checkboxes | 44px | Thumb-friendly |
| Action buttons | 36px min | Easy to tap |
| Chip click area | Full chip | Larger target |

### 11.3 Progressive Disclosure

| Level | Information | Access |
|-------|-------------|--------|
| 1 | Essential (5 columns) | Always visible |
| 2 | Full record | Click row → Modal |
| 3 | All history | Audit Trail drawer |

### 11.4 Don't Make Me Think

| Principle | Implementation |
|-----------|----------------|
| Color = meaning | Red = urgent, Green = good |
| No jargon | "Hearing Date" not "hearing_date" |
| Obvious actions | Click row to see more |

---

## 12. User Workflows

### 12.1 Daily Triage (2-3 minutes)

```
1. Open Dashboard
2. Check Sync Badge → Confirm data is fresh
3. Look at Quick Stats chips:
   - 🔴 Critical (3) → Immediate attention
   - 🔵 New (5) → Review today
   - 🟠 Updated (2) → Check changes
4. Click Critical chip → Filter to urgent
5. For each critical summons:
   - Click row → Open detail modal
   - Review hearing date, status
   - Check "Added to Calendar" if done
   - Add notes if needed
6. Done!
```

### 12.2 Evidence Request Workflow

```
1. Find summons (search or filter by date)
2. Click row → Open detail modal
3. In Evidence Tracking section:
   - Click "Find Video Evidence" button
   - Portal opens, summons # in clipboard
   - Paste, search, watch video
4. Back in modal:
   - Check "Evidence Reviewed" ✓
   - Check "Evidence Requested" ✓
   - Date auto-fills
5. Changes auto-save
```

### 12.3 Hearing Preparation

```
1. Click date on calendar (e.g., Dec 15)
2. Grid filters to that date
3. For each hearing:
   - Click row → Modal
   - Download Summons PDF
   - Watch video evidence
   - Check Lag Days (>60 = defense angle)
   - Read violation narrative
   - Add notes: "Will argue late video"
   - Update Internal Status: "Reviewing"
4. Export filtered data for court binder
```

### 12.4 Reviewing Changes (Audit Trail)

```
1. See 🟠 [2 Updated] chip in header
2. Click Audit Trail button
3. Drawer opens with all changes:
   - Dec 2: GC WAREHOUSE status changed
   - Dec 1: EXCEL COURIER amount increased
4. Click summons # to jump to detail
5. Review change in Case History timeline
```

---

## Appendix A: File References

| File | Purpose |
|------|---------|
| src/pages/CalendarDashboard.tsx | Main dashboard page |
| src/components/SummonsDetailModal.tsx | Detail modal |
| src/components/SyncStatusBadge.tsx | Header sync badge |
| src/components/CalendarCommandCenter.tsx | Heatmap calendar |
| src/components/SimpleSummonsTable.tsx | 5-column DataGrid |
| src/components/Header.tsx | App header with nav |
| src/pages/Clients.tsx | Client management |

---

## Appendix B: Change Log

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | Dec 2, 2025 | Complete rewrite with current UI state |
| 1.1 | Nov 26, 2025 | Added activity badges, 72h window |
| 1.0 | Nov 24, 2025 | Initial wireframe document |

---

*This document reflects the current implementation as of December 2, 2025.*
*For architectural details, see [ARCHITECTURE_REPORT.md](./ARCHITECTURE_REPORT.md)*
