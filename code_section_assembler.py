#!/usr/bin/env python3
"""
Code Section Assembler for Neo4j Building Codes Database

Iterates through each code type in the Neo4j database, recursively collects
all referenced code sections, and yields batched results for processing.
"""

from typing import Generator, Dict, List, Set, Any, Optional
from neo4j import GraphDatabase
import logging
from dataclasses import dataclass
from collections import defaultdict
import json
from datetime import datetime


@dataclass
class CodeSection:
    """Represents a code section with its full text and metadata."""
    key: str
    code: str
    code_type: str
    edition: str
    jurisdiction: str
    source_id: str
    number: str
    title: str
    text: str
    paragraphs: List[str]
    item_type: str
    source_url: Optional[str] = None
    hash: Optional[str] = None


@dataclass
class CodeAssembly:
    """Represents a complete assembly of code sections for a code type."""
    code_id: str
    provider: str
    version: str
    jurisdiction: Optional[str]
    source_id: str
    title: str
    sections: List[CodeSection]
    total_sections: int
    referenced_sections: int


class CodeSectionAssembler:
    """Assembles code sections recursively from Neo4j database."""
    
    def __init__(self, neo4j_uri: str, username: str, password: str):
        """Initialize the assembler with Neo4j connection details."""
        self.driver = GraphDatabase.driver(neo4j_uri, auth=(username, password))
        self.logger = logging.getLogger(__name__)
    
    def close(self):
        """Close the Neo4j driver connection."""
        self.driver.close()

    def debug_code_retrieval(self, code_data: Dict[str, Any]) -> str:
        """Debug output showing base sections and recursive references.

        Returns the debug output as a string for saving to file.
        """
        code_id = code_data['code_id']
        output_lines = []

        def add_line(line=""):
            output_lines.append(line)
            print(line)

        add_line(f"\n{'='*80}")
        add_line(f"📚 CODE: {code_id}")
        add_line(f"   Provider: {code_data['provider']}")
        add_line(f"   Version: {code_data['version']}")
        add_line(f"   Jurisdiction: {code_data['jurisdiction']}")
        add_line(f"   Title: {code_data['title']}")
        add_line("-" * 80)

        with self.driver.session() as session:
            # Get DIRECT sections (base sections)
            add_line("\n🔷 BASE SECTIONS (directly attached to code):")
            direct_query = """
            MATCH (c:Code {id: $code_id})-[:HAS_SECTION]->(s:Section)
            RETURN s.key as key, s.number as number, s.title as title,
                   s.text as text, s.paragraphs as paragraphs, s.item_type as item_type
            ORDER BY s.number
            LIMIT 3
            """
            result = session.run(direct_query, code_id=code_id)
            base_sections = [dict(record) for record in result]

            # Count total base sections
            count_query = """
            MATCH (c:Code {id: $code_id})-[:HAS_SECTION]->(s:Section)
            RETURN count(s) as total
            """
            total_result = session.run(count_query, code_id=code_id).single()
            total_base = total_result['total'] if total_result else 0

            add_line(f"Found {total_base} total base sections (showing first {len(base_sections)})")

            for i, section in enumerate(base_sections, 1):
                add_line(f"\n  [{i}] BASE: {section['number'] or 'unnumbered'}")
                add_line(f"      Title: {section['title'] or '(no title)'}")
                add_line(f"      Type: {section['item_type']}")

                # Check content
                has_text = bool(section['text'] and section['text'].strip())
                has_paragraphs = bool(section['paragraphs'] and len(section['paragraphs']) > 0)

                if has_paragraphs:
                    add_line(f"      ✓ Content: {len(section['paragraphs'])} paragraphs")
                    # Show ALL paragraph content - NO TRUNCATION
                    for i, para in enumerate(section['paragraphs'], 1):
                        add_line(f"      📝 Paragraph {i}: {para}")
                elif has_text:
                    add_line(f"      ✓ Content: Text field ({len(section['text'])} chars)")
                    preview = section['text'][:100] + "..." if len(section['text']) > 100 else section['text']
                    add_line(f"      Preview: {preview}")
                else:
                    add_line(f"      ⚠️  No content")

                section_key = section['key']

                # Get actual SUBSECTIONS
                subsection_query = """
                MATCH (parent:Section {key: $section_key})<-[:HAS_PARENT*]-(child:Section)
                RETURN child.key as key, child.number as number, child.title as title,
                       child.text as text, child.paragraphs as paragraphs
                ORDER BY child.number
                """
                sub_result = session.run(subsection_query, section_key=section_key)
                subsections = [dict(record) for record in sub_result]

                if subsections:
                    add_line(f"      📁 SUBSECTIONS ({len(subsections)} via HAS_PARENT):")
                    for sub in subsections:  # Show ALL subsections
                        add_line(f"         → {sub['number']}: {sub['title'] or '(no title)'}")
                        if sub['paragraphs']:
                            for para in sub['paragraphs']:  # Show ALL paragraphs
                                add_line(f"            📝 {para}")
                        else:
                            add_line(f"            ⚠️ [no content]")

                        # CHECK FOR REFS FROM THIS SUBSECTION TOO!
                        sub_ref_query = """
                        MATCH (s:Section {key: $section_key})-[:REFS]->(ref:Section)
                        RETURN ref.number as number, ref.title as title
                        ORDER BY ref.number
                        """
                        sub_refs = session.run(sub_ref_query, section_key=sub['key'])
                        sub_ref_list = [dict(r) for r in sub_refs]
                        if sub_ref_list:
                            add_line(f"            🔗 REFERENCES: {', '.join([r['number'] for r in sub_ref_list])}")

                # Get ALL REFERENCES from base section AND its subsections
                all_section_keys = [section_key] + [s['key'] for s in subsections]
                all_refs = {}

                for key in all_section_keys:
                    ref_query = """
                    MATCH (s:Section {key: $section_key})-[:REFS*]->(ref:Section)
                    RETURN DISTINCT ref.key as key, ref.number as number, ref.title as title,
                           ref.code as ref_code, ref.paragraphs as paragraphs
                    """
                    ref_result = session.run(ref_query, section_key=key)
                    for ref in ref_result:
                        ref_dict = dict(ref)
                        all_refs[ref_dict['key']] = ref_dict  # Use key to dedupe

                if all_refs:
                    add_line(f"      🔗 ALL REFERENCED SECTIONS ({len(all_refs)} total via REFS from base + subsections):")
                    for ref in sorted(all_refs.values(), key=lambda x: x['number'] or ''):
                        code_info = f" [from {ref.get('ref_code', 'same')}]" if ref.get('ref_code') != code_data['code_id'] else ""
                        add_line(f"         → {ref['number']}: {ref['title'] or '(no title)'}{code_info}")
                        if ref['paragraphs']:
                            for para in ref['paragraphs']:  # Show ALL paragraphs
                                add_line(f"            📝 {para}")
                        else:
                            add_line(f"            ⚠️ [no content]")

            # Overall statistics
            add_line(f"\n{'='*80}")
            add_line("📊 DATA QUALITY STATISTICS:")

            # Get comprehensive stats
            stats_query = """
            MATCH (c:Code {id: $code_id})-[:HAS_SECTION]->(s:Section)
            WITH s
            OPTIONAL MATCH (s)<-[:HAS_PARENT*]-(child:Section)
            WITH s, collect(DISTINCT child) as children
            OPTIONAL MATCH (s)-[:REFS*]->(ref:Section)
            WITH s, children, collect(DISTINCT ref) as refs
            UNWIND ([s] + children + refs) as all_sections
            WITH DISTINCT all_sections as section
            RETURN
                count(section) as total_sections,
                sum(CASE WHEN section.paragraphs IS NOT NULL AND size(section.paragraphs) > 0 THEN 1 ELSE 0 END) as has_paragraphs,
                sum(CASE WHEN section.text IS NOT NULL AND section.text <> '' THEN 1 ELSE 0 END) as has_text,
                sum(CASE WHEN (section.paragraphs IS NULL OR size(section.paragraphs) = 0)
                         AND (section.text IS NULL OR section.text = '') THEN 1 ELSE 0 END) as no_content
            """

            stats = session.run(stats_query, code_id=code_id).single()

            if stats:
                total = stats['total_sections']
                add_line(f"\n  Total sections (base + subsections + references): {total}")
                add_line(f"  ✓ Sections with paragraphs: {stats['has_paragraphs']} ({stats['has_paragraphs']*100//total if total else 0}%)")
                add_line(f"  ✓ Sections with text field: {stats['has_text']} ({stats['has_text']*100//total if total else 0}%)")
                add_line(f"  ⚠️  Sections with no content: {stats['no_content']} ({stats['no_content']*100//total if total else 0}%)")

            add_line(f"\n{'='*80}\n")

        return "\n".join(output_lines)
    
    def get_all_code_types(self) -> List[Dict[str, Any]]:
        """Get all unique code types from the database."""
        with self.driver.session() as session:
            query = """
            MATCH (c:Code)
            RETURN c.id as code_id, c.provider as provider, c.version as version, 
                   c.jurisdiction as jurisdiction, c.source_id as source_id, 
                   c.title as title
            ORDER BY c.provider, c.jurisdiction, c.version
            """
            result = session.run(query)
            return [dict(record) for record in result]
    
    def get_sections_for_code(self, code_id: str) -> List[Dict[str, Any]]:
        """Get all direct sections for a given code."""
        with self.driver.session() as session:
            query = """
            MATCH (c:Code {id: $code_id})-[:HAS_SECTION]->(s:Section)
            RETURN s.key as key, s.code as code, s.code_type as code_type,
                   s.edition as edition, s.jurisdiction as jurisdiction,
                   s.source_id as source_id, s.number as number, s.title as title,
                   s.text as text, s.paragraphs as paragraphs, s.item_type as item_type,
                   s.source_url as source_url, s.hash as hash
            """
            result = session.run(query, code_id=code_id)
            return [dict(record) for record in result]
    

    
    def assemble_code_sections(self, code_info: Dict[str, Any], use_subsections_as_base: bool = True) -> CodeAssembly:
        """Assemble all sections for a given code type using efficient graph traversal.

        Args:
            code_info: Dictionary with code metadata
            use_subsections_as_base: If True, start with subsections instead of top-level sections
        """
        code_id = code_info['code_id']
        self.logger.info(f"Assembling sections for code: {code_id}")

        with self.driver.session() as session:
            if use_subsections_as_base:
                # Start with SUBSECTIONS (item_type = 'subsection') as base
                # We need to match via parent relationships since subsections aren't directly connected to Code
                direct_query = """
                MATCH (c:Code {id: $code_id})-[:HAS_SECTION]->(parent:Section)
                MATCH (parent)<-[:HAS_PARENT*]-(s:Section {item_type: 'subsection'})
                RETURN DISTINCT s.key as key, s.code as code, s.code_type as code_type,
                       s.edition as edition, s.jurisdiction as jurisdiction,
                       s.source_id as source_id, s.number as number, s.title as title,
                       s.text as text, s.paragraphs as paragraphs, s.item_type as item_type,
                       s.source_url as source_url, s.hash as hash
                ORDER BY s.number
                """
                self.logger.info(f"Starting with subsections (item_type='subsection') as base sections")
            else:
                # Original behavior - get sections directly attached to Code
                direct_query = """
                MATCH (c:Code {id: $code_id})-[:HAS_SECTION]->(s:Section)
                RETURN s.key as key, s.code as code, s.code_type as code_type,
                       s.edition as edition, s.jurisdiction as jurisdiction,
                       s.source_id as source_id, s.number as number, s.title as title,
                       s.text as text, s.paragraphs as paragraphs, s.item_type as item_type,
                       s.source_url as source_url, s.hash as hash
                ORDER BY s.number
                """
                self.logger.info(f"Starting with top-level sections as base sections")

            result = session.run(direct_query, code_id=code_id)
            all_sections_data = [dict(record) for record in result]
            
            # Get all child sections for each section (only if starting with top-level sections)
            # When starting with subsections, they typically don't have children
            if not use_subsections_as_base:
                section_keys = [s['key'] for s in all_sections_data]
                for section_key in section_keys:
                    subsection_query = """
                    MATCH (parent:Section {key: $section_key})<-[:HAS_PARENT*]-(child:Section)
                    RETURN child.key as key, child.code as code, child.code_type as code_type,
                           child.edition as edition, child.jurisdiction as jurisdiction,
                           child.source_id as source_id, child.number as number, child.title as title,
                           child.text as text, child.paragraphs as paragraphs, child.item_type as item_type,
                           child.source_url as source_url, child.hash as hash
                    """
                    result = session.run(subsection_query, section_key=section_key)
                    subsections = [dict(record) for record in result]

                    # Add unique subsections
                    existing_keys = {s['key'] for s in all_sections_data}
                    for subsection in subsections:
                        if subsection['key'] not in existing_keys:
                            all_sections_data.append(subsection)
                            existing_keys.add(subsection['key'])
            
            # Get all referenced sections
            all_keys = [s['key'] for s in all_sections_data]
            for section_key in all_keys:
                ref_query = """
                MATCH (s:Section {key: $section_key})-[:REFS*]->(ref:Section)
                RETURN DISTINCT ref.key as key, ref.code as code, ref.code_type as code_type,
                       ref.edition as edition, ref.jurisdiction as jurisdiction,
                       ref.source_id as source_id, ref.number as number, ref.title as title,
                       ref.text as text, ref.paragraphs as paragraphs, ref.item_type as item_type,
                       ref.source_url as source_url, ref.hash as hash
                """
                result = session.run(ref_query, section_key=section_key)
                references = [dict(record) for record in result]

                # Add unique references
                existing_keys = {s['key'] for s in all_sections_data}
                for reference in references:
                    if reference['key'] not in existing_keys:
                        all_sections_data.append(reference)
                        existing_keys.add(reference['key'])
        
        # Get count of direct sections for statistics
        direct_sections = self.get_sections_for_code(code_id)
        direct_count = len(direct_sections)
        
        # Convert to CodeSection objects
        code_sections = []
        for section_data in all_sections_data:
            code_section = CodeSection(
                key=section_data['key'],
                code=section_data['code'],
                code_type=section_data['code_type'],
                edition=section_data['edition'],
                jurisdiction=section_data['jurisdiction'],
                source_id=section_data['source_id'],
                number=section_data['number'],
                title=section_data['title'],
                text=section_data['text'] or '',
                paragraphs=section_data['paragraphs'] or [],
                item_type=section_data['item_type'],
                source_url=section_data['source_url'],
                hash=section_data['hash']
            )
            code_sections.append(code_section)
        
        self.logger.info(f"Assembled {len(code_sections)} total sections "
                        f"({len(code_sections) - direct_count} referenced/subsections)")
        
        return CodeAssembly(
            code_id=code_id,
            provider=code_info['provider'],
            version=code_info['version'],
            jurisdiction=code_info['jurisdiction'],
            source_id=code_info['source_id'],
            title=code_info['title'],
            sections=code_sections,
            total_sections=len(code_sections),
            referenced_sections=len(code_sections) - direct_count
        )
    
    def assemble_all_codes(self, batch_size: int = 100, limit: Optional[int] = None, use_subsections_as_base: bool = True) -> Generator[List[CodeAssembly], None, None]:
        """Generate batches of assembled code sections for all codes in the database.

        Args:
            batch_size: Number of code assemblies to yield in each batch
            limit: Optional limit on total number of codes to process
            use_subsections_as_base: If True, use subsections as base sections

        Yields:
            List[CodeAssembly]: Batches of assembled code sections
        """
        code_types = self.get_all_code_types()
        self.logger.info(f"Found {len(code_types)} code types to process")

        if limit:
            code_types = code_types[:limit]
            self.logger.info(f"Limited to processing {limit} codes")

        batch = []

        for i, code_info in enumerate(code_types, 1):
            try:
                self.logger.info(f"Processing code {i}/{len(code_types)}: {code_info['code_id']}")
                assembly = self.assemble_code_sections(code_info, use_subsections_as_base=use_subsections_as_base)
                batch.append(assembly)

                # Yield batch when it reaches the specified size
                if len(batch) >= batch_size:
                    self.logger.info(f"Yielding batch of {len(batch)} assemblies")
                    yield batch
                    batch = []

            except Exception as e:
                self.logger.error(f"Error processing code {code_info['code_id']}: {str(e)}")
                continue

        # Yield any remaining assemblies in the final batch
        if batch:
            self.logger.info(f"Yielding final batch of {len(batch)} assemblies")
            yield batch



