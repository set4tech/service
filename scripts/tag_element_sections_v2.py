#!/usr/bin/env python3
"""
Instance-Specific Element Tagger for CBC 2022

Tags code sections that apply to INDIVIDUAL INSTANCES of building elements
(doors, walls, bathrooms, kitchens, ramps, etc.)

Only tags sections where compliance must be checked PER INSTANCE:
✅ "Doors shall have a clear width of 32 inches" → check each door
✅ "Wall-mounted objects shall not protrude more than 4 inches" → check each wall
❌ "Buildings shall have at least one accessible entrance" → global requirement

Scans ALL CBC versions (2022, 2025, etc.) chapters: 3, 5, 6, 7, 8, 9, 10, 11B
Uses Gemini 2.5 Pro for classification (1M token context, 100 sections per batch)

Requirements:
    - NEXT_PUBLIC_SUPABASE_URL
    - SUPABASE_SERVICE_ROLE_KEY
    - GEMINI_API_KEY

Usage:
    python scripts/tag_element_sections_v2.py
"""

import os
import sys
import json
import time
from datetime import datetime
from typing import Dict, List, Set, Tuple
from supabase import create_client, Client

# ---------------------------
# Config
# ---------------------------

# CBC chapters to scan (no 11A per user request)
TARGET_CHAPTERS = ['3', '5', '6', '7', '8', '9', '10', '11B']

# Scan ALL CBC versions (2022, 2025, etc.) not just one year
SCAN_ALL_CBC_VERSIONS = True

# Element types we're looking for
ELEMENT_TYPES = [
    'doors',
    'walls', 
    'bathrooms',
    'kitchens',
    'ramps',
    'elevators',
    'parking',
    'signage',
    'handrails',
    'stairs',
]

# Batch size for LLM API calls
# Gemini 2.5 Pro has 1M token context window, but API has response time limits
BATCH_SIZE = 150

# Checkpoint file for resuming
CHECKPOINT_FILE = 'element_tagging_checkpoint.json'

# ---------------------------
# Checkpoint Management
# ---------------------------

def load_checkpoint() -> Dict[str, Set[str]]:
    """Load checkpoint file if it exists"""
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, 'r') as f:
                data = json.load(f)
                # Convert lists back to sets
                return {
                    section_id: set(element_types) 
                    for section_id, element_types in data.get('classifications', {}).items()
                }
        except Exception as e:
            print(f"⚠️  Error loading checkpoint: {e}")
            return {}
    return {}

def save_checkpoint(classifications: Dict[str, Set[str]], total_sections: int):
    """Save current progress to checkpoint file"""
    checkpoint_data = {
        'timestamp': datetime.now().isoformat(),
        'total_sections': total_sections,
        'processed_sections': len(classifications),
        'classifications': {
            section_id: list(element_types) 
            for section_id, element_types in classifications.items()
        }
    }
    with open(CHECKPOINT_FILE, 'w') as f:
        json.dump(checkpoint_data, f, indent=2)

# ---------------------------
# Database
# ---------------------------

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
    """Get mapping of element slug -> element_group_id"""
    response = supabase.table('element_groups').select('id, slug').execute()
    return {row['slug']: row['id'] for row in response.data}

def fetch_cbc_sections(supabase: Client) -> List[Dict]:
    """Fetch all CBC sections from target chapters (all versions)"""
    print(f"📖 Fetching CBC sections (all versions) from chapters: {', '.join(TARGET_CHAPTERS)}")
    
    all_sections = []
    batch_size = 100
    
    # Fetch each chapter separately using simple pattern matching (like download_sections.py)
    for chapter in TARGET_CHAPTERS:
        print(f"   Fetching Chapter {chapter}...", end=' ', flush=True)
        
        # Determine pattern based on chapter
        if chapter == '11B':
            pattern = '11B-%'  # 11B sections use format: 11B-404.2.1
        else:
            pattern = f'{chapter}%'  # Other chapters: 301, 302, 1015.1, etc.
        
        offset = 0
        chapter_sections = []
        
        while True:
            response = supabase.table('sections') \
                .select('id, key, number, title, text, paragraphs, code_id') \
                .eq('never_relevant', False) \
                .like('code_id', '%CBC%') \
                .like('number', pattern) \
                .order('number') \
                .range(offset, offset + batch_size - 1) \
                .execute()
            
            if not response.data:
                break
            
            chapter_sections.extend([{
                'id': r['id'],
                'key': r['key'],
                'number': r['number'] or '',
                'title': r['title'] or '',
                'text': r['text'] or '',
                'paragraphs': r['paragraphs'] or [],
                'code_id': r['code_id']
            } for r in response.data])
            
            if len(response.data) < batch_size:
                break
            
            offset += batch_size
        
        print(f"✓ {len(chapter_sections)} sections")
        all_sections.extend(chapter_sections)
    
    print(f"✅ Found {len(all_sections)} sections in target chapters")
    
    # Debug: show breakdown by chapter
    chapter_counts = {}
    for section in all_sections:
        number = section['number']
        if number.startswith('11B'):
            chapter = '11B'
        else:
            # Extract first digit(s)
            import re
            match = re.match(r'^(\d+)', number)
            chapter = match.group(1) if match else 'other'
        chapter_counts[chapter] = chapter_counts.get(chapter, 0) + 1
    
    print("   Breakdown by chapter:")
    for chapter in sorted(chapter_counts.keys()):
        print(f"     Chapter {chapter}: {chapter_counts[chapter]} sections")
    
    return all_sections

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

