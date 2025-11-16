#!/usr/bin/env python3
"""
Filter out residential-specific sections from an assessment using an LLM.

This script:
1. Fetches all sections used in an assessment
2. For each section, also gets parent sections and referenced sections
3. Uses an LLM to determine if the section is explicitly residential-specific
4. Outputs results to a JSON file
"""

import os
import sys
import json
import argparse
from typing import Dict, List, Set, Optional
from pathlib import Path
from supabase import create_client, Client
import anthropic

# Configuration - HARDCODED to PRODUCTION database
# Production: grosxzvvmhakkxybeuwu
SUPABASE_URL = 'https://grosxzvvmhakkxybeuwu.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb3N4enZ2bWhha2t4eWJldXd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTE1MTM4NiwiZXhwIjoyMDc0NzI3Mzg2fQ.tP_KLIRVNdAXAFQvaj-jA_woz4jwUU8hRfy521JFOdY'
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', '')


def get_supabase_client() -> Client:
    """Initialize Supabase client."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables")

    # Create client with service role key (bypasses RLS)
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return client


def get_anthropic_client() -> anthropic.Anthropic:
    """Initialize Anthropic client."""
    if not ANTHROPIC_API_KEY:
        raise ValueError("Missing ANTHROPIC_API_KEY environment variable")
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def fetch_assessment_sections(supabase: Client, assessment_id: str) -> List[Dict]:
    """Fetch all unique sections for an assessment."""
    print(f"Fetching sections for assessment {assessment_id}...")

    # Get all unique section_ids for this assessment
    checks_response = supabase.from_('checks').select('section_id').eq(
        'assessment_id', assessment_id
    ).execute()

    if not checks_response.data:
        print(f"No checks found for assessment {assessment_id}")
        return []

    # Get unique section IDs
    section_ids = list(set(check['section_id'] for check in checks_response.data if check.get('section_id')))

    if not section_ids:
        print("No section IDs found in checks")
        return []

    print(f"Found {len(section_ids)} unique section IDs, fetching section details...")

    # Fetch section details in batches (PostgREST has limits)
    batch_size = 100
    all_sections = []

    for i in range(0, len(section_ids), batch_size):
        batch_ids = section_ids[i:i + batch_size]
        sections_response = supabase.from_('sections').select(
            'id, key, number, title, text, parent_key, paragraphs'
        ).in_('id', batch_ids).execute()

        if sections_response.data:
            all_sections.extend(sections_response.data)

    print(f"Found {len(all_sections)} unique sections")
    return all_sections


def fetch_section_with_references(supabase: Client, section_key: str) -> Optional[Dict]:
    """Fetch a section with its parent and references using the RPC."""
    try:
        response = supabase.rpc(
            'get_section_with_references',
            {'section_key': section_key}
        ).execute()

        return response.data if response.data else None
    except Exception as e:
        print(f"Error fetching section {section_key}: {e}")
        return None


def collect_all_related_sections(supabase: Client, base_sections: List[Dict]) -> Dict[str, Dict]:
    """
    Collect all sections, including parent sections and referenced sections.
    Returns a dict keyed by section key.
    """
    print("Collecting all related sections (including parents and references)...")
    all_sections = {}
    processed_keys = set()

    # Process each base section
    for i, section in enumerate(base_sections):
        if i % 100 == 0:
            print(f"Processing section {i+1}/{len(base_sections)}...")

        section_key = section['key']

        if section_key in processed_keys:
            continue

        # Fetch with references
        section_data = fetch_section_with_references(supabase, section_key)

        if not section_data:
            # Fallback to basic section data
            all_sections[section_key] = section
            processed_keys.add(section_key)
            continue

        # Add main section
        main_section = section_data.get('section', {})
        if main_section:
            all_sections[section_key] = main_section
            processed_keys.add(section_key)

        # Add parent section if exists
        parent_section = section_data.get('parent_section')
        if parent_section and parent_section.get('key'):
            parent_key = parent_section['key']
            if parent_key not in all_sections:
                all_sections[parent_key] = parent_section
                processed_keys.add(parent_key)

        # Add referenced sections
        references = section_data.get('references', [])
        for ref in references:
            ref_key = ref.get('key')
            if ref_key and ref_key not in all_sections:
                # Remove reference metadata, keep just section data
                ref_copy = {k: v for k, v in ref.items() if k not in ['citation_text', 'explicit']}
                all_sections[ref_key] = ref_copy
                processed_keys.add(ref_key)

    print(f"Collected {len(all_sections)} total sections (including parents and references)")
    return all_sections


def analyze_sections_batch(client: anthropic.Anthropic, sections: List[Dict]) -> Dict[str, Dict]:
    """
    Analyze a batch of sections using Claude to determine which are residential-specific.
    More efficient than individual calls.

    Returns dict mapping section_key -> analysis result
    """
    # Build the batch prompt
    sections_text = []
    for i, section in enumerate(sections):
        number = section.get('number', 'Unknown')
        title = section.get('title', '')
        text = section.get('text', '')[:500]  # Limit text length

        sections_text.append(f"[{i}] Section {number}: {title}\n{text}")

    batch_text = "\n\n".join(sections_text)

    prompt = f"""Analyze these building code sections and determine which are EXPLICITLY and EXCLUSIVELY about residential buildings.

