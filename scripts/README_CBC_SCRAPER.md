# CBC Scraper with Regression Testing

## Overview

This script scrapes California Building Code data from ICC website HTML files stored in S3 and outputs structured JSON. It includes built-in regression testing to ensure changes don't break the output.

## Installation

```bash
cd scripts
pip install -r requirements.txt
```

## Usage

### Basic Usage (Production)

```bash
# Scrape and generate cbc_2025.json
python cbc.py --version 2025

# Dry run (no S3 upload)
python cbc.py --version 2025 --dry-run
```

### Regression Testing Mode

When making changes to the scraper, use `--compare` to check for unintended differences:

```bash
# Compare new output with existing baseline
python cbc.py --version 2025 --compare

# Or specify a custom baseline file
python cbc.py --version 2025 --compare path/to/baseline.json
```

#### What happens in compare mode:

1. ✅ Generates `cbc_2025_new.json` (doesn't overwrite your baseline)
2. ✅ Compares with `cbc_2025.json` (or specified baseline)
3. ✅ Shows a summary of differences in the terminal
4. ✅ Saves detailed diff to `diff_report.json`
5. ✅ Prevents accidental S3 upload

#### Reading the comparison output:

```
COMPARISON SUMMARY
================================================================================

📝 Values Changed: 5
  Shows fields where values were modified (e.g., text content changed)

➕ Items Added: 2
  Shows new sections, subsections, or fields that were added

➖ Items Removed: 1
  Shows sections, subsections, or fields that were removed

➕ Array Items Added: 10
  Shows new items in lists (e.g., new figures, references)

➖ Array Items Removed: 3
  Shows removed items from lists
```

#### If changes look good:

```bash
# Replace baseline with new output
mv cbc_2025_new.json cbc_2025.json
```

### Test Mode

Process only a few elements for quick testing:

```bash
python cbc.py --version 2025 --test --compare
```

## Deterministic Output

The script now ensures deterministic JSON output by:

- Sorting all sections and subsections by number
- Sorting all arrays (`refers_to`, `figures`, `tables`)
- Using `sort_keys=True` in JSON output
- Consistent ordering across runs

This makes diffs reliable and meaningful.

## Workflow for Making Changes

1. **Save current baseline:**

   ```bash
   cp cbc_2025.json cbc_2025_baseline_backup.json
   ```

2. **Make your code changes** to `cbc.py`

3. **Test with comparison:**

   ```bash
   python cbc.py --version 2025 --test --compare
   ```

4. **Review differences:**
   - Check terminal output for summary
   - Review `diff_report.json` for detailed changes
   - Inspect `cbc_2025_new.json` if needed

5. **If changes are expected and correct:**

   ```bash
   mv cbc_2025_new.json cbc_2025.json
   ```

6. **If changes are unexpected:**
   - Debug your changes
   - Revert if needed: `git checkout cbc.py`
   - Try again

## Common Scenarios

### Scenario: Fixing a bug in text extraction

```bash
# Before fixing bug
python cbc.py --version 2025 --compare
# Review diff - should show text corrections

# If fixes look good
mv cbc_2025_new.json cbc_2025.json
git add cbc.py cbc_2025.json
git commit -m "Fix: Correct title extraction for subsections"
```

### Scenario: Adding new feature (e.g., extracting references)

```bash
# Test with small dataset first
python cbc.py --version 2025 --test --compare
# Review what the new feature extracts

# Run full extraction
python cbc.py --version 2025 --compare
# Verify feature works across all sections

# Accept changes
mv cbc_2025_new.json cbc_2025.json
```

### Scenario: Refactoring without changing output

```bash
python cbc.py --version 2025 --compare
# Expected output: "✅ No differences found! Output matches baseline."
```

## Files Generated

- `cbc_2025.json` - Main output (baseline)
- `cbc_2025_new.json` - New output when using `--compare`
- `diff_report.json` - Detailed JSON diff report
- `diff_report.json` is only created when differences are found

## Tips

- Always use `--compare` when modifying the scraper
- Use `--test` for quick iteration during development
- Keep `diff_report.json` in `.gitignore` (it's temporary)
- The script automatically cleans up `cbc_2025_new.json` if no changes detected
- Review both the summary AND the detailed diff for important changes

## Troubleshooting

**Import error: "No module named 'deepdiff'"**

```bash
pip install -r requirements.txt
```

**Baseline file not found**

- Make sure `cbc_2025.json` exists in the current directory
- Or specify full path: `--compare /path/to/baseline.json`

**Too many differences to review**

- Use `--test` mode to see changes on smaller dataset
- Check `diff_report.json` for full details
- Use `git diff` on the JSON files for line-by-line comparison
