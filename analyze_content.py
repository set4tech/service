#!/usr/bin/env python3
import os
from neo4j import GraphDatabase

neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
username = os.getenv("NEO4J_USERNAME", "neo4j")
password = os.getenv("NEO4J_PASSWORD")

driver = GraphDatabase.driver(neo4j_uri, auth=(username, password))

with driver.session() as session:
    # Query to analyze content in sections
    query = """
    MATCH (s:Section)
    RETURN 
        count(s) as total_sections,
        sum(CASE WHEN s.paragraphs IS NOT NULL AND size(s.paragraphs) > 0 THEN 1 ELSE 0 END) as has_paragraphs,
        sum(CASE WHEN s.text IS NOT NULL AND s.text <> '' THEN 1 ELSE 0 END) as has_text,
        sum(CASE WHEN s.paragraphs IS NOT NULL AND size(s.paragraphs) > 0 
                 AND s.text IS NOT NULL AND s.text <> '' THEN 1 ELSE 0 END) as has_both,
        sum(CASE WHEN (s.paragraphs IS NULL OR size(s.paragraphs) = 0)
                 AND (s.text IS NULL OR s.text = '') THEN 1 ELSE 0 END) as has_neither
    """
    
    result = session.run(query).single()
    
    print("=" * 60)
    print("SECTION CONTENT ANALYSIS")
    print("=" * 60)
    print(f"Total sections: {result['total_sections']:,}")
    print(f"Has paragraphs: {result['has_paragraphs']:,} ({result['has_paragraphs']*100//result['total_sections']}%)")
    print(f"Has text field: {result['has_text']:,} ({result['has_text']*100//result['total_sections']}%)")
    print(f"Has BOTH: {result['has_both']:,} ({result['has_both']*100//result['total_sections']}%)")
    print(f"Has NEITHER: {result['has_neither']:,} ({result['has_neither']*100//result['total_sections']}%)")
    
    # Sample sections with no content
    print("\n" + "=" * 60)
    print("SAMPLE SECTIONS WITH NO CONTENT (first 10):")
    print("=" * 60)
    
    no_content_query = """
    MATCH (s:Section)
    WHERE (s.paragraphs IS NULL OR size(s.paragraphs) = 0)
      AND (s.text IS NULL OR s.text = '')
    RETURN s.number as number, s.title as title, s.key as key, s.code as code
    LIMIT 10
    """
    
    no_content = session.run(no_content_query)
    for record in no_content:
        print(f"  {record['number']}: {record['title']}")
        print(f"    Code: {record['code']}")
        print(f"    Key: {record['key']}")
    
    # Sample sections with paragraphs
    print("\n" + "=" * 60)
    print("SAMPLE SECTIONS WITH PARAGRAPHS (first 5):")
    print("=" * 60)
    
    with_para_query = """
    MATCH (s:Section)
    WHERE s.paragraphs IS NOT NULL AND size(s.paragraphs) > 0
    RETURN s.number as number, s.title as title, 
           s.paragraphs as paragraphs, s.text as text
    LIMIT 5
    """
    
    with_para = session.run(with_para_query)
    for i, record in enumerate(with_para, 1):
        print(f"\n[{i}] {record['number']}: {record['title']}")
        print(f"  Text field: {record['text'][:100] if record['text'] else 'None'}...")
        print(f"  Paragraphs ({len(record['paragraphs'])}):")
        for j, para in enumerate(record['paragraphs'][:2], 1):
            print(f"    Para {j}: {para[:150]}...")
        if len(record['paragraphs']) > 2:
            print(f"    ... and {len(record['paragraphs']) - 2} more paragraphs")
    
    # Distribution by code
    print("\n" + "=" * 60)
    print("CONTENT DISTRIBUTION BY CODE:")
    print("=" * 60)
    
    by_code_query = """
    MATCH (s:Section)
    WITH s.code as code,
         count(s) as total,
         sum(CASE WHEN s.paragraphs IS NOT NULL AND size(s.paragraphs) > 0 THEN 1 ELSE 0 END) as with_para,
         sum(CASE WHEN (s.paragraphs IS NULL OR size(s.paragraphs) = 0)
                  AND (s.text IS NULL OR s.text = '') THEN 1 ELSE 0 END) as empty
    ORDER BY total DESC
    RETURN code, total, with_para, empty
    LIMIT 10
    """
    
    by_code = session.run(by_code_query)
    print(f"{'Code':<30} {'Total':<10} {'w/Para':<10} {'Empty':<10} {'%Empty':<10}")
    print("-" * 70)
    for record in by_code:
        code = record['code'] or 'None'
        if len(code) > 28:
            code = code[:28] + '..'
        pct_empty = record['empty'] * 100 // record['total'] if record['total'] > 0 else 0
        print(f"{code:<30} {record['total']:<10} {record['with_para']:<10} {record['empty']:<10} {pct_empty:<10}%")

driver.close()
