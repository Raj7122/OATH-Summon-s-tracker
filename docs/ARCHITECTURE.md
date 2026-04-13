# The NYC OATH Summons Tracker: A Field Guide

*Or: how a small law office stopped drowning in spreadsheets, and what we learned building the boat.*

---

## 1. The Problem, Honestly

Imagine your job is to defend companies against NYC idling tickets. Every morning, you open a spreadsheet the city publishes, scroll through thousands of rows, and try to spot the ones that belong to *your* clients — not the ones belonging to some other trucking company with a suspiciously similar name. Miss one, and your client gets hit with a default judgment because nobody showed up to the hearing.

That was Arthur's life. And Jackie's. And Jelly's. Three humans, one city, an infinite scroll of violations, and no forgiveness for a bad morning.

This project exists because a computer should be doing that scrolling.

The goal was never "build an impressive web app." It was "make sure no client ever misses a hearing because we didn't see the summons in time." Everything you're about to read — the two-phase sweep, the priority scoring, the self-healing OCR, the weirdly specific calendar dashboard — traces back to that one sentence.

Keep that in mind. Architecture without a reason is just decoration.

---

## 2. The 10,000-Foot View

Here's the whole system on one napkin:

```
┌────────────────────┐        ┌──────────────────────┐
│  NYC Open Data API │        │  NYC Idling Portal   │
│  (OATH summonses)  │        │  (evidence videos)   │
└─────────┬──────────┘        └──────────┬───────────┘
          │                              │
          │ daily 6am UTC                │ on-demand
          ▼                              ▼
     ┌────────────────────────────────────────┐
     │         EventBridge (cron)             │
     │              ↓                          │
     │     Lambda: dailySweep                  │
     │       ├─ Phase 1: metadata sync        │
     │       └─ Phase 2: enqueue OCR          │
     │              ↓                          │
     │     Lambda: dataExtractor ──► Gemini   │
     │              ↓                          │
     │         DynamoDB (via Amplify)          │
     └────────────────────┬───────────────────┘
                          │ GraphQL
                          ▼
                  ┌──────────────────┐
                  │ AppSync + Cognito│
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │  React SPA (MUI) │
                  │  Arthur's laptop │
                  └──────────────────┘
```

Think of it like a nervous system. The Lambdas are reflexes — they fire on schedules you don't have to think about. DynamoDB is long-term memory. AppSync is the spinal cord. The React app is the conscious brain that Arthur pokes at while drinking his coffee.

If you're used to traditional server architectures, the thing to internalize is: **there is no server**. There's no box somewhere running Express. Every request is a little function that wakes up, does its job, and goes back to sleep. You pay for what you use. You don't pay when Arthur is asleep.

---

## 3. The Frontend: A React App Pretending To Be A Filing Cabinet

### The stack, in one breath

React 18 + TypeScript + Vite + Material UI v5 + AWS Amplify's JS client. No Redux. No Zustand. No "innovative" rendering framework that'll be abandoned next year.

*If that sounds boring, good. Boring is a feature.*

### Why MUI, and why MUI DataGrid specifically

You can write your own table component. You should not.

The DataGrid (`@mui/x-data-grid`) is the unsung hero of this entire project. It gives you sorting, filtering, column resizing, row selection, pagination, and CSV export for free. Every hour we didn't spend reimplementing `<th>` drag handles is an hour we spent on things only *this* product needs — like figuring out whether a summons belongs to "GC Warehouse" or "G.C. Whse Corp."

The lesson, which you'll hear from every engineer who's been burned once: **spend your complexity budget on the things that make your product unique, and buy the rest off the shelf.**

### The theme: why shadows actually matter

Open `src/theme.ts` (683 lines of MUI theme configuration) and you'll see something unusual for a law-office tool: it's designed. Soft shadows with 0.08–0.24 alpha values. Border radii of 12–16 pixels. A 24-depth shadow system.

This is the "Egret-inspired" look — modern SaaS dashboard aesthetic. Why do that for a tool three people use?

