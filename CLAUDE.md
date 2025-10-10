# Claude Development Guidelines

## Project Overview

This repository contains the main **service** application - a Next.js 15.5.3 application for AI-powered building code compliance assessment. The system analyzes architectural drawings against building codes (like California Building Code Chapter 11B) to identify compliance violations.

### Main Application

- **Location**: Root directory (`/`)
- **Name**: service
- **Tech Stack**:
  - Next.js 15.5.3 (App Router)
  - React 19
  - TypeScript 5.9
  - Tailwind CSS 3.4.17
  - Vercel Serverless Functions
  - Supabase (PostgreSQL)
  - AWS S3 (PDF/screenshot storage)

### Important Notes

- This is the ONLY Next.js application in the repository
- All new features should be developed in this root service app
- Uses Supabase PostgreSQL for all data storage

### Branch Strategy

- **`main`** - Production branch (deployed to production environment)
- **`dev`** - Development branch (active development, deployed to staging)
- Always develop new features in `dev` branch
- Merge to `main` only after thorough testing

## Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run linting
npm run lint

# Run tests
npm test
npm run test:watch
npm run test:coverage
```

## Project Structure

```
/                                    # Root service app
├── app/                            # Next.js app directory (App Router)
│   ├── api/                       # API routes (serverless functions)
│   │   ├── assessments/          # Assessment CRUD & seeding
│   │   ├── checks/               # Compliance checks management
│   │   ├── analysis/             # AI analysis runs
│   │   ├── screenshots/          # Screenshot upload & presigning
│   │   ├── projects/             # Project management
│   │   ├── customers/            # Customer management
│   │   └── element-groups/       # Element-based checking
│   ├── assessments/[id]/         # Assessment detail page
│   ├── projects/                  # Projects list & creation
│   └── customers/                 # Customers list
├── components/                     # Shared React components
│   ├── checks/                    # Check list, detail panel
│   ├── pdf/                       # PDF viewer with annotations
│   ├── screenshots/               # Screenshot gallery
│   ├── analysis/                  # AI analysis display
│   └── ui/                        # Base UI components
├── lib/                           # Utility libraries and helpers
│   ├── ai/                        # AI provider integrations
│   │   ├── analysis.ts           # AI analysis execution
│   │   ├── types.ts              # AI response types
│   │   └── constants.ts          # Default models/configs
│   ├── supabase-server.ts        # Supabase client
│   ├── s3.ts                     # S3 upload/presign
│   └── prompt.ts                 # Prompt templating
├── scripts/                       # Data processing & utilities
│   ├── load_db/                  # Database loading scripts
│   │   └── unified_code_upload_supabase.py
│   ├── tag_element_sections.py   # Element-section mapping
│   └── *.mjs                     # Analysis & debugging scripts
├── __tests__/                     # Vitest test files
└── package.json                   # Dependencies & scripts

