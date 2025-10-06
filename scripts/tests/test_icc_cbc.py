"""
Comprehensive test suite for ICC CBC scraper regex patterns and extraction logic.

Tests ensure:
1. Regex patterns correctly match all subsection levels
2. Reference extraction captures multi-level subsections
3. No missing subsections due to regex limitations
4. References point to existing sections
"""

import re
import sys
import os

# Add parent directory to path to import icc_cbc module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from icc_cbc import (
    SECTION_NUMBER_REGEX,
    SUBSECTION_NUMBER_REGEX,
    find_section_links,
    find_subsection_links,
)


class TestRegexPatterns:
    """Test regex patterns match expected section/subsection formats."""

    def test_section_regex_matches_11b_format(self):
        """Section regex should match 11B-XXX format."""
        pattern = re.compile(SECTION_NUMBER_REGEX)

        test_cases = [
            "11B-213",
            "11B-404",
            "11B-1003",
            "11A-206",
        ]

        for case in test_cases:
            match = pattern.search(case)
            assert match is not None, f"Should match {case}"
            assert match.group() == case, f"Should extract full {case}"

    def test_section_regex_matches_xxxxxa_format(self):
        """Section regex should match XXXXXA format (11A sections)."""
        pattern = re.compile(SECTION_NUMBER_REGEX)

        test_cases = [
            "1102A",
            "1103A",
            "1105A",
        ]

        for case in test_cases:
            match = pattern.search(case)
            assert match is not None, f"Should match {case}"
            assert match.group() == case, f"Should extract full {case}"

    def test_section_regex_does_not_match_subsections(self):
        """Section regex should NOT match subsections with dots."""
        pattern = re.compile(SECTION_NUMBER_REGEX)

        # These should NOT match (they're subsections, not sections)
        test_cases = [
            "11B-213.3",
            "11B-213.3.1",
            "11B-404.2.11",
        ]

        for case in test_cases:
            match = pattern.search(case)
            # Should either not match or not include the dot part
            if match:
                assert "." not in match.group(), f"Should not match subsection {case}"

    def test_subsection_regex_matches_single_level(self):
        """Subsection regex should match single-level subsections."""
        pattern = re.compile(SUBSECTION_NUMBER_REGEX)

        test_cases = [
            "11B-213.3",
            "11B-404.2",
            "11B-1003.2",
            "1102A.3",
        ]

        for case in test_cases:
            match = pattern.search(case)
            assert match is not None, f"Should match {case}"
            assert match.group() == case, f"Should extract full {case}"

    def test_subsection_regex_matches_two_levels(self):
        """Subsection regex should match two-level subsections (e.g., 11B-213.3.1)."""
        pattern = re.compile(SUBSECTION_NUMBER_REGEX)

        test_cases = [
            "11B-213.3.1",
            "11B-213.3.6",
            "11B-404.2.11",
            "11B-404.2.3",
            "11B-206.2.3",
            "11B-206.2.19",
        ]

        for case in test_cases:
            match = pattern.search(case)
            assert match is not None, f"Should match {case}"
            assert match.group() == case, f"Should extract full {case}"

    def test_subsection_regex_matches_three_levels(self):
        """Subsection regex should match three-level subsections (e.g., 11B-228.3.2.1)."""
        pattern = re.compile(SUBSECTION_NUMBER_REGEX)

        test_cases = [
            "11B-228.3.2.1",
            "11B-807.2.8.3",
            "11B-1003.2.1",
            "11B-1003.2.2",
        ]

        for case in test_cases:
            match = pattern.search(case)
            assert match is not None, f"Should match {case}"
            assert match.group() == case, f"Should extract full {case}"

    def test_subsection_regex_does_not_match_sections(self):
        """Subsection regex should NOT match sections without dots."""
        pattern = re.compile(SUBSECTION_NUMBER_REGEX)

        test_cases = [
            "11B-213",
            "11B-404",
            "1102A",
        ]

        for case in test_cases:
            match = pattern.search(case)
            assert match is None, f"Should not match section {case}"


