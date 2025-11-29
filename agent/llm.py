"""
LLM client management for the agent service.

Provides a unified interface for calling different LLM providers.
"""
import os
import logging
from typing import Optional
from PIL import Image

import google.generativeai as genai

logger = logging.getLogger(__name__)

# Singleton clients
_gemini_model: Optional[genai.GenerativeModel] = None


def get_gemini(model_name: str = "gemini-2.0-flash") -> genai.GenerativeModel:
    """Get or create Gemini model client."""
    global _gemini_model

    if _gemini_model is None:
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY environment variable required")

        genai.configure(api_key=api_key)
        _gemini_model = genai.GenerativeModel(model_name)
        logger.info(f"Initialized Gemini model: {model_name}")

    return _gemini_model


def call_gemini(
    prompt: str,
    image: Optional[Image.Image] = None,
    max_tokens: int = 8000,
    json_mode: bool = False,
) -> dict:
    """
    Call Gemini with text and optional image.

    Returns:
        {
            "text": str,           # Response text
            "status": "success" | "token_limit" | "error",
            "error": str | None,
            "finish_reason": int | None,
        }
    """
    model = get_gemini()

    try:
        # Build content
        content = [prompt]
        if image:
            content.append(image)

        # Build config
        config = genai.GenerationConfig(max_output_tokens=max_tokens)
        if json_mode:
            config = genai.GenerationConfig(
                max_output_tokens=max_tokens,
                response_mime_type="application/json"
            )

        response = model.generate_content(content, generation_config=config)

        # Check finish reason (2 = MAX_TOKENS)
        finish_reason = response.candidates[0].finish_reason if response.candidates else None

        if finish_reason == 2:
            logger.warning("Gemini hit token limit")
            return {
                "text": response.text if response.text else "",
                "status": "token_limit",
                "error": None,
                "finish_reason": finish_reason,
            }

        return {
            "text": response.text.strip(),
            "status": "success",
            "error": None,
            "finish_reason": finish_reason,
        }

    except Exception as e:
        error_str = str(e)
        logger.error(f"Gemini call failed: {error_str}")

        # Check if error is token limit (sometimes raises instead of returning)
        if "finish_reason" in error_str and "2" in error_str:
            return {
                "text": "",
                "status": "token_limit",
                "error": error_str,
                "finish_reason": 2,
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
    max_tokens: int = 8000,
    json_mode: bool = False,
) -> dict:
    """Convenience wrapper for vision-language model calls."""
    return call_gemini(prompt, image=image, max_tokens=max_tokens, json_mode=json_mode)
