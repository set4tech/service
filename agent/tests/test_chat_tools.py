"""
Unit tests for agent/chat_tools.py
"""
import pytest
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch
import tempfile

# Add agent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from chat_tools import DocumentNavigator, ChatToolExecutor, CHAT_TOOLS


# =============================================================================
# Test Data
# =============================================================================

SAMPLE_UNIFIED_JSON = {
    "metadata": {"total_pages": 3},
    "project_info": {
        "project_name": "Test Building",
        "project_address": "123 Test St",
        "building_area": "10000",
        "num_stories": 2,
        "construction_type": "Type V-B",
        "occupancy_classification": "B",
    },
    "pages": {
        "1": {
            "sheet_number": "T-1",
            "sheet_title": "Cover Sheet",
            "page_text": {"raw": "Project: Test Building\nType V-B Construction\n2 Stories"},
            "sections": [],
        },
        "2": {
            "sheet_number": "A1.0",
            "sheet_title": "Floor Plan",
            "page_text": {"raw": "Floor plan showing doors D-01, D-02\nFire sprinkler system"},
            "sections": [
                {
                    "section_type": "table",
                    "table_data": {
                        "table_type": "door_schedule",
                        "headers": {"normalized": ["mark", "width", "height", "type"]},
                        "row_count": 2,
                        "rows": [
                            {"mark": "D-01", "width": "36", "height": "84", "type": "wood"},
                            {"mark": "D-02", "width": "36", "height": "84", "type": "hollow metal"},
                        ],
                        "semantic_summary": "Door schedule with 2 doors",
                    },
                }
            ],
        },
        "3": {
            "sheet_number": "A2.0",
            "sheet_title": "Finish Schedule",
            "page_text": {"raw": "Room finish schedule"},
            "sections": [
                {
                    "section_type": "table",
                    "table_data": {
                        "table_type": "room_finish_schedule",
                        "headers": {"normalized": ["name", "area", "occupancy_group"]},
                        "row_count": 3,
                        "rows": [
                            {"name": "Office 101", "area": "200", "occupancy_group": "B"},
                            {"name": "Conference Room", "area": "400", "occupancy_group": "A-3"},
                            {"name": "Storage", "area": "100", "occupancy_group": "S-1"},
                        ],
                    },
                }
            ],
        },
    },
}


# =============================================================================
# Test CHAT_TOOLS Definition
# =============================================================================

class TestChatToolsDefinition:
    """Test that CHAT_TOOLS are properly defined."""

    def test_tools_list_has_eight_tools(self):
        """Should have exactly 8 tools defined."""
        assert len(CHAT_TOOLS) == 8

    def test_tool_names_are_correct(self):
        """Each tool should have expected name."""
        expected_names = [
            "find_schedules",
            "search_drawings",
            "get_room_list",
            "get_project_info",
            "get_sheet_list",
            "read_sheet_details",
            "get_keynotes",
            "view_sheet_image",
        ]
        actual_names = [t["name"] for t in CHAT_TOOLS]
        assert actual_names == expected_names

    def test_each_tool_has_required_fields(self):
        """Each tool should have name, description, and input_schema."""
        for tool in CHAT_TOOLS:
            assert "name" in tool
            assert "description" in tool
            assert "input_schema" in tool
            assert tool["input_schema"]["type"] == "object"


# =============================================================================
# Test DocumentNavigator
# =============================================================================

class TestDocumentNavigator:
    """Test DocumentNavigator class."""

    def test_init_loads_pages(self):
        """Navigator should load pages from unified JSON."""
        nav = DocumentNavigator(SAMPLE_UNIFIED_JSON)
        assert len(nav.pages) == 3
        assert nav.metadata["total_pages"] == 3

    def test_find_schedules_all(self):
        """find_schedules should return all schedules."""
        nav = DocumentNavigator(SAMPLE_UNIFIED_JSON)
        schedules = nav.find_schedules()
        assert len(schedules) == 2  # door and room schedules

    def test_find_schedules_by_type_door(self):
        """find_schedules should filter by type."""
        nav = DocumentNavigator(SAMPLE_UNIFIED_JSON)
        schedules = nav.find_schedules("door")
        assert len(schedules) == 1
        assert schedules[0]["type"] == "door_schedule"

    def test_find_schedules_by_type_room(self):
        """find_schedules should find room schedules."""
        nav = DocumentNavigator(SAMPLE_UNIFIED_JSON)
        schedules = nav.find_schedules("room")
        assert len(schedules) == 1
        assert "room" in schedules[0]["type"].lower()


# =============================================================================
# Test ChatToolExecutor
# =============================================================================

