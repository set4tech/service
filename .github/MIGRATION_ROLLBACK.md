# Migration Rollback Procedure

## Overview

Supabase uses **forward-only migrations**. This means migrations are never "undone" - instead, you create a new migration that reverses the changes.

## When to Rollback

Consider rolling back when you encounter:

- **Application errors** related to schema changes
- **Data integrity issues** caused by migration
- **Performance degradation** after deployment
- **Failed health checks** in production
- **Breaking changes** affecting critical features

## Rollback Options

### Option 1: Application Rollback (Instant, Preferred)

**For non-breaking schema changes**, rollback the application only:

1. Go to Vercel Dashboard → Deployments
2. Find the previous successful deployment (before the problematic one)
3. Click "..." → "Promote to Production"
4. Vercel instantly switches traffic to the old version

**Important**: This **does NOT** rollback database changes. The old application code must be compatible with the new schema.

**Use when**:

- New columns were added (old code ignores them)
- New tables were added (not used by old code)
- Indexes were added (transparent to application)

### Option 2: Forward Rollback Migration (Recommended for Schema Changes)

Create a new migration that reverses the problematic changes.

**Example 1: Rolling back a column addition**

Original migration (`20251108_add_status_column.sql`):

```sql
ALTER TABLE checks ADD COLUMN new_status TEXT;
```

Rollback migration (`20251108_remove_status_column.sql`):

```sql
ALTER TABLE checks DROP COLUMN IF EXISTS new_status;
```

**Example 2: Rolling back a data migration**

Original migration (`20251108_update_statuses.sql`):

```sql
UPDATE checks
SET status = 'completed'
WHERE status = 'done';
```

Rollback migration (`20251108_revert_statuses.sql`):

```sql
UPDATE checks
SET status = 'done'
WHERE status = 'completed';
```

**How to apply rollback migration**:

1. Create the new rollback migration file
2. Test locally: `supabase db reset`
3. Commit and push to `main`
4. CI/CD pipeline will:
   - Test the rollback migration on a prod branch
   - Apply to production if tests pass

### Option 3: Emergency Recovery (Last Resort)

**For catastrophic data corruption only**. Requires downtime and data loss.

#### Point-in-Time Restore

1. Go to Supabase Dashboard → Database → Backups
2. Select a backup from before the problematic migration
3. Click "Restore"
4. **Warning**: All data changes after the backup will be lost

#### Manual Data Recovery

If you need to preserve recent data:

1. Export recent data: `pg_dump` critical tables
2. Restore from backup point
3. Manually merge exported data
4. Verify data integrity

**Coordinate with team before using this option.**

## Rollback Decision Tree

```
Is the application broken?
├─ Yes: Can old code work with new schema?
│  ├─ Yes → Vercel rollback only (Option 1)
│  └─ No → Forward rollback migration (Option 2)
└─ No: Is there data corruption?
   ├─ Yes: How bad?
   │  ├─ Fixable → Forward migration to repair (Option 2)
   │  └─ Catastrophic → Emergency restore (Option 3)
   └─ No: Monitor and decide
```

## Prevention is Better Than Cure

### Write Reversible Migrations

**Good Examples** (easily reversed):

```sql
-- Adding a column (can DROP COLUMN)
ALTER TABLE checks ADD COLUMN new_field TEXT;

-- Adding a table (can DROP TABLE)
CREATE TABLE new_feature (
  id UUID PRIMARY KEY,
  data TEXT
);

-- Adding an index (can DROP INDEX)
CREATE INDEX idx_checks_status ON checks(status);

-- Updating data (can UPDATE back)
UPDATE checks SET status = 'new' WHERE status = 'old';
```

**Risky Examples** (data loss on reversal):

```sql
-- Dropping a column (data lost)
ALTER TABLE checks DROP COLUMN important_data;

-- Dropping a table (data lost)
DROP TABLE legacy_feature;

-- Altering column type (may lose precision)
ALTER TABLE checks ALTER COLUMN amount TYPE INTEGER;

-- Deleting data
DELETE FROM checks WHERE status = 'old';
```

### Expand-Contract Pattern for Breaking Changes

For changes that can't be reversed without data loss:

**Phase 1: Expand** (non-breaking)

```sql
-- Add new column alongside old one
ALTER TABLE checks ADD COLUMN status_v2 TEXT;
```

Deploy application that writes to both columns.

**Phase 2: Migrate** (after application deployed)

```sql
-- Copy data from old to new
UPDATE checks SET status_v2 = status WHERE status_v2 IS NULL;
```

**Phase 3: Contract** (after verification)

```sql
-- Remove old column
ALTER TABLE checks DROP COLUMN status;
ALTER TABLE checks RENAME COLUMN status_v2 TO status;
```

Each phase is deployed separately, allowing rollback at any point.

## Testing Rollbacks

Always test rollback migrations locally:

```bash
# Start with clean slate
supabase db reset

# Apply the problematic migration
# Verify it works

# Apply the rollback migration
# Verify it reverses the changes

# Check data integrity
psql -h localhost -p 54322 -d postgres -U postgres
```

## Common Rollback Scenarios

### Scenario 1: New Column Causes Errors

**Problem**: Added a NOT NULL column without default

**Quick fix**:

```sql
-- Make column nullable
ALTER TABLE checks ALTER COLUMN new_field DROP NOT NULL;
```

### Scenario 2: Renamed Column

**Problem**: Application uses old column name

**Quick fix**:

```sql
-- Rename back
ALTER TABLE checks RENAME COLUMN new_name TO old_name;
```

### Scenario 3: Index Slowing Down Writes

**Problem**: New index is too large, slowing inserts

**Quick fix**:

```sql
-- Drop the index
DROP INDEX IF EXISTS idx_problematic_index;
```

### Scenario 4: Bad Data Migration

**Problem**: UPDATE statement modified wrong rows

**Rollback**:

```sql
-- Restore from previous values (if tracked)
-- Or restore specific rows from backup
```

## Verification After Rollback

1. **Health Check**: Visit `/api/health` endpoint
2. **Smoke Test**: Manually test critical features
3. **Monitor Logs**: Check Vercel and Supabase logs for errors
4. **Run E2E Tests**: `npm run test:e2e` locally
5. **Check Metrics**: Verify application metrics are normal

## Tools You Should Never Use (Unless Emergency)

### `supabase migration repair`

- Manually edits migration history
- Can cause inconsistencies between environments
- Only use if migration table is corrupted
- **Requires team discussion first**

### Direct SQL on Production

- Bypasses migration tracking
- Creates drift between environments
- Makes it impossible to reproduce setup
- **Document any manual changes immediately**

## Communication Template

When performing a rollback, notify the team:

```
🚨 Production Rollback in Progress

Migration: 20251108_add_new_feature.sql
Issue: [describe the problem]
Action: [Vercel rollback / Forward migration / Emergency restore]
ETA: [time estimate]
Impact: [downtime / degraded performance / none]
Status: [in progress / complete / failed]
```

## Post-Rollback Actions

1. **Document What Happened**: Add notes to migration file
2. **Update Tests**: Add E2E test covering the issue
3. **Review Process**: How did the issue reach production?
4. **Fix and Redeploy**: Address root cause before trying again

## Emergency Contacts

- **Vercel Status**: https://www.vercel-status.com/
- **Supabase Status**: https://status.supabase.com/
- **Team Slack**: #engineering-alerts

## Additional Resources

- [Supabase Migrations Docs](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [Database Migration Best Practices](https://www.postgresql.org/docs/current/ddl-alter.html)
- [Zero-Downtime Deployments](https://github.com/supabase/supabase/discussions/4242)
