#!/usr/bin/env python3
"""
High-recall, multi-label tagging of CBC 11A/11B clauses as {doors, bathrooms, kitchens}.

- Unit: lowest numbered clause (e.g., 1126A.3.2.1, 11B-404.2.9)
- Includes notes/exceptions/captions present in the clause text.
- Deterministic Stage A (anchors + ancestor context + curated regex).
- Optional Stage B LLM for residuals (set USE_LLM_SWEEP=True and OPENAI_API_KEY).
- Skips definitional/reserved; minimizes tagging in 11B scoping chapters unless prescriptive.

Usage:
    python scripts/tag_element_sections.py [--csv-only]
"""

import os
import re
import sys
import csv
import json
import time
from supabase import create_client, Client

# ---------------------------
# Config
# ---------------------------

USE_LLM_SWEEP = True  # flip to False to disable Stage B LLM sweep; requires OPENAI_API_KEY

# Anchors by section number prefix (strongest rules).
# We treat any clause whose `number` begins with one of these prefixes as in scope.
ANCHORS = {
    'doors': [
        # 11B Doors, Doorways, and Gates
        r'^11B[-–]?404(\.|$)',
        # 11A Doors, Gates and Windows
        r'^1126A(\.|$)',
    ],
    'bathrooms': [
        # 11B Toilet/Bath requirements
        r'^11B[-–]?603(\.|$)', r'^11B[-–]?604(\.|$)', r'^11B[-–]?605(\.|$)',
        r'^11B[-–]?606(\.|$)', r'^11B[-–]?607(\.|$)', r'^11B[-–]?608(\.|$)',
        r'^11B[-–]?609(\.|$)', r'^11B[-–]?610(\.|$)',
        # 11A Common use toilet/bath
        r'^1127A\.2(\.|$)', r'^1127A\.3(\.|$)', r'^1127A\.4(\.|$)', r'^1127A\.5(\.|$)',
    ],
    'kitchens': [
        # 11B Kitchens and Kitchenettes
        r'^11B[-–]?804(\.|$)',
        # 11A dwelling-unit kitchen rules vary by cycle; rely on keywords + ancestor titles there.
    ],
}

# Negative filters for definitional/scoping content.
DEF_SCOPING_TITLE_RX = re.compile(r'\b(definition|definitions|reserved|scope|scoping|application|purpose)\b', re.I)

# In 11B, Chapter "2xx" are scoping. We soft-exclude them unless clearly prescriptive.
IS_11B_SCOPING_RX = re.compile(r'^11B[-–]?2\d\d(\.|$)', re.I)

# Keyword families with robust regex (word boundaries, optional hyphens, plurals).
# We also search ancestor titles to capture context like "Kitchens" or "Toilet Facilities".
KEYWORDS = {
    'doors': [
        r'\bdoor(?:s|way)?\b', r'\bdoor[-\s]?closer\b', r'\bdoor[-\s]?stop\b',
        r'\bgate(s)?\b', r'\bthresholds?\b', r'\bstrike[-\s]?edge\b', r'\blatch(?:es)?\b',
        r'\bhinge(s)?\b', r'\bpanic\s+bar\b', r'\bvision\s+light\b',
        r'\bclear\s+opening\b', r'\bmaneuvering\s+clearance\b', r'\bdoor\s+swing\b',
        r'\brevolving\s+door\b', r'\bsliding\s+door\b', r'\b(folding|pocket)\s+door\b',
        r'\bpair\s+of\s+doors\b', r'\bdoor\s+hardware\b'
    ],
    'bathrooms': [
        r'\b(toilet|toilet\s+room|restroom|water\s+closet|WC)\b',
        r'\burinal(s)?\b',
        r'\blavator(y|ies)\b', r'\bmirror(s)?\b',
        r'\bgrab\s+bar(s)?\b', r'\bambulatory\b',
        r'\b(compartment|stall)\b', r'\bflush\s+control(s)?\b',
        r'\b(shower|shower\s+compartment|shower\s+seat)\b',
        r'\bbath(tub|ing)\b', r'\bshower\s+curb\b', r'\bshower\s+controls?\b',
        r'\baccessor(y|ies)\b', r'\btoilet\s+paper\s+dispenser\b'
    ],
    'kitchens': [
        r'\bkitchen(?:ette)?s?\b', r'\bpantr(y|ies)\b',
        r'\b(work\s*surface|counter(?:top)?s?)\b',
        r'\bsink(s)?\b', r'\bappliance(s)?\b', r'\bcook(top|ing)\b',
        r'\boven(s)?\b', r'\brange(s)?\b', r'\bdishwasher(s)?\b',
        r'\b(refrigerator|fridge)s?\b', r'\bcabinet(s)?\b'
    ],
}

