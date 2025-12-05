"""
Agent Service - PDF preprocessing, compliance assessment, and chat

Endpoints:
- POST /preprocess - Download PDF, convert to images, run YOLO detection
- POST /assess - Run full compliance assessment (TODO)
- POST /assess-check - Run agent compliance assessment for a single check (SSE streaming)
- POST /chat - Chat with architectural drawings
"""
import os
import json
import logging
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Optional
from uuid import uuid4
from contextlib import asynccontextmanager

import boto3
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import create_client, Client
from ultralytics import YOLO
from openai import OpenAI

import config
from tracing import setup_tracing, start_phoenix_server

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Clients
supabase: Optional[Client] = None
s3_client = None
openai_client: Optional[OpenAI] = None
WEIGHTS_PATH = Path(__file__).parent / "weights.pt"


def get_supabase() -> Client:
    global supabase
    if supabase is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        supabase = create_client(url, key)
    return supabase


def get_s3():
    global s3_client
    if s3_client is None:
        s3_client = boto3.client(
            's3',
            region_name=os.environ.get('AWS_REGION', 'us-east-1'),
            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
        )
    return s3_client


def get_openai() -> OpenAI:
    """Get or create OpenAI client for GPT-4o-mini filtering."""
    global openai_client
    if openai_client is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY must be set for filtering")
        openai_client = OpenAI(api_key=api_key)
    return openai_client


def download_weights_if_needed():
    """Download YOLO weights from S3 if not present locally."""
    if WEIGHTS_PATH.exists():
        logger.info(f"YOLO weights already present: {WEIGHTS_PATH}")
        return

    bucket = get_bucket_name()
    s3 = get_s3()
    logger.info(f"Downloading YOLO weights from s3://{bucket}/{config.YOLO_WEIGHTS_S3_KEY}...")
    s3.download_file(bucket, config.YOLO_WEIGHTS_S3_KEY, str(WEIGHTS_PATH))
    logger.info(f"YOLO weights downloaded to {WEIGHTS_PATH}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Agent Service...")

    # Initialize Phoenix tracing (set PHOENIX_ENABLED=true to start local server)
    if os.environ.get("PHOENIX_ENABLED", "").lower() in ("true", "1", "yes"):
        phoenix_session = start_phoenix_server()
        if phoenix_session:
            logger.info(f"Phoenix UI available at {phoenix_session.url}")

    # Set up tracing instrumentation (sends to Phoenix endpoint)
    setup_tracing()

    try:
        get_supabase()
        logger.info("Supabase client initialized")
    except Exception as e:
        logger.warning(f"Supabase not configured: {e}")

    try:
        get_s3()
        logger.info("S3 client initialized")
    except Exception as e:
        logger.warning(f"S3 not configured: {e}")

    # Download YOLO weights from S3 if needed
    try:
        download_weights_if_needed()
    except Exception as e:
        logger.warning(f"Could not download YOLO weights: {e}")

    yield
    logger.info("Shutting down Agent Service...")


app = FastAPI(
    title="Agent Service",
    description="PDF preprocessing and compliance assessment",
    version="0.1.0",
    lifespan=lifespan,
)


# Request/Response models
class PreprocessRequest(BaseModel):
    assessment_id: str
    agent_run_id: str
    pdf_s3_key: str  # e.g., "drawings/project-id/filename.pdf"


class PreprocessResponse(BaseModel):
    status: str
    message: str
    agent_run_id: str


class AssessRequest(BaseModel):
    assessment_id: str
    agent_run_id: str


class StatusResponse(BaseModel):
    id: str
    status: str
    progress: dict
    started_at: Optional[str]
    completed_at: Optional[str]
    error: Optional[str]


class FilterRequest(BaseModel):
    assessment_id: str
    reset: bool = False


class FilterResponse(BaseModel):
    status: str
    message: str


FILTER_BATCH_SIZE = 20


def update_progress(agent_run_id: str, step: int, total_steps: int, message: str):
    """Update agent_run progress in database."""
    db = get_supabase()
    db.table("agent_runs").update({
        "progress": {
            "step": step,
            "total_steps": total_steps,
            "message": message
        }
    }).eq("id", agent_run_id).execute()
    logger.info(f"[{agent_run_id}] Step {step}/{total_steps}: {message}")


