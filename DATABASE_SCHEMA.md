# Building Codes Database Schema

## Overview

This database stores building code documents (e.g., California Building Code, ICC A117.1) and their hierarchical section structure in PostgreSQL/Supabase. It also manages compliance assessments, AI analysis runs, and screenshot evidence.

## Core Tables

### `codes`

Master building code documents table. Each row represents one version of a building code.

**Schema:**

| Column         | Type          | Description                                                        |
| -------------- | ------------- | ------------------------------------------------------------------ |
| `id`           | TEXT PK       | Composite key: `{provider}+{source_id}+{version}[+{jurisdiction}]` |
| `provider`     | TEXT NOT NULL | Provider (e.g., "ICC", "NYSBC")                                    |
| `source_id`    | TEXT NOT NULL | Source ID (e.g., "A117.1", "CBC_Chapter11A_11B")                   |
| `version`      | TEXT NOT NULL | Version year (e.g., "2025", "2017")                                |
| `jurisdiction` | TEXT          | State code (e.g., "CA", "NY") or NULL for national                 |
| `title`        | TEXT NOT NULL | Full code title                                                    |
| `source_url`   | TEXT          | URL to official code document                                      |
| `created_at`   | TIMESTAMPTZ   | Creation timestamp                                                 |
| `updated_at`   | TIMESTAMPTZ   | Last update timestamp                                              |

**Indexes:**

- `idx_codes_provider` on `provider`
- `idx_codes_source_id` on `source_id`
- `idx_codes_version` on `version`
- `idx_codes_jurisdiction` on `jurisdiction`
- `unique_code_version` UNIQUE on `(provider, source_id, version, jurisdiction)`

**Example:**

- `ICC+CBC_Chapter11A_11B+2025+CA` - California Building Code Chapter 11 (2025)
- `ICC+A117.1+2017` - ICC A117.1 (2017 edition, national)

---

### `sections`

Hierarchical storage of all sections and subsections within building codes.

**Schema:**

| Column        | Type                   | Description                                                              |
| ------------- | ---------------------- | ------------------------------------------------------------------------ |
| `id`          | SERIAL PK              | Auto-incrementing integer primary key                                    |
| `key`         | TEXT UNIQUE NOT NULL   | Unique key: `{provider}:{source_id}:{version}[:{jurisdiction}]:{number}` |
| `code_id`     | TEXT FK → codes.id     | Parent code document                                                     |
| `parent_key`  | TEXT FK → sections.key | Parent section (NULL for top-level)                                      |
| `number`      | TEXT NOT NULL          | Section number (e.g., "11B-401.1")                                       |
| `title`       | TEXT NOT NULL          | Section title                                                            |
| `text`        | TEXT                   | Full section text content                                                |
| `item_type`   | TEXT NOT NULL          | "section" or "subsection"                                                |
| `code_type`   | TEXT NOT NULL          | "accessibility", "building", "fire", "plumbing", "mechanical", "energy"  |
| `paragraphs`  | JSONB                  | Array of paragraph strings (default `[]`)                                |
| `source_url`  | TEXT                   | URL to this specific section                                             |
| `source_page` | INTEGER                | Page number in source document                                           |
| `hash`        | TEXT NOT NULL          | Content hash for change detection                                        |
| `tables`      | JSONB                  | Array of table objects with number, title, CSV data (default `[]`)       |
| `figures`     | JSONB                  | Array of figure URLs (default `[]`)                                      |
| `chapter`     | TEXT                   | Chapter identifier (e.g., "11A", "11B") - denormalized from number       |
| `created_at`  | TIMESTAMPTZ            | Creation timestamp                                                       |
| `updated_at`  | TIMESTAMPTZ            | Last update timestamp                                                    |

**Applicability Metadata:**

| Column                           | Type    | Description                                                          |
| -------------------------------- | ------- | -------------------------------------------------------------------- |
| `always_include`                 | BOOLEAN | TRUE for scoping/definitions/administrative sections (default FALSE) |
| `applicable_occupancies`         | TEXT[]  | Occupancy letters [A,B,E,...]; NULL means no restriction             |
| `requires_parking`               | BOOLEAN | TRUE if section only applies when site has parking                   |
| `requires_elevator`              | BOOLEAN | TRUE if section only applies when elevator required                  |
| `min_building_size`              | INTEGER | Minimum per-story gross floor area (sq ft) threshold                 |
| `max_building_size`              | INTEGER | Maximum per-story gross floor area (sq ft) threshold                 |
| `applicable_work_types`          | TEXT[]  | Work type strings matching project variables                         |
| `applicable_facility_categories` | TEXT[]  | Facility category strings                                            |
| `applicability_notes`            | TEXT    | Maintainer notes about applicability logic                           |

**Assessability Metadata:**

| Column               | Type             | Description                                                                                   |
| -------------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| `drawing_assessable` | BOOLEAN          | Whether section can be assessed from drawings (default TRUE)                                  |
| `assessability_tags` | TEXT[]           | Tags: too_short, placeholder, definitional, administrative, procedural, summary, not_physical |
| `never_relevant`     | BOOLEAN NOT NULL | Global exclusion flag (default FALSE)                                                         |
| `floorplan_relevant` | BOOLEAN NOT NULL | Prioritize for floorplan analysis (default FALSE)                                             |

