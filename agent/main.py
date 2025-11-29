"""
Agent Service - PDF preprocessing and compliance assessment

Endpoints:
- POST /preprocess - Download PDF, convert to images, run YOLO detection
- POST /assess - Run compliance assessment (TODO)
"""
import os
import logging
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Optional
from contextlib import asynccontextmanager

import boto3
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from supabase import create_client, Client
from pdf2image import convert_from_path
from ultralytics import YOLO

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
WEIGHTS_S3_KEY = "models/weights.pt"  # S3 location for YOLO weights


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
    logger.info(f"Downloading YOLO weights from s3://{bucket}/{WEIGHTS_S3_KEY}...")
    s3.download_file(bucket, WEIGHTS_S3_KEY, str(WEIGHTS_PATH))
    logger.info(f"YOLO weights downloaded to {WEIGHTS_PATH}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Agent Service...")
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
    return os.environ.get('AWS_S3_BUCKET_NAME', 'set4-data')


def download_pdf_from_s3(s3_key: str, local_path: Path) -> None:
    """Download PDF from S3 to local path."""
    bucket = get_bucket_name()
    s3 = get_s3()
    logger.info(f"Downloading s3://{bucket}/{s3_key} to {local_path}")
    s3.download_file(bucket, s3_key, str(local_path))


def pdf_to_images(pdf_path: Path, output_dir: Path, dpi: int = 150) -> list[Path]:
    """Convert PDF pages to PNG images."""
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
    """Build the preprocessing pipeline with all steps."""
    from pipeline import Pipeline, FilterLowConfidence, GroupByClass, CountSummary

    return Pipeline([
        FilterLowConfidence(threshold=0.3),
        GroupByClass(),
        CountSummary(),
        # Add more steps here as needed
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
                metadata={"pdf_s3_key": pdf_s3_key, "pages": len(image_paths)},
            )

            # Run pipeline with progress updates
            def pipeline_progress(step: int, total: int, message: str):
                # Offset by base steps for overall progress
                update_progress(agent_run_id, base_steps + step, base_steps + total, message)

            result = pipeline.run(ctx, progress_callback=pipeline_progress)

            # Save results
            total_steps = base_steps + len(pipeline.steps)
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
