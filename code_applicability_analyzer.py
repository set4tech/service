#!/usr/bin/env python3
"""
Code Section Applicability Analyzer

Takes assembled code sections from code_section_assembler.py and building variables,
then uses Claude Opus via Helicone to determine if each code section applies to the specific building.
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
    applicable_conditions: List[str]  # When it applies
    building_characteristics_considered: List[str]
    tags: List[str]  # e.g., ["occupancy_B", "multi_story", "alteration"]

class CodeApplicabilityAnalyzer:
    """Analyzes code section applicability using Claude Opus via Helicone."""
    
    def __init__(self):
        """Initialize with Helicone API configuration."""
        self.helicone_api_key = os.environ.get("HELICONE_API_KEY")
        self.anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY")

        if not self.helicone_api_key:
            raise ValueError("Please set HELICONE_API_KEY environment variable")
        if not self.anthropic_api_key:
            raise ValueError("Please set ANTHROPIC_API_KEY environment variable")

        # Configure Anthropic client directly (temporarily skip Helicone to test)
        # TODO: Fix Helicone integration
        self.client = anthropic.Anthropic(
            api_key=self.anthropic_api_key
        )

        # Model ID for Claude Opus
        self.model_id = "claude-3-opus-20240229"
    
    def load_building_variables(self, yaml_path: str) -> Dict[str, Any]:
        """Load building variables from YAML file."""
        with open(yaml_path, 'r') as f:
            return yaml.safe_load(f)
    
    def create_applicability_prompt(self, code_section: CodeSection, building_vars: Dict[str, Any]) -> str:
        """Create the prompt for analyzing code section applicability."""
        
        # Extract key building characteristics for the prompt
        building_summary = self._extract_building_summary(building_vars)
        
        prompt = f"""You are a building code compliance expert analyzing whether a specific code section has BINDING LEGAL SCOPE on a particular building project.

BUILDING PROJECT CHARACTERISTICS:
{building_summary}

CODE SECTION TO ANALYZE:
Section: {code_section.number}
Title: {code_section.title}
Code Type: {code_section.code_type}
Jurisdiction: {code_section.jurisdiction}

Section Text:
{self._get_section_content(code_section)}

YOUR TASK:
Determine if this code section has BINDING LEGAL SCOPE on this building project. This means:
- Does this section create mandatory requirements for this specific building?
- Would violation of this section constitute a code violation for this project?
- Does this section's regulatory language directly govern this building's design/construction?

CONSIDER:
1. **Occupancy Scope**: Does the section specify occupancy groups that include this building?
2. **Building Size/Type Scope**: Does it apply to buildings of this size, height, or configuration?
3. **Project Type Scope**: Does it apply to this type of work (new construction, alteration, etc.)?
4. **Conditional Triggers**: Are there specific conditions that trigger mandatory compliance?
5. **Explicit Exclusions**: Are there exclusions that remove this building from scope?

LEGAL LANGUAGE ANALYSIS:
- Look for mandatory terms: "shall", "must", "required"
- Identify scope-limiting phrases: "where", "except", "applicable to", "buildings of"
- Distinguish between mandatory requirements vs. permissive allowances
- Consider if the section applies generally or only under specific conditions

CONFIDENCE THRESHOLD:
Only mark as "high" confidence if the applicability is clear and unambiguous based on the section text.

RESPOND WITH:
1. **APPLIES**: true/false/dont_know - Does this section have binding scope on this building?
2. **CONFIDENCE**: high/medium/low - How certain are you?
3. **REASONING**: 2-3 sentences explaining your legal analysis
4. **CONDITIONS**: List specific conditions when this section applies (if any)
5. **CHARACTERISTICS**: Which building characteristics were most important for this decision?
6. **TAGS**: Generate 3-5 tags from these categories:
   - Occupancy: occupancy_A, occupancy_B, occupancy_E, occupancy_F, occupancy_H, occupancy_I, occupancy_M, occupancy_R, occupancy_S, occupancy_U
   - Building Systems: egress, accessibility, fire_safety, structural, mechanical, electrical, plumbing
   - Project Type: new_construction, alteration, addition, change_of_use, renovation
   - Building Scale: high_rise, mid_rise, low_rise, large_building, small_building
   - Special Requirements: sprinkler_required, elevator_required, seismic, historic

