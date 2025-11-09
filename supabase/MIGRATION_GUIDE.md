# Database Migration Guide

## Overview

This guide covers best practices for creating, testing, and deploying database migrations for the service application.

## Migration Workflow

### 1. Create Migration Locally

```bash
# Create a new migration file
supabase migration new your_feature_description

# This creates: supabase/migrations/YYYYMMDD_your_feature_description.sql
```

### 2. Write Migration SQL

Follow the patterns below for safe, reversible migrations.

### 3. Test Locally

```bash
# Apply migration to local database
supabase db reset

# Verify schema changes
psql -h localhost -p 54322 -d postgres -U postgres -c "\d+ your_table"

# Test application with new schema
npm run dev
npm run test:e2e
```

### 4. Commit and Push

```bash
git add supabase/migrations/YYYYMMDD_your_feature_description.sql
git commit -m "feat: add your feature description"
git push origin your-branch
```

### 5. Open Pull Request

- CI will test migrations on production branch
- E2E tests run against migrated database
- Review migration SQL carefully
- Merge only after tests pass

### 6. Deploy to Production

- Merge to `main`
- CI automatically applies to production
- Vercel deploys application
- Monitor for issues

## Migration Patterns

### Adding a Column

**Good: Nullable column**

```sql
-- Can be reversed with DROP COLUMN
ALTER TABLE checks ADD COLUMN new_field TEXT;

-- Add default later if needed
ALTER TABLE checks ALTER COLUMN new_field SET DEFAULT 'some_value';
```

**Bad: NOT NULL without default**

```sql
-- Will fail if table has existing rows
ALTER TABLE checks ADD COLUMN required_field TEXT NOT NULL;
```

**Better: NOT NULL with default**

```sql
-- Safe for existing rows
ALTER TABLE checks ADD COLUMN required_field TEXT NOT NULL DEFAULT 'default_value';
```

### Removing a Column

**⚠️ Warning: Data loss! Use expand-contract pattern**

**Phase 1: Stop writing to column**

```sql
-- Deploy application that doesn't use the column
-- Wait for deployment to complete
```

**Phase 2: Remove column**

```sql
-- Now safe to drop
ALTER TABLE checks DROP COLUMN old_field;
```

**Rollback**: Cannot recover data. Restore from backup.

### Renaming a Column

**⚠️ Breaking change! Use expand-contract pattern**

**Phase 1: Add new column**

```sql
ALTER TABLE checks ADD COLUMN new_name TEXT;

-- Copy data
UPDATE checks SET new_name = old_name WHERE new_name IS NULL;
```

**Phase 2: Deploy application using both columns**

```sql
-- Application writes to both old_name and new_name
```

**Phase 3: Remove old column**

```sql
ALTER TABLE checks DROP COLUMN old_name;
```

**Alternative: Use a view**

```sql
-- Keep old column, create view with new name
CREATE VIEW checks_v2 AS
  SELECT id, old_name AS new_name, other_columns
  FROM checks;
```

### Changing Column Type

**⚠️ Risk of data loss or precision loss**

**Safe: Widening type**

```sql
-- VARCHAR(50) → VARCHAR(100): Safe
ALTER TABLE checks ALTER COLUMN code TYPE VARCHAR(100);

-- INTEGER → BIGINT: Safe
ALTER TABLE checks ALTER COLUMN count TYPE BIGINT;
```

**Risky: Narrowing type**

```sql
-- May truncate data
ALTER TABLE checks ALTER COLUMN code TYPE VARCHAR(10);

-- May lose decimal places
ALTER TABLE checks ALTER COLUMN amount TYPE INTEGER;
```

**Better: Add new column, migrate, drop old**

```sql
-- Phase 1: Add new column
ALTER TABLE checks ADD COLUMN amount_v2 INTEGER;

-- Phase 2: Migrate data with validation
UPDATE checks
SET amount_v2 = ROUND(amount)::INTEGER
WHERE amount_v2 IS NULL;

-- Verify no data loss
SELECT COUNT(*) FROM checks
WHERE amount::INTEGER != amount_v2;

-- Phase 3: Switch columns
ALTER TABLE checks DROP COLUMN amount;
ALTER TABLE checks RENAME COLUMN amount_v2 TO amount;
```

