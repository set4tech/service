"""
Unit tests for agent/steps/extract_element_tags.py
"""
import pytest
import asyncio
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock
from PIL import Image

# Add agent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline import PipelineContext


def run_async(coro):
    """Helper to run async code in sync tests."""
    return asyncio.run(coro)


class TestExtractTagsFromImageAsync:
    """Test extract_tags_from_image_async function."""

    def test_success_parses_json(self):
        """Successfully parses valid JSON response."""
        from steps.extract_element_tags import extract_tags_from_image_async

        mock_response = {
            "text": '{"tags_found": ["D-01", "W-1"], "tag_types": {"door_tags": ["D-01"], "window_tags": ["W-1"]}, "confidence": "high", "readable": true, "notes": ""}',
            "status": "success",
        }

        async def mock_vlm(*args, **kwargs):
            return mock_response

        with patch("steps.extract_element_tags.call_vlm_async_with_retry", side_effect=mock_vlm):
            image = Image.new("RGB", (100, 100))
            result = run_async(extract_tags_from_image_async(image, {}))

        assert result["status"] == "success"
        assert result["tags_found"] == ["D-01", "W-1"]
        assert result["tag_types"]["door_tags"] == ["D-01"]
        assert result["confidence"] == "high"

    def test_handles_markdown_code_blocks(self):
        """Strips markdown code blocks from response."""
        from steps.extract_element_tags import extract_tags_from_image_async

        mock_response = {
            "text": '```json\n{"tags_found": ["101"], "tag_types": {"room_numbers": ["101"]}, "confidence": "medium", "readable": true, "notes": ""}\n```',
            "status": "success",
        }

        async def mock_vlm(*args, **kwargs):
            return mock_response

        with patch("steps.extract_element_tags.call_vlm_async_with_retry", side_effect=mock_vlm):
            image = Image.new("RGB", (100, 100))
            result = run_async(extract_tags_from_image_async(image, {}))

        assert result["status"] == "success"
        assert result["tags_found"] == ["101"]

    def test_handles_vlm_error(self):
        """Returns error result when VLM fails."""
        from steps.extract_element_tags import extract_tags_from_image_async

        mock_response = {
            "text": "",
            "status": "error",
            "error": "API rate limit exceeded",
        }

        async def mock_vlm(*args, **kwargs):
            return mock_response

        with patch("steps.extract_element_tags.call_vlm_async_with_retry", side_effect=mock_vlm):
            image = Image.new("RGB", (100, 100))
            result = run_async(extract_tags_from_image_async(image, {}))

        assert result["status"] == "api_error"
        assert result["tags_found"] == []
        assert "API rate limit" in result["notes"]

    def test_handles_json_parse_error(self):
        """Returns error result when JSON parsing fails."""
        from steps.extract_element_tags import extract_tags_from_image_async

        mock_response = {
            "text": "This is not valid JSON",
            "status": "success",
        }

        async def mock_vlm(*args, **kwargs):
            return mock_response

        with patch("steps.extract_element_tags.call_vlm_async_with_retry", side_effect=mock_vlm):
            image = Image.new("RGB", (100, 100))
            result = run_async(extract_tags_from_image_async(image, {}))

        assert result["status"] == "json_error"
        assert result["tags_found"] == []
        assert "JSON" in result["notes"]

    def test_handles_exception(self):
        """Returns error result when exception occurs."""
        from steps.extract_element_tags import extract_tags_from_image_async

        async def mock_vlm(*args, **kwargs):
            raise Exception("Connection failed")

        with patch("steps.extract_element_tags.call_vlm_async_with_retry", side_effect=mock_vlm):
            image = Image.new("RGB", (100, 100))
            result = run_async(extract_tags_from_image_async(image, {}))

        assert result["status"] == "processing_error"
        assert result["tags_found"] == []