Return as JSON:
{{
  "applies": true/false/"dont_know",
  "confidence": "high/medium/low",
  "reasoning": "Your legal analysis here",
  "applicable_conditions": ["condition1", "condition2"],
  "building_characteristics_considered": ["characteristic1", "characteristic2"],
  "tags": ["tag1", "tag2", "tag3"]
}}"""
        
        return prompt
    
    def _get_section_content(self, code_section: CodeSection) -> str:
        """Get the actual content of a section, preferring paragraphs over text field."""
        if code_section.paragraphs and len(code_section.paragraphs) > 0:
            # Join paragraphs into a single text block
            return "\n\n".join(code_section.paragraphs)
        elif code_section.text:
            return code_section.text
        else:
            return f"[No content available for section {code_section.number}]"

    def _extract_building_summary(self, building_vars: Dict[str, Any]) -> str:
        """Extract key building characteristics into a readable summary."""
        summary_parts = []
        
        # Project identity
        if 'project_identity' in building_vars:
            pi = building_vars['project_identity']
            if 'full_address' in pi and pi['full_address'] != 'not_applicable':
                addr = pi['full_address']['value'] if isinstance(pi['full_address'], dict) else pi['full_address']
                summary_parts.append(f"Address: {addr}")
        
        # Project scope
        if 'project_timeline' in building_vars and 'project_scope' in building_vars['project_timeline']:
            scope_data = building_vars['project_timeline']['project_scope']
            scope = scope_data['value'] if isinstance(scope_data, dict) else scope_data
            if scope != 'not_applicable':
                summary_parts.append(f"Project Type: {scope}")
        
        # Building characteristics
        if 'building_characteristics' in building_vars:
            bc = building_vars['building_characteristics']
            
            # Occupancy
            if 'occupancy_classification' in bc:
                occ_data = bc['occupancy_classification']
                if isinstance(occ_data, dict) and 'value' in occ_data:
                    occ_info = occ_data['value']
                    if isinstance(occ_info, dict) and 'ibc_occupancy_group' in occ_info:
                        summary_parts.append(f"Occupancy: Group {occ_info['ibc_occupancy_group']}")
            
            # Building size
            if 'building_size' in bc:
                size_data = bc['building_size']
                if isinstance(size_data, dict) and 'value' in size_data:
                    size_info = size_data['value']
                    if isinstance(size_info, list):
                        for item in size_info:
                            if isinstance(item, dict):
                                for key, val in item.items():
                                    if key == 'gross_floor_area_per_story' and isinstance(val, list):
                                        for floor in val:
                                            if 'area_sq_ft' in floor:
                                                summary_parts.append(f"Floor Area: {floor['area_sq_ft']} sq ft")
                                    elif key == 'number_of_stories':
                                        summary_parts.append(f"Stories: {val}")
        
        # Facility category
        if 'facility_category' in building_vars:
            fc = building_vars['facility_category']
            for category, value in fc.items():
                if value != 'not_applicable' and value is not None:
                    if isinstance(value, dict) and 'value' in value:
                        summary_parts.append(f"Facility Type: {category} - {value['value']}")
                    elif isinstance(value, str):
                        summary_parts.append(f"Facility Type: {category}")
        
        # Code lineage
        if 'building_code_lineage' in building_vars and 'adopted_code_editions' in building_vars['building_code_lineage']:
            code_data = building_vars['building_code_lineage']['adopted_code_editions']
            if isinstance(code_data, dict) and 'value' in code_data:
                codes = code_data['value']
                if isinstance(codes, list):
                    code_names = []
                    for code in codes:
                        if isinstance(code, dict) and 'edition' in code:
                            code_names.append(code['edition'])
                    if code_names:
                        summary_parts.append(f"Applicable Codes: {', '.join(code_names)}")
        
        return "\n".join(summary_parts) if summary_parts else "Building characteristics not fully specified"
    
    def analyze_section_applicability(self, code_section: CodeSection, building_vars: Dict[str, Any]) -> Optional[ApplicabilityResult]:
        """Analyze if a code section applies to the building."""
        
        prompt = self.create_applicability_prompt(code_section, building_vars)
        
        try:
            response = self.client.messages.create(
                model=self.model_id,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,  # Low temperature for consistent analysis
                max_tokens=1000
            )

            # Parse the JSON response
            response_text = response.content[0].text

            # Debug: Show raw response in debug mode
            if len(response_text) < 1000:
                print(f"    Raw response: {response_text[:500]}")

            # Extract JSON from response
            # Try to find JSON object in the response
            import re
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response_text, re.DOTALL)

            if json_match:
                json_text = json_match.group()
            elif "```json" in response_text:
                json_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                json_text = response_text.split("```")[1].split("```")[0]
            else:
                json_text = response_text

            result_data = json.loads(json_text.strip())
            
            return ApplicabilityResult(
                section_key=code_section.key,
                section_number=code_section.number,
                section_title=code_section.title,
                applies=result_data.get('applies', 'dont_know'),
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
                             debug_mode: bool = False, max_sections: int = 3) -> List[ApplicabilityResult]:
        """Analyze all sections in a code assembly.

        Args:
            code_assembly: The code assembly to analyze
            building_vars: Building variables for context
            debug_mode: If True, only analyze first few sections and show detailed output
            max_sections: Maximum number of sections to analyze in debug mode
        """
        results = []
        total_sections = len(code_assembly.sections)
        sections_to_analyze = code_assembly.sections[:max_sections] if debug_mode else code_assembly.sections

        if debug_mode:
            print(f"\n🔍 DEBUG MODE: Analyzing first {len(sections_to_analyze)} of {total_sections} sections from {code_assembly.code_id}")
            print("=" * 80)
        else:
            print(f"\nAnalyzing {total_sections} sections from {code_assembly.code_id}...")

        for i, section in enumerate(sections_to_analyze, 1):
            # Get actual content
            content = self._get_section_content(section)

            if debug_mode:
                print(f"\n--- Section {i}/{len(sections_to_analyze)} ---")
                print(f"Number: {section.number}")
                print(f"Title: {section.title}")
                print(f"Content preview: {content[:200]}..." if len(content) > 200 else f"Content: {content}")
            else:
                print(f"  [{i}/{total_sections}] Analyzing section {section.number}...", end=" ")

            # Skip sections with no meaningful content
            if "[No content available" in content or len(content) < 50:
                if debug_mode:
                    print("  ⚠️ Skipping - no meaningful content")
                else:
                    print("SKIP (no content)")
                continue

            result = self.analyze_section_applicability(section, building_vars)
            if result:
                results.append(result)
                if str(result.applies).lower() == 'true':
                    applies_text = "✓ APPLIES"
                elif str(result.applies).lower() == 'false':
                    applies_text = "✗ N/A"
                else:
                    applies_text = "? UNCLEAR"

                if debug_mode:
                    print(f"\nResult: {applies_text}")
                    print(f"Confidence: {result.confidence}")
                    print(f"Reasoning: {result.reasoning}")
                    print(f"Conditions: {result.applicable_conditions}")
                    print(f"Tags: {result.tags}")
                    print("-" * 40)
                else:
                    print(f"{applies_text} ({result.confidence})")
            else:
                print("✗ ERROR")

            # Small delay to avoid overwhelming the API
            time.sleep(0.1)

        if debug_mode:
            print(f"\n🔍 DEBUG MODE: Analyzed {len(results)} sections (skipped {total_sections - len(sections_to_analyze)} sections)")
            print("=" * 80)

        return results
    
    def save_results(self, results: List[ApplicabilityResult], output_path: str, 
                    code_assembly: CodeAssembly, building_vars: Dict[str, Any]):
        """Save analysis results to YAML file."""
        
        # Organize results
        applicable_sections = [r for r in results if str(r.applies).lower() == 'true']
        non_applicable_sections = [r for r in results if str(r.applies).lower() == 'false']
        dont_know_sections = [r for r in results if str(r.applies).lower() == 'dont_know']
        
        # Create summary
        output_data = {
            'analysis_metadata': {
                'code_assembly_id': code_assembly.code_id,
                'code_provider': code_assembly.provider,
                'code_version': code_assembly.version,
                'total_sections_analyzed': len(results),
                'applicable_sections_count': len(applicable_sections),
                'non_applicable_sections_count': len(non_applicable_sections),
                'dont_know_sections_count': len(dont_know_sections),
                'analysis_model': self.model_id,
                'building_project': self._extract_project_summary(building_vars)
            },
            'applicable_sections': [self._result_to_dict(r) for r in applicable_sections],
            'non_applicable_sections': [self._result_to_dict(r) for r in non_applicable_sections],
            'dont_know_sections': [self._result_to_dict(r) for r in dont_know_sections],
            'tags_summary': self._create_tags_summary(results)
        }
        
        with open(output_path, 'w') as f:
            yaml.dump(output_data, f, default_flow_style=False, sort_keys=False, allow_unicode=True, width=120)
        
        print(f"\nResults saved to {output_path}")
        print(f"  - {len(applicable_sections)} sections apply to this building")
        print(f"  - {len(non_applicable_sections)} sections do not apply")
        print(f"  - {len(dont_know_sections)} sections have unclear applicability")
    
    def _result_to_dict(self, result: ApplicabilityResult) -> Dict[str, Any]:
        """Convert ApplicabilityResult to dictionary."""
        return {
            'section_key': result.section_key,
            'section_number': result.section_number,
            'section_title': result.section_title,
            'confidence': result.confidence,
            'reasoning': result.reasoning,
            'applicable_conditions': result.applicable_conditions,
            'building_characteristics_considered': result.building_characteristics_considered,
            'tags': result.tags
        }
    
    def _extract_project_summary(self, building_vars: Dict[str, Any]) -> Dict[str, Any]:
        """Extract project summary for metadata."""
        summary = {}
        
        if 'project_identity' in building_vars and 'full_address' in building_vars['project_identity']:
            addr_data = building_vars['project_identity']['full_address']
            summary['address'] = addr_data['value'] if isinstance(addr_data, dict) else addr_data
        
        if 'project_timeline' in building_vars and 'project_scope' in building_vars['project_timeline']:
            scope_data = building_vars['project_timeline']['project_scope']
            summary['project_type'] = scope_data['value'] if isinstance(scope_data, dict) else scope_data
        
        return summary
    
    def _create_tags_summary(self, results: List[ApplicabilityResult]) -> Dict[str, int]:
        """Create summary of tags across all results."""
        tag_counts = {}
        for result in results:
            if str(result.applies).lower() == 'true':  # Only count tags from applicable sections
                for tag in result.tags:
                    tag_counts[tag] = tag_counts.get(tag, 0) + 1
        
        # Sort by frequency
        return dict(sorted(tag_counts.items(), key=lambda x: x[1], reverse=True))

def main():
    """Example usage of the CodeApplicabilityAnalyzer."""
    import argparse

    # Set up command line arguments
    parser = argparse.ArgumentParser(description='Analyze code section applicability for a building')
    parser.add_argument('--debug', action='store_true', default=True,
                        help='Enable debug mode (default: True)')
    parser.add_argument('--no-debug', dest='debug', action='store_false',
                        help='Disable debug mode')
    parser.add_argument('--max-sections', type=int, default=3,
                        help='Maximum sections to analyze in debug mode (default: 3)')
    parser.add_argument('--building-vars', type=str, default="output/vars_california_st.yaml",
                        help='Path to building variables YAML file')

    args = parser.parse_args()
    debug_mode = args.debug
    max_sections = args.max_sections

    if debug_mode:
        print("🔍 DEBUG MODE ENABLED")
        print(f"   - Will analyze only {max_sections} sections per code")
        print(f"   - Showing detailed output")
        print(f"   - To disable debug mode, use --no-debug")
        print()

    # Initialize analyzer
    analyzer = CodeApplicabilityAnalyzer()

    # Load building variables
    building_vars_path = args.building_vars
    building_vars = analyzer.load_building_variables(building_vars_path)
    print(f"Loaded building variables from {building_vars_path}")

    # Get Neo4j credentials from environment variables
    neo4j_uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    username = os.environ.get("NEO4J_USERNAME", "neo4j")
    password = os.environ.get("NEO4J_PASSWORD")

    if not password:
        raise ValueError("Please set NEO4J_PASSWORD environment variable")

    assembler = CodeSectionAssembler(neo4j_uri, username, password)

    try:
        # Get a single code assembly for testing
        code_types = assembler.get_all_code_types()
        if not code_types:
            print("No code types found in database")
            return

        # For testing, manually get sections with content from ADA
        print("Using ADA sections which have actual paragraph content")

        # Manually query for ADA sections with content
        with assembler.driver.session() as session:
            query = """
            MATCH (s:Section)
            WHERE s.code = 'ADA' AND s.paragraphs IS NOT NULL AND SIZE(s.paragraphs) > 0
            RETURN s.key as key, s.code as code, s.code_type as code_type,
                   s.edition as edition, s.jurisdiction as jurisdiction,
                   s.source_id as source_id, s.number as number, s.title as title,
                   s.text as text, s.paragraphs as paragraphs, s.item_type as item_type,
                   s.source_url as source_url, s.hash as hash
            LIMIT 100
            """
            result = session.run(query)
            all_sections_data = [dict(record) for record in result]

        if not all_sections_data:
            print("No ADA sections with content found")
            return

        # Convert to CodeSection objects
        from code_section_assembler import CodeSection
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

        # Create a mock code assembly
        from code_section_assembler import CodeAssembly
        code_assembly = CodeAssembly(
            code_id='ADA+ADA2010+2010+US',
            provider='ADA',
            version='2010',
            jurisdiction='US',
            source_id='ADA2010',
            title='ADA Standards 2010',
            sections=code_sections[:max_sections] if max_sections else code_sections,
            total_sections=len(code_sections),
            referenced_sections=0
        )

        print(f"Analyzing code: {code_assembly.code_id}")

        if debug_mode:
            print(f"Building summary for analysis:")
            print("-" * 40)
            print(analyzer._extract_building_summary(building_vars))
            print("-" * 40)
            print(f"\nCode Assembly Summary:")
            print(f"  Total sections: {code_assembly.total_sections}")
            print(f"  Referenced sections: {code_assembly.referenced_sections}")
            print(f"  First few section numbers: {[s.number for s in code_assembly.sections[:5]]}")

        # Analyze applicability with debug mode
        results = analyzer.analyze_code_assembly(code_assembly, building_vars, debug_mode=debug_mode, max_sections=max_sections)

        # Save results
        output_path = f"output/applicability_analysis_{code_assembly.code_id.replace(':', '_').replace('+', '_')}.yaml"
        analyzer.save_results(results, output_path, code_assembly, building_vars)

    finally:
        assembler.close()

if __name__ == "__main__":
    main()
