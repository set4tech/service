# Compliance Analysis Pipeline

Three-phase pipeline for automated building code compliance analysis, designed to minimize expensive vision analysis by filtering out checks using text-based analysis first.

## Pipeline Overview

```
Phase 0: Pre-filtering (Quick AI filter)
         ↓
Phase 1: Text Analysis (PDF text extraction)
         ↓
Phase 2: Vision Analysis (PDF screenshots + images)
```

## Files

### Core Scripts

**`shared_utils.py`**

- Shared utilities for all phases
- Database connection (Supabase)
- PDF downloading from S3
- PDF text extraction (PyMuPDF)
- LLM calling with retry and fallback
- Checkpoint saving/loading
- Model fallbacks: Gemini 2.5 Flash-Lite → Gemini 2.0 Flash → GPT-4o-mini → Claude 3.5 Haiku

**`phase0_prefilter_batched.py`**

- Quick AI filter to remove obviously irrelevant sections
- Batches 15 sections per API call
- Uses project context (occupancy, type, size) to filter
- Example: Filter out residential requirements for warehouse
- Fast model: gemini-2.0-flash-thinking-exp

**`phase1_text_analysis_batched.py`**

- Text-based compliance analysis using PDF text extraction
- Batches 15 sections per API call (15x speedup)
- Analyzes code sections against extracted PDF text
- Outputs: conclusive, needs_vision, not_applicable
- Default model: gemini-2.5-flash-lite (fastest, cheapest)

**`phase1_seed_db.py`**

- Seeds database with Phase 1 results
- Marks not_applicable checks: `not_applicable=true`
- Creates analysis_runs for conclusive checks
- Leaves needs_vision checks for Phase 2

### Legacy Scripts (Non-batched)

**`phase0_prefilter.py`**

- Original non-batched Phase 0 (1 section per API call)
- Use `phase0_prefilter_batched.py` instead

**`phase1_text_analysis.py`**

- Original non-batched Phase 1 (1 section per API call)
- Use `phase1_text_analysis_batched.py` instead

## What We Ran (Bombardier Assessment)

**Assessment ID**: `3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83`

### Phase 0: Pre-filtering

```bash
cd /Users/will/code/service/scripts/compliance_pipeline
source ../../venv/bin/activate
python phase0_prefilter_batched.py \
  --assessment-id 3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83 \
  --env prod \
  --model gemini/gemini-2.0-flash-thinking-exp-1219 \
  --concurrency 50
```

**Results**:

- Total checks: 4,275
- Filtered out: 1,454 (34%) - obviously not applicable
- Sent to Phase 1: 2,821

**Output**: `results/3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83/prefilter_results.json`

### Phase 1: Text Analysis

```bash
cd /Users/will/code/service/scripts/compliance_pipeline
source ../../venv/bin/activate
python phase1_text_analysis_batched.py \
  --assessment-id 3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83 \
  --env prod \
  --model gemini/gemini-2.5-flash-lite \
  --concurrency 1
```

**Results**:

- Processed: 4,275 checks (includes Phase 0 filtered)
- Conclusive: 17 (0.4%) - solved with text only
- Not applicable: 2,269 (53.1%) - additional filtering
- Needs vision: 1,989 (46.5%) - requires screenshots
- Execution time: 8.8 minutes

**Output**: `results/3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83/text_results.json`

## Data Seeded to Database

**SEEDING COMPLETE** ✅ - Ran on 2025-01-14:

```bash
cd /Users/will/code/service/scripts/compliance_pipeline
source ../../venv/bin/activate
python phase1_seed_db.py \
  --assessment-id 3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83 \
  --env prod
```

**Results:**

- ✅ Marked **2,269 checks** as `is_excluded=true` with reason "Phase 1: Not applicable based on text analysis"
- ✅ Created **17 analysis_runs** with AI judgments (ai_provider='phase1', ai_model='text_analysis')
- ✅ Left **1,989 checks** for Phase 2 vision analysis

## Overall Pipeline Efficiency

**Starting point**: 4,275 checks

**After Phase 0 + Phase 1**:

- Filtered: 2,286 checks (53.5%)
- Conclusive: 17 checks (0.4%)
- **Remaining for Phase 2**: 1,989 checks (46.5%)

**Cost savings**: Reduced expensive vision analysis by **53.5%**

## Data Files

### Results Directory Structure

```
results/
└── 3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83/
    ├── prefilter_results.json          # Phase 0 output
    ├── text_results.json                # Phase 1 output (FINAL)
    ├── text_results.json.progress       # Phase 1 checkpoint
    ├── pdf_text.txt                     # Extracted PDF text (cached)
    └── pdf_pages.json                   # Page-by-page text (cached)
```

## Next Steps

1. **Seed database** with Phase 1 results (run `phase1_seed_db.py`)
2. **Phase 2**: Vision analysis for remaining 1,989 checks
   - Will require PDF screenshot extraction
   - Vision-based AI analysis (more expensive)
   - Final compliance determinations
