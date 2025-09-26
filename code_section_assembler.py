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
    

    
    def assemble_code_sections(self, code_info: Dict[str, Any], max_sections: Optional[int] = None) -> CodeAssembly:
        """Assemble all sections for a given code type using efficient graph traversal.

        Args:
            code_info: Dictionary with code metadata
            max_sections: If provided, stop after collecting this many sections (for debugging)
        """
        code_id = code_info['code_id']
        self.logger.info(f"Assembling sections for code: {code_id}")

        if max_sections:
            self.logger.info(f"Debug mode: Limiting to {max_sections} total sections")

        with self.driver.session() as session:
            # Get all direct sections first
            direct_query = """
            MATCH (c:Code {id: $code_id})-[:HAS_SECTION]->(s:Section)
            RETURN s.key as key, s.code as code, s.code_type as code_type,
                   s.edition as edition, s.jurisdiction as jurisdiction,
                   s.source_id as source_id, s.number as number, s.title as title,
                   s.text as text, s.paragraphs as paragraphs, s.item_type as item_type,
                   s.source_url as source_url, s.hash as hash
            ORDER BY s.number
            """
            result = session.run(direct_query, code_id=code_id)
            all_sections_data = [dict(record) for record in result]
            
            # Get all subsections for each section
            section_keys = [s['key'] for s in all_sections_data]
            for section_key in section_keys:
                # Check if we've hit the limit
                if max_sections and len(all_sections_data) >= max_sections:
                    self.logger.info(f"Reached max_sections limit ({max_sections}), stopping collection")
                    break

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

                # Add unique subsections (respecting max_sections limit)
                existing_keys = {s['key'] for s in all_sections_data}
                for subsection in subsections:
                    if max_sections and len(all_sections_data) >= max_sections:
                        break
                    if subsection['key'] not in existing_keys:
                        all_sections_data.append(subsection)
                        existing_keys.add(subsection['key'])
            
            # Get all referenced sections
            all_keys = [s['key'] for s in all_sections_data]
            for section_key in all_keys:
                # Check if we've hit the limit
                if max_sections and len(all_sections_data) >= max_sections:
                    self.logger.info(f"Reached max_sections limit ({max_sections}), stopping collection")
                    break

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

                # Add unique references (respecting max_sections limit)
                existing_keys = {s['key'] for s in all_sections_data}
                for reference in references:
                    if max_sections and len(all_sections_data) >= max_sections:
                        break
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
    
    def assemble_all_codes(self, batch_size: int = 100) -> Generator[List[CodeAssembly], None, None]:
        """Generate batches of assembled code sections for all codes in the database.
        
        Args:
            batch_size: Number of code assemblies to yield in each batch
            
        Yields:
            List[CodeAssembly]: Batches of assembled code sections
        """
        code_types = self.get_all_code_types()
        self.logger.info(f"Found {len(code_types)} code types to process")
        
        batch = []
        
        for i, code_info in enumerate(code_types, 1):
            try:
                self.logger.info(f"Processing code {i}/{len(code_types)}: {code_info['code_id']}")
                assembly = self.assemble_code_sections(code_info)
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

    def save_debug_html(self, assembly: CodeAssembly, output_path: str = "debug_sections.html"):
        """Save debug output to an HTML file showing base sections and what they unnested."""

        # Create HTML content
        html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Unnested Sections Debug - {assembly.code_id}</title>
    <style>
        body {{
            font-family: 'Courier New', monospace;
            line-height: 1.4;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background: #f0f0f0;
        }}
        .base-section {{
            background: #2196F3;
            color: white;
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
        }}
        .base-section h2 {{
            margin: 0 0 10px 0;
            font-size: 24px;
            color: white;
        }}
        .base-section .section-content {{
            background: #1976D2;
            color: white;
        }}
        .base-section .paragraphs {{
            background: #1565C0;
            color: white;
        }}
        .base-section .paragraph-item {{
            background: #1976D2;
            color: white;
            border-left: 3px solid white;
        }}
        .base-section .label {{
            color: #B3E5FC;
        }}
        .unnested-section {{
            background: white;
            padding: 20px;
            margin: 10px 0 10px 40px;
            border-left: 4px solid #FF9800;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .section-content {{
            background: #f8f8f8;
            padding: 15px;
            margin: 10px 0;
            border-radius: 4px;
            white-space: pre-wrap;
            font-size: 14px;
        }}
        .paragraphs {{
            background: #fff3e0;
            padding: 15px;
            margin: 10px 0;
            border-radius: 4px;
        }}
        .paragraph-item {{
            margin: 5px 0;
            padding: 5px;
            background: white;
            border-left: 3px solid #FF9800;
        }}
        h3 {{
            color: #333;
            border-bottom: 2px solid #eee;
            padding-bottom: 5px;
        }}
        .section-number {{
            font-weight: bold;
            color: #FF5722;
        }}
        .label {{
            font-weight: bold;
            color: #666;
            display: inline-block;
            width: 100px;
        }}
    </style>