# Minimum keyword hits to consider topical, after ancestor boosting.
MIN_KEYWORD_MATCH = 2

# ---------------------------
# DB helpers
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

def get_element_group_ids(supabase: Client):
    response = supabase.table('element_groups').select('id, slug').order('sort_order').execute()
    return {row['slug']: row['id'] for row in response.data}

def fetch_sections(supabase: Client):
    # Fetch ALL sections using pagination to overcome Supabase 1000-row limit
    all_sections = []
    page_size = 1000
    offset = 0

    while True:
        response = supabase.table('sections').select('key, number, title, text, paragraphs').eq('drawing_assessable', True).order('number').range(offset, offset + page_size - 1).execute()

        if not response.data:
            break

        all_sections.extend([{
            'key': r['key'],
            'number': r['number'] or '',
            'title': r['title'] or '',
            'text': r['text'] or '',
            'paragraphs': r['paragraphs'] or []
        } for r in response.data])

        if len(response.data) < page_size:
            break

        offset += page_size

    return all_sections

def fetch_ancestors(supabase: Client, number):
    """
    Resolve ancestor titles by truncating the number progressively.
    Works for both '11B-404.2.3' and '1126A.3.2.1' styles.
    """
    candidates = []
    norm = number.strip()
    # Split on '-' for 11B-xxx, keep prefix, then peel dot levels
    if '-' in norm:
        prefix, rest = norm.split('-', 1)
        parts = rest.split('.')
        for i in range(1, len(parts)+1):
            cand = f"{prefix}-{'.'.join(parts[:i])}"
            if cand != norm:
                candidates.append(cand)
    else:
        # 1126A.3.2.1 -> 1126A, 1126A.3, 1126A.3.2, 1126A.3.2.1 (excluding self)
        parts = norm.split('.')
        for i in range(1, len(parts)):
            candidates.append('.'.join(parts[:i]))

    if not candidates:
        return []

    # Retry logic for network errors
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = supabase.table('sections').select('number, title').in_('number', candidates).execute()
            return [row['title'] for row in response.data if row['title']]
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(1 * (attempt + 1))  # Exponential backoff
                continue
            else:
                print(f"   ⚠ Failed to fetch ancestors for {number}: {e}")
                return []  # Return empty on failure

# ---------------------------
# Text matching
# ---------------------------

def is_def_or_scoping(section, ancestor_titles):
    title = section['title'].strip()
    if DEF_SCOPING_TITLE_RX.search(title):
        return True
    # Soft-guard for 11B scoping chapters like 11B-2xx
    if IS_11B_SCOPING_RX.match(section['number'] or ''):
        # Extract paragraphs text
        paragraphs_text = ''
        if section.get('paragraphs') and isinstance(section['paragraphs'], list):
            paragraphs_text = ' '.join(section['paragraphs'])

        # allow if clearly prescriptive about our elements (keyword-heavy)
        content = f"{section['title']} {section['text']} {paragraphs_text} {' '.join(ancestor_titles)}"
        hits = sum(1 for labels in KEYWORDS.values() for rx in labels if re.search(rx, content, flags=re.I))
        return hits < 2  # treat as scoping if it doesn't look prescriptive
    return False

def match_anchors(number):
    hits = set()
    for label, patterns in ANCHORS.items():
        for pat in patterns:
            if re.search(pat, number):
                hits.add(label)
                break
    return hits

