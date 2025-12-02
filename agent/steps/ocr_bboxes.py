"""
OCR Bounding Boxes Pipeline Step (Parallelized)

Runs Tesseract OCR on each detected region to extract text.
Useful for text_box detections and as fallback for tables/legends.

Uses ThreadPoolExecutor for parallel OCR since Tesseract releases the GIL.
"""
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

import pytesseract

from pipeline import ParallelItemStep, PipelineContext
from image_utils import crop_bbox, load_page_image
import config

logger = logging.getLogger(__name__)

# Module-level executor for OCR (shared across calls)
_ocr_executor: ThreadPoolExecutor | None = None


def _get_ocr_executor() -> ThreadPoolExecutor:
    """Get or create the OCR ThreadPoolExecutor."""
    global _ocr_executor
    if _ocr_executor is None:
        _ocr_executor = ThreadPoolExecutor(max_workers=config.PARALLEL_OCR_WORKERS)
    return _ocr_executor


def run_ocr(image: Image.Image, config: str = "") -> str:
    """
    Run Tesseract OCR on an image.

    Args:
        image: PIL Image to OCR
        config: Tesseract config string (e.g., "--psm 6" for block of text)

    Returns:
        Extracted text string
    """
    try:
        text = pytesseract.image_to_string(image, config=config)
        return text.strip()
    except Exception as e:
        logger.error(f"OCR failed: {e}")
        return ""


def run_ocr_with_confidence(image: Image.Image) -> dict:
    """
    Run OCR and return text with confidence scores.

    Returns:
        {
            "text": str,
            "confidence": float (0-100),
            "word_count": int,
            "details": list of word-level data
        }
    """
    try:
        # Get detailed OCR data
        data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)

        words = []
        confidences = []

        for i, text in enumerate(data["text"]):
            conf = int(data["conf"][i])
            if text.strip() and conf > 0:
                words.append(text.strip())
                confidences.append(conf)

        full_text = " ".join(words)
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0

        return {
            "text": full_text,
            "confidence": round(avg_confidence, 1),
            "word_count": len(words),
        }
    except Exception as e:
        logger.error(f"OCR with confidence failed: {e}")
        return {
            "text": "",
            "confidence": 0,
            "word_count": 0,
        }


