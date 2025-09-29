#!/usr/bin/env python3
import os
from neo4j import GraphDatabase

neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
username = os.getenv("NEO4J_USERNAME", "neo4j")
password = os.getenv("NEO4J_PASSWORD")

driver = GraphDatabase.driver(neo4j_uri, auth=(username, password))

with driver.session() as session:
    # Check if 11B-1002.3 has REFS relationships to 11B-304.2 and 11B-304.3
    query = """
    MATCH (s:Section {number: '11B-1002.3'})
    OPTIONAL MATCH (s)-[:REFS]->(ref:Section)
    RETURN s.key as section_key, s.title as section_title, 
           collect(ref.number) as referenced_sections
    """
    result = session.run(query)
    for record in result:
        print(f"Section: {record['section_key']}")
        print(f"Title: {record['section_title']}")
        print(f"Referenced sections via REFS: {record['referenced_sections']}")
    
    # Also check what relationships exist
    query2 = """
    MATCH (s:Section {number: '11B-1002.3'})-[r]->(other)
    RETURN type(r) as rel_type, other.number as other_number, labels(other) as other_labels
    LIMIT 10
    """
    print("\nAll relationships from 11B-1002.3:")
    result2 = session.run(query2)
    for record in result2:
        print(f"  {record['rel_type']} -> {record['other_number']} ({record['other_labels']})")

driver.close()
