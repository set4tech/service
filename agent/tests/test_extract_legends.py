"""
Unit tests for agent/steps/extract_legends.py
"""
import pytest
import sys
from pathlib import Path

# Add agent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline import PipelineContext


class TestIsLegend:
    """Test is_legend function."""

    def test_detects_legend_by_detection_class(self):
        """Identifies legend by YOLO detection class."""
        from steps.extract_legends import is_legend

        table = {"detection_class": "legend", "table_type": "Unknown"}
        assert is_legend(table) is True

    def test_detects_legend_by_table_type_legend(self):
        """Identifies legend by table_type containing 'legend'."""
        from steps.extract_legends import is_legend

        table = {"table_type": "Material Legend"}
        assert is_legend(table) is True

    def test_detects_legend_by_table_type_key_notes(self):
        """Identifies legend by table_type containing 'key notes'."""
        from steps.extract_legends import is_legend

        table = {"table_type": "Key Notes"}
        assert is_legend(table) is True

    def test_detects_legend_by_table_type_symbol(self):
        """Identifies legend by table_type containing 'symbol'."""
        from steps.extract_legends import is_legend

        table = {"table_type": "Symbol Legend"}
        assert is_legend(table) is True

    def test_detects_legend_by_table_type_abbreviation(self):
        """Identifies legend by table_type containing 'abbreviation'."""
        from steps.extract_legends import is_legend

        table = {"table_type": "Abbreviations"}
        assert is_legend(table) is True

    def test_rejects_non_legend_table(self):
        """Rejects tables that are not legends."""
        from steps.extract_legends import is_legend

        table = {"table_type": "Door Schedule"}
        assert is_legend(table) is False

    def test_rejects_empty_table_type(self):
        """Rejects tables with empty table_type."""
        from steps.extract_legends import is_legend

        table = {"table_type": ""}
        assert is_legend(table) is False

    def test_case_insensitive(self):
        """Detection is case insensitive."""
        from steps.extract_legends import is_legend

        assert is_legend({"table_type": "MATERIAL LEGEND"}) is True
        assert is_legend({"table_type": "material legend"}) is True
        assert is_legend({"detection_class": "LEGEND"}) is True


class TestFindColumn:
    """Test find_column function."""

    def test_finds_exact_match(self):
        """Finds exact column name match."""
        from steps.extract_legends import find_column

        headers = ["symbol", "description", "notes"]
        assert find_column(headers, ["symbol"]) == "symbol"

    def test_finds_partial_match(self):
        """Finds column containing candidate string."""
        from steps.extract_legends import find_column

        headers = ["symbol_code", "full_description"]
        assert find_column(headers, ["symbol"]) == "symbol_code"
        assert find_column(headers, ["description"]) == "full_description"

    def test_returns_none_when_not_found(self):
        """Returns None when no match found."""
        from steps.extract_legends import find_column

        headers = ["column1", "column2"]
        assert find_column(headers, ["symbol", "code"]) is None

    def test_case_insensitive(self):
        """Match is case insensitive."""
        from steps.extract_legends import find_column

        headers = ["SYMBOL", "Description"]
        assert find_column(headers, ["symbol"]) == "SYMBOL"


class TestCategorizeLegend:
    """Test categorize_legend function."""

    def test_categorizes_material(self):
        """Categorizes material legends."""
        from steps.extract_legends import categorize_legend

        assert categorize_legend("Material Legend") == "material"
        assert categorize_legend("Finish Legend") == "material"

    def test_categorizes_demolition(self):
        """Categorizes demolition legends."""
        from steps.extract_legends import categorize_legend

        assert categorize_legend("Demolition Legend") == "demolition"
        assert categorize_legend("Demo Notes") == "demolition"

    def test_categorizes_new_work(self):
        """Categorizes new work legends."""
        from steps.extract_legends import categorize_legend

        assert categorize_legend("New Work Legend") == "new_work"
        assert categorize_legend("Proposed Construction") == "new_work"

    def test_categorizes_symbol(self):
        """Categorizes symbol legends."""
        from steps.extract_legends import categorize_legend

        assert categorize_legend("Symbol Legend") == "symbol"

    def test_categorizes_abbreviation(self):
        """Categorizes abbreviation legends."""
        from steps.extract_legends import categorize_legend

        assert categorize_legend("Abbreviations") == "abbreviation"

    def test_categorizes_keynote(self):
        """Categorizes keynote legends."""
        from steps.extract_legends import categorize_legend

        assert categorize_legend("Key Notes") == "keynote"
        assert categorize_legend("Keynote Legend") == "keynote"

    def test_defaults_to_general(self):
        """Defaults to 'general' for unknown types."""
        from steps.extract_legends import categorize_legend

        assert categorize_legend("Unknown Type") == "general"
        assert categorize_legend("") == "general"
        assert categorize_legend(None) == "general"


