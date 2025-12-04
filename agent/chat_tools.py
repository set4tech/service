"""
Chat Tools for Document Navigation

Provides tools for the chat agent to navigate and query the unified JSON
representation of architectural drawings.

Adapted from compliance_agent/tools.py and compliance_agent/batch_assess.py
"""

import io
import json
import re
import base64
import logging
from pathlib import Path
from typing import Any, Optional, List, Tuple

from PIL import Image

logger = logging.getLogger(__name__)

# Claude's max image size is 5MB (5,242,880 bytes)
# Use a slightly smaller limit to account for base64 overhead
MAX_IMAGE_BYTES = 4_500_000


def _resize_image_to_limit(image_path: Path, max_bytes: int = MAX_IMAGE_BYTES) -> Tuple[bytes, str]:
    """
    Load an image and resize it if needed to stay under the byte limit.

    Args:
        image_path: Path to the image file
        max_bytes: Maximum size in bytes for the output

    Returns:
        Tuple of (image_bytes, media_type)
    """
    # Determine media type from suffix
    suffix = image_path.suffix.lower()
    media_type = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp"
    }.get(suffix, "image/png")

    # First try loading as-is
    with open(image_path, "rb") as f:
        original_bytes = f.read()

    if len(original_bytes) <= max_bytes:
        return original_bytes, media_type

    logger.info(f"[resize_image] Image {image_path.name} is {len(original_bytes):,} bytes, resizing...")

    # Load with PIL and resize
    img = Image.open(image_path)

    # Convert to RGB if necessary (for JPEG output)
    if img.mode in ('RGBA', 'P'):
        img = img.convert('RGB')
        media_type = "image/jpeg"

    # Try progressively smaller sizes until under limit
    scale_factors = [0.75, 0.5, 0.4, 0.3, 0.25, 0.2]

    for scale in scale_factors:
        new_width = int(img.width * scale)
        new_height = int(img.height * scale)
        resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

        # Save to bytes buffer as JPEG (better compression than PNG)
        buffer = io.BytesIO()
        resized.save(buffer, format="JPEG", quality=85, optimize=True)
        result_bytes = buffer.getvalue()

        logger.info(f"[resize_image] Scale {scale}: {new_width}x{new_height} = {len(result_bytes):,} bytes")

        if len(result_bytes) <= max_bytes:
            return result_bytes, "image/jpeg"

    # Last resort: aggressive JPEG compression
    buffer = io.BytesIO()
    smallest = img.resize((int(img.width * 0.15), int(img.height * 0.15)), Image.Resampling.LANCZOS)
    smallest.save(buffer, format="JPEG", quality=60, optimize=True)
    return buffer.getvalue(), "image/jpeg"


def _extract_quadrant(image_path: Path, quadrant: str, max_bytes: int = MAX_IMAGE_BYTES) -> Tuple[bytes, str]:
    """
    Extract a quadrant from an image at full resolution.

    Args:
        image_path: Path to the image file
        quadrant: One of "top-left", "top-right", "bottom-left", "bottom-right"
        max_bytes: Maximum size in bytes for the output

    Returns:
        Tuple of (image_bytes, media_type)
    """
    img = Image.open(image_path)
    width, height = img.size

    # Calculate quadrant boundaries
    half_w, half_h = width // 2, height // 2

    quadrant_coords = {
        "top-left": (0, 0, half_w, half_h),
        "top-right": (half_w, 0, width, half_h),
        "bottom-left": (0, half_h, half_w, height),
        "bottom-right": (half_w, half_h, width, height),
    }

    if quadrant not in quadrant_coords:
        raise ValueError(f"Invalid quadrant: {quadrant}. Use: {list(quadrant_coords.keys())}")

    coords = quadrant_coords[quadrant]
    cropped = img.crop(coords)

    logger.info(f"[extract_quadrant] {quadrant} of {image_path.name}: {cropped.width}x{cropped.height}")

    # Convert to RGB if necessary
    if cropped.mode in ('RGBA', 'P'):
        cropped = cropped.convert('RGB')

    # Try PNG first, fall back to JPEG if too large
    buffer = io.BytesIO()
    cropped.save(buffer, format="PNG", optimize=True)
    result_bytes = buffer.getvalue()

    if len(result_bytes) <= max_bytes:
        return result_bytes, "image/png"

    # Fall back to JPEG
    buffer = io.BytesIO()
    cropped.save(buffer, format="JPEG", quality=90, optimize=True)
    result_bytes = buffer.getvalue()

    if len(result_bytes) <= max_bytes:
        return result_bytes, "image/jpeg"

    # If still too large, resize the quadrant
    logger.info(f"[extract_quadrant] Quadrant still too large ({len(result_bytes):,} bytes), resizing...")
    scale = 0.75
    while len(result_bytes) > max_bytes and scale > 0.2:
        resized = cropped.resize(
            (int(cropped.width * scale), int(cropped.height * scale)),
            Image.Resampling.LANCZOS
        )
        buffer = io.BytesIO()
        resized.save(buffer, format="JPEG", quality=85, optimize=True)
        result_bytes = buffer.getvalue()
        scale -= 0.1

    return result_bytes, "image/jpeg"


