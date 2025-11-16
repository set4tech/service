# Residential Sections Filter Script

This script filters out residential-specific sections from an assessment using Claude AI.

## What it does

1. Fetches all sections used in an assessment (from the `checks` table)
2. Optionally fetches parent sections and referenced sections
3. Uses Claude to analyze each section and determine if it's explicitly residential-specific
4. Outputs results to a JSON file

## Requirements

- Python 3.9+
- Install dependencies:
  ```bash
  pip install supabase anthropic python-dotenv
  ```
- ANTHROPIC_API_KEY environment variable set

## Usage

### Basic usage (fast, sections only):

```bash
/Users/will/miniconda3/bin/python scripts/filter_residential_sections.py \
  918581e5-5736-4172-8d13-3cf766733919 \
  --skip-references \
  --output residential_sections.json
```

### Full analysis (includes parent and referenced sections):

```bash
/Users/will/miniconda3/bin/python scripts/filter_residential_sections.py \
  918581e5-5736-4172-8d13-3cf766733919 \
  --output residential_sections.json
```

### Test with limited sections:

```bash
/Users/will/miniconda3/bin/python scripts/filter_residential_sections.py \
  918581e5-5736-4172-8d13-3cf766733919 \
  --limit 100 \
  --skip-references \
  --output test_output.json
```

## Command-line options

- `assessment_id` - **Required** The UUID of the assessment to analyze
- `--output` / `-o` - Output JSON file path (default: `residential_sections.json`)
- `--batch-size` / `-b` - Number of sections to analyze per LLM call (default: 20)
- `--limit` / `-l` - Limit total sections analyzed (for testing)
- `--skip-references` - Skip fetching parent and referenced sections (faster)

## Output format

The script outputs a JSON file with the following structure:

```json
{
  "assessment_id": "918581e5-5736-4172-8d13-3cf766733919",
  "total_sections_analyzed": 2570,
  "residential_sections_found": 45,
  "residential_sections": {
    "ICC:CBC:2022:CA:1234.5": {
      "section": {
        "id": "...",
        "key": "ICC:CBC:2022:CA:1234.5",
        "number": "1234.5",
        "title": "Residential dwelling units",
        "text": "..."
      },
      "analysis": {
        "is_residential": true,
        "confidence": "high",
        "reasoning": "Section explicitly mentions residential dwelling units"
      }
    }
  },
  "all_results": {
    // ... all sections with their analysis results
  }
}
```

## Performance notes

- For ~2570 sections with `--skip-references`:
  - Batches of 20 = ~130 API calls
  - Estimated time: 5-10 minutes
  - Estimated cost: $5-10 (depending on section text length)

- With full parent/reference fetching:
  - Could be 3000-4000 sections
  - Estimated time: 10-15 minutes
  - Estimated cost: $10-20

## Database connection

The script is hardcoded to connect to the **production** Supabase database:

- Project: `grosxzvvmhakkxybeuwu`
- Uses service role key (bypasses RLS)

## Filtering criteria

Claude is instructed to mark a section as residential ONLY if:

- Explicitly mentions "residential" or "dwelling units" or "R-" occupancy groups
- Is clearly only applicable to residential buildings
- Has no applicability to commercial/institutional buildings

Sections are NOT marked residential if:

- Could apply to both residential AND commercial buildings
- Are general requirements across occupancy types
- Only mention residential as one example among others
