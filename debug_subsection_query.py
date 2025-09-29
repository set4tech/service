#!/usr/bin/env python3
import os
from neo4j import GraphDatabase

neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
username = os.getenv("NEO4J_USERNAME", "neo4j")
password = os.getenv("NEO4J_PASSWORD")

driver = GraphDatabase.driver(neo4j_uri, auth=(username, password))

with driver.session() as session:
    # The query being used
    print("Testing subsection query:")
    query = """
    MATCH (s:Section)
    WHERE s.code = $code_id AND s.item_type = 'subsection'
    RETURN count(s) as count
    """
    result = session.run(query, code_id='ICC+CBC_Chapter11A_11B+2025+CA')
    print(f"Result: {result.single()['count']} sections found")
    
    # Let's see what fields subsections actually have
    print("\nChecking subsection fields:")
    check_query = """
    MATCH (s:Section {item_type: 'subsection'})
    RETURN s.code as code, s.code_type as code_type, s.number as number
    LIMIT 5
    """
    results = session.run(check_query)
    for r in results:
        print(f"  code: {r['code']}, code_type: {r['code_type']}, number: {r['number']}")
    
    # Check if we should use code_type instead
    print("\nChecking with code_type:")
    query2 = """
    MATCH (s:Section)
    WHERE s.code_type = 'ICC' AND s.item_type = 'subsection' 
      AND s.jurisdiction = 'CA'
    RETURN count(s) as count
    """
    result2 = session.run(query2)
    print(f"Result: {result2.single()['count']} sections found")

driver.close()