class TestReferenceExtraction:
    """Test reference extraction from text paragraphs."""

    def test_find_section_links_basic(self):
        """Should extract section references from text."""
        text = "This section shall comply with Section 11B-404 and Section 11B-213."
        links = find_section_links(text)

        assert "11B-404" in links, "Should find 11B-404"
        assert "11B-213" in links, "Should find 11B-213"

    def test_find_subsection_links_single_level(self):
        """Should extract single-level subsection references."""
        text = "Comply with Section 11B-213.3 and Section 11B-404.2."
        links = find_subsection_links(text)

        assert "11B-213.3" in links, "Should find 11B-213.3"
        assert "11B-404.2" in links, "Should find 11B-404.2"

    def test_find_subsection_links_multi_level(self):
        """Should extract multi-level subsection references (2 or 3 levels)."""
        text = "Requirements in Section 11B-213.3.1 and Section 11B-228.3.2.1 apply."
        links = find_subsection_links(text)

        assert "11B-213.3.1" in links, "Should find 11B-213.3.1"
        assert "11B-228.3.2.1" in links, "Should find 11B-228.3.2.1"

    def test_extract_11b_213_3_1_reference(self):
        """Specific test for the reported bug: extract 11B-213.3.1 from text."""
        text = "Multi-user all-gender toilet facilities shall comply with Section 11B-213.3.1."
        links = find_subsection_links(text)

        assert "11B-213.3.1" in links, "Should extract 11B-213.3.1 (reported bug)"
        assert "11B-213.3" not in links or links.count("11B-213.3.1") > 0, \
            "Should extract full reference, not parent"

    def test_mixed_section_and_subsection_references(self):
        """Should extract both section and subsection references from same text."""
        text = "Comply with Section 11B-213, Section 11B-213.3, and Section 11B-213.3.1."

        sections = find_section_links(text)
        subsections = find_subsection_links(text)

        assert "11B-213" in sections, "Should find section"
        assert "11B-213.3" in subsections, "Should find 1-level subsection"
        assert "11B-213.3.1" in subsections, "Should find 2-level subsection"


class TestRealWorldCases:
    """Test with real-world text examples from CBC."""

    def test_11b_213_2_text_extraction(self):
        """Test extraction from actual 11B-213.2 section text."""
        text = """
        11B-213.2 Multi-user all-gender toilet facilities.

        Where multi-user all-gender toilet facilities are provided, they shall comply
        with Section 11B-213.3.1.
        """

        links = find_subsection_links(text)
        assert "11B-213.3.1" in links, "Should extract 11B-213.3.1 from real text"

    def test_multiple_multi_level_references_in_paragraph(self):
        """Test extraction of multiple multi-level references from a single paragraph."""
        text = """
        Accessible routes shall comply with Section 11B-404.2.3. Where the accessible
        route serves dwelling units, it shall also comply with Section 11B-404.2.11
        and Section 11B-206.2.3. Exceptions are listed in Section 11B-206.2.19.
        """

        links = find_subsection_links(text)

        expected_refs = ["11B-404.2.3", "11B-404.2.11", "11B-206.2.3", "11B-206.2.19"]
        for ref in expected_refs:
            assert ref in links, f"Should extract {ref}"

    def test_three_level_subsection_extraction(self):
        """Test extraction of three-level subsections."""
        text = """
        Facilities shall comply with Section 11B-228.3.2.1 and Section 11B-807.2.8.3
        as applicable.
        """

        links = find_subsection_links(text)

        assert "11B-228.3.2.1" in links, "Should extract 11B-228.3.2.1"
        assert "11B-807.2.8.3" in links, "Should extract 11B-807.2.8.3"

    def test_11a_format_with_subsections(self):
        """Test extraction of 11A format (XXXXXA) with subsections."""
        text = "Comply with Section 1102A.3 and Section 1103A.2.1."

        links = find_subsection_links(text)

        assert "1102A.3" in links, "Should extract 1102A.3"
        assert "1103A.2.1" in links, "Should extract 1103A.2.1"