def _parse_page_number(page_key: Any) -> Optional[int]:
    """
    Extract numeric page number from various page key formats.

    Handles:
    - Integer: 0, 1, 2
    - String integer: "0", "1", "2"
    - Filename: "page_001.png", "page_1.png", "page001.png"

    Returns None if unable to parse.
    """
    if isinstance(page_key, int):
        return page_key

    if isinstance(page_key, str):
        # Try direct integer conversion first
        try:
            return int(page_key)
        except ValueError:
            pass

        # Try to extract number from filename pattern like "page_001.png"
        match = re.search(r'page[_-]?(\d+)', page_key, re.IGNORECASE)
        if match:
            return int(match.group(1))

    return None


# =============================================================================
# TOOL DEFINITIONS (8 tools for chat agent)
# =============================================================================

CHAT_TOOLS = [
    {
        "name": "find_schedules",
        "description": "Find schedules (door, window, finish, equipment, etc.) in the architectural drawings.",
        "input_schema": {
            "type": "object",
            "properties": {
                "schedule_type": {
                    "type": "string",
                    "description": "Type: 'door', 'window', 'finish', 'equipment', 'plumbing', or 'all'"
                }
            },
            "required": []
        }
    },
    {
        "name": "search_drawings",
        "description": "Search all drawing pages for specific keywords or phrases. Use this to find mentions of equipment, systems, or features.",
        "input_schema": {
            "type": "object",
            "properties": {
                "keywords": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Keywords to search for, e.g. ['sprinkler', 'kitchen hood', 'exhaust']"
                }
            },
            "required": ["keywords"]
        }
    },
    {
        "name": "get_room_list",
        "description": "Get a list of all rooms/spaces from schedules with their areas, uses, occupancy groups, and occupant counts.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_project_info",
        "description": "Get project metadata from cover sheet and title blocks: project name, address, building area, number of stories, scope of work.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_sheet_list",
        "description": "Get the list of drawing sheets with their sheet numbers and titles.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "read_sheet_details",
        "description": "Read detailed content from a specific drawing sheet by sheet number or page index.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sheet_identifier": {
                    "type": "string",
                    "description": "Sheet number (e.g., 'A1.0') or page index (e.g., '0', '1')"
                }
            },
            "required": ["sheet_identifier"]
        }
    },
    {
        "name": "get_keynotes",
        "description": "Get keynotes and general notes from the drawings.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "view_sheet_image",
        "description": "View an OVERVIEW of the drawing sheet (may be scaled down for large sheets). Use this first to understand the layout, then use view_sheet_region for full-resolution detail of specific areas.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sheet_identifier": {
                    "type": "string",
                    "description": "Sheet number (e.g., 'A1.0') or page index (e.g., '1', '2')"
                }
            },
            "required": ["sheet_identifier"]
        }
    },
    {
        "name": "view_sheet_region",
        "description": "View a FULL-RESOLUTION quadrant of a drawing sheet. Use this after view_sheet_image to read fine details like dimensions, text, schedules, or annotations that may be hard to read in the overview.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sheet_identifier": {
                    "type": "string",
                    "description": "Sheet number (e.g., 'A1.0') or page index (e.g., '1', '2')"
                },
                "quadrant": {
                    "type": "string",
                    "enum": ["top-left", "top-right", "bottom-left", "bottom-right"],
                    "description": "Which quadrant to view at full resolution"
                }
            },
            "required": ["sheet_identifier", "quadrant"]
        }
    }
]


