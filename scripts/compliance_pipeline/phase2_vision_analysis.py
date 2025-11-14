#!/usr/bin/env python3
"""
Phase 2: Vision-Based Compliance Analysis

Reads text_results.json from Phase 1 and performs vision analysis ONLY on
checks flagged as needing visual inspection.

Workflow:
  1. Load needs_vision list from Phase 1 JSON
  2. For each check, extract keywords from section title
  3. Search PDF pages for keyword matches
  4. If MIN_KEYWORD_SCORE met: extract top 3 images and run VLM
  5. If no keywords found: mark as 'not-applicable'

Outputs vision_results.json with:
  - analyzed: Checks that got VLM analysis
  - not_applicable: Checks filtered out by keyword search
"""

import os
import sys
import json
import time
import argparse
import tempfile
import base64
from pathlib import Path
from typing import Dict, List, Tuple
from io import BytesIO
from PIL import Image
from pdf2image import convert_from_path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from shared_utils import (
    get_supabase_client,
    fetch_section_context,
    download_pdf_from_s3,
    call_llm_with_retry,
    save_checkpoint,
    load_checkpoint,
    format_duration
)

# Configuration
MIN_KEYWORD_SCORE = 2  # Minimum keyword matches to trigger vision analysis
MAX_IMAGES = 3  # Max images to send to VLM
IMAGE_DPI = 150  # DPI for PDF to image conversion


def extract_keywords_from_section(section_context: Dict) -> List[str]:
    """
    Extract relevant keywords from section title and text.

    Returns list of keywords to search for in PDF.
    """
    main = section_context['main_section']
    title = main.get('title', '').lower()
    text = main.get('text', '')[:500].lower()

    keywords = []

    # Skip common words
    common_words = {
        'the', 'a', 'an', 'and', 'or', 'of', 'in', 'for', 'to', 'with',
        'general', 'requirements', 'minimum', 'maximum', 'shall', 'must'
    }

    # Extract title words (filtered)
    title_words = [
        w.strip('.,;:') for w in title.split()
        if len(w) > 3 and w.strip('.,;:') not in common_words
    ]
    keywords.extend(title_words[:5])

    # Look for specific building elements and features
    element_patterns = [
        'door', 'window', 'ramp', 'stair', 'elevator', 'toilet', 'sink', 'grab bar',
        'corridor', 'hallway', 'exit', 'egress', 'sign', 'lighting', 'floor', 'ceiling',
        'wall', 'parking', 'path', 'route', 'accessible', 'clearance', 'width', 'height',
        'slope', 'counter', 'table', 'bench', 'shower', 'bathtub', 'urinal', 'lavatory'
    ]

    for pattern in element_patterns:
        if pattern in title or pattern in text:
            keywords.append(pattern)

    # Deduplicate and limit
    return list(set(keywords))[:10]


def search_pdf_for_keywords(
    page_texts: Dict[int, str],
    keywords: List[str]
) -> List[Tuple[int, int, str]]:
    """
    Search PDF pages for keywords.

    Returns list of (page_num, match_count, top_keyword) sorted by match count.
    """
    page_scores = {}

    for page_num, text in page_texts.items():
        text_lower = text.lower()
        page_scores[page_num] = {}

        for keyword in keywords:
            count = text_lower.count(keyword.lower())
            if count > 0:
                page_scores[page_num][keyword] = count

    # Build results
    results = []
    for page_num, matches in page_scores.items():
        total_matches = sum(matches.values())
        if total_matches > 0:
            top_keyword = max(matches.items(), key=lambda x: x[1])[0]
            results.append((page_num, total_matches, top_keyword))

    # Sort by match count descending
    results.sort(key=lambda x: x[1], reverse=True)

    return results


def convert_pages_to_images(
    pdf_path: str,
    page_numbers: List[int]
) -> List[str]:
    """
    Convert specific PDF pages to base64-encoded JPEG images.

    Args:
        pdf_path: Path to PDF file
        page_numbers: List of page numbers (1-indexed)

    Returns:
        List of base64-encoded image strings
    """
    print(f"    [IMG] Converting pages {page_numbers} to images...")

    images = convert_from_path(
        pdf_path,
        dpi=IMAGE_DPI,
        first_page=min(page_numbers),
        last_page=max(page_numbers)
    )

    # Filter to only requested pages
    page_range = range(min(page_numbers), max(page_numbers) + 1)
    filtered_images = [
        images[i] for i, page in enumerate(page_range)
        if page in page_numbers
    ]

    # Convert to base64
    base64_images = []
    for img in filtered_images:
        # Convert to RGB if needed
        if img.mode != 'RGB':
            img = img.convert('RGB')

        # Compress to JPEG
        buffer = BytesIO()
        img.save(buffer, format='JPEG', quality=85)
        buffer.seek(0)

        # Encode to base64
        img_base64 = base64.b64encode(buffer.read()).decode('utf-8')
        base64_images.append(img_base64)

    print(f"    [IMG] Converted {len(base64_images)} images")
    return base64_images


