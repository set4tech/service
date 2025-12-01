"""
Unit tests for agent/image_utils.py
"""
import pytest
from unittest.mock import MagicMock, patch
import tempfile
from pathlib import Path
import sys

# Add agent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from PIL import Image
from image_utils import (
    crop_bbox,
    split_into_quadrants,
    load_page_image,
    dedupe_rows,
)


class TestCropBbox:
    """Test crop_bbox function."""

    def test_basic_crop(self):
        """Crops image to bbox coordinates."""
        # Create a 200x200 test image
        img = Image.new('RGB', (200, 200), color='white')

        # Crop a 50x50 region in the center
        cropped = crop_bbox(img, [75, 75, 125, 125], padding=0)

        assert cropped.width == 50
        assert cropped.height == 50

    def test_crop_with_padding(self):
        """Adds padding around bbox."""
        img = Image.new('RGB', (200, 200), color='white')

        # Crop with 20px padding
        cropped = crop_bbox(img, [75, 75, 125, 125], padding=20)

        # Should be 50 + 40 = 90 (20 on each side)
        assert cropped.width == 90
        assert cropped.height == 90

    def test_padding_clipped_to_image_bounds(self):
        """Padding doesn't extend beyond image boundaries."""
        img = Image.new('RGB', (100, 100), color='white')

        # Crop near corner with large padding
        cropped = crop_bbox(img, [0, 0, 20, 20], padding=50)

        # Width: 0 - 50 = 0 (clamped), 20 + 50 = 70
        # Height: 0 - 50 = 0 (clamped), 20 + 50 = 70
        assert cropped.width == 70
        assert cropped.height == 70

    def test_padding_clipped_at_max_bounds(self):
        """Padding at bottom-right corner is clipped."""
        img = Image.new('RGB', (100, 100), color='white')

        # Crop near bottom-right corner
        cropped = crop_bbox(img, [80, 80, 100, 100], padding=30)

        # x2 + padding would be 130, but clamped to 100
        # y2 + padding would be 130, but clamped to 100
        # x1 - padding would be 50
        # y1 - padding would be 50
        assert cropped.width == 50  # 100 - 50
        assert cropped.height == 50

    def test_float_coordinates(self):
        """Handles float bbox coordinates."""
        img = Image.new('RGB', (200, 200), color='white')

        cropped = crop_bbox(img, [10.5, 20.7, 60.3, 80.9], padding=0)

        # Coordinates are converted to int
        assert cropped.width == 50  # 60 - 10
        assert cropped.height == 60  # 80 - 20

    def test_default_padding(self):
        """Default padding is 20 pixels."""
        img = Image.new('RGB', (200, 200), color='white')

        # Don't specify padding - should use default of 20
        cropped = crop_bbox(img, [50, 50, 100, 100])

        # 50x50 region + 20 padding on each side = 90x90
        assert cropped.width == 90
        assert cropped.height == 90


class TestSplitIntoQuadrants:
    """Test split_into_quadrants function."""

    def test_small_image_not_split(self):
        """Images smaller than min_size are not split."""
        img = Image.new('RGB', (400, 400), color='white')

        result = split_into_quadrants(img, min_size=600)

        assert len(result) == 1
        assert result[0] is img

    def test_large_square_image_split_into_4(self):
        """Large square images are split into 4 quadrants."""
        img = Image.new('RGB', (800, 800), color='white')

        result = split_into_quadrants(img, max_quadrants=4, min_size=600, overlap=0)

        assert len(result) == 4
        # Each quadrant should be roughly half the size
        for quadrant in result:
            assert quadrant.width == 400
            assert quadrant.height == 400

    def test_quadrant_overlap(self):
        """Quadrants have specified overlap."""
        img = Image.new('RGB', (800, 800), color='white')

        result = split_into_quadrants(img, max_quadrants=4, min_size=600, overlap=50)

        assert len(result) == 4
        # Each quadrant should be half + overlap
        for quadrant in result:
            assert quadrant.width == 450  # 400 + 50
            assert quadrant.height == 450

    def test_wide_image_split_horizontally(self):
        """Wide images (aspect > 1.5) are split into 2 horizontal pieces when h <= min_size."""
        # Use height <= min_size to trigger horizontal split (not 4-way)
        img = Image.new('RGB', (1600, 500), color='white')

        result = split_into_quadrants(img, max_quadrants=4, min_size=600, overlap=0)

        assert len(result) == 2
        # Each piece should be half width, full height
        for piece in result:
            assert piece.width == 800
            assert piece.height == 500

    def test_tall_image_split_vertically(self):
        """Tall images (aspect < 0.67) are split into 2 vertical pieces when w <= min_size."""
        # Use width <= min_size to trigger vertical split (not 4-way)
        img = Image.new('RGB', (500, 1600), color='white')

        result = split_into_quadrants(img, max_quadrants=4, min_size=600, overlap=0)

        assert len(result) == 2
        # Each piece should be full width, half height
        for piece in result:
            assert piece.width == 500
            assert piece.height == 800

    def test_max_quadrants_limits_split(self):
        """max_quadrants=2 prevents 4-way split."""
        img = Image.new('RGB', (800, 800), color='white')

        result = split_into_quadrants(img, max_quadrants=2, min_size=600, overlap=0)

        # Square image with max_quadrants=2 won't match aspect ratio conditions
        # so it returns unsplit
        assert len(result) == 1

    def test_max_quadrants_1_no_split(self):
        """max_quadrants=1 prevents any split (returns original image)."""
        # With max_quadrants < 4, the 4-way split is skipped
        # Then aspect ratio conditions (>1.5 or <0.67) aren't met for square image
        img = Image.new('RGB', (800, 800), color='white')

        result = split_into_quadrants(img, max_quadrants=1, min_size=600, overlap=0)

        assert len(result) == 1

    def test_horizontal_split_with_overlap(self):
        """Horizontal split includes overlap."""
        # Use height <= min_size to trigger horizontal split
        img = Image.new('RGB', (1600, 500), color='white')

        result = split_into_quadrants(img, max_quadrants=4, min_size=600, overlap=50)

        assert len(result) == 2
        # Each piece: width = 800 + 50 = 850
        for piece in result:
            assert piece.width == 850
            assert piece.height == 500

    def test_vertical_split_with_overlap(self):
        """Vertical split includes overlap."""
        # Use width <= min_size to trigger vertical split
        img = Image.new('RGB', (500, 1600), color='white')

        result = split_into_quadrants(img, max_quadrants=4, min_size=600, overlap=50)

        assert len(result) == 2
        # Each piece: height = 800 + 50 = 850
        for piece in result:
            assert piece.width == 500
            assert piece.height == 850