class OCRBboxes(ParallelItemStep):
    """
    Pipeline step to run OCR on all detected bounding boxes.
    Processes all regions in parallel using ThreadPoolExecutor.

    Extracts text from each detection region using Tesseract.
    Results are stored in ctx.metadata["bbox_ocr"].
    """

    name = "ocr_bboxes"
    max_concurrency = None  # Uses config.PARALLEL_OCR_WORKERS via executor

    def __init__(
        self,
        target_classes: list[str] = None,
        min_confidence: float = None,
        min_bbox_size: int = None,
        tesseract_config: str = None,
    ):
        """
        Args:
            target_classes: Which detection classes to OCR (default: all)
            min_confidence: Minimum detection confidence to process (default from config)
            min_bbox_size: Minimum width/height in pixels to OCR (default from config)
            tesseract_config: Tesseract configuration string (default from config)
                --psm 6: Assume uniform block of text
                --psm 3: Fully automatic page segmentation (default)
                --psm 11: Sparse text, no particular order
        """
        self.target_classes = [c.lower() for c in target_classes] if target_classes else None
        self.min_confidence = min_confidence if min_confidence is not None else config.OCR_CONFIDENCE_THRESHOLD
        self.min_bbox_size = min_bbox_size if min_bbox_size is not None else config.OCR_MIN_BBOX_SIZE
        self.tesseract_config = tesseract_config if tesseract_config is not None else config.OCR_TESSERACT_CONFIG
        self._images_dir = None

    def get_items(self, ctx: PipelineContext) -> list[dict]:
        """Get list of detection items to OCR."""
        images_dir = ctx.metadata.get("images_dir")
        if not images_dir:
            logger.warning("No images_dir in metadata")
            return []

        self._images_dir = images_dir
        items = []

        for page_name, page_data in ctx.data.items():
            # Get detections (handle both list and grouped formats)
            if isinstance(page_data, list):
                detections = page_data
            elif isinstance(page_data, dict):
                detections = page_data.get("detections", [])
            else:
                continue

            # Filter detections
            for i, det in enumerate(detections):
                class_name = det.get("class_name", "").lower()
                confidence = det.get("confidence", 0)

                # Check class filter
                if self.target_classes and class_name not in self.target_classes:
                    continue

                # Check confidence
                if confidence < self.min_confidence:
                    continue

                items.append({
                    "page_name": page_name,
                    "detection": det,
                    "detection_index": i,
                })

        logger.info(f"  Found {len(items)} regions to OCR")
        return items

    async def process_item(self, item: dict, ctx: PipelineContext) -> dict | None:
        """Process a single detection - run OCR."""
        page_name = item["page_name"]
        det = item["detection"]
        idx = item["detection_index"]
        bbox = det["bbox"]

        # Load page image
        page_img = load_page_image(self._images_dir, page_name)
        if page_img is None:
            logger.warning(f"  {page_name}: Could not load image")
            return None

        # Crop the region
        crop = crop_bbox(page_img, bbox, padding=5)

        # Check minimum size
        if crop.width < self.min_bbox_size or crop.height < self.min_bbox_size:
            logger.debug(f"  {page_name}[{idx}]: too small ({crop.width}x{crop.height}), skipping")
            return None

        # Run OCR in thread pool (Tesseract releases GIL)
        loop = asyncio.get_event_loop()
        executor = _get_ocr_executor()
        ocr_result = await loop.run_in_executor(executor, run_ocr_with_confidence, crop)

        if ocr_result["text"]:
            preview = ocr_result["text"][:50].replace("\n", " ")
            logger.debug(f"  {page_name}[{idx}] ({det.get('class_name')}): {ocr_result['word_count']} words - '{preview}...'")

        return {
            "page_name": page_name,
            "bbox": bbox,
            "class_name": det.get("class_name"),
            "detection_confidence": det.get("confidence"),
            "text": ocr_result["text"],
            "ocr_confidence": ocr_result["confidence"],
            "word_count": ocr_result["word_count"],
        }

    def merge_results(self, results: list[dict], ctx: PipelineContext) -> PipelineContext:
        """Merge all OCR results into metadata."""
        valid_results = [r for r in results if r is not None]

        # Group by page
        bbox_ocr = {}
        total_with_text = 0

        for r in valid_results:
            page_name = r.pop("page_name")
            if page_name not in bbox_ocr:
                bbox_ocr[page_name] = []
            bbox_ocr[page_name].append(r)
            if r["text"]:
                total_with_text += 1

        # Store results
        ctx.metadata["bbox_ocr"] = bbox_ocr
        ctx.metadata["ocr_regions_processed"] = len(valid_results)
        ctx.metadata["ocr_regions_with_text"] = total_with_text

        logger.info(f"  Total: {len(valid_results)} regions processed, {total_with_text} with text")

        return ctx


class OCRTextBoxes(OCRBboxes):
    """Convenience class that only OCRs text_box detections."""

    name = "ocr_text_boxes"

    def __init__(self, min_confidence: float = None):
        super().__init__(
            target_classes=["text_box"],
            min_confidence=min_confidence,
            tesseract_config="--psm 6",  # Uniform block of text
        )


class OCRAllRegions(OCRBboxes):
    """Convenience class that OCRs all detection types."""

    name = "ocr_all_regions"

    def __init__(self, min_confidence: float = None):
        super().__init__(
            target_classes=None,  # All classes
            min_confidence=min_confidence,
            tesseract_config="--psm 11",  # Sparse text
        )