def build_vision_prompt(
    section_context: Dict,
    keywords: List[str]
) -> str:
    """Build prompt for vision-based compliance analysis."""
    main = section_context['main_section']
    parents = section_context['parent_sections']

    prompt_parts = [
        "You are a building code compliance expert analyzing architectural drawings.",
        "",
        f"**CODE SECTION {main['number']}: {main['title']}**",
        main['text'],
        ""
    ]

    # Add parent context
    if parents:
        prompt_parts.append("**PARENT SECTIONS (for context):**")
        for parent in reversed(parents):
            prompt_parts.append(f"- {parent['number']}: {parent['title']}")
        prompt_parts.append("")

    # Add keywords
    prompt_parts.extend([
        f"**SEARCH KEYWORDS:** {', '.join(keywords)}",
        "",
        "**TASK:**",
        "Analyze the provided drawings for compliance with the code section above.",
        "",
        "Respond with JSON:",
        "{",
        '  "compliance_status": "compliant|non-compliant|unclear|not-applicable",',
        '  "confidence": "high|medium|low",',
        '  "reasoning": "Brief explanation of what you see in the drawings",',
        '  "violations": [{"severity": "major|minor", "description": "...", "location": "page X"}],',
        '  "pages_analyzed": [1, 2, 3]',
        "}",
        "",
        "IMPORTANT:",
        "- Focus on visual elements: dimensions, clearances, layouts, signage",
        "- If drawings don't show relevant features, set compliance_status='not-applicable'",
        "- Cite specific page numbers in violations",
        "- Be thorough but concise"
    ])

    return "\n".join(prompt_parts)


def analyze_check_with_vision(
    check_data: Dict,
    pdf_path: str,
    page_texts: Dict[int, str],
    supabase,
    model: str
) -> Dict:
    """
    Perform vision analysis on a single check.

    Returns dict with analysis results or indication that it's not applicable.
    """
    check_id = check_data['check_id']
    section_number = check_data['section_number']

    print(f"  [VISION] {section_number}")

    # Fetch section context
    check_response = supabase.table('checks').select('section:sections(key)').eq('id', check_id).single().execute()
    section_key = check_response.data['section']['key']

    section_context = fetch_section_context(supabase, section_key)

    # Extract keywords
    keywords = extract_keywords_from_section(section_context)
    print(f"    Keywords: {keywords}")

    # Search for keywords in PDF
    search_results = search_pdf_for_keywords(page_texts, keywords)

    if not search_results or search_results[0][1] < MIN_KEYWORD_SCORE:
        # Not enough keyword matches
        print(f"    → not-applicable (keyword score: {search_results[0][1] if search_results else 0})")
        return {
            'check_id': check_id,
            'section_number': section_number,
            'compliance_status': 'not-applicable',
            'confidence': 'high',
            'reasoning': f"Keywords {keywords} not found in drawings. Section likely does not apply to this project.",
            'keyword_score': search_results[0][1] if search_results else 0
        }

    # Extract top pages with matches
    top_pages = [result[0] for result in search_results[:MAX_IMAGES]]
    print(f"    Top pages: {top_pages} (scores: {[r[1] for r in search_results[:MAX_IMAGES]]})")

    start_time = time.time()

    # Convert pages to images
    images_base64 = convert_pages_to_images(pdf_path, top_pages)

    # Build vision prompt
    prompt_text = build_vision_prompt(section_context, keywords)

    # Build messages with images (Gemini format)
    content_parts = [{"type": "text", "text": prompt_text}]

    for i, img_b64 in enumerate(images_base64):
        content_parts.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{img_b64}"
            }
        })

    messages = [{"role": "user", "content": content_parts}]

    # Call VLM
    try:
        ai_response = call_llm_with_retry(messages, model=model)
    except Exception as e:
        print(f"    [ERROR] VLM call failed: {e}")
        return {
            'check_id': check_id,
            'section_number': section_number,
            'error': str(e),
            'keywords': keywords,
            'pages_attempted': top_pages
        }

    elapsed = time.time() - start_time

    result = {
        'check_id': check_id,
        'section_number': section_number,
        'section_title': check_data['section_title'],
        'compliance_status': ai_response.get('compliance_status'),
        'confidence': ai_response.get('confidence'),
        'reasoning': ai_response.get('reasoning'),
        'violations': ai_response.get('violations', []),
        'pages_analyzed': top_pages,
        'keywords': keywords,
        'execution_time_s': round(elapsed, 2)
    }

    print(f"    → {result['compliance_status']} ({result['confidence']}) [{elapsed:.1f}s]")

    return result


