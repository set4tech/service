# Multi-Level Subsection Reference Bug - Fix Plan

**Date:** 2025-10-06
**Status:** 🔴 Critical - Systemic data integrity issue
**Impact:** 105 sections with broken references, 93 missing subsections

---

## Executive Summary

The ICC scraper regex only captures single-level subsections (e.g., `11B-213.3`) but misses multi-level subsections (e.g., `11B-213.3.1`). This causes:

- **93 subsections** completely missing from database
- **105 sections** with incorrect references pointing to parent sections instead of actual targets
- **User-facing bug**: Wrong titles and content displayed in "Referenced Sections" UI

---

## Root Cause

### Location
`scripts/icc_cbc.py:28`

### Current (Broken) Regex
```python
SUBSECTION_NUMBER_REGEX = r"(?:11[AB]-\d{3,4}|\d{4}A)\.\d+"
```

**Problem:** `\.\d+` only matches **one** level of subsections.

### Examples of Failures
- ❌ Cannot extract: `11B-213.3.1` (2 levels)
- ❌ Cannot extract: `11B-228.3.2.1` (3 levels)
- ❌ Cannot extract: `11B-404.2.11` (2 levels)
- ✅ Can extract: `11B-213.3` (1 level only)

### Fallback Behavior
When the regex fails to extract `11B-213.3.1`, the script's reference-linking logic falls back to the nearest match it can find (`11B-213.3`), creating misleading references.

---

## Impact Analysis

### Database Query Results

**Total Missing Multi-Level Subsections:** 93

Sample of missing sections:
```
11B-1003.2.1    11B-206.2.19    11B-404.2.11
11B-1003.2.2    11B-206.2.3     11B-404.2.3
11B-213.3.1 ⬅️  11B-213.3.6     11B-604.8.3
11B-228.3.2.1   11B-308.1.1     11B-807.2.8.3
```

**Sections with Broken References:** 105

Example (the reported bug):
```
Section: 11B-213.2 "Multi-user all-gender toilet facilities"
  Text says: "shall comply with Section 11B-213.3.1"
  Database points to: 11B-213.3 "Coat hooks and shelves" ❌ WRONG
  Should point to: 11B-213.3.1 (MISSING from database)
```

---

## The Fix - Step by Step

### Phase 1: Fix the Regex ✅

**File:** `scripts/icc_cbc.py`

**Changes:**
```python
# Line 28 - OLD
SUBSECTION_NUMBER_REGEX = r"(?:11[AB]-\d{3,4}|\d{4}A)\.\d+"

# Line 28 - NEW
SUBSECTION_NUMBER_REGEX = r"(?:11[AB]-\d{3,4}|\d{4}A)(?:\.\d+)+"
```

**Explanation:** `(?:\.\d+)+` allows **one or more** levels of subsections.

**Test Examples:**
```python
# Should now match:
"11B-213.3"       # 1 level ✅
"11B-213.3.1"     # 2 levels ✅
"11B-228.3.2.1"   # 3 levels ✅
"11B-807.2.8.3"   # 3 levels ✅
```

---

### Phase 2: Add Comprehensive Tests 🧪

**Current State:** ❌ No tests found for extraction logic

**New Test File:** `scripts/tests/test_icc_cbc.py`

**Test Coverage:**

1. **Regex Pattern Tests**
   ```python
   def test_section_regex_matches_single_level()
   def test_subsection_regex_matches_multi_level()
   def test_subsection_regex_matches_2_levels()
   def test_subsection_regex_matches_3_levels()
   def test_subsection_regex_does_not_match_sections()
   ```

2. **Reference Extraction Tests**
   ```python
   def test_find_subsection_links_extracts_multi_level()
   def test_find_subsection_links_from_real_text()
   def test_extract_11b_213_3_1_reference()
   ```

3. **Integration Tests**
   ```python
   def test_real_section_11b_213_2_extracts_correct_reference()
   def test_no_missing_multilevel_subsections()
   ```

4. **Regression Tests** (prevent future bugs)
   ```python
   def test_all_extracted_subsections_match_regex()
   def test_references_point_to_existing_sections()
   ```

**Test Data Files:**
- `scripts/tests/fixtures/sample_11b_213.html` - Real HTML samples
- `scripts/tests/fixtures/expected_references.json` - Expected output

---

### Phase 3: Re-Extract Data 📥

**Prerequisites:**
- ✅ Regex fixed
- ✅ Tests passing