A section should ONLY be marked as residential if it:
- Explicitly mentions "residential" or "dwelling units" or "R-" occupancy groups (like "R-2", "R-3")
- Is clearly only applicable to residential buildings
- Has no applicability to commercial/institutional buildings

A section should NOT be marked as residential if it:
- Could apply to both residential AND commercial buildings
- Is a general requirement that applies across occupancy types
- Only mentions residential as one example among others

Sections to analyze:
{batch_text}

For each section, respond with a JSON array where each element corresponds to the section index:
[
  {{
    "index": 0,
    "is_residential": true/false,
    "confidence": "high" | "medium" | "low",
    "reasoning": "Brief explanation"
  }},
  ...
]

IMPORTANT: Return ONLY the JSON array, no other text."""

    try:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4000,
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )

        # Extract JSON from response
        response_text = message.content[0].text.strip()

        # Try to parse JSON
        try:
            results_array = json.loads(response_text)
        except json.JSONDecodeError:
            # Try to extract from markdown code block
            if "```json" in response_text:
                json_start = response_text.find("```json") + 7
                json_end = response_text.find("```", json_start)
                json_text = response_text[json_start:json_end].strip()
                results_array = json.loads(json_text)
            elif "```" in response_text:
                # Try plain code block
                json_start = response_text.find("```") + 3
                json_end = response_text.find("```", json_start)
                json_text = response_text[json_start:json_end].strip()
                results_array = json.loads(json_text)
            else:
                raise ValueError("Could not extract JSON from response")

        # Map results back to sections
        results = {}
        for result in results_array:
            idx = result.get('index', -1)
            if 0 <= idx < len(sections):
                section_key = sections[idx].get('key', '')
                results[section_key] = {
                    'is_residential': result.get('is_residential', False),
                    'confidence': result.get('confidence', 'low'),
                    'reasoning': result.get('reasoning', '')
                }

        return results

    except Exception as e:
        print(f"Error analyzing batch: {e}")
        # Return empty results for all sections
        return {
            section.get('key', ''): {
                'is_residential': False,
                'confidence': 'low',
                'reasoning': f'Error: {str(e)}'
            }
            for section in sections
        }


def filter_residential_sections_batch(
    client: anthropic.Anthropic,
    sections: List[Dict],
    batch_size: int = 20
) -> Dict[str, Dict]:
    """
    Filter sections using LLM, processing in batches to show progress.

    Returns dict with section_key -> {section, analysis}
    """
    print(f"\nFiltering {len(sections)} sections using LLM...")
    print(f"Processing in batches of {batch_size}...")
    print("This may take a while...\n")

    all_results = {}
    total_batches = (len(sections) + batch_size - 1) // batch_size

    for i in range(0, len(sections), batch_size):
        batch_num = (i // batch_size) + 1
        batch = sections[i:i + batch_size]

        print(f"Analyzing batch {batch_num}/{total_batches} ({len(batch)} sections)...")

        # Analyze this batch
        batch_results = analyze_sections_batch(client, batch)

        # Store results
        for section in batch:
            section_key = section.get('key', '')
            analysis = batch_results.get(section_key, {
                'is_residential': False,
                'confidence': 'low',
                'reasoning': 'No analysis result'
            })

            all_results[section_key] = {
                'section': section,
                'analysis': analysis
            }

            # Log residential findings
            if analysis.get('is_residential'):
                print(f"  ✓ Found residential: {section.get('number')} - {section.get('title')[:60]}")

    print(f"\nCompleted analysis of {len(sections)} sections")
    return all_results


def main():
    parser = argparse.ArgumentParser(
        description='Filter residential-specific sections from an assessment'
    )
    parser.add_argument(
        'assessment_id',
        help='Assessment ID to process'
    )
    parser.add_argument(
        '--output',
        '-o',
        default='residential_sections.json',
        help='Output JSON file path (default: residential_sections.json)'
    )
    parser.add_argument(
        '--batch-size',
        '-b',
        type=int,
        default=20,
        help='Number of sections to analyze per LLM call (default: 20)'
    )
    parser.add_argument(
        '--limit',
        '-l',
        type=int,
        default=None,
        help='Limit total number of sections to analyze (for testing)'
    )
    parser.add_argument(
        '--skip-references',
        action='store_true',
        help='Skip fetching parent and referenced sections (faster, less complete)'
    )

    args = parser.parse_args()

    # Initialize clients
    print("Initializing clients...")
    supabase = get_supabase_client()
    anthropic_client = get_anthropic_client()

    # Step 1: Fetch assessment sections
    base_sections = fetch_assessment_sections(supabase, args.assessment_id)

    if not base_sections:
        print("No sections found for this assessment!")
        sys.exit(1)

    # Step 2: Collect all related sections (parents + references)
    if args.skip_references:
        print("Skipping parent and referenced sections...")
        all_sections = {s['key']: s for s in base_sections}
    else:
        all_sections = collect_all_related_sections(supabase, base_sections)

    # Step 3: Filter using LLM
    sections_list = list(all_sections.values())

    # Apply limit if specified
    if args.limit and args.limit < len(sections_list):
        print(f"Limiting to {args.limit} sections for testing...")
        sections_list = sections_list[:args.limit]
    filtered_results = filter_residential_sections_batch(
        anthropic_client,
        sections_list,
        batch_size=args.batch_size
    )

    # Step 4: Prepare output
    residential_sections = {
        k: v for k, v in filtered_results.items()
        if v['analysis'].get('is_residential', False)
    }

    output_data = {
        'assessment_id': args.assessment_id,
        'total_sections_analyzed': len(filtered_results),
        'residential_sections_found': len(residential_sections),
        'residential_sections': residential_sections,
        'all_results': filtered_results
    }

    # Step 5: Save to JSON
    output_path = args.output
    with open(output_path, 'w') as f:
        json.dump(output_data, f, indent=2)

    print(f"\n{'='*60}")
    print(f"Results saved to: {output_path}")
    print(f"Total sections analyzed: {len(filtered_results)}")
    print(f"Residential sections found: {len(residential_sections)}")
    print(f"{'='*60}")

    # Print summary of residential sections
    if residential_sections:
        print("\nResidential sections found:")
        for key, data in residential_sections.items():
            section = data['section']
            analysis = data['analysis']
            print(f"  - {section.get('number')}: {section.get('title')}")
            print(f"    Confidence: {analysis.get('confidence')}")
            print(f"    Reason: {analysis.get('reasoning')[:80]}...")
            print()


if __name__ == '__main__':
    main()
