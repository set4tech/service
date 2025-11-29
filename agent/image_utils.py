"""
Image utilities for the agent service.

Handles cropping, splitting, and other image operations.
"""
import logging
from pathlib import Path
from PIL import Image

logger = logging.getLogger(__name__)


def crop_bbox(image: Image.Image, bbox: list[float], padding: int = 20) -> Image.Image:
    """
    Crop a bounding box region from an image.

    Args:
        image: PIL Image to crop from
        bbox: [x1, y1, x2, y2] coordinates
        padding: Extra pixels to include around the bbox

    Returns:
        Cropped PIL Image
    """
    x1, y1, x2, y2 = [int(v) for v in bbox]

    # Add padding
    x1 = max(0, x1 - padding)
    y1 = max(0, y1 - padding)
    x2 = min(image.width, x2 + padding)
    y2 = min(image.height, y2 + padding)

    return image.crop((x1, y1, x2, y2))


def split_into_quadrants(
    image: Image.Image,
    max_quadrants: int = 4,
    overlap: int = 50,
    min_size: int = 600,
) -> list[Image.Image]:
    """
    Split an image into quadrants for processing large images.

    Useful when VLM hits token limits on large tables/documents.

    Args:
        image: PIL Image to split
        max_quadrants: Maximum pieces (1, 2, or 4)
        overlap: Pixels of overlap between pieces (avoids cutting rows)
        min_size: Minimum dimension to trigger splitting

    Returns:
        List of PIL Images (1-4 pieces)
    """
    w, h = image.width, image.height
    aspect = w / h if h > 0 else 1

    # Check if image is large enough to split
    if w <= min_size and h <= min_size:
        logger.debug(f"Image {w}x{h} too small to split (min_size={min_size})")
        return [image]

    quadrants = []

    if max_quadrants >= 4 and w > min_size and h > min_size:
        # Split into 4 quadrants (2x2 grid)
        mid_x, mid_y = w // 2, h // 2
        quadrants = [
            image.crop((0, 0, mid_x + overlap, mid_y + overlap)),                    # Top-left
            image.crop((mid_x - overlap, 0, w, mid_y + overlap)),                    # Top-right
            image.crop((0, mid_y - overlap, mid_x + overlap, h)),                    # Bottom-left
            image.crop((mid_x - overlap, mid_y - overlap, w, h)),                    # Bottom-right
        ]
        logger.info(f"Split {w}x{h} into 4 quadrants")

    elif aspect > 1.5 and w > min_size:
        # Wide image - split horizontally (left/right)
        mid_x = w // 2
        quadrants = [
            image.crop((0, 0, mid_x + overlap, h)),
            image.crop((mid_x - overlap, 0, w, h)),
        ]
        logger.info(f"Split {w}x{h} into 2 horizontal pieces")

    elif aspect < 0.67 and h > min_size:
        # Tall image - split vertically (top/bottom)
        mid_y = h // 2
        quadrants = [
            image.crop((0, 0, w, mid_y + overlap)),
            image.crop((0, mid_y - overlap, w, h)),
        ]
        logger.info(f"Split {w}x{h} into 2 vertical pieces")

    else:
        logger.debug(f"Image {w}x{h} doesn't need splitting")
        return [image]

    return quadrants


def load_page_image(images_dir: str | Path, page_name: str) -> Image.Image | None:
    """
    Load a page image from the images directory.

    Args:
        images_dir: Directory containing page images
        page_name: Filename of the page image

    Returns:
        PIL Image or None if not found
    """
    img_path = Path(images_dir) / page_name

    if not img_path.exists():
        logger.warning(f"Image not found: {img_path}")
        return None

    return Image.open(img_path)


def dedupe_rows(rows: list[dict]) -> list[dict]:
    """
    Deduplicate rows by content.

    Useful after merging quadrant extractions which may have overlapping rows.

    Args:
        rows: List of row dicts

    Returns:
        Deduplicated list
    """
    seen = set()
    unique = []

    for row in rows:
        # Create hashable key from row
        key = tuple(sorted((k, str(v)) for k, v in row.items()))
        if key not in seen:
            seen.add(key)
            unique.append(row)

    if len(unique) < len(rows):
        logger.debug(f"Deduped {len(rows)} rows -> {len(unique)} unique")

    return unique
