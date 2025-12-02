"""
Project Info Extraction Pipeline Step

Extracts project metadata from cover sheets using Gemini VLM.
Scans the first N pages looking for cover sheet / title block information.
"""
import json
import logging
from pathlib import Path

from pipeline import PipelineStep, PipelineContext
from llm import call_vlm
from image_utils import load_page_image
from prompts import PROJECT_INFO_EXTRACTION
import config

logger = logging.getLogger(__name__)


def merge_project_info(results: list[dict]) -> dict:
    """
    Merge project info from multiple pages, preferring non-null values.

    Args:
        results: List of parsed project info dicts from each page

    Returns:
        Merged dict with best available values for each field
    """
    merged = {}

    # Fields to merge (order matters - first non-null wins)
    fields = [
        "project_name", "project_number", "address", "client_name",
        "architect_name", "building_area", "num_stories", "construction_type",
        "occupancy_classification", "sprinklers", "project_description",
        "drawing_date", "revision"
    ]

    for field in fields:
        for result in results:
            value = result.get(field)
            if value is not None and field not in merged:
                merged[field] = value
                break

    # Determine overall confidence (best confidence wins)
    confidences = [r.get("confidence") for r in results if r.get("confidence")]
    if "high" in confidences:
        merged["confidence"] = "high"
    elif "medium" in confidences:
        merged["confidence"] = "medium"
    elif confidences:
        merged["confidence"] = "low"

    # Track source pages
    merged["source_pages"] = [r.get("source_page") for r in results if r.get("source_page")]

    return merged


def parse_project_info_response(response_text: str) -> dict:
    """
    Parse LLM JSON response, handling common formatting issues.

    Args:
        response_text: Raw response text from LLM

    Returns:
        Parsed dict or error dict if parsing fails
    """
    text = response_text.strip()

    # Strip markdown code blocks if present
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first line (```json or ```)
        lines = lines[1:]
        # Remove last line if it's just ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    try:
        parsed = json.loads(text)
        # Handle case where LLM returns an array instead of object
        if isinstance(parsed, list):
            if len(parsed) > 0 and isinstance(parsed[0], dict):
                logger.warning(f"LLM returned array, using first element")
                return parsed[0]
            else:
                return {"error": "LLM returned array instead of object", "raw_response": response_text}
        return parsed
    except json.JSONDecodeError as e:
        logger.warning(f"JSON parse error: {e}")
        logger.debug(f"Raw response: {response_text[:500]}")
        return {"error": str(e), "raw_response": response_text}


class ExtractProjectInfo(PipelineStep):
    """
    Pipeline step to extract project metadata from cover sheets.

    Scans the first N pages looking for cover sheet / title block info.
    Uses Gemini VLM to extract structured project data including:
    - Project name, number, address
    - Building area, stories
    - Construction type, occupancy classification
    - Sprinkler status
    """

    name = "extract_project_info"

    def __init__(
        self,
        pages_to_scan: int = None,
    ):
        """
        Args:
            pages_to_scan: Number of pages to scan for cover sheet info (default from config)
        """
        self.pages_to_scan = pages_to_scan if pages_to_scan is not None else config.PROJECT_INFO_PAGES_TO_SCAN

    def process(self, ctx: PipelineContext) -> PipelineContext:
        """
        Extract project info from cover sheet pages.

        Reads first N page images, sends each to VLM for extraction,
        then merges results into a single project_info dict.

        Results stored in ctx.metadata["project_info"]
        """
        images_dir = ctx.metadata.get("images_dir")

        if not images_dir:
            logger.warning("No images_dir in metadata, skipping project info extraction")
            ctx.metadata["project_info"] = {}
            return ctx

        images_dir = Path(images_dir)

        # Get sorted list of page images (first N pages)
        page_files = sorted(images_dir.glob("*.png"))[:self.pages_to_scan]

        if not page_files:
            logger.warning("No page images found")
            ctx.metadata["project_info"] = {}
            return ctx

        logger.info(f"Scanning {len(page_files)} pages for project info...")

        results = []

        for page_file in page_files:
            logger.info(f"  Scanning {page_file.name}...")

            # Load image
            page_img = load_page_image(images_dir, page_file.name)
            if page_img is None:
                logger.warning(f"    Could not load image: {page_file.name}")
                continue

            # Call VLM with JSON mode
            response = call_vlm(PROJECT_INFO_EXTRACTION, page_img, json_mode=True)

            if response["status"] != "success":
                logger.warning(f"    VLM call failed: {response.get('error')}")
                continue

            # Parse response
            parsed = parse_project_info_response(response["text"])

            # Skip non-cover sheets (LLM identifies these)
            if parsed.get("is_cover_sheet") is False:
                logger.info(f"    Not a cover sheet, skipping")
                continue

            if "error" in parsed:
                logger.warning(f"    Parse error: {parsed['error']}")
                continue

            parsed["source_page"] = page_file.name
            results.append(parsed)

            # Log what we found
            skip_fields = {"confidence", "source_description", "source_page", "is_cover_sheet"}
            found_fields = [k for k, v in parsed.items() if v is not None and k not in skip_fields]
            if found_fields:
                preview = ", ".join(found_fields[:5])
                if len(found_fields) > 5:
                    preview += f"... (+{len(found_fields) - 5} more)"
                logger.info(f"    Found {len(found_fields)} fields: {preview}")

        # Merge results from multiple pages
        if results:
            project_info = merge_project_info(results)
            logger.info(f"  Merged project info from {len(results)} page(s)")

            # Log key extracted values
            if project_info.get("project_name"):
                logger.info(f"    Project: {project_info['project_name']}")
            if project_info.get("construction_type"):
                logger.info(f"    Construction: {project_info['construction_type']}")
            if project_info.get("occupancy_classification"):
                logger.info(f"    Occupancy: {project_info['occupancy_classification']}")
        else:
            project_info = {"error": "No project info found in scanned pages"}
            logger.warning("  No project info found")

        ctx.metadata["project_info"] = project_info
        ctx.metadata["project_info_pages_scanned"] = len(page_files)

        return ctx
