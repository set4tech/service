"""
Element Tag Extraction Pipeline Step (Parallelized)

Extracts architectural element tags (door tags like D-01, window tags like W-1,
room numbers, detail markers, etc.) from YOLO-detected image regions.

Uses VLM to identify and classify tags while filtering out noise like grid lines,
keynotes, dimensions, and general text.

Processes all detections in parallel for improved performance.
"""
import json
import logging
from pathlib import Path
from typing import Any

from pipeline import ParallelItemStep, PipelineContext
from llm import call_vlm_async_with_retry
from image_utils import crop_bbox, load_page_image

logger = logging.getLogger(__name__)

# Classes to process for element tag extraction
TARGET_CLASSES = ["image"]

# Minimum crop size (pixels) to process
MIN_CROP_SIZE = 20

# Prompt for extracting element tags
EXTRACTION_PROMPT = """Extract ONLY architectural element tags from this drawing. Be very selective.

EXTRACT THESE (examples):
- Door tags: D-1, D-01, D1, 101A, A1 (when labeling a door)
- Window tags: W-1, W1, WIN-01
- Room numbers: 101, 102, 201, R-1, RM 101
- Detail markers: 1/A101, 2/S1.1, A/A3.1
- Section markers: A-A, 1/S2.1
- Elevation markers: 1/A5.1

DO NOT EXTRACT:
- Grid lines (A, B, C, D, E, F, G, H or 1, 2, 3, 4 in circles at edges of drawings - structural column grid)
- Keynotes (circled numbers 1,2,3,4,5 that reference notes)
- Dimension text (12'-6", 3.5m)
- Material labels (CONCRETE, CMU, GYP BD)
- General text/titles (FLOOR PLAN, SECTION A-A as title)
- Street names, addresses
- Equipment labels
- Notes or specifications

Return JSON:
{
  "tags_found": ["D-01", "W-1", "101"],
  "tag_types": {
    "door_tags": ["D-01"],
    "window_tags": ["W-1"],
    "room_numbers": ["101"],
    "detail_markers": [],
    "section_markers": [],
    "elevation_markers": []
  },
  "confidence": "high" | "medium" | "low",
  "readable": true | false,
  "notes": ""
}

If no element tags found, return empty arrays. Be strict - when in doubt, exclude it."""


async def extract_tags_from_image_async(image, detection_info: dict) -> dict:
    """
    Async version: Send image to VLM and extract element tags.

    Args:
        image: PIL Image of the cropped detection
        detection_info: Detection metadata (bbox, class, etc.)

    Returns:
        Extraction result dict with tags_found, tag_types, etc.
    """
    try:
        result = await call_vlm_async_with_retry(EXTRACTION_PROMPT, image, json_mode=True)

        if result["status"] == "error":
            logger.warning(f"VLM error: {result.get('error')}")
            return {
                "tags_found": [],
                "tag_types": {},
                "confidence": "none",
                "readable": False,
                "notes": f"VLM error: {result.get('error')}",
                "status": "api_error"
            }

        # Parse JSON response
        response_text = result["text"].strip()

        # Handle potential markdown code blocks
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            response_text = "\n".join(
                lines[1:-1] if lines[-1] == "```" else lines[1:]
            )

        parsed = json.loads(response_text)
        parsed["status"] = "success"
        return parsed

    except json.JSONDecodeError as e:
        logger.warning(f"JSON parse error: {e}")
        return {
            "tags_found": [],
            "tag_types": {},
            "confidence": "none",
            "readable": False,
            "notes": f"Failed to parse VLM response as JSON: {str(e)}",
            "status": "json_error"
        }
    except Exception as e:
        logger.error(f"Tag extraction error: {e}")
        return {
            "tags_found": [],
            "tag_types": {},
            "confidence": "none",
            "readable": False,
            "notes": f"Extraction error: {str(e)}",
            "status": "processing_error"
        }


