# The OATH Summons Tracker, Told as a Story

A guided tour of how this codebase actually works, why it looks the way it does, and the bugs that taught us those lessons the hard way.

---

## 1. The Spreadsheet That Wouldn't Die

Before any of this existed, Arthur had a routine. Every few days, he'd open NYC Open Data, download a giant CSV of OATH violations, scroll until his eyes glazed over, and hand-pick the rows that looked like one of the firm's clients. "MARSALA'S MAIL SERVICE." "HUB TRUCK RENTAL." "CERCONE EXTERIOR RESTORATION CORP." Then he'd cross-reference each one against the OATH website to see if the hearing date had moved, paste it into another spreadsheet, and start drafting invoices.

That workflow has a name. The name is *toil*. And it doesn't scale — not when one missed hearing date can mean a default judgment for a client.

The OATH Summons Tracker is the system that ate that workflow. Every morning at 6 AM UTC, it does the spreadsheet dance for him: pulls every fresh idling violation from NYC, decides which ones belong to which client, runs OCR on the PDFs to extract the data the API doesn't expose, and surfaces it all on a dashboard with deadline-colored cards (red for "this week," amber for "this month," green for "later"). When Arthur, Jacky, or Jelly sits down with coffee, the work is already done. They just review and act.

That's the *what*. The interesting parts are the *how* and the *why-it-took-so-many-tries*.

---

## 2. A Mental Model: The 2 AM Librarian

If you remember nothing else from this doc, remember this picture.

Imagine a courthouse library that closes at 5 PM. At 2 AM, an alarm clock rings (that's **EventBridge**). A librarian walks in (that's the **dailySweep Lambda**), picks up a stack of NYC's published case lists, and starts sorting them — flipping each one against a Rolodex of the firm's clients, marking which cases belong to whom. For cases that look fresh and important, she walks them down the hall to a back room where a slow, patient OCR clerk (the **dataExtractor Lambda**) holds them under a Gemini-powered scanner and types the contents into a card catalog (**DynamoDB**, exposed via **AppSync GraphQL**). She has until roughly 5 AM to finish. If she runs out of time, she stops where she is and resumes tomorrow — there's a tiered priority list pinned to the wall so the most urgent cases get scanned first.

When morning comes, the lawyers walk into the reading room (the **React frontend**) and find everything sorted, indexed, and color-coded. A small badge in the corner (the **SyncStatus** singleton) tells them whether the librarian got through her shift cleanly.

Hold that picture. The rest of this doc is just the messy specifics of making the librarian reliable.

---

## 3. The Stack, and Why It Looks Like That

The big choices were largely already decided by the firm's constraints, but each one has a defensible reason once you stop and think about it:

**AWS Amplify (Gen 1)** — A three-person law firm doesn't want to glue together six SaaS dashboards. Amplify gives you Cognito (auth), AppSync (GraphQL on top of DynamoDB), Lambda, S3, and Hosting from a single CLI. The price you pay is some lock-in and the looming Gen 2 migration (more on that at the end).

**Cognito with email-only sign-in, no MFA** — Three users. No social login. No SSO. Anything more would be cosplay.

**DynamoDB via `@model` directives + `@auth(rules: [{ allow: owner }])`** — That single auth rule does a *lot* of work. It quietly guarantees that User A's queries can never see User B's records, even if a frontend bug tried, because AppSync injects the Cognito subject into every query at the API layer. It's the security boundary, hiding in one line of schema.

**Google Gemini 2.5 Flash for OCR** — Mandated by the TRD, but a defensible call: it accepts PDFs natively (no need to rasterize first), it's roughly an order of magnitude cheaper than Claude or GPT-4 for vision tasks, and its JSON-mode prompting is reliable enough that we get away with regex-validating the output.

**MUI + DataGrid + custom theme** — This is a data-dense legal app, not a marketing page. DataGrid gives us sort/filter/CSV export for free. The custom theme (`src/theme.ts`) buys a "fintech-app" aesthetic — soft shadows, deep blue primary, a four-color "horizon" palette (red/amber/green/grey) that gets reused everywhere from dashboard cards to invoice tracker chips.