# ---------------------------
# LLM Classification
# ---------------------------

def classify_sections_batch(sections: List[Dict]) -> Dict[str, Set[str]]:
    """
    Use LLM to classify sections as instance-specific element requirements
    
    Returns: Dict mapping section_id to set of element types
    """
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        print("⚠️  GEMINI_API_KEY not set, skipping LLM classification")
        return {}
    
    import requests
    
    # Gemini 2.5 Pro API
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}
    
    system_prompt = """You are a building code expert. Your task is to identify which building code sections contain requirements that must be checked PER INDIVIDUAL INSTANCE of specific building elements.

Tag sections with element types ONLY if:
1. The requirement applies to EACH INDIVIDUAL instance of that element
2. Compliance must be verified separately for each instance
3. The section contains specific, measurable criteria

Element types to consider:
- doors: individual door requirements (width, hardware, closing force, etc.)
- walls: individual wall requirements (fire rating, thickness, wall-mounted objects, etc.)
- bathrooms: individual bathroom/toilet room requirements (dimensions, fixtures, grab bars, etc.)
- kitchens: individual kitchen requirements (counter heights, sink depths, clearances, etc.)
- ramps: individual ramp requirements (slope, width, handrails, etc.)
- elevators: individual elevator requirements (cab size, controls, doors, etc.)
- parking: individual parking space requirements (dimensions, signage, access aisles, etc.)
- signage: individual sign requirements (height, contrast, tactile, etc.)
- handrails: individual handrail requirements (height, extensions, gripping surface, etc.)
- stairs: individual stair requirements (tread depth, riser height, nosings, etc.)

DO NOT tag if:
- The section is about HOW MANY of something is required (e.g., "provide at least one accessible entrance")
- The section is about WHERE something must be located globally (e.g., "accessible route shall connect...")
- The section is a general definition or scoping requirement
- The section delegates to another section without specific requirements

Return a JSON object with a "results" array. Each result has:
- "section_number": the section number
- "elements": array of element type strings (empty array if none apply)
- "reasoning": brief explanation (optional, for debugging)

Example response:
{
  "results": [
    {
      "section_number": "11B-404.2.3",
      "elements": ["doors"],
      "reasoning": "Specifies clear width requirement for each door"
    },
    {
      "section_number": "11B-216.2",
      "elements": [],
      "reasoning": "Scoping - about how many doors need to be accessible, not individual door specs"
    }
  ]
}
"""
    
    # Build payload
    sections_payload = []
    for section in sections:
        paragraphs_text = []
        if section.get('paragraphs') and isinstance(section['paragraphs'], list):
            paragraphs_text = section['paragraphs']
        
        sections_payload.append({
            "section_number": section['number'],
            "title": section['title'],
            "text": section['text'],
            "paragraphs": paragraphs_text[:3],  # Limit to first 3 paragraphs for token efficiency
        })
    
    # Gemini API format
    user_content = json.dumps({"sections": sections_payload}, ensure_ascii=False)
    
    data = {
        "contents": [{
            "parts": [{
                "text": f"{system_prompt}\n\nHere are the sections to classify:\n\n{user_content}"
            }]
        }],
        "generationConfig": {
            "temperature": 0.0,
            "responseMimeType": "application/json"
        }
    }
    
    try:
        resp = requests.post(url, headers=headers, json=data, timeout=240)
        resp.raise_for_status()
        result = resp.json()
        
        # Extract content from Gemini response
        content = result['candidates'][0]['content']['parts'][0]['text']
        parsed = json.loads(content)
        
        # Build result map: section_id -> set of element types
        result_map = {}
        results_list = parsed.get('results', [])
        
        # Create lookup by section number
        section_by_number = {s['number']: s for s in sections}
        
        for item in results_list:
            section_num = item.get('section_number', '')
            elements = item.get('elements', [])
            
            if section_num in section_by_number:
                section_id = section_by_number[section_num]['id']
                result_map[section_id] = set(elements)
        
        return result_map
    
    except Exception as e:
        print(f"⚠️  LLM API error: {e}")
        return {}

