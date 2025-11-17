# Building Codes Database Schema

## Overview

This database stores building code documents (e.g., California Building Code, ICC A117.1) and their hierarchical section structure in PostgreSQL/Supabase. It also manages compliance assessments, AI analysis runs, and screenshot evidence.

_This file is auto-generated from the database schema. Do not edit manually._

_Source: **Production** database_

_Last generated: Run `python scripts/generate_schema_docs.py` to regenerate._

## Core Tables

### `codes`

**Schema:**

| Column         | Type             | Description                |
| -------------- | ---------------- | -------------------------- |
| `id`           | TEXT NOT NULL PK |                            |
| `year`         | TEXT NOT NULL    |                            |
| `jurisdiction` | TEXT             |                            |
| `title`        | TEXT NOT NULL    |                            |
| `source_url`   | TEXT             |                            |
| `created_at`   | TIMESTAMPTZ      | Default: Current timestamp |
| `updated_at`   | TIMESTAMPTZ      | Default: Current timestamp |

**Indexes:**

- `idx_codes_jurisdiction` on `(jurisdiction)`
- `idx_codes_version` on `(year)`

---

### `sections`

**Schema:**

| Column                           | Type                                         | Description                                                                                                                                        |
| -------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`                            | TEXT NOT NULL                                |                                                                                                                                                    |
| `code_id`                        | TEXT NOT NULL FK → codes.id (CASCADE delete) |                                                                                                                                                    |
| `parent_key`                     | TEXT FK → sections.key (CASCADE delete)      |                                                                                                                                                    |
| `number`                         | TEXT NOT NULL                                |                                                                                                                                                    |
| `title`                          | TEXT NOT NULL                                |                                                                                                                                                    |
| `text`                           | TEXT                                         |                                                                                                                                                    |
| `item_type`                      | TEXT NOT NULL                                |                                                                                                                                                    |
| `code_type`                      | TEXT NOT NULL                                |                                                                                                                                                    |
| `paragraphs`                     | JSONB                                        | Default: '[]'::jsonb                                                                                                                               |
| `source_url`                     | TEXT                                         |                                                                                                                                                    |
| `source_page`                    | INTEGER                                      |                                                                                                                                                    |
| `hash`                           | TEXT NOT NULL                                |                                                                                                                                                    |
| `created_at`                     | TIMESTAMPTZ                                  | Default: Current timestamp                                                                                                                         |
| `updated_at`                     | TIMESTAMPTZ                                  | Default: Current timestamp                                                                                                                         |
| `chapter`                        | TEXT                                         | 11A or 11B for CBC sections; denormalized from number                                                                                              |
| `always_include`                 | BOOLEAN                                      | TRUE for scoping/definitions/administrative sections; Default: false                                                                               |
| `applicable_occupancies`         | ARRAY                                        | Occupancy letters [A,B,E,...]; NULL means no restriction                                                                                           |
| `requires_parking`               | BOOLEAN                                      | TRUE if section only applies when site has parking                                                                                                 |
| `requires_elevator`              | BOOLEAN                                      | TRUE if section only applies when elevator required                                                                                                |
| `min_building_size`              | INTEGER                                      | Minimum per-story gross floor area (sf) threshold                                                                                                  |
| `max_building_size`              | INTEGER                                      | Maximum per-story gross floor area (sf) threshold                                                                                                  |
| `applicable_work_types`          | ARRAY                                        | Work type strings matching project variables                                                                                                       |
| `applicable_facility_categories` | ARRAY                                        | Facility category strings                                                                                                                          |
| `applicability_notes`            | TEXT                                         | Maintainer notes about applicability logic                                                                                                         |
| `drawing_assessable`             | BOOLEAN                                      | Whether this section can be assessed from architectural drawings; Default: true                                                                    |
| `assessability_tags`             | ARRAY                                        | Tags explaining why section may not be assessable: too_short, placeholder, definitional, administrative, procedural, summary, not_physical         |
| `tables`                         | JSONB                                        | Array of table objects with number, title, and CSV data; Default: '[]'::jsonb                                                                      |
| `figures`                        | JSONB                                        | Array of figure URLs (prefixed with "figure:" or "table:" type); Default: '[]'::jsonb                                                              |
| `never_relevant`                 | BOOLEAN NOT NULL                             | Global flag to exclude this section from all future assessments. Cannot be easily reversed.; Default: false                                        |
| `floorplan_relevant`             | BOOLEAN NOT NULL                             | Flag to mark sections as specifically relevant to floorplan analysis. These sections are prioritized when returning code sections.; Default: false |
| `chapter_id`                     | UUID NOT NULL FK → chapters.id               |                                                                                                                                                    |
| `id`                             | UUID NOT NULL PK                             | Default: gen_random_uuid()                                                                                                                         |
| `id_new`                         | UUID                                         | Default: gen_random_uuid()                                                                                                                         |

**Indexes:**

- `idx_sections_app_fac` on `(applicable_facility_categories)`
- `idx_sections_app_occ` on `(applicable_occupancies)`
- `idx_sections_app_work` on `(applicable_work_types)`
- `idx_sections_assessability_tags` on `(assessability_tags)`
- `idx_sections_chapter` on `(chapter)`
- `idx_sections_code_id` on `(code_id)`
- `idx_sections_drawing_assessable` on `(drawing_assessable)`
- `idx_sections_elevator` on `(requires_elevator)`
- `idx_sections_figures` on `(figures)`
- `idx_sections_floorplan_relevant` on `(floorplan_relevant)` WHERE (floorplan_relevant = true)
- `idx_sections_key` on `(key)`
- `idx_sections_max_size` on `(max_building_size)`
- `idx_sections_min_size` on `(min_building_size)`
- `idx_sections_never_relevant` on `(never_relevant)` WHERE (never_relevant = true)
- `idx_sections_number` on `(number)`
- `idx_sections_parking` on `(requires_parking)`
- `idx_sections_tables` on `(tables)`
- `sections_key_key` UNIQUE on `(key)`
- `unique_section_number_per_code` UNIQUE on `(code_id, number)`

**Constraints:**

- `chk_sections_work_types_values`: CHECK (validate_work_types(applicable_work_types))
- `sections_code_type_check`: CHECK ((code_type = ANY (ARRAY['accessibility'::text, 'building'::text, 'fire'::text, 'plumbing'::text, 'mechanical'::text, 'energy'::text])))
- `sections_item_type_check`: CHECK ((item_type = ANY (ARRAY['section'::text, 'subsection'::text])))

---

### `section_references`

**Schema:**

| Column               | Type                                             | Description                |
| -------------------- | ------------------------------------------------ | -------------------------- |
| `id`                 | INTEGER NOT NULL PK                              | Default: Auto-incrementing |
| `source_section_key` | TEXT NOT NULL FK → sections.key (CASCADE delete) |                            |
| `target_section_key` | TEXT NOT NULL FK → sections.key (CASCADE delete) |                            |
| `explicit`           | BOOLEAN                                          | Default: true              |
| `citation_text`      | TEXT                                             |                            |
| `created_at`         | TIMESTAMPTZ                                      | Default: Current timestamp |
| `source_section_id`  | UUID NOT NULL FK → sections.id (CASCADE delete)  |                            |
| `target_section_id`  | UUID NOT NULL FK → sections.id (CASCADE delete)  |                            |

**Indexes:**

- `idx_section_refs_source` on `(source_section_key)`
- `idx_section_refs_source_id` on `(source_section_id)`
- `idx_section_refs_target` on `(target_section_key)`
- `idx_section_refs_target_id` on `(target_section_id)`
- `section_references_unique_id` UNIQUE on `(source_section_id, target_section_id)`
- `unique_section_reference` UNIQUE on `(source_section_key, target_section_key)`

**Constraints:**

- `no_self_reference`: CHECK ((source_section_key <> target_section_key))

---

## Element Tables

### `element_groups`

Element categories including: doors, bathrooms, kitchens, exit-signage, assisted-listening, elevators, elevator-signage, parking-signage, ramps, changes-in-level, turning-spaces, walls

**Schema:**

| Column        | Type             | Description                |
| ------------- | ---------------- | -------------------------- |
| `id`          | UUID NOT NULL PK | Default: gen_random_uuid() |
| `name`        | TEXT NOT NULL    |                            |
| `slug`        | TEXT NOT NULL    |                            |
| `description` | TEXT             |                            |
| `icon`        | TEXT             |                            |
| `sort_order`  | INTEGER          | Default: 0                 |
| `created_at`  | TIMESTAMPTZ      | Default: Current timestamp |

**Indexes:**

- `element_groups_slug_key` UNIQUE on `(slug)`

---

### `element_instances`

Physical element instances (e.g., "Door 1", "Bathroom 2") that group related section checks

**Schema:**

| Column             | Type                                                  | Description                                                                                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | UUID NOT NULL PK                                      | Default: gen_random_uuid()                                                                                                                                                                                                                     |
| `assessment_id`    | UUID NOT NULL FK → assessments.id (CASCADE delete)    |                                                                                                                                                                                                                                                |
| `element_group_id` | UUID NOT NULL FK → element_groups.id (CASCADE delete) |                                                                                                                                                                                                                                                |
| `label`            | VARCHAR NOT NULL                                      | User-facing label, auto-generated if not provided (e.g., "Door 1")                                                                                                                                                                             |
| `created_at`       | TIMESTAMPTZ                                           | Default: Current timestamp                                                                                                                                                                                                                     |
| `updated_at`       | TIMESTAMPTZ                                           | Default: Current timestamp                                                                                                                                                                                                                     |
| `parameters`       | JSONB                                                 | JSONB field storing element-specific parameters (e.g., door measurements: clear_width_inches, pull_side_perpendicular_clearance_inches). Structure varies by element_group_id and maps to DoorParameters type for doors.; Default: '{}'::jsonb |
| `bounding_box`     | JSONB                                                 | JSONB field storing PDF bounding box coordinates in points: {x: number, y: number, width: number, height: number}. Used for highlighting element location on PDF.                                                                              |
| `page_number`      | INTEGER                                               | PDF page number (1-indexed) where this element instance is located.                                                                                                                                                                            |

**Indexes:**

- `element_instances_assessment_id_element_group_id_label_key` UNIQUE on `(assessment_id, element_group_id, label)`
- `idx_element_instances_assessment_group` on `(assessment_id, element_group_id)`
- `idx_element_instances_page_number` on `(page_number)`
- `idx_element_instances_parameters` on `(parameters)`

---

### `element_section_mappings`

Maps which code sections apply to each element group (e.g., Doors -> [11B-404.2.6, 11B-404.2.7])

**Schema:**

| Column             | Type                                                     | Description                                                          |
| ------------------ | -------------------------------------------------------- | -------------------------------------------------------------------- |
| `id`               | UUID NOT NULL PK                                         | Default: gen_random_uuid()                                           |
| `element_group_id` | UUID NOT NULL FK → element_groups.id (CASCADE delete)    |                                                                      |
| `section_key`      | VARCHAR(255) NOT NULL FK → sections.key (CASCADE delete) |                                                                      |
| `created_at`       | TIMESTAMPTZ                                              | Default: Current timestamp                                           |
| `assessment_id`    | UUID FK → assessments.id (CASCADE delete)                | NULL for global defaults, non-NULL for assessment-specific overrides |
| `section_id`       | UUID NOT NULL FK → sections.id (CASCADE delete)          |                                                                      |

**Indexes:**

- `element_section_mappings_assessment_unique` UNIQUE on `(element_group_id, section_key, assessment_id)` WHERE (assessment_id IS NOT NULL)
- `element_section_mappings_assessment_unique_id` UNIQUE on `(element_group_id, section_id, assessment_id)` WHERE (assessment_id IS NOT NULL)
- `element_section_mappings_global_unique` UNIQUE on `(element_group_id, section_key)` WHERE (assessment_id IS NULL)
- `element_section_mappings_global_unique_id` UNIQUE on `(element_group_id, section_id)` WHERE (assessment_id IS NULL)
- `idx_element_mappings_assessment` on `(assessment_id)`
- `idx_element_section_mappings_element` on `(element_group_id)`
- `idx_element_section_mappings_section` on `(section_key)`
- `idx_element_section_mappings_section_id` on `(section_id)`

---

## Assessment Tables

### `customers`

**Schema:**

| Column          | Type                  | Description                |
| --------------- | --------------------- | -------------------------- |
| `id`            | UUID NOT NULL PK      | Default: gen_random_uuid() |
| `name`          | VARCHAR(255) NOT NULL |                            |
| `contact_email` | VARCHAR(255)          |                            |
| `contact_phone` | VARCHAR(50)           |                            |
| `address`       | TEXT                  |                            |
| `created_at`    | TIMESTAMPTZ           | Default: Current timestamp |
| `updated_at`    | TIMESTAMPTZ           | Default: Current timestamp |

---

### `projects`

**Schema:**

| Column              | Type                                    | Description                               |
| ------------------- | --------------------------------------- | ----------------------------------------- |
| `id`                | UUID NOT NULL PK                        | Default: gen_random_uuid()                |
| `customer_id`       | UUID FK → customers.id (CASCADE delete) |                                           |
| `name`              | VARCHAR(255) NOT NULL                   |                                           |
| `description`       | TEXT                                    |                                           |
| `building_address`  | TEXT                                    |                                           |
| `building_type`     | VARCHAR(100)                            |                                           |
| `code_assembly_id`  | VARCHAR(255)                            |                                           |
| `pdf_url`           | TEXT                                    |                                           |
| `status`            | VARCHAR(50)                             | Default: 'in_progress'::character varying |
| `created_at`        | TIMESTAMPTZ                             | Default: Current timestamp                |
| `updated_at`        | TIMESTAMPTZ                             | Default: Current timestamp                |
| `selected_code_ids` | ARRAY                                   | Array                                     |

of Neo4j Code node IDs that are
relevant to this project |
| `extracted_variables` | JSONB | JSON
object containing extracted building
variables from PDF |
| `extraction_status` | VARCHAR(50) | Status: pending, processing,
completed, failed; Default: 'pending'::character varying |
| `extraction_progress` | JSONB | Progress tracking: {current: number,
total: number, category: string} |
| `extraction_started_at` | TIMESTAMPTZ | |
| `extraction_completed_at` | TIMESTAMPTZ | |
| `extraction_error` | TEXT | |
| `unannotated_drawing_url` | TEXT | S3 URL to the original architectural drawings PDF without markups or annotations |
| `report_password` | TEXT | Bcrypt-hashed password for customer report access (publicly accessible) |
| `chunking_status` | VARCHAR(50) | Default: 'pending'::character varying |
| `chunking_started_at` | TIMESTAMPTZ | |
| `chunking_completed_at` | TIMESTAMPTZ | |
| `chunking_error` | TEXT | |
| `pdf_width_points` | NUMERIC | PDF page width in points (includes UserUnit scaling) |
| `pdf_height_points` | NUMERIC | PDF page height in points (includes UserUnit scaling) |
| `pdf_width_inches` | NUMERIC | PDF page width in inches (points / 72) |
| `pdf_height_inches` | NUMERIC | PDF page height in inches (points / 72) |

**Indexes:**

- `idx_projects_chunking_status` on `(chunking_status)`
- `idx_projects_extraction_status` on `(extraction_status)`

---

### `assessments`

**Schema:**

| Column                 | Type                                   | Description                                                                         |
| ---------------------- | -------------------------------------- | ----------------------------------------------------------------------------------- |
| `id`                   | UUID NOT NULL PK                       | Default: gen_random_uuid()                                                          |
| `project_id`           | UUID FK → projects.id (CASCADE delete) |                                                                                     |
| `started_at`           | TIMESTAMPTZ                            | Default: Current timestamp                                                          |
| `completed_at`         | TIMESTAMPTZ                            |                                                                                     |
| `total_sections`       | INTEGER                                |                                                                                     |
| `assessed_sections`    | INTEGER                                | Default: 0                                                                          |
| `status`               | VARCHAR(50)                            | Default: 'in_progress'::character varying                                           |
| `seeding_status`       | TEXT                                   | Default: 'not_started'::text                                                        |
| `sections_processed`   | INTEGER                                | Default: 0                                                                          |
| `sections_total`       | INTEGER                                | Default: 0                                                                          |
| `pdf_scale`            | NUMERIC                                | PDF rendering scale multiplier (1.0-6.0) for floorplan detail viewing; Default: 2.0 |
| `selected_chapter_ids` | ARRAY                                  |                                                                                     |

**Indexes:**

- `idx_assessments_seeding_status` on `(seeding_status)`
- `idx_assessments_selected_chapters` on `(selected_chapter_ids)`

---

### `checks`

**Schema:**

| Column                 | Type                                            | Description                                                                                                      |
| ---------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `id`                   | UUID NOT NULL PK                                | Default: gen_random_uuid()                                                                                       |
| `assessment_id`        | UUID FK → assessments.id (CASCADE delete)       |                                                                                                                  |
| `code_section_number`  | VARCHAR(100)                                    | Denormalized section number for display and sorting. Populated from sections.number via section_id FK.           |
| `code_section_title`   | TEXT                                            | Denormalized section title for display. Populated from sections.title via section_id FK.                         |
| `check_name`           | VARCHAR(255)                                    |                                                                                                                  |
| `check_location`       | VARCHAR(255)                                    |                                                                                                                  |
| `prompt_template_id`   | UUID FK → prompt_templates.id                   |                                                                                                                  |
| `status`               | VARCHAR(50)                                     | Default: 'pending'::character varying                                                                            |
| `created_at`           | TIMESTAMPTZ                                     | Default: Current timestamp                                                                                       |
| `updated_at`           | TIMESTAMPTZ                                     | Default: Current timestamp                                                                                       |
| `requires_review`      | BOOLEAN                                         | Default: false                                                                                                   |
| `instance_label`       | TEXT                                            | DEPRECATED: Use element_instance_id FK instead. Kept for backwards compatibility with old checks.                |
| `manual_status`        | TEXT                                            | Human override status: compliant, non_compliant, not_applicable, or insufficient_information                     |
| `manual_status_note`   | TEXT                                            | Optional explanation for the manual override decision                                                            |
| `manual_status_at`     | TIMESTAMPTZ                                     | Timestamp when manual override was set                                                                           |
| `manual_status_by`     | TEXT                                            | User who set the manual override                                                                                 |
| `element_group_id`     | UUID FK → element_groups.id (SET NULL delete)   | DEPRECATED: Use element_instance_id FK to get element group. Kept for backwards compatibility.                   |
| `human_readable_title` | TEXT                                            | AI-generated natural language title for violations (e.g., "Bathroom door too narrow"). Generated by GPT-4o-mini. |
| `is_excluded`          | BOOLEAN NOT NULL                                | Whether this check is excluded from the assessment; Default: false                                               |
| `excluded_reason`      | TEXT                                            | Reason why this check was excluded                                                                               |
| `section_id`           | UUID NOT NULL FK → sections.id (CASCADE delete) |                                                                                                                  |
| `element_instance_id`  | UUID FK → element_instances.id (CASCADE delete) | Links section checks to their parent element instance                                                            |

**Indexes:**

- `idx_checks_assessment_excluded_manual` on `(assessment_id, is_excluded, manual_status)` WHERE (is_excluded IS FALSE)
- `idx_checks_assessment_id` on `(assessment_id)`
- `idx_checks_assessment_manual_status` on `(assessment_id, manual_status)`
- `idx_checks_assessment_section_id` on `(assessment_id, section_id)`
- `idx_checks_assessment_status` on `(assessment_id, status)`
- `idx_checks_element_group` on `(element_group_id)`
- `idx_checks_element_instance` on `(element_instance_id)`
- `idx_checks_manual_status` on `(manual_status)` WHERE (manual_status IS NOT NULL)
- `idx_checks_section_id` on `(section_id)`
- `idx_checks_unique_element_based` UNIQUE on `(assessment_id, section_id, element_instance_id)` WHERE (element_instance_id IS NOT NULL)
- `idx_checks_unique_section_based` UNIQUE on `(assessment_id, section_id)` WHERE (element_group_id IS NULL)

**Constraints:**

- `checks_manual_status_check`: CHECK ((manual_status = ANY (ARRAY['compliant'::text, 'non_compliant'::text, 'not_applicable'::text, 'insufficient_information'::text])))

---

### `analysis_runs`

**Schema:**

| Column                       | Type                                 | Description                                                                            |
| ---------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| `id`                         | UUID NOT NULL PK                     | Default: gen_random_uuid()                                                             |
| `check_id`                   | UUID FK → checks.id (CASCADE delete) |                                                                                        |
| `run_number`                 | INTEGER NOT NULL                     | Default: 1                                                                             |
| `compliance_status`          | VARCHAR(50)                          |                                                                                        |
| `confidence`                 | VARCHAR(50)                          |                                                                                        |
| `ai_provider`                | VARCHAR(50)                          |                                                                                        |
| `ai_model`                   | VARCHAR(100)                         |                                                                                        |
| `ai_reasoning`               | TEXT                                 |                                                                                        |
| `violations`                 | JSONB                                |                                                                                        |
| `compliant_aspects`          | JSONB                                |                                                                                        |
| `recommendations`            | JSONB                                |                                                                                        |
| `additional_evidence_needed` | JSONB                                |                                                                                        |
| `raw_ai_response`            | TEXT                                 |                                                                                        |
| `executed_at`                | TIMESTAMPTZ                          | Default: Current timestamp                                                             |
| `execution_time_ms`          | INTEGER                              |                                                                                        |
| `section_results`            | JSONB                                | For element checks: array of per-section compliance results. For section checks: null. |
| `batch_group_id`             | UUID                                 | Links multiple batched assessment runs together                                        |
| `batch_number`               | INTEGER                              | Which batch this is (1-indexed)                                                        |
| `total_batches`              | INTEGER                              | Total number of batches in this group                                                  |
| `section_keys_in_batch`      | ARRAY                                | Array of code section keys assessed in this batch                                      |

**Indexes:**

- `analysis_runs_check_id_run_number_key` UNIQUE on `(check_id, run_number)`
- `idx_analysis_runs_batch_group_id` on `(batch_group_id)`
- `idx_analysis_runs_check_id_run_number` on `(check_id, run_number)`
- `idx_analysis_runs_check_run` on `(check_id, run_number)`
- `idx_analysis_runs_section_results` on `(section_results)`

---

### `screenshots`

**Schema:**

| Column             | Type                                          | Description                |
| ------------------ | --------------------------------------------- | -------------------------- |
| `id`               | UUID NOT NULL PK                              | Default: gen_random_uuid() |
| `analysis_run_id`  | UUID FK → analysis_runs.id (SET NULL delete)  |                            |
| `page_number`      | INTEGER NOT NULL                              |                            |
| `crop_coordinates` | JSONB                                         |                            |
| `screenshot_url`   | TEXT NOT NULL                                 |                            |
| `thumbnail_url`    | TEXT                                          |                            |
| `caption`          | TEXT                                          |                            |
| `created_at`       | TIMESTAMPTZ                                   | Default: Current timestamp |
| `created_by`       | UUID                                          |                            |
| `screenshot_type`  | TEXT NOT NULL                                 | Default: 'plan'::text      |
| `element_group_id` | UUID FK → element_groups.id (SET NULL delete) |                            |
| `extracted_text`   | TEXT                                          |                            |

**Indexes:**

- `idx_screenshots_element_group` on `(element_group_id)` WHERE (element_group_id IS NOT NULL)
- `idx_screenshots_text_search` on `(to_tsvector('english'::regconfig, (COALESCE(caption, ''::text) || ' '::text) || COALESCE(extracted_text, ''::text)))`
- `idx_screenshots_type` on `(screenshot_type)`

**Constraints:**

- `screenshots_screenshot_type_check`: CHECK ((screenshot_type = ANY (ARRAY['plan'::text, 'elevation'::text])))

---

### `screenshot_check_assignments`

**Schema:**

| Column          | Type                                               | Description                |
| --------------- | -------------------------------------------------- | -------------------------- |
| `id`            | UUID NOT NULL PK                                   | Default: gen_random_uuid() |
| `screenshot_id` | UUID NOT NULL FK → screenshots.id (CASCADE delete) |                            |
| `check_id`      | UUID NOT NULL FK → checks.id (CASCADE delete)      |                            |
| `is_original`   | BOOLEAN                                            | Default: false             |
| `assigned_at`   | TIMESTAMPTZ                                        | Default: Current timestamp |
| `assigned_by`   | UUID                                               |                            |

**Indexes:**

- `idx_screenshot_assignments_check` on `(check_id)`
- `idx_screenshot_assignments_original` on `(is_original)` WHERE (is_original = true)
- `idx_screenshot_assignments_screenshot` on `(screenshot_id)`
- `screenshot_check_assignments_screenshot_id_check_id_key` UNIQUE on `(screenshot_id, check_id)`

---

## Other Tables

### `chapters`

**Schema:**

| Column    | Type                        | Description                |
| --------- | --------------------------- | -------------------------- |
| `id`      | UUID NOT NULL PK            | Default: gen_random_uuid() |
| `code_id` | TEXT NOT NULL FK → codes.id |                            |
| `name`    | TEXT NOT NULL               |                            |
| `number`  | TEXT NOT NULL               |                            |
| `url`     | TEXT NOT NULL               |                            |

**Indexes:**

- `chapters_code_id_number_key` UNIQUE on `(code_id, number)`

---

### `check_tags`

**Schema:**

| Column     | Type                                 | Description                |
| ---------- | ------------------------------------ | -------------------------- |
| `id`       | UUID NOT NULL PK                     | Default: gen_random_uuid() |
| `check_id` | UUID FK → checks.id (CASCADE delete) |                            |
| `tag`      | VARCHAR(100) NOT NULL                |                            |

**Indexes:**

- `check_tags_check_id_tag_key` UNIQUE on `(check_id, tag)`

---

### `compliance_sessions`

**Schema:**

| Column       | Type                                   | Description                               |
| ------------ | -------------------------------------- | ----------------------------------------- |
| `id`         | UUID NOT NULL PK                       | Default: gen_random_uuid()                |
| `project_id` | UUID FK → projects.id (CASCADE delete) |                                           |
| `code_id`    | VARCHAR(255) NOT NULL                  |                                           |
| `status`     | VARCHAR(50)                            | Default: 'in_progress'::character varying |
| `created_at` | TIMESTAMPTZ                            | Default: Current timestamp                |
| `updated_at` | TIMESTAMPTZ                            | Default: Current timestamp                |

**Indexes:**

- `idx_compliance_sessions_project_id` on `(project_id)`

**Constraints:**

- `compliance_sessions_status_check`: CHECK (((status)::text = ANY ((ARRAY['in_progress'::character varying, 'completed'::character varying, 'paused'::character varying])::text[])))

---

### `pdf_chunks`

**Schema:**

| Column         | Type                                            | Description                |
| -------------- | ----------------------------------------------- | -------------------------- |
| `id`           | UUID NOT NULL PK                                | Default: gen_random_uuid() |
| `project_id`   | UUID NOT NULL FK → projects.id (CASCADE delete) |                            |
| `page_number`  | INTEGER NOT NULL                                |                            |
| `chunk_number` | INTEGER NOT NULL                                |                            |
| `content`      | TEXT NOT NULL                                   |                            |
| `tsv`          | TSVECTOR                                        |                            |
| `created_at`   | TIMESTAMPTZ                                     | Default: Current timestamp |

**Indexes:**

- `pdf_chunks_project_id` on `(project_id)`
- `pdf_chunks_trgm_gin` on `(content)`
- `pdf_chunks_tsv_gin` on `(tsv)`
- `unique_project_page_chunk` UNIQUE on `(project_id, page_number, chunk_number)`

---

### `pdf_measurements`

Manual distance measurements drawn on floor plan PDFs

**Schema:**

| Column                 | Type                                            | Description                                                                        |
| ---------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| `id`                   | UUID NOT NULL PK                                | Default: gen_random_uuid()                                                         |
| `project_id`           | UUID NOT NULL FK → projects.id (CASCADE delete) |                                                                                    |
| `page_number`          | INTEGER NOT NULL                                |                                                                                    |
| `start_point`          | JSONB NOT NULL                                  |                                                                                    |
| `end_point`            | JSONB NOT NULL                                  |                                                                                    |
| `pixels_distance`      | NUMERIC NOT NULL                                |                                                                                    |
| `real_distance_inches` | NUMERIC                                         | Calculated distance in inches using page calibration (NULL if page not calibrated) |
| `label`                | TEXT                                            |                                                                                    |
| `color`                | TEXT                                            | Default: '#3B82F6'::text                                                           |
| `created_at`           | TIMESTAMPTZ NOT NULL                            | Default: Current timestamp                                                         |
| `created_by`           | UUID                                            |                                                                                    |

**Indexes:**

- `idx_pdf_measurements_project` on `(project_id)`
- `idx_pdf_measurements_project_page` on `(project_id, page_number)`

---

### `pdf_scale_calibrations`

Scale calibration data for converting PDF pixels to real-world measurements

**Schema:**

| Column                   | Type                                            | Description                                                                   |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `id`                     | UUID NOT NULL PK                                | Default: gen_random_uuid()                                                    |
| `project_id`             | UUID NOT NULL FK → projects.id (CASCADE delete) |                                                                               |
| `page_number`            | INTEGER NOT NULL                                |                                                                               |
| `pixels_per_inch`        | NUMERIC NOT NULL                                | Number of PDF pixels per real-world inch (calculated from calibration line)   |
| `calibration_line_start` | JSONB                                           |                                                                               |
| `calibration_line_end`   | JSONB                                           |                                                                               |
| `known_distance_inches`  | NUMERIC                                         |                                                                               |
| `created_at`             | TIMESTAMPTZ NOT NULL                            | Default: Current timestamp                                                    |
| `created_by`             | UUID                                            |                                                                               |
| `print_width_inches`     | NUMERIC                                         | Intended print width in inches (e.g., 24 for 24x36 sheet)                     |
| `print_height_inches`    | NUMERIC                                         | Intended print height in inches (e.g., 36 for 24x36 sheet)                    |
| `scale_notation`         | TEXT                                            | Architectural scale notation (e.g., "1/8\"=1'-0\"") for automatic calculation |
| `pdf_width_points`       | NUMERIC                                         | PDF page width in points (72 points = 1 inch)                                 |
| `pdf_height_points`      | NUMERIC                                         | PDF page height in points (72 points = 1 inch)                                |

**Indexes:**

- `idx_pdf_calibrations_project_page` on `(project_id, page_number)`
- `unique_calibration_per_page` UNIQUE on `(project_id, page_number)`

---

### `prompt_templates`

**Schema:**

| Column                 | Type                  | Description                |
| ---------------------- | --------------------- | -------------------------- |
| `id`                   | UUID NOT NULL PK      | Default: gen_random_uuid() |
| `name`                 | VARCHAR(255) NOT NULL |                            |
| `version`              | INTEGER NOT NULL      |                            |
| `system_prompt`        | TEXT                  |                            |
| `user_prompt_template` | TEXT                  |                            |
| `instruction_template` | TEXT                  |                            |
| `is_active`            | BOOLEAN               | Default: true              |
| `created_at`           | TIMESTAMPTZ           | Default: Current timestamp |
| `created_by`           | UUID                  |                            |

**Indexes:**

- `prompt_templates_name_version_key` UNIQUE on `(name, version)`

---

### `screenshot_element_instance_assignments`

**Schema:**

| Column                | Type                                                     | Description                |
| --------------------- | -------------------------------------------------------- | -------------------------- |
| `id`                  | UUID NOT NULL PK                                         | Default: gen_random_uuid() |
| `screenshot_id`       | UUID NOT NULL FK → screenshots.id (CASCADE delete)       |                            |
| `element_instance_id` | UUID NOT NULL FK → element_instances.id (CASCADE delete) |                            |
| `is_original`         | BOOLEAN                                                  | Default: false             |
| `assigned_at`         | TIMESTAMPTZ                                              | Default: Current timestamp |
| `assigned_by`         | UUID                                                     |                            |

**Indexes:**

- `idx_screenshot_element_instance_element` on `(element_instance_id)`
- `idx_screenshot_element_instance_original` on `(is_original)` WHERE (is_original = true)
- `idx_screenshot_element_instance_screenshot` on `(screenshot_id)`
- `screenshot_element_instance_assignments_screenshot_id_element_i` UNIQUE on `(screenshot_id, element_instance_id)`

---

### `section_applicability_log`

Audit trail of all applicability decisions (included and excluded)

**Schema:**

| Column                 | Type                                               | Description                                             |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------- |
| `id`                   | UUID NOT NULL PK                                   | Default: gen_random_uuid()                              |
| `assessment_id`        | UUID NOT NULL FK → assessments.id (CASCADE delete) |                                                         |
| `section_key`          | TEXT NOT NULL FK → sections.key (CASCADE delete)   |                                                         |
| `decision`             | BOOLEAN NOT NULL                                   | TRUE=included, FALSE=excluded                           |
| `decision_source`      | TEXT NOT NULL                                      | rule=deterministic, ai=llm-based; Default: 'rule'::text |
| `decision_confidence`  | TEXT                                               |                                                         |
| `reasons`              | ARRAY NOT NULL                                     | Human-readable explanation bullets                      |
| `details`              | JSONB                                              | Structured dimension-by-dimension evaluation            |
| `building_params_hash` | TEXT NOT NULL                                      | SHA256 of normalized variables                          |
| `variables_snapshot`   | JSONB NOT NULL                                     | Full normalized variables used                          |
| `created_at`           | TIMESTAMPTZ NOT NULL                               | Default: Current timestamp                              |

**Indexes:**

- `idx_applicability_log_assessment` on `(assessment_id)`
- `idx_applicability_log_decision` on `(decision)`
- `idx_applicability_log_section` on `(section_key)`
- `idx_section_applicability_log_manual` on `(assessment_id, section_key, decision)` WHERE (decision_source = 'manual'::text)
- `section_applicability_log_assessment_id_section_key_decisio_key` UNIQUE on `(assessment_id, section_key, decision_source, building_params_hash)`

---

### `section_checks`

**Schema:**

| Column            | Type                                              | Description                           |
| ----------------- | ------------------------------------------------- | ------------------------------------- |
| `id`              | UUID NOT NULL PK                                  | Default: gen_random_uuid()            |
| `session_id`      | UUID FK → compliance_sessions.id (CASCADE delete) |                                       |
| `section_key`     | VARCHAR(500) NOT NULL                             |                                       |
| `section_number`  | VARCHAR(100) NOT NULL                             |                                       |
| `section_title`   | TEXT                                              |                                       |
| `status`          | VARCHAR(50)                                       | Default: 'pending'::character varying |
| `is_cloneable`    | BOOLEAN                                           | Default: false                        |
| `analysis_result` | JSONB                                             |                                       |
| `created_at`      | TIMESTAMPTZ                                       | Default: Current timestamp            |
| `updated_at`      | TIMESTAMPTZ                                       | Default: Current timestamp            |

**Indexes:**

- `idx_section_checks_session_id` on `(session_id)`
- `idx_section_checks_status` on `(status)`
- `section_checks_session_id_section_key_key` UNIQUE on `(session_id, section_key)`

**Constraints:**

- `section_checks_status_check`: CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'screenshots_captured'::character varying, 'analyzing'::character varying, 'complete'::character varying, 'skipped'::character varying, 'not_applicable'::character varying])::text[])))

---

### `section_screenshots`

**Schema:**

| Column             | Type                                         | Description                |
| ------------------ | -------------------------------------------- | -------------------------- |
| `id`               | UUID NOT NULL PK                             | Default: gen_random_uuid() |
| `section_check_id` | UUID FK → section_checks.id (CASCADE delete) |                            |
| `url`              | TEXT NOT NULL                                |                            |
| `instance_id`      | UUID                                         |                            |
| `instance_name`    | VARCHAR(255)                                 |                            |
| `analysis_result`  | JSONB                                        |                            |
| `created_at`       | TIMESTAMPTZ                                  | Default: Current timestamp |

**Indexes:**

- `idx_section_screenshots_check_id` on `(section_check_id)`

---
