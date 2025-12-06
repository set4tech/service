"""
Compliance Tools for Building Code Assessment

Extended tool set combining document navigation tools with calculation/parsing tools
for building code compliance assessment.

Tools:
- Document navigation (from chat_tools)
- Calculations (evaluate math expressions)
- Dimension parsing (architectural formats)
- Table lookups (IBC tables)
"""

import json
import re
import math
import base64
import logging
from pathlib import Path
from typing import Any, Optional, List
from fractions import Fraction

from chat_tools import DocumentNavigator, ChatToolExecutor, CHAT_TOOLS
from violation_bbox import detect_violation_bboxes_for_image

logger = logging.getLogger(__name__)


# =============================================================================
# TOOL DEFINITIONS - Extended for compliance assessment
# =============================================================================

# Start with chat tools and add calculation/parsing tools
COMPLIANCE_TOOLS = CHAT_TOOLS + [
    {
        "name": "calculate",
        "description": "Evaluate a mathematical expression. Supports basic arithmetic (+, -, *, /), exponents (**), parentheses, and functions like sqrt(), min(), max(), abs(). Use for area calculations, percentages, and dimensional math.",
        "input_schema": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "Math expression to evaluate, e.g., '(36 * 80) / 144' or 'sqrt(100) + 5'"
                }
            },
            "required": ["expression"]
        }
    },
    {
        "name": "parse_dimension",
        "description": "Parse an architectural dimension string into decimal inches. Handles formats like: 3'-6\", 36\", 3'6\", 3 ft 6 in, 914mm, etc.",
        "input_schema": {
            "type": "object",
            "properties": {
                "dimension": {
                    "type": "string",
                    "description": "Dimension string to parse, e.g., \"3'-6\\\"\" or \"36\\\"\" or \"914mm\""
                }
            },
            "required": ["dimension"]
        }
    },
    {
        "name": "compare_dimensions",
        "description": "Compare two architectural dimensions. Returns which is larger and by how much.",
        "input_schema": {
            "type": "object",
            "properties": {
                "dimension_a": {
                    "type": "string",
                    "description": "First dimension string"
                },
                "dimension_b": {
                    "type": "string",
                    "description": "Second dimension string"
                }
            },
            "required": ["dimension_a", "dimension_b"]
        }
    },
    {
        "name": "get_site_data",
        "description": "Get site-specific building data: fire separation distance, construction type, occupancy classification, etc.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_elements_by_type",
        "description": "Find all elements of a specific type (doors, windows, stairs, ramps, etc.) from schedules and element tag detections.",
        "input_schema": {
            "type": "object",
            "properties": {
                "element_type": {
                    "type": "string",
                    "description": "Element type: 'door', 'window', 'stair', 'ramp', 'parking', 'restroom', 'elevator'"
                }
            },
            "required": ["element_type"]
        }
    },
    {
        "name": "get_element_attributes",
        "description": "Get detailed attributes for a specific element by its tag/mark number.",
        "input_schema": {
            "type": "object",
            "properties": {
                "element_tag": {
                    "type": "string",
                    "description": "Element tag/mark, e.g., 'D1', 'W2', '101A'"
                },
                "element_type": {
                    "type": "string",
                    "description": "Element type: 'door', 'window', etc."
                }
            },
            "required": ["element_tag"]
        }
    },
    {
        "name": "check_clearance_requirement",
        "description": "Check if a dimension meets a minimum clearance requirement. Returns pass/fail with details.",
        "input_schema": {
            "type": "object",
            "properties": {
                "actual_dimension": {
                    "type": "string",
                    "description": "The actual dimension from drawings"
                },
                "required_minimum": {
                    "type": "string",
                    "description": "The minimum required dimension"
                },
                "description": {
                    "type": "string",
                    "description": "Description of what is being checked, e.g., 'door clear width'"
                }
            },
            "required": ["actual_dimension", "required_minimum"]
        }
    },
    {
        "name": "lookup_cbc_table",
        "description": "Look up values from common CBC (California Building Code) tables. Available tables: TABLE_11B-1 (Accessible Routes), TABLE_11B-2 (Parking Spaces).",
        "input_schema": {
            "type": "object",
            "properties": {
                "table_name": {
                    "type": "string",
                    "description": "Table name, e.g., 'TABLE_11B-1' or 'TABLE_11B-2'"
                },
                "lookup_key": {
                    "type": "string",
                    "description": "Key to look up in the table"
                }
            },
            "required": ["table_name"]
        }
    },
    {
        "name": "mark_violation_areas",
        "description": "Locate violations in a screenshot using a 3x3 grid system. Returns which grid cells (A1-C3) contain each violation, plus an explanation. More reliable than pixel-precise coordinates for architectural drawings.",
        "input_schema": {
            "type": "object",
            "properties": {
                "violation_descriptions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of violation descriptions to locate. Be specific about what to find (e.g., 'dimension showing 42.02 inches', 'door D-13 clearance zone')."
                },
                "screenshot_index": {
                    "type": "integer",
                    "description": "Index of the screenshot to analyze (0-based). Default is 0.",
                    "default": 0
                }
            },
            "required": ["violation_descriptions"]
        }
    }
]


