# Client Name Matching Guide

## Why Some Summonses May Not Appear

The NYC OATH Summons Tracker automatically finds summonses for your clients by matching the **Respondent Name** in the NYC database against the **Client Name** and **AKAs** you've entered. If a summons doesn't appear, it's usually because the name in the NYC system doesn't match any of your configured names.

---

## How Name Matching Works

### The Matching Process

1. The system searches the NYC Open Data API using your client names
2. When a summons is found, the **Respondent Name** is compared against:
   - Your client's **Primary Name**
   - All **AKAs (Also Known As)** you've added
3. The system normalizes names by:
   - Converting to lowercase
   - Removing common suffixes: `LLC`, `INC`, `CORP`, `CO`, `LTD`
   - Trimming extra spaces
4. **The match must be exact** (after normalization)

### What This Means

If your client is registered as `GC WAREHOUSE LLC` with an AKA of `GC WAREHOUSE`, the system will match:
- `GC WAREHOUSE LLC` ✅
- `GC WAREHOUSE` ✅
- `GC WAREHOUSE INC` ✅ (INC is stripped)
- `GCWAREHOUSE` ✅ (spaces are handled)

But it will **NOT** match:
- `GC WAREHOUSE BUILDING SUPPLIES` ❌ (different name)
- `G.C. WAREHOUSE` ❌ (periods not handled)
- `GC WAREHOUSE LLC DBA GC WAREHO` ❌ (truncated/DBA name)

---

## Why Names Don't Match: Common Reasons

### 1. NYC Truncates Long Names

The NYC system has character limits on name fields. A company registered as:
> `DAVID ROSEN BAKERY SUPPLIES INC`

May appear in OATH records as:
> `DAVID ROSEN BAKERY SUPPLIES IN` (truncated)

**Solution**: Add the truncated version as an AKA.

### 2. Multiple Business Names (DBAs)

Companies often operate under different names. The same company might appear as:
- `GC WAREHOUSE LLC`
- `GC WAREHOUSE BUILDING SUPPLIES`
- `GC WAREHOUSE LLC DBA GC WAREHOUSE BUILDING SUPPLIES`

**Solution**: Add each variation as a separate AKA.

### 3. Spelling Variations

Names may be entered differently:
- `CAMPBELL'S EXPRESS` vs `CAMPBELLS EXPRESS` (apostrophe)
- `AAA EGG DEPOT` vs `AAA EGGS DEPOT` (singular vs plural)
- `INTER-COUNTY BAKERS` vs `INTERCOUNTY BAKERS` (hyphen)

**Solution**: Add both spelling variations as AKAs.

### 4. Different Legal Entities

A parent company may have subsidiaries with similar but different names:
- `SPRAGUE OPERATING`
- `SPRAGUE ENERGY`
- `SPRAGUE OPERATING RESOURCES`
- `SPRAGUE ENERGY SOLUTIONS`

**Important**: Only add AKAs for companies you actually represent. Similar names might belong to different legal entities.

### 5. Inconsistent Data Entry by NYC

The same company may appear with different suffixes:
- `CREAM-O-LAND DAIRY`
- `CREAM-O-LAND DAIRY INC`
- `CREAM-O-LAND DAIRIES LLC`

**Solution**: Add all variations you've seen on actual summonses.

---

## How to Find the Correct AKAs

### Method 1: Check Existing Summonses

Look at summonses you've received in the past. The **Respondent Name** field shows exactly how NYC recorded the company name. Add that exact spelling as an AKA.

### Method 2: Search the NYC Open Data Portal

1. Go to: https://data.cityofnewyork.us/City-Government/OATH-Hearings-Division-Case-Status/jz4z-kudi
2. Click "Filter" and search for your client's name
3. Look at all the variations that appear in the `respondent_last_name` column
4. Add relevant variations as AKAs

### Method 3: Check the PDF Summons

The actual summons PDF shows the name as it was written by the officer. This is the source of truth for how the company name was recorded.

---

## Best Practices for Adding AKAs

### DO:
- Add the exact name as it appears on summonses you've received
- Include truncated versions of long names
- Add variations with and without punctuation (hyphens, apostrophes)
- Add common misspellings you've seen on actual documents
- Include DBA names if they're for the same legal entity

### DON'T:
- Add names of companies you don't represent
- Add generic partial names that could match other companies
- Assume similar names are the same company without verification

---

## Example: Setting Up a Client

**Scenario**: You represent "David Rosen Bakery Supplies Inc."

After checking past summonses and the NYC database, you find these variations:

| Variation Found | Should Add as AKA? |
|----------------|-------------------|
| `DAVID ROSEN BAKERY SUPPLIES IN` | Yes - truncated version |
| `DAVID ROSEN BAKERY SUPPLIES INC` | Yes - full legal name |
| `DAVID ROSEN BAKERY SUPPLY` | Yes - if same company |
| `DAVID ROSEN BAKERY` | Yes - if same company |
| `DAVID ROSEN COMPANY` | Maybe - verify it's the same entity |
| `ROSEN BAKERY` | No - too generic, could match others |

**Client Configuration**:
- **Name**: `D.ROSEN BAKERY`
- **AKAs**:
  - `DAVID ROSEN BAKERY SUPPLIES`
  - `DAVID ROSEN BAKERY SUPPLIES IN`
  - `DAVID ROSEN BAKERY SUPPLY`
  - `DAVID ROSEN BAKERY`

---

## Troubleshooting

### "I know my client has summonses but they're not showing up"

1. Check the NYC Open Data portal directly for the company name
2. Note the exact spelling of `respondent_last_name`
3. Add that exact spelling as an AKA in your client configuration
4. Wait for the next daily sync (runs once per day)

### "I added an AKA but summonses still aren't appearing"

1. Verify the AKA matches **exactly** (character for character)
2. Check that the summons is for an **IDLING** violation (other violation types are filtered out)
3. Wait 24 hours for the daily sync to run

### "I'm seeing summonses for a different company with a similar name"

This shouldn't happen if you're using exact matching. If it does:
1. Remove the overly broad AKA
2. Use more specific AKAs that only match your client

---

## Summary

The system uses **exact matching** (after normalization) to ensure you only see summonses for your actual clients. This prevents false positives from similarly-named companies.

The trade-off is that you need to configure all the name variations your clients use. Take time to:
1. Research how your clients' names appear in NYC records
2. Add all legitimate variations as AKAs
3. Periodically check for new variations on incoming summonses

When in doubt, check the actual summons document or the NYC Open Data portal to see exactly how a name is recorded.