def get_bucket_name() -> str:
    """Get the S3 bucket name from environment."""
    return config.S3_BUCKET_NAME


def download_pdf_from_s3(s3_key: str, local_path: Path) -> None:
    """Download PDF from S3 to local path."""
    bucket = get_bucket_name()
    s3 = get_s3()
    logger.info(f"Downloading s3://{bucket}/{s3_key} to {local_path}")
    s3.download_file(bucket, s3_key, str(local_path))


def pdf_to_images(pdf_path: Path, output_dir: Path, dpi: int = None) -> list[Path]:
    """Convert PDF pages to PNG images using per-page conversion for better performance."""
    import fitz  # pymupdf - much faster than pdf2image/poppler

    dpi = dpi or config.PDF_DPI
    logger.info(f"Converting PDF to images (dpi={dpi}) using pymupdf...")
    output_dir.mkdir(parents=True, exist_ok=True)

    # Calculate zoom factor from DPI (pymupdf default is 72 dpi)
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)

    image_paths = []
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    logger.info(f"  PDF has {total_pages} pages")

    for i, page in enumerate(doc, start=1):
        # Render page to pixmap
        pix = page.get_pixmap(matrix=matrix)

        # Save as PNG
        img_path = output_dir / f"page_{i:03d}.png"
        pix.save(str(img_path))
        image_paths.append(img_path)
        logger.info(f"  Saved {img_path.name} ({pix.width}x{pix.height})")

    doc.close()
    return image_paths


def run_yolo_inference(image_paths: list[Path], weights_path: Path) -> dict:
    """Run YOLO inference on images and return detections."""
    logger.info(f"Loading YOLO model from {weights_path}...")
    model = YOLO(weights_path)

    all_detections = {}
    for img_path in image_paths:
        results = model(img_path, verbose=False)

        detections = []
        for r in results:
            for box in r.boxes:
                detections.append({
                    "class_id": int(box.cls.item()),
                    "class_name": r.names[int(box.cls.item())],
                    "confidence": round(float(box.conf.item()), 3),
                    "bbox": [round(x, 1) for x in box.xyxy[0].tolist()]
                })

        all_detections[img_path.name] = detections
        logger.info(f"  {img_path.name}: {len(detections)} detections")

    return all_detections


def build_preprocess_pipeline():
    """
    Build the preprocessing pipeline with parallelized steps.

    Pipeline Phases:
    - Phase A (sync): Filter and group detections
    - Phase B (parallel): Page-level extraction (text, sheet info, project info)
    - Phase C (parallel): Detection-level extraction (tables, OCR, element tags)
    - Phase D (sequential): Post-processing steps that depend on earlier phases
    """
    from pipeline import Pipeline, ParallelSteps, FilterLowConfidence, GroupByClass, CountSummary
    from steps.extract_tables import ExtractTables
    from steps.extract_text import ExtractText
    from steps.ocr_bboxes import OCRBboxes
    from steps.extract_project_info import ExtractProjectInfo
    from steps.extract_sheet_info import ExtractSheetInfo
    from steps.extract_legends import ExtractLegends
    from steps.extract_element_tags import ExtractElementTags
    from steps.match_tags_to_legends import MatchTagsToLegends
    from steps.unify_and_upload import UnifyAndUpload

    return Pipeline([
        # Phase A: Sync preprocessing
        FilterLowConfidence(threshold=config.PIPELINE_FILTER_THRESHOLD),
        GroupByClass(),

        # Phase B: Page-level extraction (parallel)
        # These process each page independently and can run concurrently
        ParallelSteps([
            ExtractText(clean_with_llm=config.TEXT_CLEAN_WITH_LLM),
            ExtractSheetInfo(),
            ExtractProjectInfo(),
        ]),

        # Phase C: Detection-level extraction (parallel)
        # These process YOLO detections and can run concurrently
        ParallelSteps([
            ExtractTables(),
            OCRBboxes(),
            ExtractElementTags(),
        ]),

        # Phase D: Sequential post-processing
        ExtractLegends(),  # Depends on ExtractTables
        MatchTagsToLegends(),  # Depends on ExtractElementTags and ExtractLegends
        CountSummary(),
        UnifyAndUpload(),  # Final step: Unify data and upload to S3
    ])


