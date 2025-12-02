"""
Tracing Setup for Agent Observability

Supports two backends:
1. Langfuse Cloud (default) - Set LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY
2. Phoenix (local) - Set PHOENIX_COLLECTOR_ENDPOINT

View traces at:
- Langfuse: https://cloud.langfuse.com or https://us.cloud.langfuse.com
- Phoenix: http://localhost:6006
"""

import atexit
import logging
import os

logger = logging.getLogger(__name__)

# Track if instrumentation has been applied
_instrumented = False
_tracer_provider = None


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
