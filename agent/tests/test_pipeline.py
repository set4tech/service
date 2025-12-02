"""
Unit tests for agent/pipeline.py
"""
import pytest
from unittest.mock import MagicMock, patch

import sys
from pathlib import Path

# Add agent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline import (
    PipelineContext,
    PipelineStep,
    Pipeline,
    FilterLowConfidence,
    GroupByClass,
    CountSummary,
    LLMStep,
    ClassifyElements,
    ExtractText,
)


class TestPipelineContext:
    """Test PipelineContext dataclass."""

    def test_create_context_minimal(self):
        """Create context with minimal required fields."""
        ctx = PipelineContext(
            assessment_id="test-assessment",
            agent_run_id="test-run",
            data={}
        )
        assert ctx.assessment_id == "test-assessment"
        assert ctx.agent_run_id == "test-run"
        assert ctx.data == {}
        assert ctx.metadata == {}

    def test_create_context_with_metadata(self):
        """Create context with metadata."""
        ctx = PipelineContext(
            assessment_id="test-assessment",
            agent_run_id="test-run",
            data={"page_001.png": []},
            metadata={"pdf_path": "/tmp/test.pdf"}
        )
        assert ctx.metadata["pdf_path"] == "/tmp/test.pdf"

    def test_context_data_is_mutable(self):
        """Context data can be modified by steps."""
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={"page_001.png": []}
        )
        ctx.data["page_001.png"].append({"class_name": "door"})
        assert len(ctx.data["page_001.png"]) == 1


class TestPipelineStep:
    """Test PipelineStep base class."""

    def test_step_name_default(self):
        """Step has default name 'unnamed_step'."""

        class TestStep(PipelineStep):
            def process(self, ctx):
                return ctx

        step = TestStep()
        assert step.name == "unnamed_step"

    def test_step_repr(self):
        """Step has meaningful repr."""

        class TestStep(PipelineStep):
            name = "my_test_step"

            def process(self, ctx):
                return ctx

        step = TestStep()
        assert "TestStep" in repr(step)
        assert "my_test_step" in repr(step)


class TestPipeline:
    """Test Pipeline orchestration."""

    def test_empty_pipeline(self):
        """Empty pipeline returns context unchanged."""
        pipeline = Pipeline()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={"page_001.png": [{"class_name": "door"}]}
        )
        result = pipeline.run(ctx)
        assert result.data == ctx.data

    def test_add_step_chaining(self):
        """Add method returns self for chaining."""
        pipeline = Pipeline()
        result = pipeline.add(FilterLowConfidence(threshold=0.5))
        assert result is pipeline
        assert len(pipeline.steps) == 1

    def test_pipeline_runs_steps_in_order(self):
        """Pipeline runs steps sequentially."""
        call_order = []

        class Step1(PipelineStep):
            name = "step1"

            def process(self, ctx):
                call_order.append(1)
                return ctx

        class Step2(PipelineStep):
            name = "step2"

            def process(self, ctx):
                call_order.append(2)
                return ctx

        pipeline = Pipeline([Step1(), Step2()])
        ctx = PipelineContext(assessment_id="test", agent_run_id="test", data={})
        pipeline.run(ctx)

        assert call_order == [1, 2]

    def test_pipeline_progress_callback(self):
        """Pipeline calls progress callback for each step."""
        progress_calls = []

        def progress_callback(step_num, total_steps, message):
            progress_calls.append((step_num, total_steps, message))

        pipeline = Pipeline([
            FilterLowConfidence(threshold=0.5),
            GroupByClass(),
        ])
        ctx = PipelineContext(assessment_id="test", agent_run_id="test", data={})
        pipeline.run(ctx, progress_callback=progress_callback)

        assert len(progress_calls) == 2
        assert progress_calls[0][0] == 1  # First step
        assert progress_calls[0][1] == 2  # Total steps
        assert progress_calls[1][0] == 2  # Second step

    def test_pipeline_step_failure_propagates(self):
        """Step failures propagate as exceptions."""

        class FailingStep(PipelineStep):
            name = "failing_step"

            def process(self, ctx):
                raise ValueError("Step failed!")

        pipeline = Pipeline([FailingStep()])
        ctx = PipelineContext(assessment_id="test", agent_run_id="test", data={})

        with pytest.raises(ValueError, match="Step failed!"):
            pipeline.run(ctx)


