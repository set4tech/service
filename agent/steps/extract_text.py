"""
Text Extraction Pipeline Step

Extracts text from each page of the PDF using PyMuPDF.
Optionally cleans the text using an LLM (handles messy CAD drawing text).
"""
import logging
from pathlib import Path

import fitz  # PyMuPDF

from pipeline import PipelineStep, PipelineContext
from llm import call_text_llm

# Suppress MuPDF warnings
fitz.TOOLS.mupdf_display_errors(False)

logger = logging.getLogger(__name__)

CLEANING_PROMPT = """You are cleaning up text extracted from an architectural PDF drawing.
The text is messy because it was extracted from CAD drawings with labels, dimensions, and notes scattered spatially.

Your job:
1. Remove random fragments, isolated numbers, and meaningless sequences
2. Organize the readable content into coherent sections
3. Preserve important information: room names, specifications, notes, code references, dimensions where meaningful
4. Remove duplicate content
5. If the page is mostly dimensions/grid lines with no meaningful text, just summarize what type of drawing it appears to be

Return ONLY the cleaned text, no explanations."""


def extract_text_from_page(page: fitz.Page) -> str:
    """Extract raw text from a PDF page."""
    return page.get_text()


def clean_text_with_llm(raw_text: str, page_num: int) -> str:
    """Use LLM to clean up messy PDF text."""
    if not raw_text or len(raw_text.strip()) < 50:
        return raw_text.strip() if raw_text else ""

    prompt = f"{CLEANING_PROMPT}\n\nPage {page_num} text to clean:\n\n{raw_text[:15000]}"

    result = call_text_llm(prompt, max_tokens=4000)

    if result["status"] == "success":
        return result["text"].strip()
    else:
        logger.warning(f"LLM cleaning failed for page {page_num}: {result.get('error')}")
        return raw_text


class ExtractText(PipelineStep):
    """
    Pipeline step to extract text from PDF pages.

    Uses PyMuPDF for raw extraction, then optionally cleans with LLM.
    """

    name = "extract_text"

    def __init__(self, clean_with_llm: bool = True, min_text_length: int = 50):
        """
        Args:
            clean_with_llm: Whether to use LLM to clean messy text
            min_text_length: Skip LLM cleaning for pages with less text than this
        """
        self.clean_with_llm = clean_with_llm
        self.min_text_length = min_text_length

    def process(self, ctx: PipelineContext) -> PipelineContext:
        """Extract text from all pages in the PDF."""
        pdf_path = ctx.metadata.get("pdf_path")

        if not pdf_path:
            logger.warning("No pdf_path in metadata, skipping text extraction")
            ctx.metadata["extracted_text"] = {}
            return ctx

        pdf_path = Path(pdf_path)
        if not pdf_path.exists():
            logger.warning(f"PDF not found: {pdf_path}")
            ctx.metadata["extracted_text"] = {}
            return ctx

        logger.info(f"Extracting text from {pdf_path}")

        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        extracted_text = {}

        for page_num in range(total_pages):
            page = doc[page_num]
            page_key = page_num + 1  # 1-indexed for consistency

            # Extract raw text
            raw_text = extract_text_from_page(page)

            page_data = {
                "raw_text": raw_text,
                "char_count": len(raw_text),
            }

            # Clean with LLM if enabled and text is substantial
            if self.clean_with_llm and len(raw_text) >= self.min_text_length:
                logger.info(f"  Page {page_key}: {len(raw_text):,} chars, cleaning with LLM...")
                cleaned_text = clean_text_with_llm(raw_text, page_key)
                page_data["cleaned_text"] = cleaned_text
                page_data["cleaned_char_count"] = len(cleaned_text)
                logger.info(f"    -> {len(cleaned_text):,} chars after cleaning")
            else:
                page_data["cleaned_text"] = raw_text.strip()
                page_data["cleaned_char_count"] = len(page_data["cleaned_text"])
                if len(raw_text) < self.min_text_length:
                    logger.info(f"  Page {page_key}: {len(raw_text):,} chars (below threshold, skipping LLM)")
                else:
                    logger.info(f"  Page {page_key}: {len(raw_text):,} chars (LLM disabled)")

            extracted_text[page_key] = page_data

        doc.close()

        # Store results in metadata
        ctx.metadata["extracted_text"] = extracted_text
        ctx.metadata["text_pages_processed"] = total_pages

        # Calculate summary
        total_chars = sum(p["char_count"] for p in extracted_text.values())
        total_cleaned_chars = sum(p["cleaned_char_count"] for p in extracted_text.values())

        logger.info(f"  Total: {total_pages} pages, {total_chars:,} raw chars, {total_cleaned_chars:,} cleaned chars")

        return ctx