# Python utilities (for data processing)
scripts/
├── load_db/unified_code_upload_supabase.py  # Load building codes
├── tag_element_sections.py                   # Tag sections to elements
└── schema.py                                  # Database schema definitions
```

## Core Features

### 1. Compliance Assessment Workflow

**End-to-end code compliance review system**

- **Project Setup**: Create customer → project → upload PDF drawings
- **Assessment Creation**: Initialize assessment, auto-seed applicable code sections
- **Check Modes**:
  - **Section Mode**: Review by code section (e.g., 11B-404.2.6)
  - **Element Mode**: Review by building element (e.g., Doors, Ramps)
- **AI Analysis**: Multi-provider AI (Gemini, OpenAI, Anthropic) analyzes screenshots
- **Manual Override**: Human reviewers can override AI judgments
- **Progress Tracking**: Real-time progress bars, seeding status

### 2. PDF Viewer & Screenshot Capture

**Interactive plan viewer with annotation tools**

- PDF.js-based viewer with pan/zoom
- Screenshot capture with crop coordinates
- S3 upload with presigned URLs
- Thumbnail generation
- Gallery view per check

### 3. AI-Powered Analysis

**Multi-provider AI compliance checking**

- **Providers**: Gemini 2.5 Pro, GPT-4o, Claude Opus 4
- **Analysis Types**:
  - Single check analysis
  - Batch analysis (multiple checks)
  - Element-based (multiple sections per check)
- **Response Structure**: Compliance status, confidence, violations, recommendations
- **Audit Trail**: All analysis runs stored with full history

### 4. Element-Based Checking

**Group related code sections by building element**

- Element groups (Doors, Ramps, Parking, etc.)
- Each element maps to multiple code sections
- Template + instances pattern (e.g., "Door 1", "Door 2")
- Batch assessment of all sections for an element

### 5. Check Cloning & Instances

**Reusable check templates**

- Clone checks for multiple instances (e.g., multiple doors)
- Parent-child relationships (`parent_check_id`)
- Instance numbering and custom labels
- Inherited section mappings

## Application Architecture

### Data Flow

```
1. Project Creation
   └→ Customer → Project → PDF Upload (S3)

2. Assessment Initialization
   └→ Assessment created → Seeding starts
   └→ AI filters applicable sections → Creates checks

3. Check Assessment
   └→ User selects check → Views PDF → Captures screenshots
   └→ Screenshots upload to S3 → Presigned URLs generated
   └→ Run AI analysis → Store analysis_run
   └→ Display results → Manual override if needed

4. Progress & Completion
   └→ Track check completion (AI assessment OR manual override)
   └→ Calculate progress percentage
   └→ Generate compliance report
