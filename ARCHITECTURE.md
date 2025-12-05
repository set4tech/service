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
│  │  - Real-time chat Q&A interface                                      │   │
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
│  │  - /api/checks/*        │  │   │  │  - POST /assess-check   │  │
│  │  - /api/screenshots/*   │  │   │  │  - POST /filter         │  │
│  │  - /api/sections/*      │  │   │  │  - POST /chat           │  │
│  └─────────────────────────┘  │   │  │  - GET /status/:id      │  │
└───────────────────────────────┘   │  └─────────────────────────┘  │
               │                   │              │                │
               │                   │  ┌───────────▼─────────────┐  │
               │                   │  │  Agents & Pipelines     │  │
               │                   │  │  - Compliance Agent     │  │
               │                   │  │  - Chat Agent           │  │
               │                   │  │  - Preprocessing        │  │
               │                   │  │  - Tool System          │  │
               │                   │  └─────────────────────────┘  │
               │                   └───────────────────────────────┘
               │                               │
   ┌───────────┴───────────────────────────────┴───────────────┐
   │                                                           │
   ▼                           ▼                               ▼
┌─────────────┐         ┌─────────────────┐         ┌───────────────────┐
│  SUPABASE   │         │     AWS S3      │         │   AI PROVIDERS    │
│  PostgreSQL │         │   (set4-data)   │         │                   │
│  - customers│         │  - PDFs         │         │  - Claude Sonnet 4│
│  - projects │         │  - Screenshots  │         │  - Gemini 2.5 Pro │
│  - checks   │         │  - Thumbnails   │         │  - OpenAI GPT-4o  │
│  - sections │         │  - Page images  │         │  - GPT-4o-mini    │
└─────────────┘         │  - YOLO weights │         └───────────────────┘
                        └─────────────────┘
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

A FastAPI service deployed on Railway for PDF processing, AI-powered compliance assessment, and chat Q&A.

**Key Responsibilities**:

- PDF preprocessing: download, convert to images, YOLO detection
- Compliance assessment: Claude-powered agent with tool use
- Chat Q&A: Interactive document exploration
- Check filtering: AI-powered applicability filtering
- Text/table extraction (PyMuPDF + Gemini VLM)
- Structured data output for compliance checking

**Tech Stack**:

- FastAPI + Uvicorn
- Python 3.11+
- Anthropic Claude (claude-sonnet-4-20250514)
- Google Generative AI (Gemini 2.0 Flash)
- OpenAI (GPT-4o-mini for filtering)
- YOLO (ultralytics)
- PyMuPDF (fitz)
- Tesseract OCR
- Boto3 (S3 access)
- Langfuse (tracing/observability)

**Deployment**: Railway with nixpacks builder

## Agent Service Architecture

The agent service has three main capabilities:

1. **PDF Preprocessing** - Extract structured data from architectural drawings
2. **Compliance Assessment** - Evaluate building code compliance with tool-augmented AI
3. **Chat Q&A** - Interactive exploration of architectural documents

### Agent API Endpoints

| Endpoint                 | Method | Description                                                   |
| ------------------------ | ------ | ------------------------------------------------------------- |
| `/`                      | GET    | Health check (returns `{"status": "ok", "service": "agent"}`) |
| `/health`                | GET    | Health check for Railway                                      |
| `/preprocess`            | POST   | Start PDF preprocessing job (background task)                 |
| `/assess-check`          | POST   | Run compliance assessment for single check (SSE streaming)    |
| `/filter`                | POST   | Start AI-powered check filtering (background task)            |
| `/chat`                  | POST   | Chat Q&A about architectural drawings (SSE streaming)         |
| `/status/{agent_run_id}` | GET    | Get job status and progress                                   |

### Preprocessing Pipeline

The preprocessing pipeline extracts structured data from PDF documents:

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
│  │  Phase A (Sync)                                  │   │
│  │  ├── FilterLowConfidence (threshold: 0.3)       │   │
│  │  └── GroupByClass                               │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│                         ▼                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Phase B (Parallel)                              │   │
│  │  ├── ExtractText (PyMuPDF + LLM cleaning)       │   │
│  │  ├── ExtractSheetInfo (sheet numbers/titles)    │   │
│  │  └── ExtractProjectInfo (project metadata)      │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│                         ▼                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Phase C (Parallel)                              │   │
│  │  ├── ExtractTables (Gemini VLM)                 │   │
│  │  ├── OCRBboxes (Tesseract on detections)        │   │
│  │  └── ExtractElementTags (element classification)│   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│                         ▼                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Phase D (Sequential)                            │   │
│  │  ├── ExtractLegends (schedule data)             │   │
│  │  ├── MatchTagsToLegends (tag-to-legend mapping) │   │
│  │  ├── CountSummary (statistics)                  │   │
│  │  └── UnifyAndUpload (JSON output, S3 upload)    │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Pipeline Step Pattern**:

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

| Step                  | Description                                     | Input                    | Output                      |
| --------------------- | ----------------------------------------------- | ------------------------ | --------------------------- |
| `FilterLowConfidence` | Remove detections below threshold               | List of detections       | Filtered detections         |
| `GroupByClass`        | Group detections by class name                  | Detections               | `{detections, by_class}`    |
| `ExtractText`         | Extract text from PDF pages                     | PDF path                 | `metadata.extracted_text`   |
| `ExtractSheetInfo`    | Extract sheet number/title from title blocks    | Page images              | `metadata.sheet_info`       |
| `ExtractProjectInfo`  | Extract project metadata from cover sheets      | Page images              | `metadata.project_info`     |
| `ExtractTables`       | Extract tables using Gemini VLM                 | Page images + detections | `metadata.extracted_tables` |
| `OCRBboxes`           | Run Tesseract OCR on detection bboxes           | Detections               | OCR text per detection      |
| `ExtractElementTags`  | Extract and classify architectural element tags | Page images              | Element tags                |
| `ExtractLegends`      | Extract legend/schedule data from tables        | Tables                   | Legend entries              |
| `MatchTagsToLegends`  | Match element tags to legend entries            | Tags + legends           | Matched pairs               |
| `CountSummary`        | Generate summary statistics                     | All data                 | `metadata.summary`          |
| `UnifyAndUpload`      | Unify all data, upload images to S3             | All data                 | Unified JSON document       |

### Compliance Agent

The compliance agent evaluates building code compliance using Claude with tool use.

**Architecture**:

```
┌─────────────────────────────────────────────────────────┐
│                  ComplianceAgent                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Input:                                          │   │
│  │  - Code section (number, title, text, tables)   │   │
│  │  - Building context (project variables)         │   │
│  │  - Screenshots (presigned URLs)                 │   │
│  │  - Few-shot corrections (past human overrides)  │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│                         ▼                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Claude Sonnet 4 (tool_use)                      │   │
│  │  - System prompt: Compliance expert             │   │
│  │  - Max 15 tool iterations                       │   │
│  │  - Langfuse tracing                             │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│                         ▼                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Tool Execution Loop                             │   │
│  │  ├── Document navigation tools                  │   │
│  │  ├── Compliance calculation tools               │   │
│  │  └── Vision tools (violation bbox detection)    │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│                         ▼                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Output (SSE streaming):                         │   │
│  │  - thinking: Agent reasoning                    │   │
│  │  - tool_use: Tool invocations                   │   │
│  │  - tool_result: Tool responses                  │   │
│  │  - done: Final assessment JSON                  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Assessment Result Structure**:

```typescript
interface AssessmentResult {
  compliance_status: 'compliant' | 'non_compliant' | 'needs_more_info' | 'not_applicable';
  confidence: 'high' | 'medium' | 'low';
  ai_reasoning: string;
  violations?: Array<{
    description: string;
    severity: 'critical' | 'major' | 'minor';
    location_in_evidence: string;
    bounding_boxes?: Array<{
      x: number; // 0-1 normalized
      y: number; // 0-1 normalized
      width: number; // 0-1 normalized
      height: number; // 0-1 normalized
      label: string;
    }>;
  }>;
  compliant_aspects?: string[];
  recommendations?: string[];
  additional_evidence_needed?: string[];
  reasoning_trace: Array<{ type: string; content: any }>;
  tools_used: string[];
  iteration_count: number;
}
```

### Chat Agent

The chat agent provides interactive Q&A about architectural drawings.

**Features**:

- Multi-turn conversation support with in-memory history
- Document navigation tools for searching and reading drawings
- Image viewing capability (returns base64 images)
- Uses Claude Sonnet 4 for natural conversation

**Output (SSE streaming)**:

- `text`: Chat response chunks
- `tool_use`: Tool invocations
- `tool_result`: Tool responses
- `image`: Image data with metadata
- `done`: Conversation complete

### Tool System

The agent service includes a comprehensive tool system for document navigation and compliance calculations.

**Document Navigation Tools** (8 tools):
| Tool | Description |
|------|-------------|
| `find_schedules` | Find door/window/finish/equipment schedules |
| `search_drawings` | Search pages for keywords |
| `get_room_list` | Get rooms with areas and occupancy |
| `get_project_info` | Get project metadata |
| `get_sheet_list` | List all sheets |
| `read_sheet_details` | Read specific sheet content |
| `get_keynotes` | Get keynotes and notes |
| `view_sheet_image` | View sheet image directly (returns base64) |

**Compliance-Specific Tools** (10 tools):
| Tool | Description |
|------|-------------|
| `calculate` | Evaluate math expressions (area, percentages) |
| `parse_dimension` | Parse architectural dimensions (3'-6", 914mm) to decimal inches |
| `compare_dimensions` | Compare two dimensions |
| `check_clearance_requirement` | Check if dimension meets minimum |
| `get_site_data` | Get construction type, occupancy, fire separation |
| `get_elements_by_type` | Find doors, windows, stairs, ramps, etc. |
| `get_element_attributes` | Get details for specific element by tag |
| `lookup_cbc_table` | Look up CBC table values |
| `mark_violation_areas` | Use Gemini vision to detect violation bounding boxes |

**Tool Executors**:

- `ChatToolExecutor`: Executes document navigation tools
- `ComplianceToolExecutor`: Executes all tools (navigation + compliance)

### Agent Run Lifecycle

```
1. Next.js creates agent_run record (status: pending)
2. Next.js calls POST /preprocess on Railway
3. Railway updates status: running, starts background task
4. Progress updates: step N/M, message
5. On completion: status: completed, results stored
6. On failure: status: failed, error stored
```

### Filtering Process

The `/filter` endpoint uses GPT-4o-mini to evaluate check applicability:

```
1. Fetch checks for assessment (status: pending)
2. Process in batches of 20
3. For each check, evaluate against project variables
4. Update check.excluded based on applicability
5. Track progress: filtering_checks_processed / filtering_checks_total
6. Status: pending → in_progress → completed | failed
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
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_S3_BUCKET_NAME=set4-data

# AI Providers
ANTHROPIC_API_KEY=your-anthropic-key
GEMINI_API_KEY=your-gemini-key
OPENAI_API_KEY=your-openai-key

# Observability (optional)
LANGFUSE_PUBLIC_KEY=your-langfuse-key
LANGFUSE_SECRET_KEY=your-langfuse-secret
LANGFUSE_HOST=https://cloud.langfuse.com
HELICONE_API_KEY=your-helicone-key
```

**Configuration Options** (`config.py`):

```python
# PDF Processing
PDF_DPI = 150                    # DPI for PDF to image conversion
PDF_DPI_FALLBACK = 72            # Fallback for large PDFs

# YOLO Detection
YOLO_CONFIDENCE_THRESHOLD = 0.3  # Minimum detection confidence
YOLO_WEIGHTS_S3_KEY = "models/weights.pt"

# LLM Settings
LLM_PROVIDER = "gemini"          # gemini | openai | anthropic
LLM_MODEL = "gemini-2.0-flash"   # Default model
LLM_MAX_TOKENS = 8000            # Max output tokens

# Parallel Processing
PARALLEL_VLM_CONCURRENCY = 10    # Max concurrent VLM calls
PARALLEL_OCR_WORKERS = 4         # CPU workers for Tesseract
PARALLEL_RATE_LIMIT_RETRY = 3    # Max retries on rate limit
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
   └── Upload page images to S3 → page-images/{assessmentId}/page_{N}.png

4. Progress updates
   └── Agent → Supabase agent_runs → Next.js polls → UI updates
```

### Compliance Assessment

```
1. User captures screenshot
   └── PDF.js canvas → Crop → S3 presigned upload → screenshot record

2. User triggers AI analysis
   └── Next.js → POST /assess-check (Railway, SSE)
   └── Load unified document → Build context → Claude with tools
   └── Stream: thinking → tool_use → tool_result → done

3. Results displayed
   └── compliance_status, confidence, violations (with bounding boxes)
```

### Chat Q&A

```
1. User sends message
   └── Next.js → POST /chat (Railway, SSE)

2. Agent processes query
   └── Load conversation history → Load unified document
   └── Claude with document tools → Stream response

3. Response displayed
   └── Text, images, tool results
```

## Database Schema (Key Tables)

See `DATABASE_SCHEMA.md` for complete schema. Key tables:

| Table            | Purpose                                            |
| ---------------- | -------------------------------------------------- |
| `customers`      | Organizations using the platform                   |
| `projects`       | Building projects with PDF drawings                |
| `assessments`    | Compliance review sessions                         |
| `checks`         | Individual compliance checks (section or element)  |
| `analysis_runs`  | AI analysis history                                |
| `agent_runs`     | Agent processing jobs (preprocess, assess, filter) |
| `sections`       | Building code sections                             |
| `element_groups` | Building element types (doors, ramps, etc.)        |

**Assessment Filtering Fields**:

```sql
assessments:
  filtering_status: 'pending' | 'in_progress' | 'completed' | 'failed'
  filtering_checks_total: int
  filtering_checks_processed: int
  filtering_excluded_count: int
  filtering_started_at: timestamp
  filtering_completed_at: timestamp
  filtering_error: text
```

## Deployment Architecture

### Environments

| Environment | Web App        | Agent          | Database        | S3        |
| ----------- | -------------- | -------------- | --------------- | --------- |
| Development | localhost:3000 | localhost:8000 | Supabase (dev)  | set4-data |
| Staging     | Vercel Preview | Railway (dev)  | Supabase (dev)  | set4-data |
| Production  | Vercel         | Railway (prod) | Supabase (prod) | set4-data |

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
│   ├── main.py           # FastAPI app, all endpoints
│   ├── compliance_agent.py # ComplianceAgent class (streaming)
│   ├── compliance_tools.py # ComplianceToolExecutor + tool defs
│   ├── chat_agent.py     # ChatAgent + ConversationManager
│   ├── chat_tools.py     # DocumentNavigator, ChatToolExecutor
│   ├── pipeline.py       # Pipeline framework
│   ├── llm.py            # Gemini client + VLM/text functions
│   ├── config.py         # Configuration management
│   ├── prompts.py        # LLM prompt templates
│   ├── tracing.py        # Langfuse + Phoenix tracing
│   ├── violation_bbox.py # Gemini vision for violation detection
│   ├── image_utils.py    # Image processing utilities
│   ├── steps/            # Pipeline steps
│   │   ├── extract_text.py
│   │   ├── extract_tables.py
│   │   ├── extract_legends.py
│   │   ├── extract_element_tags.py
│   │   ├── extract_sheet_info.py
│   │   ├── extract_project_info.py
│   │   ├── ocr_bboxes.py
│   │   ├── match_tags_to_legends.py
│   │   └── unify_and_upload.py
│   ├── tests/            # Unit and integration tests
│   ├── eval/             # Evaluation scripts
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
6. **Image Limits**: Images resized to stay under 3.5MB API limit

## Performance Notes

1. **Vercel Limits**: 4.5MB request limit → S3 direct upload for images
2. **Railway**: No request size limits, suitable for PDF processing
3. **YOLO Weights**: Downloaded from S3 on container startup
4. **Token Limits**: Table extraction splits large images into quadrants
5. **Parallel Processing**: Configurable concurrency for VLM and OCR operations
6. **Caching**: Unified document data cached in memory per assessment
7. **Streaming**: SSE for real-time feedback during assessment and chat

## Observability

The agent service integrates with multiple observability providers:

**Langfuse** (default):

- Trace spans for agent iterations
- Input/output logging
- Metadata and cost tracking

**Helicone** (optional):

- LLM request proxying
- Usage analytics

**Phoenix** (optional, local):

- Local tracing UI
- OTLP export support