# =============================================================================
# DIMENSION PARSING UTILITIES
# =============================================================================

def parse_dimension_to_inches(dim_str: str) -> Optional[float]:
    """
    Parse an architectural dimension string to decimal inches.

    Supports formats:
    - 3'-6" (feet and inches)
    - 36" (inches only)
    - 3'6" (feet and inches, alternate)
    - 3 ft 6 in
    - 914mm (millimeters)
    - 2.5m (meters)
    - 3.5' (decimal feet)
    """
    if not dim_str:
        return None

    dim_str = dim_str.strip().lower()

    # Handle millimeters
    mm_match = re.match(r'^([\d.]+)\s*mm$', dim_str)
    if mm_match:
        return float(mm_match.group(1)) / 25.4

    # Handle meters
    m_match = re.match(r'^([\d.]+)\s*m$', dim_str)
    if m_match:
        return float(m_match.group(1)) * 39.3701

    # Handle centimeters
    cm_match = re.match(r'^([\d.]+)\s*cm$', dim_str)
    if cm_match:
        return float(cm_match.group(1)) / 2.54

    # Handle feet-inches: 3'-6", 3' 6", 3'-6 1/2"
    ft_in_match = re.match(r"^(\d+)'\s*-?\s*(\d+(?:\s+\d+/\d+)?)\s*\"?$", dim_str)
    if ft_in_match:
        feet = int(ft_in_match.group(1))
        inches_str = ft_in_match.group(2)
        # Handle fractional inches like "6 1/2"
        if ' ' in inches_str and '/' in inches_str:
            parts = inches_str.split()
            whole = int(parts[0])
            frac = float(Fraction(parts[1]))
            inches = whole + frac
        else:
            inches = float(inches_str)
        return feet * 12 + inches

    # Handle feet only: 3', 3.5'
    ft_match = re.match(r"^([\d.]+)\s*'$", dim_str)
    if ft_match:
        return float(ft_match.group(1)) * 12

    # Handle inches only: 36", 36
    in_match = re.match(r'^([\d.]+)\s*"?$', dim_str)
    if in_match:
        return float(in_match.group(1))

    # Handle "X ft Y in" format
    ft_in_text = re.match(r'^(\d+)\s*(?:ft|feet)\s*(\d+)\s*(?:in|inches)?$', dim_str)
    if ft_in_text:
        return int(ft_in_text.group(1)) * 12 + int(ft_in_text.group(2))

    return None