def match_keywords(section, ancestor_titles):
    # Extract text from paragraphs JSONB array
    paragraphs_text = ''
    if section.get('paragraphs'):
        if isinstance(section['paragraphs'], list):
            paragraphs_text = ' '.join(section['paragraphs'])
        elif isinstance(section['paragraphs'], str):
            # Sometimes it might be a JSON string
            try:
                import json
                paras = json.loads(section['paragraphs'])
                if isinstance(paras, list):
                    paragraphs_text = ' '.join(paras)
            except:
                pass

    content = ' '.join([
        section['title'],
        section['text'],
        paragraphs_text,
        ' '.join(ancestor_titles)
    ])

    labels = set()
    for label, patterns in KEYWORDS.items():
        k_hits = 0
        for rx in patterns:
            if re.search(rx, content, flags=re.I):
                k_hits += 1
        # Ancestors provide semantic boost; reduce threshold if ancestor titles are topical
        boost = 0
        ancostr = ' '.join(ancestor_titles).lower()
        if label == 'doors' and ('door' in ancostr or 'gate' in ancostr):
            boost = 1
        if label == 'bathrooms' and any(w in ancostr for w in ['toilet', 'bath', 'shower', 'lavator']):
            boost = 1
        if label == 'kitchens' and 'kitchen' in ancostr:
            boost = 1
        if k_hits + boost >= MIN_KEYWORD_MATCH:
            labels.add(label)
    return labels

# ---------------------------
# Optional LLM sweep
# ---------------------------

def llm_classify_batch(sections_with_ancestors):
    """
    Classify multiple sections in a single API call.

    Args:
        sections_with_ancestors: List of tuples (section, ancestor_titles)

    Returns:
        Dict mapping section index to set of labels
    """
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key or not sections_with_ancestors:
        return {}

    try:
        import requests
        url = "https://api.openai.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        sys_prompt = (
            "You label building code clauses with any of these tags: doors, bathrooms, kitchens. "
            "Tag ONLY if the clause itself contains prescriptive content for that element type. "
            "Do NOT tag definitions, scoping, or clauses that merely point elsewhere. "
            "Multi-label is allowed. You will receive multiple sections at once. "
            "Return a JSON object with 'results' array containing one entry per section in order, "
            "each with 'index' (0-based) and 'labels' (array of tags). "
            "Example: {\"results\": [{\"index\": 0, \"labels\": [\"doors\"]}, {\"index\": 1, \"labels\": []}]}"
        )

        # Build batch payload
        sections_payload = []
        for idx, (section, ancestor_titles) in enumerate(sections_with_ancestors):
            paragraphs_text = []
            if section.get('paragraphs') and isinstance(section['paragraphs'], list):
                paragraphs_text = section['paragraphs']

            sections_payload.append({
                "index": idx,
                "number": section['number'],
                "title": section['title'],
                "text": section['text'],
                "paragraphs": paragraphs_text,
                "ancestor_titles": ancestor_titles,
            })

        data = {
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": json.dumps({"sections": sections_payload}, ensure_ascii=False)}
            ],
            "temperature": 0.0,
            "response_format": {"type": "json_object"}
        }

        resp = requests.post(url, headers=headers, json=data, timeout=60)
        resp.raise_for_status()
        out = resp.json()["choices"][0]["message"]["content"]
        parsed = json.loads(out)

        # Parse results into dict
        results = {}
        for result in parsed.get("results", []):
            idx = result.get("index")
            labels = result.get("labels", [])
            if idx is not None:
                results[idx] = set([l for l in labels if l in {"doors", "bathrooms", "kitchens"}])

        return results
    except Exception as e:
        print(f"   ⚠ LLM batch failed: {e}")
        return {}

# ---------------------------
# CSV + DB
# ---------------------------

