"""
Tracing Setup for Agent Observability

Supports two backends:
1. Langfuse Cloud (default) - Set LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY
2. Phoenix (local) - Set PHOENIX_COLLECTOR_ENDPOINT

View traces at:
- Langfuse: https://cloud.langfuse.com or https://us.cloud.langfuse.com
- Phoenix: http://localhost:6006

Usage in agent code:
    from tracing import trace_agent, trace_iteration, trace_tool

    @trace_agent("compliance_assessment")
    async def assess_check(...):
        for iteration in range(max_iterations):
            with trace_iteration(iteration, section_number):
                # API call happens here (auto-instrumented)
                for tool_call in tool_calls:
                    with trace_tool(tool_call.name, tool_call.input):
                        result = execute_tool(...)
"""

import atexit
import logging
import os
from contextlib import contextmanager
from functools import wraps
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Track if instrumentation has been applied
_instrumented = False
_tracer_provider = None
_langfuse_client = None


def setup_tracing():
    """
    Initialize tracing for Anthropic calls.

    Automatically detects which backend to use based on env vars:
    - If LANGFUSE_SECRET_KEY is set, uses Langfuse Cloud
    - If PHOENIX_COLLECTOR_ENDPOINT is set, uses Phoenix
    - Otherwise, tracing is disabled
    """
    global _instrumented

    if _instrumented:
        logger.debug("[Tracing] Already instrumented, skipping")
        return

    # Check if tracing is disabled
    if os.environ.get("DISABLE_TRACING", "").lower() in ("true", "1", "yes"):
        logger.info("[Tracing] Disabled via DISABLE_TRACING env var")
        return

    # Try Langfuse first (cloud-hosted)
    langfuse_secret = os.environ.get("LANGFUSE_SECRET_KEY")
    langfuse_public = os.environ.get("LANGFUSE_PUBLIC_KEY")

    if langfuse_secret and langfuse_public:
        _setup_langfuse()
        return

    # Fall back to Phoenix (local)
    phoenix_endpoint = os.environ.get("PHOENIX_COLLECTOR_ENDPOINT")
    if phoenix_endpoint:
        _setup_phoenix(phoenix_endpoint)
        return

    logger.info("[Tracing] No tracing backend configured. Set LANGFUSE_SECRET_KEY/LANGFUSE_PUBLIC_KEY for cloud tracing.")


def _setup_langfuse():
    """Configure Langfuse cloud tracing via OTEL."""
    global _instrumented, _tracer_provider

    try:
        import base64
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import SimpleSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.anthropic import AnthropicInstrumentor

        # Get Langfuse credentials
        public_key = os.environ.get("LANGFUSE_PUBLIC_KEY")
        secret_key = os.environ.get("LANGFUSE_SECRET_KEY")
        host = os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com")

        # Build the endpoint URL
        endpoint = f"{host}/api/public/otel/v1/traces"
        logger.info(f"[Tracing] Configuring OTEL export to: {endpoint}")
        logger.info(f"[Tracing] Public key prefix: {public_key[:10] if public_key else 'NONE'}...")

        # Set up tracer provider
        tracer_provider = TracerProvider()
        trace.set_tracer_provider(tracer_provider)
        _tracer_provider = tracer_provider

        # Configure OTLP exporter to send to Langfuse's OTEL endpoint
        # Langfuse accepts OTEL traces with Basic auth (public_key:secret_key)
        auth = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
        otlp_exporter = OTLPSpanExporter(
            endpoint=endpoint,
            headers={"Authorization": f"Basic {auth}"},
        )
        # Use SimpleSpanProcessor for immediate export (easier debugging)
        # Wrap the OTLP exporter to log results
        from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult

        class LoggingOTLPExporter(SpanExporter):
            def __init__(self, wrapped_exporter):
                self._wrapped = wrapped_exporter

            def export(self, spans):
                for span in spans:
                    logger.info(f"[Tracing] Exporting span: {span.name}")
                result = self._wrapped.export(spans)
                logger.info(f"[Tracing] Export result: {result}")
                return result

            def shutdown(self):
                self._wrapped.shutdown()

        logging_exporter = LoggingOTLPExporter(otlp_exporter)
        span_processor = SimpleSpanProcessor(logging_exporter)
        tracer_provider.add_span_processor(span_processor)

        # Instrument Anthropic client
        AnthropicInstrumentor().instrument()

        # Register shutdown handler to flush spans
        atexit.register(_shutdown_tracing)

        _instrumented = True
        logger.info(f"[Tracing] Langfuse tracing enabled via OTEL")
        logger.info(f"[Tracing] View traces at {host}")

    except ImportError as e:
        logger.warning(f"[Tracing] Could not import tracing libraries: {e}")
        logger.warning("[Tracing] Run: pip install opentelemetry-sdk opentelemetry-exporter-otlp opentelemetry-instrumentation-anthropic")
    except Exception as e:
        logger.warning(f"[Tracing] Failed to initialize Langfuse: {e}", exc_info=True)


def _setup_phoenix(endpoint: str):
    """Configure Phoenix local tracing."""
    global _instrumented

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from openinference.instrumentation.anthropic import AnthropicInstrumentor

        # Set up tracer provider
        tracer_provider = TracerProvider()
        trace.set_tracer_provider(tracer_provider)

        # Configure OTLP exporter to send to Phoenix
        otlp_exporter = OTLPSpanExporter(endpoint=endpoint)
        span_processor = BatchSpanProcessor(otlp_exporter)
        tracer_provider.add_span_processor(span_processor)

        # Instrument Anthropic client
        AnthropicInstrumentor().instrument()

        _instrumented = True
        logger.info(f"[Tracing] Phoenix tracing enabled, sending to {endpoint}")

    except ImportError as e:
        logger.warning(f"[Tracing] Could not import Phoenix libraries: {e}")
        logger.warning("[Tracing] Run: pip install arize-phoenix openinference-instrumentation-anthropic")
    except Exception as e:
        logger.warning(f"[Tracing] Failed to initialize Phoenix: {e}")


