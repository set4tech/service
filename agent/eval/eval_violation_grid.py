#!/usr/bin/env python3
"""
Eval: Violation Grid Location

Tests the grid-based violation location system.
"""

import argparse
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s [%(name)s] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger("eval_grid")

AGENT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(AGENT_ROOT))


async def test_grid_location(image_path: str, violations: list[str]) -> dict:
    """Test grid location on an image."""
    from violation_grid import locate_violations_with_bounds
    from PIL import Image

    image = Image.open(image_path)
    if image.mode != 'RGB':
        image = image.convert('RGB')

    logger.info(f"Image: {image.size[0]}x{image.size[1]}")
    logger.info(f"Testing {len(violations)} violations")

    results = await locate_violations_with_bounds(image, violations)

    return {
        "image_size": image.size,
        "results": results,
    }


def visualize_grid_results(image_path: str, results: list[dict], output_path: str):
    """Draw grid overlay with highlighted cells."""
    from PIL import Image, ImageDraw

    image = Image.open(image_path)
    if image.mode != 'RGB':
        image = image.convert('RGB')

    w, h = image.size
    draw = ImageDraw.Draw(image, 'RGBA')

    # Draw grid lines
    for i in range(1, 3):
        draw.line([(w * i // 3, 0), (w * i // 3, h)], fill=(80, 80, 80), width=2)
        draw.line([(0, h * i // 3), (w, h * i // 3)], fill=(80, 80, 80), width=2)

    # Draw cell labels
    cell_labels = ['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3', 'C3']
    for idx, label in enumerate(cell_labels):
        col, row = idx % 3, idx // 3
        x = col * w // 3 + 5
        y = row * h // 3 + 5
        draw.text((x, y), label, fill=(100, 100, 100))

    # Highlight cells with violations
    colors = [(255, 0, 0, 80), (0, 255, 0, 80), (0, 0, 255, 80), (255, 165, 0, 80)]

    for i, result in enumerate(results):
        if result.get("found"):
            color = colors[i % len(colors)]
            for bound in result.get("bounds", []):
                x1 = int(bound["x"] * w)
                y1 = int(bound["y"] * h)
                x2 = int((bound["x"] + bound["width"]) * w)
                y2 = int((bound["y"] + bound["height"]) * h)
                draw.rectangle([x1, y1, x2, y2], fill=color)

    image.save(output_path)
    logger.info(f"Saved: {output_path}")


async def main():
    parser = argparse.ArgumentParser(description="Violation Grid Location Eval")
    parser.add_argument("--image", default="eval/test-me.png", help="Image to test")
    parser.add_argument("--output", default="eval/grid-eval-result.png", help="Output path")
    args = parser.parse_args()

    print()
    print("=" * 60)
    print("    VIOLATION GRID LOCATION - EVAL")
    print("=" * 60)
    print()

    # Test with doors
    test_violations = [
        "doors or door swings in the floor plan",
        "room labels like ELEC. RM. or MPOE",
        "dimension annotations or measurements",
    ]

    results = await test_grid_location(args.image, test_violations)

    print()
    print("-" * 50)
    print("RESULTS")
    print("-" * 50)

    for i, result in enumerate(results["results"]):
        status = "✅" if result["found"] else "❌"
        cells = ", ".join(result["cells"]) if result["cells"] else "none"
        print(f"\n{status} Violation {i+1}: {result['description'][:50]}...")
        print(f"   Cells: {cells}")
        print(f"   Explanation: {result['explanation'][:100]}...")

    # Visualize
    visualize_grid_results(args.image, results["results"], args.output)

    print()
    print("=" * 60)
    found = sum(1 for r in results["results"] if r["found"])
    print(f"Found: {found}/{len(test_violations)}")
    print(f"Output: {args.output}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
