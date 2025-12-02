"""
Unit tests for agent/steps/match_tags_to_legends.py
"""
import pytest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add agent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline import PipelineContext


class TestCollectAllTags:
    """Test collect_all_tags function."""

    def test_collects_tags_from_results(self):
        """Collects all unique tags from extraction results."""
        from steps.match_tags_to_legends import collect_all_tags

        results = [
            {"extraction_result": {"tags_found": ["D-01", "W-1"]}},
            {"extraction_result": {"tags_found": ["D-02", "W-1"]}},  # W-1 is duplicate
        ]

        tags = collect_all_tags(results)

        assert set(tags) == {"D-01", "D-02", "W-1"}

    def test_handles_empty_results(self):
        """Returns empty list for empty results."""
        from steps.match_tags_to_legends import collect_all_tags

        assert collect_all_tags([]) == []

    def test_handles_missing_extraction_result(self):
        """Handles results without extraction_result key."""
        from steps.match_tags_to_legends import collect_all_tags

        results = [
            {"extraction_result": {"tags_found": ["D-01"]}},
            {"some_other_key": "value"},
        ]

        tags = collect_all_tags(results)

        assert tags == ["D-01"]

    def test_handles_missing_tags_found(self):
        """Handles extraction_result without tags_found key."""
        from steps.match_tags_to_legends import collect_all_tags

        results = [
            {"extraction_result": {"tags_found": ["D-01"]}},
            {"extraction_result": {"other_key": "value"}},
        ]

        tags = collect_all_tags(results)

        assert tags == ["D-01"]

    def test_returns_sorted_tags(self):
        """Returns tags in sorted order."""
        from steps.match_tags_to_legends import collect_all_tags

        results = [
            {"extraction_result": {"tags_found": ["W-1", "D-01", "101"]}},
        ]

        tags = collect_all_tags(results)

        assert tags == ["101", "D-01", "W-1"]


class TestCollectAllLegendEntries:
    """Test collect_all_legend_entries function."""

    def test_collects_entries_from_legends(self):
        """Collects all legend entries."""
        from steps.match_tags_to_legends import collect_all_legend_entries

        legends = [
            {
                "status": "success",
                "category": "door",
                "legend_type": "Door Legend",
                "entries": [
                    {"symbol": "D", "meaning": "Door Tag", "category": "door"},
                ]
            },
            {
                "status": "success",
                "category": "window",
                "legend_type": "Window Legend",
                "entries": [
                    {"symbol": "W", "meaning": "Window Tag", "category": "window"},
                ]
            },
        ]

        entries = collect_all_legend_entries(legends)

        assert len(entries) == 2
        assert entries[0]["symbol"] == "D"
        assert entries[1]["symbol"] == "W"

    def test_skips_failed_legends(self):
        """Skips legends with status != 'success'."""
        from steps.match_tags_to_legends import collect_all_legend_entries

        legends = [
            {
                "status": "success",
                "entries": [{"symbol": "A", "meaning": "Entry A"}]
            },
            {
                "status": "no_entries",
                "entries": []
            },
        ]

        entries = collect_all_legend_entries(legends)

        assert len(entries) == 1
        assert entries[0]["symbol"] == "A"

    def test_handles_empty_legends(self):
        """Returns empty list for empty legends."""
        from steps.match_tags_to_legends import collect_all_legend_entries

        assert collect_all_legend_entries([]) == []

    def test_preserves_legend_metadata(self):
        """Preserves legend_type and category in entries."""
        from steps.match_tags_to_legends import collect_all_legend_entries

        legends = [
            {
                "status": "success",
                "category": "material",
                "legend_type": "Material Legend",
                "entries": [
                    {"symbol": "CM", "meaning": "Ceramic Mosaic"},
                ]
            },
        ]

        entries = collect_all_legend_entries(legends)

        assert entries[0]["category"] == "material"
        assert entries[0]["legend_type"] == "Material Legend"


