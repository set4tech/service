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
from pdf2image import convert_from_path
from ultralytics import YOLO

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
    """Convert PDF pages to PNG images."""
    dpi = dpi or config.PDF_DPI
    logger.info(f"Converting PDF to images (dpi={dpi})...")
    output_dir.mkdir(parents=True, exist_ok=True)

    images = convert_from_path(pdf_path, dpi=dpi)
    image_paths = []

    for i, image in enumerate(images, start=1):
        img_path = output_dir / f"page_{i:03d}.png"
        image.save(img_path, "PNG")
        image_paths.append(img_path)
        logger.info(f"  Saved {img_path.name}")

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

            # Upload to S3 for chat endpoint
            total_steps = base_steps + len(pipeline.steps) + 1  # +1 for S3 upload
            update_progress(agent_run_id, base_steps + len(pipeline.steps), total_steps, "Uploading to S3...")

            s3 = get_s3()
            bucket = get_bucket_name()

            # Build unified JSON from pipeline results
            unified_json = {
                "assessment_id": assessment_id,
                "pages": result.data,
                "metadata": result.metadata,
            }

            # Upload unified JSON
            json_key = _get_unified_json_s3_key(assessment_id)
            logger.info(f"Uploading unified JSON to s3://{bucket}/{json_key}")
            s3.put_object(
                Bucket=bucket,
                Key=json_key,
                Body=json.dumps(unified_json, default=str),
                ContentType='application/json'
            )

            # Upload page images
            images_prefix = _get_images_s3_prefix(assessment_id)
            for img_path in image_paths:
                img_key = f"{images_prefix}{img_path.name}"
                logger.info(f"Uploading {img_path.name} to s3://{bucket}/{img_key}")
                s3.upload_file(str(img_path), bucket, img_key)

            logger.info(f"Uploaded unified JSON and {len(image_paths)} images to S3")

            # Save results to DB
            update_progress(agent_run_id, total_steps, total_steps, "Saving results...")

            db.table("agent_runs").update({
                "status": "completed",
                "completed_at": datetime.utcnow().isoformat(),
                "progress": {"step": total_steps, "total_steps": total_steps, "message": "Complete"},
                "results": {
                    "type": "preprocess",
                    "pages_processed": len(image_paths),
                    "data": result.data,
                    "metadata": result.metadata,
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


def _get_unified_json_s3_key(assessment_id: str) -> str:
    """Get S3 key for unified document JSON."""
    return f"preprocessed/{assessment_id}/unified_document_data.json"


def _get_images_s3_prefix(assessment_id: str) -> str:
    """Get S3 prefix for page images."""
    return f"preprocessed/{assessment_id}/pages/"


def _load_document_data(assessment_id: str) -> tuple[dict, Path]:
    """
    Load unified JSON and download images for an assessment.

    Returns:
        Tuple of (unified_json dict, images_dir Path)
    """
    # Check cache first
    if assessment_id in _document_cache:
        return _document_cache[assessment_id], _images_cache[assessment_id]

    bucket = get_bucket_name()
    s3 = get_s3()

    # Download unified JSON
    json_key = _get_unified_json_s3_key(assessment_id)
    logger.info(f"[Chat] Downloading unified JSON from s3://{bucket}/{json_key}")

    try:
        response = s3.get_object(Bucket=bucket, Key=json_key)
        unified_json = json.loads(response['Body'].read().decode('utf-8'))
    except s3.exceptions.NoSuchKey:
        raise HTTPException(
            status_code=404,
            detail=f"Unified JSON not found for assessment {assessment_id}. Has preprocessing completed?"
        )

    # Create temp directory for images
    images_dir = Path(tempfile.mkdtemp(prefix=f"chat_images_{assessment_id}_"))
    logger.info(f"[Chat] Downloading page images to {images_dir}")

    # Download page images
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
    _document_cache[assessment_id] = unified_json
    _images_cache[assessment_id] = images_dir

    return unified_json, images_dir


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