class TestLoadPageImage:
    """Test load_page_image function."""

    def test_loads_existing_image(self):
        """Loads image file from directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a test image
            img_path = Path(tmpdir) / "page_001.png"
            test_img = Image.new('RGB', (100, 100), color='red')
            test_img.save(img_path)

            # Load it
            result = load_page_image(tmpdir, "page_001.png")

            assert result is not None
            assert result.width == 100
            assert result.height == 100

    def test_returns_none_for_missing_file(self):
        """Returns None when image file doesn't exist."""
        with tempfile.TemporaryDirectory() as tmpdir:
            result = load_page_image(tmpdir, "nonexistent.png")

            assert result is None

    def test_accepts_path_object(self):
        """Accepts Path object for images_dir."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir = Path(tmpdir)
            img_path = tmpdir / "page.png"
            Image.new('RGB', (50, 50)).save(img_path)

            result = load_page_image(tmpdir, "page.png")

            assert result is not None


class TestDedupeRows:
    """Test dedupe_rows function."""

    def test_removes_duplicate_rows(self):
        """Removes rows with identical content."""
        rows = [
            {"col1": "a", "col2": "b"},
            {"col1": "a", "col2": "b"},  # Duplicate
            {"col1": "c", "col2": "d"},
        ]

        result = dedupe_rows(rows)

        assert len(result) == 2

    def test_preserves_unique_rows(self):
        """All unique rows are preserved."""
        rows = [
            {"col1": "a", "col2": "b"},
            {"col1": "c", "col2": "d"},
            {"col1": "e", "col2": "f"},
        ]

        result = dedupe_rows(rows)

        assert len(result) == 3
        assert result == rows

    def test_preserves_order(self):
        """First occurrence of duplicate is kept."""
        rows = [
            {"id": 1, "name": "first"},
            {"id": 2, "name": "second"},
            {"id": 1, "name": "first"},  # Duplicate
        ]

        result = dedupe_rows(rows)

        assert len(result) == 2
        assert result[0]["id"] == 1
        assert result[1]["id"] == 2

    def test_empty_list(self):
        """Handles empty list."""
        result = dedupe_rows([])

        assert result == []

    def test_single_row(self):
        """Single row returns unchanged."""
        rows = [{"col": "value"}]

        result = dedupe_rows(rows)

        assert result == rows

    def test_different_key_order_same_content(self):
        """Rows with same content but different key order are deduplicated."""
        rows = [
            {"a": 1, "b": 2},
            {"b": 2, "a": 1},  # Same content, different order
        ]

        result = dedupe_rows(rows)

        # Should dedupe because content is the same
        assert len(result) == 1

    def test_nested_values_converted_to_string(self):
        """Nested values are converted to string for comparison."""
        rows = [
            {"data": [1, 2, 3]},
            {"data": [1, 2, 3]},  # Same list
        ]

        result = dedupe_rows(rows)

        assert len(result) == 1

    def test_mixed_types(self):
        """Handles mixed value types."""
        rows = [
            {"int": 1, "str": "text", "float": 1.5},
            {"int": 1, "str": "text", "float": 1.5},
        ]

        result = dedupe_rows(rows)

        assert len(result) == 1

    def test_similar_but_different_values(self):
        """Similar but different values are not deduplicated."""
        rows = [
            {"val": "1"},
            {"val": 1},  # String vs int - different
        ]

        result = dedupe_rows(rows)

        # str(1) == "1" so they would be deduplicated
        assert len(result) == 1