**Indexes:**

- `idx_sections_code_id` on `code_id`
- `idx_sections_key` on `key`
- `idx_sections_number` on `number`
- `idx_sections_chapter` on `chapter`
- `idx_sections_app_occ` GIN on `applicable_occupancies`
- `idx_sections_app_work` GIN on `applicable_work_types`
- `idx_sections_app_fac` GIN on `applicable_facility_categories`
- `idx_sections_parking` on `requires_parking`
- `idx_sections_elevator` on `requires_elevator`
- `idx_sections_min_size` on `min_building_size`
- `idx_sections_max_size` on `max_building_size`
- `idx_sections_drawing_assessable` on `drawing_assessable`
- `idx_sections_assessability_tags` GIN on `assessability_tags`
- `idx_sections_never_relevant` on `never_relevant` (partial WHERE TRUE)
- `idx_sections_floorplan_relevant` on `floorplan_relevant` (partial WHERE TRUE)
- `idx_sections_tables` GIN on `tables`
- `idx_sections_figures` GIN on `figures`
- `unique_section_number_per_code` UNIQUE on `(code_id, number)`

**Constraints:**

- `sections_code_type_check`: code_type must be one of allowed values
- `sections_item_type_check`: item_type must be "section" or "subsection"
- `chk_sections_work_types_values`: validates work types against allowed values

---

### `section_references`

Cross-references between sections (e.g., "See Section 401.1" citations).

**Schema:**

| Column               | Type                   | Description                                                    |
| -------------------- | ---------------------- | -------------------------------------------------------------- |
| `id`                 | SERIAL PK              | Auto-incrementing integer primary key                          |
| `source_section_key` | TEXT FK → sections.key | Section containing the reference                               |
| `target_section_key` | TEXT FK → sections.key | Section being referenced                                       |
| `explicit`           | BOOLEAN                | TRUE for explicit citations, FALSE for inferred (default TRUE) |
| `citation_text`      | TEXT                   | Original citation text from the code                           |
| `created_at`         | TIMESTAMPTZ            | Creation timestamp                                             |

**Indexes:**

- `idx_section_refs_source` on `source_section_key`
- `idx_section_refs_target` on `target_section_key`
- `unique_section_reference` UNIQUE on `(source_section_key, target_section_key)`

**Constraints:**

- `no_self_reference`: Prevents a section from referencing itself

---

## Assessment Tables

### `customers`

Customer/client organizations.

**Schema:**

| Column          | Type                  | Description           |
| --------------- | --------------------- | --------------------- |
| `id`            | UUID PK               | Primary key           |
| `name`          | VARCHAR(255) NOT NULL | Customer name         |
| `contact_email` | VARCHAR(255)          | Primary contact email |
| `contact_phone` | VARCHAR(50)           | Contact phone number  |
| `address`       | TEXT                  | Physical address      |
| `created_at`    | TIMESTAMPTZ           | Creation timestamp    |
| `updated_at`    | TIMESTAMPTZ           | Last update timestamp |

---

### `projects`

Individual building projects for customers.

**Schema:**

| Column                    | Type                   | Description                                                        |
| ------------------------- | ---------------------- | ------------------------------------------------------------------ |
| `id`                      | UUID PK                | Primary key                                                        |
| `customer_id`             | UUID FK → customers.id | Customer reference (CASCADE delete)                                |
| `name`                    | VARCHAR(255) NOT NULL  | Project name                                                       |
| `description`             | TEXT                   | Project description                                                |
| `building_address`        | TEXT                   | Building location                                                  |
| `building_type`           | VARCHAR(100)           | Type of building                                                   |
| `code_assembly_id`        | VARCHAR(255)           | Legacy code assembly identifier                                    |
| `pdf_url`                 | TEXT                   | S3 URL to architectural drawings PDF                               |
| `unannotated_drawing_url` | TEXT                   | S3 URL to original drawings PDF without markups or annotations     |
| `selected_code_ids`       | TEXT[]                 | Array of code IDs to assess against                                |
| `status`                  | VARCHAR(50)            | Project status (default 'in_progress')                             |
| `extracted_variables`     | JSONB                  | Building metadata extracted from drawings                          |
| `extraction_status`       | VARCHAR(50)            | Status: pending, processing, completed, failed (default 'pending') |
| `extraction_progress`     | JSONB                  | Progress: {current: number, total: number, category: string}       |
| `extraction_started_at`   | TIMESTAMPTZ            | When extraction started                                            |
| `extraction_completed_at` | TIMESTAMPTZ            | When extraction completed                                          |
| `extraction_error`        | TEXT                   | Error message if extraction failed                                 |
| `chunking_status`         | VARCHAR(50)            | PDF text chunking status (default 'pending')                       |
| `chunking_started_at`     | TIMESTAMPTZ            | When PDF text extraction started                                   |
| `chunking_completed_at`   | TIMESTAMPTZ            | When PDF text extraction completed                                 |
| `chunking_error`          | TEXT                   | Error message if chunking failed                                   |
| `report_password`         | TEXT                   | Password for accessing compliance reports (optional)               |
| `created_at`              | TIMESTAMPTZ            | Creation timestamp                                                 |
| `updated_at`              | TIMESTAMPTZ            | Last update timestamp                                              |

