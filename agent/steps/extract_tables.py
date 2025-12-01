"""
Table Extraction Pipeline Step

Extracts tables from detected regions using Gemini VLM.
Converts to structured JSON for downstream compliance checking.
"""
import re
import logging
from PIL import Image

from pipeline import PipelineStep, PipelineContext
from llm import call_vlm
from image_utils import crop_bbox, split_into_quadrants, load_page_image, dedupe_rows
from prompts import TABLE_EXTRACTION_MARKDOWN
import config

logger = logging.getLogger(__name__)


def parse_markdown_table(text: str) -> dict:
    """Parse markdown table into structured dict."""
    lines = text.strip().split('\n')

    # Strip code block markers if present
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]

    # Find table lines (contain |)
    table_lines = [l for l in lines
                   if '|' in l
                   and not l.strip().startswith('TABLE_TYPE')
                   and not l.strip().startswith('NOTES')]

    if len(table_lines) < 2:
        return {"error": "No valid table found", "rows": [], "row_count": 0}

    # Parse headers
    header_parts = table_lines[0].split('|')
    headers = [h.strip() for h in header_parts if h.strip()]

    # Normalize to snake_case
    def to_snake(s):
        s = re.sub(r'[^\w\s]', '', s)
        s = re.sub(r'\s+', '_', s.lower().strip())
        return s if s else "col"

    normalized = [to_snake(h) for h in headers]

    # Skip separator row (|---|---|)
    start = 2 if len(table_lines) > 1 and re.match(r'^[\s|:-]+$', table_lines[1]) else 1

    # Parse rows
    rows = []
    for line in table_lines[start:]:
        parts = line.split('|')
        # Handle leading/trailing pipes
        if parts and parts[0].strip() == '':
            parts = parts[1:]
        if parts and parts[-1].strip() == '':
            parts = parts[:-1]

        cells = [c.strip() for c in parts]

        if cells:
            row = {}
            for i, cell in enumerate(cells):
                header = normalized[i] if i < len(normalized) else f"col_{i}"
                row[header] = parse_cell(cell)
            rows.append(row)

    # Extract metadata from non-table lines
    table_type = "Unknown"
    notes = ""
    for line in lines:
        if line.startswith("TABLE_TYPE:"):
            table_type = line.replace("TABLE_TYPE:", "").strip()
        elif line.startswith("NOTES:"):
            notes = line.replace("NOTES:", "").strip()

    return {
        "table_type": table_type,
        "headers": headers,
        "headers_normalized": normalized,
        "rows": rows,
        "row_count": len(rows),
        "notes": notes,
    }


def parse_cell(cell: str):
    """Parse cell value, extracting numbers with units."""
    if not cell or cell.lower() in ['n/a', 'na', '-', '']:
        return None

    # Booleans
    if cell.lower() in ['yes', 'true', 'y', '✓', '✔']:
        return True
    if cell.lower() in ['no', 'false', 'n', '✗', '✘']:
        return False

    # Feet-inches: 3'-6" -> total inches
    ft_in = re.match(r"^(\d+)['\-](\d+)[\"']?$", cell)
    if ft_in:
        total = int(ft_in[1]) * 12 + int(ft_in[2])
        return {"value": total, "unit": "inches", "display": cell}

    # Number with unit: 36", 100 lbs, 24 in
    num_unit = re.match(r'^([\d.]+)\s*(["\'\w/-]+)?$', cell)
    if num_unit:
        try:
            num_str, unit = num_unit.groups()
            num = float(num_str) if '.' in num_str else int(num_str)
            if unit:
                unit_map = {
                    '"': 'inches', "'": 'feet', 'in': 'inches', 'ft': 'feet',
                    'lbs': 'pounds', 'lb': 'pounds', 'sf': 'sq_ft', 'sqft': 'sq_ft'
                }
                return {"value": num, "unit": unit_map.get(unit.lower(), unit)}
            return num
        except ValueError:
            pass

    return cell


def extract_table_from_image(image: Image.Image, allow_split: bool = True) -> dict:
    """
    Extract table from image using Gemini VLM.

    If token limit is hit, splits into quadrants and retries.
    """
    result = call_vlm(TABLE_EXTRACTION_MARKDOWN, image, max_tokens=8000)

    # Handle token limit by splitting
    if result["status"] == "token_limit" and allow_split:
        logger.info("Hit token limit, splitting into quadrants...")
        return _extract_with_quadrants(image)

    if result["status"] != "success":
        return {
            "error": result.get("error", "Unknown error"),
            "status": result["status"],
            "rows": [],
            "row_count": 0,
        }

    # Parse markdown response
    parsed = parse_markdown_table(result["text"])
    parsed["raw_markdown"] = result["text"]
    parsed["status"] = "success"

    return parsed


