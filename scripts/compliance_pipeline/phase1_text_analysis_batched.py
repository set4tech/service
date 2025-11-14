#!/usr/bin/env python3
"""
Phase 1: Text-Based Compliance Analysis (BATCHED VERSION)

Batches 5 sections per API call for 5x speedup.
"""

import os
import sys
import json
import time
import argparse
import tempfile
from pathlib import Path
from typing import Dict, List
from concurrent.futures import ThreadPoolExecutor, as_completed

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from shared_utils import (
    get_supabase_client,
    fetch_assessment_and_checks,
    fetch_section_context,
    download_pdf_from_s3,
    extract_text_from_pdf,
    call_llm_with_retry,
    save_checkpoint,
    load_checkpoint,
    format_duration
)

BATCH_SIZE = 15  # Process 15 sections per API call


def build_batched_text_analysis_prompt(
    checks_batch: List[Dict],
    pdf_text: str,
    supabase
) -> str:
    """
    Build prompt for batched text analysis.

    Processes multiple sections in single API call.
    """
    sections_text = []
    for i, check in enumerate(checks_batch, 1):
        section_key = check['section']['key']
        section_number = check['code_section_number']
        section_title = check['code_section_title']

        # Fetch section context
        section_context = fetch_section_context(supabase, section_key)
        section_text = section_context.get('text', '')[:1500]  # Truncate to save tokens

        sections_text.append(f"""
{i}. SECTION {section_number}: {section_title}
{section_text}{"..." if len(section_context.get('text', '')) > 1500 else ""}
""")

    prompt = f"""You are a building code compliance expert. Analyze the following building code sections against the provided PDF text.

PDF TEXT (truncated to first 5000 chars):
{pdf_text[:5000]}...

CODE SECTIONS TO ANALYZE:
{''.join(sections_text)}

For EACH section, determine:
1. compliance_status: "compliant" | "non-compliant" | "not-applicable" | "unclear"
2. confidence: "high" | "medium" | "low"
3. reasoning: Brief explanation (1-2 sentences)
4. needs_visual_inspection: true if you need to see images/drawings to determine compliance
5. violations: Array of violations if non-compliant (can be empty)

IMPORTANT:
- "compliant" = PDF text clearly shows compliance
- "non-compliant" = PDF text clearly shows violation
- "not-applicable" = Section doesn't apply to this building type
- "unclear" = Cannot determine from text alone, needs visual inspection OR more info

Respond with JSON array, one object per section in order:
{{
  "results": [
    {{
      "section_index": 1,
      "compliance_status": "compliant|non-compliant|not-applicable|unclear",
      "confidence": "high|medium|low",
      "reasoning": "Brief explanation",
      "needs_visual_inspection": true|false,
      "violations": []
    }},
    {{
      "section_index": 2,
      "compliance_status": "...",
      "confidence": "...",
      "reasoning": "...",
      "needs_visual_inspection": true|false,
      "violations": []
    }},
    ...
  ]
}}

Remember: When you cannot determine from text alone, mark as "unclear" with needs_visual_inspection=true."""

    return prompt


