# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered building code compliance assessment platform. Next.js 15.5.3 application that analyzes architectural drawings against building codes (California Building Code Chapter 11A/11B) to identify compliance violations.

**Tech Stack**: Next.js 15 (App Router), React 19, TypeScript 5.9, Tailwind CSS 3.4, Supabase (PostgreSQL), AWS S3, AI providers (Gemini, OpenAI, Anthropic)

### Branch Strategy

- **`dev`** - Development branch (active development, deployed to staging)
- **`main`** - Production branch (deployed to production)
- Always develop features in `dev` branch
- Merge to `main` after thorough testing

### Environment Setup

- **Development**: Supabase project `prafecmdqiwgnsumlmqn` (staging)
- **Production**: Supabase project `grosxzvvmhakkxybeuwu` (prod)
- **S3**: Shared bucket `set4-data` across both environments
- Database changes must be applied to BOTH environments separately

## Development Commands

```bash
# Development
npm install              # Install dependencies
npm run dev             # Start dev server (http://localhost:3000)
npm run build           # Build for production
npm run start           # Start production server

# Testing
npm test                # Run unit tests (Vitest)
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage report
npm run test:e2e        # Run e2e tests (Playwright)
npm run test:e2e:ui     # Run e2e tests with UI
npm run test:e2e:debug  # Debug e2e tests

# Code Quality
npm run lint            # Run ESLint
npm run typecheck       # TypeScript type checking
npm run format          # Format code with Prettier
npm run format:check    # Check formatting without writing
```

### Python Scripts (Data Processing)

```bash
# Setup Python environment (first time only)
python -m venv venv
source venv/bin/activate
pip install supabase  # Main dependency

# Load building codes into database
python scripts/load_db/unified_code_upload_supabase.py --file cbc_CA_2025.json

# Map code sections to building elements (doors, ramps, etc.)
python scripts/tag_element_sections.py
```

## Git Guidelines

**IMPORTANT**: NEVER use these git commands:

- `git add -A` - Always stage specific files instead
- `git add *` - Always stage specific files instead
- `--no-verify` flag - Never skip hooks

Always use explicit file paths: `git add path/to/file.ts`

## Architecture Overview

### Core Workflow

```
1. Project Creation
   Customer → Project → Upload PDF to S3

2. Assessment Initialization & Seeding
   Create assessment → Start AI filtering (runs in background)
   → AI evaluates ~800 code sections for applicability
   → Creates checks for applicable sections
   → Tracks progress (sections_processed/sections_total)

3. Check Assessment
   Select check → View PDF → Capture screenshot → Upload to S3
   → Run AI analysis (Gemini/OpenAI/Anthropic)
   → Store analysis_run with results
   → Manual override if needed

4. Progress Tracking
   Calculate completion: checks with (latest_analysis OR manual_override)
   → Generate compliance report
```

### Two Check Paradigms

**1. Section-Based Checks** (traditional)

- One check per code section (e.g., 11B-404.2.6)
- Simple 1:1 mapping
- Used for sections NOT mapped to elements

**2. Element-Based Checks** (batch assessment)

- One check encompasses MULTIPLE code sections
- Used for building elements: Doors, Ramps, Parking, Stairs, etc.
- Template + instances pattern: "Door 1", "Door 2", etc.
- `check_type = 'element'` and has `element_group_id`
- Can clone template to create new instances (`parent_check_id`)
- Each element maps to 5-20 related code sections
- Single AI analysis assesses ALL sections at once

### Key Data Models

**Check Types**:

```typescript
check_type: 'section' | 'element';
// Section check: Simple, one section
// Element check: Multiple sections, reusable template
```

**Analysis Results**:

```typescript
interface AIResponse {
  compliance_status: 'compliant' | 'non-compliant' | 'unclear' | 'not-applicable';
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  violations?: Array<{
    severity: 'major' | 'minor';
    description: string;
    location?: string;
    recommendation?: string;
  }>;
  section_results?: { [section_key: string]: SectionResult }; // For element checks
}
```

**Manual Override** (always takes precedence over AI):

```typescript
manual_override: 'compliant' | 'non-compliant' | 'not_applicable' | null;
manual_override_note: string;
manual_override_at: timestamp;
```

### S3 Architecture

**Why S3?**

- Vercel has 4.5MB request limit (too small for images)
- Client uploads directly using presigned URLs
- No serverless function payload limits

**Key Patterns**:

```typescript
// Generate presigned upload URL (60s expiry)
POST /api/screenshots/presign
→ Returns: { url, key }
→ Client uploads directly to S3

// Generate presigned view URL (1hr expiry)
GET /api/screenshots/presign-view?key=...
→ Returns: { url }
→ Client loads image

// S3 key structure
screenshots: {projectId}/{assessmentId}/{checkId}/{screenshotId}.png
thumbnails:  {projectId}/{assessmentId}/{checkId}/{screenshotId}_thumb.png
pdfs:        drawings/{projectId}/{filename}.pdf
```

### AI Provider Integration

Multi-provider support for redundancy, cost optimization, and comparative analysis:

**Gemini 2.5 Pro** (default):

- Best performance for compliance analysis
- Converts images to base64 inline data
- 60s rate limit retry with exponential backoff

**OpenAI GPT-4o**:

- Alternative provider
- Uses image URLs (not base64)

**Anthropic Claude Opus 4**:

- Alternative provider
- Good for complex reasoning

All providers use the same prompt template system and return standardized `AIResponse` format.

### Seeding Process (AI Filtering)

When assessment is created, AI filters ~800 code sections to determine applicability:

**Process**:

1. Fetch all `drawing_assessable=true, never_relevant=false` sections
2. Filter by selected code chapters (11A, 11B, or both)
3. Exclude sections already mapped to elements (unless assessment-specific)
4. Batch sections into groups of 50
5. For each batch, send to Claude with project variables
6. Claude evaluates each section for applicability (0-10 score)
7. Create checks for sections with score ≥ 5
8. Track progress: `seeding_status`, `sections_processed`, `sections_total`
9. Status: 'pending' → 'in_progress' → 'completed' | 'failed'

**Assessment-Specific Element Mappings**:

- Assessments can have custom element-section mappings
- Check `element_section_mappings.assessment_id` first
- Fall back to global mappings (`assessment_id IS NULL`) if none exist
- Custom mappings don't exclude sections from seeding (project-specific needs)

## Database Connection

**CRITICAL**: Always use the **pooler** connection (IPv4 compatible).

### Development Database

```bash
PGSSLMODE=require psql "postgresql://postgres.prafecmdqiwgnsumlmqn:crumblyboys33@aws-1-us-east-1.pooler.supabase.com:5432/postgres" -c "YOUR_QUERY"
```

**Why pooler?**

- Direct connection (`db.prafecmdqiwgnsumlmqn.supabase.co`) is IPv6-only
- Pooler (`aws-1-us-east-1.pooler.supabase.com`) supports IPv4
- Use port `5432` for pooler
- Username: `postgres.prafecmdqiwgnsumlmqn` (project-scoped)
- Password must be URL-encoded: `!` → `%21`

### Common Queries

```bash
# List tables
PGSSLMODE=require psql "..." -c "\dt"

# Describe schema
PGSSLMODE=require psql "..." -c "\d table_name"

# Check assessment progress
PGSSLMODE=require psql "..." -c "SELECT id, seeding_status, sections_processed, sections_total FROM assessments WHERE id = 'assessment-id'"

# View element mappings
PGSSLMODE=require psql "..." -c "SELECT eg.name, COUNT(*) FROM element_groups eg JOIN element_section_mappings esm ON eg.id = esm.element_group_id GROUP BY eg.id"
```

## Database Schema (Key Concepts)

### Core Tables

**Hierarchy**:

```
customers (1) → (many) projects (1) → (many) assessments (1) → (many) checks
```

**Code Reference**:

- `codes` - Building code documents (e.g., CBC Chapter 11A/11B)
- `sections` - Hierarchical code sections with full text content
  - `drawing_assessable` - Can be assessed from drawings
  - `never_relevant` - Never applicable (excluded from seeding)
  - `number` - Section number (e.g., "11B-404.2.6")
  - `key` - Unique identifier
- `element_groups` - Building elements (Doors, Ramps, etc.)
- `element_section_mappings` - Maps elements to applicable sections
  - `assessment_id` - NULL for global, or specific to assessment

**Compliance Checking**:

- `checks` - Individual compliance checks
  - `check_type` - 'section' or 'element'
  - `section_key` - For section checks
  - `element_group_id` - For element checks
  - `parent_check_id` - For cloned instances
  - `instance_number`, `instance_label` - For organizing instances
  - `manual_override` - Overrides AI judgment
  - `not_applicable`, `excluded` - Exclusion flags