**Client-side PDF/DOCX generation** with `jspdf` and `docx` (in `src/utils/invoiceGenerator.ts`, all 713 lines of it) — Generating invoices in the browser means no Lambda round-trip, no S3 upload-then-download dance, and the user's edits to legal fees show up in the preview instantly. The cost is bundle weight, which we accept.

**No Redux, no Zustand, no React Query** — Just three React Contexts (`AuthContext`, `InvoiceContext`, `InvoiceTrackerContext`) and `useState`. For an app this size, anything more is ceremony. The `InvoiceContext` even doubles as a cart that persists to `localStorage` so the user can close the tab mid-invoice and come back.

You'll notice a theme: every choice trades flexibility for fewer moving parts. With three users and one developer, *fewer moving parts* almost always wins.

---

## 4. A Tour of the Codebase

If you cloned this fresh and had thirty minutes, this is the order to read it in.

### `amplify/backend/api/oathsummonstracker/schema.graphql`

Five models: `Client`, `Summons`, `SyncStatus`, `Invoice`, `InvoiceSummons`. All `@auth(rules: [{ allow: private }])` (which in our config means "any authenticated user in the Cognito pool").

The `Summons` model is the heart of the system. It's deliberately wide — it carries fields from three different sources crammed onto one row:

1. **NYC API fields** — `summons_number`, `hearing_date`, `status`, `amount_due`, `license_plate`
2. **OCR fields** (from Gemini) — `id_number`, `license_plate_ocr`, `violation_narrative`, `idling_duration_ocr`, `critical_flags_ocr`
3. **User annotations** — `notes_comments` (threaded JSON), `evidence_reviewed`, `internal_status`, `attachments`

It also carries operational metadata: `ocr_status`, `ocr_failure_count`, `api_miss_count`, `is_archived`, `activity_log` (a JSON array of state changes, capped at 100 entries — more on that cap later).

Two design choices to flag:

- **`SyncStatus` is a singleton** with `id="GLOBAL"`. There is exactly one row in this table, ever. The frontend polls it for the "last sync at HH:MM" badge in the header. It's a poor man's job-status API, and it works perfectly.
- **`Invoice` and `InvoiceSummons`** are a many-to-many join, but the join row carries *invoice-specific overrides* — `legal_fee`, `amount_due`, `status`, `hearing_result`. This means invoicing a summons doesn't mutate the underlying summons record. Arthur can present "$500" on the invoice while the actual API-reported balance is "$425," and the source data stays clean.

### `amplify/backend/function/dailySweep/src/index.js` (1,972 lines)

The librarian. This is the file you should read first if you want to understand how the system actually thinks. The interesting parts:

- **Lines 1390–1465** — `matchRespondentToClient()`. The four-strategy AKA matcher. We'll come back to this.
- **Lines 895–953** — `calculateTieredPriorityScore()`. The OCR priority queue scoring function. Hearings within 7 days get scores 0–70, 8–30 days get 100–130, and so on out to 400+ for archived records. Modifiers nudge new records up (-20), expensive cases up (-10), and previous failures down (+50 per failure to prevent retry storms).
- **Lines 1543–1608** — `fetchForTerm()`. The NYC Open Data pagination loop with the per-request `AbortController` (30s timeout) that prevents a single slow Socrata query from poisoning the whole batch.
- **Lines 269–346** — Pre-loads every existing summons into an in-memory `Map` before the sweep starts. This one decision (a single full-table scan instead of 3,600 individual queries) cut the Lambda runtime from 900+ seconds to about 66.

### `amplify/backend/function/dataExtractor/src/index.js` (506 lines)

The OCR clerk. Two responsibilities:

- **Cheerio scrape** of `nycidling.azurewebsites.net/idlingevidence/video/{ticket}` to pull "Video Created Date" out of the HTML using a small ladder of selectors (`label:contains("Video Created")`, `td:contains(...)`, `[id*="videoCreated"]`, `[class*="video-created"]`). The lag between violation date and video creation date is a useful indicator of evidence freshness.
- **Gemini PDF OCR** with a structured prompt (lines 281–301) that returns eight fields as JSON. Then a strict regex validation step (lines 326–351) that rejects anything looking like a summons number masquerading as an `id_number`. We'll come back to that one too.

