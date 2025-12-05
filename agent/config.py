"""
Configuration for the agent service.

All configurable parameters in one place.
Values can be overridden via environment variables.
"""
import os


def _env_float(key: str, default: float) -> float:
    """Get float from environment or use default."""
    val = os.environ.get(key)
    return float(val) if val else default


def _env_int(key: str, default: int) -> int:
    """Get int from environment or use default."""
    val = os.environ.get(key)
    return int(val) if val else default


def _env_bool(key: str, default: bool) -> bool:
    """Get bool from environment or use default."""
    val = os.environ.get(key)
    if val is None:
        return default
    return val.lower() in ("true", "1", "yes")


def _env_str(key: str, default: str) -> str:
    """Get string from environment or use default."""
    return os.environ.get(key, default)


# =============================================================================
# PDF Processing
# =============================================================================

PDF_DPI = _env_int("PDF_DPI", 150)  # DPI for PDF to image conversion
PDF_DPI_FALLBACK = _env_int("PDF_DPI_FALLBACK", 72)  # Fallback for large PDFs


# =============================================================================
# YOLO Detection
# =============================================================================

YOLO_WEIGHTS_S3_KEY = _env_str("YOLO_WEIGHTS_S3_KEY", "models/weights.pt")
YOLO_CONFIDENCE_THRESHOLD = _env_float("YOLO_CONFIDENCE_THRESHOLD", 0.3)


# =============================================================================
# OCR (Tesseract)
# =============================================================================

OCR_CONFIDENCE_THRESHOLD = _env_float("OCR_CONFIDENCE_THRESHOLD", 0.3)
OCR_MIN_BBOX_SIZE = _env_int("OCR_MIN_BBOX_SIZE", 30)  # Min width/height in pixels
OCR_TESSERACT_CONFIG = _env_str("OCR_TESSERACT_CONFIG", "--psm 6")  # Uniform block of text


# =============================================================================
# Table Extraction
# =============================================================================

TABLE_CONFIDENCE_THRESHOLD = _env_float("TABLE_CONFIDENCE_THRESHOLD", 0.3)
TABLE_MIN_SIZE = _env_int("TABLE_MIN_SIZE", 50)  # Min width/height to process
TABLE_CLASSES = ["table", "legend", "schedule"]  # Detection classes to treat as tables


# =============================================================================
# Text Extraction
# =============================================================================

TEXT_CLEAN_WITH_LLM = _env_bool("TEXT_CLEAN_WITH_LLM", True)
TEXT_MIN_LENGTH_FOR_LLM = _env_int("TEXT_MIN_LENGTH_FOR_LLM", 50)  # Skip LLM for short text


# =============================================================================
# Project Info Extraction
# =============================================================================

PROJECT_INFO_PAGES_TO_SCAN = _env_int("PROJECT_INFO_PAGES_TO_SCAN", 3)  # First N pages to scan for cover sheet


# =============================================================================
# LLM Settings
# =============================================================================

LLM_PROVIDER = _env_str("LLM_PROVIDER", "gemini")  # gemini, openai, anthropic
LLM_MODEL = _env_str("LLM_MODEL", "gemini-2.5-flash-lite")
LLM_MAX_TOKENS = _env_int("LLM_MAX_TOKENS", 8000)
LLM_MAX_TOKENS_TEXT = _env_int("LLM_MAX_TOKENS_TEXT", 4000)  # For text-only calls

# Helicone (LLM observability)
HELICONE_ENABLED = _env_bool("HELICONE_ENABLED", True)
HELICONE_API_KEY = _env_str("HELICONE_API_KEY", "")


# =============================================================================
# Image Processing
# =============================================================================

IMAGE_CROP_PADDING = _env_int("IMAGE_CROP_PADDING", 20)  # Pixels around bbox
IMAGE_QUADRANT_OVERLAP = _env_int("IMAGE_QUADRANT_OVERLAP", 50)  # Overlap when splitting
IMAGE_MIN_SIZE_FOR_SPLIT = _env_int("IMAGE_MIN_SIZE_FOR_SPLIT", 600)  # Min dim to trigger split


# =============================================================================
# Pipeline
# =============================================================================

