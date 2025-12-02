"""
Unit tests for agent/steps/extract_sheet_info.py
"""
import pytest
from unittest.mock import MagicMock, patch
import sys
from pathlib import Path

# Add agent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline import PipelineContext


class TestExtractPageNumber:
    """Test extract_page_number function."""

    def test_page_underscore_format(self):
        """Parses page_N format."""
        from steps.extract_sheet_info import extract_page_number

        assert extract_page_number("page_001.png") == "1"
        assert extract_page_number("page_12.png") == "12"
        assert extract_page_number("page_123.png") == "123"

    def test_page_no_separator_format(self):
        """Parses pageN format."""
        from steps.extract_sheet_info import extract_page_number

        assert extract_page_number("page5.png") == "5"
        assert extract_page_number("Page10.png") == "10"

    def test_achieve_format(self):
        """Parses achieve_page_N format."""
        from steps.extract_sheet_info import extract_page_number

        assert extract_page_number("achieve_page_1.png") == "1"
        assert extract_page_number("achieve_page_25.png") == "25"

    def test_fallback_to_stem(self):
        """Falls back to filename stem when no page pattern found."""
        from steps.extract_sheet_info import extract_page_number

        assert extract_page_number("image.png") == "image"


class TestParseSheetInfoResponse:
    """Test parse_sheet_info_response function."""

    def test_parses_valid_json(self):
        """Parses valid JSON response."""
        from steps.extract_sheet_info import parse_sheet_info_response

        result = parse_sheet_info_response('{"sheet_number": "A1.01", "sheet_title": "FLOOR PLAN"}')

        assert result["sheet_number"] == "A1.01"
        assert result["sheet_title"] == "FLOOR PLAN"

    def test_handles_markdown_code_blocks(self):
        """Strips markdown code blocks."""
        from steps.extract_sheet_info import parse_sheet_info_response

        response = """```json
{"sheet_number": "G0.00", "sheet_title": "COVER SHEET"}
```"""
        result = parse_sheet_info_response(response)

        assert result["sheet_number"] == "G0.00"
        assert result["sheet_title"] == "COVER SHEET"

    def test_handles_invalid_json(self):
        """Returns error dict on invalid JSON."""
        from steps.extract_sheet_info import parse_sheet_info_response

        result = parse_sheet_info_response("This is not JSON")

        assert "error" in result
        assert "raw_response" in result

    def test_handles_null_values(self):
        """Handles null sheet_number and sheet_title."""
        from steps.extract_sheet_info import parse_sheet_info_response

        result = parse_sheet_info_response('{"sheet_number": null, "sheet_title": null}')

        assert result["sheet_number"] is None
        assert result["sheet_title"] is None


