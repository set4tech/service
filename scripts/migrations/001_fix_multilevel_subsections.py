"""
Database migration: Fix multi-level subsection references.

This migration:
1. Uploads new multi-level subsections that were missing due to regex bug
2. Fixes broken section references to point to correct multi-level subsections
3. Provides rollback capability

Usage:
    # Backup current state
    python scripts/migrations/001_fix_multilevel_subsections.py --backup

    # Run migration
    python scripts/migrations/001_fix_multilevel_subsections.py --apply

    # Rollback (requires backup)
    python scripts/migrations/001_fix_multilevel_subsections.py --rollback

Requirements:
    - Updated cbc_CA_2025.json file (with fixed regex)
    - Database connection (via SUPABASE_URL or DATABASE_URL)
"""

import argparse
import json
import os
import sys
from datetime import datetime
from typing import Dict, List, Set

try:
    from supabase import create_client, Client
except ImportError:
    print("Error: supabase-py not installed. Install with: pip install supabase")
    sys.exit(1)


def get_supabase_client() -> Client:
    """Get Supabase client from environment variables."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")

    if not url or not key:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        sys.exit(1)

    return create_client(url, key)


def backup_current_state(supabase: Client, backup_file: str):
    """Backup current sections and references before migration."""
    print(f"Creating backup at {backup_file}...")

    # Fetch all sections
    sections_response = supabase.table("sections").select("*").execute()

    # Fetch all references
    refs_response = supabase.table("section_references").select("*").execute()

    backup_data = {
        "timestamp": datetime.now().isoformat(),
        "sections": sections_response.data,
        "section_references": refs_response.data,
    }

    with open(backup_file, 'w') as f:
        json.dump(backup_data, f, indent=2)

    print(f"✅ Backup created: {len(sections_response.data)} sections, "
          f"{len(refs_response.data)} references")


def load_json_data(json_file: str) -> dict:
    """Load the updated JSON file with multi-level subsections."""
    print(f"Loading {json_file}...")

    with open(json_file, 'r') as f:
        data = json.load(f)

    print(f"✅ Loaded data: {len(data.get('sections', []))} sections")
    return data


def extract_multilevel_subsections(json_data: dict) -> List[Dict]:
    """Extract all multi-level subsections (2+ levels) from JSON."""
    import re

    multi_level_pattern = re.compile(r'11[AB]-\d{3,4}(?:\.\d+){2,}')
    multilevel_subsections = []

    for section in json_data.get('sections', []):
        for subsection in section.get('subsections', []):
            number = subsection.get('number', '')

            if multi_level_pattern.match(number):
                # Create section record
                multilevel_subsections.append({
                    'key': f"ICC:CBC_Chapter11A_11B:2025:CA:{number}",
                    'number': number,
                    'title': subsection.get('title', ''),
                    'text': '\n\n'.join(subsection.get('paragraphs', [])),
                    'code_id': json_data.get('source_id', 'CBC_Chapter11A_11B'),
                    'source_url': subsection.get('source_url') or section.get('source_url', ''),
                    'parent_key': f"ICC:CBC_Chapter11A_11B:2025:CA:{section.get('number', '')}",
                })

    return multilevel_subsections


def upload_new_subsections(supabase: Client, subsections: List[Dict]) -> int:
    """
    Upload new multi-level subsections to the database.

    Returns: Number of subsections uploaded
    """
    print(f"\n📤 Uploading {len(subsections)} new subsections...")

    # Check which ones already exist
    existing_keys = set()
    for subsection in subsections:
        response = supabase.table("sections").select("key").eq("key", subsection['key']).execute()
        if response.data:
            existing_keys.add(subsection['key'])

    new_subsections = [s for s in subsections if s['key'] not in existing_keys]

    if not new_subsections:
        print("  ℹ️  All subsections already exist in database")
        return 0

    print(f"  Found {len(new_subsections)} new subsections to upload")

    # Upload in batches of 100
    batch_size = 100
    uploaded = 0

    for i in range(0, len(new_subsections), batch_size):
        batch = new_subsections[i:i + batch_size]

        try:
            response = supabase.table("sections").insert(batch).execute()
            uploaded += len(batch)
            print(f"  Uploaded batch {i // batch_size + 1}: {len(batch)} subsections")
        except Exception as e:
            print(f"  ❌ Error uploading batch: {e}")
            raise

    print(f"✅ Uploaded {uploaded} new subsections")
    return uploaded


def fix_broken_references(supabase: Client, json_data: dict) -> int:
    """
    Fix broken section references.

    This identifies sections that reference multi-level subsections in their text
    but have incorrect refers_to arrays, and updates the section_references table.

    Returns: Number of references fixed
    """
    print("\n🔧 Fixing broken references...")

    import re

    multi_level_pattern = re.compile(r'11[AB]-\d{3,4}(?:\.\d+){2,}')
    fixed_count = 0

    # Get all sections with their current references
    sections_response = supabase.table("sections").select("key, number, text").execute()
    sections = sections_response.data

    for section in sections:
        if not section.get('text'):
            continue

        # Find multi-level references in text
        text_refs = multi_level_pattern.findall(section['text'])

        if not text_refs:
            continue

        # Get current references for this section
        refs_response = supabase.table("section_references").select("target_section_key").eq(
            "source_section_key", section['key']
        ).execute()

        current_target_keys = {ref['target_section_key'] for ref in refs_response.data}

        # Check each text reference
        for ref_number in text_refs:
            target_key = f"ICC:CBC_Chapter11A_11B:2025:CA:{ref_number}"

            # Check if target exists
            target_response = supabase.table("sections").select("key").eq("key", target_key).execute()

            if not target_response.data:
                print(f"  ⚠️  Target subsection not found: {ref_number}")
                continue

            # Check if reference already exists
            if target_key in current_target_keys:
                continue

            # Add new reference
            try:
                supabase.table("section_references").insert({
                    "source_section_key": section['key'],
                    "target_section_key": target_key,
                }).execute()

                fixed_count += 1
                print(f"  ✅ Added reference: {section['number']} → {ref_number}")
            except Exception as e:
                print(f"  ⚠️  Error adding reference {section['number']} → {ref_number}: {e}")

    print(f"✅ Fixed {fixed_count} references")
    return fixed_count


def verify_migration(supabase: Client):
    """Verify that the migration was successful."""
    print("\n🔍 Verifying migration...")

    # Check 11B-213.2 → 11B-213.3.1 (the reported bug)
    source_key = "ICC:CBC_Chapter11A_11B:2025:CA:11B-213.2"
    target_key = "ICC:CBC_Chapter11A_11B:2025:CA:11B-213.3.1"

    # Check target exists
    target_response = supabase.table("sections").select("number, title").eq("key", target_key).execute()

    if not target_response.data:
        print(f"  ❌ Critical subsection 11B-213.3.1 not found!")
        return False

    print(f"  ✅ 11B-213.3.1 exists: {target_response.data[0]['title']}")

    # Check reference exists
    ref_response = supabase.table("section_references").select("*").eq(
        "source_section_key", source_key
    ).eq("target_section_key", target_key).execute()

    if ref_response.data:
        print(f"  ✅ Reference 11B-213.2 → 11B-213.3.1 exists")
    else:
        print(f"  ⚠️  Reference 11B-213.2 → 11B-213.3.1 not found (may need manual fix)")

    # Count total multi-level subsections
    # Note: Supabase doesn't support regex in filters directly, so we fetch and filter
    all_sections = supabase.table("sections").select("number").execute()
    import re
    multi_level_pattern = re.compile(r'11[AB]-\d{3,4}(?:\.\d+){2,}')
    multilevel_count = sum(1 for s in all_sections.data if multi_level_pattern.match(s.get('number', '')))

    print(f"  Total multi-level subsections in DB: {multilevel_count}")

    if multilevel_count > 50:
        print("  ✅ Database has sufficient multi-level subsections")
        return True
    else:
        print("  ⚠️  Warning: Expected more multi-level subsections")
        return False


def rollback(backup_file: str, supabase: Client):
    """Rollback migration using backup file."""
    print(f"\n⏮️  Rolling back using {backup_file}...")

    if not os.path.exists(backup_file):
        print(f"❌ Backup file not found: {backup_file}")
        sys.exit(1)

    with open(backup_file, 'r') as f:
        backup_data = json.load(f)

    print(f"Backup timestamp: {backup_data['timestamp']}")

    # This is a simplified rollback - in production, you'd want more sophisticated logic
    print("⚠️  Rollback not fully implemented. Manual intervention required.")
    print("To rollback:")
    print("1. Use backup file to identify what was added")
    print("2. Delete added sections and references manually")
    print(f"Backup contains: {len(backup_data['sections'])} sections, "
          f"{len(backup_data['section_references'])} references")


def main():
    parser = argparse.ArgumentParser(description="Fix multi-level subsection references")
    parser.add_argument("--backup", action="store_true", help="Create backup before migration")
    parser.add_argument("--apply", action="store_true", help="Apply migration")
    parser.add_argument("--rollback", action="store_true", help="Rollback migration")
    parser.add_argument("--json-file", default="cbc_CA_2025.json", help="JSON file with updated data")
    parser.add_argument("--backup-file", default="backup_before_multilevel_fix.json",
                        help="Backup file path")

    args = parser.parse_args()

    # Get Supabase client
    supabase = get_supabase_client()

    if args.backup:
        backup_current_state(supabase, args.backup_file)

    elif args.apply:
        print("=" * 60)
        print("MULTI-LEVEL SUBSECTION FIX MIGRATION")
        print("=" * 60)

        # Load JSON data
        json_data = load_json_data(args.json_file)

        # Extract multi-level subsections
        multilevel_subsections = extract_multilevel_subsections(json_data)
        print(f"Found {len(multilevel_subsections)} multi-level subsections in JSON")

        # Upload new subsections
        uploaded = upload_new_subsections(supabase, multilevel_subsections)

        # Fix broken references
        fixed = fix_broken_references(supabase, json_data)

        # Verify
        success = verify_migration(supabase)

        print("\n" + "=" * 60)
        print("MIGRATION COMPLETE")
        print(f"  Uploaded: {uploaded} subsections")
        print(f"  Fixed: {fixed} references")
        print(f"  Status: {'✅ SUCCESS' if success else '⚠️  PARTIAL'}")
        print("=" * 60)

    elif args.rollback:
        rollback(args.backup_file, supabase)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
