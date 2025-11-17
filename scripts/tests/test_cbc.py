"""
Unit tests for cbc.py scraper functions.
"""

import sys
import os
import pytest

# Add parent directory to path to import cbc module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cbc import section_belongs_to_chapter, find_section_references, find_subsection_references


class TestSectionBelongsToChapter:
    """Test the section_belongs_to_chapter function."""

    def test_chapter_3_valid_sections(self):
        """Chapter 3 should match 3XX format."""
        assert section_belongs_to_chapter("301", "3")
        assert section_belongs_to_chapter("350", "3")
        assert section_belongs_to_chapter("399", "3")
        assert section_belongs_to_chapter("300", "3")  # Edge case: 300 matches 3\d{2}

    def test_chapter_3_invalid_sections(self):
        """Chapter 3 should not match other chapters."""
        assert not section_belongs_to_chapter("401", "3")
        assert not section_belongs_to_chapter("201", "3")
        assert not section_belongs_to_chapter("30", "3")  # Too short
        assert not section_belongs_to_chapter("3001", "3")  # Too long

    def test_chapter_4_valid_sections(self):
        """Chapter 4 should match 4XX format."""
        assert section_belongs_to_chapter("401", "4")
        assert section_belongs_to_chapter("450", "4")
        assert section_belongs_to_chapter("499", "4")

    def test_chapter_5_valid_sections(self):
        """Chapter 5 should match 5XX format."""
        assert section_belongs_to_chapter("501", "5")
        assert section_belongs_to_chapter("599", "5")

    def test_chapter_6_valid_sections(self):
        """Chapter 6 should match 6XX format."""
        assert section_belongs_to_chapter("601", "6")
        assert section_belongs_to_chapter("699", "6")

    def test_chapter_7_valid_sections(self):
        """Chapter 7 should match 7XX format (without A suffix)."""
        assert section_belongs_to_chapter("701", "7")
        assert section_belongs_to_chapter("750", "7")
        assert section_belongs_to_chapter("799", "7")

    def test_chapter_7_excludes_7a_sections(self):
        """Chapter 7 should NOT match 7XXA format (that's chapter 7A)."""
        assert not section_belongs_to_chapter("701A", "7")
        assert not section_belongs_to_chapter("799A", "7")

    def test_chapter_7a_valid_sections(self):
        """Chapter 7A should match 7XXA format."""
        assert section_belongs_to_chapter("701A", "7a")
        assert section_belongs_to_chapter("750A", "7a")
        assert section_belongs_to_chapter("799A", "7a")

    def test_chapter_7a_excludes_7_sections(self):
        """Chapter 7A should NOT match 7XX format (without A)."""
        assert not section_belongs_to_chapter("701", "7a")
        assert not section_belongs_to_chapter("799", "7a")

    def test_chapter_8_valid_sections(self):
        """Chapter 8 should match 8XX format."""
        assert section_belongs_to_chapter("801", "8")
        assert section_belongs_to_chapter("899", "8")

    def test_chapter_9_valid_sections(self):
        """Chapter 9 should match 9XX format."""
        assert section_belongs_to_chapter("901", "9")
        assert section_belongs_to_chapter("999", "9")

    def test_chapter_10_valid_sections(self):
        """Chapter 10 should match 10XX format."""
        assert section_belongs_to_chapter("1001", "10")
        assert section_belongs_to_chapter("1050", "10")
        assert section_belongs_to_chapter("1099", "10")
        assert section_belongs_to_chapter("1000", "10")  # Edge case: 1000 matches 10\d{2}

    def test_chapter_10_valid_xxxxxa_format(self):
        """Chapter 10 should also match XXXXА format (any 4 digits + A)."""
        assert section_belongs_to_chapter("1003A", "10")
        assert section_belongs_to_chapter("9999A", "10")
        assert section_belongs_to_chapter("1234A", "10")

    def test_chapter_10_invalid_xxxxxa_format(self):
        """Chapter 10 XXXXА format should require exactly 4 digits."""
        assert not section_belongs_to_chapter("999A", "10")  # Only 3 digits
        assert not section_belongs_to_chapter("12345A", "10")  # 5 digits

    def test_chapter_11a_valid_sections(self):
        """Chapter 11A should match 11XXA format (e.g., 1102A, 1103A)."""
        assert section_belongs_to_chapter("1102A", "11a")
        assert section_belongs_to_chapter("1103A", "11a")
        assert section_belongs_to_chapter("1105A", "11a")

    def test_chapter_11a_invalid_sections(self):
        """Chapter 11A should not match 11B sections or other formats."""
        assert not section_belongs_to_chapter("11B-101", "11a")
        assert not section_belongs_to_chapter("11B-999", "11a")
        assert not section_belongs_to_chapter("1102", "11a")  # Missing A suffix
        assert not section_belongs_to_chapter("1002A", "11a")  # Wrong prefix (10, not 11)

    def test_chapter_11b_valid_sections(self):
        """Chapter 11B should match 11B-XXX format."""
        assert section_belongs_to_chapter("11B-101", "11b")
        assert section_belongs_to_chapter("11B-213", "11b")
        assert section_belongs_to_chapter("11B-999", "11b")
        assert section_belongs_to_chapter("11B-1003", "11b")

    def test_chapter_11b_invalid_sections(self):
        """Chapter 11B should not match 11A sections."""
        assert not section_belongs_to_chapter("1102A", "11b")
        assert not section_belongs_to_chapter("1103A", "11b")

    def test_case_insensitive_chapter(self):
        """Chapter parameter should be case insensitive."""
        assert section_belongs_to_chapter("701A", "7A")
        assert section_belongs_to_chapter("701A", "7a")
        assert section_belongs_to_chapter("11B-101", "11B")
        assert section_belongs_to_chapter("11B-101", "11b")

    def test_edge_cases(self):
        """Test edge cases like empty strings and invalid inputs."""
        assert not section_belongs_to_chapter("", "7")
        assert not section_belongs_to_chapter("301", "")
        assert not section_belongs_to_chapter("ABC", "3")
        assert not section_belongs_to_chapter("301", "invalid")
        assert not section_belongs_to_chapter("301", "99")

    def test_subsection_parent_extraction(self):
        """Test that function works correctly with subsection parent sections."""
        # When filtering subsections, we extract parent section and check chapter
        assert section_belongs_to_chapter("11B-213", "11b")  # Parent of 11B-213.3
        assert section_belongs_to_chapter("11B-213", "11b")  # Parent of 11B-213.3.1
        assert section_belongs_to_chapter("1003A", "10")     # Parent of 1003A.2
        assert section_belongs_to_chapter("1102A", "11a")    # Parent of 1102A.2
        assert section_belongs_to_chapter("701A", "7a")      # Parent of 701A.5

    def test_cross_chapter_validation(self):
        """Ensure sections don't match wrong chapters."""
        # Chapter 3 section shouldn't match other chapters
        assert not section_belongs_to_chapter("301", "4")
        assert not section_belongs_to_chapter("301", "5")
        assert not section_belongs_to_chapter("301", "7")
        
        # Chapter 7 vs 7A distinction
        assert not section_belongs_to_chapter("701", "7a")
        assert not section_belongs_to_chapter("701A", "7")
        
        # Chapter 11A vs 11B distinction
        assert not section_belongs_to_chapter("1102A", "11b")
        assert not section_belongs_to_chapter("11B-101", "11a")


