# Database Migrations

**Clean slate as of 2025-11-09**

## Creating New Migrations

Always use the Supabase CLI to create migrations with proper timestamps:

```bash
# Create a new migration
supabase migration new your_migration_name

# This creates: supabase/migrations/YYYYMMDDHHMISS_your_migration_name.sql
# Example: 20251109143022_add_new_column.sql
```

## Important Rules

1. **Always use `supabase migration new`** - Never create migration files manually
2. **Never reuse timestamps** - Each migration gets a unique timestamp
3. **Test locally first** - Run `supabase db reset` locally before pushing
4. **Idempotent migrations** - Use `IF EXISTS`, `IF NOT EXISTS` for safety

## Migration Workflow

```bash
# 1. Create migration
supabase migration new add_feature_x

# 2. Edit the generated file
# Add your SQL changes

# 3. Test locally
supabase db reset  # Resets local DB and applies all migrations

# 4. Commit and push
git add supabase/migrations/
git commit -m "feat: add feature X migration"
git push
```

## CI/CD Behavior

- **On PR to main**: CI creates a test database branch and applies migrations
- **On merge to main**: Migrations are automatically applied to production
- **Failures**: CI will fail if migrations have errors or conflicts

## Historical Migrations

All migrations before 2025-11-09 are archived in `migrations_archive/`. They were already applied to production and should not be modified or re-run.

## Troubleshooting

**Problem**: "duplicate key value violates unique constraint"

- **Cause**: Two migrations have the same timestamp
- **Fix**: Always use `supabase migration new` to avoid this

**Problem**: "Remote migration versions not found"

- **Cause**: Local migration file renamed after being applied to remote
- **Fix**: Never rename migration files after they've been applied

**Problem**: Need to rollback a migration

- **Solution**: Create a new migration that reverses the changes
- **Never**: Delete or modify existing migration files
