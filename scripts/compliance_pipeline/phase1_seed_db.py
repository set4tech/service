#!/usr/bin/env python3
"""
Seed Database with Phase 1 Results

Takes Phase 1 text analysis results and updates the database:
- Not applicable: Mark checks as not_applicable=true
- Conclusive: Create analysis_runs with AI judgments
- Needs vision: Leave for Phase 2
"""

import os
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime, UTC

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from shared_utils import get_supabase_client


def seed_not_applicable_checks(supabase, not_applicable_list):
    """Mark checks as excluded (not applicable)."""
    print(f"\n[SEED] Marking {len(not_applicable_list)} checks as excluded (not applicable)...")

    check_ids = [c['check_id'] for c in not_applicable_list]

    # Update checks in batches of 100
    batch_size = 100
    for i in range(0, len(check_ids), batch_size):
        batch = check_ids[i:i+batch_size]

        result = supabase.table('checks').update({
            'is_excluded': True,
            'excluded_reason': 'Phase 1: Not applicable based on text analysis',
            'updated_at': datetime.now(UTC).isoformat()
        }).in_('id', batch).execute()

        print(f"  Updated {len(batch)} checks (batch {i//batch_size + 1}/{(len(check_ids) + batch_size - 1)//batch_size})")

    print(f"[SEED] ✓ Marked {len(check_ids)} checks as excluded")


def seed_conclusive_analysis_runs(supabase, conclusive_list):
    """Create analysis_runs for conclusive checks."""
    print(f"\n[SEED] Creating {len(conclusive_list)} analysis runs for conclusive checks...")

    # Build analysis_run records
    analysis_runs = []
    for result in conclusive_list:
        analysis_run = {
            'check_id': result['check_id'],
            'ai_provider': 'phase1',  # Track that this came from Phase 1
            'ai_model': 'text_analysis',
            'compliance_status': result['compliance_status'],
            'confidence': result['confidence'],
            'ai_reasoning': result['reasoning'],
            'violations': result.get('violations', []),
            'execution_time_ms': int(result.get('execution_time_s', 0) * 1000),  # Convert seconds to milliseconds
            'executed_at': datetime.now(UTC).isoformat()
        }
        analysis_runs.append(analysis_run)

    # Insert in batches of 100
    batch_size = 100
    for i in range(0, len(analysis_runs), batch_size):
        batch = analysis_runs[i:i+batch_size]

        result = supabase.table('analysis_runs').insert(batch).execute()

        print(f"  Created {len(batch)} analysis runs (batch {i//batch_size + 1}/{(len(analysis_runs) + batch_size - 1)//batch_size})")

    print(f"[SEED] ✓ Created {len(analysis_runs)} analysis runs")


def main():
    parser = argparse.ArgumentParser(description='Seed database with Phase 1 results')
    parser.add_argument('--assessment-id', required=True, help='Assessment UUID')
    parser.add_argument('--env', default='prod', choices=['dev', 'prod'], help='Environment')
    parser.add_argument('--input', help='Input JSON path (default: results/<assessment-id>/text_results.json)')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done without making changes')

    args = parser.parse_args()

    # Load results
    results_dir = Path(__file__).parent / 'results' / args.assessment_id
    input_path = args.input or (results_dir / 'text_results.json')

    print(f"=" * 80)
    print(f"SEED DATABASE WITH PHASE 1 RESULTS")
    print(f"=" * 80)
    print(f"Assessment ID: {args.assessment_id}")
    print(f"Environment:   {args.env}")
    print(f"Input:         {input_path}")
    print(f"Dry run:       {args.dry_run}")
    print(f"=" * 80)

    # Load results
    with open(input_path, 'r') as f:
        results = json.load(f)

    conclusive = results.get('conclusive', [])
    needs_vision = results.get('needs_vision', [])
    not_applicable = results.get('not_applicable', [])

    print(f"\n[INFO] Loaded results:")
    print(f"  Conclusive:      {len(conclusive)}")
    print(f"  Needs vision:    {len(needs_vision)}")
    print(f"  Not applicable:  {len(not_applicable)}")

    if args.dry_run:
        print(f"\n[DRY RUN] Would update database with:")
        print(f"  - Mark {len(not_applicable)} checks as not_applicable=true")
        print(f"  - Create {len(conclusive)} analysis_runs")
        print(f"  - Leave {len(needs_vision)} checks for Phase 2")
        return

    # Connect to database
    supabase = get_supabase_client(args.env)

    # Seed not applicable checks
    if not_applicable:
        seed_not_applicable_checks(supabase, not_applicable)

    # Seed conclusive analysis runs
    if conclusive:
        seed_conclusive_analysis_runs(supabase, conclusive)

    print(f"\n{'=' * 80}")
    print(f"DATABASE SEEDING COMPLETE")
    print(f"{'=' * 80}")
    print(f"Not applicable:  {len(not_applicable)} checks marked")
    print(f"Conclusive:      {len(conclusive)} analysis runs created")
    print(f"Needs vision:    {len(needs_vision)} checks remaining for Phase 2")
    print(f"{'=' * 80}")


if __name__ == '__main__':
    main()