class ExtractElementTags(ParallelItemStep):
    """
    Pipeline step to extract architectural element tags from detected images.
    Processes all detections in parallel.

    Processes YOLO detections of class 'image' (floor plans, elevations, etc.)
    and uses VLM to identify element tags like door numbers, window tags,
    room numbers, and detail markers.

    Stores results in ctx.metadata["extracted_element_tags"].
    """

    name = "extract_element_tags"
    max_concurrency = 10

    def __init__(
        self,
        target_classes: list[str] = None,
        min_crop_size: int = MIN_CROP_SIZE,
        min_confidence: float = 0.3,
    ):
        """
        Args:
            target_classes: YOLO classes to process (default: ["image"])
            min_crop_size: Minimum crop dimension to process
            min_confidence: Minimum detection confidence to process
        """
        self.target_classes = target_classes or TARGET_CLASSES
        self.min_crop_size = min_crop_size
        self.min_confidence = min_confidence
        self._images_dir = None

    def get_items(self, ctx: PipelineContext) -> list[dict]:
        """Get list of detection items to process."""
        images_dir = ctx.metadata.get("images_dir")
        if not images_dir:
            logger.warning("No images_dir in metadata")
            return []

        self._images_dir = images_dir
        items = []

        for page_name, page_data in ctx.data.items():
            # Get detections for this page
            detections = page_data if isinstance(page_data, list) else page_data.get("detections", [])

            # Filter to target classes with sufficient confidence
            target_detections = [
                d for d in detections
                if d.get("class_name") in self.target_classes
                and d.get("confidence", 0) >= self.min_confidence
            ]

            for idx, det in enumerate(target_detections):
                if det.get("bbox"):
                    items.append({
                        "page_name": page_name,
                        "detection": det,
                        "detection_index": idx,
                    })

        logger.info(f"  Found {len(items)} detections to process for element tags")
        return items

    async def process_item(self, item: dict, ctx: PipelineContext) -> dict | None:
        """Process a single detection - extract element tags."""
        page_name = item["page_name"]
        det = item["detection"]
        idx = item["detection_index"]
        bbox = det["bbox"]

        # Load page image
        page_image = load_page_image(self._images_dir, page_name)
        if page_image is None:
            logger.warning(f"  {page_name}: Could not load image")
            return None

        # Crop the detection
        try:
            crop = crop_bbox(page_image, bbox, padding=5)
            crop_size = f"{crop.width}x{crop.height}"

            # Skip if crop is too small
            if crop.width < self.min_crop_size or crop.height < self.min_crop_size:
                logger.debug(f"  {page_name}[{idx}] Crop too small: {crop_size}")
                result = {
                    "tags_found": [],
                    "readable": False,
                    "notes": "Crop too small to contain readable text",
                    "status": "skipped_too_small"
                }
            else:
                # Extract tags using VLM
                logger.debug(f"  {page_name}[{idx}] Processing {det['class_name']} crop {crop_size}")
                result = await extract_tags_from_image_async(crop, det)

        except Exception as e:
            logger.error(f"  {page_name}[{idx}] Error processing: {e}")
            result = {
                "tags_found": [],
                "readable": False,
                "notes": f"Processing error: {str(e)}",
                "status": "processing_error"
            }
            crop_size = "unknown"

        # Log if tags found
        tags_found = result.get("tags_found", [])
        if tags_found:
            logger.info(f"  {page_name}[{idx}] Found {len(tags_found)} tags: {tags_found[:5]}{'...' if len(tags_found) > 5 else ''}")

        return {
            "page": page_name,
            "detection_index": idx,
            "bbox": bbox,
            "class_name": det.get("class_name"),
            "confidence": det.get("confidence"),
            "crop_size": crop_size,
            "extraction_result": result,
        }

    def merge_results(self, results: list[dict], ctx: PipelineContext) -> PipelineContext:
        """Merge all detection results into metadata."""
        valid_results = [r for r in results if r is not None]

        # Calculate summary stats
        total_with_tags = 0
        all_unique_tags = set()
        tag_type_counts = {
            "door_tags": set(),
            "window_tags": set(),
            "room_numbers": set(),
            "detail_markers": set(),
            "section_markers": set(),
            "elevation_markers": set(),
        }

        for r in valid_results:
            extraction = r.get("extraction_result", {})
            tags_found = extraction.get("tags_found", [])
            if tags_found:
                total_with_tags += 1
                all_unique_tags.update(tags_found)

                # Track by type
                tag_types = extraction.get("tag_types", {})
                for type_name, tags in tag_types.items():
                    if type_name in tag_type_counts and tags:
                        tag_type_counts[type_name].update(tags)

        # Build summary
        summary = {
            "total_detections_processed": len(valid_results),
            "detections_with_tags": total_with_tags,
            "unique_tags_found": len(all_unique_tags),
            "all_unique_tags": sorted(all_unique_tags),
            "tags_by_type": {
                type_name: sorted(tags)
                for type_name, tags in tag_type_counts.items()
                if tags
            },
        }

        # Store results
        ctx.metadata["extracted_element_tags"] = valid_results
        ctx.metadata["element_tags_summary"] = summary

        logger.info(f"  Element tag extraction complete:")
        logger.info(f"    Detections processed: {len(valid_results)}")
        logger.info(f"    Detections with tags: {total_with_tags}")
        logger.info(f"    Unique tags found: {len(all_unique_tags)}")

        if summary["tags_by_type"]:
            for type_name, tags in summary["tags_by_type"].items():
                logger.info(f"    {type_name}: {len(tags)} ({', '.join(tags[:5])}{'...' if len(tags) > 5 else ''})")

        return ctx