**Indexes:**

- `idx_projects_extraction_status` on `extraction_status`
- `idx_projects_chunking_status` on `chunking_status`

---

### `assessments`

Code compliance assessment instances for a project.

**Schema:**

| Column               | Type                  | Description                                          |
| -------------------- | --------------------- | ---------------------------------------------------- |
| `id`                 | UUID PK               | Primary key                                          |
| `project_id`         | UUID FK → projects.id | Project reference (CASCADE delete)                   |
| `started_at`         | TIMESTAMPTZ           | Assessment start time (default now())                |
| `completed_at`       | TIMESTAMPTZ           | When assessment was completed                        |
| `total_sections`     | INTEGER               | Total checks created                                 |
| `assessed_sections`  | INTEGER               | Number of checks completed (default 0)               |
| `status`             | VARCHAR(50)           | Overall status (default 'in_progress')               |
| `seeding_status`     | TEXT                  | Check seeding status (default 'not_started')         |
| `sections_processed` | INTEGER               | Sections processed during seeding (default 0)        |
| `sections_total`     | INTEGER               | Total sections to process during seeding (default 0) |
| `pdf_scale`          | NUMERIC(3,1)          | PDF rendering scale multiplier 1.0-6.0 (default 2.0) |

**Indexes:**

- `idx_assessments_seeding_status` on `seeding_status`

**Description:**
The `pdf_scale` column stores the user's preferred rendering scale for viewing floorplan details. Higher values provide more detail but use more memory.

---

### `checks`

Individual compliance checks for code sections within an assessment. All checks are flat section checks (no parent/child hierarchy).

**Schema:**

| Column                 | Type                           | Description                                                                                  |
| ---------------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| `id`                   | UUID PK                        | Primary key                                                                                  |
| `assessment_id`        | UUID FK → assessments.id       | Assessment reference (CASCADE delete)                                                        |
| `code_section_key`     | VARCHAR(255) FK → sections.key | Code section reference (RESTRICT delete)                                                     |
| `code_section_number`  | VARCHAR(100)                   | Section number (e.g., "11B-401.1")                                                           |
| `code_section_title`   | TEXT                           | Section title                                                                                |
| `check_name`           | VARCHAR(255)                   | Custom check name                                                                            |
| `check_location`       | VARCHAR(255)                   | Location identifier                                                                          |
| `instance_label`       | TEXT                           | Groups element checks (e.g., "Door 1", "Door 2"); NULL for standalone sections               |
| `check_type`           | TEXT                           | 'section' or 'element' (default 'section')                                                   |
| `element_group_id`     | UUID FK → element_groups.id    | Element group reference (SET NULL delete); NULL for standalone section checks                |
| `human_readable_title` | TEXT                           | Optional human-readable title for the check                                                  |
| `prompt_template_id`   | UUID FK → prompt_templates.id  | Prompt template reference                                                                    |
| `actual_prompt_used`   | TEXT                           | Final prompt sent to AI (with substitutions)                                                 |
| `status`               | VARCHAR(50)                    | Current status (default 'pending')                                                           |
| `requires_review`      | BOOLEAN                        | Requires human review (default FALSE)                                                        |
| `manual_status`        | TEXT                           | Manual judgment: compliant, non_compliant, not_applicable, insufficient_information, or NULL |
| `manual_status_note`   | TEXT                           | Explanation for manual status                                                                |
| `manual_status_at`     | TIMESTAMPTZ                    | When manual status was set                                                                   |
| `manual_status_by`     | TEXT                           | User who set the manual status                                                               |
| `is_excluded`          | BOOLEAN NOT NULL               | Whether check is excluded from assessment (default FALSE)                                    |
| `excluded_reason`      | TEXT                           | Reason for exclusion                                                                         |
| `created_at`           | TIMESTAMPTZ                    | Creation timestamp                                                                           |
| `updated_at`           | TIMESTAMPTZ                    | Last update timestamp (auto-updated by trigger)                                              |

**Architecture Notes:**

- **Two Check Types**:
  - `check_type='section'`: Traditional single-section checks
  - `check_type='element'`: Element-based checks covering multiple sections
- **Element Grouping**: Element checks use `element_group_id` + `instance_label` to group related sections
- **Exclusion System**: `is_excluded` flag allows checks to be removed from assessment without deletion
- **Example**: "Door 1" element check with `element_group_id='doors'` and `instance_label='Door 1'`

**Indexes:**