Because the people using it stare at it all day. Ugly tools breed tired eyes, and tired eyes miss hearings. Good visual design in an internal tool is not vanity; it's ergonomics.

### The routing map

```
/login                 → Cognito-backed sign in
/dashboard             → CalendarDashboard (the current main view)
/dashboard-legacy      → The old table-only dashboard (kept as a museum)
/clients               → Practice management, alphabetized
/clients/:id           → Deep dive on one client
/invoice-builder       → Cart → PDF/DOCX invoice
/account               → User settings
```

The `/dashboard-legacy` route is worth pausing on. We didn't delete the old dashboard when we built the new one. We kept it at a side route. Why? Because when you pivot UX, people need a lifeline back to the familiar while they warm up to the new hotness. And because sometimes the "old" version reveals a use case the "new" version accidentally broke.

*"Delete nothing on the day you replace it" is a pretty good rule.*

### The pivot: from table-centric to calendar-centric

Originally, the dashboard was one giant table. Every row a summons, every column a field, scroll forever. It worked. It was also wrong.

Arthur didn't need to see every summons. He needed to see **this week's hearings** so he wouldn't miss them. A table forces you to sort and scan; a calendar *shows* you the shape of the week at a glance.

So we built `src/components/CalendarCommandCenter.tsx` (999 lines) — a heatmap calendar with dots colored by urgency. It took the left 35% of the screen. The right 65% became `SimpleSummonsTable.tsx`, a slimmer version of the old grid. Same data, radically different gestalt.

That became `src/pages/CalendarDashboard.tsx` (1,618 lines) — the new `/dashboard`.

The lesson: **when your user's first question is "what do I need to worry about today," your UI should answer that question before they ask it.** Don't make them sort.

### State management: calm down

There's no Redux. There's `AuthContext` for the current user, and `InvoiceContext` for the invoice-building shopping cart. Everything else is local `useState` + whatever Amplify gives us. Cart persistence is plain `localStorage`.

Here's the thing nobody tells you about state management libraries: **they're a tax you pay on complexity, not a solution to it**. If your state isn't genuinely global and genuinely shared, Context + hooks is faster, simpler, and easier to debug. We added Context only where two unrelated components actually needed to see the same thing.

*Restraint is a skill. Practice it.*

---

## 4. The Backend: Serverless On A Budget

The entire backend is AWS Amplify Gen 1:

- **Cognito** for auth
- **AppSync** for GraphQL
- **DynamoDB** for storage (via Amplify `@model` directives)
- **Lambda** for compute
- **EventBridge** for scheduling
- **S3** for evidence file attachments

The schema lives in `amplify/backend/api/oathsummonstracker/schema.graphql`. It's only ~156 lines, but it's the most important 156 lines in the repo.

### The schema, the short version

Two real models: `Client` and `Summons`. One singleton: `SyncStatus`.

A `Client` has a name, some "also-known-as" aliases (critical — more on this later), contact info, and a one-to-many relationship to summonses.

A `Summons` has... 120 fields. No, really. It pulls ~30 fields from the NYC API (summons number, hearing date, license plate, base fine, amount due, status, etc.), another ~15 from OCR (license plate as read from the PDF, DEP complaint ID, violation narrative, idling duration, critical flags), another ~15 user-editable fields (notes, evidence checkboxes, internal status), plus audit metadata (`last_change_at`, `last_change_summary`, `activity_log`), plus ghost-detection fields (`api_miss_count`, `is_archived`).

The two most important characters in the schema are:

```graphql
@auth(rules: [{ allow: owner }])
```

This one directive is the entire security model. Cognito hands out tokens; AppSync rejects anything that doesn't match the record's owner. User A cannot see User B's clients. Full stop. No middleware to write, no SQL `WHERE owner_id = ?` to remember. Enforced at the API layer.

*If you've ever written auth by hand, you know how much that sentence is worth.*

### SyncStatus: the proof-of-life pattern