async def run_preprocess(assessment_id: str, agent_run_id: str, pdf_s3_key: str):
    """Background task: Download PDF, convert to images, run YOLO, run pipeline."""
    from pipeline import PipelineContext

    db = get_supabase()
    base_steps = 4  # Download, convert, YOLO, pipeline

    try:
        db.table("agent_runs").update({
            "status": "running",
            "started_at": datetime.utcnow().isoformat(),
        }).eq("id", agent_run_id).execute()

        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir = Path(tmpdir)
            pdf_path = tmpdir / "input.pdf"
            images_dir = tmpdir / "pages"

            # Step 1: Download PDF
            update_progress(agent_run_id, 1, base_steps, "Downloading PDF from S3...")
            download_pdf_from_s3(pdf_s3_key, pdf_path)

            # Step 2: Convert to images
            update_progress(agent_run_id, 2, base_steps, "Converting PDF to images...")
            image_paths = pdf_to_images(pdf_path, images_dir)

            # Step 3: Run YOLO
            update_progress(agent_run_id, 3, base_steps, f"Running YOLO on {len(image_paths)} pages...")
            if not WEIGHTS_PATH.exists():
                raise FileNotFoundError(f"YOLO weights not found: {WEIGHTS_PATH}")
            detections = run_yolo_inference(image_paths, WEIGHTS_PATH)

            # Step 4: Run pipeline on detections
            update_progress(agent_run_id, 4, base_steps, "Running analysis pipeline...")

            pipeline = build_preprocess_pipeline()
            ctx = PipelineContext(
                assessment_id=assessment_id,
                agent_run_id=agent_run_id,
                data=detections,
                metadata={
                    "pdf_s3_key": pdf_s3_key,
                    "pdf_path": str(pdf_path),
                    "pages": len(image_paths),
                    "images_dir": str(images_dir),
                },
            )

            # Run pipeline with progress updates
            def pipeline_progress(step: int, total: int, message: str):
                # Offset by base steps for overall progress
                update_progress(agent_run_id, base_steps + step, base_steps + total, message)

            result = await pipeline.run_async(ctx, progress_callback=pipeline_progress)

            # Save results to DB (images already uploaded by UnifyAndUpload step)
            total_steps = base_steps + len(pipeline.steps)
            update_progress(agent_run_id, total_steps, total_steps, "Saving results...")

            # Get unified document from pipeline (built by UnifyAndUpload step)
            pipeline_output = result.metadata.get("unified_document", {
                "assessment_id": assessment_id,
                "pages": result.data,
                "metadata": result.metadata,
            })

            # Save pipeline output to assessments table (single source of truth)
            db.table("assessments").update({
                "pipeline_output": pipeline_output
            }).eq("id", assessment_id).execute()
            logger.info(f"Saved pipeline_output to assessment {assessment_id}")

            # Update agent run status
            db.table("agent_runs").update({
                "status": "completed",
                "completed_at": datetime.utcnow().isoformat(),
                "progress": {"step": total_steps, "total_steps": total_steps, "message": "Complete"},
                "results": {
                    "type": "preprocess",
                    "pages_processed": len(image_paths),
                }
            }).eq("id", agent_run_id).execute()

        logger.info(f"Preprocess completed: {len(image_paths)} pages, {result.metadata.get('summary', {})}")

    except Exception as e:
        logger.exception(f"Preprocess failed for {agent_run_id}: {e}")
        db.table("agent_runs").update({
            "status": "failed",
            "completed_at": datetime.utcnow().isoformat(),
            "error": str(e)
        }).eq("id", agent_run_id).execute()


# API Endpoints
@app.get("/")
async def root():
    return {"status": "ok", "service": "agent"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.post("/preprocess", response_model=PreprocessResponse)
async def preprocess(request: PreprocessRequest, background_tasks: BackgroundTasks):
    """Preprocess a PDF: download from S3, convert to images, run YOLO detection."""
    logger.info(f"Preprocess request: assessment={request.assessment_id}, run={request.agent_run_id}")

    db = get_supabase()
    result = db.table("agent_runs").select("*").eq("id", request.agent_run_id).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Agent run not found")

    if result.data["status"] != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Agent run is not pending (status: {result.data['status']})"
        )

    background_tasks.add_task(
        run_preprocess,
        request.assessment_id,
        request.agent_run_id,
        request.pdf_s3_key
    )

    return PreprocessResponse(
        status="started",
        message="Preprocessing started",
        agent_run_id=request.agent_run_id
    )


