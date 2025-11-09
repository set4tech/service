# Supabase Branching Investigation

## Issue Discovered

The `supabase db push --db-url` approach requires a PostgreSQL connection string, but `supabase branches get` may not provide this in a format we can use.

## Current Problem

```bash
# This returns an HTTPS URL, not a PostgreSQL connection string
supabase branches get $BRANCH_NAME --output json | jq -r '.api_url'
# Returns: https://tbtmsuigxwmrphhewofk.supabase.co

# But we need something like:
# postgresql://postgres.xxx:[password]@xxx.pooler.supabase.com:6543/postgres
```

## Investigation Steps

Please run this command and share the full output:

```bash
supabase branches get test-local-123 --output json | jq
```

We need to find:

1. Does it provide a `.database.connection_string` field?
2. Does it provide database credentials separately?
3. What fields are actually available?

## Alternative Approaches

### Option 1: Use Supabase Management API

Instead of CLI, use the Supabase Management API to:

1. Create branch
2. Get branch credentials
3. Apply migrations via connection string

### Option 2: Use GitHub Actions with Supabase Integration

Use Supabase's official GitHub Actions:

- `supabase/setup-cli@v1` (already using)
- May have built-in branch support

### Option 3: Local Database Testing

Instead of testing on production branches:

1. Start local Supabase: `supabase start`
2. Reset and seed with production-like data
3. Apply migrations
4. Run E2E tests
5. Then apply to production if pass

This is more traditional and may be more reliable.

### Option 4: Preview Environments

Use Supabase Preview Environments (if available):

- Automatically created for PRs
- May have better CLI integration

## Recommended Next Step

Run this command and share the output:

```bash
BRANCH_NAME="test-$(date +%s)"
supabase branches create $BRANCH_NAME
supabase branches get $BRANCH_NAME --output json | jq
supabase branches delete $BRANCH_NAME --force
```

This will help us determine the correct approach.

## Temporary Workaround

For now, we could modify the workflow to:

1. Create the branch (for testing purpose)
2. Skip migration application to branch
3. Run E2E tests against **local database** with migrations applied
4. If tests pass, apply migrations to production

This gives us most of the safety benefits without the branching complexity.
