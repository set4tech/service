"""
Standalone test of the comparison functionality.
Tests the DeepDiff comparison without needing to run the full scraper.
"""

import json
import sys
from pathlib import Path

# Add the scripts directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from cbc import compare_json_files, print_comparison_summary

def test_identical_files():
    """Test comparing identical files."""
    print("="*80)
    print("Test 1: Comparing identical files")
    print("="*80)
    
    file1 = "cbc_2025.json"
    file2 = "cbc_2025_test.json"
    
    if not Path(file1).exists():
        print(f"❌ Error: {file1} not found")
        return
    
    if not Path(file2).exists():
        print(f"❌ Error: {file2} not found")
        return
    
    diff = compare_json_files(file1, file2)
    print_comparison_summary(diff, file1, file2)
    print()


def test_modified_file():
    """Test comparing files with a small change."""
    print("="*80)
    print("Test 2: Comparing with modified file")
    print("="*80)
    
    # Create a modified version
    with open("cbc_2025.json", "r") as f:
        data = json.load(f)
    
    # Make a small change
    if data.get("sections") and len(data["sections"]) > 0:
        original_title = data["sections"][0]["title"]
        data["sections"][0]["title"] = "MODIFIED TITLE FOR TESTING"
        
        # Save modified version
        with open("cbc_2025_modified.json", "w") as f:
            json.dump(data, f, indent=2, sort_keys=True)
        
        # Compare
        diff = compare_json_files("cbc_2025.json", "cbc_2025_modified.json")
        print_comparison_summary(diff, "cbc_2025.json", "cbc_2025_modified.json")
        
        # Restore original for next test
        data["sections"][0]["title"] = original_title
        
        # Cleanup
        Path("cbc_2025_modified.json").unlink()
    
    print()


def main():
    print("\n🧪 Testing CBC Comparison Functionality\n")
    
    test_identical_files()
    test_modified_file()
    
    # Cleanup
    if Path("cbc_2025_test.json").exists():
        Path("cbc_2025_test.json").unlink()
    
    print("="*80)
    print("✅ All tests complete!")
    print("="*80)


if __name__ == "__main__":
    main()

