"""
Preview what title changes to expect when running the improved scraper.

Analyzes the current cbc_2025.json to identify sections that likely have
incorrect titles extracted by the old method.
"""

import json
from pathlib import Path


def analyze_titles(data: dict):
    """Analyze section titles for potential issues."""
    
    issues = []
    suspicious_patterns = []
    
    for section in data.get("sections", []):
        number = section.get("number", "")
        title = section.get("title", "")
        subsection_count = len(section.get("subsections", []))
        
        # Check for suspicious patterns
        is_suspicious = False
        reason = []
        
        # Pattern 1: Title is very long (might be grabbing too much text)
        if len(title) > 80:
            is_suspicious = True
            reason.append(f"Very long title ({len(title)} chars)")
        
        # Pattern 2: Title contains common paragraph text
        paragraph_indicators = ["shall", "required", "provided", "accordance", "comply"]
        if any(indicator in title.lower() for indicator in paragraph_indicators):
            is_suspicious = True
            reason.append("Contains paragraph-like text")
        
        # Pattern 3: Title starts with lowercase or has weird formatting
        if title and not title[0].isupper() and not title[0].isdigit():
            is_suspicious = True
            reason.append("Doesn't start with capital letter")
        
        # Pattern 4: Known problematic section
        if number == "11B-206" and "dwelling units" in title.lower():
            is_suspicious = True
            reason.append("Known incorrect title (should be 'ACCESSIBLE ROUTES')")
        
        if is_suspicious:
            issues.append({
                "number": number,
                "current_title": title,
                "subsections": subsection_count,
                "reasons": reason
            })
    
    return issues


def main():
    baseline_file = "cbc_2025.json"
    
    if not Path(baseline_file).exists():
        print(f"❌ Error: {baseline_file} not found")
        return
    
    print("\n" + "="*80)
    print("🔍 Title Extraction - Preview of Expected Changes")
    print("="*80 + "\n")
    
    with open(baseline_file, "r") as f:
        data = json.load(f)
    
    total_sections = len(data.get("sections", []))
    print(f"📊 Total sections in baseline: {total_sections}\n")
    
    issues = analyze_titles(data)
    
    if not issues:
        print("✅ No suspicious titles detected!")
        print("   (This doesn't mean titles are perfect, just that they don't match common error patterns)")
        return
    
    print(f"⚠️  Found {len(issues)} section(s) with potentially incorrect titles:\n")
    
    for i, issue in enumerate(issues, 1):
        print(f"{i}. Section {issue['number']} ({issue['subsections']} subsections)")
        print(f"   Current title: {issue['current_title'][:100]}")
        if len(issue['current_title']) > 100:
            print(f"                 ... (truncated, {len(issue['current_title'])} total chars)")
        print(f"   Issues: {', '.join(issue['reasons'])}")
        print()
    
    print("="*80)
    print("📋 What This Means")
    print("="*80)
    print(f"""
The improved title extraction will likely fix {len(issues)} section titles.

When you run:
    python scripts/cbc.py --version 2025 --compare

You should see these sections with changed titles in the comparison output.

The fix prioritizes the data-section-title HTML attribute which contains
the official section title directly from ICC's structured data.

To proceed:
    1. Ensure AWS credentials are valid: aws sso login
    2. Run comparison: python scripts/cbc.py --version 2025 --test --compare
    3. Review changes carefully
    4. If correct: mv cbc_2025_new.json cbc_2025.json
""")
    
    print("="*80)
    print("🎯 Known Example")
    print("="*80)
    print("""
Section 11B-206:
  Current (wrong): "Alterations to individual residential dwelling units"
  Should be:       "ACCESSIBLE ROUTES"

This is extracted from: data-section-title="SECTION 11B-206 — ACCESSIBLE ROUTES"
After splitting on "—": "ACCESSIBLE ROUTES"
""")


if __name__ == "__main__":
    main()

