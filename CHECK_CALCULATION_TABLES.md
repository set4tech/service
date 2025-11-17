# Check-Specific Calculation Tables

## Implementation Summary

Display calculation tables for specific violations/checks in the Customer Report Viewer modal.

## What Was Implemented

### 1. Database Schema

**Migration**: `20250117000001_add_calculation_table_to_checks.sql`

- Added `calculation_table` JSONB column to `checks` table
- Stores calculation data tagged to specific checks
- Format: `{ title: string, headers: string[], rows: string[][] }`

**Migration**: `20250117000002_update_get_assessment_report_with_calc_table.sql`

- Updated `get_assessment_report()` RPC to include `calculation_table`
- Returns calculation table data with violation data

### 2. Frontend Components

**`CalculationTableDisplay.tsx`**

- Clean table component for displaying calculations
- Shows title, headers, and rows
- Responsive table with proper styling

**`ViolationDetailModal.tsx`** (Updated)

- Now displays calculation table if present
- Shows below code section content
- Auto-renders when `violation.calculationTable` exists

### 3. Type Definitions

```typescript
interface CalculationTable {
  title: string;
  headers: string[];
  rows: string[][];
}

interface ViolationMarker {
  // ... existing fields
  calculationTable?: CalculationTable;
}
```

### 4. Data Processing

**`process-violations.ts`** (Updated)

- Parses `calculation_table` from check data
- Includes in ViolationMarker objects
- Handles both with/without screenshot cases

## Data Format

Store calculation tables in `checks.calculation_table`:

```json
{
  "title": "Door Clearance Calculation",
  "headers": ["Measurement", "Required", "Provided", "Status"],
  "rows": [
    ["Width", "32 inches", "30 inches", "❌ Non-compliant"],
    ["Height", "80 inches", "84 inches", "✅ Compliant"],
    ["Threshold", "0.5 in max", "0.25 in", "✅ Compliant"]
  ]
}
```

## How to Add Calculation Tables

### Option 1: SQL Update

```sql
UPDATE checks
SET calculation_table = '{
  "title": "Your Calculation",
  "headers": ["Item", "Required", "Measured", "Result"],
  "rows": [
    ["Width", "32 in", "30 in", "Fail"],
    ["Height", "80 in", "84 in", "Pass"]
  ]
}'::jsonb
WHERE id = 'YOUR_CHECK_ID';
```

### Option 2: API Update (Future)

```typescript
await fetch(`/api/checks/${checkId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    calculation_table: {
      title: 'Door Clearance Calculation',
      headers: ['Item', 'Required', 'Measured', 'Status'],
      rows: [['Width', '32 in', '30 in', '❌']],
    },
  }),
});
```

### Option 3: Bulk Import (Future)

Create JSON file with check IDs and their tables, then bulk upload.

## Running the Migrations

**You need to run these SQL migrations:**

1. Open Supabase SQL Editor
2. Copy and run: `supabase/migrations/20250117000001_add_calculation_table_to_checks.sql`
3. Copy and run: `supabase/migrations/20250117000002_update_get_assessment_report_with_calc_table.sql`

Or use Supabase CLI (if configured):

```bash
supabase db push
```

## Testing

1. **Add a test calculation table** (already in migration):
   - Migration adds a sample table to one check with section 404.2

2. **View in Customer Report**:

   ```bash
   npm run dev
   # Navigate to /projects/[PROJECT_ID]/report
   # Find a violation for section 404.2
   # Click to view details
   # Should see calculation table below code section
   ```

3. **Verify it shows**:
   - ✅ Table title displays
   - ✅ Headers are bold
   - ✅ Rows render correctly
   - ✅ Table is scrollable if needed
   - ✅ Only shows when present (doesn't error if missing)

## Use Cases

Perfect for displaying:

- ✅ Measurement calculations (required vs provided)
- ✅ Compliance matrices (multiple checks in one table)
- ✅ Size calculations (area, clearance, etc.)
- ✅ Threshold comparisons
- ✅ Step-by-step validation results

## Files Changed

- ✅ `/supabase/migrations/20250117000001_add_calculation_table_to_checks.sql` - Schema
- ✅ `/supabase/migrations/20250117000002_update_get_assessment_report_with_calc_table.sql` - RPC
- ✅ `/components/reports/CalculationTableDisplay.tsx` - New component
- ✅ `/components/reports/ViolationDetailModal.tsx` - Display integration
- ✅ `/lib/reports/get-violations.ts` - Type definitions
- ✅ `/lib/reports/process-violations.ts` - Data processing

## Architecture

```
Database (checks.calculation_table JSONB)
  ↓
RPC (get_assessment_report includes calculation_table)
  ↓
process-violations.ts (parses and includes in ViolationMarker)
  ↓
ViolationDetailModal (displays if present)
  ↓
CalculationTableDisplay (renders the table)
```

## Next Steps

1. **Run migrations** (required!)
2. **Add real calculation tables** to your checks
3. **Test with actual violations**
4. **Consider building a UI** to add/edit calculation tables (optional)

## Example Calculations

### Door Clearance

```json
{
  "title": "Maneuvering Clearance Calculation",
  "headers": [
    "Approach",
    "Width Required",
    "Width Provided",
    "Depth Required",
    "Depth Provided",
    "Status"
  ],
  "rows": [
    ["Front (Pull)", "18 in", "16 in", "60 in", "60 in", "❌ Width insufficient"],
    ["Latch Side", "24 in", "24 in", "54 in", "56 in", "✅ Compliant"]
  ]
}
```

### Ramp Slope

```json
{
  "title": "Ramp Slope Analysis",
  "headers": ["Section", "Rise (in)", "Run (in)", "Slope (%)", "Max Allowed (%)", "Status"],
  "rows": [
    ["Section 1", "4", "48", "8.33", "8.33", "✅ Compliant"],
    ["Section 2", "6", "48", "12.5", "8.33", "❌ Too steep"]
  ]
}
```

## Summary

✅ **Complete implementation** for check-specific calculation tables  
✅ **Clean data format** (JSONB in database)  
✅ **Simple display** (table component)  
✅ **Tagged to checks** (one table per violation)  
✅ **Easy to add** (SQL update or future API)  
✅ **Optional** (doesn't break if missing)
