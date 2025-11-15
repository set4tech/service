#!/usr/bin/env python3
"""
Load element tagging results from JSON and insert into database

This script loads the results from element_tagging_results.json 
and inserts them into the database with proper section_key values.

Usage:
    python scripts/load_tagging_results.py
"""

import os
import sys
import json
from typing import Dict, List, Tuple
from supabase import create_client, Client

def get_supabase_client():
    url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        print("❌ Missing Supabase environment variables:")
        print("  - NEXT_PUBLIC_SUPABASE_URL")
        print("  - SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    return create_client(url, key)

def get_element_group_map(supabase: Client) -> Dict[str, str]:
    """Fetch element group slugs -> IDs"""
    response = supabase.table('element_groups').select('id, slug').execute()
    return {row['slug']: row['id'] for row in response.data}

def get_section_keys(supabase: Client, section_ids: List[str]) -> Dict[str, str]:
    """Fetch section keys for given section IDs"""
    section_map = {}
    batch_size = 100  # Keep it small to avoid API limits
    
    for i in range(0, len(section_ids), batch_size):
        batch = section_ids[i:i+batch_size]
        response = supabase.table('sections') \
            .select('id, key') \
            .in_('id', batch) \
            .execute()
        
        for row in response.data:
            section_map[row['id']] = row['key']
        
        if (i + batch_size) % 1000 == 0:
            print(f"   Fetched {i + batch_size}/{len(section_ids)}...")
    
    return section_map

def save_mappings(supabase: Client, mappings: List[Tuple[str, str, str]]):
    """
    Save element-section mappings to database
    mappings: List of (section_id, section_key, element_group_id) tuples
    """
    print(f"\n💾 Saving {len(mappings)} mappings to database...")
    
    # Clear existing mappings for these sections (we'll rebuild from scratch)
    section_ids = list(set([m[0] for m in mappings]))
    
    if section_ids:
        # Delete old mappings in batches
        batch_size = 100
        for i in range(0, len(section_ids), batch_size):
            batch = section_ids[i:i+batch_size]
            supabase.table('element_section_mappings') \
                .delete() \
                .in_('section_id', batch) \
                .execute()
    
    # Insert new mappings in batches
    inserted = 0
    batch_size = 100
    
    for i in range(0, len(mappings), batch_size):
        batch = mappings[i:i+batch_size]
        records = [
            {
                'section_id': section_id,
                'section_key': section_key,
                'element_group_id': element_id
            }
            for section_id, section_key, element_id in batch
        ]
        
        try:
            supabase.table('element_section_mappings').insert(records).execute()
            inserted += len(records)
        except Exception as e:
            print(f"⚠️  Error inserting batch: {e}")
    
    print(f"✅ Saved {inserted} mappings")

def main():
    print("=" * 80)
    print("Load Element Tagging Results")
    print("=" * 80)
    print()
    
    # Load results file
    results_file = 'element_tagging_results.json'
    if not os.path.exists(results_file):
        print(f"❌ Results file not found: {results_file}")
        sys.exit(1)
    
    print(f"📂 Loading results from {results_file}...")
    with open(results_file, 'r') as f:
        data = json.load(f)
    
    classifications = data.get('classifications', {})
    print(f"✅ Loaded {len(classifications)} classified sections")
    print()
    
    # Initialize
    supabase = get_supabase_client()
    element_map = get_element_group_map(supabase)
    
    print(f"📋 Element groups found: {', '.join(element_map.keys())}")
    print()
    
    # Get section keys
    section_ids = list(classifications.keys())
    print(f"🔍 Fetching section keys for {len(section_ids)} sections...")
    section_lookup = get_section_keys(supabase, section_ids)
    print(f"✅ Found keys for {len(section_lookup)} sections")
    print()
    
    # Build mappings
    print("📊 Building element-section mappings...")
    mappings = []
    stats = {}
    missing_keys = 0
    
    for section_id, element_types in classifications.items():
        section_key = section_lookup.get(section_id)
        if not section_key:
            missing_keys += 1
            continue
            
        for element_type in element_types:
            if element_type in element_map:
                element_group_id = element_map[element_type]
                mappings.append((section_id, section_key, element_group_id))
                
                # Track stats
                if element_type not in stats:
                    stats[element_type] = 0
                stats[element_type] += 1
    
    if missing_keys > 0:
        print(f"⚠️  Warning: {missing_keys} sections had no key, skipped")
    
    # Display stats
    print("\n" + "=" * 80)
    print("RESULTS")
    print("=" * 80)
    for element_type in sorted(stats.keys()):
        count = stats[element_type]
        print(f"  {element_type:20s}: {count:4d} sections")
    print(f"\n  {'TOTAL':20s}: {len(mappings):4d} mappings")
    print("=" * 80)
    
    # Save to database
    if mappings:
        save_mappings(supabase, mappings)
        print("\n✅ Done! Element-section mappings updated.")
    else:
        print("\n⚠️  No mappings generated")
    
    print()

if __name__ == '__main__':
    main()