</head>
<body>
    <h1>📋 Unnested Sections Debug Output</h1>
    <div style="background: #333; color: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h2 style="color: white; margin: 0;">Code Information:</h2>
        <p style="margin: 10px 0;"><strong>Code ID:</strong> {assembly.code_id}</p>
        <p style="margin: 10px 0;"><strong>Provider:</strong> {assembly.provider}</p>
        <p style="margin: 10px 0;"><strong>Version:</strong> {assembly.version}</p>
        <p style="margin: 10px 0;"><strong>Jurisdiction:</strong> {assembly.jurisdiction or 'N/A'}</p>
        <p style="margin: 10px 0;"><strong>Source ID:</strong> {assembly.source_id}</p>
        <p style="margin: 10px 0;"><strong>Title:</strong> {assembly.title}</p>
        <p style="margin: 10px 0;"><strong>Total sections assembled:</strong> {len(assembly.sections)}</p>
    </div>
"""

        # First, show sections WITH content to verify the data
        sections_with_content = [s for s in assembly.sections if s.paragraphs and len(s.paragraphs) > 0]

        if sections_with_content:
            html_content += f"""
    <div style="background: #e3f2fd; padding: 20px; margin: 20px; border-radius: 8px;">
        <h2>📝 Found {len(sections_with_content)} sections WITH paragraph content!</h2>
        <p>Here are the first 5 sections that actually have legal text in their paragraphs:</p>
    </div>
"""
            for section in sections_with_content[:5]:
                html_content += f"""
    <div class="unnested-section" style="border: 2px solid #4CAF50;">
        <h3 style="color: #4CAF50;">✓ Section {section.number} - HAS CONTENT</h3>
        <div style="background: #f0f0f0; padding: 10px; margin: 10px 0; font-size: 12px;">
            <strong>Section Metadata:</strong><br>
            Code: {section.code} | Provider: {section.code_type} | Edition: {section.edition} |
            Jurisdiction: {section.jurisdiction} | Source: {section.source_id}<br>
            Full Key: {section.key}
        </div>
        <div><span class="label">Title:</span> {section.title or '(no title)'}</div>
        <div class="section-content">
            <strong>TEXT FIELD:</strong>
{section.text or '(empty text field)'}
        </div>
        <div class="paragraphs" style="background: #c8e6c9;">
            <strong>PARAGRAPHS - ACTUAL LEGAL CONTENT ({len(section.paragraphs)} paragraphs):</strong>
"""
                for i, para in enumerate(section.paragraphs, 1):
                    html_content += f"""            <div class="paragraph-item" style="background: white; margin: 5px 0; padding: 10px;">[Paragraph {i}]: {para}</div>
"""
                html_content += """        </div>
    </div>
"""

        html_content += """
    <hr style="margin: 40px 0; border: 2px solid #333;">
    <h2>🔍 Parent-Child Relationships (Unnesting Verification)</h2>
