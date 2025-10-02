# Building Codes Database Schema

## Overview

This database stores building code documents (e.g., California Building Code, ICC A117.1) and their hierarchical section structure in PostgreSQL/Supabase.

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────┐
│                   codes                     │
├─────────────────────────────────────────────┤
│ id TEXT PK                                  │  (e.g., "ICC+CBC_Chapter11A_11B+2025+CA")
│ provider TEXT                               │  (e.g., "ICC", "NYSBC")
│ source_id TEXT                              │  (e.g., "A117.1", "CBC_Chapter11A_11B")
│ version TEXT                                │  (e.g., "2025", "2017")
│ jurisdiction TEXT                           │  (e.g., "CA", "NY", NULL)
│ title TEXT                                  │
│ source_url TEXT                             │
│ created_at TIMESTAMPTZ                      │
│ updated_at TIMESTAMPTZ                      │
└─────────────────────────────────────────────┘
                    │
                    │ 1:N (code has many sections)
                    ▼
┌─────────────────────────────────────────────┐
│                 sections                    │
├─────────────────────────────────────────────┤
│ id SERIAL PK                                │
│ key TEXT UNIQUE                             │  (e.g., "ICC:CBC_Chapter11A_11B:2025:CA:11B-401.1")
│ code_id TEXT FK → codes.id                 │
│ parent_key TEXT FK → sections.key          │  (NULL for top-level sections)
│ number TEXT                                 │  (e.g., "401", "401.1", "401.1.1")
│ title TEXT                                  │
│ text TEXT                                   │
│ item_type TEXT                              │  ("section" or "subsection")
│ code_type TEXT                              │  ("accessibility", "building", "fire", etc.)
│ paragraphs JSONB                            │  (array of paragraph strings)
│ source_url TEXT                             │
│ source_page INTEGER                         │
│ hash TEXT                                   │
│ created_at TIMESTAMPTZ                      │
│ updated_at TIMESTAMPTZ                      │
└─────────────────────────────────────────────┘
         │                      │
         │                      │ Self-referencing (parent-child hierarchy)
         │                      └─────────────┐
         │                                    │
         │ M:N (sections reference each other)│
         ▼                                    ▼
┌─────────────────────────────────────────────┐
│           section_references                │
├─────────────────────────────────────────────┤
│ id SERIAL PK                                │
│ source_section_key TEXT FK → sections.key  │
│ target_section_key TEXT FK → sections.key  │
│ explicit BOOLEAN                            │  (TRUE = explicit citation, FALSE = inferred)
│ citation_text TEXT                          │  (e.g., "See Section 401.1")
│ created_at TIMESTAMPTZ                      │
└─────────────────────────────────────────────┘
```

## Table Descriptions

### `codes`

Master building code documents table. Each row represents one version of a building code.

**Example rows:**

- `ICC+A117.1+2017` - ICC A117.1 (2017 edition, national)
- `ICC+CBC_Chapter11A_11B+2025+CA` - California Building Code Chapter 11 (2025, CA-specific)

**Key columns:**

- `id`: Composite key format: `{provider}+{source_id}+{version}[+{jurisdiction}]`
- `jurisdiction`: NULL for national codes, state code (e.g., "CA", "NY") for state-specific

### `sections`

Hierarchical storage of all sections and subsections within building codes.

**Hierarchy structure:**

```
Section 401 (parent_key = NULL)
  └─ Subsection 401.1 (parent_key = "ICC:A117.1:2017:401")
       └─ Subsection 401.1.1 (parent_key = "ICC:A117.1:2017:401.1")
