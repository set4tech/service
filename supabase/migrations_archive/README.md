# Archived Migrations

**DO NOT USE THESE FILES**

This directory contains historical migrations that were already applied to production databases before proper migration tracking was established.

These migrations have inconsistent naming (duplicate date prefixes) and incomplete tracking in the `schema_migrations` table. They are kept for historical reference only.

## Migration History

All migrations in this directory were applied to production before 2025-11-09. The production database schema is considered the source of truth.

## Going Forward

New migrations should be created in the `migrations/` directory with:

- Unique timestamp format: `YYYYMMDDHHMM_description.sql`
- Example: `202511091430_add_new_feature.sql`
- Use `supabase migration new <name>` to create properly formatted migrations

## If You Need These Migrations

If setting up a **completely new database from scratch**, these migrations are likely incomplete and inconsistent. Instead:

1. Use `supabase db pull` to get the current production schema
2. Apply that as your baseline
3. Apply new migrations from `migrations/` directory

## Archive Date

2025-11-09