class TestRestructureAsLegend:
    """Test restructure_as_legend function."""

    def test_restructures_basic_legend(self):
        """Restructures a basic legend with symbol/description columns."""
        from steps.extract_legends import restructure_as_legend

        table = {
            "page": "page_001.png",
            "bbox": [100, 200, 500, 800],
            "confidence": 0.92,
            "table_type": "Material Legend",
            "headers": ["Symbol", "Description"],
            "headers_normalized": ["symbol", "description"],
            "rows": [
                {"symbol": "CM", "description": "Ceramic Mosaic Tile"},
                {"symbol": "GWB", "description": "Gypsum Wall Board"},
            ],
        }

        result = restructure_as_legend(table)

        assert result["page"] == "page_001.png"
        assert result["bbox"] == [100, 200, 500, 800]
        assert result["confidence"] == 0.92
        assert result["legend_type"] == "Material Legend"
        assert result["category"] == "material"
        assert result["status"] == "success"
        assert result["entry_count"] == 2
        assert len(result["entries"]) == 2
        assert result["entries"][0]["symbol"] == "CM"
        assert result["entries"][0]["meaning"] == "Ceramic Mosaic Tile"
        assert result["entries"][0]["category"] == "material"

    def test_uses_fallback_columns(self):
        """Uses first two columns as fallback when no matching headers."""
        from steps.extract_legends import restructure_as_legend

        table = {
            "page": "page_001.png",
            "bbox": [100, 200, 500, 800],
            "confidence": 0.85,
            "table_type": "Legend",
            "headers": ["Col A", "Col B"],
            "headers_normalized": ["col_a", "col_b"],
            "rows": [
                {"col_a": "X", "col_b": "Exit"},
                {"col_a": "Y", "col_b": "Yield"},
            ],
        }

        result = restructure_as_legend(table)

        assert result["entry_count"] == 2
        assert result["entries"][0]["symbol"] == "X"
        assert result["entries"][0]["meaning"] == "Exit"

    def test_handles_empty_rows(self):
        """Handles tables with no rows."""
        from steps.extract_legends import restructure_as_legend

        table = {
            "page": "page_001.png",
            "bbox": [100, 200, 500, 800],
            "confidence": 0.85,
            "table_type": "Legend",
            "headers": ["Symbol", "Description"],
            "headers_normalized": ["symbol", "description"],
            "rows": [],
        }

        result = restructure_as_legend(table)

        assert result["status"] == "no_entries"
        assert result["entry_count"] == 0
        assert result["entries"] == []

    def test_handles_dict_values(self):
        """Handles complex dict values in cells (from parse_cell)."""
        from steps.extract_legends import restructure_as_legend

        table = {
            "page": "page_001.png",
            "bbox": [100, 200, 500, 800],
            "confidence": 0.85,
            "table_type": "Legend",
            "headers": ["Code", "Description"],
            "headers_normalized": ["code", "description"],
            "rows": [
                {
                    "code": {"value": 1, "unit": "inches", "display": "1\""},
                    "description": "One Inch",
                },
            ],
        }

        result = restructure_as_legend(table)

        assert result["entries"][0]["symbol"] == "1\""

    def test_skips_rows_without_values(self):
        """Skips rows where both symbol and meaning are None."""
        from steps.extract_legends import restructure_as_legend

        table = {
            "page": "page_001.png",
            "bbox": [100, 200, 500, 800],
            "confidence": 0.85,
            "table_type": "Legend",
            "headers": ["Symbol", "Description"],
            "headers_normalized": ["symbol", "description"],
            "rows": [
                {"symbol": "A", "description": "Valid"},
                {"symbol": None, "description": None},
                {"symbol": "", "description": ""},
            ],
        }

        result = restructure_as_legend(table)

        # Only the first row should be included
        assert result["entry_count"] == 1

    def test_handles_partial_values(self):
        """Includes rows with only symbol or only meaning."""
        from steps.extract_legends import restructure_as_legend

        table = {
            "page": "page_001.png",
            "bbox": [100, 200, 500, 800],
            "confidence": 0.85,
            "table_type": "Legend",
            "headers": ["Symbol", "Description"],
            "headers_normalized": ["symbol", "description"],
            "rows": [
                {"symbol": "A", "description": None},
                {"symbol": None, "description": "Something"},
            ],
        }

        result = restructure_as_legend(table)

        assert result["entry_count"] == 2
        assert result["entries"][0]["symbol"] == "A"
        assert result["entries"][0]["meaning"] is None
        assert result["entries"][1]["symbol"] is None
        assert result["entries"][1]["meaning"] == "Something"


