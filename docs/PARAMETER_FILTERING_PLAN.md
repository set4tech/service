# Parameter-Based Check Filtering

## Overview

Filter seeded checks (~5K) against project parameters using GPT-4o-mini to exclude non-applicable sections.

## User Flow

1. User enters project parameters in Project Settings tab
2. User clicks "Filter Checks by Parameters" button
3. System processes checks in batches of 20
4. Progress shown: "Evaluating... 450/5000 (23 excluded)"
5. Excluded checks hidden from CheckList by default
6. User can toggle "Show excluded" to see them
7. User can re-run filter if parameters change (resets exclusions first)

## Database Changes

```sql
-- Migration: add_filtering_status_to_assessments.sql
ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS filtering_status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS filtering_checks_processed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filtering_checks_total INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filtering_excluded_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS filtering_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS filtering_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS filtering_error TEXT;

-- Values for filtering_status: 'pending', 'in_progress', 'completed', 'failed'
```

Note: `checks.is_excluded` field already exists.

## API Endpoints

### POST /api/assessments/[id]/filter-checks

Starts the filtering process. Runs synchronously but streams progress.

```typescript
// Request (optional body):
{ "reset": true }  // If true, clear existing exclusions first

// Response:
{
  "status": "started",
  "total_checks": 5234,
  "message": "Filtering started"
}
```

### GET /api/assessments/[id]/status

Extend existing endpoint to include filtering status:

```typescript
{
  "seeding_status": "completed",
  // ... existing fields ...
  "filtering_status": "in_progress",
  "filtering_checks_processed": 1200,
  "filtering_checks_total": 5234,
  "filtering_excluded_count": 312
}
```

## LLM Integration

### Model: GPT-4o-mini

- Cheap: ~$0.15/1M input, $0.60/1M output
- Fast: Good for batch processing
- Reliable: Structured JSON output

### Batch Size: 20 checks

- Small enough to avoid token limits
- Reduces blast radius if one batch fails
- ~260 API calls for 5K checks

### Prompt Template

```
You evaluate building code sections for applicability to a specific project.

PROJECT PARAMETERS:
{{#each parameters}}
- {{key}}: {{value}}
{{/each}}

Evaluate each section. Return JSON with "exclude": true if the section should be EXCLUDED because:
- References elements not in this project (parking, elevators, ramps, etc.)
- Applies to different building/occupancy types
- For work types not applicable to this project
- Requirements physically impossible given project parameters

SECTIONS:
{{#each checks}}
{{index}}. [{{id}}] {{number}} - {{title}}
{{/each}}

Respond ONLY with valid JSON:
{"results":[{"id":"...","exclude":true/false},...]}
```

## UI Changes

### ProjectPanel.tsx

Add filtering section below variable accordions:

```tsx
{
  /* Filtering Section */
}
<div className="border-t pt-4 mt-4">
  <div className="flex items-center justify-between mb-2">
    <h3 className="text-sm font-medium text-gray-700">Check Filtering</h3>
    {filteringStatus === 'completed' && (
      <span className="text-xs text-gray-500">{excludedCount} excluded</span>
    )}
  </div>

  {filteringStatus === 'in_progress' ? (
    <div className="space-y-2">
      <ProgressBar value={processed} max={total} />
      <p className="text-xs text-gray-500">
        {processed}/{total} evaluated ({excludedCount} excluded)
      </p>
    </div>
  ) : (
    <button onClick={startFiltering} className="...">
      {filteringStatus === 'completed' ? 'Re-filter Checks' : 'Filter Checks by Parameters'}
    </button>
  )}
</div>;
```

### CheckList.tsx

Add toggle to show/hide excluded checks:

```tsx
// Add to filter controls
<label className="flex items-center gap-2 text-xs">
  <input type="checkbox" checked={showExcluded} onChange={e => setShowExcluded(e.target.checked)} />
  Show excluded ({excludedCount})
</label>;

// Filter checks in display
const visibleChecks = showExcluded ? checks : checks.filter(c => !c.is_excluded);
```

## Implementation Steps

1. **Database migration** - Add filtering columns to assessments
2. **API: filter-checks** - Create POST endpoint with batch processing
3. **API: status** - Extend to include filtering status
4. **OpenAI integration** - Add GPT-4o-mini call function
5. **ProjectPanel UI** - Add button and progress display
6. **CheckList UI** - Add excluded filter toggle
7. **Testing** - Test with real assessment

## Cost Estimate

- 5K checks / 20 per batch = 250 API calls
- ~500 tokens input per batch, ~100 tokens output
- Total: ~125K input + ~25K output tokens
- **Cost per run: ~$0.03**

## File Locations

- Migration: `supabase/migrations/YYYYMMDD_add_filtering_status.sql`
- API: `app/api/assessments/[id]/filter-checks/route.ts`
- OpenAI call: `lib/ai/openai.ts` (add filterChecks function)
- UI: `components/project/ProjectPanel.tsx`
- CheckList: `components/assessment/CheckList.tsx`