class TestExtractElementTagsStep:
    """Test ExtractElementTags pipeline step."""

    def test_step_name(self):
        """Step has correct name."""
        from steps.extract_element_tags import ExtractElementTags

        step = ExtractElementTags()
        assert step.name == "extract_element_tags"

    def test_handles_no_images_dir(self):
        """Returns empty list if no images_dir in metadata."""
        from steps.extract_element_tags import ExtractElementTags

        step = ExtractElementTags()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={}
        )

        result = run_async(step.process_async(ctx))

        assert result.metadata["extracted_element_tags"] == []

    def test_skips_non_target_classes(self):
        """Only processes target classes (default: 'image')."""
        from steps.extract_element_tags import ExtractElementTags

        step = ExtractElementTags()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [
                    {"class_name": "table", "confidence": 0.9, "bbox": [0, 0, 100, 100]},
                    {"class_name": "legend", "confidence": 0.9, "bbox": [0, 0, 100, 100]},
                ]
            },
            metadata={"images_dir": "/tmp/images"}
        )

        with patch("steps.extract_element_tags.load_page_image", return_value=Image.new("RGB", (1000, 1000))):
            result = run_async(step.process_async(ctx))

        # No detections processed since none are 'image' class
        assert result.metadata["extracted_element_tags"] == []

    def test_filters_low_confidence(self):
        """Filters detections below confidence threshold."""
        from steps.extract_element_tags import ExtractElementTags

        step = ExtractElementTags(min_confidence=0.5)
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [
                    {"class_name": "image", "confidence": 0.3, "bbox": [0, 0, 100, 100]},
                    {"class_name": "image", "confidence": 0.6, "bbox": [100, 100, 200, 200]},
                ]
            },
            metadata={"images_dir": "/tmp/images"}
        )

        mock_vlm_response = {
            "text": '{"tags_found": ["D-01"], "tag_types": {"door_tags": ["D-01"]}, "confidence": "high", "readable": true, "notes": ""}',
            "status": "success",
        }

        async def mock_vlm(*args, **kwargs):
            return mock_vlm_response

        with patch("steps.extract_element_tags.load_page_image", return_value=Image.new("RGB", (1000, 1000))):
            with patch("steps.extract_element_tags.call_vlm_async_with_retry", side_effect=mock_vlm):
                result = run_async(step.process_async(ctx))

        # Only one detection should be processed (confidence 0.6 >= 0.5)
        assert len(result.metadata["extracted_element_tags"]) == 1

    def test_skips_small_crops(self):
        """Skips crops that are too small."""
        from steps.extract_element_tags import ExtractElementTags

        step = ExtractElementTags(min_crop_size=50)
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [
                    {"class_name": "image", "confidence": 0.9, "bbox": [0, 0, 30, 30]},  # Too small
                ]
            },
            metadata={"images_dir": "/tmp/images"}
        )

        with patch("steps.extract_element_tags.load_page_image", return_value=Image.new("RGB", (1000, 1000))):
            result = run_async(step.process_async(ctx))

        # Detection should be processed but marked as skipped
        assert len(result.metadata["extracted_element_tags"]) == 1
        assert result.metadata["extracted_element_tags"][0]["extraction_result"]["status"] == "skipped_too_small"

    def test_processes_detections_successfully(self):
        """Successfully processes image detections."""
        from steps.extract_element_tags import ExtractElementTags

        step = ExtractElementTags()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [
                    {"class_name": "image", "confidence": 0.9, "bbox": [0, 0, 500, 500]},
                ]
            },
            metadata={"images_dir": "/tmp/images"}
        )

        mock_vlm_response = {
            "text": '{"tags_found": ["D-01", "W-1", "101"], "tag_types": {"door_tags": ["D-01"], "window_tags": ["W-1"], "room_numbers": ["101"]}, "confidence": "high", "readable": true, "notes": ""}',
            "status": "success",
        }

        async def mock_vlm(*args, **kwargs):
            return mock_vlm_response

        with patch("steps.extract_element_tags.load_page_image", return_value=Image.new("RGB", (1000, 1000))):
            with patch("steps.extract_element_tags.call_vlm_async_with_retry", side_effect=mock_vlm):
                result = run_async(step.process_async(ctx))

        assert len(result.metadata["extracted_element_tags"]) == 1
        extraction = result.metadata["extracted_element_tags"][0]
        assert extraction["page"] == "page_001.png"
        assert extraction["extraction_result"]["tags_found"] == ["D-01", "W-1", "101"]

    def test_builds_summary(self):
        """Builds correct summary of extracted tags."""
        from steps.extract_element_tags import ExtractElementTags

        step = ExtractElementTags()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [
                    {"class_name": "image", "confidence": 0.9, "bbox": [0, 0, 500, 500]},
                ],
                "page_002.png": [
                    {"class_name": "image", "confidence": 0.9, "bbox": [0, 0, 500, 500]},
                ]
            },
            metadata={"images_dir": "/tmp/images"}
        )

        responses = [
            {"text": '{"tags_found": ["D-01"], "tag_types": {"door_tags": ["D-01"]}, "confidence": "high", "readable": true, "notes": ""}', "status": "success"},
            {"text": '{"tags_found": ["D-02", "W-1"], "tag_types": {"door_tags": ["D-02"], "window_tags": ["W-1"]}, "confidence": "high", "readable": true, "notes": ""}', "status": "success"},
        ]
        response_iter = iter(responses)

        async def mock_vlm(*args, **kwargs):
            return next(response_iter)

        with patch("steps.extract_element_tags.load_page_image", return_value=Image.new("RGB", (1000, 1000))):
            with patch("steps.extract_element_tags.call_vlm_async_with_retry", side_effect=mock_vlm):
                result = run_async(step.process_async(ctx))

        summary = result.metadata["element_tags_summary"]
        assert summary["total_detections_processed"] == 2
        assert summary["detections_with_tags"] == 2
        assert summary["unique_tags_found"] == 3
        assert set(summary["all_unique_tags"]) == {"D-01", "D-02", "W-1"}

    def test_handles_grouped_data_format(self):
        """Handles data in grouped format (from GroupByClass step)."""
        from steps.extract_element_tags import ExtractElementTags

        step = ExtractElementTags()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": {
                    "detections": [
                        {"class_name": "image", "confidence": 0.9, "bbox": [0, 0, 500, 500]},
                    ],
                    "by_class": {"image": [{"class_name": "image", "confidence": 0.9, "bbox": [0, 0, 500, 500]}]}
                }
            },
            metadata={"images_dir": "/tmp/images"}
        )

        mock_vlm_response = {
            "text": '{"tags_found": ["101"], "tag_types": {"room_numbers": ["101"]}, "confidence": "high", "readable": true, "notes": ""}',
            "status": "success",
        }

        async def mock_vlm(*args, **kwargs):
            return mock_vlm_response

        with patch("steps.extract_element_tags.load_page_image", return_value=Image.new("RGB", (1000, 1000))):
            with patch("steps.extract_element_tags.call_vlm_async_with_retry", side_effect=mock_vlm):
                result = run_async(step.process_async(ctx))

        assert len(result.metadata["extracted_element_tags"]) == 1

    def test_custom_target_classes(self):
        """Allows specifying custom target classes."""
        from steps.extract_element_tags import ExtractElementTags

        step = ExtractElementTags(target_classes=["floorplan", "elevation"])
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [
                    {"class_name": "floorplan", "confidence": 0.9, "bbox": [0, 0, 500, 500]},
                    {"class_name": "image", "confidence": 0.9, "bbox": [100, 100, 600, 600]},  # Should be skipped
                ]
            },
            metadata={"images_dir": "/tmp/images"}
        )

        mock_vlm_response = {
            "text": '{"tags_found": ["D-01"], "tag_types": {"door_tags": ["D-01"]}, "confidence": "high", "readable": true, "notes": ""}',
            "status": "success",
        }

        async def mock_vlm(*args, **kwargs):
            return mock_vlm_response

        with patch("steps.extract_element_tags.load_page_image", return_value=Image.new("RGB", (1000, 1000))):
            with patch("steps.extract_element_tags.call_vlm_async_with_retry", side_effect=mock_vlm):
                result = run_async(step.process_async(ctx))

        # Only floorplan detection should be processed
        assert len(result.metadata["extracted_element_tags"]) == 1
        assert result.metadata["extracted_element_tags"][0]["class_name"] == "floorplan"


