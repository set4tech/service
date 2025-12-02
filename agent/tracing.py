"""
Phoenix Tracing Setup for Agent Observability

Provides automatic tracing for Anthropic Claude API calls.
View traces at http://localhost:6006 when Phoenix is running.
"""

import logging
import os

logger = logging.getLogger(__name__)

# Track if instrumentation has been applied
_instrumented = False


def setup_tracing(phoenix_endpoint: str = None):
    """
    Initialize Phoenix tracing for Anthropic calls.

    Args:
        phoenix_endpoint: Phoenix collector endpoint.
                         Defaults to PHOENIX_COLLECTOR_ENDPOINT env var or localhost:6006
    """
    global _instrumented

    if _instrumented:
        logger.debug("[Tracing] Already instrumented, skipping")
        return

    # Check if tracing is disabled
    if os.environ.get("DISABLE_TRACING", "").lower() in ("true", "1", "yes"):
        logger.info("[Tracing] Disabled via DISABLE_TRACING env var")
        return

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from openinference.instrumentation.anthropic import AnthropicInstrumentor

        # Determine endpoint
        endpoint = phoenix_endpoint or os.environ.get(
            "PHOENIX_COLLECTOR_ENDPOINT",
            "http://localhost:6006/v1/traces"
        )

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
        logger.info("[Tracing] View traces at http://localhost:6006")

    except ImportError as e:
        logger.warning(f"[Tracing] Could not import tracing libraries: {e}")
        logger.warning("[Tracing] Run: pip install arize-phoenix openinference-instrumentation-anthropic")
    except Exception as e:
        logger.warning(f"[Tracing] Failed to initialize tracing: {e}")


def start_phoenix_server():
    """
    Start the Phoenix server in a background thread.

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