class TestExtractLegendsStep:
    """Test ExtractLegends pipeline step."""

    def test_step_name(self):
        """Step has correct name."""
        from steps.extract_legends import ExtractLegends

        step = ExtractLegends()
        assert step.name == "extract_legends"

    def test_handles_no_tables(self):
        """Returns empty list if no tables in metadata."""
        from steps.extract_legends import ExtractLegends

        step = ExtractLegends()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={}
        )

        result = step.process(ctx)

        assert result.metadata["extracted_legends"] == []
        assert result.metadata["legends_extracted"] == 0

    def test_handles_empty_tables_list(self):
        """Returns empty list if extracted_tables is empty."""
        from steps.extract_legends import ExtractLegends

        step = ExtractLegends()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={"extracted_tables": []}
        )

        result = step.process(ctx)

        assert result.metadata["extracted_legends"] == []
        assert result.metadata["legends_extracted"] == 0

    def test_filters_non_legend_tables(self):
        """Only processes legend-type tables."""
        from steps.extract_legends import ExtractLegends

        step = ExtractLegends()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={
                "extracted_tables": [
                    {
                        "page": "page_001.png",
                        "table_type": "Door Schedule",
                        "headers_normalized": ["door", "size"],
                        "rows": [{"door": "D1", "size": "3'"}],
                    },
                    {
                        "page": "page_002.png",
                        "table_type": "Material Legend",
                        "headers_normalized": ["symbol", "description"],
                        "rows": [{"symbol": "A", "description": "Test"}],
                    },
                ]
            }
        )

        result = step.process(ctx)

        assert len(result.metadata["extracted_legends"]) == 1
        assert result.metadata["extracted_legends"][0]["legend_type"] == "Material Legend"
        assert result.metadata["legends_extracted"] == 1

    def test_processes_multiple_legends(self):
        """Processes all legend tables."""
        from steps.extract_legends import ExtractLegends

        step = ExtractLegends()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={
                "extracted_tables": [
                    {
                        "page": "page_001.png",
                        "table_type": "Material Legend",
                        "headers_normalized": ["symbol", "description"],
                        "rows": [{"symbol": "A", "description": "Test1"}],
                    },
                    {
                        "page": "page_002.png",
                        "table_type": "Key Notes",
                        "headers_normalized": ["key", "note"],
                        "rows": [{"key": "1", "note": "Note1"}],
                    },
                ]
            }
        )

        result = step.process(ctx)

        assert len(result.metadata["extracted_legends"]) == 2
        assert result.metadata["legends_extracted"] == 2

    def test_preserves_table_metadata(self):
        """Preserves page, bbox, confidence from source table."""
        from steps.extract_legends import ExtractLegends

        step = ExtractLegends()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={
                "extracted_tables": [
                    {
                        "page": "page_003.png",
                        "bbox": [10, 20, 30, 40],
                        "confidence": 0.95,
                        "table_type": "Legend",
                        "headers_normalized": ["symbol", "meaning"],
                        "rows": [{"symbol": "X", "meaning": "Test"}],
                    },
                ]
            }
        )

        result = step.process(ctx)

        legend = result.metadata["extracted_legends"][0]
        assert legend["page"] == "page_003.png"
        assert legend["bbox"] == [10, 20, 30, 40]
        assert legend["confidence"] == 0.95


class TestExtractLegendsIntegration:
    """Integration tests for ExtractLegends with pipeline."""

    def test_in_pipeline(self):
        """ExtractLegends works correctly in a pipeline."""
        from steps.extract_legends import ExtractLegends
        from pipeline import Pipeline, CountSummary

        pipeline = Pipeline([
            ExtractLegends(),
            CountSummary(),
        ])

        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={
                "extracted_tables": [
                    {
                        "page": "page_001.png",
                        "table_type": "Material Legend",
                        "headers_normalized": ["symbol", "description"],
                        "rows": [
                            {"symbol": "CM", "description": "Ceramic Mosaic"},
                            {"symbol": "GWB", "description": "Gypsum Board"},
                        ],
                    },
                    {
                        "page": "page_002.png",
                        "table_type": "Door Schedule",  # Not a legend
                        "headers_normalized": ["door", "width"],
                        "rows": [{"door": "D1", "width": "36"}],
                    },
                ]
            }
        )

        result = pipeline.run(ctx)

        assert len(result.metadata["extracted_legends"]) == 1
        assert result.metadata["legends_extracted"] == 1
        assert result.metadata["extracted_legends"][0]["entry_count"] == 2

    def test_runs_after_extract_tables(self):
        """ExtractLegends can be placed after ExtractTables in pipeline."""
        from steps.extract_legends import ExtractLegends
        from steps.extract_tables import ExtractTables
        from pipeline import Pipeline

        # This just tests that the pipeline can be constructed
        # without errors - actual integration would require images
        pipeline = Pipeline([
            ExtractTables(),
            ExtractLegends(),
        ])

        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={}  # No images_dir, so ExtractTables will set empty list
        )

        result = pipeline.run(ctx)

        # Both steps should have run and set their metadata
        assert "extracted_tables" in result.metadata
        assert "extracted_legends" in result.metadata
