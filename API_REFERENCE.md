# API Reference

Complete API schema for the Building Code Compliance Assessment Platform. All endpoints use Next.js 15 App Router serverless functions.

## Table of Contents

- [Customers](#customers)
- [Projects](#projects)
- [Assessments](#assessments)
- [Checks](#checks)
- [Analysis](#analysis)
- [Screenshots](#screenshots)
- [Codes & Sections](#codes--sections)
- [Element Groups & Instances](#element-groups--instances)
- [Measurements & Calibration](#measurements--calibration)
- [Prompts](#prompts)
- [PDF Operations](#pdf-operations)
- [Queue Processing](#queue-processing)
- [Utilities](#utilities)

---

## Customers

### `GET /api/customers`

Fetch all customers, ordered by creation date (most recent first).

**Response**: Array of customer objects

### `POST /api/customers`

Create a new customer.

**Body**: Customer data (name, contact info, etc.)

**Response**: Created customer object

---

## Projects

### `GET /api/projects`

Fetch all projects with customer info and assessment counts. Ordered by creation date (most recent first).

**Response**: Array of projects with nested customer data

### `POST /api/projects`

Create a new project. Automatically hashes `report_password` if provided.

**Body**: Project data (name, customer_id, pdf_url, report_password, etc.)

**Response**: Created project object

### `GET /api/projects/[id]`

Fetch a single project by ID.

**Response**: Project object

### `PUT /api/projects/[id]`

Update a project. Hashes password if provided and not already hashed.

**Body**: Partial project data to update

**Response**: Updated project object

### `DELETE /api/projects/[id]`

Delete a project.

**Response**: `{ ok: true }`

### `GET /api/projects/[id]/search`

Search for text within a project's PDF document using full-text search.

**Query params**: `q` (search query)

**Response**: Array of matching text snippets with page numbers

### `GET /api/projects/[id]/dimensions`

Extract dimensions from a specific page of the project's PDF.

**Query params**: `page` (page number)

**Response**: Array of detected dimensions with coordinates

### `POST /api/projects/[id]/chunk`

Process a specific chunk of the PDF (for large documents processed in batches).

**Body**: `{ chunkIndex, totalChunks }`

**Response**: Processing status

### `POST /api/projects/[id]/assessment`

Create a new assessment for a project.

**Body**: Assessment configuration (selected chapters, options, etc.)

**Response**: Created assessment object

---

## Assessments

### `POST /api/assessments`

Create a new assessment.

**Body**: Assessment data (project_id, selected_chapter_ids, etc.)

**Response**: Created assessment object

### `GET /api/assessments/[id]`

Consolidated endpoint for PDFViewer initialization. Fetches measurements, calibration, screenshots, and PDF scale.

**Query params**:

- `projectId` (required for measurements/calibration)
- `pageNumber` (required for measurements/calibration)
- `include` (optional: comma-separated list of data to fetch)

**Response**: Object with measurements, calibration, screenshots, and pdf_scale

### `DELETE /api/assessments/[id]`

Delete an assessment.

**Response**: `{ ok: true }`

### `POST /api/assessments/[id]/seed`

Seed assessment with checks from selected code chapters. Creates checks for all sections (excluding `never_relevant=true` sections and header-only sections with no body text).

**Response**: `{ status, checks_created, message }`

### `GET /api/assessments/[id]/status`

Get assessment seeding status (for polling during background seeding).

**Response**: `{ seeding_status, sections_processed, sections_total }`

### `GET /api/assessments/[id]/checks`

Fetch all checks for an assessment (from `check_summary` view).

**Response**: Array of check summaries with completion status

### `GET /api/assessments/[id]/element-mappings`

Fetch element-to-section mappings for this assessment (assessment-specific overrides or global defaults).

**Response**: Array of element_section_mappings

### `GET /api/assessments/[id]/element-mappings/sections`

Fetch all sections mapped to elements for this assessment.

**Response**: Array of sections with element group info

### `POST /api/assessments/[id]/exclude-section`

Exclude a specific code section from the assessment.

**Body**: `{ sectionKey }`

**Response**: Success status

### `POST /api/assessments/[id]/exclude-section-group`

Exclude an entire section group (e.g., all door sections) from the assessment.

**Body**: `{ sectionGroupSlug }`

**Response**: Success status

### `GET /api/assessments/[id]/pdf-scale`

Get PDF scale for the assessment (default: 2.0).

**Response**: `{ pdf_scale: number }`

### `PATCH /api/assessments/[id]/pdf-scale`

Update PDF scale for the assessment.

**Body**: `{ pdf_scale: number }`

**Response**: Updated assessment

### `POST /api/assessments/[id]/import-csv-doors`

Import door instances from CSV file (DOORS format).

**Body**: FormData with CSV file

**Response**: `{ imported_count, errors? }`

### `GET /api/assessments/[id]/element-instances/[instanceId]`

Get details for a specific element instance.

**Response**: Element instance with parameters and related data

### `PUT /api/assessments/[id]/element-instances/[instanceId]`

Update an element instance.

**Body**: Instance updates (label, parameters, etc.)

**Response**: Updated instance

---

## Checks

### `GET /api/checks`

Fetch checks. Can be filtered by assessment_id, element_group_id, instance_label.

**Query params**:

- `assessment_id` - Filter by assessment
- `element_group_id` + `instance_label` - Get all checks for a specific element instance

**Response**: Array of checks

### `POST /api/checks`

Create a new check (typically done during seeding, not manually).

**Body**: Check data (assessment_id, section_id, code_section_number, etc.)

**Response**: Created check

### `GET /api/checks/[id]`

Fetch a single check by ID (includes section key via JOIN).

**Response**: Check object with section info

### `PUT /api/checks/[id]`

Update a check.

**Body**: Partial check data to update

**Response**: Updated check

### `DELETE /api/checks/[id]`

Delete a check.

**Response**: `{ ok: true }`

### `GET /api/checks/[id]/full`

Fetch check with all related data (screenshots, analysis runs, etc.).

**Response**: Check with nested relationships

### `POST /api/checks/[id]/assess`

Run AI compliance assessment on a check. For element-grouped checks, processes all sections in the element instance. Supports hybrid rule-based + AI analysis for California doors.

**Body**: `{ aiProvider, customPrompt?, extraContext? }`

**Response**: `{ success, batchGroupId, totalBatches, message }`

**Note**: Returns immediately and processes asynchronously via queue

### `POST /api/checks/[id]/clone`

Clone a check (or entire element instance with all its sections). Optionally copy screenshots.

**Body**: `{ instanceLabel?, copyScreenshots? }`

**Response**: `{ check }` (representative check for element clones)

### `PATCH /api/checks/[id]/manual-override`

Set manual override for a check (takes precedence over AI analysis).

**Body**: `{ override: 'compliant' | 'non_compliant' | 'not_applicable' | null, note?: string }`

**Response**: `{ check }` (updated check)

### `POST /api/checks/[id]/complete`

Mark a check as complete.

**Response**: `{ check }`

### `GET /api/checks/[id]/screenshots`

Get all screenshots assigned to this check.

**Response**: Array of screenshots

### `GET /api/checks/[id]/prompt`

Get the prompt template for this check (resolved with variables).

**Response**: `{ prompt: string }`

### `POST /api/checks/[id]/generate-title`

Auto-generate a human-readable title for the check based on context.

**Response**: `{ title: string }`

### `POST /api/checks/create-element`

Create a new element instance with all its associated checks (e.g., "Door 3").

**Body**: `{ assessmentId, elementGroupSlug, instanceLabel? }`

**Response**: `{ instance, checks_created, first_check_id }`

---

## Analysis

### `POST /api/analysis/run`

Run a single AI analysis (legacy endpoint, prefer `/api/checks/[id]/assess`).

**Body**: `{ checkId, prompt, screenshots?, provider }`

**Response**: `{ run }` (created analysis_run)

### `GET /api/analysis/[checkId]/latest`

Get the most recent analysis run for a check.

**Response**: `{ latest }` (analysis_run or null)

### `GET /api/analysis/[checkId]/history`

Get all analysis runs for a check, ordered by run_number descending.

**Response**: Array of analysis_runs

### `POST /api/analysis/batch`

Run batch AI analysis (used internally by queue processor).

**Body**: Batch analysis configuration

**Response**: Analysis results

---

## Screenshots

### `GET /api/screenshots`

Fetch screenshots. Can be filtered by check_id, element_instance_id, assessment_id, or screenshot_type.

**Query params**:

- `check_id` - Screenshots for a specific check
- `element_instance_id` - Screenshots for an element instance
- `assessment_id` - All screenshots for an assessment (assigned + unassigned)
- `screenshot_type` - Filter by type ('plan' or 'elevation')

**Response**: `{ screenshots }` (array with assignment metadata)

### `POST /api/screenshots`

Create a new screenshot. Optionally assigns to check and triggers background OCR.

**Body**: `{ screenshot_url, check_id?, caption?, screenshot_type?, thumbnail_url?, ... }`

**Response**: `{ screenshot }`

### `GET /api/screenshots/[id]`

Get a single screenshot.

**Response**: Screenshot object

### `PUT /api/screenshots/[id]`

Update a screenshot.

**Body**: Partial screenshot data

**Response**: Updated screenshot

### `DELETE /api/screenshots/[id]`

Delete a screenshot.

**Response**: `{ ok: true }`

### `POST /api/screenshots/presign`

Generate presigned S3 upload URLs for a new screenshot (full image + thumbnail).

**Body**: `{ projectId, checkId }`

**Response**: `{ screenshotId, key, uploadUrl, thumbKey, thumbUploadUrl }`

### `GET /api/screenshots/presign-view`

Generate presigned S3 URL for viewing a screenshot.

**Query params**: `key` (S3 object key)

**Response**: `{ url }` (presigned URL, 1hr expiry)

### `POST /api/screenshots/[id]/assign`

Assign a screenshot to one or more checks. For element instances, assigns to ALL checks in the instance.

**Body**: `{ checkIds: string[] }`

**Response**: `{ assigned }` (count of assignments created)

### `GET /api/screenshots/[id]/assignments`

Get all check assignments for a screenshot.

**Response**: Array of assignments with check info

### `DELETE /api/screenshots/[id]/unassign/[checkId]`

Unassign a screenshot from a specific check.

**Response**: `{ ok: true }`

### `POST /api/screenshots/cleanup`

Clean up orphaned screenshots (not assigned to any checks).

**Response**: `{ deleted_count }`

---

## Codes & Sections

### `GET /api/codes`

Fetch all building codes with their chapters.

**Response**: Array of codes with nested chapters

### `GET /api/code-sections/[key]`

Fetch a specific code section by its key (includes full text, paragraphs, and references).

**Response**: Section object with text content and referenced sections

### `GET /api/element-groups`

Fetch all element groups (Doors, Ramps, Parking, etc.) with section counts.

**Response**: `{ element_groups }` (array with section_count)

### `GET /api/element-groups/[slug]/sections`

Fetch all code sections mapped to an element group.

**Query params**: `assessment_id` (optional, for assessment-specific mappings)

**Response**: Array of sections for this element type

---

## Element Groups & Instances

### `GET /api/element-instances/[id]/checks`

Get all checks for an element instance.

**Response**: Array of checks

### `GET /api/element-instances/[id]/compliance`

Get compliance summary for an element instance (aggregates status across all checks).

**Response**: `{ compliance_status, violations, ... }`

### `GET /api/element-instances/[id]/parameters`

Get parameters for an element instance (e.g., door width, height, hardware).

**Response**: `{ parameters }` (JSON object)

### `PUT /api/element-instances/[id]/parameters`

Update parameters for an element instance.

**Body**: `{ parameters }` (JSON object)

**Response**: Updated instance

---

## Measurements & Calibration

### `GET /api/measurements`

Fetch measurements for a project page.

**Query params**: `projectId`, `pageNumber`

**Response**: `{ measurements }` (array)

### `POST /api/measurements`

Create a new measurement on a PDF page.

**Body**: `{ project_id, page_number, start_point, end_point, pixels_distance, real_distance_inches?, label?, color? }`

**Response**: `{ measurement }`

### `DELETE /api/measurements`

Delete a measurement.

**Query params**: `id`

**Response**: `{ success: true }`

### `POST /api/measurements/calibrate`

Create or update scale calibration for a project page.

**Body**: `{ project_id, page_number, pixels_distance, real_distance_inches, scale_pixels_per_inch, method, calibration_line? }`

**Response**: `{ calibration }`

---

## Prompts

### `GET /api/prompts/templates`

Fetch all prompt templates.

**Response**: Array of prompt templates

### `GET /api/prompts/[id]`

Fetch a specific prompt template.

**Response**: Prompt template object

### `PUT /api/prompts/[id]`

Update a prompt template.

**Body**: Partial template data

**Response**: Updated template

### `POST /api/prompts/preview`

Preview a prompt with variables resolved.

**Body**: `{ template, variables }`

**Response**: `{ resolved_prompt }`

---

## PDF Operations

### `POST /api/pdf/presign`

Generate presigned S3 URL for viewing a PDF (with 50-minute server-side cache).

**Body**: `{ pdfUrl }` (S3 URL)

**Response**: `{ url }` (presigned URL, 1hr expiry)

### `POST /api/upload/presign`

Generate presigned S3 upload URL for a new PDF.

**Body**: `{ filename, contentType, projectId? }`

**Response**: `{ uploadUrl, fileUrl, key }`

**Notes**:

- If `projectId` provided: Creates human-readable filename with project name
- If no `projectId`: Creates temporary filename (for upload before project creation)

---

## Queue Processing

### `GET /api/queue/process`

Process pending analysis jobs from the Redis queue. Called by cron job every 30 seconds.

**Response**: `{ processed, remaining, elapsedMs }`

**Notes**:

- Processes up to 25 jobs per call (50s timeout buffer)
- Handles 3 job types:
  - `element_group_assessment` - Meta-job, expands into batch jobs
  - `batch_analysis` - Individual section analysis
  - `analysis` - Legacy single analysis job
- Implements retry logic (max 3 attempts)
- Skips cancelled jobs and checks with manual overrides

---

## Compliance (Special)

### `POST /api/compliance/doors/check`

Run rule-based compliance check for California doors (deterministic, no AI).

**Body**: `{ parameters }` (door measurements and hardware)

**Response**: `{ violations }` (array of rule violations)

**Notes**: Used as hybrid fallback for certain door code sections before AI analysis

---

## Utilities

### `GET /api/health`

Health check endpoint.

**Response**: `{ status: 'ok', timestamp }`

### `GET /api/debug/env`

Debug endpoint to check environment variables (only shows which vars are set, not values).

**Response**: Object showing which env vars are configured

---

## Common Patterns

### Error Responses

All endpoints return errors in the format:

```json
{
  "error": "Error message",
  "details": "Additional context (optional)"
}
```

With appropriate HTTP status codes:

- `400` - Bad request / validation error
- `404` - Resource not found
- `409` - Conflict (duplicate resource)
- `500` - Internal server error

### Async Processing

Long-running operations (AI analysis, seeding) use async patterns:

1. Endpoint returns immediately with job ID
2. Job queued in Redis
3. Background processor (`/api/queue/process`) handles execution
4. Client polls status endpoints for completion

### S3 Presigned URLs

The app uses presigned URLs for all S3 operations:

**Upload Flow**:

1. `POST /api/screenshots/presign` → Get upload URL
2. Client uploads directly to S3 via PUT
3. `POST /api/screenshots` → Create DB record with S3 URL

**View Flow**:

1. `POST /api/pdf/presign` or `GET /api/screenshots/presign-view` → Get view URL
2. Client loads resource via presigned URL

**Benefits**:

- No file data through serverless functions (Vercel 4.5MB limit)
- Direct client-to-S3 transfer (faster)
- Temporary URLs with auto-expiry

### Authentication

Currently uses Supabase service role (no per-user auth). All endpoints accessible without authentication. Production deployment should add auth middleware.

---

## Data Flow Examples

### Creating a New Assessment

```
1. POST /api/assessments
   → Creates assessment record

2. POST /api/assessments/[id]/seed
   → Creates checks for all applicable code sections
   → Returns immediately

3. GET /api/assessments/[id]/checks
   → Fetch created checks

4. POST /api/checks/create-element
   → Create element instances (Door 1, Door 2, etc.)
```

### Running AI Analysis

```
1. POST /api/screenshots/presign
   → Get upload URL

2. Client uploads image to S3

3. POST /api/screenshots
   → Create screenshot record
   → Assign to check(s)

4. POST /api/checks/[id]/assess
   → Queue AI analysis job
   → Returns batchGroupId

5. Background: /api/queue/process
   → Processes job
   → Creates analysis_runs

6. GET /api/analysis/[checkId]/latest
   → Fetch results
```

### Element Instance Workflow

```
1. POST /api/checks/create-element
   → Creates element instance + all checks

2. POST /api/screenshots (multiple times)
   → Assign screenshots to instance

3. POST /api/checks/[id]/assess
   → Analyzes ALL sections in element instance together

4. GET /api/element-instances/[id]/compliance
   → Get aggregated compliance status
```

---

## Database Schema

See `DATABASE_SCHEMA.md` for complete schema documentation.

Key tables:

- `customers` → `projects` → `assessments` → `checks` → `analysis_runs`
- `codes` → `chapters` → `sections`
- `element_groups` ← `element_section_mappings` → `sections`
- `element_instances` → `checks` (many checks per instance)
- `screenshots` ↔ `screenshot_check_assignments` ↔ `checks` (many-to-many)
- `pdf_measurements`, `pdf_scale_calibrations` (per project page)

---

## Rate Limits & Timeouts

- **Vercel Serverless Functions**: 60s timeout (hobby plan), 300s (pro plan)
- **Queue Processor**: 50s per batch (leaves 10s buffer)
- **Gemini API**: 60 requests/minute (handled with exponential backoff)
- **S3 Presigned URLs**:
  - Upload: 5 minutes
  - View: 1 hour
  - Server cache: 50 minutes

---

## Best Practices

1. **Always use presigned URLs** for S3 operations (never send files through API)
2. **Poll status endpoints** for long-running operations (seeding, analysis)
3. **Use batch endpoints** where available (more efficient than N individual calls)
4. **Handle async gracefully** - operations may take minutes for large element instances
5. **Check manual_override first** - it always takes precedence over AI analysis
6. **Use element instances** for batch assessment of similar building elements
7. **Include screenshots** for higher quality AI analysis

---

## Development & Debugging

- All endpoints log extensively to console (this is an internal tool)
- Check Vercel logs for serverless function execution
- Monitor Redis queue length: `GET /api/queue/process` returns `remaining`
- Use `GET /api/debug/env` to verify environment configuration
- Check `analysis_runs.raw_ai_response` for full AI output

---

_For architecture details, see `CLAUDE.md`_

_For database schema, see `DATABASE_SCHEMA.md`_
