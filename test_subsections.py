#!/usr/bin/env python3
import os
from code_section_assembler import CodeSectionAssembler

neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
username = os.getenv("NEO4J_USERNAME", "neo4j")
password = os.getenv("NEO4J_PASSWORD")

assembler = CodeSectionAssembler(neo4j_uri, username, password)

# Get actual code info from database
codes = assembler.get_all_code_types()
# Find CBC code
code_info = None
for c in codes:
    if 'CBC' in c['code_id']:
        code_info = c
        break

if not code_info:
    print("CBC code not found")
    exit(1)

print(f"Using code: {code_info['code_id']}")

print("\nTesting with SUBSECTIONS as base:")
print("=" * 60)
assembly = assembler.assemble_code_sections(code_info, use_subsections_as_base=True)
print(f"Starting with subsections: {assembly.total_sections} total sections")
print(f"  - Base sections (subsections): {assembly.total_sections - assembly.referenced_sections}")
print(f"  - Referenced sections: {assembly.referenced_sections}")

print("\n\nTesting with TOP-LEVEL sections as base:")
print("=" * 60)
assembly2 = assembler.assemble_code_sections(code_info, use_subsections_as_base=False)
print(f"Starting with top-level: {assembly2.total_sections} total sections")
print(f"  - Base sections (top-level + their children): {assembly2.total_sections - assembly2.referenced_sections}")
print(f"  - Referenced sections: {assembly2.referenced_sections}")

assembler.close()
