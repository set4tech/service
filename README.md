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

Required environment variables (see CLAUDE.md for full details):

```bash
# Supabase
SUPABASE_URL=your-project-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
S3_BUCKET_NAME=your-bucket

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
- **Graph DB**: Neo4j (code relationships)
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
- `checks` - Compliance checks
- `analysis_runs` - AI assessment history
- `screenshots` - Evidence images
- `element_groups`, `element_section_mappings` - Element-based checking

**Connection:**
Always use the Supabase pooler connection (see CLAUDE.md for details).

## Architecture Decisions

### Why Two Database Systems?

- **PostgreSQL/Supabase**: Relational data (projects, checks, assessments)
- **Neo4j**: Code relationship graphs (section dependencies, assemblies)

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

1. **Section-based**: 1 check per code section (traditional)
2. **Element-based**: Multiple sections per element (e.g., all door requirements)
3. **Instances**: Clone checks for multiple occurrences (Door 1, Door 2, etc.)

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

- `CLAUDE.md` - Development guidelines, architecture, patterns
- `DATABASE_SCHEMA.md` - Complete database schema and relationships
- `APPLICABILITY_FILTERING_README.md` - AI filtering system details

## Example Data

Sample drawing (255 California Street):
https://set4-data.s3.us-east-1.amazonaws.com/drawings/SAAIA/2024_0925_636386+-++255+California+St_5TH+FLOOR_IFC+set+Delta+2.pdf
