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
  - Neo4j (code assembly graphs)
  - AWS S3 (PDF/screenshot storage)

### Important Notes

- This is the ONLY Next.js application in the repository
- All new features should be developed in this root service app
- Uses both Supabase (relational data) and Neo4j (code relationships)

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
│   │   ├── element-groups/       # Element-based checking
│   │   └── neo4j/                # Code assembly (Neo4j)
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
│   ├── neo4j.ts                  # Neo4j driver
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

- `POST /api/assessments` - Create assessment
- `POST /api/assessments/[id]/seed` - Seed checks (AI filtering)
- `GET /api/assessments/[id]/checks` - Get checks (with search)
- `POST /api/checks/[id]/assess` - Run AI analysis
- `POST /api/analysis/batch` - Batch analysis
- `POST /api/checks/[id]/manual-override` - Set manual judgment
- `POST /api/screenshots/presign` - Get S3 upload URL
- `GET /api/screenshots/presign-view` - Get S3 download URL
- `POST /api/checks/[id]/clone` - Clone check for new instance

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

## Environment Variables Required

See `.envrc` for required environment variables including:

- **Supabase**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
- **AWS S3**: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`
- **AI Services**: `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`
- **Neo4j**: `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`

## Development Patterns

## Git Commands

**IMPORTANT**: NEVER use the following git commands:

- `git add -A` - Always add specific files instead
- `git add *` - Always add specific files instead

When staging files for commit, always use explicit file paths (e.g., `git add path/to/file.ts`).

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

### Notes

- The direct connection (`db.grosxzvvmhakkxybeuwu.supabase.co:5432`) is IPv6-only and won't work on IPv4 networks
- Special characters in passwords must be URL-encoded in connection strings
- Always use port 6543 for pooler connections
- Summary:
  - Use pooler connection on port
    6543 (not 5432)
  - Host: aws-1-us-east-1.pooler.s
    upabase.com
  - User:
    postgres.grosxzvvmhakkxybeuwu
  - Password must be URL-encoded
  - SSL required
  - Direct connection won't work
    (IPv6-only)
    this is show to conet to thedb