### Adding an Index

**Good: Concurrent creation (no locks)**

```sql
-- Use CONCURRENTLY to avoid blocking writes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checks_status
ON checks(status);
```

**Bad: Blocking index creation**

```sql
-- Locks table during creation
CREATE INDEX idx_checks_status ON checks(status);
```

**Note**: `CONCURRENTLY` cannot be used in a transaction block. Supabase migrations run in transactions, so you may need to:

```sql
-- If table is small (< 100k rows), regular CREATE INDEX is fine
CREATE INDEX IF NOT EXISTS idx_checks_status ON checks(status);

-- For large tables, create outside migration:
-- 1. Create migration with conditional logic
-- 2. Or run manually: psql -c "CREATE INDEX CONCURRENTLY..."
```

**Rollback: Easy**

```sql
DROP INDEX IF EXISTS idx_checks_status;
```

### Adding a Table

**Good: With IF NOT EXISTS**

```sql
CREATE TABLE IF NOT EXISTS new_feature (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_new_feature_name ON new_feature(name);

-- Add foreign keys
ALTER TABLE new_feature
ADD CONSTRAINT fk_new_feature_check
FOREIGN KEY (check_id) REFERENCES checks(id) ON DELETE CASCADE;
```

**Rollback: Safe if no data**

```sql
DROP TABLE IF EXISTS new_feature;
```

### Dropping a Table

**⚠️ Data loss! Ensure table is truly unused**

```sql
-- Verify no references
SELECT * FROM pg_constraint
WHERE confrelid = 'old_table'::regclass;

-- Drop with CASCADE if needed (removes dependent objects)
DROP TABLE IF EXISTS old_table CASCADE;
```

**Rollback**: Cannot recover data without backup.

### Updating Data

**Good: Idempotent updates**

```sql
-- Can run multiple times safely
UPDATE checks
SET status = 'completed'
WHERE status = 'done'
  AND status != 'completed';  -- Prevents re-running
```

**Good: Track previous values**

```sql
-- Save old values for potential rollback
ALTER TABLE checks ADD COLUMN status_backup TEXT;

UPDATE checks
SET status_backup = status,
    status = 'completed'
WHERE status = 'done';
```

**Rollback**

```sql
UPDATE checks
SET status = status_backup
WHERE status_backup IS NOT NULL;

ALTER TABLE checks DROP COLUMN status_backup;
```

### Adding a Foreign Key

**Good: Add without validation first**

```sql
-- Add constraint without checking existing data
ALTER TABLE checks
ADD CONSTRAINT fk_checks_assessment
FOREIGN KEY (assessment_id) REFERENCES assessments(id)
NOT VALID;

-- Then validate (can be done later)
ALTER TABLE checks
VALIDATE CONSTRAINT fk_checks_assessment;
```

**Bad: Blocks table during validation**

```sql
-- Locks table while checking all rows
ALTER TABLE checks
ADD CONSTRAINT fk_checks_assessment
FOREIGN KEY (assessment_id) REFERENCES assessments(id);
```

## Testing Migrations

### Local Testing

```bash
# Reset database and apply all migrations
supabase db reset

# Check specific table
psql -h localhost -p 54322 -d postgres -U postgres -c "\d+ checks"

# Verify data
psql -h localhost -p 54322 -d postgres -U postgres -c "SELECT * FROM checks LIMIT 5;"

# Run application tests
npm run test
npm run test:e2e
```

### CI Testing

Pull requests automatically:

1. Create branch from production database
2. Apply your migration to the branch
3. Run E2E tests against migrated database
4. Cleanup branch

View test results in GitHub Actions.

## Migration Naming

Use descriptive names with YYYYMMDD prefix:

**Good**

- `20251108_add_element_instances_table.sql`
- `20251108_add_status_index_to_checks.sql`
- `20251108_migrate_old_status_values.sql`

**Bad**

- `20251108_update.sql`
- `20251108_fix.sql`
- `20251108_changes.sql`