class TestExtractSheetInfoStep:
    """Test ExtractSheetInfo pipeline step."""

    def test_step_name(self):
        """Step has correct name."""
        from steps.extract_sheet_info import ExtractSheetInfo

        step = ExtractSheetInfo()
        assert step.name == "extract_sheet_info"

    def test_skips_without_images_dir(self):
        """Returns empty results if no images_dir in metadata."""
        from steps.extract_sheet_info import ExtractSheetInfo

        step = ExtractSheetInfo()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={}
        )

        result = step.process(ctx)

        assert result.metadata["sheet_info"] == {}

    def test_skips_if_no_images_found(self):
        """Returns empty results if no PNG images in directory."""
        from steps.extract_sheet_info import ExtractSheetInfo
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            step = ExtractSheetInfo()
            ctx = PipelineContext(
                assessment_id="test",
                agent_run_id="test",
                data={},
                metadata={"images_dir": tmpdir}
            )

            result = step.process(ctx)

            assert result.metadata["sheet_info"] == {}

    @patch('steps.extract_sheet_info.call_vlm')
    @patch('steps.extract_sheet_info.load_page_image')
    def test_processes_pages_successfully(self, mock_load, mock_vlm):
        """Successfully processes pages and extracts sheet info."""
        from steps.extract_sheet_info import ExtractSheetInfo
        from PIL import Image
        import tempfile
        import os

        with tempfile.TemporaryDirectory() as tmpdir:
            # Create test image files
            for i in range(1, 3):
                img = Image.new('RGB', (100, 100))
                img.save(os.path.join(tmpdir, f"page_{i:03d}.png"))

            # Setup mocks
            mock_load.return_value = Image.new('RGB', (100, 100))
            mock_vlm.return_value = {
                "status": "success",
                "text": '{"sheet_number": "A1.01", "sheet_title": "FLOOR PLAN", "confidence": "high"}'
            }

            step = ExtractSheetInfo()
            ctx = PipelineContext(
                assessment_id="test",
                agent_run_id="test",
                data={},
                metadata={"images_dir": tmpdir}
            )

            result = step.process(ctx)

            assert len(result.metadata["sheet_info"]) == 2
            assert result.metadata["sheet_info"]["1"]["sheet_number"] == "A1.01"
            assert result.metadata["sheet_info"]["1"]["sheet_title"] == "FLOOR PLAN"
            assert result.metadata["sheet_info"]["1"]["page_file"] == "page_001.png"
            assert result.metadata["sheet_info_pages_processed"] == 2
            assert result.metadata["sheet_info_success_count"] == 2

    @patch('steps.extract_sheet_info.call_vlm')
    @patch('steps.extract_sheet_info.load_page_image')
    def test_handles_vlm_failure(self, mock_load, mock_vlm):
        """Continues processing when VLM call fails."""
        from steps.extract_sheet_info import ExtractSheetInfo
        from PIL import Image
        import tempfile
        import os

        with tempfile.TemporaryDirectory() as tmpdir:
            img = Image.new('RGB', (100, 100))
            img.save(os.path.join(tmpdir, "page_001.png"))

            mock_load.return_value = Image.new('RGB', (100, 100))
            mock_vlm.return_value = {
                "status": "error",
                "error": "API error"
            }

            step = ExtractSheetInfo()
            ctx = PipelineContext(
                assessment_id="test",
                agent_run_id="test",
                data={},
                metadata={"images_dir": tmpdir}
            )

            result = step.process(ctx)

            assert result.metadata["sheet_info"]["1"]["sheet_number"] is None
            assert result.metadata["sheet_info"]["1"]["error"] == "API error"
            assert result.metadata["sheet_info_success_count"] == 0

    @patch('steps.extract_sheet_info.call_vlm')
    @patch('steps.extract_sheet_info.load_page_image')
    def test_handles_image_load_failure(self, mock_load, mock_vlm):
        """Continues processing when image load fails."""
        from steps.extract_sheet_info import ExtractSheetInfo
        from PIL import Image
        import tempfile
        import os

        with tempfile.TemporaryDirectory() as tmpdir:
            img = Image.new('RGB', (100, 100))
            img.save(os.path.join(tmpdir, "page_001.png"))

            mock_load.return_value = None  # Simulate load failure

            step = ExtractSheetInfo()
            ctx = PipelineContext(
                assessment_id="test",
                agent_run_id="test",
                data={},
                metadata={"images_dir": tmpdir}
            )

            result = step.process(ctx)

            assert result.metadata["sheet_info"]["1"]["sheet_number"] is None
            assert "Could not load image" in result.metadata["sheet_info"]["1"]["error"]

    @patch('steps.extract_sheet_info.call_vlm')
    @patch('steps.extract_sheet_info.load_page_image')
    def test_handles_json_parse_failure(self, mock_load, mock_vlm):
        """Continues processing when JSON parsing fails."""
        from steps.extract_sheet_info import ExtractSheetInfo
        from PIL import Image
        import tempfile
        import os

        with tempfile.TemporaryDirectory() as tmpdir:
            img = Image.new('RGB', (100, 100))
            img.save(os.path.join(tmpdir, "page_001.png"))

            mock_load.return_value = Image.new('RGB', (100, 100))
            mock_vlm.return_value = {
                "status": "success",
                "text": "Invalid JSON response"
            }

            step = ExtractSheetInfo()
            ctx = PipelineContext(
                assessment_id="test",
                agent_run_id="test",
                data={},
                metadata={"images_dir": tmpdir}
            )

            result = step.process(ctx)

            assert result.metadata["sheet_info"]["1"]["sheet_number"] is None
            assert "error" in result.metadata["sheet_info"]["1"]

    @patch('steps.extract_sheet_info.call_vlm')
    @patch('steps.extract_sheet_info.load_page_image')
    def test_handles_null_sheet_info(self, mock_load, mock_vlm):
        """Handles pages with no title block found."""
        from steps.extract_sheet_info import ExtractSheetInfo
        from PIL import Image
        import tempfile
        import os

        with tempfile.TemporaryDirectory() as tmpdir:
            img = Image.new('RGB', (100, 100))
            img.save(os.path.join(tmpdir, "page_001.png"))

            mock_load.return_value = Image.new('RGB', (100, 100))
            mock_vlm.return_value = {
                "status": "success",
                "text": '{"sheet_number": null, "sheet_title": null, "confidence": "high"}'
            }

            step = ExtractSheetInfo()
            ctx = PipelineContext(
                assessment_id="test",
                agent_run_id="test",
                data={},
                metadata={"images_dir": tmpdir}
            )

            result = step.process(ctx)

            assert result.metadata["sheet_info"]["1"]["sheet_number"] is None
            assert result.metadata["sheet_info"]["1"]["sheet_title"] is None
            assert result.metadata["sheet_info"]["1"]["confidence"] == "high"
            # Still counts as success since VLM responded correctly
            assert result.metadata["sheet_info_success_count"] == 1


class TestExtractSheetInfoIntegration:
    """Integration tests for ExtractSheetInfo with pipeline."""

    @patch('steps.extract_sheet_info.call_vlm')
    @patch('steps.extract_sheet_info.load_page_image')
    def test_in_pipeline(self, mock_load, mock_vlm):
        """ExtractSheetInfo works correctly in a pipeline."""
        from steps.extract_sheet_info import ExtractSheetInfo
        from pipeline import Pipeline, CountSummary
        from PIL import Image
        import tempfile
        import os

        with tempfile.TemporaryDirectory() as tmpdir:
            # Create test images
            for i in range(1, 4):
                img = Image.new('RGB', (100, 100))
                img.save(os.path.join(tmpdir, f"page_{i:03d}.png"))

            mock_load.return_value = Image.new('RGB', (100, 100))
            mock_vlm.side_effect = [
                {"status": "success", "text": '{"sheet_number": "G0.00", "sheet_title": "COVER SHEET"}'},
                {"status": "success", "text": '{"sheet_number": "A1.01", "sheet_title": "FLOOR PLAN"}'},
                {"status": "success", "text": '{"sheet_number": "A1.02", "sheet_title": "ELEVATIONS"}'},
            ]

            pipeline = Pipeline([
                ExtractSheetInfo(),
                CountSummary(),
            ])

            ctx = PipelineContext(
                assessment_id="test",
                agent_run_id="test",
                data={},
                metadata={"images_dir": tmpdir}
            )

            result = pipeline.run(ctx)

            assert len(result.metadata["sheet_info"]) == 3
            assert result.metadata["sheet_info"]["1"]["sheet_number"] == "G0.00"
            assert result.metadata["sheet_info"]["2"]["sheet_number"] == "A1.01"
            assert result.metadata["sheet_info"]["3"]["sheet_number"] == "A1.02"
