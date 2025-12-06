"""
Violation Grid Location using Gemini

Instead of precise bounding boxes (which are unreliable for architectural drawings),
this module uses a grid-based approach. The image is divided into a grid (default 3x3)
and Gemini identifies which cell(s) contain the violation.

This is more reliable because:
1. Gemini is better at spatial reasoning ("top-left") than pixel coordinates
2. Grid cells are always valid - no garbage coordinates
3. Descriptions provide context the user can verify
"""

import asyncio
import logging
from typing import Optional
from PIL import Image
from io import BytesIO

from llm import call_vlm_async

logger = logging.getLogger(__name__)

# Grid configuration
DEFAULT_GRID_SIZE = 3  # 3x3 grid

GRID_LABELS_3x3 = {
    'A1': (0, 0), 'B1': (1, 0), 'C1': (2, 0),
    'A2': (0, 1), 'B2': (1, 1), 'C2': (2, 1),
    'A3': (0, 2), 'B3': (1, 2), 'C3': (2, 2),
}

GRID_DESCRIPTION_3x3 = """
The image is divided into a 3x3 grid:
    |  A  |  B  |  C  |
----+-----+-----+-----+
 1  | A1  | B1  | C1  |  (top)
----+-----+-----+-----+
 2  | A2  | B2  | C2  |  (middle)
----+-----+-----+-----+
 3  | A3  | B3  | C3  |  (bottom)
----+-----+-----+-----+
Column A is LEFT, Column C is RIGHT.
"""


def get_cell_bounds(cell: str, width: int, height: int, grid_size: int = 3) -> Optional[dict]:
    """
    Get pixel bounds for a grid cell.

    Returns dict with x, y, width, height (normalized 0-1) or None if invalid cell.
    """
    cell = cell.upper().strip()

    if grid_size == 3 and cell in GRID_LABELS_3x3:
        col, row = GRID_LABELS_3x3[cell]
    else:
        return None

    cell_w = 1.0 / grid_size
    cell_h = 1.0 / grid_size

    return {
        "x": col * cell_w,
        "y": row * cell_h,
        "width": cell_w,
        "height": cell_h,
        "cell": cell,
    }


async def locate_violations_in_grid(
    image: Image.Image,
    violation_descriptions: list[str],
    grid_size: int = DEFAULT_GRID_SIZE,
) -> list[dict]:
    """
    Locate violations in a grid.

    Args:
        image: PIL Image of the screenshot
        violation_descriptions: List of violation descriptions to locate
        grid_size: Grid dimension (default 3 for 3x3)

    Returns:
        List of dicts, one per violation:
        {
            "description": original description,
            "cells": ["A1", "B2"],  # grid cells containing the violation
            "explanation": "The 42.02 inch dimension is visible in cell B2...",
            "found": True/False
        }
    """
    if not violation_descriptions:
        return []

    # Build violations list for prompt
    violations_text = "\n".join(
        f"{i+1}. {desc}" for i, desc in enumerate(violation_descriptions)
    )

    grid_desc = GRID_DESCRIPTION_3x3 if grid_size == 3 else GRID_DESCRIPTION_3x3

    prompt = f"""{grid_desc}

This is an architectural drawing. Locate where each of these violations/issues is shown:

{violations_text}

For EACH violation, identify which grid cell(s) contain the relevant area.
Look for dimensions, labels, annotations, or visual elements that relate to the violation.

Return JSON array with one object per violation (in order):
[
  {{
    "cells": ["B2"],
    "explanation": "The dimension showing 42.02 inches is in cell B2, near door D-13"
  }},
  {{
    "cells": ["A1", "A2"],
    "explanation": "The stair width callout spans cells A1 and A2"
  }}
]

If you cannot locate a violation, return {{"cells": [], "explanation": "Could not locate"}}.
Return ONLY the JSON array."""

    try:
        result = await call_vlm_async(prompt, image, json_mode=True)

        if result["status"] != "success":
            logger.warning(f"[ViolationGrid] LLM call failed: {result.get('error')}")
            return [{"description": d, "cells": [], "explanation": "LLM call failed", "found": False}
                    for d in violation_descriptions]

        import json
        try:
            locations = json.loads(result["text"])
        except json.JSONDecodeError:
            logger.warning(f"[ViolationGrid] Failed to parse JSON: {result['text'][:200]}")
            return [{"description": d, "cells": [], "explanation": "Failed to parse response", "found": False}
                    for d in violation_descriptions]

        if not isinstance(locations, list):
            locations = [locations]

        # Build results
        results = []
        for i, desc in enumerate(violation_descriptions):
            if i < len(locations) and isinstance(locations[i], dict):
                loc = locations[i]
                cells = loc.get("cells", [])
                # Normalize cell names
                cells = [c.upper().strip() for c in cells if isinstance(c, str)]
                # Filter valid cells
                cells = [c for c in cells if c in GRID_LABELS_3x3]

                results.append({
                    "description": desc,
                    "cells": cells,
                    "explanation": loc.get("explanation", ""),
                    "found": len(cells) > 0,
                })
            else:
                results.append({
                    "description": desc,
                    "cells": [],
                    "explanation": "No location data returned",
                    "found": False,
                })

        found_count = sum(1 for r in results if r["found"])
        logger.info(f"[ViolationGrid] Located {found_count}/{len(results)} violations in grid")

        return results

    except Exception as e:
        logger.error(f"[ViolationGrid] Error: {e}")
        return [{"description": d, "cells": [], "explanation": str(e), "found": False}
                for d in violation_descriptions]


async def locate_violations_with_bounds(
    image: Image.Image,
    violation_descriptions: list[str],
) -> list[dict]:
    """
    Locate violations and include normalized bounds for each cell.

    Returns list of dicts with 'bounds' field containing list of cell bounds.
    """
    results = await locate_violations_in_grid(image, violation_descriptions)

    w, h = image.size

    for result in results:
        bounds = []
        for cell in result.get("cells", []):
            cell_bounds = get_cell_bounds(cell, w, h)
            if cell_bounds:
                bounds.append(cell_bounds)
        result["bounds"] = bounds

    return results


# Sync wrappers

def locate_violations_in_grid_sync(
    image: Image.Image,
    violation_descriptions: list[str],
) -> list[dict]:
    """Synchronous wrapper using thread to avoid event loop conflicts."""
    import concurrent.futures

    def run_in_thread():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(
                locate_violations_in_grid(image, violation_descriptions)
            )
        finally:
            loop.close()

    with concurrent.futures.ThreadPoolExecutor() as executor:
        future = executor.submit(run_in_thread)
        return future.result(timeout=60)


def locate_violations_with_bounds_sync(
    image: Image.Image,
    violation_descriptions: list[str],
) -> list[dict]:
    """Synchronous wrapper with bounds."""
    import concurrent.futures

    def run_in_thread():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(
                locate_violations_with_bounds(image, violation_descriptions)
            )
        finally:
            loop.close()

    with concurrent.futures.ThreadPoolExecutor() as executor:
        future = executor.submit(run_in_thread)
        return future.result(timeout=60)