"""

        # Find sections that actually have children (i.e., were parents that got unnested)
        parent_sections = []
        for section in assembly.sections:
            # Check if this section has any children in the assembly
            if section.number:
                potential_children = [s for s in assembly.sections
                                    if s.number and s.number.startswith(section.number + ".")]
                if potential_children:  # This section has children that were unnested
                    parent_sections.append((section, potential_children))

        # Sort by section number and take first 5 parent sections
        parent_sections.sort(key=lambda x: x[0].number)

        if not parent_sections:
            html_content += """
    <div style="background: #ffebee; padding: 20px; margin: 20px; border-radius: 8px; border-left: 4px solid #f44336;">
        <h2 style="color: #c62828;">No Parent-Child Relationships Found</h2>
        <p>The first 20 sections don't appear to have subsections. This could mean:</p>
        <ul>
            <li>The sections are all at the same level (no hierarchy)</li>
            <li>The subsections are beyond the 20-section limit in debug mode</li>
            <li>The references are cross-references, not parent-child relationships</li>
        </ul>
        <p>Here are the first 10 sections in the flattened list:</p>
    </div>
"""
            # Just show the first 10 sections as-is
            for section in assembly.sections[:10]:
                html_content += f"""
    <div class="unnested-section">
        <h3>Section {section.number}</h3>
        <div style="background: #f0f0f0; padding: 10px; margin: 10px 0; font-size: 12px;">
            <strong>From Code:</strong> {section.code} | {section.edition} | {section.jurisdiction}<br>
            <strong>Source:</strong> {section.source_id} | <strong>Type:</strong> {section.item_type}<br>
            <strong>Key:</strong> {section.key}
        </div>
        <div><span class="label">Title:</span> {section.title or '(no title)'}</div>
        <div class="section-content">
            <strong>TEXT FIELD:</strong>
{section.text or '(empty text field)'}
        </div>
        <div class="paragraphs">
            <strong>PARAGRAPHS FIELD ({len(section.paragraphs or [])} items) - THIS IS THE ACTUAL CONTENT:</strong>
"""
                if section.paragraphs:
                    for i, para in enumerate(section.paragraphs, 1):  # Show ALL paragraphs
                        html_content += f"""            <div class="paragraph-item">[Paragraph {i}]: {para}</div>
"""
                else:
                    html_content += """            <div class="paragraph-item" style="color: red;">(NO PARAGRAPHS - This section has no content!)</div>
"""
                html_content += """        </div>
    </div>
"""
        else:
            # Show parent sections and their unnested children
            for parent, children in parent_sections[:5]:  # Show first 5 parent sections
                html_content += f"""
    <div class="base-section">
        <h2>PARENT SECTION: {parent.number}</h2>
        <div style="background: rgba(255, 255, 255, 0.2); padding: 10px; margin: 10px 0; font-size: 12px;">
            <strong>From Code:</strong> {parent.code} | {parent.edition} | {parent.jurisdiction}<br>
            <strong>Key:</strong> {parent.key}
        </div>
        <div><span class="label">Title:</span> {parent.title or '(no title)'}</div>
        <div><span class="label">Type:</span> {parent.item_type}</div>
        <div class="section-content">
            <strong>TEXT FIELD (usually just the header):</strong>
{parent.text or '(empty text field)'}
        </div>
        <div class="paragraphs">
            <strong>PARAGRAPHS FIELD - THE ACTUAL LEGAL TEXT ({len(parent.paragraphs or [])} items):</strong>
"""
                if parent.paragraphs:
                    for i, para in enumerate(parent.paragraphs, 1):  # Show ALL paragraphs to see content
                        html_content += f"""            <div class="paragraph-item">[Paragraph {i}]: {para}</div>
"""
                else:
                    html_content += """            <div class="paragraph-item" style="color: red; font-weight: bold;">(NO PARAGRAPHS - This section appears to have no content!)</div>
"""
                html_content += """        </div>
    </div>

    <!-- Now show the unnested children that came from this parent section -->
"""

                html_content += f"""    <div style="margin-left: 20px; color: #666; font-weight: bold;">↓ This parent section unnested into {len(children)} individual sections:</div>