- `analysis_runs` - AI analysis history
  - `section_results` - For element checks (per-section results)
  - `compliance_status`, `confidence`, `violations` - AI output
- `screenshot_check_assignments` - Many-to-many: screenshots ↔ checks

**Progress Tracking**:

- `check_summary` - Materialized view for assessment progress
  - Aggregates completion status across all checks
  - Used by progress bars

### Critical Relationships

```
# Element-based checking
element_groups → element_section_mappings → sections
checks (element_group_id) → element_groups

# Screenshot sharing
screenshots ← screenshot_check_assignments → checks
(Many screenshots can be assigned to many checks)

# Check instances
checks (parent_check_id) → checks
(Cloned checks reference parent template)
```

## API Architecture

All API routes use Next.js App Router convention: `app/api/[resource]/route.ts`

### Common Patterns

**Standard CRUD**:

```typescript
// app/api/resource/route.ts
export async function GET(request: NextRequest) {}
export async function POST(request: NextRequest) {}

// app/api/resource/[id]/route.ts
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // Next.js 15 async params
  const supabase = supabaseAdmin();
  // ...
}
```

**Error Handling**:

```typescript
const { data, error } = await supabase.from('table').select('*');
if (error) return NextResponse.json({ error: error.message }, { status: 404 });
return NextResponse.json({ data });
```

**Supabase Client**:

```typescript
import { supabaseAdmin } from '@/lib/supabase-server';
const supabase = supabaseAdmin(); // Service role, no auth
```

## Component Architecture

### Main Assessment Page

```
app/assessments/[id]/page.tsx (Server Component)
└─ AssessmentClient.tsx (Client Component)
   ├─ CheckList (left sidebar)
   │  ├─ Search & filter
   │  ├─ Mode toggle (Section/Element)
   │  └─ Grouped check list
   ├─ PDFViewer (center)
   │  ├─ PDF.js canvas
   │  └─ Screenshot tool
   ├─ CodeDetailPanel (right panel)
   │  ├─ Section content
   │  ├─ AnalysisPanel
   │  └─ PromptEditor
   └─ ScreenshotGallery
```

**Key Pattern**: Server Component fetches initial data, passes to Client Component for interactivity.

### Hook Architecture

The PDF viewer has been refactored using a composable hook architecture for better maintainability, testability, and code reuse.

#### Base Hooks (`lib/hooks/`)

Generic, reusable hooks for common patterns:

- **`useFetch<T>`** - Generic API data fetching with loading/error states and retries
- **`usePersisted<T>`** - LocalStorage persistence with debouncing and validation
- **`usePolling`** - Interval-based polling with automatic stop conditions

#### PDF Domain Hooks (`hooks/`)

PDF-specific hooks for the viewer:

- **`usePresignedUrl`** - S3 presigned URL fetching with caching
- **`usePdfDocument`** - PDF.js document and page loading
- **`usePdfLayers`** - PDF optional content (layers) management
- **`usePdfPersistence`** - Consolidated localStorage (page, transform, indicators)
- **`useViewTransform`** - Pan/zoom transform with pivot-point zooming
- **`useMeasurements`** - PDF measurement CRUD operations
- **`useCalibration`** - Scale calibration (page-size & known-length methods)
- **`useScreenshotCapture`** - Complete screenshot workflow orchestration
- **`useKeyboardShortcuts`** - Centralized keyboard event handling
- **`usePdfMouseHandlers`** - Mouse interaction handlers (pan/selection)

#### Standard Hook Pattern

All hooks follow the `HookReturn` pattern:

```typescript
const measurements = useMeasurements(projectId, pageNumber);

// Access state
const { measurements, loading, selectedId } = measurements.state;

// Invoke actions
await measurements.actions.save(data);
await measurements.actions.update(id, updates);

// Use computed values
const realDist = calibration.computed.calculateRealDistance(pixelDist);
```

#### ViewerMode Discriminated Union

Replaces boolean flags with type-safe state:

```typescript
type ViewerMode =
  | { type: 'idle' }
  | { type: 'screenshot'; selection: Selection | null }
  | { type: 'measure'; selection: Selection | null }
  | { type: 'calibrate'; selection: Selection | null };

// Benefits: Impossible states are unrepresentable
// Example: Can't have selection without being in a mode
```

**See** `docs/HOOK_ARCHITECTURE.md` for comprehensive documentation including:

- Detailed hook APIs
- Design patterns and best practices
- Testing strategies
- Performance considerations
- Migration guides

### Path Aliases

Uses TypeScript path aliases: `@/` maps to root directory

```typescript
import { supabaseAdmin } from '@/lib/supabase-server';
import { Button } from '@/components/ui/button';
```

## Testing Configuration

**Unit Tests** (Vitest):

- Config: `vitest.config.ts`
- Environment: jsdom
- Setup: `__tests__/setup.ts`
- Coverage: v8 provider
- Path alias: `@/` → root

**E2E Tests** (Playwright):

- Config: `playwright.config.ts`
- Test dir: `./e2e`
- Runs dev server automatically
- Chromium only (can enable Firefox/Safari)
- Captures screenshots/videos on failure

## Important Files

**Core Libraries**:

- `lib/supabase-server.ts` - Database client (service role)
- `lib/s3.ts` - S3 presigning utilities (`presignPut`, `presignGet`, `s3KeyFor*`)
- `lib/ai/analysis.ts` - Multi-provider AI integration (`runAI`)
- `lib/prompt.ts` - Prompt templating system

**Key API Routes**:

- `app/api/assessments/[id]/seed/route.ts` - AI filtering & check seeding
- `app/api/checks/[id]/assess/route.ts` - Run AI analysis on check
- `app/api/screenshots/presign/route.ts` - Generate S3 upload URL
- `app/api/checks/[id]/clone/route.ts` - Clone element check for new instance

**Python Scripts**:

- `scripts/load_db/unified_code_upload_supabase.py` - Load building codes from JSON
- `scripts/tag_element_sections.py` - Map sections to element groups
- `scripts/schema.py` - Database schema definitions

## Environment Variables

Required in `.env.local` (see `.envrc` for reference):

**Supabase**:

- `NEXT_PUBLIC_SUPABASE_URL` - Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role (server-side only)

**AWS S3**:

- `AWS_REGION` - e.g., us-east-1
- `AWS_ACCESS_KEY_ID` - AWS credentials
- `AWS_SECRET_ACCESS_KEY` - AWS credentials
- `AWS_S3_BUCKET_NAME` - Bucket name (set4-data)
- `NEXT_PUBLIC_S3_BUCKET_NAME` - For client-side S3 key generation

**AI Providers**:

- `GOOGLE_API_KEY` or `GEMINI_API_KEY` - Google Gemini
- `OPENAI_API_KEY` - OpenAI
- `ANTHROPIC_API_KEY` - Anthropic

## Common Debugging Tasks

**Check seeding status**:

```bash
PGSSLMODE=require psql "..." -c "SELECT seeding_status, sections_processed, sections_total FROM assessments WHERE id = 'assessment-id'"
```

**View element sections**:

```bash
PGSSLMODE=require psql "..." -c "
SELECT eg.name, s.number, s.title
FROM element_section_mappings esm
JOIN element_groups eg ON esm.element_group_id = eg.id
JOIN sections s ON esm.section_key = s.key
WHERE eg.slug = 'doors'
ORDER BY s.number"
```

**Find checks without screenshots**:

```bash
PGSSLMODE=require psql "..." -c "
SELECT c.id, c.code_section_title, COUNT(sca.screenshot_id) as screenshot_count
FROM checks c
LEFT JOIN screenshot_check_assignments sca ON c.id = sca.check_id
WHERE c.assessment_id = 'assessment-id'
GROUP BY c.id
HAVING COUNT(sca.screenshot_id) = 0"
```

**Check AI analysis results**:

```bash
PGSSLMODE=require psql "..." -c "
SELECT compliance_status, confidence, reasoning
FROM analysis_runs
WHERE check_id = 'check-id'
ORDER BY executed_at DESC
LIMIT 1"
```

## Development Notes

- Always add lots of logging (`console.log`) - this is an internal tool
- Next.js 15 uses async `params` - always `await params` in route handlers
- Supabase uses service role (no auth) via `supabaseAdmin()`
- Screenshots uploaded client-side directly to S3 (presigned URLs)
- AI analysis runs on serverless functions (watch timeout limits)
- Assessment seeding runs in background (poll `/api/assessments/[id]/status`)
- Manual overrides ALWAYS take precedence over AI judgments
- Element checks assess multiple sections in single AI call
- Both dev and prod share same S3 bucket (use consistent key structure)