```

**Key columns:**

- `key`: Unique identifier format: `{provider}:{source_id}:{version}[:{jurisdiction}]:{number}`
- `parent_key`: References `sections.key` for parent section (NULL for top-level sections)
- `item_type`: Either `"section"` (top-level) or `"subsection"` (child)
- `code_type`: Category like `"accessibility"`, `"building"`, `"fire"`, `"plumbing"`, etc.
- `paragraphs`: JSON array of text paragraphs within the section

**Example data:**

```json
{
  "key": "ICC:CBC_Chapter11A_11B:2025:CA:11B-401.1",
  "code_id": "ICC+CBC_Chapter11A_11B+2025+CA",
  "parent_key": "ICC:CBC_Chapter11A_11B:2025:CA:11B-401",
  "number": "11B-401.1",
  "title": "General",
  "item_type": "subsection",
  "code_type": "accessibility",
  "paragraphs": ["All spaces and elements...", "Exception: ..."]
}
```

### `section_references`

Cross-references between sections (e.g., "See Section 401.1" citations).

**Key columns:**

- `source_section_key`: The section containing the reference
- `target_section_key`: The section being referenced
- `explicit`: TRUE for explicit citations in the text, FALSE for inferred relationships
- `citation_text`: Original citation text from the code document

## Indexes

### `codes` table

- `idx_codes_provider` on `provider`
- `idx_codes_source_id` on `source_id`
- `idx_codes_version` on `version`
- `idx_codes_jurisdiction` on `jurisdiction`

### `sections` table

- `idx_sections_code_id` on `code_id`
- `idx_sections_key` on `key`
- `idx_sections_number` on `number`
- `idx_sections_parent_key` on `parent_key`
- `idx_sections_item_type` on `item_type`
- `idx_sections_code_type` on `code_type`
- `idx_sections_hash` on `hash`

### `section_references` table

- `idx_section_refs_source` on `source_section_key`
- `idx_section_refs_target` on `target_section_key`

## Common Queries

### Get all top-level sections for a code

```sql
SELECT * FROM sections
WHERE code_id = 'ICC+CBC_Chapter11A_11B+2025+CA'
  AND parent_key IS NULL
ORDER BY number;
```

### Get all subsections of a specific section

```sql
SELECT * FROM sections
WHERE parent_key = 'ICC:CBC_Chapter11A_11B:2025:CA:11B-401'
ORDER BY number;
```

### Get section with all its ancestors (breadcrumb trail)

```sql
WITH RECURSIVE ancestors AS (
  -- Base: start with target section
  SELECT * FROM sections WHERE key = 'ICC:CBC_Chapter11A_11B:2025:CA:11B-401.1'
  UNION ALL
  -- Recursive: get parent
  SELECT s.* FROM sections s
  INNER JOIN ancestors a ON s.key = a.parent_key
)
SELECT * FROM ancestors ORDER BY number;
```

### Get all sections that reference a specific section

```sql
SELECT s.* FROM sections s
INNER JOIN section_references sr ON sr.source_section_key = s.key
WHERE sr.target_section_key = 'ICC:CBC_Chapter11A_11B:2025:CA:11B-401'
  AND sr.explicit = TRUE;
