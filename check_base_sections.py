#!/usr/bin/env python3
import os
from neo4j import GraphDatabase

neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
username = os.getenv("NEO4J_USERNAME", "neo4j")
password = os.getenv("NEO4J_PASSWORD")

driver = GraphDatabase.driver(neo4j_uri, auth=(username, password))

with driver.session() as session:
    # Check what's directly connected to a Code node
    print("=" * 60)
    print("CHECKING BASE SECTIONS (directly attached to Code)")
    print("=" * 60)
    
    # Get a sample code
    code_query = """
    MATCH (c:Code)
    WHERE c.id = 'ICC+CBC_Chapter11A_11B+2025+CA'
    RETURN c.id as code_id, c.title as title
    """
    code_result = session.run(code_query).single()
    print(f"Code: {code_result['code_id']}")
    print(f"Title: {code_result['title']}\n")
    
    # Check direct connections
    direct_query = """
    MATCH (c:Code {id: 'ICC+CBC_Chapter11A_11B+2025+CA'})-[:HAS_SECTION]->(s:Section)
    RETURN s.number as number, s.title as title
    ORDER BY s.number
    LIMIT 10
    """
    
    print("Sections directly connected via HAS_SECTION:")
    print("-" * 40)
    direct_sections = session.run(direct_query)
    for record in direct_sections:
        print(f"  {record['number']}: {record['title']}")
    
    # Check if any of these have parents
    parent_check_query = """
    MATCH (c:Code {id: 'ICC+CBC_Chapter11A_11B+2025+CA'})-[:HAS_SECTION]->(s:Section)
    OPTIONAL MATCH (s)-[:HAS_PARENT]->(parent:Section)
    RETURN s.number as number, parent.number as parent_number
    ORDER BY s.number
    LIMIT 10
    """
    
    print("\n" + "=" * 60)
    print("CHECKING IF BASE SECTIONS HAVE PARENTS")
    print("=" * 60)
    
    parent_check = session.run(parent_check_query)
    for record in parent_check:
        parent_info = f"Parent: {record['parent_number']}" if record['parent_number'] else "No parent (TOP LEVEL)"
        print(f"  {record['number']} -> {parent_info}")
    
    # Check subsections that are NOT directly connected to Code
    subsection_query = """
    MATCH (s:Section)
    WHERE s.number STARTS WITH '11B-1002.'
    OPTIONAL MATCH (c:Code)-[:HAS_SECTION]->(s)
    OPTIONAL MATCH (s)-[:HAS_PARENT]->(parent:Section)
    RETURN s.number as number, s.title as title, 
           c.id as directly_connected_to_code,
           parent.number as parent_number
    ORDER BY s.number
    """
    
    print("\n" + "=" * 60)
    print("CHECKING SUBSECTIONS (e.g., 11B-1002.x)")
    print("=" * 60)
    
    subsections = session.run(subsection_query)
    for record in subsections:
        connection = "YES" if record['directly_connected_to_code'] else "NO"
        parent = record['parent_number'] or "None"
        print(f"  {record['number']}: Direct to Code? {connection}, Parent: {parent}")
    
    # Count total direct vs indirect sections
    count_query = """
    MATCH (c:Code {id: 'ICC+CBC_Chapter11A_11B+2025+CA'})
    OPTIONAL MATCH (c)-[:HAS_SECTION]->(direct:Section)
    WITH c, count(DISTINCT direct) as direct_count
    OPTIONAL MATCH (c)-[:HAS_SECTION]->(s:Section)<-[:HAS_PARENT*]-(child:Section)
    WITH direct_count, count(DISTINCT child) as child_count
    RETURN direct_count, child_count, direct_count + child_count as total
    """
    
    print("\n" + "=" * 60)
    print("SECTION COUNTS")
    print("=" * 60)
    
    counts = session.run(count_query).single()
    print(f"Direct sections (base): {counts['direct_count']}")
    print(f"Child sections (subsections): {counts['child_count']}")
    print(f"Total: {counts['total']}")

driver.close()
