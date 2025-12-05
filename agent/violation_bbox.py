"""
Violation Bounding Box Detection using Gemini Spatial Understanding

Uses Gemini 2.5's native bounding box detection to pinpoint violation locations
in screenshots. Called after Claude identifies violations to get precise coordinates.

Gemini returns coordinates in [y_min, x_min, y_max, x_max] format normalized 0-1000.
We convert to {x, y, width, height} normalized 0-1 for frontend rendering.
"""

import asyncio
import logging
import httpx
from typing import Optional
from PIL import Image
from io import BytesIO

from llm import call_vlm_async

logger = logging.getLogger(__name__)


def _gemini_box_to_normalized(box_2d: list[int]) -> dict:
    """
    Convert Gemini's [y_min, x_min, y_max, x_max] (0-1000) to normalized {x, y, width, height} (0-1).
    """
    if not box_2d or len(box_2d) != 4:
        return None

    y_min, x_min, y_max, x_max = box_2d

    return {
        "x": x_min / 1000.0,
        "y": y_min / 1000.0,
        "width": (x_max - x_min) / 1000.0,
        "height": (y_max - y_min) / 1000.0,
    }


async def _fetch_image_from_url(url: str) -> Optional[Image.Image]:
    """Fetch image from URL and return as PIL Image."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=30.0)
            response.raise_for_status()
            return Image.open(BytesIO(response.content))
    except Exception as e:
        logger.error(f"[ViolationBbox] Failed to fetch image: {e}")
        return None


async def detect_violation_bboxes_for_image(
    image: Image.Image,
    violation_descriptions: list[str],
) -> list[list[dict]]:
    """
    Detect bounding boxes for violations in a single image.

    Args:
        image: PIL Image of the screenshot
        violation_descriptions: List of violation descriptions to locate

    Returns:
        List of lists - for each violation, a list of bounding boxes (may be multiple per violation)
        Each bbox is {x, y, width, height, label} normalized 0-1
    """
    if not violation_descriptions:
        return []

    # Build prompt for Gemini spatial understanding
    violations_text = "\n".join(f"{i+1}. {desc}" for i, desc in enumerate(violation_descriptions))

    prompt = f"""Analyze this architectural drawing screenshot and locate the specific areas that show these violations:

{violations_text}

For each violation, identify the bounding box(es) that highlight where the issue is visible in the image.

Return a JSON array where each element corresponds to a violation (in order). Each element should be an array of bounding boxes for that violation. Each bounding box should have:
- "box_2d": [y_min, x_min, y_max, x_max] coordinates normalized 0-1000
- "label": brief description of what this box shows

Example response format:
[
  [
    {{"box_2d": [100, 200, 300, 400], "label": "door clearance dimension"}}
  ],
  [
    {{"box_2d": [500, 100, 600, 250], "label": "stair width callout"}},
    {{"box_2d": [520, 300, 580, 400], "label": "stair detail showing issue"}}
  ]
]

If you cannot identify a location for a violation, return an empty array [] for that violation.
Return ONLY the JSON array, no other text."""

    try:
        result = await call_vlm_async(prompt, image, json_mode=True)

        if result["status"] != "success":
            logger.warning(f"[ViolationBbox] Gemini call failed: {result.get('error')}")
            return [[] for _ in violation_descriptions]

        # Parse response
        import json
        try:
            boxes_data = json.loads(result["text"])
        except json.JSONDecodeError:
            logger.warning(f"[ViolationBbox] Failed to parse JSON: {result['text'][:200]}")
            return [[] for _ in violation_descriptions]

        if not isinstance(boxes_data, list):
            logger.warning(f"[ViolationBbox] Expected list, got {type(boxes_data)}")
            return [[] for _ in violation_descriptions]

        # Convert each violation's boxes
        all_boxes = []
        for i, violation_boxes in enumerate(boxes_data):
            if not isinstance(violation_boxes, list):
                all_boxes.append([])
                continue

            converted = []
            for box in violation_boxes:
                if not isinstance(box, dict) or "box_2d" not in box:
                    continue

                normalized = _gemini_box_to_normalized(box.get("box_2d"))
                if normalized:
                    normalized["label"] = box.get("label", "")
                    converted.append(normalized)

            all_boxes.append(converted)

        # Pad if Gemini returned fewer results than violations
        while len(all_boxes) < len(violation_descriptions):
            all_boxes.append([])

        logger.info(f"[ViolationBbox] Detected boxes for {len(violation_descriptions)} violations: {[len(b) for b in all_boxes]}")
        return all_boxes

    except Exception as e:
        logger.error(f"[ViolationBbox] Error detecting boxes: {e}")
        return [[] for _ in violation_descriptions]


async def detect_violation_bboxes(
    violations: list[dict],
    screenshot_urls: list[str],
) -> list[dict]:
    """
    Detect bounding boxes for violations using Gemini spatial understanding.

    Args:
        violations: List of violation dicts with 'description' field
        screenshot_urls: List of presigned URLs for screenshots

    Returns:
        Updated violations list with 'bounding_boxes' field added to each
    """
    if not violations or not screenshot_urls:
        return violations

    # Fetch the first screenshot (primary evidence)
    # TODO: Could process multiple screenshots if needed
    image = await _fetch_image_from_url(screenshot_urls[0])
    if not image:
        logger.warning("[ViolationBbox] Could not fetch screenshot, skipping bbox detection")
        return violations

    # Get descriptions
    descriptions = [v.get("description", "") for v in violations]

    # Detect boxes
    boxes_per_violation = await detect_violation_bboxes_for_image(image, descriptions)

    # Add boxes to violations
    updated = []
    for i, violation in enumerate(violations):
        v_copy = dict(violation)
        if i < len(boxes_per_violation) and boxes_per_violation[i]:
            v_copy["bounding_boxes"] = boxes_per_violation[i]
        updated.append(v_copy)

    return updated


# Synchronous wrapper for non-async contexts
def detect_violation_bboxes_sync(
    violations: list[dict],
    screenshot_urls: list[str],
) -> list[dict]:
    """Synchronous wrapper for detect_violation_bboxes."""
    return asyncio.run(detect_violation_bboxes(violations, screenshot_urls))


def detect_violation_bboxes_for_image_sync(
    image: "Image.Image",
    violation_descriptions: list[str],
) -> list[list[dict]]:
    """
    Synchronous wrapper for detect_violation_bboxes_for_image.

    Uses a separate thread to avoid event loop conflicts.
    """
    import concurrent.futures

    def run_in_thread():
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(
                detect_violation_bboxes_for_image(image, violation_descriptions)
            )
        finally:
            loop.close()

    with concurrent.futures.ThreadPoolExecutor() as executor:
        future = executor.submit(run_in_thread)
        return future.result(timeout=60)