# ---------------------------
# Main
# ---------------------------

def main():
    print("=" * 80)
    print("CBC 2022 Instance-Specific Element Tagger")
    print("=" * 80)
    print()
    
    # Initialize
    supabase = get_supabase_client()
    element_map = get_element_group_map(supabase)
    
    print(f"📋 Element groups found: {', '.join(element_map.keys())}")
    print()
    
    # Load checkpoint if exists
    all_classifications = load_checkpoint()
    if all_classifications:
        print(f"📂 Loaded checkpoint with {len(all_classifications)} previously processed sections")
        print()
    
    # Fetch sections
    sections = fetch_cbc_sections(supabase)
    
    if not sections:
        print("❌ No sections found")
        return
    
    # Filter out already-processed sections
    sections_to_process = [s for s in sections if s['id'] not in all_classifications]
    
    if not sections_to_process:
        print("✅ All sections already processed!")
        print(f"   Total: {len(sections)} sections")
    else:
        print(f"📝 Sections to process: {len(sections_to_process)} (already done: {len(all_classifications)})")
    
    # Process in batches
    if sections_to_process:
        print(f"\n🤖 Classifying sections using LLM (batch size: {BATCH_SIZE})...")
        print(f"   This will make approximately {(len(sections_to_process) + BATCH_SIZE - 1) // BATCH_SIZE} API calls")
        print()
    
    for i in range(0, len(sections_to_process), BATCH_SIZE):
        batch = sections_to_process[i:i+BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (len(sections_to_process) + BATCH_SIZE - 1) // BATCH_SIZE
        
        print(f"Processing batch {batch_num}/{total_batches} ({len(batch)} sections)...", end=' ', flush=True)
        
        classifications = classify_sections_batch(batch)
        all_classifications.update(classifications)
        
        # Count how many sections got tagged in this batch
        tagged_count = sum(1 for tags in classifications.values() if tags)
        print(f"✓ ({tagged_count} tagged)")
        
        # Save checkpoint after each batch
        save_checkpoint(all_classifications, len(sections))
        
        # Rate limiting
        if i + BATCH_SIZE < len(sections_to_process):
            time.sleep(1)
    
    # Save final results to separate file (for reference/backup)
    results_file = 'element_tagging_results.json'
    print(f"\n💾 Saving final results to {results_file}...")
    results_data = {
        'timestamp': datetime.now().isoformat(),
        'total_sections_analyzed': len(sections),
        'classifications': {
            section_id: list(element_types) 
            for section_id, element_types in all_classifications.items()
        }
    }
    with open(results_file, 'w') as f:
        json.dump(results_data, f, indent=2)
    print(f"✅ Final results saved to {results_file}")
    
    # Build mappings
    print("\n📊 Building element-section mappings...")
    
    # Create section lookup map (id -> key)
    section_lookup = {s['id']: s['key'] for s in sections}
    
    mappings = []
    stats = {}
    
    for section_id, element_types in all_classifications.items():
        section_key = section_lookup.get(section_id)
        if not section_key:
            print(f"⚠️  Warning: No key found for section_id {section_id}, skipping")
            continue
            
        for element_type in element_types:
            if element_type in element_map:
                element_group_id = element_map[element_type]
                mappings.append((section_id, section_key, element_group_id))
                
                # Track stats
                if element_type not in stats:
                    stats[element_type] = 0
                stats[element_type] += 1
    
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
        
        # Clean up checkpoint file on successful completion
        if os.path.exists(CHECKPOINT_FILE):
            os.remove(CHECKPOINT_FILE)
            print(f"🧹 Removed checkpoint file ({CHECKPOINT_FILE})")
    else:
        print("\n⚠️  No mappings generated")
    
    print()

if __name__ == '__main__':
    main()

