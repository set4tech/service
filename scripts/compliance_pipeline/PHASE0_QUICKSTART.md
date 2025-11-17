# Phase 0 Pre-filtering - Quick Start

## What It Does

Filters out building code sections that are DEFINITELY NOT relevant to your project before running expensive analysis.

Example: For a **warehouse (S-1)**, it automatically eliminates:

- Residential sleeping room requirements ❌
- Assembly seating requirements ❌
- School classroom requirements ❌
- Hospital requirements ❌
- Kitchen/cooking requirements ❌

## Running It

### Option 1: As Part of Full Pipeline (Recommended)

```bash
cd /Users/will/code/service/scripts/compliance_pipeline
./run_pipeline.sh <assessment-id> prod
```

Phase 0 runs automatically as the first step!

### Option 2: Standalone

```bash
cd /Users/will/code/service/scripts/compliance_pipeline
python phase0_prefilter.py \
  --assessment-id 3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83 \
  --env prod
```

## Example Output

```
================================================================================
PHASE 0: PRE-FILTERING
================================================================================
Assessment ID: 3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83
Environment:   prod
Model:         gemini/gemini-2.0-flash-thinking-exp-1219
Output:        results/3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83/prefilter_results.json
================================================================================

[PROJECT CONTEXT]
  Name:       BOMBARDIER COURT - BUILDING 2
  Occupancy:  S-1 (WAREHOUSE)
  Type:       Warehouse
  Size:       74,439 SF

[INFO] Using 10 parallel workers

  [✓ RELEVANT] 1001.1: Scope (0.8s)
  [✗ FILTERED] 1107.6.1: Residential dwelling unit sleeping rooms (0.6s)
  [✓ RELEVANT] 1003.2: Ceiling height (0.7s)
  [✗ FILTERED] 1210.2: Assembly seating (0.5s)
  ...

[1/700] RELEVANT: 1001.1
[2/700] FILTERED: 1107.6.1
[3/700] RELEVANT: 1003.2
[4/700] FILTERED: 1210.2
...

================================================================================
PHASE 0 COMPLETE
================================================================================
Total checks:      700
Relevant:          455 (65.0%)
Filtered out:      245 (35.0%)
Execution time:    7.2m
Output saved to:   results/3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83/prefilter_results.json
================================================================================
```

## What Gets Filtered?

The system is **conservative** - it only filters sections that are DEFINITELY not applicable.

### Common Filtered Sections (for warehouse):

- ✅ Residential (Group R) requirements
- ✅ Assembly (Group A) requirements
- ✅ Educational (Group E) requirements
- ✅ Healthcare (Group I-2) requirements
- ✅ Hotel guest rooms
- ✅ Kitchen equipment in dwellings
- ✅ Bedroom/sleeping room requirements

### What DOESN'T Get Filtered:

- ❌ General accessibility (might apply)
- ❌ Egress/exits (applies to all buildings)
- ❌ Fire safety (applies to all buildings)
- ❌ Structural (applies to all buildings)
- ❌ Any section where applicability is uncertain

## Checking Results

```bash
# View summary
cat results/<assessment-id>/prefilter_results.json | jq '{
  total: .total_checks,
  relevant: .relevant_count,
  filtered: .filtered_count,
  rate: .filter_rate
}'

# View filtered sections
cat results/<assessment-id>/prefilter_results.json | jq '.filtered[] | {
  number: .section_number,
  title: .section_title
}'

# View project context used
cat results/<assessment-id>/prefilter_results.json | jq '.project_context'
```

## Cost & Performance

For **700 checks**:

- **Time**: ~7-10 minutes
- **Cost**: ~$0.014 (ultra-cheap!)
- **Filtered**: ~35-40% (245 sections eliminated)
- **Savings**: Saves ~$0.025 in Phase 1 + time

## Troubleshooting

### "No prefilter results found"

If you run Phase 1 separately without Phase 0:

```bash
# Run Phase 0 first
python phase0_prefilter.py --assessment-id <id> --env prod

# Then run Phase 1
python phase1_text_analysis.py --assessment-id <id> --env prod
```

### "Too many sections filtered"

Check if project context is correct:

```bash
cat results/<assessment-id>/prefilter_results.json | jq '.project_context'
```

### "Not enough sections filtered"

The system is intentionally conservative. It's better to analyze a section unnecessarily than to skip one that matters.

### Rate limiting

If you hit rate limits, reduce concurrency:

```bash
python phase0_prefilter.py \
  --assessment-id <id> \
  --env prod \
  --concurrency 5
```

## Advanced Options

```bash
python phase0_prefilter.py \
  --assessment-id <uuid> \
  --env prod \
  --output custom/path/prefilter.json \    # Custom output location
  --model gemini/gemini-2.0-flash-exp \    # Different model
  --concurrency 15 \                        # More parallel workers
  --limit 50                                # Test with first 50 checks only
```

## Integration with Pipeline

When you run the full pipeline:

```bash
./run_pipeline.sh <assessment-id> prod
```

The pipeline automatically:

1. ✅ Runs Phase 0 (prefiltering)
2. ✅ Passes results to Phase 1
3. ✅ Phase 1 skips filtered checks
4. ✅ Filtered checks marked as "not-applicable" in database

All phases work together seamlessly!

## Questions?

See full documentation:

- `README.md` - Full pipeline documentation
- `PHASE0_SUMMARY.md` - Technical details about Phase 0