class TestFindSectionNumbers:
    """Test the find_section_numbers regex function."""

    def test_chapter_7a_11a_format_positive(self):
        """Should extract Chapter 7A/11A format sections with proper context."""
        # "Section 709A.4" is a subsection, so find_section_numbers should NOT match it
        assert find_section_references("This material must comply with Section 709A.4") == []
        # These are pure section references (no dots)
        assert find_section_references("This applies to all Group R occupancies per Section 1101A") == ["1101A"]
        assert find_section_references("Refer to the accessibility requirements in Section 1102A") == ["1102A"]
        assert find_section_references("Grab bar reinforcement is detailed in Section 1134A") == ["1134A"]
        # Multiple sections each with "Section" keyword
        assert find_section_references("See Section 709A and Section 710A for criteria") == ["709A", "710A"]

    def test_chapter_11b_format_positive(self):
        """Should extract Chapter 11B format sections with proper context."""
        assert find_section_references("Parking spaces must comply with Section 11B-208") == ["11B-208"]
        assert find_section_references("The requirements are in Section 11B-101") == ["11B-101"]
        assert find_section_references("This is also referenced in §11B-302") == ["11B-302"]
        # Multiple sections each with keyword
        assert find_section_references("See Section 11B-201 and Section 11B-250") == ["11B-201", "11B-250"]

    def test_standard_chapters_positive(self):
        """Should extract standard chapter sections (3-10, 14-16) with proper context."""
        assert find_section_references("See Section 609 for requirements") == ["609"]
        assert find_section_references("According to Section 1401") == ["1401"]
        assert find_section_references("Refer to §1502 for details") == ["1502"]
        # Multiple sections each with keyword
        assert find_section_references("Section 701 and Section 801 apply") == ["701", "801"]

    def test_measurements_negative(self):
        """Should NOT extract measurements or embedded numbers."""
        assert find_section_references("20 feet (6096 mm) in height") == []
        assert find_section_references("5/8 inch (16 mm) in thickness") == []
        assert find_section_references("rate of less than or equal to 25 kW/ft²") == []
        assert find_section_references("at the conclusion of the 40-min test") == []
        assert find_section_references("The clearance must be 36 inches minimum") == []

    def test_standards_negative(self):
        """Should NOT extract other standards or test methods."""
        assert find_section_references("when tested in accordance with ASTM E2726") == []
        assert find_section_references("complies with SFM Standard 12-7A-4A") == []
        assert find_section_references("or UL 723") == []
        assert find_section_references("with a Class B flame spread") == []

    def test_dates_and_generic_negative(self):
        """Should NOT extract dates, years, or generic references."""
        assert find_section_references("The project was approved on 11-17-2025") == []
        assert find_section_references("This is covered in the 2022 edition of the code") == []
        assert find_section_references("See Chapter 1 for general information") == []
        assert find_section_references("This applies to items 1 and 2 below") == []
        assert find_section_references("conducted on a minimum of three test specimens") == []

    def test_bare_numbers_without_context_negative(self):
        """Should NOT extract bare section numbers without 'Section' or '§' prefix."""
        assert find_section_references("The 609 requirement is important") == []
        assert find_section_references("11B-213 is the relevant section") == []
        assert find_section_references("Per 1401, the requirements apply") == []

    def test_mixed_content(self):
        """Should extract only valid sections from mixed content."""
        text = "Units which exceed 5/8 inch (16 mm) in thickness shall be applied as for anchored veneer where used over exit ways or more than 20 feet (6096 mm) in height. See Section 609 for details."
        assert find_section_references(text) == ["609"]