### `src/contexts/`

Three contexts, three jobs:

- `AuthContext.tsx` — wraps `aws-amplify/auth`, exposes `useAuth()`, gates everything behind a `<ProtectedRoute>` HOC.
- `InvoiceContext.tsx` — the cart. Persists to `localStorage` on every change. Carries per-summons override fields (legal fee, status, highlight flags) before they land in DynamoDB.
- `InvoiceTrackerContext.tsx` — fetches and caches *persisted* invoices for the tracker page. Has a graceful-degradation `try/catch` around schema mismatches so the app doesn't crash if the Invoice tables haven't been deployed yet.

### `src/pages/`

Four screens that do the real work:

- **Dashboard** (`Dashboard.tsx`, 841 lines) — deadline-colored card filters, an audit-trail drawer, business-day deadline math. The card you click filters the table beneath it. The "UPDATED" badge logic in particular is subtle: it checks `last_change_at` (only set when the NYC API actually reports a change), not `updatedAt` (which would fire on every sync and create a flood of false positives).
- **ClientDetail** (`ClientDetail.tsx`, 1,283 lines) — the per-client ledger. Pulls all summonses, filters client-side for AKA matches and idling-only, joins against invoices to compute a `summonsPaymentMap` so each row can show "invoiced," "paid," or "owed." CSV export with column-pickers and date-range filters.
- **InvoiceBuilder** (`InvoiceBuilder.tsx`) — reads the cart, groups by client, lets the user adjust legal fees and recipient info, previews live, and renders to PDF or DOCX in the browser.
- **InvoiceTracker** (`InvoiceTracker.tsx`) — split-view calendar + list, with overdue / due-soon / paid horizon chips.

### `src/utils/invoiceGenerator.ts`

Where `jspdf-autotable` and `docx` get bent into producing invoices that look like they came out of a 1996 print shop, which is exactly what the firm wants. The function takes the cart's overrides into account, so the user's edited legal fees flow through to the rendered file without ever touching the Summons row.

That's the codebase. Now the interesting part: the bugs.

---

## 5. War Stories

Every codebase has a few. Here are six that taught lessons big enough to repeat.

### Story 1: The Hearing That Moved a Day Earlier

Sometime in the winter, Jacky noticed that a hearing scheduled for June 11 was showing up on the dashboard as June 10. Then it happened on a different summons. Then on the CSV export. Then on the calendar filters. By the fifth occurrence, it was clear this wasn't a one-off.

The cause was the most boring possible explanation: dates were stored in DynamoDB as ISO 8601 strings in the form `2026-06-11T00:00:00.000Z` — midnight UTC. Parsed in US Eastern time with a default `dayjs()` or `new Date()`, midnight UTC becomes 8 PM the previous evening, which means `getDate()` returns 10. The fix is `dayjs.utc()` or `getUTCDate()`. Trivial. *Per location*.

But that's the trap. The same bug had to be fixed in the dashboard, the client detail page, the CSV export, the calendar logic, and the invoice tracker. Each one was independently written by a different code path; each one had quietly assumed local timezone parsing. We fixed it one component at a time, each commit feeling like the last one, until the fifth one finally was.

**Lesson.** "Store the data once, parse it everywhere" is a leaky abstraction. The moment you write the second timezone-aware parse, write the utility function — `parseUTCDate(s)` — and stop trusting your future self to remember. We *should* have written that helper after fix number two.

### Story 2: CERCONE EXTERIOR RESTORATION ORP

The NYC Open Data API splits company names into `respondent_first_name` and `respondent_last_name`. You'd think a company like "CERCONE EXTERIOR RESTORATION CORP" would land entirely in `last_name`. You'd be wrong. Sometimes — for reasons that remain a mystery to anyone outside Socrata's QA team — the API returns:

```
respondent_first_name: "ORP"
respondent_last_name:  "CERCONE EXTERIOR RESTORATION C"
```

The "CORP" got truncated and split. The first three characters of "ORP" went into `first_name`, the remainder into `last_name`. If you concatenate `firstName + lastName`, you get "ORP CERCONE EXTERIOR RESTORATION C" — which doesn't match any client in our database, so the summons gets dropped, and Arthur misses a hearing.

Over a couple of months, we discovered seven distinct flavors of NYC API weirdness:

1. **Apostrophes**: "MARSALA'S MAIL" vs "MARSALAS MAIL"
2. **Ampersands**: "J & M BROTHERS" vs "J M BROTHERS"
3. **Suffix truncation**: the CERCONE case above
4. **Plate truncation** in the `violation_details` field — `"XDL"` instead of `"XDLR87"`
5. **Pagination cap**: large clients silently lost everything past the first 500 rows
6. **Wrong violation types**: early sweeps grabbed PERMITS, ELECTRICAL, every code
7. **Pre-2022 historical noise**: 1988 violations getting ingested and polluting reports

The fix grew into the four-strategy matcher in `dailySweep/src/index.js:1390-1465`:

```javascript
function matchRespondentToClient(firstName, lastName, clientNameMap) {
  const fullName = `${firstName} ${lastName}`.trim();
  if (!fullName) return null;

  // Strategy 1: Direct match with full name
  const normalizedFull = normalizeCompanyName(fullName);
  let match = clientNameMap.get(normalizedFull);
  if (match) return match;

  // Strategy 2: Suffix Fragment fix — "ORP" looks like a truncated CORP
  if (firstName && looksLikeSuffixFragment(firstName) && lastName) {
    match = clientNameMap.get(normalizeCompanyName(lastName));
    if (match) return match;
  }

  // Strategy 3: Partial word match — "SPRAGUE OPERATING" ⊂ "SPRAGUE OPERATING RESOURCES"
  // Strategy 4: lastName-only fallback for severe splits
  // ...
}
```

And the `SUFFIX_FRAGMENTS` array is exactly what it looks like — a hardcoded list of likely truncation tails (`['llc','inc','corp','co','ltd','orp','rp','p','nc','c','lc','l','td','d']`) plus a "if it's three characters or less, treat it as suspicious" fallback.

**Lesson.** External APIs are not contracts. They are moving targets that occasionally produce values nobody at the source ever intended. Defensive parsing isn't paranoia, it's table stakes. The other half of the lesson is to *test against real production names* — "MARSALA'S MAIL SERVICE", "HUB TRUCK RENTAL", "CERCONE EXTERIOR RESTORATION CORP" — not made-up "Acme Corp" data. Real data is where the bugs live.

### Story 3: The Checkbox That Did Nothing

The "Add Summonses to Invoice" dialog has a table of selectable rows. Each row has a checkbox; the dialog has an "Add N to Invoice" button that updates as you tick rows. Except it didn't. Click the checkbox, nothing happens. Click again, still nothing. The button stayed grey, the count stayed zero, the user stared at the screen.

The bug was as classic as it gets in MUI tables. The `<TableRow>` had an `onClick` handler that toggled selection. The `<Checkbox>` inside had its own `onChange` handler that *also* toggled selection. When you clicked the checkbox, the click event bubbled up to the row, both handlers fired, and the two toggles canceled each other. Net change: zero.

The fix is one line:

```jsx
<Checkbox
  checked={isSelected}
  onChange={() => toggle(row.id)}
  onClick={(e) => e.stopPropagation()}
/>
```

**Lesson.** Any time you put an interactive element inside a clickable container, you have to think about event bubbling. The same trap exists with `<Link>` inside `<Card>`, `<Button>` inside `<TableRow>`, anything-clickable inside anything-else-clickable. If the parent does anything onClick, stop the propagation explicitly, every time.

### Story 4: The Field That Wouldn't Save

