"""
Tests for the UnifyAndUpload pipeline step.
"""
import json
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

import pytest

from steps.unify_and_upload import UnifyAndUpload, extract_page_number
from pipeline import PipelineContext


class TestExtractPageNumber:
    """Tests for extract_page_number function."""

    def test_page_underscore_format(self):
        """Should extract number from page_001.png format."""
        assert extract_page_number("page_001.png") == "1"
        assert extract_page_number("page_010.png") == "10"
        assert extract_page_number("page_100.png") == "100"

    def test_page_no_underscore(self):
        """Should extract number from page001.png format."""
        assert extract_page_number("page001.png") == "1"
        assert extract_page_number("page99.png") == "99"

    def test_prefix_with_page(self):
        """Should extract number with prefix."""
        assert extract_page_number("achieve_page_1.png") == "1"
        assert extract_page_number("drawing_page_05.png") == "5"

    def test_fallback_to_stem(self):
        """Should fall back to filename stem if no page number found."""
        assert extract_page_number("cover.png") == "cover"
        assert extract_page_number("index.png") == "index"


class TestUnifyAndUploadInit:
    """Tests for UnifyAndUpload initialization."""

    def test_has_name(self):
        """Step should have correct name."""
        step = UnifyAndUpload()
        assert step.name == "unify_and_upload"


class TestBboxesMatch:
    """Tests for _bboxes_match helper."""

    def test_matching_bboxes(self):
        """Identical bboxes should match."""
        step = UnifyAndUpload()
        bbox = [100, 100, 200, 200]
        assert step._bboxes_match(bbox, bbox) is True

    def test_overlapping_bboxes(self):
        """Overlapping bboxes with high IoU should match."""
        step = UnifyAndUpload()
        bbox1 = [100, 100, 200, 200]
        bbox2 = [105, 105, 205, 205]  # Slight offset
        assert step._bboxes_match(bbox1, bbox2) is True

    def test_non_overlapping_bboxes(self):
        """Non-overlapping bboxes should not match."""
        step = UnifyAndUpload()
        bbox1 = [100, 100, 200, 200]
        bbox2 = [300, 300, 400, 400]  # No overlap
        assert step._bboxes_match(bbox1, bbox2) is False

    def test_string_bbox_format(self):
        """Should handle string bbox format."""
        step = UnifyAndUpload()
        bbox1 = [100, 100, 200, 200]
        bbox2 = "100,100,200,200"
        assert step._bboxes_match(bbox1, bbox2) is True

    def test_none_bbox(self):
        """Should return False for None bboxes."""
        step = UnifyAndUpload()
        assert step._bboxes_match(None, [100, 100, 200, 200]) is False
        assert step._bboxes_match([100, 100, 200, 200], None) is False
        assert step._bboxes_match(None, None) is False


class TestBuildUnifiedDocument:
    """Tests for _build_unified_document method."""

    def test_builds_pages_dict(self):
        """Should build pages dict from ctx.data."""
        step = UnifyAndUpload()

        ctx = PipelineContext(
            assessment_id="test-123",
            agent_run_id="run-456",
            data={
                "page_001.png": {
                    "detections": [
                        {"class_name": "table", "bbox": [0, 0, 100, 100], "confidence": 0.9}
                    ],
                    "by_class": {"table": [{"class_name": "table", "bbox": [0, 0, 100, 100]}]}
                }
            },
            metadata={
                "sheet_info": {
                    "1": {
                        "page_file": "page_001.png",
                        "sheet_number": "A1.01",
                        "sheet_title": "FLOOR PLAN"
                    }
                },
                "extracted_text": {
                    "1": {"raw": "Test text", "cleaned": "Clean text"}
                }
            }
        )

        unified = step._build_unified_document(ctx)

        assert "pages" in unified
        assert "1" in unified["pages"]
        page = unified["pages"]["1"]
        assert page["sheet_number"] == "A1.01"
        assert page["sheet_title"] == "FLOOR PLAN"
        assert page["page_file"] == "page_001.png"

    def test_includes_project_info(self):
        """Should include project_info from metadata."""
        step = UnifyAndUpload()

        ctx = PipelineContext(
            assessment_id="test-123",
            agent_run_id="run-456",
            data={"page_001.png": []},
            metadata={
                "project_info": {
                    "project_name": "Test Project",
                    "construction_type": "Type V-B"
                }
            }
        )

        unified = step._build_unified_document(ctx)

        assert "project_info" in unified
        assert unified["project_info"]["project_name"] == "Test Project"

    def test_includes_metadata(self):
        """Should include metadata with assessment_id and timestamp."""
        step = UnifyAndUpload()

        ctx = PipelineContext(
            assessment_id="test-123",
            agent_run_id="run-456",
            data={"page_001.png": []},
            metadata={}
        )

        unified = step._build_unified_document(ctx)

        assert "metadata" in unified
        assert unified["metadata"]["assessment_id"] == "test-123"
        assert "generated_at" in unified["metadata"]


class TestProcess:
    """Tests for the process method."""

    def test_stores_unified_in_metadata_no_images(self):
        """Should store unified document in metadata even without images."""
        step = UnifyAndUpload()

        ctx = PipelineContext(
            assessment_id="test-123",
            agent_run_id="run-456",
            data={"page_001.png": []},
            metadata={}
        )

        result = step.process(ctx)

        # Verify unified_document is set in metadata (for caller to save to DB)
        assert "unified_document" in result.metadata
        assert "pages" in result.metadata["unified_document"]

    @patch("steps.unify_and_upload.get_s3")
    def test_uploads_images_to_s3(self, mock_get_s3):
        """Should upload page images to S3."""
        mock_s3 = Mock()
        mock_get_s3.return_value = mock_s3

        with tempfile.TemporaryDirectory() as tmpdir:
            # Create test images
            images_dir = Path(tmpdir)
            (images_dir / "page_001.png").write_text("fake image")
            (images_dir / "page_002.png").write_text("fake image")

            step = UnifyAndUpload()

            ctx = PipelineContext(
                assessment_id="test-123",
                agent_run_id="run-456",
                data={"page_001.png": [], "page_002.png": []},
                metadata={"images_dir": str(images_dir)}
            )

            step.process(ctx)

            # Verify images were uploaded (but NOT the unified JSON)
            assert mock_s3.upload_file.call_count == 2
            # Verify put_object was NOT called (no JSON upload to S3)
            mock_s3.put_object.assert_not_called()

    @patch("steps.unify_and_upload.get_s3")
    def test_stores_unified_in_metadata(self, mock_get_s3):
        """Should store unified document in metadata for DB storage."""
        mock_s3 = Mock()
        mock_get_s3.return_value = mock_s3

        step = UnifyAndUpload()

        ctx = PipelineContext(
            assessment_id="test-123",
            agent_run_id="run-456",
            data={"page_001.png": []},
            metadata={
                "project_info": {
                    "project_name": "Test Project",
                    "building_area": 5000,
                    "occupancy_classification": "B"
                }
            }
        )

        result = step.process(ctx)

        # Unified document should be in metadata (for caller to save to DB)
        assert "unified_document" in result.metadata
        assert "pages" in result.metadata["unified_document"]
        assert "project_info" in result.metadata["unified_document"]
        assert result.metadata["unified_document"]["project_info"]["project_name"] == "Test Project"

        # No unified_json_s3_key should be set (we no longer upload to S3)
        assert "unified_json_s3_key" not in result.metadata