```

## Data Loading

Use the upload script to load code data from JSON files:

```bash
python scripts/load_db/unified_code_upload_supabase.py --file path/to/code.json
```

**JSON format:**

```json
{
  "provider": "ICC",
  "version": 2025,
  "jurisdiction": "CA",
  "source_id": "CBC_Chapter11A_11B",
  "title": "California Building Code - Chapters 11A & 11B Accessibility",
  "source_url": "https://...",
  "sections": [
    {
      "number": "401",
      "title": "General",
      "subsections": [
        {
          "number": "401.1",
          "title": "Scope",
          "paragraphs": ["Text content..."],
          "refers_to": ["401.2", "402.1"]
        }
      ]
    }
  ]
}
```

## Compliance Assessment Tables

### `customers`

Customer/client organizations.

**Key columns:**

- `id`: UUID primary key
- `name`: Customer name
- `contact_email`: Primary contact email
- `contact_phone`: Contact phone number
- `address`: Physical address
- `created_at`, `updated_at`: Timestamps

### `projects`

Individual building projects for customers.

**Key columns:**

- `id`: UUID primary key
- `customer_id`: Foreign key to `customers`
- `name`: Project name
- `description`: Project description
- `building_address`: Building location
- `building_type`: Type of building (e.g., "Commercial", "Residential")
- `pdf_url`: S3 URL to architectural drawings PDF
- `code_assembly_id`: Neo4j assembly ID for applicable codes
- `selected_code_ids`: Array of code IDs to assess against
- `status`: Project status ('in_progress', 'completed', etc.)
- `extracted_variables`: JSONB of building metadata extracted from drawings
- `extraction_status`: Status of AI extraction ('pending', 'in_progress', 'completed', 'failed')
- `created_at`, `updated_at`: Timestamps

**Workflow:**

1. Create customer
2. Create project with PDF upload to S3
3. Optionally extract building variables via AI
4. Create assessment from project

### `assessments`

Code compliance assessment instances for a project.

**Key columns:**

- `id`: UUID primary key
- `project_id`: Foreign key to `projects`
- `started_at`: Assessment start time
- `completed_at`: When assessment was completed
- `status`: Overall status ('in_progress', 'completed', etc.)
- `seeding_status`: Check seeding status ('not_started', 'in_progress', 'completed')
- `sections_processed`: Number of sections processed during seeding
- `sections_total`: Total sections to process during seeding
- `total_sections`: Total checks created
- `assessed_sections`: Number of checks completed
- `pdf_scale`: PDF rendering scale (default 2.0)

**Seeding Process:**

1. Assessment created with `seeding_status = 'not_started'`
2. `/api/assessments/[id]/seed` starts seeding → `seeding_status = 'in_progress'`
3. AI filters sections for applicability → Creates checks in batches
4. Updates `sections_processed`, `sections_total` as it progresses
5. When done → `seeding_status = 'completed'`

**Progress Calculation:**

- Progress = `assessed_sections / total_sections`
- A check is "assessed" if it has an AI analysis OR manual override

### `checks`

Individual compliance checks for code sections within an assessment.

**Key columns:**

- `id`: UUID primary key
- `assessment_id`: Foreign key to `assessments` table
- `code_section_key`: Reference to `sections.key` for which code section is being checked
- `code_section_number`: The section number (e.g., "11B-401.1")
- `code_section_title`: The section title
- `status`: Current status (e.g., 'pending', 'in_progress', 'completed')
- `check_type`: 'section' (traditional) or 'element' (grouped by building element)
- `parent_check_id`: For instances, references parent template check
- `instance_number`: Instance number (0 = template, 1+ = instances)
- `instance_label`: Custom label (e.g., "Main Entrance Door", "Door 2")
- `element_group_id`: For element checks, references `element_groups`
- `element_sections`: Array of section keys covered by this element check
- `prompt_template_id`: Reference to prompt template used
- `actual_prompt_used`: Final prompt sent to AI (with variables substituted)
- `manual_override`: TEXT - Manual human judgment
  - `'compliant'`: Manually marked as compliant
  - `'non_compliant'`: Manually marked as non-compliant
  - `'not_applicable'`: Manually marked as not applicable
  - `NULL`: No manual override (use AI assessment)
- `manual_override_note`: Optional text explanation for the manual decision
- `manual_override_at`: Timestamp when manual override was set
- `manual_override_by`: User who set the manual override
- `created_at`: When the check was created
- `updated_at`: Last modification timestamp (auto-updated by trigger)

**Check Types:**

1. **Section Check** (`check_type = 'section'`):
   - Traditional 1:1 mapping to code section
   - One section assessed per check

2. **Element Check** (`check_type = 'element'`):
   - Groups multiple related sections (e.g., all door requirements)
   - `element_sections` array contains all section keys
   - Batch AI assessment of all sections together

**Template & Instance Pattern:**

- `parent_check_id = NULL` → Template or standalone check
- `parent_check_id` set → Instance of a template
- `instance_number = 0` → Template (shows "Click + to add first...")
- `instance_number >= 1` → Actual instances
- Instances inherit `element_sections` from parent

**Manual Override Pattern:**
The `manual_override` field allows human reviewers to override AI assessments. When set:

1. The manual judgment takes precedence over any AI analysis
2. The `manual_override_at` timestamp tracks when the decision was made
3. The `manual_override_note` provides audit trail and reasoning
4. Setting to `NULL` clears the override and reverts to AI assessment

**Constraints:**

- `unique_check_per_section`: Prevents duplicate checks per assessment/section/instance
- `check_type` must be 'section' or 'element'
- `manual_override` must be 'compliant', 'non_compliant', 'not_applicable', or NULL

### `element_groups`

Reusable groupings of related code sections by building element.

**Key columns:**

- `id`: UUID primary key
- `name`: Element name (e.g., "Doors", "Ramps", "Parking Spaces")
- `slug`: URL-friendly identifier (e.g., "doors", "ramps")
- `description`: Element description
- `icon`: Optional icon identifier
- `sort_order`: Display order
- `created_at`: Timestamp

**Usage:**

- Predefined element groups created once
- Mapped to code sections via `element_section_mappings`
- Referenced by checks via `element_group_id`

### `element_section_mappings`

Maps element groups to applicable code sections.

**Schema:**

```sql
CREATE TABLE element_section_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  element_group_id UUID REFERENCES element_groups(id) ON DELETE CASCADE,
  section_key TEXT REFERENCES sections(key),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Example:**
Element "Doors" might map to:

- `11B-404.2.6` (Door maneuvering clearance)
- `11B-404.2.7` (Door opening force)
- `11B-404.2.9` (Door closing time)
- etc.

### `analysis_runs`

Historical record of AI assessments for each check.

**Key columns:**

- `id`: UUID primary key
- `check_id`: Foreign key to `checks` table
- `run_number`: Sequential run number for this check (auto-incremented)
- `compliance_status`: AI-determined status ('compliant', 'non_compliant', 'needs_review', 'unclear')
- `confidence`: AI confidence level ('high', 'medium', 'low')
- `ai_provider`: Which AI service was used ('gemini', 'openai', 'anthropic')
- `ai_model`: Specific model (e.g., 'gemini-2.5-pro', 'gpt-4o', 'claude-opus-4-20250514')
- `ai_reasoning`: Text explanation from the AI
- `violations`: JSONB array of identified violations
- `compliant_aspects`: JSONB array of aspects that are compliant
- `recommendations`: JSONB array of suggested fixes
- `additional_evidence_needed`: JSONB array of additional info needed
- `raw_ai_response`: Full raw AI response text
- `section_results`: JSONB - For element checks, individual section assessments
- `batch_group_id`: UUID grouping related batch analyses
- `batch_number`: Batch number within group
- `total_batches`: Total batches in group
- `section_keys_in_batch`: Array of section keys assessed in this batch
- `executed_at`: When the analysis was run
- `execution_time_ms`: How long the analysis took
- `human_override`: Boolean (deprecated, use `checks.manual_override` instead)
- `human_notes`: Text (deprecated)

**Analysis Patterns:**

1. **Single Check Analysis** (`/api/checks/[id]/assess`):
   - One check, one section
   - Simple assessment flow
   - No batching

2. **Batch Analysis** (`/api/analysis/batch`):
   - Multiple checks analyzed together
   - Shares `batch_group_id`
   - Each run has `batch_number` and `total_batches`

3. **Element Check Analysis** (`check_type = 'element'`):
   - One check, multiple sections
   - `section_results` contains per-section assessments
   - Overall `compliance_status` is aggregate

**Audit Trail:**

- Each check can have multiple analysis runs (allowing re-assessment)
- `run_number` auto-increments for each check
- Latest run is used for display unless manual override is set
- Full history preserved for compliance audit

**Unique Constraint:**

- `(check_id, run_number)` ensures sequential numbering

### `screenshots`

Screenshots captured from PDF drawings for compliance evidence.

**Key columns:**

- `id`: UUID primary key
- `check_id`: Foreign key to `checks` - which check this screenshot supports
- `analysis_run_id`: Foreign key to `analysis_runs` - which AI run used this screenshot (nullable)
- `page_number`: PDF page number where screenshot was taken
- `crop_coordinates`: JSONB with x, y, width, height of crop area
- `screenshot_url`: S3 URL to full screenshot image
- `thumbnail_url`: S3 URL to thumbnail (optional)
- `caption`: User-added caption/description
- `created_at`: When screenshot was captured
- `created_by`: User who captured it (UUID, optional)

**Screenshot Flow:**

1. User captures screenshot in PDF viewer
2. Frontend uploads to S3 via presigned URL (`/api/screenshots/presign`)
3. Frontend calls `/api/screenshots` with S3 URL and metadata
4. Screenshot record created, linked to check
5. When AI analysis runs, screenshots fetched and passed to AI
6. AI analysis links to screenshots via `analysis_run_id`

**S3 Presigning:**

- Upload: `POST /api/screenshots/presign` → Returns presigned PUT URL
- Download: `GET /api/screenshots/presign-view?url=...` → Returns presigned GET URL
- Presigned URLs expire after 1 hour

**Storage Pattern:**

- S3 bucket: `set4-data` or configured bucket
- Path: `screenshots/{assessment_id}/{check_id}/{uuid}.png`
- Thumbnails: `screenshots/{assessment_id}/{check_id}/thumb_{uuid}.png`

### `prompt_templates`

Reusable prompt templates for AI analysis.

**Schema:**

```sql
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_text TEXT NOT NULL,
  variables JSONB,  -- Array of variable names used in template
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Usage:**

- Templates contain variables like `{{code_section}}`, `{{building_type}}`
- Variables substituted at analysis time with project/check data
- `checks.actual_prompt_used` stores the final substituted prompt

### `section_applicability_log`

Logs AI filtering decisions during assessment seeding.

**Schema:**

```sql
CREATE TABLE section_applicability_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
  section_key TEXT REFERENCES sections(key),
  is_applicable BOOLEAN NOT NULL,
  ai_reasoning TEXT,
  confidence TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Purpose:**

