"""
Sheet Info Extraction Pipeline Step

Extracts sheet number and sheet title from each page's title block using Gemini VLM.
"""
import json
import logging
import re
from pathlib import Path

from pipeline import PipelineStep, PipelineContext
from llm import call_vlm
from image_utils import load_page_image
from prompts import SHEET_INFO_EXTRACTION

logger = logging.getLogger(__name__)


def extract_page_number(filename: str) -> str:
    """
    Extract page number from filename like 'page_001.png' or 'achieve_page_1.png'.

    Returns string page number for use as dict key.
    """
    # Try to extract number from filename
    match = re.search(r'page_?(\d+)', filename, re.IGNORECASE)
    if match:
        return str(int(match.group(1)))  # Remove leading zeros
    # Fallback: just use the filename stem
    return Path(filename).stem


def parse_sheet_info_response(response_text: str) -> dict:
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


class ExtractSheetInfo(PipelineStep):
    """
    Pipeline step to extract sheet number and title from each page.

    Scans all page images and extracts title block information:
    - sheet_number: The sheet identifier (e.g., "A1.01", "G0.00", "S-1")
    - sheet_title: The sheet name/description (e.g., "FIRST FLOOR PLAN")

    Results stored in ctx.metadata["sheet_info"] keyed by page number.
    """

    name = "extract_sheet_info"

    def process(self, ctx: PipelineContext) -> PipelineContext:
        """
        Extract sheet info from all page images.

        Reads each page image, sends to VLM for extraction,
        stores results keyed by page number.

        Results stored in ctx.metadata["sheet_info"]
        """
        images_dir = ctx.metadata.get("images_dir")

        if not images_dir:
            logger.warning("No images_dir in metadata, skipping sheet info extraction")
            ctx.metadata["sheet_info"] = {}
            return ctx

        images_dir = Path(images_dir)

        # Get sorted list of all page images
        page_files = sorted(images_dir.glob("*.png"))

        if not page_files:
            logger.warning("No page images found")
            ctx.metadata["sheet_info"] = {}
            return ctx

        logger.info(f"Extracting sheet info from {len(page_files)} pages...")

        sheet_info = {}
        success_count = 0

        for page_file in page_files:
            page_num = extract_page_number(page_file.name)
            logger.info(f"  Processing page {page_num} ({page_file.name})...")

            # Load image
            page_img = load_page_image(images_dir, page_file.name)
            if page_img is None:
                logger.warning(f"    Could not load image: {page_file.name}")
                sheet_info[page_num] = {
                    "page_file": page_file.name,
                    "sheet_number": None,
                    "sheet_title": None,
                    "error": "Could not load image"
                }
                continue

            # Call VLM with JSON mode
            response = call_vlm(SHEET_INFO_EXTRACTION, page_img, json_mode=True)

            if response["status"] != "success":
                logger.warning(f"    VLM call failed: {response.get('error')}")
                sheet_info[page_num] = {
                    "page_file": page_file.name,
                    "sheet_number": None,
                    "sheet_title": None,
                    "error": response.get("error", "VLM call failed")
                }
                continue

            # Parse response
            parsed = parse_sheet_info_response(response["text"])

            if "error" in parsed:
                logger.warning(f"    Parse error: {parsed['error']}")
                sheet_info[page_num] = {
                    "page_file": page_file.name,
                    "sheet_number": None,
                    "sheet_title": None,
                    "error": parsed["error"]
                }
                continue

            # Store result
            sheet_info[page_num] = {
                "page_file": page_file.name,
                "sheet_number": parsed.get("sheet_number"),
                "sheet_title": parsed.get("sheet_title"),
                "confidence": parsed.get("confidence", "medium"),
            }

            success_count += 1

            # Log what we found
            sheet_num = parsed.get("sheet_number") or "(none)"
            sheet_title = parsed.get("sheet_title") or "(none)"
            logger.info(f"    Found: {sheet_num} - {sheet_title}")

        ctx.metadata["sheet_info"] = sheet_info
        ctx.metadata["sheet_info_pages_processed"] = len(page_files)
        ctx.metadata["sheet_info_success_count"] = success_count

        logger.info(f"  Sheet info extracted from {success_count}/{len(page_files)} pages")

        return ctx
