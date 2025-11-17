"""
Unit tests for cbc.py scraper functions.
"""

import sys
import os
import pytest

# Add parent directory to path to import cbc module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cbc import section_belongs_to_chapter


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
        """Chapter 11A should match 11A-XXX format."""
        assert section_belongs_to_chapter("11A-101", "11a")
        assert section_belongs_to_chapter("11A-999", "11a")
        assert section_belongs_to_chapter("11A-1234", "11a")

    def test_chapter_11a_invalid_sections(self):
        """Chapter 11A should not match 11B sections."""
        assert not section_belongs_to_chapter("11B-101", "11a")
        assert not section_belongs_to_chapter("11B-999", "11a")

    def test_chapter_11b_valid_sections(self):
        """Chapter 11B should match 11B-XXX format."""
        assert section_belongs_to_chapter("11B-101", "11b")
        assert section_belongs_to_chapter("11B-213", "11b")
        assert section_belongs_to_chapter("11B-999", "11b")
        assert section_belongs_to_chapter("11B-1003", "11b")

    def test_chapter_11b_invalid_sections(self):
        """Chapter 11B should not match 11A sections."""
        assert not section_belongs_to_chapter("11A-101", "11b")
        assert not section_belongs_to_chapter("11A-999", "11b")

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
        assert not section_belongs_to_chapter("11A-101", "11b")
        assert not section_belongs_to_chapter("11B-101", "11a")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