- `idx_assessment_section` on `(assessment_id, code_section_key)`
- `idx_checks_code_section_key` on `code_section_key`
- `idx_checks_type` on `check_type`
- `idx_checks_element_group` on `element_group_id`
- `idx_checks_manual_status` on `manual_status` (partial WHERE NOT NULL)
- `unique_check_per_section` UNIQUE on `(assessment_id, code_section_number, instance_label)` WHERE `check_type='section' AND instance_label IS NOT NULL`
- `unique_element_check` UNIQUE on `(assessment_id, code_section_key, instance_label)` WHERE `instance_label IS NOT NULL`
- `unique_section_check` UNIQUE on `(assessment_id, code_section_key)` WHERE `instance_label IS NULL`

**Constraints:**

- `checks_check_type_check`: check_type must be 'section' or 'element'
- `checks_manual_status_check`: manual_status must be 'compliant', 'non_compliant', 'not_applicable', or 'insufficient_information'

**Trigger:**

- `update_checks_updated_at`: Auto-updates `updated_at` on modification

---

### `element_groups`

Reusable groupings of related code sections by building element.

**Schema:**

| Column        | Type                 | Description                             |
| ------------- | -------------------- | --------------------------------------- |
| `id`          | UUID PK              | Primary key                             |
| `name`        | TEXT NOT NULL        | Element name (e.g., "Doors", "Ramps")   |
| `slug`        | TEXT UNIQUE NOT NULL | URL-friendly identifier (e.g., "doors") |
| `description` | TEXT                 | Element description                     |
| `icon`        | TEXT                 | Optional icon identifier                |
| `sort_order`  | INTEGER              | Display order (default 0)               |
| `created_at`  | TIMESTAMPTZ          | Creation timestamp                      |

---

### `element_section_mappings`

Maps element groups to applicable code sections. Supports both global mappings and assessment-specific overrides.

**Schema:**

| Column             | Type                           | Description                                                     |
| ------------------ | ------------------------------ | --------------------------------------------------------------- |
| `id`               | UUID PK                        | Primary key                                                     |
| `element_group_id` | UUID FK → element_groups.id    | Element group reference (CASCADE delete)                        |
| `section_key`      | VARCHAR(255) FK → sections.key | Section reference (CASCADE delete)                              |
| `assessment_id`    | UUID FK → assessments.id       | Assessment reference (CASCADE delete); NULL for global mappings |
| `created_at`       | TIMESTAMPTZ                    | Creation timestamp                                              |

**Indexes:**

- `idx_element_section_mappings_element` on `element_group_id`
- `idx_element_section_mappings_section` on `section_key`
- `idx_element_mappings_assessment` on `assessment_id`
- `element_section_mappings_global_unique` UNIQUE on `(element_group_id, section_key)` WHERE `assessment_id IS NULL`
- `element_section_mappings_assessment_unique` UNIQUE on `(element_group_id, section_key, assessment_id)` WHERE `assessment_id IS NOT NULL`

**Available Element Groups:**

- Doors (doors)
- Bathrooms (bathrooms)
- Kitchens (kitchens)
- Exit Signage (exit-signage)
- Assisted Listening (assisted-listening)
- Elevators (elevators)
- Elevator Signage (elevator-signage)
- Parking Signage (parking-signage)
- Ramps (ramps)
- Changes in Level (changes-in-level)
- Turning Spaces (turning-spaces)

**Mapping Strategy:**

- **Global mappings** (`assessment_id IS NULL`): Default section mappings for each element group
- **Assessment-specific mappings** (`assessment_id` set): Override or extend global mappings for specific assessments
- Query order: Check assessment-specific first, fall back to global

**Example:**
Element "Doors" globally maps to sections like 11B-404.2.6, 11B-404.2.7, etc. Individual assessments can add or override these mappings.

---

### `analysis_runs`

Historical record of AI assessments for each check.

**Schema:**

| Column                       | Type                | Description                                                |
| ---------------------------- | ------------------- | ---------------------------------------------------------- |
| `id`                         | UUID PK             | Primary key                                                |
| `check_id`                   | UUID FK → checks.id | Check reference (CASCADE delete)                           |
| `run_number`                 | INTEGER NOT NULL    | Sequential run number (default 1)                          |
| `compliance_status`          | VARCHAR(50)         | AI status: compliant, non_compliant, needs_review, unclear |
| `confidence`                 | VARCHAR(50)         | Confidence: high, medium, low                              |
| `ai_provider`                | VARCHAR(50)         | AI service: gemini, openai, anthropic                      |
| `ai_model`                   | VARCHAR(100)        | Model name (e.g., 'gemini-2.5-pro')                        |
| `ai_reasoning`               | TEXT                | AI explanation                                             |
| `violations`                 | JSONB               | Array of identified violations                             |
| `compliant_aspects`          | JSONB               | Array of compliant aspects                                 |
| `recommendations`            | JSONB               | Array of suggested fixes                                   |
| `additional_evidence_needed` | JSONB               | Array of additional info needed                            |
| `raw_ai_response`            | TEXT                | Full raw AI response                                       |
| `section_results`            | JSONB               | For element checks: per-section results                    |
| `batch_group_id`             | UUID                | Links batched analyses together                            |
| `batch_number`               | INTEGER             | Batch number (1-indexed)                                   |
| `total_batches`              | INTEGER             | Total batches in group                                     |
| `section_keys_in_batch`      | TEXT[]              | Section keys assessed in this batch                        |
| `executed_at`                | TIMESTAMPTZ         | When analysis was run (default now())                      |
| `execution_time_ms`          | INTEGER             | Analysis duration in milliseconds                          |

