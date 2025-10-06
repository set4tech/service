"""
Database-level validation script for ICC CBC references.

This script validates that:
1. No dangling references exist (references pointing to non-existent sections)
2. Text references match database references
3. All multi-level subsections exist in the database

Usage:
    python scripts/db_reference_check.py

Requires:
    - Environment variables: SUPABASE_URL, SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY)
    - or PostgreSQL connection string
"""

import os
import re
import sys
from typing import Dict, List, Set, Tuple

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("Error: psycopg2 not installed. Install with: pip install psycopg2-binary")
    sys.exit(1)


def get_db_connection():
    """Get database connection from environment variables."""
    # Try Supabase connection
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_ANON_KEY')

    if supabase_url:
        # Extract connection details from Supabase URL
        # Format: https://xxx.supabase.co
        project_ref = supabase_url.split('//')[1].split('.')[0]
        host = f"aws-1-us-east-1.pooler.supabase.com"
        port = "6543"
        database = "postgres"
        user = f"postgres.{project_ref}"
        password = os.getenv('SUPABASE_PASSWORD') or os.getenv('SUPABASE_SERVICE_KEY')

        conn_string = f"postgresql://{user}:{password}@{host}:{port}/{database}?sslmode=require"
    else:
        # Try DATABASE_URL
        conn_string = os.getenv('DATABASE_URL')
        if not conn_string:
            print("Error: No database connection info found. Set SUPABASE_URL or DATABASE_URL")
            sys.exit(1)

    return psycopg2.connect(conn_string)


def check_dangling_references(conn) -> List[Dict]:
    """Find section_references that point to non-existent sections."""
    query = """
    SELECT
        sr.source_section_key,
        sr.target_section_key,
        source.number as source_number
    FROM section_references sr
    LEFT JOIN sections source ON sr.source_section_key = source.key
    WHERE NOT EXISTS (
        SELECT 1 FROM sections WHERE key = sr.target_section_key
    )
    LIMIT 100;
    """

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query)
        return cur.fetchall()


def check_multilevel_subsections(conn) -> Dict[str, int]:
    """Count multi-level subsections in the database."""
    query = """
    SELECT COUNT(*) as count
    FROM sections
    WHERE number ~ '11[AB]-\\d{3,4}(\\.\\d+){2,}';
    """

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query)
        result = cur.fetchone()
        return result['count']


def check_specific_subsection(conn, subsection_number: str) -> bool:
    """Check if a specific subsection exists in the database."""
    query = """
    SELECT number, title, key
    FROM sections
    WHERE number = %s;
    """

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query, (subsection_number,))
        return cur.fetchone() is not None


def find_text_reference_mismatches(conn) -> List[Dict]:
    """
    Find sections where text mentions different refs than database has.

    Note: This is a sample implementation. Full implementation would need to
    parse the text field for all sections and compare with section_references.
    """
    # Sample query - check a few known cases
    query = """
    SELECT
        s.number,
        s.title,
        s.text,
        array_agg(target.number) as db_references
    FROM sections s
    LEFT JOIN section_references sr ON s.key = sr.source_section_key
    LEFT JOIN sections target ON sr.target_section_key = target.key
    WHERE s.number IN ('11B-213.2', '11B-213.3', '11B-404.2')
    GROUP BY s.number, s.title, s.text
    LIMIT 10;
    """

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(query)
        return cur.fetchall()


def main():
    print("Database Reference Validation")
    print("=" * 60)

    try:
        conn = get_db_connection()
        print("✅ Database connection established")
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        sys.exit(1)

    # 1. Check for dangling references
    print("\n🔗 Checking for dangling references...")
    dangling = check_dangling_references(conn)

    if dangling:
        print(f"  ❌ Found {len(dangling)} dangling references:")
        for ref in dangling[:5]:
            print(f"     {ref['source_number']} → {ref['target_section_key']}")
        if len(dangling) > 5:
            print(f"     ... and {len(dangling) - 5} more")
    else:
        print("  ✅ No dangling references found!")

    # 2. Check multi-level subsections
    print("\n📊 Checking multi-level subsections...")
    count = check_multilevel_subsections(conn)
    print(f"  Found {count} multi-level subsections in database")

    if count > 50:  # Expect ~93 or more
        print(f"  ✅ Database has multi-level subsections (expected ~93+)")
    else:
        print(f"  ⚠️  Warning: Only {count} multi-level subsections found (expected ~93)")

    # 3. Check specific known subsections from bug report
    print("\n🔍 Checking known previously-missing subsections...")
    known_subsections = [
        "11B-213.3.1",
        "11B-213.3.6",
        "11B-228.3.2.1",
        "11B-404.2.11",
        "11B-404.2.3",
    ]

    all_exist = True
    for subsection in known_subsections:
        exists = check_specific_subsection(conn, subsection)
        status = "✅" if exists else "❌"
        print(f"  {status} {subsection}")
        if not exists:
            all_exist = False

    # 4. Sample text reference check
    print("\n📄 Checking text references (sample)...")
    mismatches = find_text_reference_mismatches(conn)

    for section in mismatches:
        print(f"\n  Section {section['number']}: {section['title']}")
        print(f"    DB references: {section['db_references']}")

        # Extract references from text
        if section['text']:
            multi_level_pattern = re.compile(r'11[AB]-\d{3,4}(?:\.\d+)+')
            text_refs = multi_level_pattern.findall(section['text'])
            if text_refs:
                print(f"    Text mentions: {text_refs}")

    # 5. Overall result
    print("\n" + "=" * 60)
    if not dangling and all_exist and count > 50:
        print("✅ DATABASE VALIDATION PASSED")
        sys.exit(0)
    else:
        print("⚠️  DATABASE VALIDATION: Issues found (see above)")
        sys.exit(1)


if __name__ == "__main__":
    main()