`SyncStatus` is a singleton record that tracks: when the last successful sync was, whether one is in progress, how many records it touched, whether the NYC API is currently reachable, and how many OCR requests we've spent today.

This sounds boring until it saves you. When something breaks at 3 AM — and it will — Arthur doesn't need to call an on-call engineer to ask "did the sweep run?" The header badge tells him.

Build the observability before you need it. You never regret it.

---

## 5. The Two-Phase Sweep: Where The Real Engineering Lives

The brain of the system is `amplify/backend/function/dailySweep/src/index.js` — 1,664 lines of "what happens at 6 AM UTC every day." It runs in two phases.

### Phase 1: metadata sync (cheap, unlimited)

Hit the NYC Open Data API (`https://data.cityofnewyork.us/resource/jz4z-kudi.json`), filter for `code_description` containing `IDLING`, violations from 2022 onward. For every registered client, run a query against the API using the client's name and their known AKAs.

Match the results to existing DB records by `summons_number`. New ones? Insert with `ocr_status = 'pending'`. Existing ones? Update `hearing_date`, `status`, `amount_due`, and bump `last_metadata_sync`. Missing from the API for three consecutive days? Archive it as a ghost.

This phase is "cheap" because NYC's API is free and unmetered. We can afford to fetch every matching record every day.

### Phase 2: OCR queue (expensive, rationed)

Now we need to actually *read* the PDFs — extract the license plate, the DEP complaint ID, the violation narrative, the idling duration. That's a vision-model call (Gemini 2.0-Flash). Those cost money. We set a daily quota of 500.

So which 500? You triage.

The priority scoring in `dailySweep` assigns tiers:

- **Tier 1 (score 0–99): CRITICAL** — hearing in under 7 days
- **Tier 2 (100–199): URGENT** — hearing in under 30 days
- **Tier 3 (200–299): STANDARD** — hearing 30–90 days out
- **Tier 4 (300–399): LOW** — hearing 90+ days out
- **Tier 5 (400+): ARCHIVE** — past hearings

Process the lowest-numbered tier first. Within a tier, sort by hearing date ascending.

Think ER triage. Gunshot wound jumps the line; broken toe waits. If we only get 500 OCR runs today, every one of them had better be for a hearing that's coming up soon.

The lesson here is worth underlining: **budget constraints make better architectures.** If Gemini had been free, we would have OCR'd everything indiscriminately and the system would be lazier for it. The 500/day cap *forced* us to build the priority queue, which made the product smarter.

*Scarcity is a good designer.*

---

## 6. The Extractor: Web Scraping Meets Vision AI

`amplify/backend/function/dataExtractor/src/index.js` (492 lines) does two things for each summons:

### Part A: scrape the video portal

NYC publishes idling evidence videos on a separate site. The date the video was created matters legally (it tells you how long it took the city to upload the evidence), but it's not in the API — only on an HTML page.

So we fetch the page with `node-fetch`, parse it with `cheerio` (think "jQuery for servers"), and pluck the "Video Created Date" off the DOM. Multiple selector patterns, fallbacks, because HTML is fragile and government HTML doubly so.

*If the scrape fails, we shrug and move on. The field is nice-to-have, not load-bearing.*

### Part B: OCR the PDF with Gemini

This is where it gets interesting. Each summons has a PDF. We fetch it, convert the buffer to base64, and hand it to `gemini-2.0-flash` with a structured extraction prompt asking for:

```json
{
  "license_plate_ocr": "...",
  "id_number": "YYYY-NNNNN (DEP complaint ID, NOT the summons number)",
  "vehicle_type_ocr": "...",
  "prior_offense_status": "first/repeat/unknown",
  "violation_narrative": "...",
  "idling_duration_ocr": "15 minutes",
  "critical_flags_ocr": ["refrigeration unit", "no driver present"],
  "name_on_summons_ocr": "..."
}
```

A parenthetical in a prompt might seem pedantic, but that "NOT the summons number" note in the `id_number` field? That saved us. Without it, Gemini would confidently return the 9-character summons number (which it sees in huge print at the top of the page) instead of the little 10-character DEP complaint ID buried in the corner.