**Indexes:**

- `idx_analysis_runs_batch_group_id` on `batch_group_id`
- `idx_analysis_runs_section_results` GIN on `section_results`
- `analysis_runs_check_id_run_number_key` UNIQUE on `(check_id, run_number)`

---

### `screenshots`

Screenshots captured from PDF drawings for compliance evidence.

**Schema:**

| Column             | Type                        | Description                                                            |
| ------------------ | --------------------------- | ---------------------------------------------------------------------- |
| `id`               | UUID PK                     | Primary key                                                            |
| `analysis_run_id`  | UUID FK → analysis_runs.id  | Analysis run reference (SET NULL delete)                               |
| `page_number`      | INTEGER NOT NULL            | PDF page number                                                        |
| `crop_coordinates` | JSONB                       | {x, y, width, height, zoom_level}                                      |
| `screenshot_url`   | TEXT NOT NULL               | S3 URL to full screenshot                                              |
| `thumbnail_url`    | TEXT                        | S3 URL to thumbnail                                                    |
| `caption`          | TEXT                        | User caption/description                                               |
| `screenshot_type`  | TEXT NOT NULL               | Screenshot type: 'plan' or 'elevation' (default 'plan')                |
| `element_group_id` | UUID FK → element_groups.id | Element group reference for elevation categorization (SET NULL delete) |
| `extracted_text`   | TEXT                        | Text extracted from PDF region for searchability                       |
| `created_at`       | TIMESTAMPTZ                 | Creation timestamp                                                     |
| `created_by`       | UUID                        | User who captured it                                                   |

**Indexes:**

- `idx_screenshots_text_search` GIN on `to_tsvector('english', COALESCE(caption, '') || ' ' || COALESCE(extracted_text, ''))`
- `idx_screenshots_type` on `screenshot_type`
- `idx_screenshots_element_group` on `element_group_id` (partial WHERE NOT NULL)

**Constraints:**

- `screenshot_type` CHECK: Must be 'plan' or 'elevation'

**Usage:**

- **Plan screenshots**: Captured from floor plans during normal assessment workflow
- **Elevation screenshots**: Captured in bulk mode for reuse across multiple element instances
- **Text searchability**: `extracted_text` contains text from PDF source for full-text search
- **Element tagging**: `element_group_id` allows filtering elevations by building element type

**Note:** Screenshots are linked to checks via the `screenshot_check_assignments` junction table (many-to-many relationship).

---

### `screenshot_check_assignments`

Junction table linking screenshots to checks (many-to-many).

**Schema:**

| Column          | Type                     | Description                                                               |
| --------------- | ------------------------ | ------------------------------------------------------------------------- |
| `id`            | UUID PK                  | Primary key                                                               |
| `screenshot_id` | UUID FK → screenshots.id | Screenshot reference (CASCADE delete)                                     |
| `check_id`      | UUID FK → checks.id      | Check reference (CASCADE delete)                                          |
| `is_original`   | BOOLEAN                  | TRUE if screenshot was originally captured for this check (default FALSE) |
| `assigned_at`   | TIMESTAMPTZ              | When assignment was made (default now())                                  |
| `assigned_by`   | UUID                     | User who made the assignment                                              |

**Indexes:**

- `idx_screenshot_assignments_screenshot` on `screenshot_id`
- `idx_screenshot_assignments_check` on `check_id`
- `idx_screenshot_assignments_original` on `is_original` (partial WHERE TRUE)
- `screenshot_check_assignments_screenshot_id_check_id_key` UNIQUE on `(screenshot_id, check_id)`

**Purpose:**
Allows screenshots to be reused across multiple checks (e.g., one door photo used for multiple door-related code sections).

---

### `section_applicability_log`

Logs AI filtering decisions during assessment seeding.

**Schema:**

| Column                 | Type                     | Description                                                 |
| ---------------------- | ------------------------ | ----------------------------------------------------------- |
| `id`                   | UUID PK                  | Primary key                                                 |
| `assessment_id`        | UUID FK → assessments.id | Assessment reference (CASCADE delete)                       |
| `section_key`          | TEXT FK → sections.key   | Section reference (CASCADE delete)                          |
| `decision`             | BOOLEAN NOT NULL         | TRUE=included, FALSE=excluded                               |
| `decision_source`      | TEXT NOT NULL            | 'rule' (deterministic) or 'ai' (LLM-based) (default 'rule') |
| `decision_confidence`  | TEXT                     | Confidence level                                            |
| `reasons`              | TEXT[] NOT NULL          | Human-readable explanation bullets                          |
| `details`              | JSONB                    | Structured dimension-by-dimension evaluation                |
| `building_params_hash` | TEXT NOT NULL            | SHA256 of normalized variables                              |
| `variables_snapshot`   | JSONB NOT NULL           | Full normalized variables used                              |
| `created_at`           | TIMESTAMPTZ NOT NULL     | Creation timestamp (default now())                          |

