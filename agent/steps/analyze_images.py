"""
VLM Image Analysis Pipeline Step

Analyzes detected image regions using a Vision-Language Model (Gemini 2.5 Flash)
to extract semantic metadata for building code compliance assessment.
"""
import logging
import re
import json
from pathlib import Path

import fitz  # pymupdf
from PIL import Image

# Suppress MuPDF warnings about malformed PDFs (object out of range, etc.)
# These are recoverable errors that don't affect rendering
fitz.TOOLS.mupdf_warnings(False)

from pipeline import PipelineStep, PipelineContext
from llm import call_vlm
from prompts import IMAGE_ANALYSIS_PROMPT

# Increase PIL's decompression bomb limit for large architectural PDFs
Image.MAX_IMAGE_PIXELS = 500_000_000

logger = logging.getLogger(__name__)

# DPI settings - YOLO runs at 72, we render at higher DPI for VLM
YOLO_DPI = 72
VLM_DPI = 150
SCALE_FACTOR = VLM_DPI / YOLO_DPI


def extract_page_number(page_name: str) -> int:
    """Extract page number from filename."""
    # Try "page_N" or "page-N" format first
    match = re.search(r'page[_-]?(\d+)', page_name, re.IGNORECASE)
    if match:
        return int(match.group(1))

    # Fallback: find last number in filename
    numbers = re.findall(r'\d+', page_name)
    return int(numbers[-1]) if numbers else 1


def crop_region_from_pdf(pdf_path: Path, page_num: int, bbox: list[float]) -> Image.Image:
    """
    Render PDF page at high DPI and crop to bbox using pymupdf.

    Args:
        pdf_path: Path to the PDF file
        page_num: 1-indexed page number
        bbox: [x1, y1, x2, y2] coordinates at YOLO_DPI

    Returns:
        Cropped PIL Image at VLM_DPI
    """
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]  # 0-indexed

    # Calculate zoom factor for VLM_DPI (pymupdf default is 72 dpi)
    zoom = VLM_DPI / 72.0
    matrix = fitz.Matrix(zoom, zoom)

    # Render page at VLM_DPI
    pix = page.get_pixmap(matrix=matrix)

    # Convert to PIL Image
    page_img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

    doc.close()

    # Scale bbox from YOLO_DPI to VLM_DPI
    x1, y1, x2, y2 = bbox
    x1_s = int(x1 * SCALE_FACTOR)
    y1_s = int(y1 * SCALE_FACTOR)
    x2_s = int(x2 * SCALE_FACTOR)
    y2_s = int(y2 * SCALE_FACTOR)

    # Crop region
    region = page_img.crop((x1_s, y1_s, x2_s, y2_s))

    # Clean up
    del page_img, pix

    return region


def analyze_image_region(image: Image.Image) -> dict | None:
    """
    Send image region to VLM for analysis.

    Returns:
        Parsed JSON analysis or None if failed
    """
    result = call_vlm(
        prompt=IMAGE_ANALYSIS_PROMPT,
        image=image,
        max_tokens=4000,
        json_mode=True
    )

    if result["status"] != "success":
        logger.warning(f"VLM call failed: {result.get('error')}")
        return None

    try:
        parsed = json.loads(result["text"])
        # Handle case where LLM returns an array instead of object
        if isinstance(parsed, list):
            if len(parsed) > 0 and isinstance(parsed[0], dict):
                logger.warning(f"LLM returned array, using first element")
                return parsed[0]
            else:
                return {
                    "raw_response": result["text"],
                    "parse_error": "LLM returned array instead of object"
                }
        return parsed
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse VLM response as JSON: {e}")
        # Try to return the raw text in a structured format
        return {
            "raw_response": result["text"],
            "parse_error": str(e)
        }


class AnalyzeImages(PipelineStep):
    """
    Pipeline step to analyze image regions with VLM.

    Processes detections with class_name="image" and sends them to
    a vision-language model for semantic analysis.
    """

    name = "analyze_images"

    def __init__(
        self,
        limit: int | None = None,
        min_confidence: float = 0.3,
        min_area: int = 10000,  # Skip tiny detections
    ):
        """
        Args:
            limit: Maximum number of images to analyze (None = all)
            min_confidence: Skip detections below this confidence
            min_area: Skip detections smaller than this area (pixels^2)
        """
        self.limit = limit
        self.min_confidence = min_confidence
        self.min_area = min_area

    def process(self, ctx: PipelineContext) -> PipelineContext:
        """Analyze image regions from detections."""
        pdf_path = ctx.metadata.get("pdf_path")

        if not pdf_path:
            logger.warning("No pdf_path in metadata, skipping image analysis")
            ctx.metadata["image_analyses"] = []
            return ctx

        pdf_path = Path(pdf_path)
        if not pdf_path.exists():
            logger.warning(f"PDF not found: {pdf_path}")
            ctx.metadata["image_analyses"] = []
            return ctx

        # Collect all image detections
        image_detections = []
        for page_name, page_data in ctx.data.items():
            # Handle both flat list and grouped dict formats
            detections = page_data if isinstance(page_data, list) else page_data.get("detections", [])

            for det in detections:
                if det.get("class_name") != "image":
                    continue

                # Filter by confidence
                if det.get("confidence", 0) < self.min_confidence:
                    continue

                # Filter by area
                bbox = det.get("bbox", [0, 0, 0, 0])
                area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
                if area < self.min_area:
                    continue

                image_detections.append((page_name, det))

        # Apply limit
        if self.limit and len(image_detections) > self.limit:
            logger.info(f"Limiting to {self.limit} images (found {len(image_detections)})")
            image_detections = image_detections[:self.limit]

        logger.info(f"Analyzing {len(image_detections)} image regions with VLM")

        results = []

        for i, (page_name, det) in enumerate(image_detections):
            page_num = extract_page_number(page_name)
            bbox = det["bbox"]

            logger.info(f"  [{i+1}/{len(image_detections)}] {page_name} - bbox {bbox}")

            try:
                # Crop region from PDF
                region = crop_region_from_pdf(pdf_path, page_num, bbox)
                logger.info(f"    Cropped region: {region.size[0]}x{region.size[1]}")

                # Analyze with VLM
                analysis = analyze_image_region(region)

                if analysis:
                    result = {
                        "page": page_name,
                        "page_number": page_num,
                        "bbox": bbox,
                        "detection_confidence": det.get("confidence"),
                        "analysis": analysis
                    }
                    results.append(result)

                    # Log key info
                    if "meta" in analysis:
                        view_type = analysis["meta"].get("view_type", "unknown")
                        logger.info(f"    View type: {view_type}")
                    if "search_keywords" in analysis:
                        keywords = analysis["search_keywords"][:5]
                        logger.info(f"    Keywords: {', '.join(keywords)}...")
                else:
                    logger.warning(f"    Failed to analyze")

                # Clean up
                del region

            except Exception as e:
                logger.error(f"    Error processing {page_name}: {e}")
                continue

        # Store results
        ctx.metadata["image_analyses"] = results
        ctx.metadata["images_analyzed"] = len(results)
        ctx.metadata["images_total"] = len(image_detections)

        logger.info(f"  Analyzed {len(results)}/{len(image_detections)} images successfully")

        return ctx