@app.post("/assess")
async def assess(request: AssessRequest, background_tasks: BackgroundTasks):
    """Run compliance assessment. TODO: Implement."""
    raise HTTPException(status_code=501, detail="Not implemented yet")


# =============================================================================
# FILTER ENDPOINT (AI-powered check filtering)
# =============================================================================

def flatten_variables(variables: dict) -> dict:
    """Flatten extracted_variables into a simple key-value map."""
    flat = {}
    for category, vars_dict in variables.items():
        if category == "_metadata":
            continue
        if not isinstance(vars_dict, dict):
            continue
        for key, val in vars_dict.items():
            # Handle { value: x, confidence: y } structure
            if isinstance(val, dict) and "value" in val:
                flat[key] = val["value"]
            else:
                flat[key] = val
    return flat


def evaluate_check_batch(checks: list[dict], project_params: dict) -> list[dict]:
    """Call GPT-4o-mini to evaluate which checks should be excluded."""
    client = get_openai()

    # Format project parameters for the prompt
    param_lines = []
    for key, value in project_params.items():
        if value is None or value == "":
            continue
        formatted_key = key.replace("_", " ").title()
        param_lines.append(f"- {formatted_key}: {json.dumps(value)}")
    param_str = "\n".join(param_lines) if param_lines else "(No parameters provided)"

    # Format checks for the prompt
    check_lines = []
    for i, c in enumerate(checks, 1):
        check_lines.append(f"{i}. [{c['id']}] {c['code_section_number']} - {c['code_section_title']}")
    check_str = "\n".join(check_lines)

    prompt = f"""You evaluate building code sections for applicability to a specific project.

PROJECT PARAMETERS:
{param_str}

Evaluate each code section below. Mark "exclude": true if the section should be EXCLUDED because:
- It references building elements NOT present in this project (e.g., parking requirements when the project has no parking)
- It applies to different building/occupancy types than this project
- It requires conditions not met by this project (e.g., elevator sections when there's no elevator)
- It's for work types not applicable (e.g., alteration-only sections for new construction)

Be conservative - if uncertain, do NOT exclude (exclude: false).

CODE SECTIONS TO EVALUATE:
{check_str}

Respond ONLY with valid JSON array:
[{{"id":"<check_id>","exclude":true/false}},...]"""

    logger.info(f"[filter] Evaluating batch of {len(checks)} checks")

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_tokens=2000,
            temperature=0.1,
        )

        raw = response.choices[0].message.content or "[]"

        # Parse the response - handle both array and object with "results" key
        parsed = json.loads(raw)
        if isinstance(parsed, dict) and "results" in parsed:
            parsed = parsed["results"]
        if not isinstance(parsed, list):
            logger.error(f"[filter] Unexpected response format: {raw}")
            return [{"id": c["id"], "exclude": False} for c in checks]

        return parsed

    except Exception as e:
        logger.error(f"[filter] Failed to evaluate batch: {e}")
        return [{"id": c["id"], "exclude": False} for c in checks]