class TestFilterLowConfidence:
    """Test FilterLowConfidence step."""

    def test_filters_below_threshold(self):
        """Detections below threshold are removed."""
        step = FilterLowConfidence(threshold=0.5)
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [
                    {"class_name": "door", "confidence": 0.3},
                    {"class_name": "window", "confidence": 0.7},
                    {"class_name": "stair", "confidence": 0.5},
                ]
            }
        )

        result = step.process(ctx)
        detections = result.data["page_001.png"]

        assert len(detections) == 2
        assert all(d["confidence"] >= 0.5 for d in detections)

    def test_keeps_all_above_threshold(self):
        """All detections above threshold are kept."""
        step = FilterLowConfidence(threshold=0.3)
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [
                    {"class_name": "door", "confidence": 0.8},
                    {"class_name": "window", "confidence": 0.9},
                ]
            }
        )

        result = step.process(ctx)
        assert len(result.data["page_001.png"]) == 2

    def test_handles_missing_confidence(self):
        """Detections without confidence field are filtered out."""
        step = FilterLowConfidence(threshold=0.5)
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [
                    {"class_name": "door"},  # No confidence
                    {"class_name": "window", "confidence": 0.7},
                ]
            }
        )

        result = step.process(ctx)
        assert len(result.data["page_001.png"]) == 1

    def test_handles_non_list_page_data(self):
        """Non-list page data is skipped."""
        step = FilterLowConfidence(threshold=0.5)
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": {"already": "grouped"}  # Not a list
            }
        )

        result = step.process(ctx)
        assert result.data["page_001.png"] == {"already": "grouped"}

    def test_multiple_pages(self):
        """Filtering works across multiple pages."""
        step = FilterLowConfidence(threshold=0.5)
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [
                    {"class_name": "door", "confidence": 0.3},
                    {"class_name": "window", "confidence": 0.7},
                ],
                "page_002.png": [
                    {"class_name": "stair", "confidence": 0.6},
                    {"class_name": "ramp", "confidence": 0.2},
                ]
            }
        )

        result = step.process(ctx)
        assert len(result.data["page_001.png"]) == 1
        assert len(result.data["page_002.png"]) == 1


class TestGroupByClass:
    """Test GroupByClass step."""

    def test_groups_by_class_name(self):
        """Detections are grouped by class name."""
        step = GroupByClass()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [
                    {"class_name": "door", "confidence": 0.8},
                    {"class_name": "window", "confidence": 0.7},
                    {"class_name": "door", "confidence": 0.9},
                ]
            }
        )

        result = step.process(ctx)
        page_data = result.data["page_001.png"]

        assert "detections" in page_data
        assert "by_class" in page_data
        assert len(page_data["by_class"]["door"]) == 2
        assert len(page_data["by_class"]["window"]) == 1

    def test_handles_missing_class_name(self):
        """Missing class_name defaults to 'unknown'."""
        step = GroupByClass()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [
                    {"confidence": 0.8},  # No class_name
                ]
            }
        )

        result = step.process(ctx)
        assert "unknown" in result.data["page_001.png"]["by_class"]

    def test_preserves_original_detections(self):
        """Original detections list is preserved."""
        step = GroupByClass()
        detections = [
            {"class_name": "door", "confidence": 0.8},
            {"class_name": "window", "confidence": 0.7},
        ]
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={"page_001.png": detections}
        )

        result = step.process(ctx)
        assert result.data["page_001.png"]["detections"] == detections

    def test_skips_non_list_data(self):
        """Already-grouped data is skipped."""
        step = GroupByClass()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": {"already": "processed"}
            }
        )

        result = step.process(ctx)
        assert result.data["page_001.png"] == {"already": "processed"}