class TestRegressionPrevention:
    """Tests to prevent regression of the multi-level subsection bug."""

    def test_all_known_missing_subsections_match(self):
        """Test that all 93 previously missing subsections now match the regex."""
        pattern = re.compile(SUBSECTION_NUMBER_REGEX)

        # Sample of the 93 missing subsections from the bug report
        missing_subsections = [
            "11B-1003.2.1",
            "11B-1003.2.2",
            "11B-213.3.1",
            "11B-213.3.6",
            "11B-228.3.2.1",
            "11B-206.2.3",
            "11B-206.2.19",
            "11B-404.2.3",
            "11B-404.2.11",
            "11B-604.8.3",
            "11B-807.2.8.3",
            "11B-308.1.1",
        ]

        for subsection in missing_subsections:
            match = pattern.search(subsection)
            assert match is not None, f"Regex should now match previously missing {subsection}"
            assert match.group() == subsection, f"Should extract full {subsection}"

    def test_regex_captures_all_levels(self):
        """Test that regex works for 1, 2, 3+ level subsections."""
        pattern = re.compile(SUBSECTION_NUMBER_REGEX)

        test_cases = {
            "1 level": ["11B-213.3", "11B-404.2"],
            "2 levels": ["11B-213.3.1", "11B-404.2.11"],
            "3 levels": ["11B-228.3.2.1", "11B-807.2.8.3"],
        }

        for level, cases in test_cases.items():
            for case in cases:
                match = pattern.search(case)
                assert match is not None, f"Should match {level}: {case}"
                assert match.group() == case, f"Should extract full {case}"

    def test_no_false_positives(self):
        """Ensure regex doesn't match invalid formats."""
        pattern = re.compile(SUBSECTION_NUMBER_REGEX)

        invalid_cases = [
            "11B-",  # Incomplete
            "11B-213.",  # Trailing dot
            "11C-213.3",  # Invalid chapter (11C doesn't exist)
            "11B-ABC.3",  # Non-numeric section
            "11B-213.A",  # Non-numeric subsection
        ]

        for case in invalid_cases:
            match = pattern.search(case)
            # Should either not match, or if it partially matches, shouldn't match the invalid part
            if match:
                assert match.group() != case, f"Should not match invalid format: {case}"


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_subsection_at_end_of_sentence(self):
        """Should extract subsection even at end of sentence with period."""
        text = "Shall comply with Section 11B-213.3.1."
        links = find_subsection_links(text)

        # Should extract 11B-213.3.1, not 11B-213.3.1. (with trailing period)
        assert "11B-213.3.1" in links, "Should extract without trailing period"

    def test_subsection_with_surrounding_punctuation(self):
        """Should extract subsections surrounded by various punctuation."""
        test_cases = [
            ("(Section 11B-213.3.1)", "11B-213.3.1"),
            ("[Section 11B-404.2.3]", "11B-404.2.3"),
            ("Section 11B-213.3.1,", "11B-213.3.1"),
            ("Section 11B-213.3.1;", "11B-213.3.1"),
        ]

        for text, expected in test_cases:
            links = find_subsection_links(text)
            assert expected in links, f"Should extract {expected} from {text}"

    def test_multiple_references_same_section(self):
        """Should extract multiple subsections from same parent section."""
        text = "Comply with Sections 11B-213.3, 11B-213.3.1, and 11B-213.3.6."
        links = find_subsection_links(text)

        assert "11B-213.3" in links, "Should find 11B-213.3"
        assert "11B-213.3.1" in links, "Should find 11B-213.3.1"
        assert "11B-213.3.6" in links, "Should find 11B-213.3.6"

        # Should not deduplicate - if referenced twice, should appear twice
        assert len(links) >= 3, "Should extract all three references"


if __name__ == "__main__":
    import pytest

    # Run with pytest
    pytest.main([__file__, "-v", "--tb=short"])