"""
                for child in children[:10]:  # Show first 10 children
                    html_content += f"""
    <div class="unnested-section">
        <h3>UNNESTED SECTION: {child.number}</h3>
        <div style="background: #e0e0e0; padding: 8px; margin: 8px 0; font-size: 11px;">
            <strong>From Code:</strong> {child.code} | {child.edition} | {child.jurisdiction}<br>
            <strong>Key:</strong> {child.key}
        </div>
        <div><span class="label">Title:</span> {child.title or '(no title)'}</div>
        <div><span class="label">Type:</span> {child.item_type}</div>
        <div class="section-content">
            <strong>TEXT FIELD:</strong>
{child.text or '(empty text field)'}
        </div>
        <div class="paragraphs">
            <strong>PARAGRAPHS FIELD - THE ACTUAL LEGAL TEXT ({len(child.paragraphs or [])} items):</strong>
"""
                    if child.paragraphs:
                        for i, para in enumerate(child.paragraphs, 1):  # Show ALL paragraphs
                            html_content += f"""            <div class="paragraph-item">[Paragraph {i}]: {para}</div>
"""
                    else:
                        html_content += """            <div class="paragraph-item" style="color: red; font-weight: bold;">(NO PARAGRAPHS - This child section has no content!)</div>
"""
                    html_content += """        </div>
    </div>
"""
                if len(children) > 10:
                    html_content += f"""    <div style="margin: 20px 40px; padding: 10px; background: #ffe0b2; border-radius: 4px;">
        ... and {len(children) - 10} more unnested sections from {parent.number}
    </div>
"""

                html_content += """    <hr style="margin: 40px 0; border: 1px solid #ddd;">
"""

        # Add summary
        html_content += f"""
    <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin-top: 40px;">
        <h2>Summary</h2>
        <p><strong>Total sections after unnesting:</strong> {assembly.total_sections}</p>
        <p><strong>What happened:</strong> The graph database had nested sections (parent-child relationships).
        The unnesting process flattened these into individual sections. Each section above (base and unnested)
        will be processed separately by the analyzer.</p>
        <p><strong>Key point:</strong> Section 206.2.1 is NOT inside Section 206 anymore - it's its own separate item in the list.</p>
    </div>