def main():
    """Example usage of the CodeSectionAssembler."""
    import os
    import argparse

    # Set up command line arguments
    parser = argparse.ArgumentParser(description='Assemble code sections from Neo4j database')
    parser.add_argument('--batch-size', type=int, default=100,
                        help='Number of code assemblies per batch (default: 100)')
    parser.add_argument('--limit', type=int, default=None,
                        help='Limit number of codes to process (for testing)')
    parser.add_argument('--debug', action='store_true',
                        help='Show detailed debug output for data quality inspection')
    parser.add_argument('--use-subsections', action='store_true', default=True,
                        help='Use subsections as base sections (default: True)')
    parser.add_argument('--use-top-level', dest='use_subsections', action='store_false',
                        help='Use top-level sections as base sections')

    args = parser.parse_args()
    batch_size = args.batch_size
    limit = args.limit
    debug = args.debug
    use_subsections = args.use_subsections

    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

    # Get Neo4j credentials from environment variables
    neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    username = os.getenv("NEO4J_USERNAME", "neo4j")
    password = os.getenv("NEO4J_PASSWORD")

    if not password:
        raise ValueError("Please set NEO4J_PASSWORD environment variable")

    assembler = CodeSectionAssembler(neo4j_uri, username, password)

    try:
        if debug:
            # Debug mode - show detailed information
            code_types = assembler.get_all_code_types()
            if limit:
                code_types = code_types[:limit]

            print(f"\n🔍 DEBUG MODE - Analyzing {len(code_types)} code(s)")

            # Create output filename with timestamp
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = f"code_sections_debug_{timestamp}.txt"

            all_debug_output = []
            all_debug_output.append(f"Code Sections Debug Report - {timestamp}")
            all_debug_output.append(f"Analyzing {len(code_types)} code(s)\n")

            for code_info in code_types:
                # Show debug information and capture output
                debug_output = assembler.debug_code_retrieval(code_info)
                all_debug_output.append(debug_output)

                # Also show what the actual assembly would look like
                print(f"\n⚙️  Assembling all sections for {code_info['code_id']}...")
                print(f"   Using {'subsections' if use_subsections else 'top-level sections'} as base")
                assembly = assembler.assemble_code_sections(code_info, use_subsections_as_base=use_subsections)

                assembly_summary = f"\n⚙️  Assembly for {code_info['code_id']}:"
                assembly_summary += f"\n   ✓ Assembly complete: {assembly.total_sections} total sections"
                assembly_summary += f"\n     - Direct sections: {assembly.total_sections - assembly.referenced_sections}"
                assembly_summary += f"\n     - Referenced/subsections: {assembly.referenced_sections}"

                print(assembly_summary)
                all_debug_output.append(assembly_summary)

            # Save to file
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write("\n".join(all_debug_output))

            print(f"\n📄 Debug output saved to: {output_file}")

        else:
            # Normal batch processing
            for batch_num, batch in enumerate(assembler.assemble_all_codes(batch_size=batch_size, limit=limit, use_subsections_as_base=use_subsections), 1):
                print(f"\nProcessing batch {batch_num} with {len(batch)} code assemblies:")

                for assembly in batch:
                    print(f"  - {assembly.code_id}: {assembly.total_sections} sections "
                          f"({assembly.referenced_sections} referenced)")

                    # Here you can process each assembly as needed
                    # For example, run your code applicability analyzer against each section:
                    # for section in assembly.sections:
                    #     process_section(section)

                print(f"Batch {batch_num} processing complete.")

    finally:
        assembler.close()


if __name__ == "__main__":
    main()