def export_to_csv(rows, out_path="section_tagging_analysis.csv"):
    with open(out_path, "w", newline='', encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Section Number", "Title", "Text Preview", "Suggested Tags", "Reason"])
        for r in rows:
            # Combine text and paragraphs for preview
            text_parts = []
            if r.get('text'):
                text_parts.append(r['text'])
            if r.get('paragraphs') and isinstance(r['paragraphs'], list):
                text_parts.extend(r['paragraphs'])

            text_preview = ' '.join(text_parts).strip().replace('\n', ' ')
            if len(text_preview) > 140:
                text_preview = text_preview[:140] + "…"

            w.writerow([
                r['number'], r['title'], text_preview,
                ",".join(sorted(r.get('tags', []))) or "NONE",
                r.get('reason', '')
            ])
    print(f"✓ Exported analysis to: {out_path}\n")

def upsert_mappings(supabase: Client, mappings):
    """
    mappings: list of {'element_group_id': uuid, 'section_key': str}
    """
    if not mappings:
        return
    try:
        # Supabase Python client doesn't support on_conflict parameter
        # Use insert with error handling instead
        response = supabase.table('element_section_mappings').insert(mappings).execute()
        return response
    except Exception as e:
        # If duplicates exist, try individual inserts
        print(f"   Batch insert failed, trying individual inserts: {e}")
        success_count = 0
        for mapping in mappings:
            try:
                supabase.table('element_section_mappings').insert(mapping).execute()
                success_count += 1
            except Exception as inner_e:
                # Skip duplicates silently
                if 'duplicate' not in str(inner_e).lower():
                    print(f"   Failed to insert mapping: {inner_e}")
        print(f"   ✓ Inserted {success_count}/{len(mappings)} mappings (skipped duplicates)")

# ---------------------------
# Main
# ---------------------------

def main():
    start_time = time.time()

    print("="*80)
    print("CBC 11A/11B Element Tagger (doors, bathrooms, kitchens) — v2")
    print("="*80 + "\n")

    print("⏳ Initializing Supabase client...")
    supabase = get_supabase_client()
    print("✓ Connected to Supabase\n")

    try:
        print("📋 Fetching element groups...")
        group_ids = get_element_group_ids(supabase)
        required = {"doors", "bathrooms", "kitchens"}
        missing = required - set(group_ids.keys())
        if missing:
            raise RuntimeError(f"Missing element_groups slugs: {', '.join(sorted(missing))}")
        print(f"✓ Found element groups: {', '.join(group_ids.keys())}\n")

        print("🔍 Fetching drawing-assessable sections...")
        sections = fetch_sections(supabase)
        if not sections:
            print("⚠ No drawing-assessable sections found")
            return
        print(f"✓ Loaded {len(sections)} sections\n")

        print("🏷️  Starting classification process...")
        print(f"   Stage A.1: Section number anchors (CBC-specific)")
        print(f"   Stage A.2: Keyword matching + ancestor context")
        if USE_LLM_SWEEP:
            print(f"   Stage B:   LLM sweep (gpt-4o-mini) for untagged sections")
        print()

        results = []
        stage_stats = {'anchor': 0, 'keyword': 0, 'llm': 0, 'skipped': 0, 'unmatched': 0}

        print(f"Processing {len(sections)} sections...")
        sys.stdout.flush()

        # First pass: anchor and keyword matching
        untagged_sections = []  # Will collect sections that need LLM
        BATCH_SIZE = 5

        for idx, s in enumerate(sections, 1):
            if idx % 50 == 0:
                print(f"   Processed {idx}/{len(sections)} sections... (anchors: {stage_stats['anchor']}, keywords: {stage_stats['keyword']}, skipped: {stage_stats['skipped']})")
                sys.stdout.flush()

            ancestors = fetch_ancestors(supabase, s['number'])

            # Check definitional/scoping
            if is_def_or_scoping(s, ancestors):
                results.append({**s, 'tags': set(), 'reason': 'Skipped: definitional/scoping', 'ancestors': ancestors})
                stage_stats['skipped'] += 1
                continue

            tags = set()
            reasons = []

            # Stage A.1: anchors
            anchor_hits = match_anchors(s['number'])
            if anchor_hits:
                tags |= anchor_hits
                reasons.append(f"anchors:{'/'.join(sorted(anchor_hits))}")
                stage_stats['anchor'] += 1

            # Stage A.2: keywords + ancestor titles
            kw_hits = match_keywords(s, ancestors)
            if kw_hits:
                tags |= kw_hits
                reasons.append(f"keywords:{'/'.join(sorted(kw_hits))}")
                if not anchor_hits:  # Only count if not already counted
                    stage_stats['keyword'] += 1

            if not tags and USE_LLM_SWEEP:
                # Store for batch processing
                untagged_sections.append((len(results), s, ancestors))
                results.append({**s, 'tags': set(), 'reason': '', 'ancestors': ancestors})
            else:
                if not tags:
                    stage_stats['unmatched'] += 1
                results.append({**s, 'tags': tags, 'reason': ';'.join(reasons) if reasons else 'no match', 'ancestors': ancestors})

        # Stage B: batch LLM processing
        if USE_LLM_SWEEP and untagged_sections:
            print(f"\n   Starting LLM batch processing for {len(untagged_sections)} untagged sections...")
            sys.stdout.flush()

            for batch_start in range(0, len(untagged_sections), BATCH_SIZE):
                batch = untagged_sections[batch_start:batch_start + BATCH_SIZE]
                batch_data = [(s, ancestors) for (_, s, ancestors) in batch]

                if (batch_start // BATCH_SIZE) % 10 == 0:
                    print(f"   LLM batch {batch_start // BATCH_SIZE + 1}/{(len(untagged_sections) + BATCH_SIZE - 1) // BATCH_SIZE}... ({stage_stats['llm']} classified)")
                    sys.stdout.flush()

                llm_results = llm_classify_batch(batch_data)

                for batch_idx, (result_idx, s, ancestors) in enumerate(batch):
                    llm_hits = llm_results.get(batch_idx, set())
                    if llm_hits:
                        results[result_idx]['tags'] = llm_hits
                        results[result_idx]['reason'] = f"llm:{'/'.join(sorted(llm_hits))}"
                        stage_stats['llm'] += 1
                    else:
                        results[result_idx]['reason'] = 'no match'
                        stage_stats['unmatched'] += 1

            print(f"   ✓ LLM processing complete: {stage_stats['llm']} sections tagged")
            sys.stdout.flush()

        print(f"   Processed {len(sections)}/{len(sections)} sections\n")

        # Stage statistics
        print("📊 Classification Stage Results:")
        print(f"   Stage A.1 (anchors):  {stage_stats['anchor']} sections")
        print(f"   Stage A.2 (keywords): {stage_stats['keyword']} sections")
        if USE_LLM_SWEEP:
            print(f"   Stage B   (LLM):      {stage_stats['llm']} sections")
        print(f"   Skipped (def/scope):  {stage_stats['skipped']} sections")
        print(f"   Unmatched:            {stage_stats['unmatched']} sections")
        print()

        # CSV export
        print("💾 Exporting results to CSV...")
        export_to_csv(results)

        if '--csv-only' in sys.argv:
            print("ℹ️  CSV-only mode: Skipping database writes.")
            print(f"   Review section_tagging_analysis.csv and run without --csv-only to insert.\n")
            return

        # Build mapping rows (multi-label)
        print("🔨 Building element-section mappings...")
        mappings = []
        stat = {'doors': 0, 'bathrooms': 0, 'kitchens': 0, 'skipped': 0, 'untagged': 0}
        multi_label_count = 0

        for r in results:
            if r['reason'].startswith('Skipped:'):
                stat['skipped'] += 1
                continue
            if not r['tags']:
                stat['untagged'] += 1
                continue

            if len(r['tags']) > 1:
                multi_label_count += 1

            for label in r['tags']:
                mappings.append({
                    'element_group_id': group_ids[label],
                    'section_key': r['key']
                })
                stat[label] += 1

        print(f"✓ Built {len(mappings)} mappings ({multi_label_count} sections with multiple tags)\n")

        # Summary
        print("="*80)
        print("📈 FINAL SUMMARY")
        print("="*80)
        print(f"  {'Element Group':<15} {'Tagged Sections':<20} {'Unique Sections':<20}")
        print("-"*80)

        # Count unique sections per tag
        unique_counts = {}
        for label in ['doors', 'bathrooms', 'kitchens']:
            unique_sections = set()
            for r in results:
                if label in r['tags']:
                    unique_sections.add(r['key'])
            unique_counts[label] = len(unique_sections)

        print(f"  {'Doors':<15} {stat['doors']:<20} {unique_counts['doors']:<20}")
        print(f"  {'Bathrooms':<15} {stat['bathrooms']:<20} {unique_counts['bathrooms']:<20}")
        print(f"  {'Kitchens':<15} {stat['kitchens']:<20} {unique_counts['kitchens']:<20}")
        print("-"*80)
        print(f"  {'Skipped':<15} {stat['skipped']:<20} (definitions/scoping)")
        print(f"  {'Untagged':<15} {stat['untagged']:<20}")
        print(f"  {'Multi-labeled':<15} {multi_label_count:<20}")
        print("="*80 + "\n")

        if mappings:
            print(f"💾 Inserting {len(mappings)} mappings into database...")
            upsert_mappings(supabase, mappings)
            elapsed = time.time() - start_time
            print(f"✅ Tagging complete in {elapsed:.1f}s\n")
        else:
            print("⚠ No mappings to insert\n")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        raise

if __name__ == '__main__':
    main()