def format_dimension(inches: float) -> str:
    """Format decimal inches as feet-inches string."""
    feet = int(inches // 12)
    remaining_inches = inches % 12

    if feet == 0:
        return f'{remaining_inches:.1f}"'
    elif remaining_inches == 0:
        return f"{feet}'-0\""
    else:
        return f"{feet}'-{remaining_inches:.1f}\""


# =============================================================================
# SAFE MATH EVALUATION
# =============================================================================

SAFE_MATH_NAMES = {
    'sqrt': math.sqrt,
    'abs': abs,
    'min': min,
    'max': max,
    'round': round,
    'floor': math.floor,
    'ceil': math.ceil,
    'pi': math.pi,
    'e': math.e,
}


def safe_eval_math(expression: str) -> float:
    """
    Safely evaluate a mathematical expression.

    Only allows basic math operations and safe functions.
    """
    # Clean the expression
    expr = expression.strip()

    # Replace ^ with ** for exponents
    expr = expr.replace('^', '**')

    # Validate characters - only allow digits, operators, parens, dots, and function names
    allowed_pattern = r'^[\d\s\+\-\*\/\(\)\.\,\w]+$'
    if not re.match(allowed_pattern, expr):
        raise ValueError(f"Invalid characters in expression: {expression}")

    # Compile with restricted builtins
    code = compile(expr, '<string>', 'eval')

    # Check for disallowed names
    for name in code.co_names:
        if name not in SAFE_MATH_NAMES:
            raise ValueError(f"Disallowed function: {name}")

    # Evaluate with safe namespace
    return eval(code, {"__builtins__": {}}, SAFE_MATH_NAMES)


# =============================================================================
# CBC TABLE DATA
# =============================================================================

CBC_TABLES = {
    "TABLE_11B-2": {
        "description": "Accessible Parking Spaces",
        "data": {
            "1-25": {"standard": 1, "van": 0},
            "26-50": {"standard": 2, "van": 0},
            "51-75": {"standard": 3, "van": 1},
            "76-100": {"standard": 4, "van": 1},
            "101-150": {"standard": 5, "van": 1},
            "151-200": {"standard": 6, "van": 1},
            "201-300": {"standard": 7, "van": 2},
            "301-400": {"standard": 8, "van": 2},
            "401-500": {"standard": 9, "van": 2},
            "501-1000": {"standard": "2% of total", "van": "1 per 6 accessible"},
            "1001+": {"standard": "20 + 1 per 100 over 1000", "van": "1 per 6 accessible"}
        }
    },
    "TABLE_11B-1": {
        "description": "Accessible Route Requirements",
        "data": {
            "clear_width": "44 inches minimum (36 inches at doors)",
            "passing_space": "60 inches x 60 inches every 200 feet",
            "slope_running": "1:12 maximum (8.33%)",
            "slope_cross": "1:48 maximum (2.08%)",
            "surface": "Firm, stable, and slip-resistant"
        }
    }
}


# =============================================================================
# COMPLIANCE TOOL EXECUTOR
# =============================================================================

class ComplianceToolExecutor(ChatToolExecutor):
    """
    Extended tool executor for compliance assessment.

    Inherits document navigation tools from ChatToolExecutor and adds
    calculation, parsing, and lookup tools.
    """

    # Valid element types for get_elements_by_type
    VALID_ELEMENT_TYPES = [
        "door", "doors", "window", "windows", "stair", "stairs",
        "ramp", "ramps", "parking", "restroom", "restrooms",
        "elevator", "elevators"
    ]

    def __init__(
        self,
        navigator: DocumentNavigator,
        images_dir: Optional[Path] = None,
        screenshot_urls: Optional[List[str]] = None,
    ):
        super().__init__(navigator, images_dir)
        self.screenshot_urls = screenshot_urls or []
        self._build_element_index()

    def _build_element_index(self):
        """Build index of elements from schedules and detections."""
        self.elements = {
            "doors": [],
            "windows": [],
            "stairs": [],
            "ramps": [],
            "parking": [],
            "restrooms": [],
            "elevators": []
        }

        for page_num, page_data in self.navigator.pages.items():
            # Extract from schedules
            for section in page_data.get("sections", []):
                if section.get("section_type") == "table":
                    table_data = section.get("table_data", {})
                    table_type = table_data.get("table_type", "").lower()

                    if "door" in table_type:
                        self._extract_door_schedule(table_data, page_num)
                    elif "window" in table_type:
                        self._extract_window_schedule(table_data, page_num)
                    elif "stair" in table_type:
                        self._extract_stair_schedule(table_data, page_num)

            # Extract from element tag detections
            element_tags = page_data.get("element_tags", [])
            for tag in element_tags:
                tag_type = tag.get("type", "").lower()
                if "door" in tag_type:
                    self.elements["doors"].append({
                        "tag": tag.get("tag"),
                        "page": page_num,
                        "location": tag.get("location"),
                        "source": "detection"
                    })

    def _extract_door_schedule(self, table_data: dict, page_num: str):
        """Extract doors from door schedule."""
        rows = table_data.get("rows", [])
        for row in rows:
            door_tag = row.get("mark") or row.get("door_mark") or row.get("tag") or row.get("no")
            if door_tag:
                self.elements["doors"].append({
                    "tag": door_tag,
                    "page": page_num,
                    "width": row.get("width"),
                    "height": row.get("height"),
                    "type": row.get("type") or row.get("door_type"),
                    "fire_rating": row.get("fire_rating") or row.get("fire_label"),
                    "hardware": row.get("hardware") or row.get("hardware_group"),
                    "frame": row.get("frame") or row.get("frame_type"),
                    "glass": row.get("glass") or row.get("glazing"),
                    "remarks": row.get("remarks") or row.get("notes"),
                    "source": "schedule"
                })

    def _extract_window_schedule(self, table_data: dict, page_num: str):
        """Extract windows from window schedule."""
        rows = table_data.get("rows", [])
        for row in rows:
            win_tag = row.get("mark") or row.get("type") or row.get("tag")
            if win_tag:
                self.elements["windows"].append({
                    "tag": win_tag,
                    "page": page_num,
                    "width": row.get("width"),
                    "height": row.get("height"),
                    "sill_height": row.get("sill") or row.get("sill_height"),
                    "type": row.get("type") or row.get("window_type"),
                    "glazing": row.get("glazing") or row.get("glass"),
                    "frame": row.get("frame"),
                    "source": "schedule"
                })

    def _extract_stair_schedule(self, table_data: dict, page_num: str):
        """Extract stairs from stair schedule."""
        rows = table_data.get("rows", [])
        for row in rows:
            stair_tag = row.get("mark") or row.get("stair") or row.get("tag")
            if stair_tag:
                self.elements["stairs"].append({
                    "tag": stair_tag,
                    "page": page_num,
                    "width": row.get("width"),
                    "riser": row.get("riser") or row.get("riser_height"),
                    "tread": row.get("tread") or row.get("tread_depth"),
                    "handrails": row.get("handrails") or row.get("handrail"),
                    "source": "schedule"
                })

    def _validate_tool_input(self, tool_name: str, tool_input: dict) -> Optional[dict]:
        """
        Validate tool input for compliance-specific tools.

        Extends parent validation with compliance tool checks.
        """
        if tool_name == "calculate":
            expr = tool_input.get("expression")
            if not expr or (isinstance(expr, str) and not expr.strip()):
                return {"error": "Missing required parameter: expression"}

        elif tool_name == "parse_dimension":
            dim = tool_input.get("dimension")
            if not dim or (isinstance(dim, str) and not dim.strip()):
                return {"error": "Missing required parameter: dimension"}

        elif tool_name == "compare_dimensions":
            dim_a = tool_input.get("dimension_a")
            dim_b = tool_input.get("dimension_b")
            if not dim_a or (isinstance(dim_a, str) and not dim_a.strip()):
                return {"error": "Missing required parameter: dimension_a"}
            if not dim_b or (isinstance(dim_b, str) and not dim_b.strip()):
                return {"error": "Missing required parameter: dimension_b"}

        elif tool_name == "get_elements_by_type":
            elem_type = tool_input.get("element_type")
            if not elem_type or (isinstance(elem_type, str) and not elem_type.strip()):
                return {"error": f"Missing required parameter: element_type. Valid types: {self.VALID_ELEMENT_TYPES}"}
            if elem_type.lower() not in self.VALID_ELEMENT_TYPES:
                return {"error": f"Invalid element_type '{elem_type}'. Valid types: {self.VALID_ELEMENT_TYPES}"}

        elif tool_name == "get_element_attributes":
            tag = tool_input.get("element_tag")
            if not tag or (isinstance(tag, str) and not tag.strip()):
                return {"error": "Missing required parameter: element_tag"}

        elif tool_name == "check_clearance_requirement":
            actual = tool_input.get("actual_dimension")
            required = tool_input.get("required_minimum")
            if not actual or (isinstance(actual, str) and not actual.strip()):
                return {"error": "Missing required parameter: actual_dimension"}
            if not required or (isinstance(required, str) and not required.strip()):
                return {"error": "Missing required parameter: required_minimum"}

        elif tool_name == "lookup_cbc_table":
            table = tool_input.get("table_name")
            if not table or (isinstance(table, str) and not table.strip()):
                return {"error": f"Missing required parameter: table_name. Available: {list(CBC_TABLES.keys())}"}

        elif tool_name == "mark_violation_areas":
            descriptions = tool_input.get("violation_descriptions")
            if not descriptions or not isinstance(descriptions, list) or len(descriptions) == 0:
                return {"error": "Missing required parameter: violation_descriptions (must be non-empty array)"}
            if not self.screenshot_urls:
                return {"error": "No screenshots available to analyze"}

        else:
            # Fall back to parent validation for chat tools
            return super()._validate_tool_input(tool_name, tool_input)

        return None

    def execute(self, tool_name: str, tool_input: dict) -> dict:
        """
        Execute a tool and return the result.

        Extends ChatToolExecutor with compliance-specific tools.
        """
        logger.info(f"[ComplianceTool] {tool_name}({json.dumps(tool_input, default=str)[:100]})")

        # Validate input before processing
        validation_error = self._validate_tool_input(tool_name, tool_input)
        if validation_error:
            logger.warning(f"[ComplianceTool Validation] {tool_name}: {validation_error}")
            return {"result": validation_error}

        try:
            # Check if it's a compliance-specific tool
            if tool_name == "calculate":
                result = self._calculate(tool_input.get("expression", ""))
                return {"result": result}
            elif tool_name == "parse_dimension":
                result = self._parse_dimension(tool_input.get("dimension", ""))
                return {"result": result}
            elif tool_name == "compare_dimensions":
                result = self._compare_dimensions(
                    tool_input.get("dimension_a", ""),
                    tool_input.get("dimension_b", "")
                )
                return {"result": result}
            elif tool_name == "get_site_data":
                result = self._get_site_data()
                return {"result": result}
            elif tool_name == "get_elements_by_type":
                result = self._get_elements_by_type(tool_input.get("element_type", ""))
                return {"result": result}
            elif tool_name == "get_element_attributes":
                result = self._get_element_attributes(
                    tool_input.get("element_tag", ""),
                    tool_input.get("element_type")
                )
                return {"result": result}
            elif tool_name == "check_clearance_requirement":
                result = self._check_clearance(
                    tool_input.get("actual_dimension", ""),
                    tool_input.get("required_minimum", ""),
                    tool_input.get("description", "")
                )
                return {"result": result}
            elif tool_name == "lookup_cbc_table":
                result = self._lookup_cbc_table(
                    tool_input.get("table_name", ""),
                    tool_input.get("lookup_key")
                )
                return {"result": result}
            elif tool_name == "mark_violation_areas":
                result = self._mark_violation_areas(
                    tool_input.get("violation_descriptions", []),
                    tool_input.get("screenshot_index", 0)
                )
                return {"result": result}
            else:
                # Fall back to parent class for chat tools
                return super().execute(tool_name, tool_input)

        except Exception as e:
            logger.error(f"[ComplianceTool Error] {e}")
            return {"result": {"error": str(e)}}

    def _calculate(self, expression: str) -> dict:
        """Evaluate a mathematical expression."""
        try:
            result = safe_eval_math(expression)
            return {
                "expression": expression,
                "result": result,
                "formatted": f"{result:,.4f}".rstrip('0').rstrip('.')
            }
        except Exception as e:
            return {"error": f"Failed to evaluate '{expression}': {str(e)}"}

    def _parse_dimension(self, dimension: str) -> dict:
        """Parse an architectural dimension string."""
        inches = parse_dimension_to_inches(dimension)
        if inches is None:
            return {"error": f"Could not parse dimension: {dimension}"}

        return {
            "input": dimension,
            "inches": round(inches, 4),
            "feet_inches": format_dimension(inches),
            "feet": round(inches / 12, 4),
            "mm": round(inches * 25.4, 2)
        }

    def _compare_dimensions(self, dim_a: str, dim_b: str) -> dict:
        """Compare two dimensions."""
        inches_a = parse_dimension_to_inches(dim_a)
        inches_b = parse_dimension_to_inches(dim_b)

        if inches_a is None:
            return {"error": f"Could not parse dimension A: {dim_a}"}
        if inches_b is None:
            return {"error": f"Could not parse dimension B: {dim_b}"}

        diff = inches_a - inches_b

        return {
            "dimension_a": {"input": dim_a, "inches": round(inches_a, 4)},
            "dimension_b": {"input": dim_b, "inches": round(inches_b, 4)},
            "difference_inches": round(diff, 4),
            "difference_formatted": format_dimension(abs(diff)),
            "a_is_larger": diff > 0,
            "b_is_larger": diff < 0,
            "equal": abs(diff) < 0.01
        }

    def _get_site_data(self) -> dict:
        """Get site-specific building data."""
        return self.navigator.get_site_data()

    def _get_elements_by_type(self, element_type: str) -> dict:
        """Get all elements of a specific type."""
        element_type = element_type.lower()

        # Map input to internal keys
        type_map = {
            "door": "doors",
            "doors": "doors",
            "window": "windows",
            "windows": "windows",
            "stair": "stairs",
            "stairs": "stairs",
            "ramp": "ramps",
            "ramps": "ramps",
            "parking": "parking",
            "restroom": "restrooms",
            "restrooms": "restrooms",
            "elevator": "elevators",
            "elevators": "elevators"
        }

        key = type_map.get(element_type, element_type + "s")
        elements = self.elements.get(key, [])

        return {
            "element_type": element_type,
            "count": len(elements),
            "elements": elements
        }

    def _get_element_attributes(self, element_tag: str, element_type: Optional[str] = None) -> dict:
        """Get attributes for a specific element."""
        element_tag_upper = element_tag.upper()

        # Search through all element types if not specified
        types_to_search = [element_type] if element_type else self.elements.keys()

        for etype in types_to_search:
            key = etype if etype in self.elements else etype + "s"
            if key not in self.elements:
                continue

            for elem in self.elements.get(key, []):
                tag = elem.get("tag", "")
                if tag and tag.upper() == element_tag_upper:
                    return {
                        "found": True,
                        "element_type": key,
                        "attributes": elem
                    }

        return {
            "found": False,
            "element_tag": element_tag,
            "message": f"Element '{element_tag}' not found in schedules or detections"
        }

    def _check_clearance(self, actual: str, required: str, description: str = "") -> dict:
        """Check if actual dimension meets minimum requirement."""
        actual_inches = parse_dimension_to_inches(actual)
        required_inches = parse_dimension_to_inches(required)

        if actual_inches is None:
            return {"error": f"Could not parse actual dimension: {actual}"}
        if required_inches is None:
            return {"error": f"Could not parse required dimension: {required}"}

        passes = actual_inches >= required_inches
        diff = actual_inches - required_inches

        return {
            "description": description,
            "actual": {"input": actual, "inches": round(actual_inches, 4)},
            "required": {"input": required, "inches": round(required_inches, 4)},
            "passes": passes,
            "difference_inches": round(diff, 4),
            "difference_formatted": format_dimension(abs(diff)),
            "message": f"{'PASS' if passes else 'FAIL'}: {actual} {'meets' if passes else 'does not meet'} minimum {required}" +
                      (f" ({description})" if description else "")
        }

    def _lookup_cbc_table(self, table_name: str, lookup_key: Optional[str] = None) -> dict:
        """Look up values from CBC tables."""
        table_name_upper = table_name.upper().replace(" ", "_")

        if table_name_upper not in CBC_TABLES:
            return {
                "error": f"Table '{table_name}' not found",
                "available_tables": list(CBC_TABLES.keys())
            }

        table = CBC_TABLES[table_name_upper]

        if lookup_key is None:
            return {
                "table_name": table_name_upper,
                "description": table.get("description"),
                "data": table.get("data")
            }

        data = table.get("data", {})
        if lookup_key in data:
            return {
                "table_name": table_name_upper,
                "lookup_key": lookup_key,
                "value": data[lookup_key]
            }

        # Try to find matching range for parking table
        if table_name_upper == "TABLE_11B-2":
            try:
                count = int(lookup_key)
                for range_key, values in data.items():
                    if "-" in range_key:
                        low, high = map(int, range_key.split("-"))
                        if low <= count <= high:
                            return {
                                "table_name": table_name_upper,
                                "lookup_key": lookup_key,
                                "matched_range": range_key,
                                "value": values
                            }
                    elif "+" in range_key:
                        threshold = int(range_key.replace("+", ""))
                        if count >= threshold:
                            return {
                                "table_name": table_name_upper,
                                "lookup_key": lookup_key,
                                "matched_range": range_key,
                                "value": values
                            }
            except ValueError:
                pass

        return {
            "table_name": table_name_upper,
            "lookup_key": lookup_key,
            "error": f"Key '{lookup_key}' not found in table",
            "available_keys": list(data.keys())
        }

    def _mark_violation_areas(self, descriptions: List[str], screenshot_index: int = 0) -> dict:
        """
        Locate violations in a screenshot using a 3x3 grid system.

        Args:
            descriptions: List of violation descriptions to locate
            screenshot_index: Which screenshot to analyze (0-based)

        Returns:
            Dict with grid cells for each violation
        """
        import httpx
        from PIL import Image
        from io import BytesIO
        from violation_grid import locate_violations_with_bounds_sync

        if screenshot_index >= len(self.screenshot_urls):
            return {"error": f"Screenshot index {screenshot_index} out of range (have {len(self.screenshot_urls)} screenshots)"}

        url = self.screenshot_urls[screenshot_index]

        # Fetch image synchronously
        try:
            response = httpx.get(url, timeout=30.0)
            response.raise_for_status()
            image = Image.open(BytesIO(response.content))
        except Exception as e:
            logger.error(f"[mark_violation_areas] Failed to fetch screenshot: {e}")
            return {"error": f"Failed to fetch screenshot: {str(e)}"}

        # Call grid-based location (sync wrapper)
        try:
            results = locate_violations_with_bounds_sync(image, descriptions)
        except Exception as e:
            logger.error(f"[mark_violation_areas] Grid location failed: {e}")
            return {"error": f"Grid location failed: {str(e)}"}

        found_count = sum(1 for r in results if r.get("found"))
        logger.info(f"[mark_violation_areas] Located {found_count}/{len(descriptions)} violations in grid")

        return {
            "screenshot_index": screenshot_index,
            "grid_size": "3x3",
            "violation_locations": results,
            "found_count": found_count,
            "note": "Grid cells are A1-C3 (columns A-C left to right, rows 1-3 top to bottom). Include cell locations in your violation output."
        }