def main():
    parser = argparse.ArgumentParser(description='Phase 2: Vision-based compliance analysis')
    parser.add_argument('--input', required=True, help='Input JSON from Phase 1 (text_results.json)')
    parser.add_argument('--output', help='Output JSON path (default: vision_results.json in same dir)')
    parser.add_argument('--model', default='gemini/gemini-2.0-flash-exp', help='VLM model to use')
    parser.add_argument('--concurrency', type=int, default=2, help='Max concurrent VLM calls (keep low!)')
    parser.add_argument('--min-keyword-score', type=int, default=MIN_KEYWORD_SCORE, help='Min keyword matches')

    args = parser.parse_args()

    # Load Phase 1 results
    with open(args.input, 'r') as f:
        phase1_results = json.load(f)

    assessment_id = phase1_results['assessment_id']
    needs_vision = phase1_results.get('needs_vision', [])

    if not needs_vision:
        print("[INFO] No checks need vision analysis!")
        sys.exit(0)

    # Setup output
    input_path = Path(args.input)
    output_path = args.output or (input_path.parent / 'vision_results.json')
    checkpoint_path = str(output_path) + '.progress'

    print(f"=" * 80)
    print(f"PHASE 2: VISION-BASED ANALYSIS")
    print(f"=" * 80)
    print(f"Assessment ID: {assessment_id}")
    print(f"Input:         {args.input}")
    print(f"Output:        {output_path}")
    print(f"Model:         {args.model}")
    print(f"Checks:        {len(needs_vision)}")
    print(f"=" * 80)

    # Load checkpoint if exists
    checkpoint = load_checkpoint(checkpoint_path)
    if checkpoint:
        analyzed = checkpoint.get('analyzed', [])
        not_applicable = checkpoint.get('not_applicable', [])
        processed_ids = {r['check_id'] for r in analyzed + not_applicable}
    else:
        analyzed = []
        not_applicable = []
        processed_ids = set()

    # Filter out already processed
    checks_to_process = [c for c in needs_vision if c['check_id'] not in processed_ids]
    print(f"[INFO] {len(checks_to_process)} checks remaining")

    if not checks_to_process:
        print("[DONE] All checks already processed!")
        sys.exit(0)

    # Connect to database
    supabase = get_supabase_client('prod')  # Hardcode to prod for now

    # Download PDF (reuse from Phase 1 if possible)
    # For now, we'll fetch it again
    assessment_response = supabase.table('assessments').select(
        '*, project:projects(*)'
    ).eq('id', assessment_id).single().execute()

    assessment = assessment_response.data
    project = assessment['project']

    # Extract S3 key from PDF URL
    pdf_url = project['pdf_url']
    if 'amazonaws.com/' in pdf_url:
        pdf_s3_key = pdf_url.split('amazonaws.com/')[1]
    else:
        print(f"[ERROR] Unexpected PDF URL format: {pdf_url}")
        sys.exit(1)

    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_pdf:
        pdf_path = tmp_pdf.name

    try:
        download_pdf_from_s3(pdf_s3_key, pdf_path)

        # Load page texts from Phase 1
        pages_file = input_path.parent / 'pdf_pages.json'
        with open(pages_file, 'r') as f:
            page_texts = json.load(f)
            # Convert keys to int
            page_texts = {int(k): v for k, v in page_texts.items()}

        # Process checks
        start_time = time.time()
        total_checks = len(checks_to_process)

        for i, check_data in enumerate(checks_to_process, 1):
            print(f"\n[{i}/{total_checks}] Processing check...")

            try:
                result = analyze_check_with_vision(
                    check_data,
                    pdf_path,
                    page_texts,
                    supabase,
                    args.model
                )

                # Categorize result
                if result.get('compliance_status') == 'not-applicable':
                    not_applicable.append(result)
                else:
                    analyzed.append(result)

                # Checkpoint every 5 items (VLM is slow)
                if i % 5 == 0:
                    save_checkpoint({
                        'assessment_id': assessment_id,
                        'analyzed': analyzed,
                        'not_applicable': not_applicable
                    }, checkpoint_path)

            except Exception as e:
                print(f"  [ERROR] Failed: {e}")
                continue

        # Save final results
        final_results = {
            'assessment_id': assessment_id,
            'phase': 'vision_analysis',
            'model': args.model,
            'total_checks': len(needs_vision),
            'analyzed_count': len(analyzed),
            'not_applicable_count': len(not_applicable),
            'execution_time_s': round(time.time() - start_time, 2),
            'analyzed': analyzed,
            'not_applicable': not_applicable
        }

        with open(output_path, 'w') as f:
            json.dump(final_results, f, indent=2)

        print(f"\n{'=' * 80}")
        print(f"PHASE 2 COMPLETE")
        print(f"{'=' * 80}")
        print(f"Total checks:      {final_results['total_checks']}")
        print(f"Analyzed:          {final_results['analyzed_count']}")
        print(f"Not applicable:    {final_results['not_applicable_count']}")
        print(f"Execution time:    {format_duration(final_results['execution_time_s'])}")
        print(f"Output saved to:   {output_path}")
        print(f"{'=' * 80}")

        # Remove checkpoint
        if os.path.exists(checkpoint_path):
            os.remove(checkpoint_path)

    finally:
        # Cleanup temp PDF
        if os.path.exists(pdf_path):
            os.remove(pdf_path)


if __name__ == '__main__':
    main()