We also added a regex validator: if Gemini returns something that doesn't match `/^\d{4}-\d{5,6}$/`, we reject it. You *cannot* trust a vision model to follow format instructions 100% of the time. Validate at the boundary.

### The immutability rule

Once a record has a non-empty `violation_narrative`, we never re-OCR it. Never. Because:

1. OCR costs money.
2. Re-running OCR on the same PDF can produce *different* results (vision models are non-deterministic) — and "different" includes "worse."
3. Users may have made decisions based on the first reading.

Immutability is a feature. Carve it into stone.

---

## 7. War Stories (Bugs That Taught Us Things)

Architecture docs usually skip this part. That's a mistake, because the bugs are where the real lessons live.

### The `[object Object]` Ghost (commit `a63ddeb`)

Threaded comments on a summons get stored in a field called `notes_comments`. The schema declares it as `AWSJSON`. We naively passed a JavaScript array of comment objects straight into the GraphQL mutation.

What arrived in DynamoDB: the literal string `"[object Object],[object Object]"`.

That's the DOM's `.toString()` on an array of objects. The Amplify client was stringifying our data with the wrong method because `AWSJSON` expects *already-stringified* JSON, not a live object.

The fix was one line: `JSON.stringify(comments)` at the call site, `JSON.parse(...)` on retrieval.

**Lesson:** serialize at the boundary, explicitly. Don't assume a client library will "just handle" it. When a field says JSON, give it a JSON string — not a JS object that happens to be JSON-shaped.

### The ECONNRESET Flood (commit `bc65562`)

OCR runs were failing in clumps. Lambda logs showed `ECONNRESET` and `socket hang up`. The NYC PDF endpoint was throttling us — or just being flaky under load.

The fix: `fetchWithRetry()` with exponential backoff (1s → 2s → 4s → 8s), plus bumping the inter-invocation throttle from 2 seconds to 5. And while we were at it, we switched from `gemini-2.5-flash-lite` to `gemini-2.0-flash`, which gave meaningfully better OCR accuracy on low-quality scans.

**Lesson:** in a Lambda that talks to the wider internet, retries with backoff aren't a nice-to-have. They're the price of admission. The internet is *hostile*, and "it works on my machine" is a lie your dev loop tells you.

### The Failure-Count Lie (commit `2ac1db6`)

`dataExtractor` has logic to skip records that are already complete (immutability, remember?). But the way it communicated this back to `dailySweep` was: return nothing special. And `dailySweep`, seeing no success signal, would increment `ocr_failure_count`.

After enough days, perfectly healthy records had `ocr_failure_count: 3` and got permanently blacklisted from future runs. For no reason.

The fix was a single return flag: `hasOCRData: true` on successful skips, so `dailySweep` could tell "didn't need to work" apart from "tried and failed."

**Lesson:** "no output" is an ambiguous signal. Make your state machine distinguish between *success*, *failure*, and *nothing-to-do*. Three states, not two.

### The NEW Tab That Lied

The dashboard has a "NEW" filter tab showing recently-added summonses. `isNewRecord()` compared `createdAt` against `updatedAt`. Whenever `dailySweep` refreshed a record's `amount_due`, the record appeared "new" again, even though it was weeks old.

Fix: check only `createdAt` against `now - 72 hours`.

**Lesson:** timestamps have *semantics*. `createdAt` means "the moment this came into existence." `updatedAt` means "the most recent time any field changed." They are not interchangeable, and conflating them produces bugs that look right until a user squints.

Later (commit `9dcde86`) we added `last_change_at` specifically for the "UPDATED" badge, because `updatedAt` was polluted by every sweep that merely confirmed the record still existed. When a generic field doesn't mean what you need, add a more specific one.

### The Name-Split Puzzle (commit `a323857`)