# =============================================================================
# DOCUMENT NAVIGATOR
# =============================================================================

class DocumentNavigator:
    """Navigate and query the Unified JSON document structure."""

    def __init__(self, unified_json: dict):
        """
        Initialize navigator with unified JSON data.

        Args:
            unified_json: The unified document JSON (already loaded)
        """
        self.data = unified_json
        self.metadata = self.data.get("metadata", {})
        self.pages = self.data.get("pages", {})

        logger.info(f"[DocumentNavigator] Loaded document with {len(self.pages)} pages")

    def find_schedules(self, schedule_type: Optional[str] = None) -> list[dict]:
        """Find all schedules in the document."""
        schedules = []

        for page_num, page_data in self.pages.items():
            sections = page_data.get("sections", [])

            for section in sections:
                if section.get("section_type") != "table":
                    continue

                table_data = section.get("table_data", {})
                table_type = table_data.get("table_type", "")

                if schedule_type and schedule_type != "all":
                    if schedule_type.lower() not in table_type.lower():
                        continue

                schedules.append({
                    "page": page_num,
                    "type": table_type,
                    "headers": table_data.get("headers", {}).get("normalized", []),
                    "row_count": table_data.get("row_count", 0),
                    "summary": table_data.get("semantic_summary", "")
                })

        return schedules

    def get_site_data(self) -> dict:
        """Extract site-specific data from the drawings."""
        site_data = {
            "fire_separation_distance": None,
            "property_line_distance": None,
            "building_area": None,
            "occupancy_type": None,
            "construction_type": None
        }

        for page_num, page_data in self.pages.items():
            page_text_data = page_data.get("page_text")
            page_text = page_text_data.get("raw", "") if page_text_data else ""

            # Look for construction type
            const_pattern = r"type\s+([IV]+[A-B]?)\s+construction"
            match = re.search(const_pattern, page_text, re.I)
            if match:
                site_data["construction_type"] = match.group(1)

            # Look for occupancy
            occ_pattern = r"occupancy[:\s]+([A-S]-?\d*)"
            match = re.search(occ_pattern, page_text, re.I)
            if match:
                site_data["occupancy_type"] = match.group(1)

        return site_data


# =============================================================================
# TOOL EXECUTOR
# =============================================================================

