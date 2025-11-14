#!/usr/bin/env python3
"""
Phase 3: Database Seeding

Merges results from Phase 1 (text) and Phase 2 (vision) and inserts them
into the analysis_runs table.

Workflow:
  1. Load text_results.json and vision_results.json
  2. Merge all results into single list
  3. Validate data integrity
  4. Insert to database in batches
  5. Log inserted record IDs
"""

import os
import sys
import json
import argparse
from pathlib import Path
from typing import Dict, List, Tuple

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from shared_utils import (
    get_supabase_client,
    insert_analysis_result,
    format_duration
)


def merge_results(
    text_results: Dict,
    vision_results: Dict
) -> List[Dict]:
    """
    Merge Phase 1 and Phase 2 results into a single list.

    Returns list of dicts ready for database insertion.
    """
    merged = []

    # Add conclusive text results
    for result in text_results.get('conclusive', []):
        merged.append({
            'check_id': result['check_id'],
            'compliance_status': result['compliance_status'],
            'confidence': result['confidence'],
            'reasoning': result['reasoning'],
            'violations': result.get('violations', []),
            'source': 'text_analysis',
            'execution_time_ms': int(result['execution_time_s'] * 1000)
        })

    # Add not-applicable from text analysis (includes prefiltered)
    for result in text_results.get('not_applicable', []):
        merged.append({
            'check_id': result['check_id'],
            'compliance_status': 'not-applicable',
            'confidence': result.get('confidence', 'high'),
            'reasoning': result['reasoning'],
            'violations': [],
            'source': 'prefilter' if 'Phase 0' in result['reasoning'] else 'text_analysis',
            'execution_time_ms': int(result.get('execution_time_s', 0) * 1000)
        })

    # Add analyzed vision results
    for result in vision_results.get('analyzed', []):
        merged.append({
            'check_id': result['check_id'],
            'compliance_status': result['compliance_status'],
            'confidence': result['confidence'],
            'reasoning': result['reasoning'],
            'violations': result.get('violations', []),
            'source': 'vision_analysis',
            'execution_time_ms': int(result['execution_time_s'] * 1000),
            'pages_analyzed': result.get('pages_analyzed', [])
        })

    # Add not-applicable from vision
    for result in vision_results.get('not_applicable', []):
        merged.append({
            'check_id': result['check_id'],
            'compliance_status': 'not-applicable',
            'confidence': result.get('confidence', 'high'),
            'reasoning': result['reasoning'],
            'violations': [],
            'source': 'keyword_filtering',
            'execution_time_ms': 0
        })

    return merged


def validate_results(results: List[Dict]) -> Tuple[List[Dict], List[str]]:
    """
    Validate results before insertion.

    Returns (valid_results, error_messages)
    """
    valid = []
    errors = []

    required_fields = ['check_id', 'compliance_status', 'confidence', 'reasoning']

    for i, result in enumerate(results):
        # Check required fields
        missing = [f for f in required_fields if f not in result]
        if missing:
            errors.append(f"Result {i}: Missing fields {missing}")
            continue

        # Validate compliance_status
        valid_statuses = ['compliant', 'non-compliant', 'unclear', 'not-applicable']
        if result['compliance_status'] not in valid_statuses:
            errors.append(f"Result {i}: Invalid compliance_status '{result['compliance_status']}'")
            continue

        # Validate confidence
        valid_confidences = ['high', 'medium', 'low']
        if result['confidence'] not in valid_confidences:
            errors.append(f"Result {i}: Invalid confidence '{result['confidence']}'")
            continue

        valid.append(result)

    return valid, errors


