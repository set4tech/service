#!/usr/bin/env python3
"""
Download sections with references for specified chapters and save to JSON.

Usage:
    python scripts/download_sections.py --chapters 3 4 5 11B
    python scripts/download_sections.py  # downloads all chapters
"""

import os
import sys
import json
import argparse
from supabase import create_client, Client

# ---------------------------
# Config
# ---------------------------

# Supabase connection from .envrc
SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    sys.exit(1)

# California chapters to process
CHAPTERS = ['3', '4', '5', '6', '7', '8', '9', '10', '11B']

# ---------------------------
# Initialize Supabase
# ---------------------------

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_sections_with_references_batch(chapter: str, offset: int = 0, limit: int = 100):
    """
    Get all sections for a chapter with their references in batches.
    """
    if chapter == '11B':
        pattern = '11B-%'
    else:
        # Chapters 3-10 use format like: 301, 302, 403, 507, etc.
        pattern = f'{chapter}%'

    response = supabase.table('sections').select(
        '*, section_references!section_references_source_section_key_fkey(citation_text, explicit, target_section:sections!section_references_target_section_key_fkey(key, number, title))'
    ).like('number', pattern).eq('never_relevant', False).order('number').range(offset, offset + limit - 1).execute()

    return response.data

def download_chapter(chapter: str):
    """
    Download all sections with references for a specific chapter.
    """
    print(f"\n{'='*80}")
    print(f"DOWNLOADING CHAPTER {chapter}")
    print(f"{'='*80}")

    sections_with_refs = []
    offset = 0
    batch_size = 100

    while True:
        batch = get_sections_with_references_batch(chapter, offset, batch_size)
        if not batch:
            break

        print(f"  Fetched batch at offset {offset}: {len(batch)} sections")
        sections_with_refs.extend(batch)

        if len(batch) < batch_size:
            break

        offset += batch_size

    print(f"Total sections downloaded for chapter {chapter}: {len(sections_with_refs)}")

    # Create output with metadata for each section
    output = []
    for section in sections_with_refs:
        output.append({
            'chapter': chapter,
            'section_key': section['key'],
            'section_number': section['number'],
            'section_title': section['title'],
            'section_text': section.get('text', ''),
            'section_data': section
        })

    return output

def main():
    parser = argparse.ArgumentParser(description='Download sections with references by chapter')
    parser.add_argument('--chapters', type=str, nargs='+', help='Specific chapters to process (e.g., 3 4 11B)', default=CHAPTERS)
    parser.add_argument('--output', type=str, help='Output JSON file', default='sections_with_references.json')

    args = parser.parse_args()

    chapters_to_process = args.chapters
    all_sections = []

    for chapter in chapters_to_process:
        chapter_sections = download_chapter(chapter)
        all_sections.extend(chapter_sections)

    # Save to JSON
    output_file = args.output
    print(f"\n{'='*80}")
    print(f"Saving {len(all_sections)} sections to {output_file}")
    print(f"{'='*80}")

    with open(output_file, 'w') as f:
        json.dump(all_sections, f, indent=2)

    print(f"Done! Saved to {output_file}")

if __name__ == '__main__':
    main()