**Indexes:**

- `idx_applicability_log_assessment` on `assessment_id`
- `idx_applicability_log_section` on `section_key`
- `idx_applicability_log_decision` on `decision`
- `section_applicability_log_assessment_id_section_key_decisio_key` UNIQUE on `(assessment_id, section_key, decision_source, building_params_hash)`

**Purpose:**

- Audit trail of AI filtering decisions
- Debugging applicability filtering logic
- Cache filtering results per building parameter combination

---

### `check_tags`

Tags applied to checks for categorization.

**Schema:**

| Column     | Type                  | Description                      |
| ---------- | --------------------- | -------------------------------- |
| `id`       | UUID PK               | Primary key                      |
| `check_id` | UUID FK → checks.id   | Check reference (CASCADE delete) |
| `tag`      | VARCHAR(100) NOT NULL | Tag value                        |

**Indexes:**

- `check_tags_check_id_tag_key` UNIQUE on `(check_id, tag)`

---

### `prompt_templates`

Reusable prompt templates for AI analysis.

**Schema:**

| Column                 | Type                  | Description                               |
| ---------------------- | --------------------- | ----------------------------------------- |
| `id`                   | UUID PK               | Primary key                               |
| `name`                 | VARCHAR(255) NOT NULL | Template name                             |
| `version`              | INTEGER NOT NULL      | Version number                            |
| `system_prompt`        | TEXT                  | System-level instructions                 |
| `user_prompt_template` | TEXT                  | User message template                     |
| `instruction_template` | TEXT                  | Additional instructions template          |
| `is_active`            | BOOLEAN               | Whether template is active (default TRUE) |
| `created_at`           | TIMESTAMPTZ           | Creation timestamp                        |
| `created_by`           | UUID                  | User who created it                       |

**Indexes:**

- `prompt_templates_name_version_key` UNIQUE on `(name, version)`

**Usage:**
Templates contain variables like `{{code_section}}`, `{{building_type}}` that are substituted at analysis time.

---

### `compliance_sessions`

Alternative compliance workflow sessions (client-facing compliance viewer).

**Schema:**

| Column       | Type                  | Description                            |
| ------------ | --------------------- | -------------------------------------- |
| `id`         | UUID PK               | Primary key                            |
| `project_id` | UUID FK → projects.id | Project reference (CASCADE delete)     |
| `code_id`    | TEXT                  | Building code identifier               |
| `status`     | TEXT                  | Session status (default 'in_progress') |
| `created_at` | TIMESTAMPTZ           | Creation timestamp                     |
| `updated_at` | TIMESTAMPTZ           | Last update timestamp                  |

**Indexes:**

- `idx_compliance_sessions_project_id` on `project_id`

**Purpose:**
Used by the client-facing compliance viewer (`/compliance/[projectId]`) as an alternative to the full assessment workflow.

---

### `section_checks`

Section-level checks within compliance sessions.

**Schema:**

| Column            | Type                             | Description                                               |
| ----------------- | -------------------------------- | --------------------------------------------------------- |
| `id`              | UUID PK                          | Primary key                                               |
| `session_id`      | UUID FK → compliance_sessions.id | Compliance session reference (CASCADE delete)             |
| `section_key`     | TEXT NOT NULL                    | Section reference                                         |
| `section_number`  | TEXT NOT NULL                    | Section number (e.g., "11B-404.2.6")                      |
| `section_title`   | TEXT NOT NULL                    | Section title                                             |
| `status`          | TEXT NOT NULL                    | Status (default 'pending')                                |
| `is_cloneable`    | BOOLEAN                          | Whether section allows multiple instances (default FALSE) |
| `screenshots`     | TEXT[]                           | Array of screenshot URLs (default '{}')                   |
| `analysis_result` | JSONB                            | AI analysis results                                       |
| `instances`       | JSONB                            | Multiple instances data (for cloneable sections)          |
| `created_at`      | TIMESTAMPTZ                      | Creation timestamp                                        |
| `updated_at`      | TIMESTAMPTZ                      | Last update timestamp                                     |

**Indexes:**

- `idx_section_checks_session_id` on `session_id`
- `idx_section_checks_section_key` on `section_key`

**Purpose:**
Simplified check structure for the compliance viewer workflow, separate from the main `checks` table.

---

### `section_screenshots`

Screenshots associated with section checks in the compliance viewer workflow.

**Schema:**

| Column             | Type                        | Description                                  |
| ------------------ | --------------------------- | -------------------------------------------- |
| `id`               | UUID PK                     | Primary key                                  |
| `section_check_id` | UUID FK → section_checks.id | Section check reference (CASCADE delete)     |
| `url`              | TEXT NOT NULL               | S3 URL to screenshot                         |
| `instance_id`      | UUID                        | Instance identifier (for cloneable sections) |
| `instance_name`    | VARCHAR(255)                | Instance name (e.g., "Door 1")               |
| `analysis_result`  | JSONB                       | AI analysis results for this screenshot      |
| `created_at`       | TIMESTAMPTZ                 | Creation timestamp (default now())           |