class TestFormatLegendEntriesForPrompt:
    """Test format_legend_entries_for_prompt function."""

    def test_formats_entries_correctly(self):
        """Formats entries as readable list."""
        from steps.match_tags_to_legends import format_legend_entries_for_prompt

        entries = [
            {"symbol": "D", "meaning": "Door Tag", "category": "door"},
            {"symbol": "W", "meaning": "Window Tag", "category": "window"},
        ]

        result = format_legend_entries_for_prompt(entries)

        assert "- D: Door Tag [door]" in result
        assert "- W: Window Tag [window]" in result

    def test_handles_empty_entries(self):
        """Returns placeholder for empty entries."""
        from steps.match_tags_to_legends import format_legend_entries_for_prompt

        result = format_legend_entries_for_prompt([])

        assert result == "(no legend entries)"

    def test_handles_missing_symbol(self):
        """Handles entries without symbol."""
        from steps.match_tags_to_legends import format_legend_entries_for_prompt

        entries = [
            {"symbol": None, "meaning": "Some meaning", "category": "general"},
        ]

        result = format_legend_entries_for_prompt(entries)

        assert "Some meaning [general]" in result


class TestMatchTagsToLegends:
    """Test match_tags_to_legends function."""

    def test_matches_tags_successfully(self):
        """Successfully matches tags to legend entries."""
        from steps.match_tags_to_legends import match_tags_to_legends

        mock_response = {
            "text": '{"matches": [{"tag": "D-01", "legend_match": "Door Tag", "legend_symbol": "D", "match_type": "pattern", "confidence": "high"}], "unmatched_tags": [], "notes": ""}',
            "status": "success",
        }

        tags = ["D-01"]
        legend_entries = [{"symbol": "D", "meaning": "Door Tag", "category": "door"}]

        with patch("steps.match_tags_to_legends.call_text_llm", return_value=mock_response):
            result = match_tags_to_legends(tags, legend_entries)

        assert result["status"] == "success"
        assert len(result["matches"]) == 1
        assert result["matches"][0]["tag"] == "D-01"
        assert result["matches"][0]["legend_match"] == "Door Tag"

    def test_handles_empty_tags(self):
        """Returns early for empty tags."""
        from steps.match_tags_to_legends import match_tags_to_legends

        result = match_tags_to_legends([], [{"symbol": "D", "meaning": "Door"}])

        assert result["status"] == "no_tags"
        assert result["matches"] == []

    def test_handles_empty_legend_entries(self):
        """Returns all tags as unmatched when no legends."""
        from steps.match_tags_to_legends import match_tags_to_legends

        result = match_tags_to_legends(["D-01", "W-1"], [])

        assert result["status"] == "no_legends"
        assert result["unmatched_tags"] == ["D-01", "W-1"]

    def test_handles_llm_error(self):
        """Returns error result when LLM fails."""
        from steps.match_tags_to_legends import match_tags_to_legends

        mock_response = {
            "text": "",
            "status": "error",
            "error": "API error",
        }

        with patch("steps.match_tags_to_legends.call_text_llm", return_value=mock_response):
            result = match_tags_to_legends(["D-01"], [{"symbol": "D", "meaning": "Door"}])

        assert result["status"] == "api_error"
        assert result["unmatched_tags"] == ["D-01"]

    def test_handles_json_parse_error(self):
        """Returns error result when JSON parsing fails."""
        from steps.match_tags_to_legends import match_tags_to_legends

        mock_response = {
            "text": "Invalid JSON",
            "status": "success",
        }

        with patch("steps.match_tags_to_legends.call_text_llm", return_value=mock_response):
            result = match_tags_to_legends(["D-01"], [{"symbol": "D", "meaning": "Door"}])

        assert result["status"] == "json_error"

    def test_handles_markdown_code_blocks(self):
        """Strips markdown code blocks from response."""
        from steps.match_tags_to_legends import match_tags_to_legends

        mock_response = {
            "text": '```json\n{"matches": [], "unmatched_tags": ["D-01"], "notes": ""}\n```',
            "status": "success",
        }

        with patch("steps.match_tags_to_legends.call_text_llm", return_value=mock_response):
            result = match_tags_to_legends(["D-01"], [{"symbol": "X", "meaning": "Something"}])

        assert result["status"] == "success"
        assert result["unmatched_tags"] == ["D-01"]