**Command:**
```bash
python scripts/icc_cbc.py --state CA --version 2025
```

**Expected Results:**
- Extract **93 new subsections** that were previously missing
- Generate correct `refers_to` arrays with multi-level references
- Output: `cbc_CA_2025.json` (updated)

**Validation:**
```bash
# Count multi-level subsections
jq '[.sections[].subsections[] | select(.number | test("11[AB]-\\d{3,4}(?:\\.\\d+){2,}"))] | length' cbc_CA_2025.json

# Should return ~93 (not 0)
```

---

### Phase 4: Database Migration Script 🔄

**File:** `scripts/migrations/001_fix_multilevel_subsections.py`

**Purpose:** Update existing database with new subsections and fix broken references

**Steps:**

1. **Upload New Subsections**
   ```python
   # Load updated cbc_CA_2025.json
   # Filter for subsections matching: (?:\.\d+){2,}
   # Insert into sections table
   ```

2. **Fix Section References**
   ```python
   # For each broken reference:
   #   - Check section.text for actual reference
   #   - Find correct target subsection in new data
   #   - Update section_references table
   ```

3. **Verification Queries**
   ```sql
   -- Check all 93 subsections now exist
   SELECT COUNT(*) FROM sections
   WHERE number ~ '11[AB]-\d{3,4}(?:\.\d+){2,}';

   -- Check 11B-213.2 now points to 11B-213.3.1
   SELECT target.number
   FROM section_references sr
   JOIN sections target ON sr.target_section_key = target.key
   WHERE sr.source_section_key = 'ICC:CBC_Chapter11A_11B:2025:CA:11B-213.2';
   ```

**Rollback Plan:**
```python
# Backup queries before migration
python scripts/migrations/001_fix_multilevel_subsections.py --backup
# Apply migration
python scripts/migrations/001_fix_multilevel_subsections.py --apply
# Rollback if needed
python scripts/migrations/001_fix_multilevel_subsections.py --rollback
```

---

### Phase 5: Add Reference Validation 🛡️

**Goal:** Prevent this from happening again

#### 5.1 Post-Extraction Validation Script

**File:** `scripts/validate_references.py`

**Checks:**

1. **Broken Reference Detection**
   ```python
   def find_broken_references(json_file):
       """Find references in text that don't match refers_to array"""
       # Parse text for all section numbers
       # Compare with refers_to array
       # Report mismatches
   ```

2. **Missing Subsection Detection**
   ```python
   def find_missing_subsections(json_file):
       """Find multi-level refs in text that don't exist as subsections"""
       # Extract all multi-level references from text
       # Check if each exists in subsections array
       # Report missing ones
   ```

3. **Regex Coverage Test**
   ```python
   def test_regex_captures_all_patterns(json_file):
       """Ensure regex patterns match all section numbers in text"""
       # Run regex on all paragraph text
       # Manually parse section numbers
       # Compare - should be 100% match
   ```

**Usage:**
```bash
# Run after extraction
python scripts/validate_references.py cbc_CA_2025.json

# Output:
# ✅ All references valid
# ❌ Found 93 missing subsections
# ❌ Found 105 broken references
```

#### 5.2 Database-Level Validation

**File:** `scripts/db_reference_check.py`

**Checks:**

1. **Dangling References**
   ```sql
   SELECT sr.source_section_key, sr.target_section_key
   FROM section_references sr
   WHERE NOT EXISTS (
     SELECT 1 FROM sections WHERE key = sr.target_section_key
   );
   ```

2. **Text vs. DB Mismatch**
   ```python
   def find_text_reference_mismatches():
       """Find sections where text mentions different refs than DB has"""
       # Query all sections with references
       # Parse section.text for actual numbers mentioned
       # Compare with section_references table
       # Report discrepancies
   ```

**Usage:**
```bash
python scripts/db_reference_check.py
```

#### 5.3 CI/CD Integration

**File:** `.github/workflows/validate-extraction.yml` (if using GitHub Actions)

```yaml
name: Validate Code Extraction

on:
  pull_request:
    paths:
      - 'scripts/icc_cbc.py'
      - 'cbc_*.json'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run extraction tests
        run: pytest scripts/tests/test_icc_cbc.py
      - name: Validate references
        run: python scripts/validate_references.py cbc_CA_2025.json
```

#### 5.4 Runtime Validation in API

**File:** `app/api/compliance/sections/route.ts`