A client named "CERCONE EXTERIOR RESTORATION CORP" was missing summonses. We investigated and found the NYC API sometimes returns the respondent as `first_name: "ORP CERCONE EXTERIOR"`, `last_name: "RESTORATION C"`. The string had been chopped at an arbitrary character boundary and the halves had been assigned to fields without regard for meaning.

Fuzzy match on substrings? Too many false positives. Exact match? Misses real clients.

The solution: take the last few words of the respondent name and check if they appear as a fragment of any registered client name or AKA. "ORP CERCONE EXTERIOR" + "RESTORATION C" becomes a combined string; we slide a window across it and find that "CERCONE EXTERIOR RESTORATION" is contained, which matches our client.

**Lesson:** government APIs are not contract-stable. They are shaped by whatever bureaucratic import pipeline produced them, and that pipeline has no incentive to be consistent. Build matching that degrades gracefully. And document your client AKAs aggressively — commit `c1595f3` added a feature to *auto-suggest* AKAs based on NYC API patterns, which turns what used to be Arthur's guesswork into a nudge.

### The Stuck-Sync Flag (commit `155590a`)

`SyncStatus.sync_in_progress` is a boolean. Set to `true` when the sweep starts, `false` when it ends. One night, the Lambda crashed halfway through. The flag stayed `true`. The next day's scheduled run saw `sync_in_progress: true`, concluded "oh, it's still running, I'll skip," and skipped. And skipped again. For days.

Fix: treat `sync_in_progress: true` as stale if `last_successful_sync` is more than a reasonable-sweep-duration old. Auto-recover.

**Lesson:** stateful locks need timeouts. Always. A flag that can only be cleared by the same process that set it will eventually be held by a process that no longer exists, and your system will deadlock silently. Dead-man switches everywhere.

---

## 8. How Good Engineers Think (In The Wild)

If you want to take home *general* lessons from this codebase, here they are:

### Build observability before you need it

`SyncStatus` existed before any sync ever actually failed. We spent an hour making it and it paid back that hour the first time something went wrong in production. The rule is: every long-running background process needs a record somewhere that answers "did this happen, and did it work?" If you can't tell that from a table, you're flying blind.

### Boring choices compound

React. MUI. Amplify. DynamoDB. jsPDF. Cheerio. None of these are novel. All of them have years of documentation, Stack Overflow answers, and battle scars from other people's production incidents. A senior engineer reaches for the boring tool on purpose. The exotic tool costs you an education; the boring one costs you nothing.

*You want novelty in your product, not your stack.*

### Cost is a design constraint

The 500/day OCR cap shaped the priority queue, which shaped the tiered scoring, which shaped the "CRITICAL" badge in the UI, which shaped how Arthur uses the product. You can trace a straight line from an API pricing sheet to a pixel on the dashboard. Cost isn't a budgeting problem — it's an architectural input.

### Self-healing beats alerting

In `dataExtractor`, we built logic to detect orphaned records — ones where `ocr_status` never got set — and quietly re-enqueue them. We could have alerted a human. We chose the healer. If your system can recover from a class of failures on its own, do that instead of building a dashboard that pages someone.

Humans are expensive. Lambdas are cheap. Make the cheap thing do the boring work.

### Pure functions are tiny gifts

`src/utils/weekFilters.ts` is 66 lines. It does ISO 8601 week calculation and summons filtering. It has no React imports, no DOM imports, no Amplify imports. Which means you can test it in five lines of Vitest, reason about it without a browser, and use it from a Lambda tomorrow if you want.

When you find logic that doesn't need the UI, extract it. Your future self, debugging at 2 AM, will thank you.

### Attribution is a feature, not overhead

Every user-edited field in this system stores *who* changed it, *when*, and *what the previous value was* — in the `activity_log` JSON field on every summons. That sounds like compliance theater. It isn't. When Jackie says "I swear I marked evidence_received on that summons last Tuesday," the activity log tells you whether she did, at 3:14 PM, from her account. Arguments dissolve. Trust compounds.

For any multi-user tool, audit trails are worth the disk space ten times over.

---

## 9. Pitfalls To Avoid Next Time