async def run_filter_checks(assessment_id: str, reset: bool):
    """Background task: Filter checks using GPT-4o-mini."""
    db = get_supabase()

    try:
        # Get assessment with project data
        result = db.table("assessments").select(
            "id, project_id, projects(id, extracted_variables)"
        ).eq("id", assessment_id).single().execute()

        if not result.data:
            logger.error(f"[filter] Assessment {assessment_id} not found")
            return

        assessment = result.data
        project = assessment.get("projects")
        extracted_variables = project.get("extracted_variables") if project else None

        if not extracted_variables:
            logger.error(f"[filter] No project parameters for assessment {assessment_id}")
            db.table("assessments").update({
                "filtering_status": "failed",
                "filtering_error": "No project parameters found",
            }).eq("id", assessment_id).execute()
            return

        # Flatten variables for the prompt
        flat_params = flatten_variables(extracted_variables)
        logger.info(f"[filter] Project parameters: {flat_params}")

        # If reset, clear all is_excluded flags first
        if reset:
            logger.info("[filter] Resetting existing exclusions")
            db.table("checks").update({"is_excluded": False}).eq("assessment_id", assessment_id).execute()

        # Get all checks to evaluate
        checks_result = db.table("checks").select(
            "id, code_section_number, code_section_title"
        ).eq("assessment_id", assessment_id).eq("is_excluded", False).order("code_section_number").execute()

        checks = checks_result.data or []
        total_checks = len(checks)
        logger.info(f"[filter] Found {total_checks} checks to evaluate")

        if total_checks == 0:
            db.table("assessments").update({
                "filtering_status": "completed",
                "filtering_checks_processed": 0,
                "filtering_checks_total": 0,
                "filtering_excluded_count": 0,
                "filtering_completed_at": datetime.utcnow().isoformat(),
            }).eq("id", assessment_id).execute()
            return

        # Update status to in_progress
        db.table("assessments").update({
            "filtering_status": "in_progress",
            "filtering_checks_total": total_checks,
            "filtering_checks_processed": 0,
            "filtering_excluded_count": 0,
            "filtering_started_at": datetime.utcnow().isoformat(),
            "filtering_error": None,
        }).eq("id", assessment_id).execute()

        # Process in batches
        processed = 0
        excluded_count = 0

        for i in range(0, total_checks, FILTER_BATCH_SIZE):
            batch = checks[i:i + FILTER_BATCH_SIZE]

            try:
                results = evaluate_check_batch(batch, flat_params)

                # Update excluded checks
                to_exclude = [r["id"] for r in results if r.get("exclude")]
                if to_exclude:
                    db.table("checks").update({"is_excluded": True}).in_("id", to_exclude).execute()
                    excluded_count += len(to_exclude)

                processed += len(batch)

                # Update progress
                db.table("assessments").update({
                    "filtering_checks_processed": processed,
                    "filtering_excluded_count": excluded_count,
                }).eq("id", assessment_id).execute()

                logger.info(f"[filter] Progress: {processed}/{total_checks}, excluded: {excluded_count}")

            except Exception as batch_error:
                logger.error(f"[filter] Batch error at {i}: {batch_error}")
                processed += len(batch)

        # Mark as completed
        db.table("assessments").update({
            "filtering_status": "completed",
            "filtering_checks_processed": processed,
            "filtering_excluded_count": excluded_count,
            "filtering_completed_at": datetime.utcnow().isoformat(),
        }).eq("id", assessment_id).execute()

        logger.info(f"[filter] Completed: {excluded_count}/{total_checks} checks excluded")

    except Exception as e:
        logger.exception(f"[filter] Error filtering assessment {assessment_id}: {e}")
        db.table("assessments").update({
            "filtering_status": "failed",
            "filtering_error": str(e),
        }).eq("id", assessment_id).execute()