def analyze_batch_text_only(
    checks_batch: List[Dict],
    pdf_text: str,
    supabase,
    model: str
) -> List[Dict]:
    """
    Analyze a batch of checks using text-only analysis.

    Returns list of dicts with:
        - check_id
        - section_number
        - compliance_status
        - confidence
        - reasoning
        - violations (if any)
        - needs_visual_inspection (bool)
    """
    start_time = time.time()

    # Build batch prompt
    prompt = build_batched_text_analysis_prompt(checks_batch, pdf_text, supabase)

    # Call LLM
    messages = [{"role": "user", "content": prompt}]
    ai_response = call_llm_with_retry(messages, model=model, response_format={"type": "json_object"})

    elapsed = time.time() - start_time

    # Parse results
    results = []
    batch_results = ai_response.get('results', [])

    for i, check in enumerate(checks_batch):
        # Find matching result by index
        result_data = next((r for r in batch_results if r.get('section_index') == i + 1), None)

        if result_data:
            result = {
                'check_id': check['id'],
                'section_number': check['code_section_number'],
                'section_title': check['code_section_title'],
                'compliance_status': result_data.get('compliance_status', 'unclear'),
                'confidence': result_data.get('confidence', 'low'),
                'reasoning': result_data.get('reasoning', 'No reasoning provided'),
                'violations': result_data.get('violations', []),
                'needs_visual_inspection': result_data.get('needs_visual_inspection', True),
                'execution_time_s': round(elapsed / len(checks_batch), 2)
            }
        else:
            # Fallback if result not found
            result = {
                'check_id': check['id'],
                'section_number': check['code_section_number'],
                'section_title': check['code_section_title'],
                'compliance_status': 'unclear',
                'confidence': 'low',
                'reasoning': 'Failed to parse AI response',
                'violations': [],
                'needs_visual_inspection': True,
                'execution_time_s': round(elapsed / len(checks_batch), 2)
            }

        results.append(result)

    print(f"  [BATCH] Processed {len(checks_batch)} sections in {elapsed:.1f}s ({elapsed/len(checks_batch):.2f}s each)")

    return results


