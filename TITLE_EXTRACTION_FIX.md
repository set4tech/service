# Title Extraction Fix - Test Plan

## 🎯 The Issue

**Section 11B-206** currently has the wrong title in `cbc_2025.json`:

```json
{
  "number": "11B-206",
  "title": "Alterations to individual residential dwelling units"  ❌ WRONG
}
```

According to the HTML `data-section-title` attribute, it should be:

```json
{
  "number": "11B-206",
  "title": "ACCESSIBLE ROUTES"  ✅ CORRECT
}
```

## 🔧 The Fix (Already Implemented!)

The improved title extraction code in `scripts/cbc.py` (lines 245-262) now:

1. **First priority**: Checks `data-section-title` attribute
   ```html
   <div
     class="section-action-wrapper"
     data-section-title="SECTION 11B-206 — ACCESSIBLE ROUTES"
   ></div>
   ```
2. **Second priority**: Falls back to `span.level_title` element

3. **Last resort**: Parses raw header text

The `extract_title()` function (lines 208-221) then:

- Splits on "—" separator
- Returns "ACCESSIBLE ROUTES" (the part after "11B-206 —")

## ✅ Code Review

```python
# Lines 245-262 in scripts/cbc.py
section_title = None

# 1. Try data-section-title attribute (NEW - MOST RELIABLE)
if header_elem.get("data-section-title"):
    section_title_raw = header_elem.get("data-section-title")
    section_title = extract_title(section_title_raw, section_number)

# 2. Try span with level class
if not section_title:
    title_elem = level_section.find("span", class_=re.compile(r"level\d_title"))
    if title_elem:
        section_title = title_elem.get_text().strip()

# 3. Fallback to parsing header text
if not section_title:
    section_title = extract_title(header_text, section_number)
```

**Status: ✅ Code is correct and ready to test**

## 🧪 Testing Plan

### Prerequisites

1. Refresh AWS credentials:

   ```bash
   aws sso login --profile <your-profile>
   ```

2. Activate virtual environment:
   ```bash
   cd /Users/will/code/service
   source venv/bin/activate
   ```

### Step 1: Quick Test (Recommended First)

```bash
# Test with --test flag (only processes a few sections)
python scripts/cbc.py --version 2025 --test --compare --dry-run
```

**Expected output:**

```
📝 Values Changed: X
  root['sections'][N]['title']
    OLD: Alterations to individual residential dwelling units
    NEW: ACCESSIBLE ROUTES
```

### Step 2: Full Run with Comparison

```bash
# Full extraction with comparison
python scripts/cbc.py --version 2025 --compare
```

This will:

- ✅ Generate `cbc_2025_new.json` with corrected titles
- ✅ Compare with `cbc_2025.json` baseline
- ✅ Show all title changes in terminal
- ✅ Save detailed diff to `diff_report.json`
- ✅ Prevent S3 upload (safety feature)

### Step 3: Review the Changes

```bash
# See all title changes
cat diff_report.json | jq '.values_changed | to_entries | .[] | select(.key | contains("title"))'

# Count title changes
cat diff_report.json | jq '.values_changed | to_entries | .[] | select(.key | contains("title")) | .key' | wc -l

# Check specific section
cat cbc_2025_new.json | jq '.sections[] | select(.number == "11B-206") | {number, title}'
```

**Expected:**

```json
{
  "number": "11B-206",
  "title": "ACCESSIBLE ROUTES"
}
```

### Step 4: Accept Changes

If the changes look correct:

```bash
# Replace baseline with corrected version
mv cbc_2025_new.json cbc_2025.json

# Verify
cat cbc_2025.json | jq '.sections[] | select(.number == "11B-206") | .title'
# Should output: "ACCESSIBLE ROUTES"
```

### Step 5: Deploy

```bash
# Upload to S3
python scripts/cbc.py --version 2025
```

## 📊 What to Expect

### Likely Changes

The fix will probably correct titles for multiple sections, not just 11B-206:

- **Chapter 10 sections**: May have cleaner titles
- **Chapter 11A sections**: Should be more accurate
- **Chapter 11B sections**: Major improvements expected

### How Many Changes?

Based on the code logic, expect:

- **10-50 section titles** corrected (out of ~200 total sections)
- **Minimal subsection changes** (subsections use different extraction logic)
- **No other data changes** (only titles affected)

### Red Flags to Watch For

❌ **Bad**: If you see NEW titles that are:

- Empty or just whitespace
- Contain HTML tags
- Are obviously wrong (e.g., "Exception" as a section title)

✅ **Good**: If you see titles that:

- Match the official ICC section titles
- Are concise and clear
- Make sense in context

## 🔍 Manual Verification

You can verify specific sections by checking the ICC website:

1. Go to: https://codes.iccsafe.org/content/CABC2025P1
2. Navigate to Chapter 11B
3. Find Section 11B-206
4. Confirm the title is "ACCESSIBLE ROUTES"

## 📝 Commit Message Template

After accepting changes:

```bash
git add scripts/cbc.py cbc_2025.json
git commit -m "Fix: Improve section title extraction using data-section-title attribute

- Prioritize data-section-title attribute over text parsing
- Fixes incorrect titles (e.g., 11B-206 now 'ACCESSIBLE ROUTES')
- More reliable extraction for sections with complex HTML structure
- Tested with comparison system, verified X titles corrected
- No impact on subsections or other data

Refs: #<issue-number> (if applicable)"
```

## 🐛 Troubleshooting

### Issue: No changes detected

**Possible causes:**

1. The baseline already has correct titles (unexpected, but verify manually)
2. S3 HTML files haven't been updated
3. The section numbers don't match the regex patterns

**Solution:**

```bash
# Check a few sections manually
cat cbc_2025.json | jq '.sections[] | select(.number | startswith("11B-")) | {number, title}' | head -20
```

### Issue: Too many changes

**Possible causes:**

1. Baseline was generated with very old code
2. This is actually expected if many titles were wrong

**Solution:**

- Review a sample of changes manually
- Verify against ICC website
- If uncertain, test with `--test` flag first

### Issue: Some titles look wrong in new output

**Possible causes:**

1. data-section-title attribute itself has wrong data (rare)
2. extract_title() function needs adjustment

**Solution:**

```bash
# Don't accept the changes
rm cbc_2025_new.json diff_report.json

# Investigate the HTML structure
# Adjust the code if needed
```

## 🎉 Success Criteria

✅ Section 11B-206 title changes from "Alterations..." to "ACCESSIBLE ROUTES"
✅ Other section titles improve or stay the same
✅ No data lost (subsections, paragraphs, tables, figures all intact)
✅ Total section count unchanged
✅ Comparison system detects and reports all changes clearly

## 📚 Related Documentation

- Full comparison guide: `scripts/README_CBC_SCRAPER.md`
- Quick reference: `scripts/QUICK_REFERENCE.md`
- System overview: `REGRESSION_TESTING_SUMMARY.md`

---

**Ready to test!** Just need AWS credentials, then run the test plan above.
