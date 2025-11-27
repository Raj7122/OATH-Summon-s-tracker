# NYC OATH Summons Tracker - UI/UX Design Guide

**Version**: 1.0
**Date**: November 26, 2025
**Application**: NYC OATH Summons Tracker for Law Office of Arthur L. Miller
**Design Philosophy**: Evidence-Based UX + Professional Legal Interface

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Component Patterns](#component-patterns)
5. [Page Layouts & Wireframes](#page-layouts--wireframes)
6. [UX Laws Applied](#ux-laws-applied)
7. [Don't Make Me Think Principles](#dont-make-me-think-principles)
8. [Features by Page](#features-by-page)
9. [Interaction Design](#interaction-design)
10. [Accessibility & Responsive Design](#accessibility--responsive-design)

---

## 1. Design Philosophy

### Core Principles

**"Professional Legal Interface Meets Modern Web App"**

This application bridges two worlds:
- **Legal profession**: Requires precision, clarity, data density, conservative aesthetics
- **Modern SaaS**: Expects responsiveness, visual feedback, progressive disclosure, mobile support

### Design Goals

1. **Speed to Value**: Arthur sees critical deadlines within 2 seconds of login
2. **Zero Ambiguity**: Color-coded visual hierarchy eliminates guesswork
3. **Cognitive Load Management**: Progressive disclosure (7±2 items visible)
4. **Mobile-First Evidence Tracking**: Large touch targets (44px) for field work
5. **Professional Trust**: Conservative color palette, no playful illustrations

### Target Users

- **Arthur Miller** (Attorney): Needs fast triage, hearing prep, evidence review
- **Jackie** (Office Manager): Manages evidence requests, calendar coordination, data entry
- **Jelly** (Legal Assistant): Reviews videos, tracks deadlines, updates case status

---

## 2. Color System

### Primary Palette

Based on Material Design with legal industry conventions:

```
Primary Blue: #1976d2 (Professional, trustworthy)
├─ Light:     #42a5f5 (Hover states, accents)
└─ Dark:      #1565c0 (Active states, headers)

Secondary Red: #dc004e (Call-to-action, urgent items)
├─ Light:      #f50057
└─ Dark:       #c51162

Background:
├─ Default:    #f5f5f5 (Subtle gray, reduces eye strain)
└─ Paper:      #ffffff (Cards, dialogs, surfaces)
```

### Semantic Colors

**Status Indicators** (matches legal document conventions):

| Color | Usage | Hex | Meaning |
|-------|-------|-----|---------|
| 🔴 **Error Red** | `#d32f2f` | Critical deadlines (≤7 business days), Default Judgment status | URGENT ACTION REQUIRED |
| 🟠 **Warning Orange** | `#ffa726` | Approaching deadlines (8-21 business days), [UPDATED] badges | ATTENTION NEEDED |
| 🔵 **Info Blue** | `#0288d1` | Evidence Pending, Scheduled hearings, [NEW] badges | INFORMATIONAL |
| 🟢 **Success Green** | `#66bb6a` | Hearing Complete, Dismissed cases, Paid amount indicator | POSITIVE OUTCOME |

### Activity Badge Colors

```
[NEW]     Badge: #1976d2 (Info Blue) - New summons within 72 hours
[UPDATED] Badge: #ffa726 (Warning Orange) - Status/amount/date changed within 72 hours
```

### Dashboard Card Border Colors

Each summary card uses a **6px left border** for instant visual identification:

```
┌─────────────────────────┐
│ 🔴 Critical Deadlines   │  ← Red border (#d32f2f)
│    15 summonses         │
└─────────────────────────┘

┌─────────────────────────┐
│ 🟠 Approaching Deadlines│  ← Orange border (#ffa726)
│    42 summonses         │
└─────────────────────────┘

┌─────────────────────────┐
│ 🔵 Evidence Pending     │  ← Blue border (#0288d1)
│    8 summonses          │
└─────────────────────────┘

┌─────────────────────────┐
│ 🟢 Hearing Complete     │  ← Green border (#66bb6a)
│    127 summonses        │
└─────────────────────────┘
```

**UX Rationale**: Pre-attentive processing - users identify card type before reading text

---

## 3. Typography

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             "Helvetica Neue", Arial, sans-serif;
```

**Why**: System fonts for optimal legibility and OS-native feel

### Type Scale

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| H1 | 2.5rem (40px) | 500 | Page titles (not currently used) |
| H2 | 2rem (32px) | 500 | Section headers (not currently used) |
| H3 | 1.75rem (28px) | 500 | Card counts (e.g., "15" critical deadlines) |
| H4 | 1.5rem (24px) | 500 | Page headers ("Dashboard") |
| H5 | 1.25rem (20px) | 500 | Dialog titles |
| H6 | 1rem (16px) | 500 | Card titles ("Critical Deadlines") |
| Body1 | 1rem (16px) | 400 | Primary content, table cells |
| Body2 | 0.875rem (14px) | 400 | Secondary text, descriptions |

### Text Button Override

```css
textTransform: 'none' /* Prevents MUI's default UPPERCASE buttons */
```

**Rationale**: Sentence case is more readable (Don't Make Me Think principle)

---

## 4. Component Patterns

### Cards

**Elevation System**:
- Default: `boxShadow: '0 2px 8px rgba(0,0,0,0.1)'` (subtle depth)
- Hover: `boxShadow: 8` (lifts on hover, feedback for clickability)
- Active Filter: `boxShadow: 6` + `backgroundColor: selected` (shows current filter)

**Border Radius**: 8px (friendly but professional)

### Chips (Status Indicators)

**Color-Coded Status Chips** in DataGrid:

```tsx
// Red Chip - Critical States
DEFAULT JUDGMENT | FAILURE TO APPEAR | IN VIOLATION

// Blue Chip - Scheduled/Pending
SCHEDULED | PENDING | RESCHEDULED

// Green Chip - Positive Outcomes
DISMISSED | NOT GUILTY | WITHDRAWN
```

**Size**: `size="small"` (0.75rem font, compact for table cells)

### Buttons

**Hierarchy**:
1. **Primary** (Contained, Blue): Main actions (Save, Submit)
2. **Secondary** (Outlined, Gray): Cancel, Clear Filter
3. **Text** (No background): Tertiary actions (View More)

**Border Radius**: 4px (matches card aesthetic)

### Data Grid (MUI DataGrid)

**Key Features**:
- **Sticky Header**: Column headers fixed during scroll
- **Row Hover**: Light blue background on hover
- **Zebra Striping**: None (reduces visual noise)
- **Fresh Row Highlight**: `backgroundColor: '#FFFDE7'` (pale yellow) for 72-hour freshness

**Scrollbar Styling** (Enhanced):
```css
/* Webkit (Chrome, Safari, Edge) */
&::-webkit-scrollbar { height: 12px; }
&::-webkit-scrollbar-track { background: #f1f1f1; }
&::-webkit-scrollbar-thumb { background: #888; border-radius: 6px; }

/* Firefox */
scrollbarWidth: 'auto';
scrollbarColor: '#888 #f1f1f1';
```

**Rationale**: Horizontal scrollbar was too subtle; users missed scrollable columns

---

## 5. Page Layouts & Wireframes

### 5.1 Dashboard Page

```
┌─────────────────────────────────────────────────────────────────┐
│ NYC OATH Tracker    [Dashboard] [Clients]        [Account] 👤   │ ← Header (Sticky)
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Dashboard                                     [🔄 Refresh]       │
│                                                                   │
│ ┌───────────┬───────────┬───────────┬───────────┐               │
│ │🔴CRITICAL │🟠APPROACHING│🔵EVIDENCE │🟢HEARING  │ ← Summary Cards (4-grid)
│ │ Deadlines │ Deadlines │  Pending  │ Complete  │
│ │    15     │    42     │     8     │    127    │
│ │  ≤7 biz   │ 8-21 biz  │ Requested │ Completed │
│ │   days    │   days    │not recv'd │ hearings  │
│ └───────────┴───────────┴───────────┴───────────┘               │
│                                                                   │
│ [UPDATED] [NEW]  ← Activity Filter Toggles                       │
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Summons by Status (Bar Chart)                                │ │
│ │                                                               │ │
│ │   SCHEDULED     ████████████████ 87                          │ │
│ │   DISMISSED     ████████ 42                                  │ │
│ │   DEFAULT       ████ 15                                      │ │
│ │   RESCHEDULED   ██ 8                                         │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🔍 [Search]        [Export CSV] [Columns] [Filters] [Density]│ │ ← GridToolbar
│ ├───┬────────┬──────┬────────┬────────┬──────────┬───────┬────┤ │
│ │ ▼ │Activity│Client│Summons#│Hearing │Status    │Violat.│Amt │ │ ← Column Headers
│ ├───┼────────┼──────┼────────┼────────┼──────────┼───────┼────┤ │
│ │ ▼ │[NEW]   │GC    │1234567 │Dec 15  │SCHEDULED │IDLING │$350│ │ ← Collapsible Row
│ │   │        │Whse  │        │        │🔵        │       │    │ │
│ ├───┼────────┼──────┼────────┼────────┼──────────┼───────┼────┤ │
│ │ ▶ │[UPDT'd]│Excel │7654321 │Dec 12  │DEFAULT   │SANIT. │$500│ │
│ │   │        │Cour. │        │        │🔴        │       │    │ │
│ └───┴────────┴──────┴────────┴────────┴──────────┴───────┴────┘ │
│                                                                   │
│                              [1-20 of 241]  [< 1 2 3 4 >]         │
└─────────────────────────────────────────────────────────────────┘
```

**Expanded Row Detail Panel**:
```
┌─────────────────────────────────────────────────────────────────┐
│ ▼ Additional Details                                             │
│                                                                   │
│ ┌─────────────┬─────────────┬─────────────┬─────────────┐      │
│ │ Hearing Info│ Violation   │ Vehicle     │ Financial   │      │
│ │             │ Info        │ Info        │ Info        │      │
│ │ Date: 12/15 │ Type: IDLING│ Plate: ABC  │ Base: $350  │      │
│ │ Time: 9:00AM│ Date: 11/10 │ Type: Truck │ Due: $350   │      │
│ │ Result:     │ Time: 8:30AM│ DEP ID: 123 │ Paid: $0    │      │
│ │   Dismissed │ Location:   │ Agency: 456 │             │      │
│ │ Status:     │   123 Main  │             │             │      │
│ │   DISMISSED │             │             │             │      │
│ └─────────────┴─────────────┴─────────────┴─────────────┘      │
│                                                                   │
│ Documents: [View Summons PDF] [View Video Evidence]              │
│                                                                   │
│ Violation Narrative (OCR):                                       │
│ "Observed vehicle idling for 8 minutes. Engine running,          │
│  no driver present. Commercial truck parked in loading zone."    │
│                                                                   │
│ ☐ Evidence Reviewed  ☐ Added to Calendar  ☐ Evidence Requested  │
│ ☐ Evidence Received  📝 Notes  [Internal Status: Reviewing ▼]    │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Clients Page

```
┌─────────────────────────────────────────────────────────────────┐
│ NYC OATH Tracker    [Dashboard] [Clients]        [Account] 👤   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Client Management                          [➕ Add New Client]   │
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🔍 [Search clients...]   [Export CSV] [Columns] [Filters]   │ │ ← GridToolbar
│ ├──────────────────┬──────────────┬──────────────┬───────────┤ │
│ │ Client Name      │ AKAs         │ Contact      │ Actions   │ │
│ ├──────────────────┼──────────────┼──────────────┼───────────┤ │
│ │ GC Warehouse LLC │ G C Whse,    │ John Doe     │ ✏️ 🗑️     │ │
│ │                  │ GC WAREHOUSE │ 555-1234     │           │ │
│ ├──────────────────┼──────────────┼──────────────┼───────────┤ │
│ │ Excel Courier    │ Excel Corp   │ Jane Smith   │ ✏️ 🗑️     │ │
│ │                  │              │ 555-5678     │           │ │
│ └──────────────────┴──────────────┴──────────────┴───────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Add/Edit Client Dialog**:
```
┌─────────────────────────────────────┐
│ Add New Client                   [✕]│
├─────────────────────────────────────┤
│ Client Name *                       │
│ [_____________________________]     │
│                                     │
│ AKAs (comma-separated)              │
│ [_____________________________]     │
│                                     │
│ Contact Person                      │
│ [_____________________________]     │
│                                     │
│ Address                             │
│ [_____________________________]     │
│                                     │
│ Phone 1         Phone 2             │
│ [_____________] [_____________]     │
│                                     │
│ Email 1         Email 2             │
│ [_____________] [_____________]     │
│                                     │
│         [Cancel]  [Save Client]     │
└─────────────────────────────────────┘
```

### 5.3 Mobile Layout (< 768px)

**Responsive Dashboard** (Bottom Sheet for Evidence Tracking):

```
┌─────────────────────┐
│ ☰  NYC OATH Tracker │ ← Hamburger menu
└─────────────────────┘

┌───────────────────┐
│ 🔴 Critical: 15   │
│ 🟠 Approaching: 42│  ← Cards stack vertically
│ 🔵 Evidence: 8    │
│ 🟢 Complete: 127  │
└───────────────────┘

┌───────────────────┐
│ [Tap row to view] │  ← Instruction hint
├─────┬───────┬─────┤
│NEW  │GC Whse│$350 │  ← Minimal columns on mobile
│[▶]  │12/15  │     │
└─────┴───────┴─────┘

[Tap to manage evidence] ← Bottom Sheet Trigger
```

**Bottom Sheet** (slides up from bottom):
```
┌─────────────────────────────────┐
│ ═══                             │ ← Drag handle
│                                 │
│ Summons #1234567                │
│                                 │
│ Evidence Tracking               │
│                                 │
│ Evidence Reviewed     [○────]   │ ← Large Switch (44px)
│ Added to Calendar     [────○]   │
│ Evidence Requested    [○────]   │
│ Evidence Received     [○────]   │
│                                 │
│ 📝 Add Notes                    │
│                                 │
│           [Close]               │
└─────────────────────────────────┘
```

**UX Rationale**: 44px touch targets (Fitts's Law) for field work

---

## 6. UX Laws Applied

### 6.1 Miller's Law (7±2 Items)

**"The average person can only keep 7 (±2) items in their working memory."**

**Implementation**:
- **Dashboard Cards**: 4 cards (within 7±2 range)
- **DataGrid Visible Columns**: 9 columns by default
  1. Activity Badge
  2. Client Name
  3. Summons Number
  4. Hearing Date
  5. Status
  6. Violation Type
  7. Amount Due
  8. Lag Days
  9. Internal Status
- **30+ secondary columns**: Hidden by default (progressive disclosure)
- **Expanded Row**: Details shown on-demand, not cluttering main view

**Result**: Arthur can scan the dashboard without cognitive overload

### 6.2 Fitts's Law (Target Size & Distance)

**"The time to acquire a target is a function of distance and size."**

**Implementation**:
- **Summary Cards**: 6px left border (easier to click edge than center)
- **Mobile Switches**: 44px minimum height (iOS/Android guideline)
- **Desktop Checkboxes**: 24px (MUI default, sufficient for mouse)
- **Action Buttons**: 36px min-height with 8px padding
- **Card Hover Area**: Entire card is clickable (not just text)

**Result**: Reduced mis-clicks, especially on mobile during field work

### 6.3 Hick's Law (Choice Reduction)

**"The time it takes to make a decision increases with the number of choices."**

**Implementation**:
- **Summary Cards**: 4 choices (not 10+ filters)
- **Internal Status Dropdown**: 5 options (New, Reviewing, Hearing Complete, Summons Paid, Archived)
- **Mutually Exclusive Filters**: Only one card filter active at a time
- **Primary Actions**: Max 2 buttons per context (Save/Cancel, not 5 options)

**Result**: Faster decision-making, reduced analysis paralysis

### 6.4 Jakob's Law (Familiar Patterns)

**"Users spend most of their time on other sites. They prefer your site to work the same way."**

**Implementation**:
- **Material Design**: Follows Google's established patterns (familiarity)
- **DataGrid**: Looks like Excel/Google Sheets (legal professionals' daily tool)
- **Icon Conventions**:
  - 🔍 Search
  - ✏️ Edit
  - 🗑️ Delete
  - 🔄 Refresh
  - ⬇️ Export
- **Navigation**: Top bar with logo + nav links (standard web app)

**Result**: Zero learning curve for basic interactions

### 6.5 Law of Proximity (Grouping)

**"Objects near each other are perceived as related."**

**Implementation**:
- **Expanded Row Sections**: 4 grouped boxes (Hearing, Violation, Vehicle, Financial)
- **Summary Cards**: Grouped at top of dashboard
- **Evidence Checkboxes**: Clustered together in expanded row
- **Action Buttons**: Grouped by context (dialog footer, toolbar)

**Result**: Users instantly understand relationships without reading labels

### 6.6 Von Restorff Effect (Isolation Effect)

**"An item that stands out is more likely to be remembered."**

**Implementation**:
- **[UPDATED] Badge**: Orange on white background (distinct from blue [NEW])
- **Red Critical Card**: 6px border + red text (stands out from other 3 cards)
- **Fresh Row Highlight**: Pale yellow background for 72-hour freshness
- **Hearing Result**: Bold + primary color in expanded row (high priority)

**Result**: Critical information catches attention immediately

### 6.7 Aesthetic-Usability Effect

**"Users often perceive aesthetically pleasing design as more usable."**

**Implementation**:
- **Consistent 8px Border Radius**: Cards, buttons, inputs
- **Subtle Shadows**: `0 2px 8px rgba(0,0,0,0.1)` (depth without harshness)
- **Color Harmony**: Semantic colors from single Material palette
- **Whitespace**: 16px-24px padding in cards, no cramped layout
- **Typography Scale**: Consistent heading hierarchy

**Result**: Professional appearance builds trust, perceived as "easier to use"

---

## 7. Don't Make Me Think Principles

### Principle 1: "Don't Make Me Think"

**Implementation**:
- **Color-Coded Status**: Red = Urgent, Green = Done (no reading required)
- **Icon + Text Labels**: Not just icons (reduces ambiguity)
- **Hover Tooltips**: [UPDATED] badge shows exact changes on hover
- **Visual Hierarchy**: Large numbers (H3) for counts, smaller text for descriptions

**Example**:
```
🔴 Critical Deadlines
       15                 ← Big number (instant comprehension)
Hearings within 7 business days  ← Context
```

### Principle 2: "Eliminate Visual Noise"

**Implementation**:
- **No Zebra Striping**: DataGrid uses hover highlight instead
- **No Decorative Images**: Legal app doesn't need illustrations
- **Minimal Borders**: Only where they add clarity (card borders, table grid)
- **Monochromatic Text**: Gray for secondary, black for primary (not rainbow colors)

**Result**: Faster scanning, reduced eye strain

### Principle 3: "Make Obvious What's Clickable"

**Implementation**:
- **Card Hover Effect**: Shadow increases from 3 → 8 on hover
- **Cursor Changes**: `cursor: pointer` on all clickable elements
- **Button Affordance**: Raised appearance (contained buttons)
- **Link Underlines**: Present on hover for external links
- **Expand Icon**: ▶/▼ arrows indicate collapsible rows

**Result**: No guessing what's interactive

### Principle 4: "Break Pages Into Clearly Defined Areas"

**Implementation**:

```
┌────────────────────────────┐
│ Header (Navigation)        │ ← Always visible (sticky)
├────────────────────────────┤
│ Summary Cards (Metrics)    │ ← At-a-glance status
├────────────────────────────┤
│ Activity Filters           │ ← Action area
├────────────────────────────┤
│ Chart (Optional Context)   │ ← Visual insight
├────────────────────────────┤
│ DataGrid (Detail Work)     │ ← Main workspace
└────────────────────────────┘
```

**Result**: Users know where to look for specific information

### Principle 5: "Make It Obvious How to Get Home"

**Implementation**:
- **Logo Click**: "NYC OATH Tracker" → /dashboard
- **Dashboard Nav Item**: Always available in top bar
- **Breadcrumbs**: Not needed (only 2-level hierarchy)

### Principle 6: "Minimize User Effort"

**Implementation**:
- **Auto-Save Notes**: 1-second debounce (no "Save" button needed)
- **Smart Defaults**: Internal Status = "New" on creation
- **Auto-Date**: Evidence requested date auto-fills when checkbox checked
- **Search Integration**: GridToolbar search across all columns simultaneously
- **CSV Export**: 1-click export (no multi-step wizard)

**Result**: Reduces clicks, reduces errors

---

## 8. Features by Page

### 8.1 Dashboard Features

| Feature | Description | UX Law Applied |
|---------|-------------|----------------|
| **Summary Cards** | 4 cards (Critical, Approaching, Evidence Pending, Hearing Complete) | Miller's Law (7±2) |
| **Card Filters** | Click card to filter table | Fitts's Law (large targets) |
| **Activity Filters** | [UPDATED] / [NEW] toggle buttons | Hick's Law (2 choices) |
| **Activity Badges** | [NEW] blue, [UPDATED] orange with hover tooltip | Von Restorff Effect |
| **Status Chips** | Color-coded (Red/Blue/Green) with text | Don't Make Me Think |
| **Expandable Rows** | ▼ icon reveals 30+ fields | Progressive Disclosure |
| **Evidence Checkboxes** | Persist on page refresh | User Control |
| **Notes Dialog** | Auto-save after 1 sec, manual save button | Minimize Effort |
| **Bar Chart** | Summons by Status visual | Aesthetic-Usability |
| **CSV Export** | Download filtered data | Jakob's Law (Excel) |
| **Responsive Grid** | Works on mobile (≥375px) | Accessibility |

### 8.2 Clients Features

| Feature | Description | UX Law Applied |
|---------|-------------|----------------|
| **Add Client** | 8 contact fields + AKAs | Complete Data |
| **Edit Client** | Inline editing via dialog | Familiar Pattern |
| **Delete Client** | Confirmation dialog | Prevent Errors |
| **Search Bar** | GridToolbar QuickFilter | Jakob's Law |
| **AKAs Column** | Shows all aliases in one cell | Proximity |

### 8.3 Login/Auth Features

| Feature | Description | UX Law Applied |
|---------|-------------|----------------|
| **AWS Cognito** | Enterprise-grade auth | Trust |
| **Protected Routes** | Redirect to /login if not authenticated | Security |
| **Account Menu** | Dropdown with username, settings, sign out | Familiar Pattern |

---

## 9. Interaction Design

### 9.1 Hover States

| Element | Default | Hover | Active |
|---------|---------|-------|--------|
| Summary Card | `boxShadow: 3` | `boxShadow: 8` | `boxShadow: 6` + selected bg |
| Button (Primary) | Blue bg | Darker blue | Pressed state |
| DataGrid Row | White bg | `rgba(25, 118, 210, 0.08)` | - |
| Link | Underline | Darker color | - |
| Chip | Default color | - | - |

### 9.2 Loading States

**Not currently implemented** (future enhancement):
- Skeleton screens for table load
- Spinner for CSV export
- Progress bar for bulk operations

### 9.3 Empty States

**Clients Page** (no clients):
```
┌─────────────────────────────┐
│ No clients yet              │
│ [➕ Add Your First Client]  │
└─────────────────────────────┘
```

**Dashboard** (no summonses):
```
┌─────────────────────────────┐
│ No summonses found          │
│ Add clients to start        │
│ tracking OATH violations    │
└─────────────────────────────┘
```

### 9.4 Error States

**Failed Checkbox Save**:
```javascript
alert('Failed to save checkbox. Please try again.');
```

**Future Enhancement**: Toast notifications instead of alerts

### 9.5 Success Feedback

**Notes Auto-Save**:
- ✓ Checkmark icon appears for 2 seconds
- No disruptive modal

**Checkbox Toggle**:
- Immediate visual feedback (checkbox state changes)
- Page refresh confirms persistence

---

## 10. Accessibility & Responsive Design

### 10.1 WCAG Compliance

**Color Contrast**:
- All text meets WCAG AA standard (4.5:1 ratio)
- Status chips use text + color (not color alone)

**Keyboard Navigation**:
- All interactive elements accessible via Tab
- Enter/Space triggers buttons
- Escape closes dialogs

**Screen Reader Support**:
- MUI components have built-in ARIA labels
- Semantic HTML (header, nav, main, table)

### 10.2 Responsive Breakpoints

```css
xs: 0px     (Mobile portrait)
sm: 600px   (Mobile landscape)
md: 900px   (Tablet)
lg: 1200px  (Desktop)
xl: 1536px  (Large desktop)
```

**Layout Adjustments**:

| Breakpoint | Navigation | Cards | DataGrid |
|------------|------------|-------|----------|
| xs (< 600px) | Hamburger menu | Stack vertically | Hide 50% of columns |
| sm (600px) | Hamburger menu | 2-column grid | Hide 30% of columns |
| md (900px) | Full nav bar | 4-column grid | Show 9 columns |
| lg (1200px+) | Full nav bar | 4-column grid | Show all columns |

### 10.3 Touch Targets (Mobile)

**Minimum Sizes**:
- Buttons: 44px × 44px
- Switches: 44px height
- Checkboxes (desktop): 24px × 24px (acceptable for mouse)
- Card tap area: Entire card (not just text)

---

## Appendix A: Component Inventory

### MUI Components Used

**Layout**:
- AppBar, Toolbar, Box, Container, Grid

**Data Display**:
- DataGrid, Card, CardContent, Typography, Chip, Tooltip, Badge

**Inputs**:
- Button, IconButton, Checkbox, TextField, Select, MenuItem, DatePicker

**Navigation**:
- Menu, MenuItem, Drawer

**Feedback**:
- Dialog, Snackbar, Alert

**Icons**:
- Material Icons (MUI)

---

## Appendix B: Future Enhancements

1. **Dark Mode**: Toggle in Account settings
2. **Toast Notifications**: Replace alert() calls
3. **Skeleton Screens**: Loading states for table
4. **Drag-to-Reorder**: Columns in DataGrid
5. **Saved Filters**: User-defined filter presets
6. **Batch Actions**: Select multiple summonses, bulk update
7. **Keyboard Shortcuts**: Cmd+K for search, etc.
8. **Timeline View**: Summons activity history
9. **Print View**: Optimized layout for printing reports

---

## Appendix C: Design Decisions Log

### Why No Illustrations?

**Decision**: Use icons only, no decorative images
**Rationale**: Legal professionals expect conservative, data-focused interfaces. Illustrations would reduce trust and perceived professionalism.

### Why Material UI?

**Decision**: MUI over Tailwind, Bootstrap, or custom CSS
**Rationale**:
1. Enterprise-grade component library
2. Built-in accessibility (ARIA, keyboard nav)
3. Consistent design system (reduces decisions)
4. DataGrid component (saves weeks of development)
5. Active maintenance and documentation

### Why 72-Hour Freshness Window?

**Decision**: [NEW]/[UPDATED] badges show for 72 hours (not 24)
**Rationale**: Daily sweep runs once per day. If it runs Friday at 9 AM, Arthur won't see updates until Monday (weekend). 72 hours covers this gap.

### Why 4 Summary Cards (Not More)?

**Decision**: Limit to 4 cards (Critical, Approaching, Evidence Pending, Hearing Complete)
**Rationale**:
1. Miller's Law (7±2 items) - 4 is well within range
2. Fits in 1 row on desktop (md={3} grid)
3. More cards = analysis paralysis (Hick's Law)
4. These 4 cover Arthur's primary workflows

### Why No Automated Calendar Integration?

**Decision**: Manual "Added to Calendar" checkbox (not auto-sync)
**Rationale**:
1. Arthur wants control (doesn't trust automation for hearings)
2. Calendar integration is complex (Outlook, Google, iCal compatibility)
3. Legal liability if automation fails (missed hearing = lawsuit)
4. Checkbox provides accountability trail

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Nov 26, 2025 | Initial UI/UX Design Guide created |

---

**Maintained By**: Development Team
**Contact**: See TRD.md for stakeholder information
**Related Docs**: TRD.md, DASHBOARD_UX_GUIDE.md, CLAUDE.md
