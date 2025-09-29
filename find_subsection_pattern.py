#!/usr/bin/env python3
import os
from neo4j import GraphDatabase

neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
username = os.getenv("NEO4J_USERNAME", "neo4j")
password = os.getenv("NEO4J_PASSWORD")

driver = GraphDatabase.driver(neo4j_uri, auth=(username, password))

with driver.session() as session:
    # Find how subsections relate to CBC code
    print("Finding CBC subsections:")
    query = """
    MATCH (c:Code {id: 'ICC+CBC_Chapter11A_11B+2025+CA'})
    MATCH (s:Section {item_type: 'subsection'})
    WHERE s.number STARTS WITH '11B-'
    RETURN count(s) as count, collect(DISTINCT s.code)[..5] as sample_codes
    """
    result = session.run(query).single()
    print(f"Found {result['count']} subsections starting with '11B-'")
    print(f"Sample codes: {result['sample_codes']}")
    
    # Check how they relate through parents
    print("\nChecking parent relationships:")
    query2 = """
    MATCH (c:Code {id: 'ICC+CBC_Chapter11A_11B+2025+CA'})-[:HAS_SECTION]->(parent:Section)
    MATCH (parent)<-[:HAS_PARENT*]-(s:Section {item_type: 'subsection'})
    RETURN count(DISTINCT s) as count
    """
    result2 = session.run(query2).single()
    print(f"Subsections connected via parent chain: {result2['count']}")
    
    # Better approach - use the source_id field
    print("\nChecking source_id field:")
    query3 = """
    MATCH (s:Section {item_type: 'subsection'})
    WHERE s.source_id CONTAINS 'CBC'
    RETURN count(s) as count, s.source_id as source_id
    LIMIT 5
    """
    results3 = session.run(query3)
    for r in results3:
        print(f"  count: {r['count']}, source_id: {r['source_id']}")

driver.close()