**Add warning detection:**
```typescript
// In POST /api/compliance/sections
export async function POST(request: NextRequest) {
  // ... existing code ...

  // Add validation
  if (section.references && section.text) {
    const textRefs = extractMultiLevelRefs(section.text);
    const dbRefs = section.references.map(r => r.number);

    const mismatches = textRefs.filter(ref => !dbRefs.includes(ref));

    if (mismatches.length > 0) {
      console.warn(`Section ${section.number} has mismatched references:`, {
        inText: textRefs,
        inDB: dbRefs,
        missing: mismatches
      });

      // Optionally add to response
      return NextResponse.json({
        ...section,
        _warnings: {
          possiblyMissingRefs: mismatches
        }
      });
    }
  }
}
```

---

## Execution Timeline

| Phase | Task | Duration | Owner | Status |
|-------|------|----------|-------|--------|
| 1 | Fix regex in icc_cbc.py | 5 min | Dev | ⏳ Pending |
| 2 | Create test suite | 2 hours | Dev | ⏳ Pending |
| 2 | Run tests, ensure passing | 30 min | Dev | ⏳ Pending |
| 3 | Re-extract CBC data | 1 hour | Dev | ⏳ Pending |
| 3 | Validate JSON output | 30 min | Dev | ⏳ Pending |
| 4 | Write migration script | 2 hours | Dev | ⏳ Pending |
| 4 | Test migration on staging | 1 hour | Dev | ⏳ Pending |
| 4 | Run migration on prod DB | 30 min | Dev | ⏳ Pending |
| 5 | Create validation scripts | 2 hours | Dev | ⏳ Pending |
| 5 | Add runtime validation | 1 hour | Dev | ⏳ Pending |
| 5 | Document validation process | 30 min | Dev | ⏳ Pending |
| **Total** | | **~11.5 hours** | | |

---

## Rollback Plan

If issues occur during migration:

1. **Backup Database Before Migration**
   ```bash
   pg_dump -Fc -f backup_before_multilevel_fix.dump $DATABASE_URL
   ```

2. **Rollback Command**
   ```bash
   python scripts/migrations/001_fix_multilevel_subsections.py --rollback
   ```

3. **Full Database Restore** (worst case)
   ```bash
   pg_restore -d $DATABASE_URL backup_before_multilevel_fix.dump
   ```

---

## Success Criteria

✅ **Phase 1:** Regex updated, commented with examples
✅ **Phase 2:** Test suite with >80% coverage, all passing
✅ **Phase 3:** JSON file contains all 93 previously missing subsections
✅ **Phase 4:** Database query confirms 11B-213.2 → 11B-213.3.1 (not 11B-213.3)
✅ **Phase 5:** Validation script reports 0 broken references
✅ **User Verification:** Bug reporter confirms UI now shows correct reference

---

## Monitoring & Alerts

**Post-Deployment:**

1. **Database Query** (run weekly):
   ```sql
   -- Alert if any new broken references appear
   SELECT COUNT(*) FROM sections s
   WHERE s.text ~ '11[AB]-\d{3,4}(?:\.\d+){2,}'
     AND NOT EXISTS (
       SELECT 1 FROM section_references sr
       JOIN sections target ON sr.target_section_key = target.key
       WHERE sr.source_section_key = s.key
         AND s.text LIKE '%' || target.number || '%'
     );
   ```

2. **Log Analysis:**
   - Monitor for console.warn messages from runtime validation
   - Track frequency of `_warnings.possiblyMissingRefs` in API responses

---

## Related Issues

- [ ] Future: Audit other building codes (NYC, etc.) for same issue
- [ ] Future: Add multi-level subsection support to UI breadcrumbs
- [ ] Future: Consider database constraint to prevent orphaned references

---

## Appendix: Example Data

### Before Fix (Broken)
```json
{
  "number": "11B-213.2",
  "title": "Multi-user all-gender toilet facilities.",
  "paragraphs": ["...shall comply with Section 11B-213.3.1."],
  "refers_to": ["11B-213.3"]  // ❌ WRONG - missing .1
}
```

### After Fix (Correct)
```json
{
  "number": "11B-213.2",
  "title": "Multi-user all-gender toilet facilities.",
  "paragraphs": ["...shall comply with Section 11B-213.3.1."],
  "refers_to": ["11B-213.3.1"]  // ✅ CORRECT
}
```

### New Subsection Created
```json
{
  "number": "11B-213.3.1",
  "title": "Multi-user all-gender toilet facilities requirements.",
  "paragraphs": ["..."],
  "refers_to": [...]
}
```

---

**End of Plan**
