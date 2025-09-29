#!/usr/bin/env python3
import os
from code_section_assembler import CodeSectionAssembler

neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
username = os.getenv("NEO4J_USERNAME", "neo4j")
password = os.getenv("NEO4J_PASSWORD")

assembler = CodeSectionAssembler(neo4j_uri, username, password)

# Get CBC code specifically
code_info = {
    'code_id': 'ICC+CBC_Chapter11A_11B+2025+CA',
    'provider': 'ICC',
    'version': '2025',
    'jurisdiction': 'CA',
    'title': 'California Building Code - Chapters 11A & 11B Accessibility'
}

# Debug just this one code
output = assembler.debug_code_retrieval(code_info)

# Save to file
with open('debug_full_content.txt', 'w') as f:
    f.write(output)

print("Debug output saved to debug_full_content.txt")
assembler.close()
