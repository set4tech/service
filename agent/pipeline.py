"""
Pipeline for running sequential processing steps on YOLO detection results.

Each step takes the data structure, processes it (optionally with LLM), and returns it.
"""
import logging
from abc import ABC, abstractmethod
from typing import Any, Callable
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class PipelineContext:
    """Context passed through the pipeline."""
    assessment_id: str
    agent_run_id: str
    data: dict[str, Any]  # page_name -> page_data (detections, etc.)
    metadata: dict[str, Any] = field(default_factory=dict)  # Additional context


class PipelineStep(ABC):
    """Base class for pipeline steps."""

    name: str = "unnamed_step"

    @abstractmethod
    def process(self, ctx: PipelineContext) -> PipelineContext:
        """Process the context and return updated context."""
        pass

    def __repr__(self):
        return f"<{self.__class__.__name__}: {self.name}>"


class Pipeline:
    """
    Runs a sequence of steps on detection data.

    Usage:
        pipeline = Pipeline([
            FilterLowConfidence(threshold=0.5),
            ClassifyElements(),
            ExtractMeasurements(),
        ])

        result = pipeline.run(ctx)
    """

    def __init__(self, steps: list[PipelineStep] = None):
        self.steps = steps or []

    def add(self, step: PipelineStep) -> "Pipeline":
        """Add a step to the pipeline. Returns self for chaining."""
        self.steps.append(step)
        return self

    def run(self, ctx: PipelineContext, progress_callback: Callable[[int, int, str], None] = None) -> PipelineContext:
        """
        Run all steps in sequence.

        Args:
            ctx: The pipeline context with initial data
            progress_callback: Optional callback(step_num, total_steps, message)

        Returns:
            Updated context after all steps
        """
        total = len(self.steps)

        for i, step in enumerate(self.steps, start=1):
            step_name = step.name or step.__class__.__name__
            logger.info(f"[Pipeline] Running step {i}/{total}: {step_name}")

            if progress_callback:
                progress_callback(i, total, f"Running {step_name}...")

            try:
                ctx = step.process(ctx)
            except Exception as e:
                logger.exception(f"[Pipeline] Step {step_name} failed: {e}")
                raise

        logger.info(f"[Pipeline] Completed {total} steps")
        return ctx


# ============================================
# Example Steps
# ============================================

class FilterLowConfidence(PipelineStep):
    """Filter out detections below a confidence threshold."""

    name = "filter_low_confidence"

    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold

    def process(self, ctx: PipelineContext) -> PipelineContext:
        for page_name, page_data in ctx.data.items():
            if isinstance(page_data, list):
                # page_data is list of detections
                original_count = len(page_data)
                ctx.data[page_name] = [
                    d for d in page_data
                    if d.get("confidence", 0) >= self.threshold
                ]
                filtered_count = len(ctx.data[page_name])
                logger.info(f"  {page_name}: {original_count} -> {filtered_count} detections")

        return ctx


class GroupByClass(PipelineStep):
    """Group detections by class name."""

    name = "group_by_class"

    def process(self, ctx: PipelineContext) -> PipelineContext:
        for page_name, detections in ctx.data.items():
            if not isinstance(detections, list):
                continue

            grouped = {}
            for d in detections:
                class_name = d.get("class_name", "unknown")
                if class_name not in grouped:
                    grouped[class_name] = []
                grouped[class_name].append(d)

            ctx.data[page_name] = {
                "detections": detections,
                "by_class": grouped,
            }

        return ctx


class CountSummary(PipelineStep):
    """Add summary counts to metadata."""

    name = "count_summary"

    def process(self, ctx: PipelineContext) -> PipelineContext:
        total_detections = 0
        class_counts = {}

        for page_name, page_data in ctx.data.items():
            detections = page_data if isinstance(page_data, list) else page_data.get("detections", [])
            total_detections += len(detections)

            for d in detections:
                class_name = d.get("class_name", "unknown")
                class_counts[class_name] = class_counts.get(class_name, 0) + 1

        ctx.metadata["summary"] = {
            "total_detections": total_detections,
            "class_counts": class_counts,
            "pages_processed": len(ctx.data),
        }

        return ctx


# ============================================
# LLM-based Steps (templates)
# ============================================

class LLMStep(PipelineStep):
    """Base class for LLM-powered steps."""

    def __init__(self, model: str = "gpt-4o"):
        self.model = model

    def call_llm(self, prompt: str, image_base64: str = None) -> str:
        """Call LLM with prompt. Override or implement as needed."""
        # TODO: Implement actual LLM call
        raise NotImplementedError("Implement call_llm with your LLM provider")


class ClassifyElements(LLMStep):
    """Use LLM to classify/label detected elements."""

    name = "classify_elements"

    def process(self, ctx: PipelineContext) -> PipelineContext:
        # TODO: Implement LLM classification
        # For each detection, call LLM to get more detailed classification
        logger.info("  ClassifyElements: TODO - implement LLM classification")
        return ctx


class ExtractText(LLMStep):
    """Use LLM to extract text from detected regions."""

    name = "extract_text"

    def process(self, ctx: PipelineContext) -> PipelineContext:
        # TODO: Implement LLM text extraction
        logger.info("  ExtractText: TODO - implement LLM text extraction")
        return ctx