def main():
    parser = argparse.ArgumentParser(description='Phase 3: Database seeding')
    parser.add_argument('--text-results', required=True, help='Path to text_results.json')
    parser.add_argument('--vision-results', required=True, help='Path to vision_results.json')
    parser.add_argument('--env', default='prod', choices=['dev', 'prod'], help='Environment')
    parser.add_argument('--dry-run', action='store_true', help='Preview without inserting')
    parser.add_argument('--batch-size', type=int, default=100, help='Insert batch size')
    parser.add_argument('--model', default='gemini/gemini-2.0-flash-exp', help='Model name for metadata')

    args = parser.parse_args()

    print(f"=" * 80)
    print(f"PHASE 3: DATABASE SEEDING")
    print(f"=" * 80)
    print(f"Text results:    {args.text_results}")
    print(f"Vision results:  {args.vision_results}")
    print(f"Environment:     {args.env}")
    print(f"Dry run:         {args.dry_run}")
    print(f"=" * 80)

    # Load results
    with open(args.text_results, 'r') as f:
        text_results = json.load(f)

    with open(args.vision_results, 'r') as f:
        vision_results = json.load(f)

    # Verify same assessment
    if text_results['assessment_id'] != vision_results['assessment_id']:
        print("[ERROR] Assessment IDs don't match!")
        print(f"  Text:   {text_results['assessment_id']}")
        print(f"  Vision: {vision_results['assessment_id']}")
        sys.exit(1)

    assessment_id = text_results['assessment_id']

    # Merge results
    print("\n[MERGE] Combining results...")
    merged_results = merge_results(text_results, vision_results)
    print(f"[MERGE] Total records: {len(merged_results)}")

    # Validate
    print("\n[VALIDATE] Checking data integrity...")
    valid_results, errors = validate_results(merged_results)

    if errors:
        print(f"[WARN] Found {len(errors)} validation errors:")
        for error in errors[:10]:  # Show first 10
            print(f"  - {error}")

    print(f"[VALIDATE] Valid records: {len(valid_results)}/{len(merged_results)}")

    if not valid_results:
        print("[ERROR] No valid results to insert!")
        sys.exit(1)

    # Save merged results
    output_dir = Path(args.text_results).parent
    merged_file = output_dir / 'merged_results.json'

    merged_output = {
        'assessment_id': assessment_id,
        'phase': 'merged',
        'text_results_file': str(args.text_results),
        'vision_results_file': str(args.vision_results),
        'total_results': len(valid_results),
        'validation_errors': len(errors),
        'results': valid_results
    }

    with open(merged_file, 'w') as f:
        json.dump(merged_output, f, indent=2)

    print(f"[MERGE] Saved to: {merged_file}")

    if args.dry_run:
        print("\n[DRY RUN] Would insert the following:")
        for i, result in enumerate(valid_results[:5], 1):
            print(f"  {i}. Check {result['check_id'][:8]}... → {result['compliance_status']}")
        if len(valid_results) > 5:
            print(f"  ... and {len(valid_results) - 5} more")
        print("\n[DRY RUN] Use --no-dry-run to actually insert")
        return

    # Connect to database
    supabase = get_supabase_client(args.env)

    # Insert results
    print(f"\n[INSERT] Inserting {len(valid_results)} records...")

    inserted_ids = []
    failed = []

    for i, result in enumerate(valid_results, 1):
        try:
            # Build AI response format
            ai_response = {
                'compliance_status': result['compliance_status'],
                'confidence': result['confidence'],
                'reasoning': result['reasoning'],
                'violations': result.get('violations', []),
                'source': result.get('source', 'unknown'),
                'pages_analyzed': result.get('pages_analyzed')
            }

            # Insert
            record = insert_analysis_result(
                supabase,
                result['check_id'],
                ai_response,
                result.get('execution_time_ms', 0),
                args.model
            )

            inserted_ids.append(record['id'])

            if i % 10 == 0:
                print(f"  [{i}/{len(valid_results)}] Inserted {len(inserted_ids)} records...")

        except Exception as e:
            print(f"  [ERROR] Failed to insert check {result['check_id']}: {e}")
            failed.append({
                'check_id': result['check_id'],
                'error': str(e)
            })

    print(f"\n{'=' * 80}")
    print(f"PHASE 3 COMPLETE")
    print(f"{'=' * 80}")
    print(f"Successfully inserted: {len(inserted_ids)}")
    print(f"Failed:                {len(failed)}")
    print(f"{'=' * 80}")

    if failed:
        print("\nFailed insertions:")
        for item in failed[:10]:
            print(f"  - {item['check_id']}: {item['error']}")

    # Save insertion log
    log_file = output_dir / 'insertion_log.json'
    with open(log_file, 'w') as f:
        json.dump({
            'assessment_id': assessment_id,
            'inserted_count': len(inserted_ids),
            'failed_count': len(failed),
            'inserted_ids': inserted_ids,
            'failed': failed
        }, f, indent=2)

    print(f"\n[LOG] Saved insertion log to: {log_file}")


if __name__ == '__main__':
    main()
