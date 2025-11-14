#!/usr/bin/env python3
"""
Phase 0: Pre-Filtering

Uses a fast, cheap LLM to quickly filter out sections that are DEFINITELY NOT relevant
to the specific project before running expensive text/vision analysis.

This phase is optimized for:
- Speed: Uses fastest available model (gemini-2.0-flash-thinking-exp or gpt-4o-mini)
- Cost: Minimal tokens, simple prompts
- Recall: Only filters out OBVIOUSLY irrelevant sections (high confidence)

Example: For a warehouse (S-1), we can filter out:
- Residential requirements (Group R)
- Assembly requirements (Group A)
- Educational requirements (Group E)
- Healthcare requirements (Group I-2)
- Kitchen/cooking requirements
- Sleeping rooms
- etc.
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path
from typing import Dict, List
from concurrent.futures import ThreadPoolExecutor, as_completed

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from shared_utils import (
    get_supabase_client,
    fetch_assessment_and_checks,
    call_llm_with_retry,
    save_checkpoint,
    load_checkpoint,
    format_duration
)

# Use the fastest, cheapest model for pre-filtering
PREFILTER_MODEL = 'gemini/gemini-2.0-flash-thinking-exp-1219'


def build_prefilter_prompt(
    section_number: str,
    section_title: str,
    section_text: str,
    project_context: Dict
) -> str:
    """
    Build a minimal prompt for pre-filtering.
    
    Focus: Is this section DEFINITELY NOT relevant to this specific project?
    """
    prompt = f"""You are a building code expert doing INITIAL FILTERING.

PROJECT CONTEXT:
- Name: {project_context.get('name', 'Unknown')}
- Occupancy: {project_context.get('occupancy', 'Unknown')}
- Type: {project_context.get('building_type', 'Unknown')}
- Size: {project_context.get('size', 'Unknown')}
- Description: {project_context.get('description', '')}

CODE SECTION: {section_number} - {section_title}
{section_text[:1000]}{"..." if len(section_text) > 1000 else ""}

TASK: Is this code section DEFINITELY NOT relevant to this project?

