"""
LLM client management for the agent service.

Provides a unified interface for calling different LLM providers.
Uses Helicone for observability when configured.
"""
import os
import base64
import logging
from io import BytesIO
from typing import Optional
from PIL import Image

from openai import OpenAI

import config as cfg  # Avoid shadowing with local 'config' var

logger = logging.getLogger(__name__)

# Singleton clients
_openai_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    """Get or create OpenAI client (configured for Gemini via Helicone or direct)."""
    global _openai_client

    if _openai_client is not None:
        return _openai_client

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY environment variable required")

    # Check if Helicone is enabled
    helicone_enabled = cfg.HELICONE_ENABLED and cfg.HELICONE_API_KEY

    if helicone_enabled:
        # Route through Helicone gateway
        logger.info("Initializing LLM client with Helicone observability")
        _openai_client = OpenAI(
            api_key=api_key,
            base_url="https://gateway.helicone.ai/v1beta/openai",
            default_headers={
                "Helicone-Auth": f"Bearer {cfg.HELICONE_API_KEY}",
                "Helicone-Target-URL": "https://generativelanguage.googleapis.com",
                "Helicone-Target-Provider": "Google",
            },
        )
    else:
        # Direct to Google's OpenAI-compatible endpoint
        logger.info("Initializing LLM client (direct, no Helicone)")
        _openai_client = OpenAI(
            api_key=api_key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        )

    logger.info(f"LLM client initialized with model: {cfg.LLM_MODEL}")
    return _openai_client


def _image_to_base64(image: Image.Image) -> str:
    """Convert PIL Image to base64 data URL."""
    buffer = BytesIO()
    # Convert to RGB if necessary (e.g., RGBA images)
    if image.mode in ('RGBA', 'LA', 'P'):
        image = image.convert('RGB')
    image.save(buffer, format="JPEG", quality=85)
    b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def call_gemini(
    prompt: str,
    image: Optional[Image.Image] = None,
    max_tokens: int = None,
    json_mode: bool = False,
) -> dict:
    """
    Call Gemini with text and optional image.

    Returns:
        {
            "text": str,           # Response text
            "status": "success" | "token_limit" | "error",
            "error": str | None,
            "finish_reason": str | None,
        }
    """
    client = _get_client()
    max_tokens = max_tokens or cfg.LLM_MAX_TOKENS
    model = cfg.LLM_MODEL

    try:
        # Build messages
        if image:
            # Vision request with image
            content = [
                {"type": "text", "text": prompt},
                {
                    "type": "image_url",
                    "image_url": {"url": _image_to_base64(image)},
                },
            ]
            messages = [{"role": "user", "content": content}]
        else:
            # Text-only request
            messages = [{"role": "user", "content": prompt}]

        logger.debug(f"Calling LLM model={model} max_tokens={max_tokens} has_image={image is not None}")

        # Build request kwargs
        kwargs = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
        }

        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        response = client.chat.completions.create(**kwargs)

        # Extract response
        choice = response.choices[0]
        finish_reason = choice.finish_reason
        text = choice.message.content or ""

        logger.debug(f"LLM response: finish_reason={finish_reason} text_len={len(text)}")

        # Check for token limit
        if finish_reason == "length":
            logger.warning("LLM hit token limit")
            return {
                "text": text.strip(),
                "status": "token_limit",
                "error": None,
                "finish_reason": finish_reason,
            }

        return {
            "text": text.strip(),
            "status": "success",
            "error": None,
            "finish_reason": finish_reason,
        }

    except Exception as e:
        error_str = str(e)
        logger.error(f"LLM call failed: {error_str}")

        # Check if error indicates token limit
        if "length" in error_str.lower() or "token" in error_str.lower():
            return {
                "text": "",
                "status": "token_limit",
                "error": error_str,
                "finish_reason": "length",
            }

        return {
            "text": "",
            "status": "error",
            "error": error_str,
            "finish_reason": None,
        }


def call_vlm(
    prompt: str,
    image: Image.Image,
    max_tokens: int = None,
    json_mode: bool = False,
) -> dict:
    """Convenience wrapper for vision-language model calls."""
    max_tokens = max_tokens or cfg.LLM_MAX_TOKENS
    return call_gemini(prompt, image=image, max_tokens=max_tokens, json_mode=json_mode)


def call_text_llm(
    prompt: str,
    max_tokens: int = None,
    json_mode: bool = False,
) -> dict:
    """Convenience wrapper for text-only LLM calls."""
    max_tokens = max_tokens or cfg.LLM_MAX_TOKENS_TEXT
    return call_gemini(prompt, image=None, max_tokens=max_tokens, json_mode=json_mode)