def _extract_with_quadrants(image: Image.Image) -> dict:
    """Split image into quadrants, extract each, and merge results."""
    quadrants = split_into_quadrants(image, max_quadrants=4)

    if len(quadrants) == 1:
        return {
            "error": "Image could not be split",
            "status": "error",
            "rows": [],
            "row_count": 0,
        }

    all_rows = []
    all_headers = []
    all_markdown = []
    table_types = []
    notes_list = []

    for i, quad in enumerate(quadrants):
        logger.info(f"  Quadrant {i+1}/{len(quadrants)}: {quad.width}x{quad.height}")

        # Don't allow further splitting
        result = extract_table_from_image(quad, allow_split=False)

        if result.get("status") == "success":
            all_rows.extend(result.get("rows", []))

            if result.get("headers") and not all_headers:
                all_headers = result["headers"]
            if result.get("raw_markdown"):
                all_markdown.append(f"--- Quadrant {i+1} ---\n{result['raw_markdown']}")
            if result.get("table_type") and result["table_type"] != "Unknown":
                table_types.append(result["table_type"])
            if result.get("notes"):
                notes_list.append(result["notes"])

            logger.info(f"    Got {len(result.get('rows', []))} rows")
        else:
            logger.warning(f"    Failed: {result.get('error')}")

    if not all_rows:
        return {
            "error": "All quadrant extractions failed",
            "status": "error",
            "rows": [],
            "row_count": 0,
        }

    # Deduplicate overlapping rows
    unique_rows = dedupe_rows(all_rows)
    logger.info(f"  Combined: {len(all_rows)} rows -> {len(unique_rows)} unique")

    return {
        "table_type": table_types[0] if table_types else "Unknown",
        "headers": all_headers,
        "headers_normalized": [h.lower().replace(" ", "_") for h in all_headers] if all_headers else [],
        "rows": unique_rows,
        "row_count": len(unique_rows),
        "notes": " | ".join(notes_list) if notes_list else "Extracted from quadrants",
        "raw_markdown": "\n\n".join(all_markdown),
        "status": "success",
        "quadrant_count": len(quadrants),
    }


class ExtractTables(PipelineStep):
    """
    Pipeline step to extract tables from detected regions.

    Finds table/schedule/legend detections, crops them from page images,
    and runs Gemini VLM extraction to get structured JSON.
    """

    name = "extract_tables"

    def __init__(
        self,
        table_classes: list[str] = None,
        min_confidence: float = None,
        min_size: int = None,
    ):
        self.table_classes = [c.lower() for c in (table_classes or config.TABLE_CLASSES)]
        self.min_confidence = min_confidence if min_confidence is not None else config.TABLE_CONFIDENCE_THRESHOLD
        self.min_size = min_size if min_size is not None else config.TABLE_MIN_SIZE

    def process(self, ctx: PipelineContext) -> PipelineContext:
        """Extract tables from all pages with table detections."""
        extracted_tables = []
        images_dir = ctx.metadata.get("images_dir")

        if not images_dir:
            logger.warning("No images_dir in metadata, skipping table extraction")
            ctx.metadata["extracted_tables"] = []
            return ctx

        for page_name, page_data in ctx.data.items():
            detections = page_data if isinstance(page_data, list) else page_data.get("detections", [])

            # Find table detections
            tables = [
                d for d in detections
                if d.get("class_name", "").lower() in self.table_classes
                and d.get("confidence", 0) >= self.min_confidence
            ]

            if not tables:
                continue

            logger.info(f"  {page_name}: {len(tables)} table(s)")

            # Load page image
            page_img = load_page_image(images_dir, page_name)
            if page_img is None:
                continue

            # Extract each table
            for i, det in enumerate(tables):
                crop = crop_bbox(page_img, det["bbox"], padding=config.IMAGE_CROP_PADDING)

                if crop.width < self.min_size or crop.height < self.min_size:
                    logger.debug(f"    Table {i+1}: too small, skipping")
                    continue

                logger.info(f"    Table {i+1}: {crop.width}x{crop.height}")
                result = extract_table_from_image(crop)

                extracted_tables.append({
                    "page": page_name,
                    "bbox": det["bbox"],
                    "confidence": det.get("confidence"),
                    **result,
                })

                if result.get("status") == "success":
                    logger.info(f"      -> {result.get('table_type')}: {result.get('row_count')} rows")
                else:
                    logger.warning(f"      -> Failed: {result.get('error')}")

        # Store results
        ctx.metadata["extracted_tables"] = extracted_tables
        ctx.metadata["tables_extracted"] = len([t for t in extracted_tables if t.get("status") == "success"])

        logger.info(f"  Total: {ctx.metadata['tables_extracted']} tables extracted")

        return ctx