Only mark as irrelevant if you are HIGHLY CONFIDENT the section does not apply.
When in doubt, mark as relevant (we'll analyze it in detail later).

Examples of DEFINITELY IRRELEVANT (for a warehouse):
- Residential sleeping room requirements
- Assembly seating requirements
- School classroom requirements
- Hospital/care facility requirements
- Multi-family dwelling requirements
- Hotel guest room requirements

Examples of RELEVANT or UNCERTAIN (analyze later):
- General accessibility requirements (might apply)
- Egress/exit requirements (apply to all buildings)
- Fire safety (apply to all buildings)
- Structural requirements (apply to all buildings)
- Specific warehouse/storage requirements
- General building envelope
- Unclear if it applies

Respond ONLY with JSON:
{{
  "is_relevant": true|false
}}

Remember: When uncertain, mark is_relevant=true. We only filter out OBVIOUS non-applicable sections."""

    return prompt


def prefilter_section(
    check: Dict,
    project_context: Dict,
    model: str
) -> Dict:
    """
    Pre-filter a single section.
    
    Returns dict with:
        - check_id
        - section_number
        - is_relevant (bool)
        - confidence
        - reasoning
    """
    check_id = check['id']
    section = check.get('section', {})
    section_number = check['code_section_number']
    section_title = check['code_section_title']
    section_text = section.get('text', '')

    start_time = time.time()

    # Build minimal prompt
    prompt = build_prefilter_prompt(
        section_number,
        section_title,
        section_text,
        project_context
    )

    # Call LLM
    messages = [{"role": "user", "content": prompt}]
    ai_response = call_llm_with_retry(messages, model=model)

    elapsed = time.time() - start_time

    result = {
        'check_id': check_id,
        'section_number': section_number,
        'section_title': section_title,
        'is_relevant': ai_response.get('is_relevant', True),  # Default to relevant if unclear
        'execution_time_s': round(elapsed, 2)
    }

    status = "✓ RELEVANT" if result['is_relevant'] else "✗ FILTERED"
    print(f"  [{status}] {section_number}: {section_title[:50]}... ({elapsed:.1f}s)")

    return result


def extract_project_context(assessment: Dict) -> Dict:
    """
    Extract relevant project context for pre-filtering.

    Looks for:
    - Occupancy group
    - Building type
    - Project description
    - Size/area
    """
    project = assessment.get('project', {})
    assessment_id = assessment.get('id', '')

    # HARDCODED: Bombardier warehouse project
    if assessment_id == '3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83':
        print("[CONTEXT] Using hardcoded Bombardier warehouse context")
        return {
            'name': 'Bombardier Court Building 2',
            'description': 'Cold shell warehouse building. S-1 occupancy (moderate-hazard storage), TYPE V-B construction (wood frame, unprotected). Single story building, 22 feet 6 inches tall, 50,970 SF total floor area. No residential, assembly, educational, or healthcare uses.',
            'occupancy': 'S-1 (Warehouse - Moderate Hazard Storage)',
            'building_type': 'Warehouse',
            'construction_type': 'TYPE V-B',
            'stories': '1',
            'building_height': '22 feet 6 inches',
            'size': '50,970 SF',
            'address': '3731 Bombardier CT, Sacramento, CA 95827',
            'variables': {
                'occupancy_group': 'S-1',
                'construction_type': 'TYPE V-B',
                'stories': 1,
                'height_ft': 22.5,
                'area_sf': 50970,
                'use_type': 'warehouse'
            }
        }

    # Try to parse project name/description for key info
    name = project.get('name', '')
    description = project.get('description', '')

    # Extract occupancy from variables or name
    variables = project.get('variables', {})
    occupancy = variables.get('occupancy', 'Unknown')

    # Common patterns in project names
    context = {
        'name': name,
        'description': description,
        'occupancy': occupancy,
        'building_type': variables.get('building_type', 'Unknown'),
        'size': variables.get('building_area', 'Unknown'),
        'variables': variables
    }

    return context


def main():
    parser = argparse.ArgumentParser(description='Phase 0: Pre-filter irrelevant sections')
    parser.add_argument('--assessment-id', required=True, help='Assessment UUID')
    parser.add_argument('--env', default='prod', choices=['dev', 'prod'], help='Environment')
    parser.add_argument('--output', help='Output JSON path (default: results/<assessment-id>/prefilter_results.json)')
    parser.add_argument('--model', default=PREFILTER_MODEL, help='LLM model to use')
    parser.add_argument('--limit', type=int, help='Limit number of checks (for testing)')
    parser.add_argument('--concurrency', type=int, default=10, help='Max concurrent LLM calls (can be higher for fast model)')

    args = parser.parse_args()

    # Setup output directory
    results_dir = Path(__file__).parent / 'results' / args.assessment_id
    results_dir.mkdir(parents=True, exist_ok=True)

    output_path = args.output or (results_dir / 'prefilter_results.json')
    checkpoint_path = str(output_path) + '.progress'

    print(f"=" * 80)
    print(f"PHASE 0: PRE-FILTERING")
    print(f"=" * 80)
    print(f"Assessment ID: {args.assessment_id}")
    print(f"Environment:   {args.env}")
    print(f"Model:         {args.model}")
    print(f"Output:        {output_path}")
    print(f"=" * 80)

    # Load checkpoint if exists
    checkpoint = load_checkpoint(checkpoint_path)
    if checkpoint:
        print(f"[RESUME] Found checkpoint with {len(checkpoint.get('relevant', []))} relevant, {len(checkpoint.get('filtered', []))} filtered")
        relevant = checkpoint.get('relevant', [])
        filtered = checkpoint.get('filtered', [])
        processed_ids = {r['check_id'] for r in relevant + filtered}
    else:
        relevant = []
        filtered = []
        processed_ids = set()

    # Connect to database
    supabase = get_supabase_client(args.env)

    # Fetch assessment and checks
    assessment, checks = fetch_assessment_and_checks(
        supabase,
        args.assessment_id,
        limit=args.limit
    )

    # Extract project context
    project_context = extract_project_context(assessment)
    
    print(f"\n[PROJECT CONTEXT]")
    print(f"  Name:       {project_context['name']}")
    print(f"  Occupancy:  {project_context['occupancy']}")
    print(f"  Type:       {project_context['building_type']}")
    print(f"  Size:       {project_context['size']}")
    print(f"")

    # Filter out already processed
    checks_to_process = [c for c in checks if c['id'] not in processed_ids]
    print(f"[INFO] {len(checks_to_process)} checks remaining to process")

    if not checks_to_process:
        print("[DONE] All checks already processed!")
        sys.exit(0)

    # Process checks with parallel execution
    start_time = time.time()
    total_checks = len(checks_to_process)

    print(f"[INFO] Using {args.concurrency} parallel workers")

    # Process in parallel with ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        # Submit all tasks
        future_to_check = {
            executor.submit(prefilter_section, check, project_context, args.model): (i, check)
            for i, check in enumerate(checks_to_process, 1)
        }

        # Process completed tasks as they finish
        completed = 0
        for future in as_completed(future_to_check):
            i, check = future_to_check[future]

            try:
                result = future.result()
                completed += 1

                # Calculate progress and ETA
                elapsed = time.time() - start_time
                rate = completed / elapsed if elapsed > 0 else 0
                remaining = total_checks - completed
                eta_seconds = remaining / rate if rate > 0 else 0
                eta_str = format_duration(eta_seconds)
                percent = (completed / total_checks) * 100

                status = "RELEVANT" if result['is_relevant'] else "FILTERED"
                print(f"[{completed}/{total_checks}] {percent:.1f}% | ETA: {eta_str} | {status}: {result['section_number']}")

                # Categorize result
                if result['is_relevant']:
                    relevant.append({
                        'check_id': result['check_id'],
                        'section_number': result['section_number'],
                        'section_title': result['section_title']
                    })
                else:
                    filtered.append({
                        'check_id': result['check_id'],
                        'section_number': result['section_number'],
                        'section_title': result['section_title']
                    })

                # Checkpoint every 20 items
                if completed % 20 == 0:
                    save_checkpoint({
                        'assessment_id': args.assessment_id,
                        'relevant': relevant,
                        'filtered': filtered
                    }, checkpoint_path)

            except Exception as e:
                completed += 1
                print(f"  [ERROR] Failed to process check {check['id']}: {e}")
                # On error, mark as relevant (safe default)
                relevant.append({
                    'check_id': check['id'],
                    'section_number': check['code_section_number'],
                    'section_title': check['code_section_title'],
                    'error': str(e)
                })
                continue

    # Save final results
    final_results = {
        'assessment_id': args.assessment_id,
        'phase': 'prefilter',
        'model': args.model,
        'project_context': project_context,
        'total_checks': len(checks),
        'relevant_count': len(relevant),
        'filtered_count': len(filtered),
        'filter_rate': round(len(filtered) / len(checks) * 100, 1),
        'execution_time_s': round(time.time() - start_time, 2),
        'relevant': relevant,
        'filtered': filtered
    }

    with open(output_path, 'w') as f:
        json.dump(final_results, f, indent=2)

    print(f"\n{'=' * 80}")
    print(f"PHASE 0 COMPLETE")
    print(f"{'=' * 80}")
    print(f"Total checks:      {final_results['total_checks']}")
    print(f"Relevant:          {final_results['relevant_count']} ({100 - final_results['filter_rate']:.1f}%)")
    print(f"Filtered out:      {final_results['filtered_count']} ({final_results['filter_rate']:.1f}%)")
    print(f"Execution time:    {format_duration(final_results['execution_time_s'])}")
    print(f"Output saved to:   {output_path}")
    print(f"{'=' * 80}")

    # Remove checkpoint
    if os.path.exists(checkpoint_path):
        os.remove(checkpoint_path)


if __name__ == '__main__':
    main()