class TestExtractElementTagsIntegration:
    """Integration tests for ExtractElementTags with pipeline."""

    def test_in_pipeline(self):
        """ExtractElementTags works correctly in a pipeline."""
        from steps.extract_element_tags import ExtractElementTags
        from pipeline import Pipeline, CountSummary

        pipeline = Pipeline([
            ExtractElementTags(),
            CountSummary(),
        ])

        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [
                    {"class_name": "image", "confidence": 0.9, "bbox": [0, 0, 500, 500]},
                ]
            },
            metadata={"images_dir": "/tmp/images"}
        )

        mock_vlm_response = {
            "text": '{"tags_found": ["D-01"], "tag_types": {"door_tags": ["D-01"]}, "confidence": "high", "readable": true, "notes": ""}',
            "status": "success",
        }

        async def mock_vlm(*args, **kwargs):
            return mock_vlm_response

        with patch("steps.extract_element_tags.load_page_image", return_value=Image.new("RGB", (1000, 1000))):
            with patch("steps.extract_element_tags.call_vlm_async_with_retry", side_effect=mock_vlm):
                result = pipeline.run(ctx)

        assert "extracted_element_tags" in result.metadata
        assert "element_tags_summary" in result.metadata

    def test_runs_after_extract_legends(self):
        """ExtractElementTags can be placed after ExtractLegends in pipeline."""
        from steps.extract_element_tags import ExtractElementTags
        from steps.extract_legends import ExtractLegends
        from pipeline import Pipeline

        pipeline = Pipeline([
            ExtractLegends(),
            ExtractElementTags(),
        ])

        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={"extracted_tables": []}
        )

        result = pipeline.run(ctx)

        # Both steps should have run
        assert "extracted_legends" in result.metadata
        assert "extracted_element_tags" in result.metadata
