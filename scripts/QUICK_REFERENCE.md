# 🚀 CBC Scraper - Quick Reference

## Most Common Commands

```bash
# Activate virtual environment first
cd /Users/will/code/service
source venv/bin/activate
```

### When Making Changes to cbc.py

```bash
# Quick test (processes ~5-10 elements)
python scripts/cbc.py --version 2025 --test --compare

# Full test before committing
python scripts/cbc.py --version 2025 --compare

# If changes look good
mv cbc_2025_new.json cbc_2025.json

# Production run (uploads to S3)
python scripts/cbc.py --version 2025
```

## What Each Flag Does

| Flag             | What it does                                     |
| ---------------- | ------------------------------------------------ |
| `--test`         | Only processes first few elements (fast)         |
| `--compare`      | Compares output with baseline, shows differences |
| `--dry-run`      | Skips S3 upload                                  |
| `--version 2025` | Specifies code version year                      |

## Output Files

| File                | Purpose                           |
| ------------------- | --------------------------------- |
| `cbc_2025.json`     | Your baseline (trusted output)    |
| `cbc_2025_new.json` | New output when using `--compare` |
| `diff_report.json`  | Detailed diff (JSON format)       |

## Understanding the Comparison Output

### ✅ Perfect - No Changes

```
✅ No differences found! Output matches baseline.
```

**Meaning:** Your code changes didn't affect the output (good for refactoring!)

### ⚠️ Changes Detected

```
📝 Values Changed: 5       # Existing fields with new values
➕ Items Added: 2          # New sections/fields
➖ Items Removed: 1        # Deleted sections/fields
```

**Meaning:** Review carefully - are these expected?

## Decision Tree

```
Made changes to cbc.py?
│
├─ Just refactoring? (no output changes expected)
│  └─ Run: python scripts/cbc.py --version 2025 --compare
│     ├─ No diffs? ✅ Perfect! Commit your changes
│     └─ Has diffs? ⚠️ Investigate - something broke
│
├─ Bug fix? (output should change)
│  └─ Run: python scripts/cbc.py --version 2025 --test --compare
│     ├─ Check diff makes sense
│     ├─ Run full: python scripts/cbc.py --version 2025 --compare
│     └─ Accept: mv cbc_2025_new.json cbc_2025.json
│
└─ New feature? (output should have additions)
   └─ Run: python scripts/cbc.py --version 2025 --test --compare
      ├─ Verify feature shows up in diff
      ├─ Run full: python scripts/cbc.py --version 2025 --compare
      └─ Accept: mv cbc_2025_new.json cbc_2025.json
```

## One-Liners

```bash
# Test comparison without S3
python scripts/cbc.py --version 2025 --test --compare --dry-run

# Normalize any JSON file
python scripts/normalize_json.py my_file.json

# Quick test of comparison feature
python scripts/test_comparison_standalone.py

# View first 20 changes in diff
cat diff_report.json | jq '.values_changed | keys | .[:20]'

# Count total changes
cat diff_report.json | jq '.values_changed | length'
```

## Gotchas

1. **Always activate venv first**: `source venv/bin/activate`
2. **Review diffs carefully**: Even "expected" changes can have surprises
3. **Use --test for iteration**: Much faster than full runs
4. **Don't commit \*\_new.json**: It's temporary (already in .gitignore)
5. **S3 credentials**: Comparison works without S3, but full scraping needs it

## Help

```bash
# Full help
python scripts/cbc.py --help

# Documentation
cat scripts/README_CBC_SCRAPER.md

# Summary
cat REGRESSION_TESTING_SUMMARY.md
```

## Example Session

```bash
# 1. Start work
cd /Users/will/code/service
source venv/bin/activate

# 2. Make changes to cbc.py
nano scripts/cbc.py

# 3. Quick test
python scripts/cbc.py --version 2025 --test --compare

# 4. Review output in terminal
# (Shows summary of what changed)

# 5. Look at detailed diff
cat diff_report.json | jq '.values_changed | to_entries | .[:5]'

# 6. If good, full run
python scripts/cbc.py --version 2025 --compare

# 7. Accept changes
mv cbc_2025_new.json cbc_2025.json

# 8. Commit
git add scripts/cbc.py cbc_2025.json
git commit -m "Fix: Better title extraction"

# 9. Deploy (if ready)
python scripts/cbc.py --version 2025  # Uploads to S3
```

---

**Pro tip:** Bookmark this file! It has everything you need for day-to-day usage.