## Migration File Template

```sql
-- Migration: [Brief description]
-- Date: YYYY-MM-DD
-- Author: [Your name]
--
-- Description:
-- [Detailed description of what this migration does]
--
-- Rollback:
-- [Describe how to rollback if needed]
--
-- Related:
-- - Issue: #123
-- - PR: #456

-- Example: Add element_instances table for tracking building elements

BEGIN;

-- Create table
CREATE TABLE IF NOT EXISTS element_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  element_group_id UUID NOT NULL REFERENCES element_groups(id),
  label TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique labels per assessment/element
  CONSTRAINT unique_element_instance_label
    UNIQUE (assessment_id, element_group_id, label)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_element_instances_assessment
  ON element_instances(assessment_id);

CREATE INDEX IF NOT EXISTS idx_element_instances_element_group
  ON element_instances(element_group_id);

-- Add helpful comment
COMMENT ON TABLE element_instances IS 'Stores individual instances of building elements (doors, ramps, etc.) for assessments';

COMMIT;

-- Rollback instructions:
-- DROP TABLE IF EXISTS element_instances CASCADE;
```

## Common Pitfalls

### 1. Forgetting IF NOT EXISTS

**Problem**: Migration fails on retry

```sql
CREATE TABLE my_table (...);  -- Fails if table exists
```

**Solution**:

```sql
CREATE TABLE IF NOT EXISTS my_table (...);
```

### 2. Not Using Transactions

**Problem**: Partial migration on error

**Solution**: Wrap in BEGIN/COMMIT (Supabase does this automatically)

### 3. Blocking Writes

**Problem**: Long-running migration locks table

**Solutions**:

- Use `CONCURRENTLY` for indexes
- Add `NOT VALID` for foreign keys
- Break large data migrations into batches

### 4. No Rollback Plan

**Problem**: Can't undo changes when issues arise

**Solution**: Document rollback steps in migration file

### 5. Changing Existing Migrations

**Problem**: Drift between environments

**Solution**: Never edit committed migrations. Create new migration to fix.

## Performance Considerations

### Indexes

- Indexes speed up reads but slow down writes
- Monitor query performance before/after
- Drop unused indexes

### Large Data Migrations

For tables with millions of rows:

```sql
-- Bad: Updates all rows at once (locks table)
UPDATE checks SET status = 'new' WHERE status = 'old';

-- Better: Batch updates
DO $$
DECLARE
  batch_size INT := 10000;
  affected INT;
BEGIN
  LOOP
    UPDATE checks
    SET status = 'new'
    WHERE id IN (
      SELECT id FROM checks
      WHERE status = 'old'
      LIMIT batch_size
    );

    GET DIAGNOSTICS affected = ROW_COUNT;
    EXIT WHEN affected = 0;

    -- Brief pause between batches
    PERFORM pg_sleep(0.1);
  END LOOP;
END $$;
```

## Emergency Procedures

### Migration Fails in CI

1. Check GitHub Actions logs for error
2. Fix migration SQL locally
3. Test with `supabase db reset`
4. Push fix
5. CI will retry automatically

### Migration Fails in Production

See `.github/MIGRATION_ROLLBACK.md` for detailed procedures.

Quick steps:

1. Check Supabase logs for error
2. Determine if application is affected
3. Choose rollback strategy (app only vs. forward migration)
4. Execute rollback
5. Verify with health check

## Getting Help

- **Supabase Docs**: https://supabase.com/docs/guides/database/migrations
- **PostgreSQL Docs**: https://www.postgresql.org/docs/current/ddl.html
- **Team Slack**: #engineering-help
- **Migration Rollback**: See `.github/MIGRATION_ROLLBACK.md`

## Checklist Before Merging

- [ ] Migration tested locally with `supabase db reset`
- [ ] Application works with migrated schema
- [ ] E2E tests pass
- [ ] Migration is idempotent (can run multiple times)
- [ ] Rollback plan documented
- [ ] No breaking changes (or expand-contract pattern used)
- [ ] CI tests pass
- [ ] Code review approved