class TestChatToolExecutor:
    """Test ChatToolExecutor class."""

    @pytest.fixture
    def executor(self):
        """Create executor with sample data."""
        nav = DocumentNavigator(SAMPLE_UNIFIED_JSON)
        return ChatToolExecutor(nav)

    def test_find_schedules_returns_list(self, executor):
        """find_schedules tool should return schedule list."""
        result = executor.execute("find_schedules", {"schedule_type": "all"})
        data = json.loads(result["result"]) if isinstance(result["result"], str) else result["result"]
        assert isinstance(data, list)

    def test_search_drawings_finds_keywords(self, executor):
        """search_drawings should find keywords in text."""
        result = executor.execute("search_drawings", {"keywords": ["sprinkler"]})
        data = result["result"]
        assert "keyword_hits" in data
        assert "sprinkler" in data["keyword_hits"]
        assert len(data["keyword_hits"]["sprinkler"]) > 0

    def test_search_drawings_case_insensitive(self, executor):
        """search_drawings should be case-insensitive."""
        result = executor.execute("search_drawings", {"keywords": ["SPRINKLER"]})
        data = result["result"]
        assert len(data["keyword_hits"]["SPRINKLER"]) > 0

    def test_get_room_list_returns_rooms(self, executor):
        """get_room_list should return rooms from finish schedules."""
        result = executor.execute("get_room_list", {})
        data = result["result"]
        assert "rooms" in data
        assert data["count"] == 3  # 3 rooms in sample data

    def test_get_project_info_returns_metadata(self, executor):
        """get_project_info should return project metadata."""
        result = executor.execute("get_project_info", {})
        data = result["result"]
        assert data["project_name"] == "Test Building"
        assert data["construction_type"] == "Type V-B"
        assert data["num_stories"] == 2

    def test_get_sheet_list_returns_all_sheets(self, executor):
        """get_sheet_list should return all sheets."""
        result = executor.execute("get_sheet_list", {})
        data = result["result"]
        assert len(data) == 3
        sheet_numbers = [s["sheet_number"] for s in data]
        assert "T-1" in sheet_numbers
        assert "A1.0" in sheet_numbers

    def test_read_sheet_details_by_number(self, executor):
        """read_sheet_details should find sheet by sheet number."""
        result = executor.execute("read_sheet_details", {"sheet_identifier": "A1.0"})
        data = result["result"]
        assert data["sheet_number"] == "A1.0"
        assert data["sheet_title"] == "Floor Plan"

    def test_read_sheet_details_by_page_index(self, executor):
        """read_sheet_details should find sheet by page index."""
        result = executor.execute("read_sheet_details", {"sheet_identifier": "1"})
        data = result["result"]
        assert data["sheet_number"] == "T-1"

    def test_read_sheet_details_not_found(self, executor):
        """read_sheet_details should return error for unknown sheet."""
        result = executor.execute("read_sheet_details", {"sheet_identifier": "X99"})
        data = result["result"]
        assert "error" in data

    def test_get_keynotes_returns_dict(self, executor):
        """get_keynotes should return keynotes structure."""
        result = executor.execute("get_keynotes", {})
        data = result["result"]
        assert "keynotes" in data
        assert "general_notes" in data

    def test_view_sheet_image_without_images_dir(self, executor):
        """view_sheet_image should error without images_dir."""
        result = executor.execute("view_sheet_image", {"sheet_identifier": "A1.0"})
        data = result["result"]
        assert "error" in data
        assert "not configured" in data["error"]

    def test_view_sheet_image_with_images_dir(self):
        """view_sheet_image should return image data when images exist."""
        # Create temp directory with a test image
        with tempfile.TemporaryDirectory() as tmpdir:
            images_dir = Path(tmpdir)

            # Create a minimal PNG file (1x1 pixel)
            test_image = images_dir / "page_002.png"
            # Minimal valid PNG: 8-byte signature + IHDR + IDAT + IEND
            png_data = (
                b'\x89PNG\r\n\x1a\n'  # PNG signature
                b'\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde'
                b'\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N'
                b'\x00\x00\x00\x00IEND\xaeB`\x82'
            )
            test_image.write_bytes(png_data)

            nav = DocumentNavigator(SAMPLE_UNIFIED_JSON)
            executor = ChatToolExecutor(nav, images_dir)

            result = executor.execute("view_sheet_image", {"sheet_identifier": "2"})

            assert "image" in result
            assert result["image"]["media_type"] == "image/png"
            assert "data" in result["image"]  # Base64 data

    def test_unknown_tool_returns_error(self, executor):
        """Unknown tool name should return error."""
        result = executor.execute("unknown_tool", {})
        data = result["result"]
        assert "error" in data
        assert "Unknown tool" in data["error"]


# =============================================================================
# Test Text Index Building
# =============================================================================

class TestTextIndexBuilding:
    """Test the text index for keyword searching."""

    def test_text_index_includes_page_text(self):
        """Text index should include raw page text."""
        nav = DocumentNavigator(SAMPLE_UNIFIED_JSON)
        executor = ChatToolExecutor(nav)

        # Page 2 has "sprinkler" in page_text
        assert "sprinkler" in executor.text_index["2"]

    def test_text_index_is_lowercase(self):
        """Text index should be lowercase for case-insensitive search."""
        nav = DocumentNavigator(SAMPLE_UNIFIED_JSON)
        executor = ChatToolExecutor(nav)

        # Check that text is lowercased
        for page_num, text in executor.text_index.items():
            assert text == text.lower()
