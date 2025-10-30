# Set 4 Service - AI-Powered Building Code Compliance

✍️🏗️

**Automated building code compliance assessment platform using AI to analyze architectural drawings against accessibility and building codes.**

This Next.js application provides end-to-end compliance review workflow:

- Upload architectural PDF drawings
- AI automatically filters applicable code sections
- Interactive PDF viewer with screenshot capture
- Multi-provider AI analysis (Gemini, OpenAI, Anthropic)
- Manual review and override capabilities
- Progress tracking and compliance reporting

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.9+ (for data processing scripts)
- PostgreSQL (Supabase)
- AWS account (S3 storage)
- API keys for AI providers

### Installation

```bash
# Install Node.js dependencies
npm install

# Create Python virtual environment (for scripts)
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Copy environment template and configure
cp .env.example .env
# Edit .env with your credentials
```

### Environment Setup

We use a **trunk-based development** workflow with separate dev and production environments:

- **Development**: Local + Vercel previews (dev Supabase, dev S3)
- **Production**: Live app (prod Supabase, prod S3)

**Quick Setup**:

1. Follow [TRUNK_BASED_SETUP_PLAN.md](./TRUNK_BASED_SETUP_PLAN.md) for initial environment setup
2. See [DEVELOPMENT.md](./DEVELOPMENT.md) for daily workflow

Required environment variables (see `.env.example`):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_S3_BUCKET_NAME=your-bucket
NEXT_PUBLIC_S3_BUCKET_NAME=your-bucket

# AI Providers
OPENAI_API_KEY=your-openai-key
GOOGLE_API_KEY=your-gemini-key
ANTHROPIC_API_KEY=your-anthropic-key
```

### Run Development Server

```bash
npm run dev
# Open http://localhost:3000
```

## Deployment

- **main branch** → Auto-deploys to production (Vercel)
- **Feature branches** → Auto-creates preview deploys with dev environment
- **CI/CD**: GitHub Actions runs tests on all PRs to main

### Run Tests

```bash
npm test                  # Run once
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage
```

## Core Workflows

### 1. Create a New Assessment

**Step-by-step process:**

1. **Create Customer** (if new)
   - Navigate to `/customers`
   - Click "New Customer"
   - Enter customer details

2. **Create Project**
   - Navigate to `/projects/new`
   - Select customer
   - Enter project details
   - Upload architectural PDF to S3
   - Select applicable building codes

3. **Start Assessment**
   - Navigate to `/assessments/start`
   - Select project
   - Click "Start Assessment"
   - System automatically:
     - Creates assessment record
     - Triggers AI applicability filtering
     - Seeds initial checks (first batch shown immediately)
     - Continues background seeding

4. **Review Assessment**
   - View at `/assessments/[id]`
   - Progress bar shows completion
   - Toggle between "By Section" and "By Element" modes

### 2. Assess a Compliance Check

**Interactive assessment workflow:**

1. **Select Check**
   - Click check in left sidebar
   - Code detail panel opens on right
   - PDF viewer shows in center

2. **Capture Evidence**
   - Navigate PDF to relevant page
   - Click screenshot tool
   - Draw crop area over relevant content
   - Screenshot uploads to S3
   - Add caption (optional)

3. **Run AI Analysis**
   - Click "Assess" button
   - Select AI provider (Gemini, OpenAI, or Anthropic)
   - AI analyzes screenshots + code section
   - Results display with:
     - Compliance status (compliant/non-compliant/unclear)
     - Confidence level
     - Detailed reasoning
     - Identified violations
     - Recommendations

4. **Manual Override** (if needed)
   - Click "Manual Override"
   - Select status: Compliant / Non-Compliant / Not Applicable
   - Add notes explaining decision
   - Manual judgment takes precedence over AI

5. **Review & Iterate**
   - View full analysis history
   - Re-run analysis with different screenshots
   - Compare multiple AI provider results

### 3. Element-Based Checking

**For repetitive building elements (doors, ramps, etc.):**

1. **Switch to Element Mode**
   - Toggle "By Element" in sidebar
   - See checks grouped by element type

2. **Create Element Instance**
   - Click "+" on element template (e.g., "Doors")
   - Enter label (e.g., "Main Entrance Door")
   - System creates check for ALL door-related code sections

3. **Assess Element**
   - Capture screenshots showing the specific element
   - Run AI analysis
   - AI assesses ALL applicable sections in one analysis
   - Results show per-section compliance

4. **Add More Instances**
   - Click "+" again to add "Door 2", "Door 3", etc.
   - Each instance assessed independently
   - Reuse section mappings from template

### 4. Client Compliance Viewer

**Simplified client-facing compliance review interface:**

The compliance viewer provides a streamlined interface for clients to review code sections and compliance status without access to the full assessment tools.

**Access:**

- Navigate to `/compliance/[projectId]`
- Example: `http://localhost:3000/compliance/1ae95ee4-dc31-401a-8bb0-8778aa5cd7be`

**Features:**

1. **Section Navigation**
   - Browse all applicable code sections
   - Visual status indicators (pending, captured, complete, etc.)
   - Section list with completion status

2. **Section Details**
   - View requirements and referenced sections
   - See consolidated code information
   - Clear presentation of compliance criteria

3. **Multiple Items Mode**
   - Enable for sections with multiple instances (doors, windows, etc.)
   - Name and track each instance separately
   - Individual screenshot capture per instance

4. **Actions**
   - Screenshot capture (when not in multiple items mode)
   - Analyze compliance button
   - Skip section or mark not applicable
   - Previous/Next navigation

