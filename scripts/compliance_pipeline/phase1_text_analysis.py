#!/usr/bin/env python3
"""
Phase 1: Text-Based Compliance Analysis

Analyzes all checks using only PDF text extraction (no images).
Outputs JSON with two categories:
  - conclusive: Checks with definitive answers from text
  - needs_vision: Checks requiring visual inspection

This is the fastest, cheapest phase that filters out ~80-90% of checks.
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
    build_text_analysis_prompt,
    save_checkpoint,
    load_checkpoint,
    format_duration
)


def analyze_check_text_only(
    check: Dict,
    pdf_text: str,
    supabase,
    model: str
) -> Dict:
    """
    Analyze a single check using text-only analysis.

    Returns dict with:
        - check_id
        - section_number
        - compliance_status
        - confidence
        - reasoning
        - violations (if any)
        - needs_visual_inspection (bool)
    """
    check_id = check['id']
    section = check['section']
    section_key = section['key']
    section_number = check['code_section_number']

    print(f"  [TEXT] {section_number}: {check['code_section_title']}")

    start_time = time.time()

    # Fetch section context
    section_context = fetch_section_context(supabase, section_key)

    # Build prompt
    prompt = build_text_analysis_prompt(section_context, pdf_text)

    # Call LLM
    messages = [{"role": "user", "content": prompt}]
    ai_response = call_llm_with_retry(messages, model=model)

    elapsed = time.time() - start_time

    result = {
        'check_id': check_id,
        'section_number': section_number,
        'section_title': check['code_section_title'],
        'compliance_status': ai_response.get('compliance_status'),
        'confidence': ai_response.get('confidence'),
        'reasoning': ai_response.get('reasoning'),
        'violations': ai_response.get('violations', []),
        'needs_visual_inspection': ai_response.get('needs_visual_inspection', False),
        'execution_time_s': round(elapsed, 2)
    }

    print(f"    → {result['compliance_status']} ({result['confidence']}) [{elapsed:.1f}s]")

    return result


def main():
    parser = argparse.ArgumentParser(description='Phase 1: Text-based compliance analysis')
    parser.add_argument('--assessment-id', required=True, help='Assessment UUID')
    parser.add_argument('--env', default='prod', choices=['dev', 'prod'], help='Environment')
    parser.add_argument('--output', help='Output JSON path (default: results/<assessment-id>/text_results.json)')
    parser.add_argument('--prefilter-input', help='Phase 0 prefilter results (default: results/<assessment-id>/prefilter_results.json)')
    parser.add_argument('--model', default='gemini/gemini-2.0-flash-exp', help='LLM model to use')
    parser.add_argument('--limit', type=int, help='Limit number of checks (for testing)')
    parser.add_argument('--concurrency', type=int, default=5, help='Max concurrent LLM calls')

    args = parser.parse_args()

    # Setup output directory
    results_dir = Path(__file__).parent / 'results' / args.assessment_id
    results_dir.mkdir(parents=True, exist_ok=True)

    output_path = args.output or (results_dir / 'text_results.json')
    checkpoint_path = str(output_path) + '.progress'
    
    # Path to prefilter results
    prefilter_path = args.prefilter_input or (results_dir / 'prefilter_results.json')

    print(f"=" * 80)
    print(f"PHASE 1: TEXT-BASED ANALYSIS")
    print(f"=" * 80)
    print(f"Assessment ID: {args.assessment_id}")
    print(f"Environment:   {args.env}")
    print(f"Model:         {args.model}")
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

    # Process checks with parallel execution
    start_time = time.time()
    total_checks = len(checks_to_process)

    print(f"[INFO] Using {args.concurrency} parallel workers")

    # Process in parallel with ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        # Submit all tasks
        future_to_check = {
            executor.submit(analyze_check_text_only, check, full_text, supabase, args.model): (i, check)
            for i, check in enumerate(checks_to_process, 1)
        }

        # Process completed tasks as they finish
        for future in as_completed(future_to_check):
            i, check = future_to_check[future]

            try:
                result = future.result()

                print(f"[{i}/{total_checks}] Completed: {result['section_number']} → {result['compliance_status']}")

                # Categorize result
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

                # Checkpoint every 10 items
                if i % 10 == 0:
                    save_checkpoint({
                        'assessment_id': args.assessment_id,
                        'conclusive': conclusive,
                        'needs_vision': needs_vision,
                        'not_applicable': not_applicable
                    }, checkpoint_path)

            except Exception as e:
                print(f"  [ERROR] Failed to process check {check['id']}: {e}")
                continue

    # Save final results
    final_results = {
        'assessment_id': args.assessment_id,
        'phase': 'text_analysis',
        'model': args.model,
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
