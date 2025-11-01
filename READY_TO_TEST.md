# ✅ Title Extraction Fix - Ready to Test!

## 🎯 Summary

Your improved title extraction code is **implemented and ready to test**. The comparison system will show you exactly what changes when you run it.

## 📊 Expected Changes

Based on analysis of the current baseline, **6 sections** have potentially incorrect titles:

| Section     | Current Title (Wrong)                                  | Expected Issue                |
| ----------- | ------------------------------------------------------ | ----------------------------- |
| **11B-206** | "Alterations to individual residential dwelling units" | Should be "ACCESSIBLE ROUTES" |
| 11B-212     | "General.Where provided, kitchens..."                  | Malformed (90+ chars)         |
| 1012        | "Elevators required."                                  | Contains paragraph text       |
| 1117A       | "GENERAL REQUIREMENTS FOR..."                          | Too long (106 chars)          |
| 1134A       | "Number of complying bathrooms."                       | Contains paragraph text       |
| 11B-802     | "WHEELCHAIR SPACES, COMPANION..."                      | Too long (85 chars)           |

## 🚀 Quick Test (3 Steps)

### 1. Setup (One Time)

```bash
cd /Users/will/code/service
aws sso login  # Refresh credentials
source venv/bin/activate
```

### 2. Test with Comparison

```bash
# Quick test (processes ~5-10 elements)
python scripts/cbc.py --version 2025 --test --compare

# Or full test (processes all ~215 sections)
python scripts/cbc.py --version 2025 --compare
```

### 3. Review & Accept

```bash
# Review the comparison output in terminal
# Check diff_report.json for details
# View specific section:
cat cbc_2025_new.json | jq '.sections[] | select(.number == "11B-206") | .title'

# If changes look correct:
mv cbc_2025_new.json cbc_2025.json
```

## 📋 What You'll See

When you run `--compare`, expect output like:

```
================================================================================
COMPARISON SUMMARY
================================================================================

📝 Values Changed: 6
  root['sections'][X]['title']
    OLD: Alterations to individual residential dwelling units
    NEW: ACCESSIBLE ROUTES

  root['sections'][Y]['title']
    OLD: General.Where provided, kitchens, kitchenettes...
    NEW: KITCHENS, KITCHENETTES AND SINKS

... (4 more title changes)

================================================================================
💡 Full diff saved to: diff_report.json
================================================================================
```

## ✅ The Improvement (Already Implemented)

The code in `scripts/cbc.py` now extracts titles in priority order:

```python
# 1. FIRST: Try data-section-title attribute (MOST RELIABLE) ✨ NEW
if header_elem.get("data-section-title"):
    section_title = extract_title(header_elem.get("data-section-title"), section_number)

# 2. SECOND: Try span.level_title element
if not section_title:
    title_elem = level_section.find("span", class_=re.compile(r"level\d_title"))
    if title_elem:
        section_title = title_elem.get_text().strip()

# 3. LAST RESORT: Parse header text
if not section_title:
    section_title = extract_title(header_text, section_number)
```

**Result**: More accurate titles from ICC's structured data!

## 🧪 Preview Without AWS

Want to see what sections will likely change without running the scraper?

```bash
python scripts/preview_title_changes.py
```

## 📚 Documentation

- **This file**: Quick overview and test steps
- **TITLE_EXTRACTION_FIX.md**: Detailed test plan and troubleshooting
- **scripts/QUICK_REFERENCE.md**: Common commands
- **scripts/README_CBC_SCRAPER.md**: Full comparison system guide

## 🎬 Complete Example Session

```bash
# 1. Setup
cd /Users/will/code/service
aws sso login
source venv/bin/activate

# 2. Preview what will change (optional)
python scripts/preview_title_changes.py

# 3. Test with small dataset
python scripts/cbc.py --version 2025 --test --compare

# 4. Review output
# Terminal shows summary
# Check detailed diff:
cat diff_report.json | jq '.values_changed | keys'

# 5. Looks good? Run full extraction
python scripts/cbc.py --version 2025 --compare

# 6. Verify key section
cat cbc_2025_new.json | jq '.sections[] | select(.number == "11B-206") | .title'
# Should output: "ACCESSIBLE ROUTES"

# 7. Accept changes
mv cbc_2025_new.json cbc_2025.json

# 8. Commit
git add scripts/cbc.py cbc_2025.json
git commit -m "Fix: Improve section title extraction using data-section-title attribute"

# 9. Deploy to S3 (optional)
python scripts/cbc.py --version 2025
```

## 🎯 Success Criteria

After running the comparison, you should see:

✅ Section 11B-206 changes to "ACCESSIBLE ROUTES"
✅ 5-10 other sections with improved titles
✅ No data loss (same number of sections, subsections intact)
✅ Clear diff report showing all changes
✅ Titles are cleaner and more accurate

## 🚨 Red Flags

Stop and investigate if you see:

❌ Titles that are empty or just whitespace
❌ Titles with HTML tags in them
❌ Loss of sections or subsections
❌ Hundreds of changes (should be 5-20 max)

## 💡 Tips

- Use `--test` first for quick iteration
- `--compare` automatically prevents S3 upload (safety!)
- The comparison system catches any regressions
- Review `diff_report.json` for full details
- Keep `cbc_2025_new.json` until you're sure it's correct

## 🎉 Benefits of This Fix

- **Accuracy**: Titles match official ICC code structure
- **Reliability**: Uses structured data (data-section-title) not text parsing
- **Maintainability**: Cleaner, more predictable extraction
- **Quality**: Better user experience when browsing sections

---

**Ready to test when you have AWS credentials!** 🚀

Run: `python scripts/cbc.py --version 2025 --test --compare`
