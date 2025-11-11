# Apply the Parameters Migration

The migration file `202511111015_add_element_parameters.sql` needs to be applied to your Supabase database.

## Option 1: Using Supabase CLI (Recommended)

```bash
# If you have Supabase CLI installed
supabase db push

# Or apply specific migration
supabase migration up
```

## Option 2: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `supabase/migrations/202511111015_add_element_parameters.sql`
4. Click **Run**

## Option 3: Direct SQL

Run this SQL directly in your database:

```sql
-- Add parameters column to element_instances for storing element-specific data
-- (e.g., door measurements, ramp slopes, bathroom dimensions)
ALTER TABLE element_instances
ADD COLUMN IF NOT EXISTS parameters JSONB DEFAULT '{}';

-- Create GIN index for efficient querying of JSONB parameters
CREATE INDEX IF NOT EXISTS idx_element_instances_parameters
ON element_instances USING GIN (parameters);

COMMENT ON COLUMN element_instances.parameters IS
'JSONB field storing element-specific parameters (e.g., door width, hardware type, opening force). Structure varies by element_group_id.';
```

## Verify Migration

After applying, verify it worked:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'element_instances' AND column_name = 'parameters';
```

You should see:

```
column_name | data_type
------------|----------
parameters  | jsonb
```

## After Migration

Once the migration is applied, the door parameters form will work correctly and you'll be able to:

1. Save door parameters via the frontend form
2. Run rule-based compliance checks automatically
3. See violations identified by the rules engine