The DEP File Creation Date field on the summons modal had a special charm: enter a value, save it, see it persist correctly. Reload the page. The field is empty. Look at DynamoDB directly — the value is right there. The frontend just refuses to read it.

The field is an `AWSJSON` type, which AppSync stores as a JSON-encoded string in DynamoDB. When AppSync returns it to the frontend, in Amplify v6 it can come back in any of three formats:

1. A pre-parsed JavaScript object: `{ timestamp: 1234567890 }`
2. A JSON-stringified string: `'{"timestamp": 1234567890}'`
3. A *double*-stringified string: `'"{\\"timestamp\\": 1234567890}"'`

The original code did `typeof raw === 'string' ? JSON.parse(raw) : raw`. Format 3 fails this — one `JSON.parse()` returns another string, not the object you wanted, and your code silently shows nothing. The fix is a recursive parser that keeps unwrapping until the result is no longer a string:

```typescript
function parseAWSJSON<T>(raw: unknown): T | null {
  let v = raw;
  while (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return null; }
  }
  return v as T;
}
```

**Lesson.** When a layer of your stack auto-serializes data, audit *every possible return shape*. AWSJSON's three-format chaos is well-documented in retrospect, undocumented in the moment. The general rule: never trust that a deserialized payload is in the form you expect — assert it.

### Story 5: The 900-Second Lambda