class TestMatchTagsToLegendsStep:
    """Test MatchTagsToLegends pipeline step."""

    def test_step_name(self):
        """Step has correct name."""
        from steps.match_tags_to_legends import MatchTagsToLegends

        step = MatchTagsToLegends()
        assert step.name == "match_tags_to_legends"

    def test_handles_no_element_tags(self):
        """Returns empty result if no element tags."""
        from steps.match_tags_to_legends import MatchTagsToLegends

        step = MatchTagsToLegends()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={}
        )

        result = step.process(ctx)

        assert result.metadata["tag_legend_matches"]["matches"] == []
        assert result.metadata["tag_legend_matches"]["summary"]["status"] == "no_tags"

    def test_handles_no_legends(self):
        """Returns all tags as unmatched if no legends."""
        from steps.match_tags_to_legends import MatchTagsToLegends

        step = MatchTagsToLegends()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={
                "extracted_element_tags": [
                    {"extraction_result": {"tags_found": ["D-01", "W-1"]}}
                ],
                "extracted_legends": []
            }
        )

        result = step.process(ctx)

        assert set(result.metadata["tag_legend_matches"]["unmatched_tags"]) == {"D-01", "W-1"}
        assert result.metadata["tag_legend_matches"]["summary"]["status"] == "no_legends"

    def test_matches_tags_to_legends(self):
        """Successfully matches tags to legends."""
        from steps.match_tags_to_legends import MatchTagsToLegends

        step = MatchTagsToLegends()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={
                "extracted_element_tags": [
                    {"extraction_result": {"tags_found": ["D-01", "W-1"]}}
                ],
                "extracted_legends": [
                    {
                        "status": "success",
                        "category": "door",
                        "legend_type": "Door Legend",
                        "entries": [
                            {"symbol": "D", "meaning": "Door Tag", "category": "door"},
                            {"symbol": "W", "meaning": "Window Tag", "category": "window"},
                        ]
                    }
                ]
            }
        )

        mock_response = {
            "text": '{"matches": [{"tag": "D-01", "legend_match": "Door Tag", "match_type": "pattern", "confidence": "high"}, {"tag": "W-1", "legend_match": "Window Tag", "match_type": "pattern", "confidence": "high"}], "unmatched_tags": [], "notes": ""}',
            "status": "success",
        }

        with patch("steps.match_tags_to_legends.call_text_llm", return_value=mock_response):
            result = step.process(ctx)

        matches = result.metadata["tag_legend_matches"]["matches"]
        assert len(matches) == 2
        assert matches[0]["tag"] == "D-01"
        assert matches[1]["tag"] == "W-1"

    def test_builds_summary(self):
        """Builds correct summary statistics."""
        from steps.match_tags_to_legends import MatchTagsToLegends

        step = MatchTagsToLegends()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={
                "extracted_element_tags": [
                    {"extraction_result": {"tags_found": ["D-01", "W-1", "X-99"]}}
                ],
                "extracted_legends": [
                    {
                        "status": "success",
                        "entries": [{"symbol": "D", "meaning": "Door"}, {"symbol": "W", "meaning": "Window"}]
                    }
                ]
            }
        )

        mock_response = {
            "text": '{"matches": [{"tag": "D-01", "legend_match": "Door", "match_type": "pattern", "confidence": "high"}, {"tag": "W-1", "legend_match": "Window", "match_type": "pattern", "confidence": "medium"}], "unmatched_tags": ["X-99"], "notes": ""}',
            "status": "success",
        }

        with patch("steps.match_tags_to_legends.call_text_llm", return_value=mock_response):
            result = step.process(ctx)

        summary = result.metadata["tag_legend_matches"]["summary"]
        assert summary["total_tags"] == 3
        assert summary["matched_tags"] == 2
        assert summary["unmatched_tags"] == 1
        assert summary["match_rate"] == pytest.approx(2/3, rel=0.01)
        assert summary["match_types"] == {"pattern": 2}
        assert summary["confidence_distribution"] == {"high": 1, "medium": 1}

    def test_batches_large_tag_sets(self):
        """Processes large tag sets in batches."""
        from steps.match_tags_to_legends import MatchTagsToLegends

        step = MatchTagsToLegends(batch_size=2)
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={
                "extracted_element_tags": [
                    {"extraction_result": {"tags_found": ["D-01", "D-02", "D-03"]}}
                ],
                "extracted_legends": [
                    {
                        "status": "success",
                        "entries": [{"symbol": "D", "meaning": "Door"}]
                    }
                ]
            }
        )

        # Will be called twice due to batch_size=2
        responses = [
            {"text": '{"matches": [{"tag": "D-01", "legend_match": "Door", "match_type": "pattern", "confidence": "high"}, {"tag": "D-02", "legend_match": "Door", "match_type": "pattern", "confidence": "high"}], "unmatched_tags": [], "notes": ""}', "status": "success"},
            {"text": '{"matches": [{"tag": "D-03", "legend_match": "Door", "match_type": "pattern", "confidence": "high"}], "unmatched_tags": [], "notes": ""}', "status": "success"},
        ]

        with patch("steps.match_tags_to_legends.call_text_llm", side_effect=responses):
            result = step.process(ctx)

        assert len(result.metadata["tag_legend_matches"]["matches"]) == 3


