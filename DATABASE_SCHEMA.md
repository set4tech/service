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

## Current Data

**Loaded codes:**
- California Building Code 2025 - Chapters 11A & 11B Accessibility
  - 682 sections/subsections
  - 343 cross-references