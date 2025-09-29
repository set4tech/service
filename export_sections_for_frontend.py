#!/usr/bin/env python3
"""
Export code sections for frontend consumption.
This script prepares section data for the compliance checking UI.
"""

import json
import os
import sys
from typing import Dict, List, Any, Optional
from code_section_assembler import CodeSectionAssembler, CodeSection
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


def get_referenced_sections(section_key: str, assembler: CodeSectionAssembler) -> List[Dict[str, Any]]:
    """Get sections referenced by a given section via REFS relationship."""
    referenced_sections = []

    with assembler.driver.session() as session:
        query = """
        MATCH (s:Section {key: $section_key})-[:REFS]->(ref:Section)
        RETURN ref.key as key, ref.number as number, ref.title as title,
               ref.paragraphs as paragraphs, ref.text as text
        ORDER BY ref.number
        """
        result = session.run(query, section_key=section_key)

        for record in result:
            referenced_sections.append({
                'number': record['number'],
                'title': record['title'],
                'requirements': record['paragraphs'] or [],
                'key': record['key']
            })

    return referenced_sections


def format_section_for_frontend(section: CodeSection, assembler: CodeSectionAssembler) -> Dict[str, Any]:
    """Format a section for frontend consumption."""
    # Get referenced sections from database
    referenced_sections = get_referenced_sections(section.key, assembler)

    return {
        'key': section.key,
        'number': section.number,
        'title': section.title,
        'type': section.item_type,
        'requirements': section.paragraphs or [],
        'text': section.text,
        'references': referenced_sections,
        'source_id': section.source_id,
        'hasContent': bool(section.paragraphs and len(section.paragraphs) > 0)
    }


def export_sections_for_code(code_id: str, output_file: Optional[str] = None) -> List[Dict[str, Any]]:
    """Export all sections for a specific code."""

    # Initialize assembler
    neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    username = os.getenv("NEO4J_USERNAME", "neo4j")
    password = os.getenv("NEO4J_PASSWORD")

    if not password:
        raise ValueError("Please set NEO4J_PASSWORD environment variable")

    assembler = CodeSectionAssembler(neo4j_uri, username, password)

    try:
        # Get code info
        code_types = assembler.get_all_code_types()
        code_info = None
        for code in code_types:
            if code['code_id'] == code_id:
                code_info = code
                break

        if not code_info:
            raise ValueError(f"Code {code_id} not found")

        logger.info(f"Processing code: {code_id}")
        logger.info(f"Title: {code_info['title']}")

        # Assemble sections using subsections as base
        assembly = assembler.assemble_code_sections(
            code_info,
            use_subsections_as_base=True
        )

        logger.info(f"Assembled {assembly.total_sections} sections")
        logger.info(f"  - Base subsections: {assembly.total_sections - assembly.referenced_sections}")
        logger.info(f"  - Referenced sections: {assembly.referenced_sections}")

        # Format sections for frontend - only include base subsections
        frontend_sections = []
        for section in assembly.sections:
            # Only include subsections (not referenced sections)
            if section.item_type == 'subsection':
                formatted = format_section_for_frontend(section, assembler)
                frontend_sections.append(formatted)

        # Sort by section number
        frontend_sections.sort(key=lambda s: s['number'])

        logger.info(f"Formatted {len(frontend_sections)} subsections for frontend")

        # Output to file if specified
        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump({
                    'code_id': code_id,
                    'code_title': code_info['title'],
                    'total_sections': len(frontend_sections),
                    'sections': frontend_sections
                }, f, indent=2)
            logger.info(f"Exported to {output_file}")

        return frontend_sections

    finally:
        assembler.close()


def main():
    """Main entry point for command-line usage."""
    import argparse

    parser = argparse.ArgumentParser(description='Export code sections for frontend')
    parser.add_argument('--code-id', type=str,
                        default='ICC+CBC_Chapter11A_11B+2025+CA',
                        help='Code ID to export')
    parser.add_argument('--output', type=str,
                        default='sections_export.json',
                        help='Output JSON file')
    parser.add_argument('--list-codes', action='store_true',
                        help='List available codes and exit')

    args = parser.parse_args()

    if args.list_codes:
        # List available codes
        neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        username = os.getenv("NEO4J_USERNAME", "neo4j")
        password = os.getenv("NEO4J_PASSWORD")

        assembler = CodeSectionAssembler(neo4j_uri, username, password)
        codes = assembler.get_all_code_types()

        print("\nAvailable codes:")
        print("-" * 60)
        for code in codes:
            print(f"{code['code_id']:<40} {code['title']}")

        assembler.close()
        return

    # Export sections
    sections = export_sections_for_code(args.code_id, args.output)

    # Print summary
    print(f"\n✅ Export complete!")
    print(f"   Code: {args.code_id}")
    print(f"   Sections: {len(sections)}")
    print(f"   Output: {args.output}")


if __name__ == "__main__":
    main()