```

### Key Routes

**Pages**

- `/` - Home / Projects list
- `/customers` - Customers management
- `/projects/new` - Create new project
- `/assessments/start` - Start new assessment
- `/assessments/[id]` - Assessment detail (main UI)

**API Endpoints**

_Projects & Customers_

- `GET /api/projects` - List all projects
- `POST /api/projects` - Create new project
- `GET /api/projects/[id]` - Get project details
- `PUT /api/projects/[id]` - Update project
- `DELETE /api/projects/[id]` - Delete project
- `POST /api/projects/[id]/assessment` - Create assessment for project
- `POST /api/projects/[id]/extract` - Extract PDF metadata
- `GET /api/customers` - List customers
- `POST /api/customers` - Create customer

_Assessments_

- `GET /api/assessments` - List assessments
- `POST /api/assessments` - Create assessment
- `GET /api/assessments/[id]` - Get assessment details
- `PUT /api/assessments/[id]` - Update assessment
- `DELETE /api/assessments/[id]` - Delete assessment
- `POST /api/assessments/[id]/seed` - Seed checks (AI filtering)
- `GET /api/assessments/[id]/checks` - Get checks for assessment (with search/filter)
- `GET /api/assessments/[id]/status` - Get assessment status
- `PUT /api/assessments/[id]/pdf-scale` - Update PDF scale factor
- `POST /api/assessments/[id]/exclude-section` - Exclude specific section
- `POST /api/assessments/[id]/exclude-section-group` - Exclude section group

_Checks_

- `GET /api/checks` - List checks
- `POST /api/checks` - Create check
- `GET /api/checks/[id]` - Get check details
- `PUT /api/checks/[id]` - Update check
- `DELETE /api/checks/[id]` - Delete check
- `POST /api/checks/[id]/assess` - Run AI analysis on check
- `POST /api/checks/[id]/clone` - Clone check for new instance
- `POST /api/checks/[id]/manual-override` - Set manual compliance judgment
- `GET /api/checks/[id]/screenshots` - Get screenshots for check
- `GET /api/checks/[id]/analysis-runs` - Get analysis history
- `GET /api/checks/[id]/assessment-progress` - Get assessment progress
- `GET /api/checks/[id]/prompt` - Get check prompt
- `PUT /api/checks/[id]/prompt` - Update check prompt
- `POST /api/checks/[id]/generate-title` - Generate AI title for check
- `POST /api/checks/[id]/section-overrides` - Override section compliance
- `POST /api/checks/create-element` - Create element-based check

_Analysis_

- `POST /api/analysis/run` - Run single analysis
- `POST /api/analysis/batch` - Batch analysis (multiple checks)
- `GET /api/analysis/[checkId]/history` - Get analysis history for check
- `GET /api/analysis/[checkId]/latest` - Get latest analysis for check

_Screenshots_

- `GET /api/screenshots` - List screenshots
- `POST /api/screenshots` - Create screenshot
- `GET /api/screenshots/[id]` - Get screenshot details
- `PUT /api/screenshots/[id]` - Update screenshot
- `DELETE /api/screenshots/[id]` - Delete screenshot
- `POST /api/screenshots/presign` - Get S3 presigned upload URL
- `GET /api/screenshots/presign-view` - Get S3 presigned view URL
- `POST /api/screenshots/[id]/assign` - Assign screenshot to check
- `DELETE /api/screenshots/[id]/unassign/[checkId]` - Unassign from check
- `GET /api/screenshots/[id]/assignments` - Get check assignments
- `POST /api/screenshots/[id]/extract-text` - Extract text from screenshot
- `POST /api/screenshots/cleanup` - Clean up orphaned screenshots

_Code Sections & Elements_

- `GET /api/codes` - List building codes
- `GET /api/code-sections/[key]` - Get section by key
- `POST /api/sections/[key]/mark-never-relevant` - Mark section never relevant
- `POST /api/sections/[key]/mark-floorplan-relevant` - Mark section requires floorplan
- `POST /api/sections/batch` - Batch fetch sections
- `GET /api/element-groups` - List element groups
- `GET /api/element-groups/[slug]/sections` - Get sections for element group

_Compliance & Initialization_

- `POST /api/compliance/initialize` - Initialize compliance session
- `POST /api/compliance/sections` - Get applicable sections
- `POST /api/compliance/sections-batch` - Batch check sections

_PDF Management_

- `POST /api/pdf/upload` - Upload PDF
- `POST /api/pdf/presign` - Get presigned PDF URL
- `POST /api/upload` - General file upload
- `POST /api/upload/presign` - Get presigned upload URL

_Prompts_

- `GET /api/prompts/templates` - Get prompt templates
- `POST /api/prompts/preview` - Preview prompt with variables
- `GET /api/prompts/[id]` - Get prompt by ID
- `PUT /api/prompts/[id]` - Update prompt

_Utilities_

- `GET /api/health` - Health check endpoint
- `POST /api/queue/process` - Process background queue
- `GET /api/debug/check-summary` - Debug check summary
- `POST /api/admin/migrate` - Run database migrations

### Component Hierarchy

```
AssessmentClient (main assessment page)
├── CheckList (left sidebar)
│   ├── Search & filtering
│   ├── Section/Element mode toggle
│   ├── Grouped check list
│   └── CloneCheckModal
├── CodeDetailPanel (expandable right panel)
│   ├── Section content display
│   ├── AnalysisPanel (AI results)
│   └── PromptEditor (edit prompts)
├── PDFViewer (center panel)
│   ├── PDF.js canvas rendering
│   ├── Screenshot capture tool
│   └── Active check highlighting
└── ScreenshotGallery (bottom of sidebar)
    └── Thumbnail grid with captions
```

## Environments

### Production Environment

- **Branch**: `main`
- **Deployment**: Vercel production deployment
- **Database**: Production Supabase instance
- **S3**: Production bucket
- **URL**: Production domain

### Development/Staging Environment

- **Branch**: `dev`
- **Deployment**: Vercel preview deployment
- **Database**: Same Supabase instance (shared with prod)
- **S3**: Same bucket (shared with prod)
- **URL**: Staging domain

**Important**: Both environments share the same database and S3 bucket. Exercise caution when testing data operations.

## Environment Variables Required

See `.envrc` for required environment variables including:

- **Supabase**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
- **AWS S3**: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`
- **AI Services**: `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`
- **Next.js**: `NEXT_PUBLIC_*` for client-side variables