class TestCountSummary:
    """Test CountSummary step."""

    def test_counts_total_detections(self):
        """Counts total detections across all pages."""
        step = CountSummary()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [
                    {"class_name": "door"},
                    {"class_name": "window"},
                ],
                "page_002.png": [
                    {"class_name": "door"},
                ]
            }
        )

        result = step.process(ctx)
        assert result.metadata["summary"]["total_detections"] == 3

    def test_counts_by_class(self):
        """Counts detections per class."""
        step = CountSummary()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [
                    {"class_name": "door"},
                    {"class_name": "door"},
                    {"class_name": "window"},
                ]
            }
        )

        result = step.process(ctx)
        assert result.metadata["summary"]["class_counts"]["door"] == 2
        assert result.metadata["summary"]["class_counts"]["window"] == 1

    def test_counts_pages_processed(self):
        """Counts number of pages processed."""
        step = CountSummary()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [],
                "page_002.png": [],
                "page_003.png": [],
            }
        )

        result = step.process(ctx)
        assert result.metadata["summary"]["pages_processed"] == 3

    def test_handles_grouped_data(self):
        """Works with grouped data structure (from GroupByClass)."""
        step = CountSummary()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": {
                    "detections": [
                        {"class_name": "door"},
                        {"class_name": "window"},
                    ],
                    "by_class": {"door": [...], "window": [...]}
                }
            }
        )

        result = step.process(ctx)
        assert result.metadata["summary"]["total_detections"] == 2


class TestLLMStep:
    """Test LLMStep base class."""

    def test_call_llm_not_implemented(self):
        """call_llm raises NotImplementedError."""
        # LLMStep is abstract (via PipelineStep), so we need a concrete subclass
        class ConcreteLLMStep(LLMStep):
            name = "concrete_step"

            def process(self, ctx):
                return ctx

        step = ConcreteLLMStep(model="gpt-4o")

        with pytest.raises(NotImplementedError):
            step.call_llm("test prompt")

    def test_default_model(self):
        """Default model is gpt-4o."""

        class ConcreteLLMStep(LLMStep):
            name = "concrete_step"

            def process(self, ctx):
                return ctx

        step = ConcreteLLMStep()
        assert step.model == "gpt-4o"

    def test_custom_model(self):
        """Can specify custom model."""

        class ConcreteLLMStep(LLMStep):
            name = "concrete_step"

            def process(self, ctx):
                return ctx

        step = ConcreteLLMStep(model="claude-3")
        assert step.model == "claude-3"


class TestClassifyElements:
    """Test ClassifyElements step (stub implementation)."""

    def test_returns_context_unchanged(self):
        """Current stub implementation returns context unchanged."""
        step = ClassifyElements()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={"page_001.png": [{"class_name": "door"}]}
        )

        result = step.process(ctx)
        assert result.data == ctx.data


class TestExtractText:
    """Test ExtractText step (stub implementation)."""

    def test_returns_context_unchanged(self):
        """Current stub implementation returns context unchanged."""
        step = ExtractText()
        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={"page_001.png": [{"class_name": "text_block"}]}
        )

        result = step.process(ctx)
        assert result.data == ctx.data


class TestPipelineIntegration:
    """Integration tests for pipeline with multiple steps."""

    def test_full_pipeline(self):
        """Run a full pipeline with multiple steps."""
        pipeline = Pipeline([
            FilterLowConfidence(threshold=0.5),
            GroupByClass(),
            CountSummary(),
        ])

        ctx = PipelineContext(
            assessment_id="test",
            agent_run_id="test",
            data={
                "page_001.png": [
                    {"class_name": "door", "confidence": 0.8},
                    {"class_name": "door", "confidence": 0.3},  # Will be filtered
                    {"class_name": "window", "confidence": 0.7},
                ],
                "page_002.png": [
                    {"class_name": "stair", "confidence": 0.6},
                ]
            }
        )

        result = pipeline.run(ctx)

        # Check filtering worked
        assert len(result.data["page_001.png"]["detections"]) == 2

        # Check grouping worked
        assert "by_class" in result.data["page_001.png"]
        assert len(result.data["page_001.png"]["by_class"]["door"]) == 1

        # Check summary
        assert result.metadata["summary"]["total_detections"] == 3
        assert result.metadata["summary"]["pages_processed"] == 2
