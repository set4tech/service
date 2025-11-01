# 🎯 CBC Scraper Regression Testing System

## What I Built

I've added a comprehensive regression testing system to `cbc.py` that helps you safely make changes without breaking the output. Here's what's included:

### ✨ Key Features

1. **Deterministic JSON Output** - All arrays and objects are sorted consistently
2. **Comparison Mode** - Compare new output with baseline to catch regressions
3. **Detailed Diff Reports** - See exactly what changed and where
4. **Safe Development** - New output saved separately, never overwrites baseline
5. **Human-Readable Summaries** - Clear, emoji-enhanced terminal output

## 📂 Files Added/Modified

### Modified

- `scripts/cbc.py` - Enhanced with comparison and sorting features

### New Files

- `scripts/requirements.txt` - Python dependencies (includes deepdiff)
- `scripts/README_CBC_SCRAPER.md` - Comprehensive usage guide
- `scripts/normalize_json.py` - Utility to normalize existing JSON files
- `scripts/test_comparison.sh` - Demo/test script for the comparison feature
- `REGRESSION_TESTING_SUMMARY.md` - This file!
- `.gitignore` - Updated to exclude temporary comparison files

### Modified Baseline

- `cbc_2025.json` - Normalized with deterministic ordering (same content, different order)

## 🚀 Quick Start

### Basic Usage

```bash
# Normal operation (generates cbc_2025.json)
cd /Users/will/code/service
source venv/bin/activate
python scripts/cbc.py --version 2025 --dry-run

# With regression testing
python scripts/cbc.py --version 2025 --compare --dry-run
```

### Making Changes Safely

```bash
# 1. Edit cbc.py with your changes

# 2. Test with small dataset
python scripts/cbc.py --version 2025 --test --compare

# 3. Review the output:
#    - Terminal shows summary of changes
#    - diff_report.json has detailed differences
#    - cbc_2025_new.json is the new output

# 4. If changes look good, accept them:
mv cbc_2025_new.json cbc_2025.json

# 5. Or discard if unexpected:
rm cbc_2025_new.json
```

## 📊 What the Comparison Shows

When you run with `--compare`, you'll see output like:

```
================================================================================
COMPARISON SUMMARY
================================================================================

📝 Values Changed: 12
  root['sections'][0]['title']
    OLD: ADMINISTRATION
    NEW: ADMINISTRATION AND ENFORCEMENT
  ... (up to 10 shown)

➕ Items Added: 5
  root['sections'][42]['subsections'][3]
  ... (up to 5 shown)

➖ Items Removed: 2
  root['sections'][10]['figures'][0]
  ... (up to 5 shown)

➕ Array Items Added: 8
➖ Array Items Removed: 3

================================================================================
💡 Full diff saved to: diff_report.json
================================================================================
```

### Interpreting Results

- **No differences**: `✅ No differences found! Output matches baseline.`
  - Perfect! Your refactoring didn't change the output
  - `cbc_2025_new.json` is automatically deleted

- **Differences detected**: Review carefully!
  - Are they expected? (e.g., bug fixes, new features)
  - Or regressions? (e.g., accidentally removed data)

## 🔧 How It Works

### Deterministic Sorting

The script now sorts:

- Sections by number (1001, 1002, ...)
- Subsections by number (1001.1, 1001.2, ...)
- All arrays: `refers_to`, `figures`, `tables`
- JSON keys alphabetically

This ensures identical data always produces identical JSON.

### Comparison Process

