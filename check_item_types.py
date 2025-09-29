#!/usr/bin/env python3
import os
from neo4j import GraphDatabase

neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
username = os.getenv("NEO4J_USERNAME", "neo4j")
password = os.getenv("NEO4J_PASSWORD")

driver = GraphDatabase.driver(neo4j_uri, auth=(username, password))

with driver.session() as session:
    # First, see what item_types exist
    print("=" * 60)
    print("ALL ITEM_TYPES IN DATABASE")
    print("=" * 60)
    
    type_query = """
    MATCH (s:Section)
    RETURN s.item_type as item_type, count(s) as count
    ORDER BY count DESC
    """
    
    types = session.run(type_query)
    for record in types:
        print(f"  {record['item_type']:<20} {record['count']:>6} sections")
    
    # Now look specifically at subsections
    print("\n" + "=" * 60)
    print("SECTIONS WITH item_type = 'subsection' (first 20)")
    print("=" * 60)
    
    subsection_query = """
    MATCH (s:Section {item_type: 'subsection'})
    OPTIONAL MATCH (s)-[:HAS_PARENT]->(parent:Section)
    OPTIONAL MATCH (c:Code)-[:HAS_SECTION]->(s)
    RETURN s.number as number, s.title as title, 
           parent.number as parent_number,
           c.id as directly_connected_to_code,
           s.paragraphs as paragraphs
    ORDER BY s.number
    LIMIT 20
    """
    
    subsections = session.run(subsection_query)
    for record in subsections:
        direct = "DIRECT" if record['directly_connected_to_code'] else "via parent"
        parent = record['parent_number'] or "NO PARENT"
        para_count = len(record['paragraphs']) if record['paragraphs'] else 0
        print(f"  {record['number']:<15} Parent: {parent:<15} Connection: {direct:<10} Paragraphs: {para_count}")
        if record['title']:
            print(f"    Title: {record['title']}")
    
    # Check relationship between item_type and section numbering
    print("\n" + "=" * 60)
    print("PATTERN CHECK: item_type vs section numbering")
    print("=" * 60)
    
    pattern_query = """
    MATCH (s:Section)
    WHERE s.item_type = 'subsection'
    RETURN 
        CASE 
            WHEN s.number CONTAINS '.' THEN 'Has dot (.)'
            ELSE 'No dot'
        END as pattern,
        count(s) as count
    """
    
    patterns = session.run(pattern_query)
    for record in patterns:
        print(f"  {record['pattern']:<20} {record['count']:>6} sections")
    
    # Check if subsections are what we think they are
    print("\n" + "=" * 60)
    print("COMPARISON: item_type='subsection' vs HAS_PARENT relationship")
    print("=" * 60)
    
    compare_query = """
    MATCH (s:Section)
    WHERE s.item_type = 'subsection'
    OPTIONAL MATCH (s)-[:HAS_PARENT]->(parent:Section)
    WITH 
        count(s) as total_subsections,
        sum(CASE WHEN parent IS NOT NULL THEN 1 ELSE 0 END) as with_parent,
        sum(CASE WHEN parent IS NULL THEN 1 ELSE 0 END) as without_parent
    RETURN total_subsections, with_parent, without_parent
    """
    
    comparison = session.run(compare_query).single()
    print(f"  Total with item_type='subsection': {comparison['total_subsections']}")
    print(f"  Have HAS_PARENT relationship: {comparison['with_parent']}")
    print(f"  NO HAS_PARENT relationship: {comparison['without_parent']}")

driver.close()