def _shutdown_tracing():
    """Flush and shutdown the tracer provider."""
    global _tracer_provider
    if _tracer_provider:
        logger.info("[Tracing] Shutting down tracer provider...")
        try:
            _tracer_provider.force_flush()
            _tracer_provider.shutdown()
            logger.info("[Tracing] Tracer provider shutdown complete")
        except Exception as e:
            logger.warning(f"[Tracing] Error during shutdown: {e}")


def start_phoenix_server():
    """
    Start the Phoenix server in a background thread (for local development).

    Returns the Phoenix app instance, or None if failed.
    """
    try:
        import phoenix as px

        # Launch Phoenix (non-blocking)
        session = px.launch_app()
        logger.info(f"[Tracing] Phoenix server started at {session.url}")
        return session
    except ImportError:
        logger.warning("[Tracing] Phoenix not installed. Run: pip install arize-phoenix")
        return None
    except Exception as e:
        logger.warning(f"[Tracing] Failed to start Phoenix server: {e}")
        return None


# =============================================================================
# NATIVE LANGFUSE SDK HELPERS
# =============================================================================
# These provide structured traces with nested spans for agentic workflows.
# Each iteration and tool call appears as a separate span in Langfuse.


def get_langfuse():
    """Get the Langfuse client, initializing if needed."""
    global _langfuse_client

    if _langfuse_client is not None:
        return _langfuse_client

    # Check if Langfuse is configured
    if not os.environ.get("LANGFUSE_SECRET_KEY"):
        return None

    try:
        from langfuse import Langfuse

        _langfuse_client = Langfuse()
        logger.info("[Tracing] Langfuse client initialized")
        return _langfuse_client
    except ImportError:
        logger.warning("[Tracing] Langfuse SDK not installed")
        return None
    except Exception as e:
        logger.warning(f"[Tracing] Failed to initialize Langfuse client: {e}")
        return None


def trace_agent(name: str = "agent"):
    """
    Decorator to create a parent trace for an agent run.

    Usage:
        @trace_agent("compliance_assessment")
        async def assess_check(self, code_section, ...):
            ...
    """
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            langfuse = get_langfuse()
            if not langfuse:
                # No tracing configured, just run the function
                async for item in func(*args, **kwargs):
                    yield item
                return

            # Extract metadata from kwargs or args for trace context
            trace_metadata = {}
            if "code_section" in kwargs:
                cs = kwargs["code_section"]
                trace_metadata["section_number"] = cs.get("number", "unknown")
                trace_metadata["section_title"] = cs.get("title", "unknown")

            # Create the parent trace
            trace = langfuse.trace(
                name=name,
                metadata=trace_metadata,
                tags=["agent", name],
            )

            # Store trace in a way the iteration/tool helpers can access
            # We use a simple approach: store on the first arg (self) if it exists
            if args and hasattr(args[0], "__dict__"):
                args[0]._langfuse_trace = trace

            try:
                async for item in func(*args, **kwargs):
                    yield item
            finally:
                # End the trace
                if args and hasattr(args[0], "_langfuse_trace"):
                    delattr(args[0], "_langfuse_trace")
                langfuse.flush()

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            langfuse = get_langfuse()
            if not langfuse:
                return func(*args, **kwargs)

            trace = langfuse.trace(name=name, tags=["agent", name])

            if args and hasattr(args[0], "__dict__"):
                args[0]._langfuse_trace = trace

            try:
                return func(*args, **kwargs)
            finally:
                if args and hasattr(args[0], "_langfuse_trace"):
                    delattr(args[0], "_langfuse_trace")
                langfuse.flush()

        # Return appropriate wrapper based on function type
        import asyncio
        if asyncio.iscoroutinefunction(func) or hasattr(func, "__wrapped__"):
            return async_wrapper
        return sync_wrapper

    return decorator


@contextmanager
def trace_iteration(
    agent_self: Any,
    iteration: int,
    section_number: Optional[str] = None,
):
    """
    Context manager to trace a single agentic loop iteration.

    Usage:
        with trace_iteration(self, iteration, section_number="11B-404.2"):
            response = self.client.messages.create(...)
    """
    trace = getattr(agent_self, "_langfuse_trace", None)
    if not trace:
        yield None
        return

    span_name = f"iteration_{iteration + 1}"
    if section_number:
        span_name = f"{span_name}_{section_number}"

    span = trace.span(
        name=span_name,
        metadata={"iteration": iteration + 1},
    )

    try:
        yield span
    finally:
        span.end()


@contextmanager
def trace_tool(
    agent_self: Any,
    tool_name: str,
    tool_input: Optional[dict] = None,
    tool_use_id: Optional[str] = None,
):
    """
    Context manager to trace a tool execution.

    Usage:
        with trace_tool(self, "search_drawings", {"keywords": ["door"]}):
            result = self.tool_executor.execute(...)
    """
    trace = getattr(agent_self, "_langfuse_trace", None)
    if not trace:
        yield None
        return

    # Create a span for this tool call
    span = trace.span(
        name=f"tool_{tool_name}",
        input=tool_input,
        metadata={
            "tool_name": tool_name,
            "tool_use_id": tool_use_id,
        },
    )

    try:
        yield span
    except Exception as e:
        span.update(level="ERROR", status_message=str(e))
        raise
    finally:
        span.end()


def trace_tool_result(span: Any, result: Any):
    """Update a tool span with its result."""
    if span:
        span.update(output=result)