**Indexes:**

- `idx_section_screenshots_check_id` on `section_check_id`

**Purpose:**
Stores screenshots for the compliance viewer workflow, supporting multiple instances of the same section check (e.g., multiple doors).

---

### `pdf_chunks`

Searchable text chunks extracted from PDF pages for full-text search.

**Schema:**

| Column         | Type                  | Description                                           |
| -------------- | --------------------- | ----------------------------------------------------- |
| `id`           | UUID PK               | Primary key                                           |
| `project_id`   | UUID FK → projects.id | Project reference (CASCADE delete)                    |
| `page_number`  | INTEGER NOT NULL      | PDF page number                                       |
| `chunk_number` | INTEGER NOT NULL      | Chunk number within page (for large pages)            |
| `content`      | TEXT NOT NULL         | Raw text content extracted from PDF                   |
| `tsv`          | TSVECTOR              | Generated column for full-text search (auto-computed) |
| `created_at`   | TIMESTAMPTZ           | Creation timestamp                                    |

**Indexes:**

- `pdf_chunks_tsv_gin` GIN on `tsv` (full-text search index)
- `pdf_chunks_trgm_gin` GIN on `content gin_trgm_ops` (fuzzy search for OCR errors)
- `pdf_chunks_project_id` on `project_id`
- `unique_project_page_chunk` UNIQUE on `(project_id, page_number, chunk_number)`

**Purpose:**

Enables fast full-text search across PDF drawings using PostgreSQL's built-in search capabilities:

- **Full-text search** (tsvector): Fast keyword matching with stemming and ranking
- **Fuzzy search** (pg_trgm): Tolerant of OCR errors and typos using trigram similarity
- **Apostrophe normalization**: Search functions normalize apostrophes so "womens" matches "women's"
- **Page-level results**: Returns matching pages, then client-side code finds exact positions

**Search Functions:**

Two stored procedures provide search capabilities:

1. **`search_pdf_fulltext(project_id, query, limit)`**: Fast exact word matching using tsvector
   - Returns: `page_number`, `chunk_number`, `rank`
   - Uses websearch syntax (supports "quoted phrases", -exclusions, OR)

2. **`search_pdf_fuzzy(project_id, query, threshold, limit)`**: Fuzzy matching for OCR tolerance
   - Returns: `page_number`, `chunk_number`, `similarity`
   - Uses trigram similarity (threshold default 0.3)
   - Falls back when full-text search returns no results

**Workflow:**

1. Upload PDF → Background job extracts text page-by-page
2. Text chunked into `pdf_chunks` records with auto-generated `tsv`
3. User searches → API tries full-text first, falls back to fuzzy
4. API returns matching page numbers
5. Client loads those pages and highlights exact text positions using PDF.js

---

## Entity Relationship Diagram

```
┌─────────────┐
│  customers  │
└──────┬──────┘
       │ 1:N
       ▼
┌─────────────┐       ┌──────────────┐
│  projects   │──────▶│    codes     │
└──────┬──────┘  N:M  └──────┬───────┘
       │ (via          │ 1:N
       │  selected_    ▼
       │  code_ids)   ┌──────────────────────┐
       │              │      sections        │
       │ 1:N          └──────┬───────────────┘
       ├──────▶              │ (self-join parent-child)
       │                     │
       │ 1:N                 │ M:N (references)
       │                     │      ▼
       │              ┌──────────────────────┐
       │              │ section_references   │
       │              └──────────────────────┘
       ▼
┌──────────────┐
│ assessments  │
└──────┬───────┘
       │ 1:N
       ▼
┌──────────────┐
│   checks     │◀──── references section via code_section_key
└──────┬───────┘
       │    ┌─────────────────┐
       │    │ checks (child)  │
       │    └─────────────────┘
       │
       ├─────────┐ N:1
       │         ▼
       │    ┌──────────────────┐       ┌──────────────────────────────────┐
       │    │ element_groups   │──────▶│ element_group_section_mappings   │
       │    └──────────────────┘  1:N  └──────────────────────────────────┘
       │                                        │
       │                                        │ N:1
       │                                        ▼
       │                                  ┌──────────┐
       │                                  │ sections │
       │                                  └──────────┘
       │ 1:N
       ▼
┌──────────────┐
│analysis_runs │
└──────┬───────┘
       │ 1:N (via analysis_run_id)
       ▼
┌──────────────┐       ┌────────────────────────────┐
│ screenshots  │◀─────▶│screenshot_check_assignments│
└──────────────┘  N:M  └────────────────────────────┘
                              │
                              │ N:1
                              ▼
                        ┌──────────┐
                        │  checks  │
                        └──────────┘

┌──────────────┐       ┌──────────────────────────┐
│ assessments  │──────▶│section_applicability_log │
└──────────────┘  1:N  └──────────────────────────┘
                              │
                              │ N:1
                              ▼
                        ┌──────────┐
                        │ sections │
                        └──────────┘

┌─────────────┐
│  projects   │
└──────┬──────┘
       │ 1:N (pdf_chunks)
       ├──────────────────────────┐
       │                          │
       │ 1:N                      ▼
       │                   ┌──────────────┐
       │                   │  pdf_chunks  │ (searchable text)
       │                   └──────────────┘
       │
       │ 1:N
       ▼
┌─────────────────────┐
│ compliance_sessions │
└──────┬──────────────┘
       │ 1:N
       ▼
┌──────────────────┐       ┌──────────────────────┐
│ section_checks   │──────▶│ section_screenshots  │
└──────────────────┘  1:N  └──────────────────────┘
```

