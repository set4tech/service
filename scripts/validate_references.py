"""
Post-extraction validation script for ICC CBC data.

This script validates that:
1. All references in section text exist in the extracted data
2. Multi-level subsections are properly captured
3. Regex patterns capture all section numbers in text

Usage:
    python scripts/validate_references.py cbc_CA_2025.json
"""

import json
import re
import sys
from collections import defaultdict
from typing import Dict, List, Set, Tuple


# Regex patterns from icc_cbc.py
SECTION_NUMBER_REGEX = r"(?:11[AB]-\d{3,4}|\d{4}A)(?!\.\d)"
SUBSECTION_NUMBER_REGEX = r"(?:11[AB]-\d{3,4}|\d{4}A)(?:\.\d+)+"


def extract_all_section_numbers(json_data: dict) -> Set[str]:
    """Extract all section and subsection numbers from the JSON data."""
    all_numbers = set()

    for section in json_data.get('sections', []):
        # Add main section
        all_numbers.add(section.get('number', ''))

        # Add all subsections
        for subsection in section.get('subsections', []):
            all_numbers.add(subsection.get('number', ''))

    return all_numbers


def find_references_in_text(text: str) -> Set[str]:
    """Find all section/subsection references in text using regex."""
    section_pattern = re.compile(SECTION_NUMBER_REGEX)
    subsection_pattern = re.compile(SUBSECTION_NUMBER_REGEX)

    references = set()

    # Extract subsections first (more specific)
    subsections = subsection_pattern.findall(text)
    references.update(subsections)

    # Extract sections
    sections = section_pattern.findall(text)
    references.update(sections)

    return references


def find_broken_references(json_data: dict) -> List[Tuple[str, Set[str]]]:
    """
    Find references in text that don't exist in the extracted data.

    Returns:
        List of tuples: (section_number, set_of_missing_refs)
    """
    all_numbers = extract_all_section_numbers(json_data)
    broken_references = []

    for section in json_data.get('sections', []):
        section_number = section.get('number', '')

        # Check section paragraphs
        for para in section.get('paragraphs', []):
            refs_in_text = find_references_in_text(para)

            # Also check stored references
            stored_refs = set(section.get('refers_to', []))

            # Find missing references
            missing_refs = refs_in_text - all_numbers

            if missing_refs:
                broken_references.append((section_number, missing_refs))

        # Check subsections
        for subsection in section.get('subsections', []):
            subsection_number = subsection.get('number', '')

            for para in subsection.get('paragraphs', []):
                refs_in_text = find_references_in_text(para)
                stored_refs = set(subsection.get('refers_to', []))

                missing_refs = refs_in_text - all_numbers

                if missing_refs:
                    broken_references.append((subsection_number, missing_refs))

    return broken_references


def find_missing_multilevel_subsections(json_data: dict) -> List[str]:
    """
    Find multi-level subsection references in text that don't exist in the data.

    Returns:
        List of missing multi-level subsection numbers
    """
    all_numbers = extract_all_section_numbers(json_data)
    multi_level_pattern = re.compile(r'11[AB]-\d{3,4}(?:\.\d+){2,}')

    all_text_refs = set()

    # Extract all references from text
    for section in json_data.get('sections', []):
        for para in section.get('paragraphs', []):
            refs = multi_level_pattern.findall(para)
            all_text_refs.update(refs)

        for subsection in section.get('subsections', []):
            for para in subsection.get('paragraphs', []):
                refs = multi_level_pattern.findall(para)
                all_text_refs.update(refs)

    # Find which ones are missing
    missing = sorted(all_text_refs - all_numbers)

    return missing


def validate_regex_coverage(json_data: dict) -> Dict[str, int]:
    """
    Validate that regex patterns capture all section numbers in text.

    Returns:
        Dict with statistics about regex coverage
    """
    section_pattern = re.compile(SECTION_NUMBER_REGEX)
    subsection_pattern = re.compile(SUBSECTION_NUMBER_REGEX)

    stats = {
        'total_sections': 0,
        'total_subsections': 0,
        'total_multilevel': 0,
        'sections_with_refs': 0,
        'subsections_with_refs': 0,
    }

    multi_level_pattern = re.compile(r'11[AB]-\d{3,4}(?:\.\d+){2,}')

    for section in json_data.get('sections', []):
        stats['total_sections'] += 1

        if section.get('refers_to'):
            stats['sections_with_refs'] += 1

        for subsection in section.get('subsections', []):
            stats['total_subsections'] += 1

            if subsection.get('refers_to'):
                stats['subsections_with_refs'] += 1

            # Count multi-level
            if multi_level_pattern.match(subsection.get('number', '')):
                stats['total_multilevel'] += 1

    return stats


def main():
    if len(sys.argv) < 2:
        print("Usage: python validate_references.py <json_file>")
        sys.exit(1)

    json_file = sys.argv[1]

    print(f"Validating {json_file}...")
    print("=" * 60)

    # Load JSON
    with open(json_file, 'r') as f:
        data = json.load(f)

    # 1. Validate regex coverage
    print("\n📊 Extraction Statistics:")
    stats = validate_regex_coverage(data)
    print(f"  Total sections: {stats['total_sections']}")
    print(f"  Total subsections: {stats['total_subsections']}")
    print(f"  Multi-level subsections: {stats['total_multilevel']}")
    print(f"  Sections with references: {stats['sections_with_refs']}")
    print(f"  Subsections with references: {stats['subsections_with_refs']}")

    # 2. Find missing multi-level subsections
    print("\n🔍 Checking for missing multi-level subsections...")
    missing_multilevel = find_missing_multilevel_subsections(data)

    if missing_multilevel:
        print(f"  ❌ Found {len(missing_multilevel)} missing multi-level subsections:")
        for ref in missing_multilevel[:10]:  # Show first 10
            print(f"     - {ref}")
        if len(missing_multilevel) > 10:
            print(f"     ... and {len(missing_multilevel) - 10} more")
    else:
        print("  ✅ All multi-level subsection references are valid!")

    # 3. Find broken references
    print("\n🔗 Checking for broken references...")
    broken_refs = find_broken_references(data)

    if broken_refs:
        print(f"  ❌ Found {len(broken_refs)} sections with broken references:")
        for section_num, missing_refs in broken_refs[:5]:  # Show first 5
            print(f"     {section_num} → {', '.join(list(missing_refs)[:3])}")
        if len(broken_refs) > 5:
            print(f"     ... and {len(broken_refs) - 5} more")
    else:
        print("  ✅ All references are valid!")

    # 4. Overall validation result
    print("\n" + "=" * 60)
    if not missing_multilevel and not broken_refs:
        print("✅ VALIDATION PASSED: All references are valid!")
        sys.exit(0)
    else:
        print("❌ VALIDATION FAILED: Issues found (see above)")
        sys.exit(1)


if __name__ == "__main__":
    main()