</body>
</html>
"""

        # Write HTML file
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)

        print(f"\n📄 Debug HTML saved to: {output_path}")
        print(f"   Open this file in a browser to see base sections and their unnested children")


def main():
    """Example usage of the CodeSectionAssembler."""
    import os
    import argparse

    # Set up command line arguments
    parser = argparse.ArgumentParser(description='Assemble code sections from Neo4j database')
    parser.add_argument('--debug', action='store_true', default=True,
                        help='Enable debug mode (default: True)')
    parser.add_argument('--no-debug', dest='debug', action='store_false',
                        help='Disable debug mode')
    parser.add_argument('--max-codes', type=int, default=2,
                        help='Maximum code types to process in debug mode (default: 2)')
    parser.add_argument('--max-sections-preview', type=int, default=5,
                        help='Maximum sections to preview in debug mode (default: 5)')
    parser.add_argument('--max-total-sections', type=int, default=20,
                        help='Maximum total sections to assemble in debug mode (default: 20)')

    args = parser.parse_args()
    debug_mode = args.debug
    max_codes = args.max_codes
    max_sections_preview = args.max_sections_preview
    max_total_sections = args.max_total_sections

    # Keep INFO level logging - debug mode is about data preview, not log verbosity
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

    if debug_mode:
        print("🔍 DEBUG MODE ENABLED")
        print(f"   - Will process only {max_codes} code types")
        print(f"   - Will assemble max {max_total_sections} total sections per code")
        print(f"   - Will show first {max_sections_preview} sections for preview")
        print(f"   - To disable debug mode, use --no-debug")
        print()

    # Get Neo4j credentials from environment variables
    neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    username = os.getenv("NEO4J_USERNAME", "neo4j")
    password = os.getenv("NEO4J_PASSWORD")

    if not password:
        raise ValueError("Please set NEO4J_PASSWORD environment variable")

    assembler = CodeSectionAssembler(neo4j_uri, username, password)

    try:
        code_types = assembler.get_all_code_types()

        if debug_mode:
            print(f"\nFound {len(code_types)} code types in database")
            print(f"Processing first {min(max_codes, len(code_types))} codes...")
            codes_to_process = code_types[:max_codes]
        else:
            codes_to_process = code_types

        # Process codes individually or in batches
        if debug_mode:
            for i, code_info in enumerate(codes_to_process, 1):
                print(f"\n{'='*60}")
                print(f"Processing code {i}/{len(codes_to_process)}: {code_info['code_id']}")
                print(f"  Provider: {code_info['provider']}")
                print(f"  Version: {code_info['version']}")
                print(f"  Jurisdiction: {code_info['jurisdiction']}")

                # Pass max_sections limit in debug mode
                assembly = assembler.assemble_code_sections(
                    code_info,
                    max_sections=max_total_sections if debug_mode else None
                )

                print(f"\nAssembly Summary:")
                print(f"  Total sections: {assembly.total_sections}")
                print(f"  Direct sections: {assembly.total_sections - assembly.referenced_sections}")
                print(f"  Referenced/subsections: {assembly.referenced_sections}")

                # Show hierarchical structure to verify unnesting
                print(f"\n🔍 UNNESTING VERIFICATION - Showing parent → children relationships:")
                print("-" * 60)

                # Group sections by their number prefix to show family relationships
                section_families = {}
                for section in assembly.sections:
                    # Get the main section number (e.g., "206" from "206.2.1")
                    main_num = section.number.split('.')[0] if section.number else "unknown"
                    if main_num not in section_families:
                        section_families[main_num] = []
                    section_families[main_num].append(section)

                # Show first few families to demonstrate unnesting
                families_to_show = 3
                shown_families = 0
                for main_num, family_sections in sorted(section_families.items())[:20]:  # Check first 20
                    if len(family_sections) > 1:  # Only show families with children
                        if shown_families >= families_to_show:
                            break
                        print(f"\nSection Family {main_num}:")
                        # Sort by section number to show hierarchy
                        family_sections_sorted = sorted(family_sections, key=lambda s: s.number if s.number else "")
                        for section in family_sections_sorted[:8]:  # Show up to 8 members
                            indent = "  " * (section.number.count('.') if section.number else 0)
                            print(f"  {indent}→ {section.number}: {section.title[:50] if section.title else '(no title)'}")
                        if len(family_sections) > 8:
                            print(f"    ... and {len(family_sections) - 8} more in this family")
                        shown_families += 1

                print(f"\n📊 Section Distribution:")
                print(f"  Total section families: {len(section_families)}")
                print(f"  Families with multiple sections: {sum(1 for f in section_families.values() if len(f) > 1)}")
                print(f"  Largest family size: {max(len(f) for f in section_families.values()) if section_families else 0}")

                # Show some individual sections in detail
                print(f"\n📄 Individual Section Details (showing {min(max_sections_preview, len(assembly.sections))}):")
                for j, section in enumerate(assembly.sections[:max_sections_preview], 1):
                    print(f"\n  [{j}] Section {section.number}")
                    print(f"      Key: {section.key[:50]}...")  # Show the unique key
                    print(f"      Title: {section.title}")
                    print(f"      Type: {section.item_type}")
                    print(f"      Text preview: {section.text[:150]}..." if len(section.text) > 150 else f"      Text: {section.text}")

                if len(assembly.sections) > max_sections_preview:
                    print(f"\n  ... and {len(assembly.sections) - max_sections_preview} more sections")

                # Save debug HTML
                html_filename = f"debug_sections_{code_info['code_id'].replace(':', '_').replace('+', '_')}.html"
                assembler.save_debug_html(assembly, html_filename)
        else:
            # Normal batch processing
            for batch_num, batch in enumerate(assembler.assemble_all_codes(batch_size=100), 1):
                print(f"\nProcessing batch {batch_num} with {len(batch)} code assemblies:")

                for assembly in batch:
                    print(f"  - {assembly.code_id}: {assembly.total_sections} sections "
                          f"({assembly.referenced_sections} referenced)")

                    # Here you can process each assembly as needed
                    # For example, run your python code against each section:
                    for section in assembly.sections:
                        # Your processing logic here
                        # process_section(section)
                        pass

                print(f"Batch {batch_num} processing complete.")

    finally:
        assembler.close()


if __name__ == "__main__":
    main()