## Key Patterns

### Check Instance Pattern

- **Section checks**: `check_type='section'`, single code section per check
- **Element checks**: `check_type='element'`, multiple sections assessed together
- **Instance labeling**: Use `instance_label` to group multiple instances (e.g., "Door 1", "Door 2")
- **Exclusion**: Use `is_excluded=true` to remove checks from assessment without deletion

### Manual Status System

The `checks.manual_status` field allows human reviewers to override AI:

- Takes precedence over any `analysis_runs` results
- Values: 'compliant', 'non_compliant', 'not_applicable', 'insufficient_information', or NULL
- Includes timestamp (`manual_status_at`) and user tracking (`manual_status_by`)
- Setting to NULL reverts to AI assessment

### Screenshot Assignment

Screenshots have a many-to-many relationship with checks:

1. Screenshot captured and uploaded to S3
2. Record created in `screenshots` table
3. Assignment created in `screenshot_check_assignments` linking to check(s)
4. `is_original = TRUE` for the check it was originally captured for
5. Same screenshot can be reused for multiple checks

### Progress Calculation

Assessment progress = `assessed_sections / total_sections`

A check is considered "assessed" if:

- It has a `manual_status` value (excluding 'not_applicable'), OR
- It has at least one `analysis_run` with a `compliance_status`

Checks with `is_excluded=true` or marked as `not_applicable` are excluded from the total count.

## Common Queries

### Get assessment with progress

```sql
SELECT
  a.*,
  COUNT(c.id) FILTER (WHERE c.is_excluded = false AND (c.manual_status != 'not_applicable' OR c.manual_status IS NULL)) as total_checks,
  COUNT(c.id) FILTER (
    WHERE c.is_excluded = false AND (ar.compliance_status IS NOT NULL OR
           (c.manual_status IS NOT NULL AND c.manual_status != 'not_applicable'))
  ) as completed_checks
FROM assessments a
LEFT JOIN checks c ON c.assessment_id = a.id
LEFT JOIN LATERAL (
  SELECT compliance_status
  FROM analysis_runs
  WHERE check_id = c.id
  ORDER BY run_number DESC
  LIMIT 1
) ar ON true
WHERE a.id = $1
GROUP BY a.id;
```

### Get check with latest AI analysis

```sql
SELECT
  c.*,
  ar.compliance_status as latest_status,
  ar.confidence as latest_confidence,
  ar.ai_reasoning
FROM checks c
LEFT JOIN LATERAL (
  SELECT *
  FROM analysis_runs
  WHERE check_id = c.id
  ORDER BY run_number DESC
  LIMIT 1
) ar ON true
WHERE c.id = $1;
```

### Get screenshots for a check

```sql
SELECT s.*
FROM screenshots s
INNER JOIN screenshot_check_assignments sca ON sca.screenshot_id = s.id
WHERE sca.check_id = $1
ORDER BY s.created_at;
```

### Get element sections for element check

```sql
SELECT s.*
FROM sections s
JOIN element_section_mappings esm ON s.key = esm.section_key
JOIN checks c ON c.element_group_id = esm.element_group_id
WHERE c.id = $1
  AND (esm.assessment_id = c.assessment_id OR esm.assessment_id IS NULL)
ORDER BY s.number;
```

### Search PDF text (full-text)

```sql
SELECT * FROM search_pdf_fulltext(
  'project-uuid-here'::uuid,
  'womens restroom',
  50
) ORDER BY rank DESC;
```

### Search PDF text (fuzzy, for OCR errors)

```sql
SELECT * FROM search_pdf_fuzzy(
  'project-uuid-here'::uuid,
  'restrrom',  -- typo/OCR error
  0.3,
  50
) ORDER BY similarity DESC;
```

### Check PDF chunking status

```sql
SELECT
  id,
  name,
  chunking_status,
  chunking_started_at,
  chunking_completed_at,
  chunking_error,
  (SELECT COUNT(*) FROM pdf_chunks WHERE project_id = projects.id) as chunk_count
FROM projects
WHERE id = $1;
```

## Data Loading

Use the upload script to load code data:

```bash
python scripts/load_db/unified_code_upload_supabase.py --file path/to/code.json
```

For element-section mappings:

```bash
python scripts/tag_element_sections.py
```
