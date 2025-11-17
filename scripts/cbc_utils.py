"""
Utility functions for CBC scraper - comparison, sorting, and debugging.
"""

import json
import logging
from deepdiff import DeepDiff
from schema import Code

logger = logging.getLogger(__name__)


def sort_code_data(code: Code) -> Code:
    """Sort all data structures in the Code object for deterministic output."""
    # Sort sections by number
    code.sections.sort(key=lambda s: s.number)
    
    for section in code.sections:
        # Sort subsections by number
        section.subsections.sort(key=lambda ss: ss.number)
        
        # Sort section-level lists
        section.figures.sort()
        
        for subsection in section.subsections:
            # Sort subsection-level lists
            subsection.refers_to.sort()
            subsection.figures.sort()
            # Sort tables by number
            subsection.tables.sort(key=lambda t: t.number)
    
    return code


def compare_json_files(file1: str, file2: str) -> dict:
    """Compare two JSON files and return differences."""
    with open(file1, "r") as f1, open(file2, "r") as f2:
        data1 = json.load(f1)
        data2 = json.load(f2)
    
    diff = DeepDiff(data1, data2, ignore_order=False, verbose_level=2)
    return diff


def print_comparison_summary(diff: dict, baseline_file: str, new_file: str):
    """Print a human-readable summary of JSON differences."""
    if not diff:
        logger.info("✅ No differences found! Output matches baseline.")
        return
    
    logger.warning(f"⚠️  Differences detected between {baseline_file} and {new_file}")
    
    # Count changes
    counts = {
        "values_changed": 0,
        "dictionary_item_added": 0,
        "dictionary_item_removed": 0,
        "iterable_item_added": 0,
        "iterable_item_removed": 0,
    }
    
    for key in counts.keys():
        if key in diff:
            counts[key] = len(diff[key])
    
    # Print summary
    logger.info("\n" + "="*80)
    logger.info("COMPARISON SUMMARY")
    logger.info("="*80)
    
    if counts["values_changed"] > 0:
        logger.info(f"\n📝 Values Changed: {counts['values_changed']}")
        for path, change in list(diff.get("values_changed", {}).items())[:10]:
            logger.info(f"  {path}")
            logger.info(f"    OLD: {str(change['old_value'])[:100]}")
            logger.info(f"    NEW: {str(change['new_value'])[:100]}")
        if counts["values_changed"] > 10:
            logger.info(f"  ... and {counts['values_changed'] - 10} more")
    
    if counts["dictionary_item_added"] > 0:
        logger.info(f"\n➕ Items Added: {counts['dictionary_item_added']}")
        for path, value in list(diff.get("dictionary_item_added", {}).items())[:5]:
            logger.info(f"  {path}: {str(value)[:100]}")
        if counts["dictionary_item_added"] > 5:
            logger.info(f"  ... and {counts['dictionary_item_added'] - 5} more")
    
    if counts["dictionary_item_removed"] > 0:
        logger.info(f"\n➖ Items Removed: {counts['dictionary_item_removed']}")
        for path in list(diff.get("dictionary_item_removed", {}).keys())[:5]:
            logger.info(f"  {path}")
        if counts["dictionary_item_removed"] > 5:
            logger.info(f"  ... and {counts['dictionary_item_removed'] - 5} more")
    
    if counts["iterable_item_added"] > 0:
        logger.info(f"\n➕ Array Items Added: {counts['iterable_item_added']}")
    
    if counts["iterable_item_removed"] > 0:
        logger.info(f"\n➖ Array Items Removed: {counts['iterable_item_removed']}")
    
    logger.info("\n" + "="*80)
    logger.info("💡 Full diff saved to: diff_report.json")
    logger.info("="*80 + "\n")