def main():
    parser = argparse.ArgumentParser(description='Phase 1: Text-based compliance analysis (BATCHED)')
    parser.add_argument('--assessment-id', required=True, help='Assessment UUID')
    parser.add_argument('--env', default='prod', choices=['dev', 'prod'], help='Environment')
    parser.add_argument('--output', help='Output JSON path (default: results/<assessment-id>/text_results.json)')
    parser.add_argument('--prefilter-input', help='Phase 0 prefilter results (default: results/<assessment-id>/prefilter_results.json)')
    parser.add_argument('--model', default='gemini/gemini-2.0-flash-exp', help='LLM model to use')
    parser.add_argument('--limit', type=int, help='Limit number of checks (for testing)')
    parser.add_argument('--concurrency', type=int, default=3, help='Max concurrent API calls (lower to avoid rate limits)')
    parser.add_argument('--batch-size', type=int, default=BATCH_SIZE, help='Sections per API call')

    args = parser.parse_args()

    # Setup output directory
    results_dir = Path(__file__).parent / 'results' / args.assessment_id
    results_dir.mkdir(parents=True, exist_ok=True)

    output_path = args.output or (results_dir / 'text_results.json')
    checkpoint_path = str(output_path) + '.progress'

    # Path to prefilter results
    prefilter_path = args.prefilter_input or (results_dir / 'prefilter_results.json')

    print(f"=" * 80)
    print(f"PHASE 1: TEXT-BASED ANALYSIS (BATCHED)")
    print(f"=" * 80)
    print(f"Assessment ID: {args.assessment_id}")
    print(f"Environment:   {args.env}")
    print(f"Model:         {args.model}")
    print(f"Batch size:    {args.batch_size} sections/call")
    print(f"Output:        {output_path}")
    print(f"=" * 80)

    # Load checkpoint if exists
    checkpoint = load_checkpoint(checkpoint_path)
    if checkpoint:
        print(f"[RESUME] Found checkpoint with {len(checkpoint.get('conclusive', []))} conclusive, {len(checkpoint.get('needs_vision', []))} needs_vision")
        conclusive = checkpoint.get('conclusive', [])
        needs_vision = checkpoint.get('needs_vision', [])
        not_applicable = checkpoint.get('not_applicable', [])
        processed_ids = {r['check_id'] for r in conclusive + needs_vision + not_applicable}
    else:
        conclusive = []
        needs_vision = []
        not_applicable = []
        processed_ids = set()

    # Load prefilter results if they exist
    prefiltered_ids = set()
    if os.path.exists(prefilter_path):
        with open(prefilter_path, 'r') as f:
            prefilter_data = json.load(f)

        filtered_checks = prefilter_data.get('filtered', [])
        prefiltered_ids = {c['check_id'] for c in filtered_checks}

        # Add filtered checks to not_applicable list
        for filtered_check in filtered_checks:
            if filtered_check['check_id'] not in processed_ids:
                not_applicable.append({
                    'check_id': filtered_check['check_id'],
                    'section_number': filtered_check['section_number'],
                    'section_title': filtered_check['section_title'],
                    'compliance_status': 'not-applicable',
                    'confidence': 'high',
                    'reasoning': 'Filtered out in Phase 0 pre-filtering',
                    'violations': [],
                    'needs_visual_inspection': False,
                    'execution_time_s': 0
                })

        print(f"[PREFILTER] Loaded {len(filtered_checks)} pre-filtered checks")
        print(f"[PREFILTER] Will analyze {prefilter_data.get('relevant_count', 0)} relevant checks")
    else:
        print(f"[INFO] No prefilter results found at {prefilter_path}, will analyze all checks")

    # Connect to database
    supabase = get_supabase_client(args.env)

    # Fetch assessment and checks
    assessment, checks = fetch_assessment_and_checks(
        supabase,
        args.assessment_id,
        limit=args.limit
    )

    # Filter out already processed AND prefiltered
    checks_to_process = [
        c for c in checks
        if c['id'] not in processed_ids and c['id'] not in prefiltered_ids
    ]
    print(f"[INFO] {len(checks_to_process)} checks remaining to process")

    if not checks_to_process:
        print("[DONE] All checks already processed!")
        # Save final results even if nothing to process
        final_results = {
            'assessment_id': args.assessment_id,
            'phase': 'text_analysis',
            'model': args.model,
            'total_checks': len(checks),
            'processed': len(conclusive) + len(needs_vision) + len(not_applicable),
            'conclusive_count': len(conclusive),
            'needs_vision_count': len(needs_vision),
            'not_applicable_count': len(not_applicable),
            'execution_time_s': 0,
            'conclusive': conclusive,
            'needs_vision': needs_vision,
            'not_applicable': not_applicable
        }
        with open(output_path, 'w') as f:
            json.dump(final_results, f, indent=2)
        sys.exit(0)

    # Download and extract PDF text (or load from cache)
    text_file = results_dir / 'pdf_text.txt'
    pages_file = results_dir / 'pdf_pages.json'

    # Check if we already extracted text
    if text_file.exists() and pages_file.exists():
        print(f"[INFO] Loading cached PDF text from: {text_file}")
        with open(text_file, 'r') as f:
            full_text = f.read()
        with open(pages_file, 'r') as f:
            page_texts = json.load(f)
        print(f"[INFO] Loaded {len(full_text)} characters from cache")
    else:
        # Extract from PDF
        project = assessment['project']

        # Extract S3 key from PDF URL
        # URL format: https://set4-data.s3.us-east-1.amazonaws.com/analysis-app-data/pdfs/filename.pdf
        pdf_url = project['pdf_url']
        if 'amazonaws.com/' in pdf_url:
            pdf_s3_key = pdf_url.split('amazonaws.com/')[1]
        else:
            print(f"[ERROR] Unexpected PDF URL format: {pdf_url}")
            sys.exit(1)

        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_pdf:
            pdf_path = tmp_pdf.name

        download_pdf_from_s3(pdf_s3_key, pdf_path)
        full_text, page_texts = extract_text_from_pdf(pdf_path)

        # Save extracted text for future runs
        with open(text_file, 'w') as f:
            f.write(full_text)
        print(f"[INFO] Saved extracted text to: {text_file}")

        # Save page-by-page text
        with open(pages_file, 'w') as f:
            json.dump(page_texts, f, indent=2)

        # Cleanup temp PDF
        if os.path.exists(pdf_path):
            os.remove(pdf_path)

    # Group checks into batches
    batches = []
    for i in range(0, len(checks_to_process), args.batch_size):
        batch = checks_to_process[i:i+args.batch_size]
        batches.append(batch)

    print(f"[INFO] Created {len(batches)} batches of ~{args.batch_size} sections each")
    print(f"[INFO] Using {args.concurrency} parallel workers")

    # Process batches with parallel execution
    start_time = time.time()
    total_batches = len(batches)
    total_checks = len(checks_to_process)

    # Process in parallel with ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        # Submit all batch tasks
        future_to_batch = {
            executor.submit(analyze_batch_text_only, batch, full_text, supabase, args.model): (i, batch)
            for i, batch in enumerate(batches, 1)
        }

        # Process completed batches as they finish
        completed_batches = 0
        completed_checks = 0
        for future in as_completed(future_to_batch):
            i, batch = future_to_batch[future]

            try:
                batch_results = future.result()
                completed_batches += 1
                completed_checks += len(batch_results)

                # Calculate progress and ETA
                elapsed = time.time() - start_time
                rate = completed_checks / elapsed if elapsed > 0 else 0
                remaining = total_checks - completed_checks
                eta_seconds = remaining / rate if rate > 0 else 0
                eta_str = format_duration(eta_seconds)
                percent = (completed_checks / total_checks) * 100

                # Categorize results
                for result in batch_results:
                    if result['needs_visual_inspection'] or result['compliance_status'] == 'unclear':
                        needs_vision.append({
                            'check_id': result['check_id'],
                            'section_number': result['section_number'],
                            'section_title': result['section_title'],
                            'reasoning': result['reasoning']
                        })
                    elif result['compliance_status'] == 'not-applicable':
                        not_applicable.append(result)
                    else:
                        conclusive.append(result)

                print(f"[{completed_checks}/{total_checks}] {percent:.1f}% | ETA: {eta_str} | Batch {completed_batches}/{total_batches} | Rate: {rate:.1f} sections/s")

                # Checkpoint every 5 batches
                if completed_batches % 5 == 0:
                    save_checkpoint({
                        'assessment_id': args.assessment_id,
                        'conclusive': conclusive,
                        'needs_vision': needs_vision,
                        'not_applicable': not_applicable
                    }, checkpoint_path)

            except Exception as e:
                print(f"  [ERROR] Failed to process batch {i}: {e}")
                # On error, mark all as needs_vision (safe default)
                for check in batch:
                    needs_vision.append({
                        'check_id': check['id'],
                        'section_number': check['code_section_number'],
                        'section_title': check['code_section_title'],
                        'reasoning': f'Error during batch processing: {e}'
                    })
                continue

    # Save final results
    final_results = {
        'assessment_id': args.assessment_id,
        'phase': 'text_analysis',
        'model': args.model,
        'batch_size': args.batch_size,
        'total_checks': len(checks),
        'processed': len(conclusive) + len(needs_vision) + len(not_applicable),
        'conclusive_count': len(conclusive),
        'needs_vision_count': len(needs_vision),
        'not_applicable_count': len(not_applicable),
        'execution_time_s': round(time.time() - start_time, 2),
        'conclusive': conclusive,
        'needs_vision': needs_vision,
        'not_applicable': not_applicable
    }

    with open(output_path, 'w') as f:
        json.dump(final_results, f, indent=2)

    print(f"\n{'=' * 80}")
    print(f"PHASE 1 COMPLETE")
    print(f"{'=' * 80}")
    print(f"Total checks:      {final_results['total_checks']}")
    print(f"Conclusive:        {final_results['conclusive_count']}")
    print(f"Not applicable:    {final_results['not_applicable_count']}")
    print(f"Needs vision:      {final_results['needs_vision_count']}")
    print(f"Execution time:    {format_duration(final_results['execution_time_s'])}")
    print(f"Output saved to:   {output_path}")
    print(f"{'=' * 80}")

    # Remove checkpoint
    if os.path.exists(checkpoint_path):
        os.remove(checkpoint_path)


if __name__ == '__main__':
    main()