Sometime after the client list grew past about thirty, the dailySweep Lambda started timing out. Just stopping at 900 seconds (15 minutes — Lambda's hard ceiling) and marking the sync as failed. The frontend's SyncStatus badge would go red for the day.

The temptation when a Lambda times out is to assume something dramatic — Gemini's slow today, the NYC API is sluggish. The actual cause was almost insultingly simple. Inside the main loop, for every summons returned by the NYC API, the code did:

```javascript
const existing = await ddb.get({ TableName: SUMMONS_TABLE, Key: { id } }).promise();
if (existing.Item) { /* update */ } else { /* create */ }
```

About 3,600 incoming summonses per day. About 3,600 individual DynamoDB `GetItem` calls. Each one trivial; cumulatively, hundreds of seconds of network time.

The fix was four lines: do *one* full-table scan up front, build an in-memory `Map<id, Item>`, and look up locally:

```javascript
const existingMap = new Map();
const scan = await ddb.scan({ TableName: SUMMONS_TABLE }).promise();
scan.Items.forEach(i => existingMap.set(i.id, i));
// ...later, inside the loop:
const existing = existingMap.get(id);
```

900+ seconds → 66 seconds.

**Lesson.** When a Lambda mysteriously times out, your first instinct should not be "the external API got slow." It should be "how many database queries am I making in a loop?" N+1 is the most common cause of serverless timeouts, and the fix is almost always to pre-load into a hash map. The boring fix is the right fix.

### Story 6: The 77 Phantom Records

In the very first weeks, Arthur opened the dashboard and saw seventy-seven summonses he didn't recognize. PERMITS violations from 2017. ELECTRICAL violations from 2019. A 1988 record from a company that hadn't existed in twenty-five years. Where had they come from?

The early sweep had been cheerfully ingesting *every* violation type for matched clients, with no date filter. The fix added two `AND` clauses to the SoQL query:

```sql
AND (upper(charge_1_code_description) LIKE '%IDLING%'
     OR upper(charge_2_code_description) LIKE '%IDLING%')
AND hearing_date >= '2022-01-01T00:00:00'
```

**Lesson.** Filter at ingestion, not at display. If something doesn't belong in your system, *don't put it in your system*. Filtering downstream means every consumer of the data — dashboards, exports, reports, audit logs — has to remember to re-filter, and one of them eventually won't.

---

## 6. The Two Pivots That Mattered

Most commits are incremental. A few change the shape of the system. Two stand out.

### Pivot 1: The Two-Phase Sweep

The original sweep was a single linear pass: fetch from NYC, match clients, OCR every PDF, write everything. As the database grew past a couple thousand records, OCR alone (at ~2 seconds per PDF with throttling) started threatening the 15-minute Lambda ceiling. We were one busy day away from missing the entire sync.

The redesign split the sweep into two phases:

- **Phase 1: Metadata sync.** Fetch all summonses, match clients, update hearing dates / statuses / amounts. No OCR. Completes in roughly 60 seconds even on the busiest day.
- **Phase 2: Tiered OCR queue.** Up to 500 records per day, scored by `calculateTieredPriorityScore()`. Hearings within 7 days get score 0–70 (highest priority). 8–30 days: 100–130. 31–90: 200–260. 90+: 300–399. Already archived: 400+. Bonuses for new records (-20) and high-balance cases (-10). Penalties for previous failures (+50 per failure) so retry storms can't dominate the queue.

```javascript
if (daysUntilHearing >= 0 && daysUntilHearing <= 7) {
  baseScore = daysUntilHearing * 10;        // TIER 1: CRITICAL
} else if (daysUntilHearing > 7 && daysUntilHearing <= 30) {
  baseScore = 100 + (daysUntilHearing - 7); // TIER 2: URGENT
} // ... etc
```

The decoupling means even on a day when the OCR pipeline is slow, the *metadata* — hearing dates, statuses, amount changes — always lands. Arthur never misses a rescheduling because Gemini was rate-limited.

**Lesson.** When a single pipeline does both fast and slow work, separate them. Pay the metadata cost on every run; defer the expensive work behind a priority queue. This pattern works for data ingestion, image processing, ML inference — any place where one component can dominate the runtime.

### Pivot 2: From Notes to Threaded Comments

Early on, every summons had a single `notes` text field. Free-form, single-author, no history. It worked when there was one user. It stopped working the moment the firm had three.

The refactor replaced `notes` with `notes_comments` — an `AWSJSON` array of objects, each with author (pulled from Cognito), timestamp, body, and a deletion flag (only the author can delete their own). Critical operational fields (`internal_status`, `evidence_reviewed`, the DEP file date) gained a parallel `_attr` field carrying `{ setBy, setAt }` so you can hover the value and see "set by Jacky on March 14."

This wasn't a performance change. It was a *trust* change. The team needed to be able to look at the system and know who'd done what. Without that, every summons becomes a small mystery: did anyone look at this? Has Jelly already requested the evidence, or is that mine to do? An audit trail in the data model removes the ambiguity, full stop.

**Lesson.** The moment a system is shared by more than one human, attribution becomes a feature, not metadata. Build it in early — bolting it on later means re-architecting writes, retrofitting history, and convincing humans to fill in the gaps that the code didn't capture.

---

## 7. Patterns Worth Stealing

Five small techniques, each appearing in multiple places, each one worth lifting into your next project.

**Graceful degradation around optional features.** Every place the frontend calls a query that depends on a recently-deployed schema field, it's wrapped:

```typescript
try {
  const result = await client.graphql({ query: getClientWithPlateFilter, ... });
  filtered = applyPlateFilter(all, result.data.getClient);
} catch (err) {
  console.warn('Plate filter skipped (schema not yet deployed):', err);
  filtered = all;
}
```

This means deploying schema changes never bricks the live app — features disappear quietly until the backend catches up.

**Singleton "GLOBAL" rows as job-status APIs.** The `SyncStatus` model has exactly one row, `id="GLOBAL"`. The Lambda updates it; the frontend polls it. No queues, no Step Functions, no separate observability service. For a small app, this is genuinely all you need.

**Capping unbounded growth before it bites.** `activity_log` is capped at 100 entries. `MAX_FETCHES = 50` in the frontend pagination loop (50 × 1000 = 50k records max). `MAX_OCR_FAILURES = 3` per record. These are guardrails for the things you don't notice until they break — DynamoDB's 400KB item limit, a rogue cursor that won't terminate, a poison-message OCR retry storm.

**Per-request `AbortController` instead of a global timeout.** When you parallelize external API calls, *one* slow request can stall the whole batch. A 30-second per-request timeout means the batch finishes even if one hangs.

**Ephemeral overrides on join rows.** The `InvoiceSummons` row carries `legal_fee`, `amount_due`, `status` — fields that *also* exist on the parent `Summons` row. This is intentional. Invoicing a summons doesn't mutate the source; it stamps a snapshot onto the join. The same summons can appear on three different invoices with three different "amount due" values, each correct in its own context.

---

## 8. How a Good Engineer Thinks About This Stuff

If you take three habits away from this project, take these.

**Reach for the boring fix first.** Of every bug in this codebase, the most impactful one (the 900-second Lambda timeout) was solved by replacing 3,600 database queries with one `Map`. Not a clever cache, not a Redis cluster, not a queue redesign. A `Map`. When something is slow, count what you're doing. The answer is almost always "more times than you thought."

**Treat external APIs as adversarial inputs.** Not literally adversarial — Socrata is not out to get you — but operationally adversarial. They will return empty strings where you expect numbers, truncate values silently, split fields in ways their docs don't mention, and change behavior without telling you. Validate every field. Use real production names in your tests. Assume any field can be `null` or wrong-shaped, especially the ones you're about to act on.

**The third time you fix the same kind of bug, write the utility.** Twice is bad luck. Three times is a pattern. The fourth fix should be a one-line PR that calls the helper, not a copy-paste of the same parsing logic. Our timezone bug fired five times before we admitted that "use UTC parsing methods" was not a sufficient solution for the problem of "humans forget to use UTC parsing methods."

A few minor habits, while we're here:

- **Audit logs are a feature, not metadata.** If three people share a system, attribution earns its keep within a week.
- **Filter at ingestion.** Don't put data into your system you don't intend to use. Every downstream consumer has to remember to re-filter, and one will forget.
- **Cap unbounded growth before it bites.** Activity logs, fetch loops, retry counts — every "this can grow indefinitely" deserves a cap from day one.
- **Test against real names, not Acme Corp.** "MARSALA'S MAIL SERVICE" finds bugs that "Test User" never will.
- **When in doubt, write the prompt explicitly.** The Gemini prompt in `dataExtractor/src/index.js:281-301` is verbose because every line of "do this, NOT that" was earned by a real misextraction. Verbose prompts are cheaper than wrong data.

---

## 9. What's Next

The honest list of what this codebase still needs:

- **Amplify Gen 1 → Gen 2 migration** before May 1, 2027. The Gen 1 backend went into maintenance mode May 1, 2026 (just feature freeze, the app keeps running) and reaches end-of-life one year later. Plan to migrate during a feature lull, in a parallel Gen 2 stack with imported Cognito user pool and DynamoDB tables, then cut the frontend over.
- **A real test suite.** There's a `vitest` config in `package.json` and essentially no tests. The matcher in `dailySweep/src/index.js:1390-1465` deserves a hundred-case fixture file of real production names, and the `parseAWSJSON` recursive parser deserves a happy/sad-path unit. Both would have prevented bugs we shipped.
- **A `parseUTCDate()` utility used everywhere date strings are touched.** The bug will fire a sixth time otherwise.
- **Typed GraphQL responses.** Right now several `client.graphql({...})` calls return `any` and we cast. Amplify CLI codegen would close this gap.
- **A `FilterType` enum** to replace the magic strings (`'critical'`, `'approaching'`, `'evidence_pending'`) scattered through `Dashboard.tsx`.

None of these are emergencies. All of them would make the codebase calmer to work in.

---

## Closing

This system started as a way to spare Arthur from a tedious manual workflow. Five months later, it's about three thousand lines of frontend, two thousand lines of Lambda, a careful GraphQL schema, and a small pile of hard-won lessons about external APIs, timezones, event bubbling, and the discipline of fixing things at the layer where the bug actually lives.

The thing worth internalizing isn't any specific decision — those will all rot eventually as Amplify changes, Gemini changes, NYC's API changes. The thing worth internalizing is the *posture*: ship the boring fix, defend against external chaos, make trust between humans visible in the data, and when you find yourself fixing the same bug a third time, stop and write the helper.

That's the project, told as a story. Now go open `dailySweep/src/index.js` and read `matchRespondentToClient` from the top.
