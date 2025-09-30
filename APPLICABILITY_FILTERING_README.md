# CBC 11A/11B Applicability Filtering

This implementation provides deterministic, conservative filtering for California Building Code Chapters 11A and 11B with full audit trail and explainability.

## Architecture

### 1. Database Schema (`supabase/migrations/20250930_applicability.sql`)

**Applicability metadata columns on `sections` table:**
- `chapter` - '11A' or '11B' (denormalized from section number)
- `always_include` - TRUE for scoping/definitions/admin sections
- `applicable_occupancies` - Array like `['A','B','E']`, NULL = no restriction
- `requires_parking` - TRUE = only applies if site has parking
- `requires_elevator` - TRUE = only applies if elevator required
- `min_building_size` / `max_building_size` - Per-story gross SF thresholds
- `applicable_work_types` - Work type strings matching project variables
- `applicable_facility_categories` - Facility category strings
- `applicability_notes` - Maintainer documentation

**Audit log table `section_applicability_log`:**
- Captures ALL decisions (included AND excluded)
- Full explanations with dimension-by-dimension evaluation
- Stable hash of variables for deduplication
- Supports both 'rule' (deterministic) and 'ai' (LLM-based) decision sources

**PostgreSQL RPC function `filter_sections_explain`:**
- Single database call performs all filtering
- Conservative: unknowns default to inclusion
- Returns sections with `include` boolean, `reasons` array, and detailed `explain` object

### 2. Variable Normalization (`lib/variables.ts`)

**`normalizeVariables(extracted)`:**
- Extracts and normalizes building characteristics from project variables
- Handles missing/malformed data gracefully
- Derives elevator exemption from `≤3 stories OR ≤3000 sf/story` when not explicit

**`resolveChapters(normalized)`:**
- Determines whether to include 11A and/or 11B
- 11A: residential occupancy (R), multifamily housing (FHA), or mixed use
- 11B: non-residential, Title II/III, or mixed use
- Conservative: includes both when unknown

**`variablesHash(normalized)`:**
- SHA256 hash of normalized variables for caching/deduplication

### 3. Seed Endpoint (`app/api/assessments/[id]/seed/route.ts`)

**Flow:**
1. Load assessment + project + extracted_variables + selected_code_ids
2. Normalize variables and resolve chapters
3. Call `filter_sections_explain` RPC with normalized data
4. Create checks for included sections
5. Write audit log for ALL sections (included + excluded) with reasons
6. Update assessment total_sections count

## Design Invariants

✅ **Conservative filtering**: Unknown/missing variables → include section
✅ **CBC 11A/11B only**: Scope limited to California accessibility chapters
✅ **Leaf-level applicability**: Decisions at section level, not parent hierarchy
✅ **Mixed-use union**: Treat as union of all occupancies (include broadly)
✅ **Audit trail**: Every decision logged with human-readable reasons
✅ **Deterministic**: Same variables always produce same result
✅ **Supabase only**: No Neo4j dependency

## Canonical Work Types

Must match exactly (enforced by database CHECK constraint):
- `'New Construction'`
- `'Addition'`
- `'Alteration/Renovation'`
- `'Change of Occupancy'`
- `'Site/Civil Work'`
- `'Maintenance Only'`

## Testing

### Run migrations

```bash
# Apply schema
supabase migration up

# Or via Supabase dashboard SQL editor:
# 1. Run 20250930_applicability.sql
# 2. Run 20250930_applicability_starter_metadata.sql
```

### Verify chapter assignment

```sql
SELECT chapter, count(*)
FROM sections
WHERE chapter IN ('11A', '11B')
GROUP BY chapter;
```

### Test with sparse variables (conservative behavior)

```sql
-- Call RPC with minimal variables
SELECT key, number, title, include, reasons
FROM filter_sections_explain(
  ARRAY['ICC+CBC_Chapter11A_11B+2025+CA'],
  '{}'::jsonb,  -- empty variables
  true,         -- include 11A
  true          -- include 11B
)
ORDER BY number
LIMIT 10;

-- Should include everything (conservative)
```

### Test with full variables (see exclusions)

```sql
SELECT key, number, title, include, reasons
FROM filter_sections_explain(
  ARRAY['ICC+CBC_Chapter11A_11B+2025+CA'],
  jsonb_build_object(
    'building_characteristics', jsonb_build_object(
      'occupancy_classification', jsonb_build_object('value', 'B - Business'),
      'has_parking', jsonb_build_object('value', false),
      'building_size_sf', jsonb_build_object('value', 2500),
      'number_of_stories', jsonb_build_object('value', 2)
    ),
    'project_scope', jsonb_build_object(
      'work_type', jsonb_build_object('value', 'New Construction')
    )
  ),
  false,  -- exclude 11A (business occupancy)
  true    -- include 11B
)
WHERE NOT include  -- show exclusions
ORDER BY number
LIMIT 10;
```

### Inspect audit log for assessment

```sql
-- Count decisions
SELECT decision, decision_source, count(*)
FROM section_applicability_log
WHERE assessment_id = 'YOUR_ASSESSMENT_ID'
GROUP BY decision, decision_source;

-- Show excluded sections with reasons
SELECT s.number, s.title, l.reasons, l.details->'dimensions' AS dims
FROM section_applicability_log l
JOIN sections s ON s.key = l.section_key
WHERE l.assessment_id = 'YOUR_ASSESSMENT_ID'
  AND l.decision = FALSE
  AND l.decision_source = 'rule'
ORDER BY s.number;
```

## Authoring Applicability Metadata

Start with high-leverage sections and expand incrementally:

```sql
-- Mark a section as parking-dependent
UPDATE sections
SET
  requires_parking = TRUE,
  applicable_work_types = ARRAY['New Construction', 'Addition'],
  applicability_notes = 'Only applies to projects with parking'
WHERE number = '11B-208.1';

-- Mark a section as occupancy-specific
UPDATE sections
SET
  applicable_occupancies = ARRAY['A', 'E'],  -- Assembly, Educational
  applicability_notes = 'Assembly and educational occupancy requirements'
WHERE number = '11B-221.1';

-- Mark a section as size-dependent
UPDATE sections
SET
  min_building_size = 5000,
  applicability_notes = 'Applies to buildings > 5,000 sf per story'
WHERE number = '11B-XXX.X';
```

## Future: Optional AI Pass (Not Implemented Yet)

The schema supports an optional AI refinement pass via Redis queue:
1. Enqueue sections included due to unknowns or `always_include`
2. LLM evaluates each section against project variables
3. Write AI decision to audit log with `decision_source='ai'`
4. Set `checks.requires_review=TRUE` if AI disagrees with high confidence
5. UI can highlight/group these for human review

## Key Files

- `supabase/migrations/20250930_applicability.sql` - Schema + RPC function
- `supabase/migrations/20250930_applicability_starter_metadata.sql` - Initial metadata
- `lib/variables.ts` - Variable normalization and chapter resolution
- `app/api/assessments/[id]/seed/route.ts` - Filtering integration

## Performance Notes

- Filtering runs in a single database roundtrip
- Indices on all filter dimensions (chapter, parking, elevator, occupancies, work types)
- GIN indices for array containment checks
- No N+1 queries or external API calls during seeding
