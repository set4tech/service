# Human-Readable Violation Titles Implementation

## Overview

This feature replaces technical violation titles like:
```
ICC:CBC_Chapter11A_11B:2025:CA:11B-202.4 - The provided evidence is limit...
```

With natural language titles like:
```
Latchside clearance too small
Bathroom door too narrow
Ramp slope exceeds maximum
```

## Files Created/Modified

### 1. Database Migration
**File**: `supabase/migrations/20251010_add_human_readable_title.sql`
- Adds `human_readable_title TEXT` column to `checks` table
- Nullable to allow gradual backfill

### 2. Title Generation Utility
**File**: `lib/ai/generate-title.ts`
- `generateViolationTitle()` function using GPT-4o-mini
- Inputs: code section, analysis, element type, section text
- Outputs: ~60 character natural language title
- Includes fallback logic if generation fails

### 3. API Endpoint
**File**: `app/api/checks/[id]/generate-title/route.ts`
- POST endpoint: `/api/checks/:id/generate-title`
- Fetches check data + latest analysis
- Calls `generateViolationTitle()`
- Updates database with generated title
- Returns generated title

### 4. Type Updates
**File**: `lib/reports/get-violations.ts`
- Added `humanReadableTitle?: string` to `ViolationMarker` interface
- Updated SQL query to include `human_readable_title` column
- Maps field to violation markers in both code paths (with/without screenshots)

### 5. UI Updates
**File**: `components/reports/ViolationListSidebar.tsx`
- Updated `formatViolationDescription()` to prioritize `humanReadableTitle`
- Shows human title as primary text
- Falls back to technical title if `humanReadableTitle` is null

### 6. Batch Generation Script
**File**: `scripts/generate-violation-titles.mjs`
- Backfills titles for all existing violations
- Queries checks with violations that lack titles
- Batch generates titles with rate limiting (200ms between requests)
- Supports `--dry-run` and `--limit=N` flags

## Usage

### Run Database Migration

```bash
# Apply migration to add column
# (Supabase will auto-detect and run migrations on next deploy)
```

### Generate Titles for Existing Violations

```bash
# Dry run (preview without saving)
node scripts/generate-violation-titles.mjs --dry-run

# Process first 10 violations (testing)
node scripts/generate-violation-titles.mjs --limit=10

# Process all violations
node scripts/generate-violation-titles.mjs
```

### Generate Title for a Single Check

```bash
curl -X POST http://localhost:3000/api/checks/CHECK_ID/generate-title
```

## How It Works

### 1. Data Flow
1. User views customer report
2. `get-violations.ts` fetches violations including `human_readable_title`
3. `ViolationListSidebar` displays human title if available
4. Falls back to technical title if not

### 2. Title Generation Process
1. Check data fetched (section, analysis, element type)
2. Context built for LLM prompt
3. GPT-4o-mini generates natural language title
4. Title validated (max 80 chars)
5. Saved to `checks.human_readable_title`

### 3. Prompt Engineering
The LLM is given:
- Code section number
- Section text (truncated to 500 chars)
- AI analysis reasoning (truncated to 300 chars)
- Element type (e.g., "Door", "Ramp")
- Check name

And instructed to:
- Use plain, non-technical language
- Be specific about the problem
- Keep under 60 characters
- Avoid jargon and code section numbers

## Examples

### Input (Technical)
```
Code Section: 11B-404.2.6
Element: Doors
Analysis: The latch-side clearance measures 15 inches, which is
below the required 18 inches minimum for a forward approach.
```

### Output (Human-Readable)
```
Latchside clearance too small
```

---

### Input (Technical)
```
Code Section: 11B-405.2
Element: Ramps
Analysis: The ramp slope measures 1:10, exceeding the maximum
allowable slope of 1:12.
```

### Output (Human-Readable)
```
Ramp slope exceeds maximum
```

## Benefits

1. **User-Friendly**: Non-technical audiences can understand violations immediately
2. **Consistent**: All violations have clear, actionable titles
3. **Fast UI**: Titles pre-generated and cached in database
4. **Cost-Effective**: GPT-4o-mini is cheap (~$0.15 per 1M input tokens)
5. **Fallback Support**: Always shows technical title if generation fails

## Future Enhancements

1. **Auto-generation on violation creation**: Generate titles when AI analysis completes
2. **Manual editing**: Allow users to override AI-generated titles
3. **Multi-language support**: Generate titles in Spanish, Chinese, etc.
4. **Category-based templates**: Pre-defined templates for common violation types