5. **Results Display**
   - Compliance status with color coding
   - Pass/Fail/Review Needed indicators
   - AI reasoning for decisions

**Use Case:**

- Share with clients for review without granting edit access
- Provide read-only view of compliance status
- Enable stakeholder review of section applicability

## Application Architecture

### Directory Structure

```
app/
├── api/                  # API routes (serverless functions)
│   ├── assessments/     # Create, seed, status
│   ├── checks/          # Check CRUD, assessment, cloning
│   ├── analysis/        # AI analysis execution
│   ├── screenshots/     # Upload, presigning
│   └── projects/        # Project management
├── assessments/[id]/    # Main assessment UI
├── compliance/[projectId]/  # Client-facing compliance viewer
├── projects/            # Project list & creation
└── customers/           # Customer management

components/
├── checks/              # CheckList, CodeDetailPanel
├── pdf/                 # PDFViewer with annotations
├── screenshots/         # ScreenshotGallery
├── analysis/            # AnalysisPanel
└── ui/                  # Base components

lib/
├── ai/                  # AI provider integrations
├── supabase-server.ts  # Database client
├── s3.ts               # S3 upload/presign
└── prompt.ts           # Prompt templating

scripts/
├── load_db/            # Database loading
└── tag_element_sections.py  # Element tagging
```

### Key Technologies

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Database**: Supabase (PostgreSQL)
- **Storage**: AWS S3 (PDFs, screenshots)
- **AI**: Google Gemini 2.5 Pro, OpenAI GPT-4o, Anthropic Claude Opus 4
- **PDF**: PDF.js for rendering and annotation
- **Testing**: Vitest

### Data Flow

```
1. Project Setup
   Customer → Project → PDF Upload (S3)

2. Assessment Initialization
   Assessment created → AI filtering starts
   → Applicable sections identified
   → Checks seeded (batch processing)

3. Check Assessment
   User selects check
   → Views PDF → Captures screenshots → Upload to S3
   → Runs AI analysis → Analysis run stored
   → Results displayed → Manual override available

4. Completion
   All checks assessed (AI or manual)
   → Progress tracked → Report generated
```

## Python Data Processing

### Load Building Codes

```bash
# Load CBC Chapter 11B into database
python scripts/load_db/unified_code_upload_supabase.py \
  --file cbc_CA_2025.json
```

### Tag Element Sections

```bash
# Map code sections to building elements
python scripts/tag_element_sections.py
```

## Database

See `DATABASE_SCHEMA.md` for complete schema documentation.

**Key tables:**

- `customers`, `projects`, `assessments` - Project hierarchy
- `codes`, `sections` - Building code content
- `checks` - Compliance checks (both section-based and element-based)
- `analysis_runs` - AI assessment history
- `screenshots`, `screenshot_check_assignments` - Evidence images (many-to-many with checks)
- `element_groups`, `element_section_mappings` - Element-based checking with global/assessment-specific mappings
- `section_overrides` - Per-section overrides within element checks (deprecated in favor of check-level status)
- `compliance_sessions`, `section_checks`, `section_screenshots` - Alternative compliance workflow (client viewer)

**Connection:**
Always use the Supabase pooler connection (see CLAUDE.md for details).

## Architecture Decisions

### Why Multiple AI Providers?

- Different models excel at different tasks
- Fallback if one provider has issues
- Cost optimization based on task complexity
- Comparative analysis capability

### Why S3 for Screenshots?

- Vercel has 4.5MB request limit (too small for images)
- S3 presigned URLs enable direct client upload
- Scalable, cost-effective storage
- Signed URLs for secure access

### Check Instance Pattern

Supports both:

1. **Section-based checks**: 1 check per code section (traditional)
   - `check_type='section'`, single section per check
   - Used for standalone code sections not part of element groups
2. **Element-based checks**: Multiple sections per element (e.g., all door requirements)
   - `check_type='element'`, multiple sections assessed together
   - Uses `element_section_mappings` for global or assessment-specific section lists
3. **Instance labeling**: Both check types support multiple instances via `instance_label`
   - Example: "Door 1", "Door 2", etc. for the same element type
4. **Exclusion system**: Use `is_excluded=true` to remove checks without deletion

## Troubleshooting

### Assessment not seeding

- Check `/api/assessments/[id]/status` for seeding progress
- Check browser console for errors
- Verify AI API keys are configured

### Screenshots not uploading

- Verify S3 credentials in environment
- Check CORS configuration on S3 bucket
- Ensure bucket name matches environment variable

### AI analysis failing

- Check API key for selected provider
- Verify screenshots are accessible (presigned URLs not expired)
- Check serverless function timeout (extend if needed)

## Contributing

See `CLAUDE.md` for development guidelines and coding standards.

## Documentation

- **Setup & Deployment**
  - `TRUNK_BASED_SETUP_PLAN.md` - Complete setup guide for dev/prod environments
  - `DEVELOPMENT.md` - Daily development workflows and best practices
- **Architecture & Development**
  - `CLAUDE.md` - Development guidelines, architecture, patterns
  - `DATABASE_SCHEMA.md` - Complete database schema and relationships
- **Features**
  - `APPLICABILITY_FILTERING_README.md` - AI filtering system details

## Example Data

Sample drawing (255 California Street):
https://set4-data.s3.us-east-1.amazonaws.com/drawings/SAAIA/2024_0925_636386+-++255+California+St_5TH+FLOOR_IFC+set+Delta+2.pdf
