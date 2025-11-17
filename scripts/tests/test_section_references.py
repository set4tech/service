"""
Tests for section reference extraction from CBC scraper.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from cbc import find_section_references, find_subsection_references


def test_single_section_reference():
    """Test extracting a single section reference."""
    text = "comply with Section 1611 of this code"
    result = find_subsection_references(text)
    assert result == [], f"Expected no subsections, got {result}"
    
    result = find_section_references(text)
    assert "1611" in result, f"Expected ['1611'], got {result}"


def test_section_reference_with_or():
    """Test extracting multiple references with 'or' conjunction."""
    text = "Section 1403.12.1 or 1403.12.2"
    result = find_subsection_references(text)
    assert "1403.12.1" in result, f"Missing 1403.12.1 in {result}"
    assert "1403.12.2" in result, f"Missing 1403.12.2 in {result}"


def test_section_reference_with_and():
    """Test extracting multiple references with 'and' conjunction."""
    text = "Sections 1403.12.1 and 1403.12.2"
    result = find_subsection_references(text)
    assert "1403.12.1" in result, f"Missing 1403.12.1 in {result}"
    assert "1403.12.2" in result, f"Missing 1403.12.2 in {result}"


def test_section_reference_with_comma_list():
    """Test extracting multiple references in comma-separated list."""
    text = "Section 1403.12.1, 1403.12.2 or 1403.12.3"
    result = find_subsection_references(text)
    assert "1403.12.1" in result, f"Missing 1403.12.1 in {result}"
    assert "1403.12.2" in result, f"Missing 1403.12.2 in {result}"
    assert "1403.12.3" in result, f"Missing 1403.12.3 in {result}"


def test_real_world_polypropylene_siding():
    """Test the actual case from the bug report."""
    text = "conforming to the requirements of ASTM D7254 and those of Section 1403.12.1 or 1403.12.2 by an approved quality control agency"
    result = find_subsection_references(text)
    assert "1403.12.1" in result, f"Missing 1403.12.1 in {result}"
    assert "1403.12.2" in result, f"Missing 1403.12.2 in {result}"


def test_no_false_positives_on_measurements():
    """Test that we don't extract measurements as section references."""
    text = "The width is 36.5 inches"
    result = find_subsection_references(text)
    assert result == [], f"Should not match measurements, got {result}"


def test_no_false_positives_on_dates():
    """Test that we don't extract dates as section references."""
    text = "Date: 12.25.2023"
    result = find_subsection_references(text)
    assert result == [], f"Should not match dates, got {result}"


def test_11b_section_references():
    """Test extraction of 11B-style section references."""
    text = "comply with Section 11B-404.2.6 or 11B-404.2.7"
    result = find_subsection_references(text)
    assert "11B-404.2.6" in result, f"Missing 11B-404.2.6 in {result}"
    assert "11B-404.2.7" in result, f"Missing 11B-404.2.7 in {result}"


def test_section_followed_by_sentence():
    """Test that extraction stops at sentence boundaries."""
    text = "comply with Section 1403.12.1 or 1403.12.2. The building shall also meet requirements."
    result = find_subsection_references(text)
    assert "1403.12.1" in result, f"Missing 1403.12.1 in {result}"
    assert "1403.12.2" in result, f"Missing 1403.12.2 in {result}"
    # Should NOT extract anything from the second sentence
    assert len(result) == 2, f"Should only extract 2 references, got {len(result)}: {result}"


def test_multiple_section_keywords_in_text():
    """Test multiple 'Section' keywords in same paragraph."""
    text = "comply with Section 1403.12.1 and also Section 1611 of this code"
    result = find_subsection_references(text)
    assert "1403.12.1" in result, f"Missing 1403.12.1 in {result}"

    result = find_section_references(text)
    assert "1611" in result, f"Missing 1611 in {result}"


def test_mixed_sections_and_subsections():
    """Test text containing both sections and subsections."""
    text = "Section 1403 and Section 1403.12.1"

    section_result = find_section_references(text)
    assert "1403" in section_result, f"Missing 1403 in {section_result}"

    subsection_result = find_subsection_references(text)
    assert "1403.12.1" in subsection_result, f"Missing 1403.12.1 in {subsection_result}"


def test_section_with_of_this_code_suffix():
    """Test sections followed by 'of this code' phrase."""
    text = "Section 1611 of this code and Chapter 11 of the California Plumbing Code"
    result = find_section_references(text)
    assert "1611" in result, f"Missing 1611 in {result}"


def test_deduplication():
    """Test that duplicate references are deduplicated."""
    text = "Section 1403.12.1 and also Section 1403.12.1 again"
    result = find_subsection_references(text)
    assert result.count("1403.12.1") == 1, f"Should deduplicate, got {result}"


if __name__ == "__main__":
    import traceback
    
    tests = [
        test_single_section_reference,
        test_section_reference_with_or,
        test_section_reference_with_and,
        test_section_reference_with_comma_list,
        test_real_world_polypropylene_siding,
        test_no_false_positives_on_measurements,
        test_no_false_positives_on_dates,
        test_11b_section_references,
        test_section_followed_by_sentence,
        test_multiple_section_keywords_in_text,
        test_mixed_sections_and_subsections,
        test_section_with_of_this_code_suffix,
        test_deduplication,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            test()
            print(f"✅ {test.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"❌ {test.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"💥 {test.__name__}: {e}")
            traceback.print_exc()
            failed += 1
    
    print(f"\n{'='*60}")
    print(f"Results: {passed} passed, {failed} failed")
    print(f"{'='*60}")
    
    sys.exit(0 if failed == 0 else 1)
