#!/usr/bin/env python3
"""
Classify code sections by whether they can be assessed from drawings.
Uses AI to analyze each section and tag appropriately.
"""

import os
import json
from supabase import create_client, Client
from anthropic import Anthropic

CLASSIFICATION_PROMPT = """You are analyzing building code sections to determine if they can be assessed
from architectural drawings (plans, elevations, sections, details).

CODE SECTION:
Number: {number}
Title: {title}
Text: {text}
Paragraphs: {paragraphs}

Determine if this section:
1. Can be checked by looking at architectural drawings
2. Describes physical building elements/dimensions/specifications
3. Has measurable, visible requirements

Sections that are NOT assessable from drawings:
- Placeholder sections ("Reserved", "General" with no content)
- Definitional sections (just defines terms)
- Administrative (about employees, permits, documentation)
- Summary/overview sections
- Very short sections (<50 chars) with no substance

Return JSON:
{{
  "drawing_assessable": true/false,
  "confidence": "high"/"medium"/"low",
  "tags": ["too_short", "definitional", "administrative", "procedural", "summary", "not_physical"],
  "reason": "1-2 sentence explanation"
}}
"""


def classify_section(section: dict, anthropic_client: Anthropic) -> dict:
    """Use Claude to classify a section."""
    text = section.get('text', '')
    paragraphs = section.get('paragraphs', [])
    title = section.get('title', '')

    # Quick heuristics first
    if not paragraphs and len(text) < 50:
        return {
            'drawing_assessable': False,
            'confidence': 'high',
            'tags': ['too_short'],
            'reason': 'Insufficient content'
        }

    if title.lower() in ['reserved', 'reserved.', 'general', 'general.']:
        return {
            'drawing_assessable': False,
            'confidence': 'high',
            'tags': ['placeholder'],
            'reason': 'Placeholder section'
        }

    # Use AI for complex cases
    prompt = CLASSIFICATION_PROMPT.format(
        number=section['number'],
        title=title,
        text=text[:500] if text else '',
        paragraphs='\n'.join(paragraphs[:3]) if paragraphs else ''
    )

    try:
        response = anthropic_client.messages.create(
            model='claude-3-5-sonnet-20241022',
            max_tokens=500,
            messages=[{'role': 'user', 'content': prompt}]
        )

        result_text = response.content[0].text
        # Extract JSON from response (may have markdown code blocks)
        if '```json' in result_text:
            result_text = result_text.split('```json')[1].split('```')[0].strip()
        elif '```' in result_text:
            result_text = result_text.split('```')[1].split('```')[0].strip()

        return json.loads(result_text)
    except Exception as e:
        print(f"Error classifying section {section.get('number')}: {e}")
        # Default to assessable on error
        return {
            'drawing_assessable': True,
            'confidence': 'low',
            'tags': [],
            'reason': f'Classification error: {str(e)}'
        }


def main():
    supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    anthropic_api_key = os.getenv('ANTHROPIC_API_KEY')

    if not all([supabase_url, supabase_key, anthropic_api_key]):
        print('Missing required environment variables:')
        print('- NEXT_PUBLIC_SUPABASE_URL')
        print('- SUPABASE_SERVICE_ROLE_KEY')
        print('- ANTHROPIC_API_KEY')
        exit(1)

    supabase: Client = create_client(supabase_url, supabase_key)
    anthropic_client = Anthropic(api_key=anthropic_api_key)

    # Fetch all sections
    print('Fetching sections from database...')
    response = supabase.table('sections').select('*').execute()
    sections = response.data

    print(f'Found {len(sections)} sections to classify\n')

    batch_updates = []
    stats = {
        'assessable': 0,
        'non_assessable': 0,
        'by_tag': {}
    }

    for i, section in enumerate(sections):
        result = classify_section(section, anthropic_client)

        batch_updates.append({
            'key': section['key'],
            'drawing_assessable': result['drawing_assessable'],
            'assessability_tags': result['tags']
        })

        # Update stats
        if result['drawing_assessable']:
            stats['assessable'] += 1
            status_icon = '✓'
        else:
            stats['non_assessable'] += 1
            status_icon = '✗'
            for tag in result['tags']:
                stats['by_tag'][tag] = stats['by_tag'].get(tag, 0) + 1

        print(f"[{i+1}/{len(sections)}] {section['number']}: {status_icon} "
              f"{result['confidence']} - {result['tags']}")

        # Batch update every 100
        if len(batch_updates) >= 100:
            print(f'\nUpdating batch of {len(batch_updates)} sections...')
            for update in batch_updates:
                supabase.table('sections').update({
                    'drawing_assessable': update['drawing_assessable'],
                    'assessability_tags': update['assessability_tags']
                }).eq('key', update['key']).execute()
            batch_updates = []

    # Final batch
    if batch_updates:
        print(f'\nUpdating final batch of {len(batch_updates)} sections...')
        for update in batch_updates:
            supabase.table('sections').update({
                'drawing_assessable': update['drawing_assessable'],
                'assessability_tags': update['assessability_tags']
            }).eq('key', update['key']).execute()

    # Print summary
    print('\n' + '='*60)
    print('CLASSIFICATION SUMMARY')
    print('='*60)
    print(f'Total sections: {len(sections)}')
    print(f'Assessable: {stats["assessable"]} ({stats["assessable"]/len(sections)*100:.1f}%)')
    print(f'Non-assessable: {stats["non_assessable"]} ({stats["non_assessable"]/len(sections)*100:.1f}%)')
    print('\nNon-assessable breakdown:')
    for tag, count in sorted(stats['by_tag'].items(), key=lambda x: x[1], reverse=True):
        print(f'  {tag}: {count}')
    print('='*60)


if __name__ == '__main__':
    main()