- Track which sections were filtered out and why
- Debugging applicability filtering logic
- Audit trail of AI filtering decisions

### Indexes

#### `checks` table

- `idx_assessment_section` on `(assessment_id, code_section_key)`
- `idx_checks_manual_override` on `manual_override` (partial, WHERE not NULL)

#### `analysis_runs` table

- `idx_analysis_runs_check` on `check_id`

## Triggers

### `update_checks_updated_at`

Automatically updates `checks.updated_at` timestamp on any modification.

```sql
CREATE TRIGGER update_checks_updated_at
  BEFORE UPDATE ON checks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Data Model Relationships

### Entity Relationship Diagram (Extended)

```
┌─────────────┐
│  customers  │
└──────┬──────┘
       │ 1:N
       ▼
┌─────────────┐       ┌──────────────┐
│  projects   │──────▶│    codes     │
└──────┬──────┘  N:M  └──────┬───────┘
       │                      │ 1:N
       │ 1:N                  ▼
       ▼               ┌──────────────┐
┌──────────────┐       │   sections   │
│ assessments  │       └──────┬───────┘
└──────┬───────┘              │
       │ 1:N                  │
       ▼                      │
┌──────────────┐              │
│   checks     │◀─────────────┘
└──────┬───────┘      references
       │              code_section_key
       │
       ├─────────┐ 1:N (parent-child instances)
       │         │
       │         ▼
       │    ┌─────────────────┐
       │    │ checks (child)  │
       │    └─────────────────┘
       │
       ├─────────┐ N:1 (element grouping)
       │         ▼
       │    ┌──────────────────┐       ┌────────────────────────┐
       │    │ element_groups   │──────▶│ element_section_mappings│
       │    └──────────────────┘  1:N  └────────────────────────┘
       │
       │ 1:N
       ▼
┌──────────────┐       ┌──────────────┐
│analysis_runs │──────▶│ screenshots  │
└──────────────┘  1:N  └──────────────┘
                        (also N:1 to checks)
```

### Key Relationships

**Customer → Project → Assessment → Checks**

- Hierarchical workflow from customer to individual compliance checks
- Cascade deletes: Deleting customer removes all projects, assessments, checks

**Checks ↔ Sections**

- `checks.code_section_key` references `sections.key`
- Many checks can reference same section (across different assessments)

**Checks → Element Groups**

- Element checks (`check_type = 'element'`) link to `element_groups`
- Element group defines which sections are assessed together
- `element_sections` array stores the specific section keys

**Checks → Analysis Runs → Screenshots**

- One check can have multiple analysis runs (re-assessment)
- One analysis run can reference multiple screenshots
- Screenshots also directly link to checks (for manual capture)

**Parent-Child Checks (Instances)**

- Template check has `parent_check_id = NULL`, `instance_number = 0`
- Instance checks have `parent_check_id` set, `instance_number >= 1`
- Instances inherit `element_sections` from parent

### Views

**`check_summary`** - Materialized view joining checks with latest analysis

```sql
CREATE MATERIALIZED VIEW check_summary AS
SELECT
  c.*,
  ar.compliance_status as latest_status,
  ar.confidence as latest_confidence,
  ar.ai_reasoning as latest_reasoning
FROM checks c
LEFT JOIN LATERAL (
  SELECT * FROM analysis_runs
  WHERE check_id = c.id
  ORDER BY run_number DESC
  LIMIT 1
) ar ON true;
```

**`latest_analysis_runs`** - View of most recent analysis per check

```sql
CREATE VIEW latest_analysis_runs AS
SELECT DISTINCT ON (check_id) *
FROM analysis_runs
ORDER BY check_id, run_number DESC;
```

## Current Data

**Loaded codes:**

- California Building Code 2025 - Chapters 11A & 11B Accessibility
  - 682 sections/subsections
  - 343 cross-references

**Element Groups:**

- Doors, Ramps, Parking Spaces, Accessible Routes, Restrooms, etc.
- Each mapped to 5-20 related code sections

**Assessment Stats (example):**

- Average assessment: 80-120 checks (after AI filtering)
- Section mode: 1 check per section
- Element mode: 6-8 element groups with 1-5 instances each
