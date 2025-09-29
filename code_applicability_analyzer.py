#!/usr/bin/env python3
"""
Code Section Applicability Analyzer

Takes assembled code sections from code_section_assembler.py and building variables,
then uses Claude Opus to determine if each code section applies to the specific building.
"""

import os
import json
import yaml
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from pathlib import Path
import time
import anthropic

from code_section_assembler import CodeSectionAssembler, CodeAssembly, CodeSection

@dataclass
class ApplicabilityResult:
    """Result of code section applicability analysis."""
    section_key: str
    section_number: str
    section_title: str
    applies: str  # true, false, or dont_know
    confidence: str  # high, medium, low
    reasoning: str
    applicable_conditions: List[str]
    building_characteristics_considered: List[str]
    tags: List[str]

class CodeApplicabilityAnalyzer:
    """Analyzes code section applicability using Claude Opus."""

    def __init__(self):
        """Initialize with API configuration."""
        self.anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not self.anthropic_api_key:
            raise ValueError("Please set ANTHROPIC_API_KEY environment variable")

        self.client = anthropic.Anthropic(api_key=self.anthropic_api_key)
        self.model_id = "claude-3-opus-20240229"

    def load_building_variables(self, yaml_path: str) -> Dict[str, Any]:
        """Load building variables from YAML file."""
        with open(yaml_path, 'r') as f:
            return yaml.safe_load(f)

    def create_applicability_prompt(self, code_section: CodeSection, building_vars: Dict[str, Any]) -> str:
        """Create the prompt for analyzing code section applicability."""
        building_summary = self._extract_building_summary(building_vars)
        section_content = self._get_section_content(code_section)

        prompt = f"""You are a building code compliance expert. Determine if this code section has BINDING LEGAL SCOPE on this building project.

BUILDING PROJECT:
{building_summary}

CODE SECTION:
Section: {code_section.number}
Title: {code_section.title}
Code Type: {code_section.code_type}
Text:
{section_content}

Does this section create mandatory requirements for this specific building? Consider:
- Occupancy scope
- Building size/type scope
- Project type scope (new construction, alteration, etc.)
- Conditional triggers
- Explicit exclusions

Return ONLY a JSON object:
{{
  "applies": true/false/"dont_know",
  "confidence": "high"/"medium"/"low",
  "reasoning": "2-3 sentence explanation",
  "applicable_conditions": ["condition1", "condition2"],
  "building_characteristics_considered": ["characteristic1", "characteristic2"],
  "tags": ["tag1", "tag2", "tag3"]
}}

Tags should be from: occupancy_A-U, egress, accessibility, fire_safety, structural, mechanical, electrical, plumbing, new_construction, alteration, high_rise, sprinkler_required"""

        return prompt

    def _get_section_content(self, code_section: CodeSection) -> str:
        """Get the actual content of a section."""
        if code_section.paragraphs:
            return "\n\n".join(code_section.paragraphs)
        return code_section.text or f"[No content available]"

    def _extract_building_summary(self, building_vars: Dict[str, Any]) -> str:
        """Extract key building characteristics into a readable summary."""
        parts = []

        # Just grab the key fields directly - if they don't exist, move on
        try:
            # Address
            addr = building_vars.get('project_identity', {}).get('full_address', {})
            if isinstance(addr, dict):
                addr = addr.get('value', addr)
            if addr and addr != 'not_applicable':
                parts.append(f"Address: {addr}")

            # Project type
            scope = building_vars.get('project_timeline', {}).get('project_scope', {})
            if isinstance(scope, dict):
                scope = scope.get('value', scope)
            if scope and scope != 'not_applicable':
                parts.append(f"Project Type: {scope}")

            # Occupancy
            bc = building_vars.get('building_characteristics', {})
            occ = bc.get('occupancy_classification', {})
            if isinstance(occ, dict) and 'value' in occ:
                if isinstance(occ['value'], dict) and 'ibc_occupancy_group' in occ['value']:
                    parts.append(f"Occupancy: Group {occ['value']['ibc_occupancy_group']}")

            # Building size - simplified
            size = bc.get('building_size', {}).get('value', [])
            if isinstance(size, list):
                for item in size:
                    if isinstance(item, dict):
                        if 'number_of_stories' in item:
                            parts.append(f"Stories: {item['number_of_stories']}")
                        if 'gross_floor_area_per_story' in item:
                            areas = item['gross_floor_area_per_story']
                            if isinstance(areas, list) and areas:
                                if 'area_sq_ft' in areas[0]:
                                    parts.append(f"Floor Area: {areas[0]['area_sq_ft']} sq ft")
        except:
            pass  # If data structure is different, just skip

        return "\n".join(parts) if parts else "Building characteristics not specified"

    def analyze_section_applicability(self, code_section: CodeSection, building_vars: Dict[str, Any]) -> Optional[ApplicabilityResult]:
        """Analyze if a code section applies to the building."""
        prompt = self.create_applicability_prompt(code_section, building_vars)

        try:
            response = self.client.messages.create(
                model=self.model_id,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=1000
            )

            # Just parse the JSON directly
            result_data = json.loads(response.content[0].text)

            return ApplicabilityResult(
                section_key=code_section.key,
                section_number=code_section.number,
                section_title=code_section.title,
                applies=str(result_data.get('applies', 'dont_know')),
                confidence=result_data.get('confidence', 'low'),
                reasoning=result_data.get('reasoning', ''),
                applicable_conditions=result_data.get('applicable_conditions', []),
                building_characteristics_considered=result_data.get('building_characteristics_considered', []),
                tags=result_data.get('tags', [])
            )

        except Exception as e:
            print(f"Error analyzing section {code_section.number}: {str(e)}")
            return None

    def analyze_code_assembly(self, code_assembly: CodeAssembly, building_vars: Dict[str, Any],
                             max_sections: Optional[int] = None) -> List[ApplicabilityResult]:
        """Analyze all sections in a code assembly."""
        results = []
        sections = code_assembly.sections[:max_sections] if max_sections else code_assembly.sections
        total = len(sections)

        print(f"\nAnalyzing {total} sections from {code_assembly.code_id}...")

        for i, section in enumerate(sections, 1):
            content = self._get_section_content(section)

            # Skip empty sections
            if len(content) < 50 or "[No content available" in content:
                print(f"  [{i}/{total}] {section.number} - SKIP (no content)")
                continue

            print(f"  [{i}/{total}] {section.number}...", end=" ")

            result = self.analyze_section_applicability(section, building_vars)
            if result:
                results.append(result)
                status = {
                    'true': '✓ APPLIES',
                    'false': '✗ N/A',
                    'dont_know': '? UNCLEAR'
                }.get(result.applies.lower(), '?')
                print(f"{status} ({result.confidence})")
            else:
                print("ERROR")

            time.sleep(0.1)  # Rate limiting

        return results

    def save_results(self, results: List[ApplicabilityResult], output_path: str,
                    code_assembly: CodeAssembly, building_vars: Dict[str, Any]):
        """Save analysis results to YAML file."""

        # Group results by applicability
        grouped = {
            'applicable': [r for r in results if r.applies.lower() == 'true'],
            'non_applicable': [r for r in results if r.applies.lower() == 'false'],
            'unclear': [r for r in results if r.applies.lower() == 'dont_know']
        }

        # Extract project info
        project_info = {}
        try:
            addr = building_vars.get('project_identity', {}).get('full_address', {})
            if isinstance(addr, dict):
                addr = addr.get('value')
            if addr and addr != 'not_applicable':
                project_info['address'] = addr

            scope = building_vars.get('project_timeline', {}).get('project_scope', {})
            if isinstance(scope, dict):
                scope = scope.get('value')
            if scope and scope != 'not_applicable':
                project_info['project_type'] = scope
        except:
            pass

        # Build output
        output_data = {
            'analysis_metadata': {
                'code_assembly_id': code_assembly.code_id,
                'total_analyzed': len(results),
                'applicable_count': len(grouped['applicable']),
                'non_applicable_count': len(grouped['non_applicable']),
                'unclear_count': len(grouped['unclear']),
                'project': project_info
            },
            'applicable_sections': [self._result_to_dict(r) for r in grouped['applicable']],
            'non_applicable_sections': [self._result_to_dict(r) for r in grouped['non_applicable']],
            'unclear_sections': [self._result_to_dict(r) for r in grouped['unclear']]
        }

        with open(output_path, 'w') as f:
            yaml.dump(output_data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

        print(f"\nResults saved to {output_path}")
        print(f"  - {len(grouped['applicable'])} sections apply")
        print(f"  - {len(grouped['non_applicable'])} sections don't apply")
        print(f"  - {len(grouped['unclear'])} sections unclear")

    def _result_to_dict(self, result: ApplicabilityResult) -> Dict[str, Any]:
        """Convert result to dictionary for YAML output."""
        return {
            'section': f"{result.section_number} - {result.section_title}",
            'confidence': result.confidence,
            'reasoning': result.reasoning,
            'conditions': result.applicable_conditions,
            'tags': result.tags
        }

def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description='Analyze code section applicability')
    parser.add_argument('--max-sections', type=int, default=None,
                        help='Limit number of sections to analyze')
    parser.add_argument('--building-vars', type=str, default="output/vars_california_st.yaml",
                        help='Path to building variables YAML')
    args = parser.parse_args()

    # Initialize analyzer
    analyzer = CodeApplicabilityAnalyzer()
    building_vars = analyzer.load_building_variables(args.building_vars)

    # Set up Neo4j connection
    neo4j_uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    username = os.environ.get("NEO4J_USERNAME", "neo4j")
    password = os.environ.get("NEO4J_PASSWORD")

    if not password:
        raise ValueError("Please set NEO4J_PASSWORD environment variable")

    assembler = CodeSectionAssembler(neo4j_uri, username, password)

    try:
        # Get ADA sections with content
        with assembler.driver.session() as session:
            query = """
            MATCH (s:Section)
            WHERE s.code = 'ADA' AND s.paragraphs IS NOT NULL AND SIZE(s.paragraphs) > 0
            RETURN s
            LIMIT 100
            """
            result = session.run(query)
            sections_data = [dict(record['s']) for record in result]

        if not sections_data:
            print("No ADA sections with content found")
            return

        # Convert to CodeSection objects
        sections = []
        for data in sections_data:
            sections.append(CodeSection(
                key=data['key'],
                code=data['code'],
                code_type=data['code_type'],
                edition=data['edition'],
                jurisdiction=data['jurisdiction'],
                source_id=data['source_id'],
                number=data['number'],
                title=data['title'],
                text=data.get('text', ''),
                paragraphs=data.get('paragraphs', []),
                item_type=data['item_type'],
                source_url=data['source_url'],
                hash=data['hash']
            ))

        # Create code assembly
        code_assembly = CodeAssembly(
            code_id='ADA_2010_US',
            provider='ADA',
            version='2010',
            jurisdiction='US',
            source_id='ADA2010',
            title='ADA Standards 2010',
            sections=sections,
            total_sections=len(sections),
            referenced_sections=0
        )

        # Analyze
        results = analyzer.analyze_code_assembly(
            code_assembly,
            building_vars,
            max_sections=args.max_sections
        )

        # Save results
        output_path = f"output/applicability_{code_assembly.code_id}.yaml"
        analyzer.save_results(results, output_path, code_assembly, building_vars)

    finally:
        assembler.close()

if __name__ == "__main__":
    main()