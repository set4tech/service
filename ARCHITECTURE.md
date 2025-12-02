# System Architecture

This document provides a comprehensive overview of the system architecture for the AI-powered building code compliance platform.

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT BROWSER                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Next.js App (React 19)                                              │   │
│  │  - Assessment UI with PDF viewer                                     │   │
│  │  - Screenshot capture & upload                                       │   │
│  │  - Compliance check management                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│     VERCEL (Main App)         │   │     RAILWAY (Agent Service)   │
│  ┌─────────────────────────┐  │   │  ┌─────────────────────────┐  │
│  │  Next.js 15 API Routes  │  │   │  │  FastAPI Python Service │  │
│  │  - /api/assessments/*   │  │   │  │  - POST /preprocess     │  │
│  │  - /api/checks/*        │  │   │  │  - POST /assess         │  │
│  │  - /api/screenshots/*   │  │   │  │  - GET /status/:id      │  │
│  │  - /api/sections/*      │  │   │  └─────────────────────────┘  │
│  └─────────────────────────┘  │   │              │                │
└───────────────────────────────┘   │  ┌───────────▼─────────────┐  │
                │                   │  │  Processing Pipeline    │  │
                │                   │  │  - YOLO detection       │  │
                │                   │  │  - Text extraction      │  │
                │                   │  │  - Table extraction     │  │
                │                   │  │  - LLM analysis         │  │
                │                   │  └─────────────────────────┘  │
                │                   └───────────────────────────────┘
                │                               │
    ┌───────────┴───────────────────────────────┴───────────────┐
    │                                                           │
    ▼                           ▼                               ▼
┌─────────────┐         ┌─────────────────┐         ┌───────────────────┐
│  SUPABASE   │         │     AWS S3      │         │   AI PROVIDERS    │
│  PostgreSQL │         │   (set4-data)   │         │                   │
│  - customers│         │  - PDFs         │         │  - Gemini 2.5 Pro │
│  - projects │         │  - Screenshots  │         │  - OpenAI GPT-4o  │
│  - checks   │         │  - Thumbnails   │         │  - Claude Opus 4  │
│  - sections │         │  - YOLO weights │         │                   │
└─────────────┘         └─────────────────┘         └───────────────────┘
```

## Service Components

### 1. Next.js Web Application (Vercel)

**Location**: Root directory (`/`)

The main web application deployed on Vercel, handling user interactions and compliance workflows.

**Key Responsibilities**:
- Project and assessment management UI
- Interactive PDF viewer with measurement tools
- Screenshot capture and annotation
- Compliance check management
- AI analysis orchestration
- Progress tracking and reporting

**Tech Stack**:
- Next.js 15.5.3 (App Router)
- React 19
- TypeScript 5.9
- Tailwind CSS 3.4
- PDF.js for document rendering

### 2. Python Agent Service (Railway)

**Location**: `/agent/`

A FastAPI service deployed on Railway for heavy PDF processing tasks that exceed Vercel's serverless limits.

**Key Responsibilities**:
- PDF download from S3
- PDF to image conversion (pdf2image)
- YOLO object detection (architectural elements)
- Text extraction and cleaning (PyMuPDF + LLM)
- Table/schedule extraction (Gemini VLM)
- Structured data output for compliance checking

**Tech Stack**:
- FastAPI + Uvicorn
- Python 3.11+
- YOLO (ultralytics)
- PyMuPDF (fitz)
- Google Generative AI (Gemini)
- Boto3 (S3 access)

**Deployment**: Railway with nixpacks builder

## Agent Service Architecture

### Pipeline System

The agent uses a modular pipeline architecture for processing PDF documents:

```
PDF Input
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│                     Pipeline                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │  1. Download PDF from S3                         │   │
│  │  2. Convert to page images (150 DPI)            │   │
│  │  3. Run YOLO detection                          │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│                         ▼                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Pipeline Steps (sequential)                     │   │
│  │  ├── FilterLowConfidence (threshold: 0.3)       │   │
│  │  ├── GroupByClass                               │   │
│  │  ├── ExtractText (PyMuPDF + LLM cleaning)       │   │
│  │  ├── ExtractTables (Gemini VLM)                 │   │
│  │  └── CountSummary                               │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│                         ▼                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Save results to agent_runs table               │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Pipeline Step Pattern

Each step follows the `PipelineStep` interface:

```python
class PipelineStep(ABC):
    name: str = "unnamed_step"

    @abstractmethod
    def process(self, ctx: PipelineContext) -> PipelineContext:
        """Process context and return updated context."""
        pass
```

**Context Structure**:
```python
@dataclass
class PipelineContext:
    assessment_id: str
    agent_run_id: str
    data: dict[str, Any]      # page_name -> page_data
    metadata: dict[str, Any]  # Additional context
```

### Available Pipeline Steps

| Step | Description | Input | Output |
|------|-------------|-------|--------|
| `FilterLowConfidence` | Remove detections below threshold | List of detections | Filtered detections |
| `GroupByClass` | Group detections by class name | Detections | `{detections, by_class}` |
| `ExtractText` | Extract text from PDF pages | PDF path | `metadata.extracted_text` |
| `ExtractTables` | Extract tables using Gemini VLM | Page images + detections | `metadata.extracted_tables` |
| `CountSummary` | Generate summary statistics | All data | `metadata.summary` |

### Agent API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check (returns `{"status": "ok"}`) |
| `/health` | GET | Health check for Railway |
| `/preprocess` | POST | Start PDF preprocessing job |
| `/assess` | POST | Run compliance assessment (TODO) |
| `/status/{agent_run_id}` | GET | Get job status and progress |

### Agent Run Lifecycle

```
1. Next.js creates agent_run record (status: pending)
2. Next.js calls POST /preprocess on Railway
3. Railway updates status: running, starts background task
4. Progress updates: step N/M, message
5. On completion: status: completed, results stored
6. On failure: status: failed, error stored
```

### Railway Configuration

**File**: `/agent/railway.toml`
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

**Required Environment Variables** (Railway):
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-key
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_S3_BUCKET_NAME=set4-data
GEMINI_API_KEY=your-gemini-key
```

## Data Flow

### PDF Upload & Processing

```
1. User uploads PDF
   └── Client → S3 (presigned URL) → drawings/{projectId}/{filename}.pdf

2. User triggers preprocess
   └── Next.js API → Creates agent_run → POST /preprocess (Railway)

3. Agent processes PDF
   └── Download from S3 → Convert pages → YOLO → Pipeline → Save results

4. Progress updates
   └── Agent → Supabase agent_runs → Next.js polls → UI updates
```

### Compliance Assessment

```
1. User captures screenshot
   └── PDF.js canvas → Crop → S3 presigned upload → screenshot record

2. User triggers AI analysis
   └── Next.js → Fetch screenshot from S3 → AI provider → analysis_runs

3. Results displayed
   └── compliance_status, confidence, violations, recommendations
```

## Database Schema (Key Tables)

See `DATABASE_SCHEMA.md` for complete schema. Key tables:

| Table | Purpose |
|-------|---------|
| `customers` | Organizations using the platform |
| `projects` | Building projects with PDF drawings |
| `assessments` | Compliance review sessions |
| `checks` | Individual compliance checks (section or element) |
| `analysis_runs` | AI analysis history |
| `agent_runs` | Agent processing jobs (preprocess, assess) |
| `sections` | Building code sections |
| `element_groups` | Building element types (doors, ramps, etc.) |

## Deployment Architecture

### Environments

| Environment | Web App | Agent | Database | S3 |
|-------------|---------|-------|----------|-----|
| Development | localhost:3000 | localhost:8000 | Supabase (dev) | set4-data |
| Staging | Vercel Preview | Railway (dev) | Supabase (dev) | set4-data |
| Production | Vercel | Railway (prod) | Supabase (prod) | set4-data |

### CI/CD Flow

```
Feature Branch → PR → Tests → Merge to dev → Staging deploy
                                    │
                                    ▼
                            Merge to main → Production deploy
```

## File Structure

```
/
├── app/                    # Next.js App Router
│   ├── api/               # API routes (Vercel serverless)
│   ├── assessments/       # Assessment pages
│   └── ...
├── components/            # React components
├── hooks/                 # React hooks
├── lib/                   # Shared utilities
│   ├── ai/               # AI provider integrations
│   ├── supabase-server.ts
│   └── s3.ts
├── agent/                 # Python agent service (Railway)
│   ├── main.py           # FastAPI app
│   ├── pipeline.py       # Pipeline framework
│   ├── llm.py            # LLM client
│   ├── prompts.py        # Prompt templates
│   ├── steps/            # Pipeline steps
│   │   ├── extract_text.py
│   │   └── extract_tables.py
│   ├── railway.toml      # Railway config
│   └── requirements.txt  # Python dependencies
├── scripts/              # Data processing scripts
├── supabase/             # Database migrations
└── e2e/                  # Playwright tests
```

## Security Considerations

1. **S3 Access**: Presigned URLs with short expiry (60s upload, 1hr view)
2. **Database**: Service role key for server-side only, anon key for client
3. **AI Providers**: API keys stored in environment variables
4. **CORS**: Configured for specific origins
5. **Rate Limiting**: AI provider rate limits with exponential backoff

## Performance Notes

1. **Vercel Limits**: 4.5MB request limit → S3 direct upload for images
2. **Railway**: No request size limits, suitable for PDF processing
3. **YOLO Weights**: Downloaded from S3 on container startup
4. **Token Limits**: Table extraction splits large images into quadrants
