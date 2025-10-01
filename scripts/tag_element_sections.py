#!/usr/bin/env python3
"""
Tag code sections as belonging to element groups (doors, bathrooms, kitchens).
Sections are mapped based on keywords and explicit section numbers.

Usage:
    python scripts/tag_element_sections.py
"""

import os
import sys
import psycopg2
from psycopg2.extras import execute_values

# Element classification rules
ELEMENT_MAPPINGS = {
    'doors': {
        'keywords': [
            'door', 'doorway', 'entrance', 'threshold',
            'maneuvering clearance', 'opening force', 'door hardware',
            'vision light', 'door closer', 'strike edge', 'latch side'
        ],
        'section_patterns': ['404', '409'],  # Main door sections
        'exclude_patterns': []  # Sections to explicitly exclude
    },
    'bathrooms': {
        'keywords': [
            'toilet', 'lavatory', 'restroom', 'water closet', 'urinal',
            'grab bar', 'toilet paper', 'flush control', 'ambulatory',
            'toilet compartment', 'toilet seat', 'bathing',
            'shower', 'bathtub', 'shower compartment', 'seat', 'controls',
            'washing machine', 'clothes dryer'
        ],
        'section_patterns': ['603', '604', '605', '606', '607', '608', '609'],
        'exclude_patterns': ['606.2', '606.3']  # Sinks are in kitchens too
    },
    'kitchens': {
        'keywords': [
            'kitchen', 'sink', 'work surface', 'cooktop', 'appliance',
            'dishwasher', 'food preparation', 'cooking', 'oven',
            'refrigerator', 'cabinet', 'counter', 'kitchenette'
        ],
        'section_patterns': ['804', '805', '606.2', '606.3'],  # Kitchen-specific + sink sections
        'exclude_patterns': []
    }
}


def get_db_connection():
    """Create database connection using environment variables"""
    try:
        return psycopg2.connect(
            host=os.getenv('SUPABASE_DB_HOST'),
            database=os.getenv('SUPABASE_DB_NAME', 'postgres'),
            user=os.getenv('SUPABASE_DB_USER', 'postgres'),
            password=os.getenv('SUPABASE_DB_PASSWORD'),
            port=os.getenv('SUPABASE_DB_PORT', 5432)
        )
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        print("\nRequired environment variables:")
        print("  - SUPABASE_DB_HOST")
        print("  - SUPABASE_DB_NAME (optional, defaults to 'postgres')")
        print("  - SUPABASE_DB_USER (optional, defaults to 'postgres')")
        print("  - SUPABASE_DB_PASSWORD")
        print("  - SUPABASE_DB_PORT (optional, defaults to 5432)")
        sys.exit(1)


def get_element_group_ids(cursor):
    """Fetch element group IDs from database"""
    cursor.execute("SELECT id, slug FROM element_groups ORDER BY sort_order")
    return {row[1]: row[0] for row in cursor.fetchall()}


def classify_section(section, element_config):
    """
    Check if section matches element criteria.
    Returns True if section should be mapped to this element group.
    """
    title = (section['title'] or '').lower()
    text = (section['text'] or '').lower()
    number = section['number'] or ''

    # First check explicit exclusions
    for exclude_pattern in element_config['exclude_patterns']:
        if number.startswith(exclude_pattern) or f"-{exclude_pattern}" in number:
            return False

    # Check section number patterns (most reliable)
    for pattern in element_config['section_patterns']:
        # Match patterns like "404", "11B-404", "404.1", "11B-404.1"
        if (number.startswith(pattern) or
            f"-{pattern}" in number or
            f"-{pattern}." in number):
            return True

    # Check keywords in title and text
    content = f"{title} {text}"
    keyword_matches = sum(1 for keyword in element_config['keywords'] if keyword in content)

    # Require at least 2 keyword matches to reduce false positives
    if keyword_matches >= 2:
        return True

    return False


def tag_sections():
    """Main function to tag all sections with element groups"""
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Get element group IDs
        group_ids = get_element_group_ids(cursor)
        if not group_ids:
            print("❌ No element groups found in database. Run migration first.")
            return

        print(f"✓ Found element groups: {', '.join(group_ids.keys())}\n")

        # Fetch all drawing-assessable sections
        cursor.execute("""
            SELECT key, number, title, text
            FROM sections
            WHERE drawing_assessable = TRUE
            ORDER BY number
        """)

        sections = [
            {
                'key': row[0],
                'number': row[1],
                'title': row[2],
                'text': row[3]
            }
            for row in cursor.fetchall()
        ]

        if not sections:
            print("⚠ No drawing-assessable sections found")
            return

        print(f"Processing {len(sections)} drawing-assessable sections...\n")

        # Classify sections
        mappings = []
        stats = {slug: [] for slug in group_ids.keys()}

        for section in sections:
            matched_any = False
            for element_slug, config in ELEMENT_MAPPINGS.items():
                if classify_section(section, config):
                    mappings.append((
                        group_ids[element_slug],
                        section['key']
                    ))
                    stats[element_slug].append(section['number'])
                    matched_any = True
                    print(f"  ✓ {section['number']:15} → {element_slug:10} {section['title'][:50]}")

            # Optionally show unmatched sections
            # if not matched_any:
            #     print(f"  - {section['number']:15}              {section['title'][:50]}")

        print(f"\n{'='*80}")
        print("Summary:")
        print(f"{'='*80}")

        for slug, section_numbers in stats.items():
            print(f"  {slug.capitalize():12} {len(section_numbers):3} sections")

        print(f"  {'Untagged':12} {len(sections) - len(mappings):3} sections")
        print(f"{'='*80}\n")

        # Insert mappings
        if mappings:
            print(f"Inserting {len(mappings)} mappings into database...")
            execute_values(
                cursor,
                """
                INSERT INTO element_section_mappings
                  (element_group_id, section_key)
                VALUES %s
                ON CONFLICT (element_group_id, section_key) DO NOTHING
                """,
                mappings
            )
            conn.commit()
            print("✓ Tagging complete!\n")
        else:
            print("⚠ No sections matched element criteria\n")

    except Exception as e:
        print(f"❌ Error during tagging: {e}")
        conn.rollback()
        raise

    finally:
        cursor.close()
        conn.close()


if __name__ == '__main__':
    print("="*80)
    print("Element Section Tagger")
    print("="*80 + "\n")
    tag_sections()