## Development Patterns

## Git Commands

**IMPORTANT**: NEVER use the following git commands:

- `git add -A` - Always add specific files instead
- `git add *` - Always add specific files instead

When staging files for commit, always use explicit file paths (e.g., `git add path/to/file.ts`).

## Database Schema

### Core Tables

**Projects & Customers**

- `customers` - Customer organizations
- `projects` - Individual building projects
- `assessments` - Compliance assessments for projects

**Code Reference**

- `codes` - Building code documents (e.g., CBC Chapter 11B)
- `sections` - Hierarchical code sections with content
- `element_groups` - Building elements (Doors, Ramps, etc.)
- `element_section_mappings` - Maps elements to applicable sections

**Compliance Checking**

- `checks` - Individual compliance checks (section or element-based)
  - Can be section-based (one check = one section)
  - Or element-based (one check = multiple sections for an element)
  - Supports parent-child relationships for instances
- `analysis_runs` - AI analysis executions with results
- `screenshot_check_assignments` - Many-to-many screenshots to checks

**Media & Evidence**

- `screenshots` - Captured plan screenshots with metadata
- Links to S3 storage for actual image files

**Supporting Tables**

- `prompts` - Reusable prompt templates
- `check_summary` - Materialized view for progress tracking

### Key Relationships

```
customers (1) ──> (many) projects
projects (1) ──> (many) assessments
assessments (1) ──> (many) checks
checks (1) ──> (many) analysis_runs
checks (many) <──> (many) screenshots (via screenshot_check_assignments)
element_groups (1) ──> (many) element_section_mappings ──> (many) sections
```

## Database Connection

**Important**: Always use the **pooler** connection (IPv4 compatible), not the direct connection.

### Running Database Queries

Use psql with the pooler connection string:

```bash
PGSSLMODE=require psql "postgresql://postgres.grosxzvvmhakkxybeuwu:beiajs3%26%21%21jfSJAB12@aws-1-us-east-1.pooler.supabase.com:6543/postgres" -c "YOUR_QUERY_HERE"
```

### Connection Details

- **Host**: `aws-1-us-east-1.pooler.supabase.com`
- **Port**: `6543` (pooler port, NOT 5432)
- **User**: `postgres.grosxzvvmhakkxybeuwu` (project-scoped username)
- **Database**: `postgres`
- **Password**: Must be URL-encoded (`&` → `%26`, `!` → `%21`)
- **SSL**: Required (set `PGSSLMODE=require`)

### Important Notes

- The direct connection (`db.grosxzvvmhakkxybeuwu.supabase.co:5432`) is IPv6-only and won't work on IPv4 networks
- Special characters in passwords must be URL-encoded in connection strings
- Always use port 6543 for pooler connections
- SSL mode is required for all connections

### Common Query Patterns

```bash
# List all tables
PGSSLMODE=require psql "postgresql://postgres.grosxzvvmhakkxybeuwu:beiajs3%26%21%21jfSJAB12@aws-1-us-east-1.pooler.supabase.com:6543/postgres" -c "\dt"

# Describe table schema
PGSSLMODE=require psql "postgresql://postgres.grosxzvvmhakkxybeuwu:beiajs3%26%21%21jfSJAB12@aws-1-us-east-1.pooler.supabase.com:6543/postgres" -c "\d table_name"

# Run custom query
PGSSLMODE=require psql "postgresql://postgres.grosxzvvmhakkxybeuwu:beiajs3%26%21%21jfSJAB12@aws-1-us-east-1.pooler.supabase.com:6543/postgres" -c "SELECT * FROM projects LIMIT 10"
```