PIPELINE_FILTER_THRESHOLD = _env_float("PIPELINE_FILTER_THRESHOLD", 0.3)


# =============================================================================
# Parallel Processing
# =============================================================================

PARALLEL_VLM_CONCURRENCY = _env_int("PARALLEL_VLM_CONCURRENCY", 10)  # Max concurrent VLM calls
PARALLEL_OCR_WORKERS = _env_int("PARALLEL_OCR_WORKERS", 4)  # CPU workers for Tesseract
PARALLEL_RATE_LIMIT_RETRY = _env_int("PARALLEL_RATE_LIMIT_RETRY", 3)  # Max retries on rate limit
PARALLEL_RATE_LIMIT_BASE_DELAY = _env_float("PARALLEL_RATE_LIMIT_BASE_DELAY", 2.0)  # Base delay in seconds


# =============================================================================
# S3 / Storage
# =============================================================================

S3_BUCKET_NAME = _env_str("AWS_S3_BUCKET_NAME", "set4-data")
AWS_REGION = _env_str("AWS_REGION", "us-east-1")
AWS_ACCESS_KEY_ID = _env_str("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = _env_str("AWS_SECRET_ACCESS_KEY", "")


# =============================================================================
# Helper to dump current config (for logging/debugging)
# =============================================================================

def get_config_dict() -> dict:
    """Return all config values as a dictionary."""
    return {
        # PDF
        "PDF_DPI": PDF_DPI,
        "PDF_DPI_FALLBACK": PDF_DPI_FALLBACK,
        # YOLO
        "YOLO_WEIGHTS_S3_KEY": YOLO_WEIGHTS_S3_KEY,
        "YOLO_CONFIDENCE_THRESHOLD": YOLO_CONFIDENCE_THRESHOLD,
        # OCR
        "OCR_CONFIDENCE_THRESHOLD": OCR_CONFIDENCE_THRESHOLD,
        "OCR_MIN_BBOX_SIZE": OCR_MIN_BBOX_SIZE,
        "OCR_TESSERACT_CONFIG": OCR_TESSERACT_CONFIG,
        # Table
        "TABLE_CONFIDENCE_THRESHOLD": TABLE_CONFIDENCE_THRESHOLD,
        "TABLE_MIN_SIZE": TABLE_MIN_SIZE,
        "TABLE_CLASSES": TABLE_CLASSES,
        # Text
        "TEXT_CLEAN_WITH_LLM": TEXT_CLEAN_WITH_LLM,
        "TEXT_MIN_LENGTH_FOR_LLM": TEXT_MIN_LENGTH_FOR_LLM,
        # Project Info
        "PROJECT_INFO_PAGES_TO_SCAN": PROJECT_INFO_PAGES_TO_SCAN,
        # LLM
        "LLM_PROVIDER": LLM_PROVIDER,
        "LLM_MODEL": LLM_MODEL,
        "LLM_MAX_TOKENS": LLM_MAX_TOKENS,
        "LLM_MAX_TOKENS_TEXT": LLM_MAX_TOKENS_TEXT,
        # Helicone
        "HELICONE_ENABLED": HELICONE_ENABLED,
        "HELICONE_API_KEY": "***" if HELICONE_API_KEY else "",
        # Image
        "IMAGE_CROP_PADDING": IMAGE_CROP_PADDING,
        "IMAGE_QUADRANT_OVERLAP": IMAGE_QUADRANT_OVERLAP,
        "IMAGE_MIN_SIZE_FOR_SPLIT": IMAGE_MIN_SIZE_FOR_SPLIT,
        # Pipeline
        "PIPELINE_FILTER_THRESHOLD": PIPELINE_FILTER_THRESHOLD,
        # Parallel Processing
        "PARALLEL_VLM_CONCURRENCY": PARALLEL_VLM_CONCURRENCY,
        "PARALLEL_OCR_WORKERS": PARALLEL_OCR_WORKERS,
        "PARALLEL_RATE_LIMIT_RETRY": PARALLEL_RATE_LIMIT_RETRY,
        "PARALLEL_RATE_LIMIT_BASE_DELAY": PARALLEL_RATE_LIMIT_BASE_DELAY,
        # S3
        "S3_BUCKET_NAME": S3_BUCKET_NAME,
    }
