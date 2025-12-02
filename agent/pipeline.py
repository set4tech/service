"""
Pipeline for running sequential and parallel processing steps on YOLO detection results.

Supports both sync and async steps, with built-in parallelization primitives.
"""
import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Any, Callable
from dataclasses import dataclass, field

import config as cfg

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


class AsyncPipelineStep(PipelineStep):
    """Base class for async pipeline steps."""

    async def process_async(self, ctx: PipelineContext) -> PipelineContext:
        """Async process implementation. Override this for async steps."""
        # Default: call sync version (backwards compatible)
        return self.process(ctx)

    def process(self, ctx: PipelineContext) -> PipelineContext:
        """Sync wrapper - runs async in event loop. Override process_async instead."""
        raise NotImplementedError("AsyncPipelineStep subclasses must implement process_async")


class ParallelItemStep(AsyncPipelineStep):
    """
    Base class for steps that process items (pages/detections) in parallel.

    Subclasses must implement:
    - get_items(ctx): Return list of items to process
    - process_item(item, ctx): Process a single item (async)
    - merge_results(results, ctx): Merge results back into context
    """

    max_concurrency: int = None  # Override in subclass or use config default

    def get_max_concurrency(self) -> int:
        """Get max concurrency, defaulting to config value."""
        if self.max_concurrency is not None:
            return self.max_concurrency
        return cfg.PARALLEL_VLM_CONCURRENCY

    @abstractmethod
    def get_items(self, ctx: PipelineContext) -> list[Any]:
        """Get list of items to process in parallel."""
        pass

    @abstractmethod
    async def process_item(self, item: Any, ctx: PipelineContext) -> Any:
        """Process a single item. Must be implemented by subclass."""
        pass

    @abstractmethod
    def merge_results(self, results: list[Any], ctx: PipelineContext) -> PipelineContext:
        """Merge all results back into context."""
        pass

    async def process_async(self, ctx: PipelineContext) -> PipelineContext:
        """Process all items in parallel with bounded concurrency."""
        items = self.get_items(ctx)

        if not items:
            logger.info(f"  {self.name}: No items to process")
            return self.merge_results([], ctx)

        max_conc = self.get_max_concurrency()
        semaphore = asyncio.Semaphore(max_conc)
        total = len(items)

        logger.info(f"  {self.name}: Processing {total} items (max {max_conc} concurrent)")

        async def bounded_process(idx: int, item: Any) -> Any:
            async with semaphore:
                logger.debug(f"    [{idx + 1}/{total}] Processing...")
                try:
                    return await self.process_item(item, ctx)
                except Exception as e:
                    logger.error(f"    [{idx + 1}/{total}] Error: {e}")
                    return None

        results = await asyncio.gather(*[bounded_process(i, item) for i, item in enumerate(items)])

        # Filter out None results from errors
        valid_results = [r for r in results if r is not None]
        logger.info(f"  {self.name}: Completed {len(valid_results)}/{total} items successfully")

        return self.merge_results(valid_results, ctx)


class ParallelSteps(AsyncPipelineStep):
    """
    Run multiple steps in parallel.

    Each step gets its own copy of metadata to avoid race conditions.
    Results are merged after all steps complete.
    """

    def __init__(self, steps: list[PipelineStep]):
        self.steps = steps
        self.name = f"parallel({', '.join(s.name for s in steps)})"

    async def process_async(self, ctx: PipelineContext) -> PipelineContext:
        """Run all steps concurrently, merge their metadata outputs."""
        logger.info(f"  Running {len(self.steps)} steps in parallel: {[s.name for s in self.steps]}")

        async def run_step(step: PipelineStep) -> PipelineContext:
            # Each step gets a copy of metadata to avoid race conditions
            step_ctx = PipelineContext(
                assessment_id=ctx.assessment_id,
                agent_run_id=ctx.agent_run_id,
                data=ctx.data,  # Shared (read-only in these steps)
                metadata=dict(ctx.metadata),  # Copy
            )
            if isinstance(step, AsyncPipelineStep):
                return await step.process_async(step_ctx)
            else:
                return step.process(step_ctx)

        results = await asyncio.gather(*[run_step(s) for s in self.steps])

        # Merge metadata from all results
        for result_ctx in results:
            ctx.metadata.update(result_ctx.metadata)

        logger.info(f"  Parallel steps completed")
        return ctx

    def process(self, ctx: PipelineContext) -> PipelineContext:
        """Sync wrapper."""
        raise NotImplementedError("ParallelSteps must be run via process_async")


class Pipeline:
    """
    Runs a sequence of steps on detection data.
    Supports both sync and async steps.

    Usage:
        pipeline = Pipeline([
            FilterLowConfidence(threshold=0.5),
            ParallelSteps([Step1(), Step2()]),
            FinalStep(),
        ])

        result = await pipeline.run_async(ctx)
        # or
        result = pipeline.run(ctx)  # Uses asyncio.run internally
    """

    def __init__(self, steps: list[PipelineStep] = None):
        self.steps = steps or []

    def add(self, step: PipelineStep) -> "Pipeline":
        """Add a step to the pipeline. Returns self for chaining."""
        self.steps.append(step)
        return self

    async def run_async(
        self,
        ctx: PipelineContext,
        progress_callback: Callable[[int, int, str], None] = None
    ) -> PipelineContext:
        """
        Run all steps, using async where supported.

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
                if isinstance(step, AsyncPipelineStep):
                    ctx = await step.process_async(ctx)
                else:
                    ctx = step.process(ctx)
            except Exception as e:
                logger.exception(f"[Pipeline] Step {step_name} failed: {e}")
                raise

        logger.info(f"[Pipeline] Completed {total} steps")
        return ctx

    def run(
        self,
        ctx: PipelineContext,
        progress_callback: Callable[[int, int, str], None] = None
    ) -> PipelineContext:
        """
        Run all steps in sequence (sync wrapper).

        Uses asyncio.run() to handle async steps properly.
        """
        return asyncio.run(self.run_async(ctx, progress_callback))


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