A short list of landmines we stepped on so you don't have to:

- **Don't trust external API shape stability.** Wrap NYC's responses in a validator. One day they will change a field name without telling anyone. That day should be "annoying," not "five-alarm fire."
- **Watch for AWSJSON double-encoding.** If your DynamoDB field is `AWSJSON`, you must pass a *string*. If you pass an object, Amplify will stringify it for you — in a way you will not like. `JSON.stringify` at the call site every time.
- **Never re-OCR a good record.** Vision models are non-deterministic. Re-running them can *unimprove* your data.
- **Cron + Lambda + no logs = black hole.** Every scheduled Lambda must log its start and end with timestamps. If it doesn't, you will one day wonder if it's been running for the last month. (It wasn't.)
- **Keep codegen in CI.** Amplify's generated TypeScript types drift from the deployed schema if nobody regenerates them. A CI step that fails when they're stale is worth a week of weird runtime errors.
- **Don't mix up `updatedAt` and `last_change_at`.** One is "when the system touched this," the other is "when a human cared." You need both, and you need to name them carefully.
- **Stateful flags need timeouts.** If a boolean lock can only be cleared by the process that set it, one crash will deadlock your system indefinitely.

---

## 10. The New Kids (Technologies Worth Knowing)

If some of these were new to you, here's the rapid tour:

**Google Gemini Vision API.** Multimodal model — you hand it a PDF (or image, or audio, or video) and a text prompt, and it returns text. For structured extraction, you ask for JSON with a specific shape. It is *not* Tesseract; it doesn't do OCR in the classical "find letters, assemble words" sense. It reads the document the way you would — with context, layout awareness, and a general-knowledge prior. It's also non-deterministic, which is why we validate its output with regex and don't re-run it.

**AWS Amplify + AppSync + DataStore.** Amplify is the scaffolding; AppSync is the managed GraphQL layer; DataStore is the client-side cache with optional real-time subscriptions. You write a GraphQL schema with some directives (`@model`, `@auth`, `@hasMany`, `@index`) and Amplify provisions the entire backend — DynamoDB tables, resolvers, auth rules, indexes — from it. It is magic. It is also Gen 1 (Gen 2 exists now). When it works, you ship in a weekend; when it doesn't, you descend into CloudFormation, and that's a less fun weekend.

**Cheerio.** Server-side HTML parser with a jQuery-like API. You `load()` a string of HTML, then `$('selector')` your way to the data you want. Perfect for small scraping jobs. Not a browser, doesn't execute JavaScript — if the page renders client-side, cheerio sees nothing useful and you need a headless browser instead.

**jsPDF + docx.** PDF and Word document generation, respectively, from pure JavaScript — no server renderer, no LibreOffice. Both are plenty for structured documents (invoices, forms, reports). Neither is great for pixel-perfect designer-supplied layouts; if that's your need, render HTML and print-to-PDF with a headless browser instead.

**EventBridge Scheduler.** AWS's cron. You write a schedule expression (`cron(0 6 * * ? *)` — 6 AM UTC daily), point it at a Lambda, and forget about it. The scheduler will even retry for you if the target fails. Pair with CloudWatch Logs for debugging.

---

## 11. If You Remember Only Five Things

1. **Architecture starts with a single user's problem.** Everything in this codebase traces back to Arthur not wanting to miss hearings. When you're lost, go back to the user's sentence.
2. **Budget constraints build better products.** The OCR quota forced the priority queue, which made the product smarter. Scarcity is a designer.
3. **Observability first.** Build the `SyncStatus` before you need it. You will always, always need it.
4. **Boring tech compounds.** Exotic choices are a tax. Spend your weirdness budget on what makes your product unique, and nothing else.
5. **Validate at the boundary.** External APIs lie. Vision models hallucinate. User input is hostile. Regex, retry, and serialize explicitly — every time you cross from "their world" to "ours."

That's it. Go look at the code. The comments in `dailySweep/src/index.js` will make a lot more sense now.