class TestMatchTagsToLegendsIntegration:
    """Integration tests for MatchTagsToLegends with pipeline."""

    def test_in_pipeline(self):
        """MatchTagsToLegends works correctly in a pipeline."""
        from steps.match_tags_to_legends import MatchTagsToLegends
        from pipeline import Pipeline, CountSummary

        pipeline = Pipeline([
            MatchTagsToLegends(),
            CountSummary(),
        ])

        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={
                "extracted_element_tags": [
                    {"extraction_result": {"tags_found": ["D-01"]}}
                ],
                "extracted_legends": [
                    {"status": "success", "entries": [{"symbol": "D", "meaning": "Door"}]}
                ]
            }
        )

        mock_response = {
            "text": '{"matches": [{"tag": "D-01", "legend_match": "Door", "match_type": "pattern", "confidence": "high"}], "unmatched_tags": [], "notes": ""}',
            "status": "success",
        }

        with patch("steps.match_tags_to_legends.call_text_llm", return_value=mock_response):
            result = pipeline.run(ctx)

        assert "tag_legend_matches" in result.metadata

    def test_runs_after_extract_element_tags_and_legends(self):
        """MatchTagsToLegends runs after ExtractElementTags and ExtractLegends."""
        from steps.match_tags_to_legends import MatchTagsToLegends
        from steps.extract_element_tags import ExtractElementTags
        from steps.extract_legends import ExtractLegends
        from pipeline import Pipeline

        pipeline = Pipeline([
            ExtractLegends(),
            ExtractElementTags(),
            MatchTagsToLegends(),
        ])

        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={"extracted_tables": []}
        )

        result = pipeline.run(ctx)

        # All steps should have run
        assert "extracted_legends" in result.metadata
        assert "extracted_element_tags" in result.metadata
        assert "tag_legend_matches" in result.metadata

    def test_full_pipeline_integration(self):
        """Tests the full pipeline with ExtractTables -> ExtractLegends -> ExtractElementTags -> MatchTagsToLegends."""
        from steps.match_tags_to_legends import MatchTagsToLegends
        from steps.extract_element_tags import ExtractElementTags
        from steps.extract_legends import ExtractLegends
        from steps.extract_tables import ExtractTables
        from pipeline import Pipeline

        pipeline = Pipeline([
            ExtractTables(),
            ExtractLegends(),
            ExtractElementTags(),
            MatchTagsToLegends(),
        ])

        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={},
            metadata={}  # No images_dir, so steps will return empty results
        )

        result = pipeline.run(ctx)

        # All steps should have run and set their metadata
        assert "extracted_tables" in result.metadata
        assert "extracted_legends" in result.metadata
        assert "extracted_element_tags" in result.metadata
        assert "tag_legend_matches" in result.metadata
