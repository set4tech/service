#!/usr/bin/env python3
"""
Seed assessment with checks for selected chapters.
Directly implements the seeding logic from the API.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from shared_utils import get_supabase_client

def seed_assessment(assessment_id: str, env: str = 'prod'):
    """Seed assessment with checks for all selected chapters."""
    supabase = get_supabase_client(env)

    print(f"[SEED] Starting seed for assessment: {assessment_id}")

    # 1. Fetch assessment with selected chapters
    response = supabase.table('assessments').select(
        'id, project_id, seeding_status, selected_chapter_ids'
    ).eq('id', assessment_id).single().execute()

    assessment = response.data
    if not assessment:
        print("[ERROR] Assessment not found")
        return

    chapter_ids = assessment.get('selected_chapter_ids', [])
    if not chapter_ids:
        print("[ERROR] No chapters selected for assessment")
        return

    print(f"[SEED] Selected {len(chapter_ids)} chapters")

    # Set status to in_progress
    supabase.table('assessments').update({'seeding_status': 'in_progress'}).eq('id', assessment_id).execute()

    # 2. Fetch all sections for the selected chapters
    print("[SEED] Fetching sections...")
    sections = []
    offset = 0
    batch_size = 1000

    while True:
        batch_response = supabase.table('sections').select('*')\
            .in_('chapter_id', chapter_ids)\
            .eq('never_relevant', False)\
            .neq('text', '')\
            .order('number')\
            .range(offset, offset + batch_size - 1)\
            .execute()

        batch = batch_response.data
        if not batch or len(batch) == 0:
            break

        sections.extend(batch)
        print(f"[SEED] Fetched {len(batch)} sections (total: {len(sections)})")

        if len(batch) < batch_size:
            break

        offset += batch_size

    print(f"[SEED] Found {len(sections)} sections to seed")

    # 3. Check which sections already have checks
    existing_response = supabase.table('checks').select('section_id').eq('assessment_id', assessment_id).execute()
    existing_ids = {c['section_id'] for c in (existing_response.data or [])}
    sections_to_add = [s for s in sections if s['id'] not in existing_ids]

    print(f"[SEED] {len(existing_ids)} checks already exist")
    print(f"[SEED] Adding {len(sections_to_add)} new checks")

    # 4. Insert new checks
    if sections_to_add:
        check_rows = [{
            'assessment_id': assessment_id,
            'section_id': s['id'],
            'code_section_number': s['number'],
            'code_section_title': s['title'],
            'check_name': f"{s['number']} - {s['title']}",
            'status': 'pending',
            'instance_label': None
        } for s in sections_to_add]

        # Insert in batches
        total_inserted = 0
        for i in range(0, len(check_rows), batch_size):
            batch = check_rows[i:i+batch_size]
            print(f"[SEED] Inserting batch {i//batch_size + 1}/{(len(check_rows) + batch_size - 1)//batch_size}")

            try:
                insert_response = supabase.table('checks').insert(batch).execute()
                total_inserted += len(insert_response.data or [])
            except Exception as e:
                # Code 23505 is duplicate key - skip and continue
                if '23505' in str(e):
                    print(f"[SEED] Some checks in batch already exist (race condition), continuing...")
                else:
                    raise

        print(f"[SEED] Successfully created {total_inserted} checks")

    # 5. Mark as completed
    supabase.table('assessments').update({'seeding_status': 'completed'}).eq('id', assessment_id).execute()

    print(f"[SEED] Seeding completed!")

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Seed assessment with checks')
    parser.add_argument('--assessment-id', required=True, help='Assessment UUID')
    parser.add_argument('--env', default='prod', choices=['dev', 'prod'], help='Environment')

    args = parser.parse_args()
    seed_assessment(args.assessment_id, args.env)
