"""
Regression tests for chapter extraction.
Tests that Chapter 9 only extracts 9XX sections and other chapters work correctly.
"""

import json
import subprocess
import sys


def run_extraction(chapter: str) -> dict:
    """Run the extraction for a specific chapter and return the parsed JSON."""
    result = subprocess.run(
        ["python", "cbc.py", "--version", "2022", "--chapters", chapter, "--dry-run"],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print(f"Error running extraction for chapter {chapter}:")
        print(result.stderr)
        sys.exit(1)

    # Read the generated JSON file
    filename = f"cbc_2022_{chapter}.json"
    with open(filename, "r") as f:
        return json.load(f)


def test_chapter_9():
    """Test that Chapter 9 only extracts sections 901-918."""
    print("Testing Chapter 9 extraction...")
    data = run_extraction("9")

    sections = data["sections"]
    section_keys = [s["key"] for s in sections]

    # Check that all sections start with 9
    for key in section_keys:
        if not key.startswith("9"):
            print(f"❌ FAIL: Chapter 9 contains invalid section key: {key}")
            print(f"   Section keys: {sorted(section_keys)}")
            return False

    # Check that we have the expected range (901-918)
    expected_keys = [str(i) for i in range(901, 919)]
    found_keys = [k for k in section_keys if k in expected_keys]

    if len(found_keys) < 15:  # Should have most of 901-918
        print(f"❌ FAIL: Chapter 9 missing expected sections")
        print(f"   Expected sections like: 901-918")
        print(f"   Found: {sorted(section_keys)}")
        return False

    print(f"✅ PASS: Chapter 9 extracted {len(sections)} sections, all start with 9")
    print(f"   Section keys: {sorted(section_keys)[:5]}...{sorted(section_keys)[-3:]}")
    return True


def test_chapter_8():
    """Test that Chapter 8 extracts sections 801-808."""
    print("\nTesting Chapter 8 extraction...")
    data = run_extraction("8")

    sections = data["sections"]
    section_keys = [s["key"] for s in sections]

    # Check that main sections start with 8
    main_sections = [k for k in section_keys if len(k) == 3 and k[0] == "8"]

    if len(main_sections) < 5:
        print(f"❌ FAIL: Chapter 8 missing expected sections")
        print(f"   Found: {sorted(section_keys)}")
        return False

    # Check no invalid sections (like 9XX, 7XX, 10XX)
    invalid_prefixes = ["9", "10", "11", "70", "71", "72"]
    for key in section_keys:
        for prefix in invalid_prefixes:
            if key.startswith(prefix) and key != "808":  # 808 is valid
                print(f"❌ FAIL: Chapter 8 contains invalid section key: {key}")
                print(f"   Section keys: {sorted(section_keys)}")
                return False

    print(f"✅ PASS: Chapter 8 extracted {len(sections)} sections")
    print(f"   Main sections (8XX): {sorted(main_sections)}")
    return True


def test_chapter_7a():
    """Test that Chapter 7A extracts sections 701A-711A."""
    print("\nTesting Chapter 7A extraction...")
    data = run_extraction("7a")

    sections = data["sections"]
    section_keys = [s["key"] for s in sections]

    # Check that all sections end with A and start with 7
    for key in section_keys:
        if not (key.startswith("7") and key.endswith("A")):
            print(f"❌ FAIL: Chapter 7A contains invalid section key: {key}")
            print(f"   Section keys: {sorted(section_keys)}")
            return False

    if len(sections) < 10:
        print(f"❌ FAIL: Chapter 7A has too few sections: {len(sections)}")
        return False

    print(f"✅ PASS: Chapter 7A extracted {len(sections)} sections, all match 7XXA pattern")
    print(f"   Section keys: {sorted(section_keys)[:5]}...{sorted(section_keys)[-3:]}")
    return True


def test_chapter_11b():
    """Test that Chapter 11B extracts sections 11B-XXX."""
    print("\nTesting Chapter 11B extraction...")
    data = run_extraction("11b")

    sections = data["sections"]
    section_keys = [s["key"] for s in sections]

    # Check that all sections start with 11B-
    for key in section_keys:
        if not key.startswith("11B-"):
            print(f"❌ FAIL: Chapter 11B contains invalid section key: {key}")
            print(f"   Section keys: {sorted(section_keys)}")
            return False

    if len(sections) < 100:  # Should have ~131 sections
        print(f"❌ FAIL: Chapter 11B has too few sections: {len(sections)}")
        return False

    print(f"✅ PASS: Chapter 11B extracted {len(sections)} sections, all match 11B-XXX pattern")
    print(f"   Section keys: {sorted(section_keys)[:5]}...{sorted(section_keys)[-3:]}")
    return True


def main():
    """Run all regression tests."""
    print("=" * 80)
    print("CHAPTER EXTRACTION REGRESSION TESTS")
    print("=" * 80)

    tests = [
        ("Chapter 9", test_chapter_9),
        ("Chapter 8", test_chapter_8),
        ("Chapter 7A", test_chapter_7a),
        ("Chapter 11B", test_chapter_11b),
    ]

    results = []
    for name, test_func in tests:
        try:
            passed = test_func()
            results.append((name, passed))
        except Exception as e:
            print(f"❌ ERROR in {name}: {e}")
            results.append((name, False))

    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)

    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {name}")

    all_passed = all(passed for _, passed in results)

    if all_passed:
        print("\n🎉 All tests passed!")
        sys.exit(0)
    else:
        print("\n💥 Some tests failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