class TestFindSubsectionNumbers:
    """Test the find_subsection_numbers regex function."""

    def test_chapter_7a_11a_subsections_positive(self):
        """Should extract Chapter 7A/11A format subsections with proper context."""
        assert find_subsection_references("The test must be conducted per Section 709A.4.1") == ["709A.4.1"]
        assert find_subsection_references("Refer to Section 1102A.3.1 for requirements") == ["1102A.3.1"]
        assert find_subsection_references("Grab bar reinforcement is detailed in Section 1134A.7") == ["1134A.7"]
        # Multiple subsections each with keyword
        assert find_subsection_references("See Section 709A.4.1 and Section 709A.4.2 for criteria") == ["709A.4.1", "709A.4.2"]

    def test_chapter_11b_subsections_positive(self):
        """Should extract Chapter 11B format subsections with proper context."""
        assert find_subsection_references("The requirements are in Section 11B-101.1") == ["11B-101.1"]
        assert find_subsection_references("See Section 11B-809.8.1 for door threshold details") == ["11B-809.8.1"]
        assert find_subsection_references("This is also referenced in §11B-302.1") == ["11B-302.1"]
        assert find_subsection_references("Water closet clearance is in Section 11B-604.3.1") == ["11B-604.3.1"]

    def test_standard_chapters_subsections_positive(self):
        """Should extract standard chapter subsections with proper context."""
        assert find_subsection_references("See Section 609.1 for requirements") == ["609.1"]
        assert find_subsection_references("According to Section 1401.2.3") == ["1401.2.3"]
        assert find_subsection_references("Refer to §702.5.2.1") == ["702.5.2.1"]

    def test_should_not_match_sections_without_dots(self):
        """Should NOT match section numbers without subsection dots."""
        assert find_subsection_references("See Section 609") == []
        assert find_subsection_references("Section 1401 applies") == []

    def test_should_not_match_decimal_measurements(self):
        """Should NOT match decimal numbers like measurements."""
        assert find_subsection_references("3.14159 is pi") == []
        assert find_subsection_references("The ratio is 2.5 to 1") == []
        assert find_subsection_references("Thickness: 0.625 inches") == []
        assert find_subsection_references("6096.78 mm total") == []

    def test_bare_subsections_without_context_negative(self):
        """Should NOT extract bare subsection numbers without 'Section' or '§' prefix."""
        assert find_subsection_references("The 609.1 requirement is important") == []
        assert find_subsection_references("11B-213.3.1 applies here") == []
        assert find_subsection_references("Per 1401.2.3, the requirements apply") == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