class ChatToolExecutor:
    """Executes chat tools against the document navigator."""

    def __init__(
        self,
        navigator: DocumentNavigator,
        images_dir: Optional[Path] = None,
    ):
        self.navigator = navigator
        self.images_dir = images_dir
        self._build_keyword_index()
        self._build_page_index()

    def _build_keyword_index(self):
        """Build a searchable index of text from all pages."""
        self.text_index = {}
        for page_num, page_data in self.navigator.pages.items():
            page_text = ""
            # Get raw text
            page_text_data = page_data.get("page_text")
            if page_text_data:
                page_text = page_text_data.get("raw", "")

            # Also get text from sections
            for section in page_data.get("sections", []):
                if section.get("text"):
                    page_text += " " + section.get("text", "")
                if section.get("raw_text"):
                    page_text += " " + section.get("raw_text", "")

            self.text_index[page_num] = page_text.lower()

    def _build_page_index(self):
        """
        Build indices for sheet identifier normalization.

        Creates mappings from:
        - Numeric indices (0, 1, 2...) to page keys
        - Sheet numbers (A1.0, G0.1) to page keys
        """
        self.index_to_page_key = {}  # "0" -> "page_001.png"
        self.sheet_number_to_page_key = {}  # "A1.0" -> "page_001.png"

        # Sort pages by their parsed numeric value for consistent indexing
        page_items = list(self.navigator.pages.items())
        page_items_sorted = sorted(
            page_items,
            key=lambda x: (_parse_page_number(x[0]) or 999999, str(x[0]))
        )

        for idx, (page_key, page_data) in enumerate(page_items_sorted):
            # Map numeric index to page key
            self.index_to_page_key[str(idx)] = page_key

            # Map sheet number to page key
            sheet_num = page_data.get("sheet_number", "")
            if sheet_num:
                self.sheet_number_to_page_key[sheet_num.lower()] = page_key

        logger.debug(f"[PageIndex] Built index: {len(self.index_to_page_key)} pages, "
                     f"{len(self.sheet_number_to_page_key)} sheet numbers")

    def _resolve_sheet_identifier(self, sheet_id: str) -> tuple[Optional[str], Optional[dict]]:
        """
        Resolve a sheet identifier to its page key and data.

        Accepts multiple formats:
        - Page key: "page_001.png" (direct match)
        - Sheet number: "A1.0", "G0.1" (from title block)
        - Numeric index: "0", "1", "2" (zero-based page order)

        Returns:
            (page_key, page_data) if found, (None, None) if not found
        """
        sheet_id_str = str(sheet_id).strip()

        # 1. Try direct match with page keys
        if sheet_id_str in self.navigator.pages:
            return sheet_id_str, self.navigator.pages[sheet_id_str]

        # 2. Try sheet number match (case-insensitive)
        sheet_id_lower = sheet_id_str.lower()
        for page_key, page_data in self.navigator.pages.items():
            sheet_num = page_data.get("sheet_number", "")
            if sheet_num and sheet_num.lower() == sheet_id_lower:
                return page_key, page_data

        # 3. Try numeric index mapping
        if sheet_id_str in self.index_to_page_key:
            page_key = self.index_to_page_key[sheet_id_str]
            return page_key, self.navigator.pages.get(page_key)

        # 4. Try parsing as integer and using as index
        try:
            idx = int(sheet_id_str)
            if str(idx) in self.index_to_page_key:
                page_key = self.index_to_page_key[str(idx)]
                return page_key, self.navigator.pages.get(page_key)
        except ValueError:
            pass

        return None, None

    def _validate_tool_input(self, tool_name: str, tool_input: dict) -> Optional[dict]:
        """
        Validate tool input and return error dict if invalid, None if valid.

        Normalizes inputs where possible (e.g., strips whitespace).
        """
        if tool_name == "search_drawings":
            keywords = tool_input.get("keywords")
            if keywords is None:
                return {"error": "Missing required parameter: keywords"}
            if not isinstance(keywords, list):
                return {"error": f"Parameter 'keywords' must be a list, got {type(keywords).__name__}"}
            if len(keywords) == 0:
                return {"error": "Parameter 'keywords' cannot be empty"}
            # Validate each keyword is a non-empty string
            for i, kw in enumerate(keywords):
                if not isinstance(kw, str) or not kw.strip():
                    return {"error": f"Keyword at index {i} must be a non-empty string"}

        elif tool_name == "find_schedules":
            schedule_type = tool_input.get("schedule_type", "all")
            valid_types = ["all", "door", "window", "finish", "equipment", "plumbing", "room"]
            if schedule_type.lower() not in valid_types:
                return {"error": f"Invalid schedule_type '{schedule_type}'. Valid types: {valid_types}"}

        elif tool_name == "read_sheet_details":
            sheet_id = tool_input.get("sheet_identifier")
            if sheet_id is None or (isinstance(sheet_id, str) and not sheet_id.strip()):
                return {"error": "Missing required parameter: sheet_identifier"}

        elif tool_name == "view_sheet_image":
            sheet_id = tool_input.get("sheet_identifier")
            if sheet_id is None or (isinstance(sheet_id, str) and not sheet_id.strip()):
                return {"error": "Missing required parameter: sheet_identifier"}

        elif tool_name == "view_sheet_region":
            sheet_id = tool_input.get("sheet_identifier")
            if sheet_id is None or (isinstance(sheet_id, str) and not sheet_id.strip()):
                return {"error": "Missing required parameter: sheet_identifier"}
            quadrant = tool_input.get("quadrant")
            valid_quadrants = ["top-left", "top-right", "bottom-left", "bottom-right"]
            if quadrant not in valid_quadrants:
                return {"error": f"Invalid quadrant '{quadrant}'. Valid: {valid_quadrants}"}

        return None

    def _get_available_sheets_hint(self) -> str:
        """Get a hint string showing available sheet identifiers."""
        hints = []
        for idx, page_key in list(self.index_to_page_key.items())[:5]:
            page_data = self.navigator.pages.get(page_key, {})
            sheet_num = page_data.get("sheet_number", "")
            if sheet_num:
                hints.append(f"'{idx}' or '{sheet_num}'")
            else:
                hints.append(f"'{idx}'")

        hint_str = ", ".join(hints)
        if len(self.index_to_page_key) > 5:
            hint_str += f", ... ({len(self.index_to_page_key)} total)"
        return hint_str

    def execute(self, tool_name: str, tool_input: dict) -> dict:
        """
        Execute a tool and return the result.

        Returns a dict that may contain:
        - "result": JSON-serializable result data
        - "image": {"data": base64_str, "media_type": str} for vision tools
        """
        logger.info(f"[Tool] {tool_name}({json.dumps(tool_input, default=str)[:100]})")

        # Validate input before processing
        validation_error = self._validate_tool_input(tool_name, tool_input)
        if validation_error:
            logger.warning(f"[Tool Validation] {tool_name}: {validation_error}")
            return {"result": validation_error}

        try:
            if tool_name == "find_schedules":
                result = self._find_schedules(tool_input.get("schedule_type", "all"))
                return {"result": result}
            elif tool_name == "search_drawings":
                result = self._search_drawings(tool_input.get("keywords", []))
                return {"result": result}
            elif tool_name == "get_room_list":
                result = self._get_room_list()
                return {"result": result}
            elif tool_name == "get_project_info":
                result = self._get_project_info()
                return {"result": result}
            elif tool_name == "get_sheet_list":
                result = self._get_sheet_list()
                return {"result": result}
            elif tool_name == "read_sheet_details":
                result = self._read_sheet_details(tool_input.get("sheet_identifier", "0"))
                return {"result": result}
            elif tool_name == "get_keynotes":
                result = self._get_keynotes()
                return {"result": result}
            elif tool_name == "view_sheet_image":
                # This returns image data to be included in the message
                return self._view_sheet_image(tool_input.get("sheet_identifier", "1"))
            elif tool_name == "view_sheet_region":
                # This returns a full-resolution quadrant of the image
                return self._view_sheet_region(
                    tool_input.get("sheet_identifier", "1"),
                    tool_input.get("quadrant", "top-left")
                )
            else:
                return {"result": {"error": f"Unknown tool: {tool_name}"}}

        except Exception as e:
            logger.error(f"[Tool Error] {e}")
            return {"result": {"error": str(e)}}

    def _find_schedules(self, schedule_type: str) -> list:
        schedules = self.navigator.find_schedules(
            None if schedule_type == "all" else schedule_type
        )
        return schedules

    def _search_drawings(self, keywords: List[str]) -> dict:
        """Search all drawing pages for keywords."""
        results = {"matches": [], "keyword_hits": {}}

        for keyword in keywords:
            keyword_lower = keyword.lower()
            results["keyword_hits"][keyword] = []

            for page_num, text in self.text_index.items():
                if keyword_lower in text:
                    # Find context around the match
                    idx = text.find(keyword_lower)
                    start = max(0, idx - 50)
                    end = min(len(text), idx + len(keyword_lower) + 50)
                    context = text[start:end]

                    sheet_name = self.navigator.pages[page_num].get("sheet_number", f"page_{page_num}")
                    results["keyword_hits"][keyword].append({
                        "page": page_num,
                        "sheet": sheet_name,
                        "context": f"...{context}..."
                    })

        return results

    def _get_room_list(self) -> dict:
        """Extract room list from finish schedules or occupancy tables."""
        rooms = []
        seen_rooms = set()
        occupancy_groups = []
        total_occupants = 0

        for page_num, page_data in self.navigator.pages.items():
            for section in page_data.get("sections", []):
                if section.get("section_type") == "table":
                    table_data = section.get("table_data", {})
                    table_type = table_data.get("table_type", "").lower()

                    if "finish" in table_type or "room" in table_type or "occupancy" in table_type:
                        rows = table_data.get("rows", [])
                        for row in rows:
                            name = row.get("name") or row.get("room_name") or row.get("space")
                            if not name:
                                continue

                            area = row.get("area") or row.get("room_area") or row.get("sf")
                            use = (row.get("use") or row.get("function") or
                                   row.get("plumbing_occ_group") or row.get("occupancy_group") or
                                   row.get("occ_group"))
                            occ_group = row.get("plumbing_occ_group") or row.get("occupancy_group")
                            occupants = row.get("total_occupants") or row.get("occupants")

                            if occ_group and occ_group not in occupancy_groups:
                                occupancy_groups.append(occ_group)

                            if occupants:
                                try:
                                    total_occupants += int(occupants) if isinstance(occupants, str) else occupants
                                except (ValueError, TypeError):
                                    pass

                            room_key = f"{name}_{area}_{page_num}"
                            if room_key not in seen_rooms:
                                seen_rooms.add(room_key)
                                rooms.append({
                                    "name": name,
                                    "area": area,
                                    "use": use,
                                    "occupancy_group": occ_group,
                                    "occupants": occupants,
                                    "page": page_num
                                })

        return {
            "rooms": rooms,
            "count": len(rooms),
            "occupancy_groups": occupancy_groups,
            "total_occupants": total_occupants
        }

    def _get_project_info(self) -> dict:
        """Extract project metadata from unified data or cover sheets."""
        info = {
            "project_name": None,
            "project_address": None,
            "building_area": None,
            "num_stories": None,
            "scope_of_work": None,
            "construction_type": None,
            "occupancy_classification": None,
            "fire_sprinklered": None,
            "code_year": None,
            "architect": None,
            "code_data": [],
            "general_notes": []
        }

        # Check if unified data has project_info from VLM extraction
        project_info = self.navigator.data.get("project_info", {})
        if project_info:
            info["project_name"] = project_info.get("project_name")
            info["project_address"] = project_info.get("project_address")
            info["building_area"] = project_info.get("building_area")
            info["num_stories"] = project_info.get("num_stories")
            info["scope_of_work"] = project_info.get("scope_of_work")
            info["construction_type"] = project_info.get("construction_type")
            info["occupancy_classification"] = project_info.get("occupancy_classification")
            info["fire_sprinklered"] = project_info.get("fire_sprinklered")
            info["code_year"] = project_info.get("code_year")
            info["architect"] = project_info.get("architect")

        # Fall back to text extraction for missing fields
        for page_num, page_data in self.navigator.pages.items():
            # Look in tables for project/code data
            for section in page_data.get("sections", []):
                if section.get("section_type") == "table":
                    table_data = section.get("table_data", {})
                    table_type = table_data.get("table_type", "").lower()

                    if any(kw in table_type for kw in ["code", "project", "building", "data"]):
                        rows = table_data.get("rows", [])
                        for row in rows:
                            info["code_data"].append(row)

            # Search text on early pages for common metadata patterns
            parsed_page = _parse_page_number(page_num)
            if parsed_page is not None and parsed_page <= 2:
                text = self.text_index.get(page_num, "")

                # Look for construction type
                if not info["construction_type"]:
                    for const in ["type v-b", "type v-a", "type iv", "type iii-b", "type iii-a",
                                  "type ii-b", "type ii-a", "type i-b", "type i-a"]:
                        if const in text.lower():
                            info["construction_type"] = const.upper()
                            break

                # Look for stories
                if not info["num_stories"]:
                    stories_match = re.search(r'(\d+)\s*stor(?:y|ies)', text, re.IGNORECASE)
                    if stories_match:
                        info["num_stories"] = int(stories_match.group(1))

                # Look for building area patterns
                if not info["building_area"]:
                    area_match = re.search(r'([\d,]+)\s*(?:sf|sq\.?\s*ft|square feet)', text, re.IGNORECASE)
                    if area_match:
                        info["building_area"] = area_match.group(1).replace(",", "")

        return info

    def _get_sheet_list(self) -> list:
        """Get list of all sheets with their identifiers."""
        sheets = []

        # Use sorted order consistent with index mapping
        page_items = list(self.navigator.pages.items())
        page_items_sorted = sorted(
            page_items,
            key=lambda x: (_parse_page_number(x[0]) or 999999, str(x[0]))
        )

        for idx, (page_key, page_data) in enumerate(page_items_sorted):
            sheets.append({
                "index": str(idx),  # Numeric index that can be used with read_sheet_details/view_sheet_image
                "page_key": page_key,
                "sheet_number": page_data.get("sheet_number", ""),
                "sheet_title": page_data.get("sheet_title", "Unknown")
            })
        return sheets

    def _read_sheet_details(self, sheet_id: str) -> dict:
        """Read details from a specific sheet."""
        page_key, page_data = self._resolve_sheet_identifier(sheet_id)

        if page_key is None or page_data is None:
            available = self._get_available_sheets_hint()
            return {
                "error": f"Sheet '{sheet_id}' not found. Available sheets: {available}"
            }

        sheet_num = page_data.get("sheet_number") or ""
        return {
            "page_index": page_key,
            "sheet_number": sheet_num,
            "sheet_title": page_data.get("sheet_title"),
            "text_preview": (page_data.get("page_text", {}) or {}).get("raw", "")[:2000],
            "sections_count": len(page_data.get("sections", [])),
            "section_types": [s.get("section_type") for s in page_data.get("sections", [])]
        }

    def _get_keynotes(self) -> dict:
        """Get keynotes and general notes."""
        notes = {"keynotes": [], "general_notes": []}

        for page_num, page_data in self.navigator.pages.items():
            for section in page_data.get("sections", []):
                if section.get("section_type") == "table":
                    table_data = section.get("table_data", {})
                    if "keynote" in table_data.get("table_type", "").lower():
                        rows = table_data.get("rows", [])
                        for row in rows:
                            notes["keynotes"].append({
                                "number": row.get("keynote_number") or row.get("number"),
                                "text": row.get("keynote_text") or row.get("text") or row.get("description"),
                                "page": page_num
                            })

        return notes

    def _view_sheet_image(self, sheet_id: str) -> dict:
        """
        Get a sheet image for the agent to view directly.

        Returns:
            dict with either:
            - "image": {"data": base64_str, "media_type": str}, "result": {"sheet": ..., "page_index": ...}
            - "result": {"error": str}
        """
        if not self.images_dir:
            return {"result": {"error": "Images directory not configured"}}

        if not self.images_dir.exists():
            return {"result": {"error": f"Images directory not found: {self.images_dir}"}}

        # Resolve the sheet identifier to page key and data
        page_key, page_data = self._resolve_sheet_identifier(sheet_id)

        if page_key is None or page_data is None:
            available = self._get_available_sheets_hint()
            return {"result": {"error": f"Sheet '{sheet_id}' not found. Available sheets: {available}"}}

        page_num = page_key
        sheet_number = page_data.get("sheet_number", "")

        # Parse page number for pattern matching
        parsed_page = _parse_page_number(page_num)

        # Find the image file - try common naming patterns
        image_path = None
        patterns_to_try = [
            f"page_{page_num}.png",  # Use original key as-is
            f"page{page_num}.png",
        ]
        # Add zero-padded pattern if we have a numeric page number
        if parsed_page is not None:
            patterns_to_try.insert(0, f"page_{parsed_page:03d}.png")

        for pattern in patterns_to_try:
            candidate = self.images_dir / pattern
            if candidate.exists():
                image_path = candidate
                break

        # Also try glob patterns using parsed numeric page
        if not image_path and parsed_page is not None:
            for pattern in [f"*page_{parsed_page}*.png", f"*page{parsed_page}*.png"]:
                matches = list(self.images_dir.glob(pattern))
                if matches:
                    image_path = matches[0]
                    break

        # If page_num looks like a filename, try it directly
        if not image_path and isinstance(page_num, str) and page_num.endswith('.png'):
            candidate = self.images_dir / page_num
            if candidate.exists():
                image_path = candidate

        if not image_path or not image_path.exists():
            return {"result": {"error": f"Image file not found for page {page_num}"}}

        logger.info(f"[view_sheet_image] Loading {image_path.name} for sheet {sheet_id}")

        # Load and encode image (with automatic resizing if too large for Claude)
        image_bytes, media_type = _resize_image_to_limit(image_path)
        image_data = base64.standard_b64encode(image_bytes).decode("utf-8")

        return {
            "image": {
                "data": image_data,
                "media_type": media_type,
            },
            "result": {
                "sheet": sheet_number or f"Page {page_num}",
                "page_index": page_num,
                "image_file": image_path.name,
                "note": "This is an overview. Use view_sheet_region for full-resolution detail of specific quadrants."
            }
        }

    def _view_sheet_region(self, sheet_id: str, quadrant: str) -> dict:
        """
        Get a full-resolution quadrant of a sheet image.

        Args:
            sheet_id: Sheet number or page index
            quadrant: One of "top-left", "top-right", "bottom-left", "bottom-right"

        Returns:
            dict with either:
            - "image": {"data": base64_str, "media_type": str}, "result": {...}
            - "result": {"error": str}
        """
        if not self.images_dir:
            return {"result": {"error": "Images directory not configured"}}

        if not self.images_dir.exists():
            return {"result": {"error": f"Images directory not found: {self.images_dir}"}}

        # Resolve the sheet identifier to page key and data
        page_key, page_data = self._resolve_sheet_identifier(sheet_id)

        if page_key is None or page_data is None:
            available = self._get_available_sheets_hint()
            return {"result": {"error": f"Sheet '{sheet_id}' not found. Available sheets: {available}"}}

        page_num = page_key
        sheet_number = page_data.get("sheet_number", "")

        # Find the image file (same logic as _view_sheet_image)
        parsed_page = _parse_page_number(page_num)
        image_path = None
        patterns_to_try = [
            f"page_{page_num}.png",
            f"page{page_num}.png",
        ]
        if parsed_page is not None:
            patterns_to_try.insert(0, f"page_{parsed_page:03d}.png")

        for pattern in patterns_to_try:
            candidate = self.images_dir / pattern
            if candidate.exists():
                image_path = candidate
                break

        if not image_path and parsed_page is not None:
            for pattern in [f"*page_{parsed_page}*.png", f"*page{parsed_page}*.png"]:
                matches = list(self.images_dir.glob(pattern))
                if matches:
                    image_path = matches[0]
                    break

        if not image_path and isinstance(page_num, str) and page_num.endswith('.png'):
            candidate = self.images_dir / page_num
            if candidate.exists():
                image_path = candidate

        if not image_path or not image_path.exists():
            return {"result": {"error": f"Image file not found for page {page_num}"}}

        logger.info(f"[view_sheet_region] Loading {quadrant} quadrant of {image_path.name}")

        # Extract and encode the quadrant at full resolution
        image_bytes, media_type = _extract_quadrant(image_path, quadrant)
        image_data = base64.standard_b64encode(image_bytes).decode("utf-8")

        return {
            "image": {
                "data": image_data,
                "media_type": media_type,
            },
            "result": {
                "sheet": sheet_number or f"Page {page_num}",
                "page_index": page_num,
                "quadrant": quadrant,
                "image_file": image_path.name,
            }
        }