1. Runs the scraper normally
2. Generates output as `cbc_2025_new.json` (doesn't overwrite baseline)
3. Compares with `cbc_2025.json` using DeepDiff
4. Shows summary in terminal
5. Saves detailed diff to `diff_report.json`
6. Prevents S3 upload (safety feature)

## 💡 Common Workflows

### Workflow 1: Bug Fix

```bash
# You notice titles are being extracted incorrectly

# 1. Fix the extract_title() function in cbc.py

# 2. Test the fix
python scripts/cbc.py --version 2025 --test --compare

# 3. Review the output
# Expected: Changed titles only, no other changes

# 4. If correct, run full extraction
python scripts/cbc.py --version 2025 --compare

# 5. Accept changes
mv cbc_2025_new.json cbc_2025.json

# 6. Commit
git add scripts/cbc.py cbc_2025.json
git commit -m "Fix: Correct title extraction for sections with special characters"
```

### Workflow 2: New Feature

```bash
# You want to add extraction of exception blocks

# 1. Add extract_exceptions() function to cbc.py

# 2. Test with small dataset
python scripts/cbc.py --version 2025 --test --compare

# 3. Review
# Expected: New 'exceptions' fields added to subsections

# 4. Run full extraction
python scripts/cbc.py --version 2025 --compare

# 5. Verify the feature works across all data
cat diff_report.json | jq '.dictionary_item_added' | head -20

# 6. Accept
mv cbc_2025_new.json cbc_2025.json
```

### Workflow 3: Refactoring

```bash
# You're cleaning up the code but shouldn't change output

# 1. Refactor code in cbc.py

# 2. Test
python scripts/cbc.py --version 2025 --compare

# 3. Expected output:
# "✅ No differences found! Output matches baseline."

# 4. Commit the refactoring
git add scripts/cbc.py
git commit -m "Refactor: Simplify section extraction logic"
```

## 🛠️ Utilities

### normalize_json.py

Use this to normalize any existing JSON file:

```bash
python scripts/normalize_json.py my_output.json
# Creates my_output_normalized.json

# Replace original
mv my_output_normalized.json my_output.json
```

### test_comparison.sh

Quick demo/test of the comparison feature:

```bash
cd scripts
./test_comparison.sh
```

## 📝 Command Line Options

```
--version INT           Code version year (default: 2025)
--test                  Process only first few elements (fast iteration)
--dry-run               Don't upload to S3
--compare [FILE]        Compare with baseline (default: cbc_VERSION.json)
--extract-images        Extract and upload images to S3 (default: True)
```

### Examples

```bash
# Quick test during development
python scripts/cbc.py --version 2025 --test --compare --dry-run

# Full extraction with comparison
python scripts/cbc.py --version 2025 --compare

# Compare with specific baseline
python scripts/cbc.py --version 2025 --compare path/to/old_baseline.json

# Production run (no comparison, uploads to S3)
python scripts/cbc.py --version 2025
```

## 🎓 Understanding DeepDiff Output

The `diff_report.json` uses these keys:

- `values_changed`: Field values that changed
- `dictionary_item_added`: New fields/keys added
- `dictionary_item_removed`: Fields/keys removed
- `iterable_item_added`: New items in arrays
- `iterable_item_removed`: Items removed from arrays
- `type_changes`: Data type changes (usually bad!)

Example:

```json
{
  "values_changed": {
    "root['sections'][0]['title']": {
      "old_value": "ADMINISTRATION",
      "new_value": "ADMINISTRATION AND ENFORCEMENT"
    }
  }
}
```

## ⚠️ Important Notes

1. **Always review diffs** - Even "expected" changes might have surprises
2. **Use --test first** - Catch issues early with small datasets
3. **Baseline is sacred** - Only update after careful review
4. **Comparison prevents S3 upload** - Safety feature to avoid deploying untested changes
5. **Clean up temp files** - `cbc_*_new.json` and `diff_report.json` are temporary

## 🐛 Troubleshooting

### "ModuleNotFoundError: No module named 'deepdiff'"

```bash
cd /Users/will/code/service
source venv/bin/activate
pip install deepdiff
```

### Baseline file not found

```bash
# Make sure you're in the right directory
cd /Users/will/code/service

# Or specify full path
python scripts/cbc.py --version 2025 --compare /full/path/to/cbc_2025.json
```

### Too many differences to review

```bash
# Use test mode
python scripts/cbc.py --version 2025 --test --compare

# Or use jq to filter diff_report.json
cat diff_report.json | jq '.values_changed | keys | .[]' | head -20
```

### Output doesn't match even though code unchanged

```bash
# Normalize your baseline (might have been generated before sorting was added)
python scripts/normalize_json.py cbc_2025.json
mv cbc_2025_normalized.json cbc_2025.json
```

## 📚 Additional Resources

- Full documentation: `scripts/README_CBC_SCRAPER.md`
- DeepDiff docs: https://zepworks.com/deepdiff/
- Python script: `scripts/cbc.py` (well-commented)

## ✅ Next Steps

1. **Try it out**:

   ```bash
   python scripts/cbc.py --version 2025 --test --compare
   ```

2. **Make a small change** to test the system:
   - Edit a comment in `cbc.py`
   - Run with `--compare`
   - Should show no differences (comment changes don't affect output)

3. **When ready to make real changes**:
   - Follow the workflows above
   - Always review diffs carefully
   - Keep baselines up to date

## 🎉 Benefits

- ✅ Confidence when refactoring
- ✅ Catch regressions immediately
- ✅ Clear visibility into what changed
- ✅ No more "did my change break something?" anxiety
- ✅ Easy code reviews (show the diff)
- ✅ Deterministic CI/CD pipeline possible

---

**Questions?** Check `scripts/README_CBC_SCRAPER.md` for detailed documentation!