@app.post("/filter", response_model=FilterResponse)
async def filter_checks(request: FilterRequest, background_tasks: BackgroundTasks):
    """Filter checks using AI to determine applicability based on project parameters."""
    logger.info(f"[filter] Request: assessment={request.assessment_id}, reset={request.reset}")

    db = get_supabase()

    # Verify assessment exists
    result = db.table("assessments").select("id, filtering_status").eq("id", request.assessment_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Check if already in progress
    if result.data.get("filtering_status") == "in_progress":
        raise HTTPException(status_code=400, detail="Filtering already in progress")

    # Start background task
    background_tasks.add_task(run_filter_checks, request.assessment_id, request.reset)

    return FilterResponse(
        status="started",
        message="Filtering started",
    )


# =============================================================================
# ASSESS-CHECK ENDPOINT (Agent Compliance Assessment)
# =============================================================================

class AssessCheckRequest(BaseModel):
    """Request model for single-check agent assessment."""
    check_id: str
    agent_run_id: str
    assessment_id: str
    code_section: dict  # {number, title, text, requirements, tables}
    building_context: Optional[dict] = None  # Project extracted_variables
    screenshots: Optional[list[str]] = None  # List of presigned URLs


def fetch_correction_examples(section_number: str, limit: int = 3) -> list[dict]:
    """
    Fetch past human corrections for a specific code section.

    Returns list of dicts with:
    - ai_status: What AI originally assessed
    - human_status: What human corrected it to
    - human_note: Human's reasoning for the correction
    - ai_reasoning: AI's original reasoning (truncated)
    """
    try:
        db = get_supabase()

        # Query analysis_runs joined with checks where manual_override exists
        result = db.table("analysis_runs").select(
            "compliance_status, ai_reasoning, "
            "checks!inner(code_section_number, manual_override, manual_override_note)"
        ).eq(
            "checks.code_section_number", section_number
        ).not_(
            "checks.manual_override", "is", "null"
        ).order(
            "executed_at", desc=True
        ).limit(limit).execute()

        if not result.data:
            return []

        examples = []
        for row in result.data:
            check = row.get("checks", {})
            examples.append({
                "ai_status": row.get("compliance_status"),
                "human_status": check.get("manual_override"),
                "human_note": check.get("manual_override_note"),
                "ai_reasoning": row.get("ai_reasoning", "")[:500],
            })

        logger.info(f"[AssessCheck] Found {len(examples)} correction examples for section {section_number}")
        return examples

    except Exception as e:
        logger.warning(f"[AssessCheck] Failed to fetch correction examples: {e}")
        return []


@app.post("/assess-check")
async def assess_check(request: AssessCheckRequest):
    """
    Run agent compliance assessment for a single check.

    Returns SSE stream with agent reasoning:
    - {"type": "thinking", "content": "..."}
    - {"type": "tool_use", "tool": "...", "tool_use_id": "...", "input": {...}}
    - {"type": "tool_result", "tool": "...", "tool_use_id": "...", "result": {...}}
    - {"type": "done", "result": {...}}
    - {"type": "error", "message": "..."}
    """
    from compliance_agent import ComplianceAgent

    logger.info(f"[AssessCheck] Request: check={request.check_id}, assessment={request.assessment_id}")
    logger.info(f"[AssessCheck] Code section: {request.code_section.get('number')} - {request.code_section.get('title')}")
    logger.info(f"[AssessCheck] Screenshots: {len(request.screenshots or [])}")

    # Fetch past correction examples for this code section (few-shot learning)
    section_number = request.code_section.get("number", "")
    correction_examples = fetch_correction_examples(section_number) if section_number else []

    # Try to load unified JSON for document tools (optional - may not be preprocessed)
    unified_json = None
    images_dir = None

    try:
        unified_json, images_dir = _load_document_data(request.assessment_id)
        logger.info(f"[AssessCheck] Loaded unified JSON with {len(unified_json.get('pages', {}))} pages")
    except HTTPException:
        logger.warning(f"[AssessCheck] No preprocessed data for assessment {request.assessment_id}, tools will be limited")
        # Create minimal unified JSON so tools don't crash
        unified_json = {"assessment_id": request.assessment_id, "pages": {}, "metadata": {}}
    except Exception as e:
        logger.warning(f"[AssessCheck] Failed to load document data: {e}")
        unified_json = {"assessment_id": request.assessment_id, "pages": {}, "metadata": {}}

    # Create compliance agent
    agent = ComplianceAgent(
        unified_json=unified_json,
        images_dir=images_dir,
        model="claude-sonnet-4-20250514",
        max_iterations=15,
    )

    async def generate():
        """Generate SSE stream from agent."""
        try:
            async for chunk in agent.assess_check_stream(
                code_section=request.code_section,
                building_context=request.building_context or {},
                screenshots=request.screenshots or [],
                correction_examples=correction_examples,
            ):
                yield f"data: {json.dumps(chunk, default=str)}\n\n"
        except Exception as e:
            logger.exception(f"[AssessCheck] Stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


# =============================================================================
# CHAT ENDPOINT
# =============================================================================

class ChatRequest(BaseModel):
    assessment_id: str
    message: str
    conversation_id: Optional[str] = None


# In-memory cache for loaded documents (keyed by assessment_id)
_document_cache: dict[str, dict] = {}
_images_cache: dict[str, Path] = {}


def _get_images_s3_prefix(assessment_id: str) -> str:
    """Get S3 prefix for page images."""
    return f"preprocessed/{assessment_id}/pages/"


def _load_document_data(assessment_id: str) -> tuple[dict, Path]:
    """
    Load pipeline output from DB and download images from S3 for an assessment.

    Returns:
        Tuple of (pipeline_output dict, images_dir Path)
    """
    # Check cache first
    if assessment_id in _document_cache:
        return _document_cache[assessment_id], _images_cache[assessment_id]

    # Load pipeline_output from database (single source of truth)
    db = get_supabase()
    result = db.table("assessments").select("pipeline_output").eq("id", assessment_id).single().execute()

    if not result.data or not result.data.get("pipeline_output"):
        raise HTTPException(
            status_code=404,
            detail=f"Pipeline output not found for assessment {assessment_id}. Has preprocessing completed?"
        )

    pipeline_output = result.data["pipeline_output"]
    logger.info(f"[Chat] Loaded pipeline_output from DB for assessment {assessment_id}")

    # Create temp directory for images
    images_dir = Path(tempfile.mkdtemp(prefix=f"chat_images_{assessment_id}_"))
    logger.info(f"[Chat] Downloading page images to {images_dir}")

    # Download page images from S3
    bucket = get_bucket_name()
    s3 = get_s3()
    images_prefix = _get_images_s3_prefix(assessment_id)
    try:
        paginator = s3.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=bucket, Prefix=images_prefix):
            for obj in page.get('Contents', []):
                key = obj['Key']
                filename = Path(key).name
                if filename.endswith('.png') or filename.endswith('.jpg'):
                    local_path = images_dir / filename
                    s3.download_file(bucket, key, str(local_path))
                    logger.info(f"[Chat] Downloaded {filename}")
    except Exception as e:
        logger.warning(f"[Chat] Error downloading images: {e}")

    # Cache the data
    _document_cache[assessment_id] = pipeline_output
    _images_cache[assessment_id] = images_dir

    return pipeline_output, images_dir


@app.post("/chat")
async def chat(request: ChatRequest):
    """
    Chat with architectural drawings.

    Returns SSE stream with chunks:
    - {"type": "text", "content": "..."}
    - {"type": "tool_use", "tool": "...", "input": {...}}
    - {"type": "tool_result", "tool": "...", "result": {...}}
    - {"type": "image", "tool": "...", "image": {"data": "...", "media_type": "..."}}
    - {"type": "done", "conversation_id": "..."}
    - {"type": "error", "message": "..."}
    """
    from chat_agent import conversation_manager

    logger.info(f"[Chat] Request: assessment={request.assessment_id}, conv={request.conversation_id}")

    # Load document data
    try:
        unified_json, images_dir = _load_document_data(request.assessment_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"[Chat] Failed to load document data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load document data: {e}")

    # Get or create conversation
    conv_id = request.conversation_id or str(uuid4())
    agent, history = conversation_manager.get_or_create(conv_id, unified_json, images_dir)

    async def generate():
        """Generate SSE stream."""
        try:
            async for chunk in agent.chat_stream(request.message, history):
                # For images, we don't send the full base64 to frontend in SSE
                # (it's too large). Instead, send metadata and let frontend fetch if needed
                if chunk.get("type") == "image":
                    # Send a simplified version without the huge base64 data
                    image_event = {
                        'type': 'image',
                        'tool': chunk.get('tool'),
                        'tool_use_id': chunk.get('tool_use_id'),
                        'metadata': chunk.get('metadata', {}),
                    }
                    yield f"data: {json.dumps(image_event)}\n\n"
                elif chunk.get("type") == "done":
                    yield f"data: {json.dumps({'type': 'done', 'conversation_id': conv_id})}\n\n"
                else:
                    yield f"data: {json.dumps(chunk)}\n\n"
        except Exception as e:
            logger.exception(f"[Chat] Stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@app.get("/status/{agent_run_id}", response_model=StatusResponse)
async def get_status(agent_run_id: str):
    """Get the status of an agent run."""
    db = get_supabase()
    result = db.table("agent_runs").select("*").eq("id", agent_run_id).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Agent run not found")

    data = result.data
    return StatusResponse(
        id=data["id"],
        status=data["status"],
        progress=data.get("progress", {}),
        started_at=data.get("started_at"),
        completed_at=data.get("completed_at"),
        error=data.get("error"),
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
