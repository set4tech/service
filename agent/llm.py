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

import asyncio
import random

from openai import OpenAI, AsyncOpenAI

import config as cfg  # Avoid shadowing with local 'config' var

logger = logging.getLogger(__name__)

# Singleton clients
_openai_client: Optional[OpenAI] = None
_async_openai_client: Optional[AsyncOpenAI] = None


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


# ============================================
# Async LLM Functions
# ============================================

def _get_async_client() -> AsyncOpenAI:
    """Get or create AsyncOpenAI client (configured for Gemini via Helicone or direct)."""
    global _async_openai_client

    if _async_openai_client is not None:
        return _async_openai_client

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY environment variable required")

    # Check if Helicone is enabled
    helicone_enabled = cfg.HELICONE_ENABLED and cfg.HELICONE_API_KEY

    if helicone_enabled:
        logger.info("Initializing async LLM client with Helicone observability")
        _async_openai_client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://gateway.helicone.ai/v1beta/openai",
            default_headers={
                "Helicone-Auth": f"Bearer {cfg.HELICONE_API_KEY}",
                "Helicone-Target-URL": "https://generativelanguage.googleapis.com",
                "Helicone-Target-Provider": "Google",
            },
        )
    else:
        logger.info("Initializing async LLM client (direct, no Helicone)")
        _async_openai_client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        )

    return _async_openai_client


async def call_gemini_async(
    prompt: str,
    image: Optional[Image.Image] = None,
    max_tokens: int = None,
    json_mode: bool = False,
) -> dict:
    """
    Async version: Call Gemini with text and optional image.

    Returns:
        {
            "text": str,
            "status": "success" | "token_limit" | "error",
            "error": str | None,
            "finish_reason": str | None,
        }
    """
    client = _get_async_client()
    max_tokens = max_tokens or cfg.LLM_MAX_TOKENS
    model = cfg.LLM_MODEL

    try:
        # Build messages
        if image:
            content = [
                {"type": "text", "text": prompt},
                {
                    "type": "image_url",
                    "image_url": {"url": _image_to_base64(image)},
                },
            ]
            messages = [{"role": "user", "content": content}]
        else:
            messages = [{"role": "user", "content": prompt}]

        logger.debug(f"Async calling LLM model={model} max_tokens={max_tokens} has_image={image is not None}")

        kwargs = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
        }

        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        response = await client.chat.completions.create(**kwargs)

        choice = response.choices[0]
        finish_reason = choice.finish_reason
        text = choice.message.content or ""

        logger.debug(f"Async LLM response: finish_reason={finish_reason} text_len={len(text)}")

        if finish_reason == "length":
            logger.warning("Async LLM hit token limit")
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
        logger.error(f"Async LLM call failed: {error_str}")

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


async def call_vlm_async(
    prompt: str,
    image: Image.Image,
    max_tokens: int = None,
    json_mode: bool = False,
) -> dict:
    """Async convenience wrapper for vision-language model calls."""
    max_tokens = max_tokens or cfg.LLM_MAX_TOKENS
    return await call_gemini_async(prompt, image=image, max_tokens=max_tokens, json_mode=json_mode)


async def call_text_llm_async(
    prompt: str,
    max_tokens: int = None,
    json_mode: bool = False,
) -> dict:
    """Async convenience wrapper for text-only LLM calls."""
    max_tokens = max_tokens or cfg.LLM_MAX_TOKENS_TEXT
    return await call_gemini_async(prompt, image=None, max_tokens=max_tokens, json_mode=json_mode)


async def call_vlm_async_with_retry(
    prompt: str,
    image: Image.Image,
    max_tokens: int = None,
    json_mode: bool = False,
    max_retries: int = None,
    base_delay: float = None,
) -> dict:
    """
    Async VLM call with exponential backoff retry for rate limits.

    Args:
        prompt: The prompt text
        image: PIL Image to analyze
        max_tokens: Maximum tokens for response
        json_mode: Whether to request JSON output
        max_retries: Max retry attempts (default from config)
        base_delay: Base delay in seconds for exponential backoff (default from config)

    Returns:
        LLM response dict
    """
    max_retries = max_retries or cfg.PARALLEL_RATE_LIMIT_RETRY
    base_delay = base_delay or cfg.PARALLEL_RATE_LIMIT_BASE_DELAY

    for attempt in range(max_retries + 1):
        result = await call_vlm_async(prompt, image, max_tokens=max_tokens, json_mode=json_mode)

        if result["status"] != "error":
            return result

        # Check if it's a rate limit error
        error_str = result.get("error", "").lower()
        is_rate_limit = any(x in error_str for x in ["rate", "limit", "429", "quota", "resource_exhausted"])

        if not is_rate_limit or attempt >= max_retries:
            return result

        # Exponential backoff with jitter
        delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
        logger.warning(f"Rate limit hit, retrying in {delay:.1f}s (attempt {attempt + 1}/{max_retries})")
        await asyncio.sleep(delay)

    return result


async def call_text_llm_async_with_retry(
    prompt: str,
    max_tokens: int = None,
    json_mode: bool = False,
    max_retries: int = None,
    base_delay: float = None,
) -> dict:
    """
    Async text LLM call with exponential backoff retry for rate limits.

    Args:
        prompt: The prompt text
        max_tokens: Maximum tokens for response
        json_mode: Whether to request JSON output
        max_retries: Max retry attempts (default from config)
        base_delay: Base delay in seconds for exponential backoff (default from config)

    Returns:
        LLM response dict
    """
    max_retries = max_retries or cfg.PARALLEL_RATE_LIMIT_RETRY
    base_delay = base_delay or cfg.PARALLEL_RATE_LIMIT_BASE_DELAY

    for attempt in range(max_retries + 1):
        result = await call_text_llm_async(prompt, max_tokens=max_tokens, json_mode=json_mode)

        if result["status"] != "error":
            return result

        # Check if it's a rate limit error
        error_str = result.get("error", "").lower()
        is_rate_limit = any(x in error_str for x in ["rate", "limit", "429", "quota", "resource_exhausted"])

        if not is_rate_limit or attempt >= max_retries:
            return result

        # Exponential backoff with jitter
        delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
        logger.warning(f"Rate limit hit, retrying in {delay:.1f}s (attempt {attempt + 1}/{max_retries})")
        await asyncio.sleep(delay)

    return result
