# Testing the CI/CD Workflow

## Overview

This guide walks through testing the complete CI/CD workflow to ensure migrations are tested before production deployment.

## Prerequisites

Before testing:

- [ ] Supabase CLI installed and authenticated locally
- [ ] GitHub secrets configured (see `GITHUB_SECRETS.md`)
- [ ] Branch protection enabled on `main` (see `BRANCH_PROTECTION_SETUP.md`)
- [ ] Production workflow created (`.github/workflows/production-deploy.yml`)

## Important Note

The Supabase CLI does **not** have a `--branch` flag for `db push`. Instead, our workflow uses `--db-url` with the branch's PostgreSQL connection string. The workflow handles this automatically, but if testing locally, use:

```bash
# Get branch PostgreSQL connection string
BRANCH_DB_URL=$(supabase branches get $BRANCH_NAME --output json | jq -r '.POSTGRES_URL')

# Apply migrations to branch
supabase db push --db-url "$BRANCH_DB_URL"
```

## Test 1: PR Workflow (Non-Main Branch)

This test verifies migrations are tested on a production branch without affecting production.

### Step 1: Create Test Branch

```bash
# Ensure you're on main and up to date
git checkout main
git pull origin main

# Create test branch
git checkout -b test/ci-workflow-validation
```

### Step 2: Create Test Migration

```bash
# Create a simple test migration
cat > supabase/migrations/$(date +%Y%m%d)_test_ci_workflow.sql << 'EOF'
-- Test migration for CI/CD validation
-- This migration adds a test column that will be removed later

BEGIN;

-- Add test column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS test_ci_column TEXT;

-- Add a comment
COMMENT ON COLUMN projects.test_ci_column IS 'Test column for CI/CD validation - will be removed';

COMMIT;

-- Rollback instructions:
-- ALTER TABLE projects DROP COLUMN IF EXISTS test_ci_column;
EOF
```

### Step 3: Commit and Push

```bash
# Stage and commit
git add supabase/migrations/
git commit -m "test: Add test migration for CI/CD validation"

# Push to GitHub
git push origin test/ci-workflow-validation
```

### Step 4: Open Pull Request

1. Go to GitHub repository
2. Click "Pull requests" → "New pull request"
3. Base: `main`, Compare: `test/ci-workflow-validation`
4. Click "Create pull request"
5. Add description: "Testing CI/CD workflow with test migration"
6. Create PR

### Step 5: Monitor CI Workflow

Watch the GitHub Actions workflow:

1. Go to "Actions" tab in GitHub
2. Find the workflow run for your PR
3. Observe the jobs executing:

**Expected Execution Order**:

```
lint-and-build (2-3 min)
  ├─ Checkout code
  ├─ Install dependencies
  ├─ Run linter ✓
  ├─ Type check ✓
  ├─ Run unit tests ✓
  └─ Build ✓

test-migrations-on-prod-branch (10-15 min)
  ├─ Setup Supabase CLI
  ├─ Create database branch ✓
  ├─ Apply migrations to branch ✓
  ├─ Get branch connection details ✓
  ├─ Install Playwright ✓
  ├─ Run E2E tests against branch ✓
  └─ Cleanup branch ✓

apply-migrations-to-production (SKIPPED - not main branch)

verify-deployment (SKIPPED - not main branch)
```

### Step 6: Verify Success

Check that:

- [ ] Both jobs completed successfully (green checkmarks)
- [ ] Database branch was created and deleted
- [ ] E2E tests passed
- [ ] No changes to production database
- [ ] Playwright report uploaded (if tests failed)

**View Logs**:

- Click on each job to see detailed logs
- Verify branch creation: "🌿 Creating database branch"
- Verify migration application: "📦 Applying migrations"
- Verify tests: "🧪 Running E2E tests"
- Verify cleanup: "🧹 Cleaning up database branch"

### Step 7: Merge PR (Optional)

If you want to test the full workflow:

1. Click "Merge pull request" (after CI passes)
2. Confirm merge
3. Proceed to **Test 2** below

Or cleanup:

```bash
# Close PR without merging
# Delete branch from GitHub UI

# Locally switch back to main
git checkout main
git branch -D test/ci-workflow-validation
```

**✅ Test 1 Complete**: PR workflow tested successfully

---

## Test 2: Production Deploy (Main Branch)

This test verifies migrations are applied to production after testing.

### Prerequisites

- Test 1 completed and PR merged, OR
- Create new branch and merge following Test 1 steps

### Step 1: Merge to Main

If continuing from Test 1:

- PR should already be merged
- Skip to Step 2

If starting fresh:

- Follow Test 1 steps 1-6
- Merge the PR in GitHub UI

### Step 2: Monitor Production Workflow

After merge, watch for new workflow run:

1. Go to "Actions" tab
2. Find the workflow run for the `main` branch push
3. Observe all 4 jobs execute:

**Expected Execution Order**:

```
lint-and-build (2-3 min)
  └─ (same as Test 1) ✓

test-migrations-on-prod-branch (10-15 min)
  └─ (same as Test 1) ✓

apply-migrations-to-production (1-2 min) ← NEW!
  ├─ Setup Supabase CLI ✓
  ├─ Link to production ✓
  ├─ Apply migrations to PRODUCTION ✓
  └─ Create deployment marker ✓

verify-deployment (2-3 min) ← NEW!
  ├─ Wait for Vercel deployment ✓
  ├─ Health check production ✓
  └─ Deployment successful ✓
```

### Step 3: Verify Production Changes

**Check Database**:

```bash
# Connect to production via Supabase CLI
supabase link --project-ref <YOUR_PROD_PROJECT_REF>

# Verify migration was applied
supabase db diff

# Should show: "No schema changes detected" (migration already applied)

# Or check directly via SQL
psql -h <your-prod-host> -d postgres -U postgres -c "\d projects"
# Should see test_ci_column
```

**Check Application**:

1. Visit your production URL
2. Navigate to `/api/health`
3. Should see: `{"status":"healthy",...}`

**Check Vercel**:

1. Go to Vercel dashboard
2. Check latest deployment
3. Should show successful deployment after migration

### Step 4: Verify Logs

In GitHub Actions logs for `apply-migrations-to-production`:

```
🔐 Logging into Supabase...
🔗 Linking to production project...
🚀 Applying migrations to PRODUCTION database...
   This will apply all pending migrations from supabase/migrations/
✅ Production migrations applied successfully
```

In `verify-deployment` logs:

```
⏳ Waiting 90 seconds for Vercel to deploy...
🏥 Running health check on production...
Attempt 1/3...
✅ Production is healthy (HTTP 200)
🎉 Deployment complete and verified!
```

**✅ Test 2 Complete**: Production deployment tested successfully

---

## Test 3: Rollback Migration

This test verifies the rollback process using a forward migration.

### Step 1: Create Rollback Branch

```bash
git checkout main
git pull origin main
git checkout -b test/rollback-ci-workflow
```

### Step 2: Create Rollback Migration

```bash
# Create rollback migration (removes test column)
cat > supabase/migrations/$(date +%Y%m%d)_rollback_test_ci_workflow.sql << 'EOF'
-- Rollback test migration
-- This removes the test column added in previous migration

BEGIN;

-- Remove test column
ALTER TABLE projects DROP COLUMN IF EXISTS test_ci_column;

COMMIT;

-- This rollback can be "rolled back" by re-adding the column:
-- ALTER TABLE projects ADD COLUMN IF NOT EXISTS test_ci_column TEXT;
EOF
```

### Step 3: Push and Create PR

```bash
git add supabase/migrations/
git commit -m "rollback: Remove test CI column"
git push origin test/rollback-ci-workflow
```

Create PR in GitHub UI.

### Step 4: Verify Rollback Tests

Watch CI workflow:

- [ ] Migrations tested on branch (includes rollback)
- [ ] E2E tests pass with column removed
- [ ] No errors in test execution

### Step 5: Merge Rollback

1. Merge PR after CI passes
2. Watch production deployment
3. Verify column removed from production

**Verify**:

```bash
# Check production database
psql -h <your-prod-host> -d postgres -U postgres -c "\d projects"
# Should NOT see test_ci_column
```

**✅ Test 3 Complete**: Rollback procedure tested successfully

---

## Test 4: Failed Migration (Error Handling)

This test verifies the workflow handles migration errors correctly.

### Step 1: Create Intentionally Broken Migration

```bash
git checkout main
git pull origin main
git checkout -b test/failed-migration
```

Create a migration with an error:

```bash
cat > supabase/migrations/$(date +%Y%m%d)_intentional_error.sql << 'EOF'
-- This migration will fail intentionally

BEGIN;

-- Try to add NOT NULL column without default (will fail if table has rows)
ALTER TABLE projects ADD COLUMN required_field TEXT NOT NULL;

COMMIT;
EOF
```

### Step 2: Push and Create PR

```bash
git add supabase/migrations/
git commit -m "test: Intentional migration error"
git push origin test/failed-migration
```

### Step 3: Watch CI Fail

Expected behavior:

```
lint-and-build ✓

test-migrations-on-prod-branch ✗
  ├─ Create database branch ✓
  ├─ Apply migrations to branch ✗ (FAILS HERE)
  │   Error: column "required_field" contains null values
  └─ Cleanup branch ✓ (still runs)

apply-migrations-to-production (SKIPPED - previous job failed)

verify-deployment (SKIPPED - previous job failed)
```

### Step 4: Verify Protection

Check that:

- [ ] Migration error caught in test phase
- [ ] Production was NOT affected
- [ ] Branch cleanup still occurred
- [ ] PR cannot be merged (red X next to checks)
- [ ] Clear error message in logs

**This is the key value**: Bad migrations are caught before production!

### Step 5: Fix and Retry

```bash
# Fix the migration
cat > supabase/migrations/$(date +%Y%m%d)_intentional_error.sql << 'EOF'
-- Fixed migration

BEGIN;

-- Add column with default
ALTER TABLE projects ADD COLUMN required_field TEXT DEFAULT 'default_value';

COMMIT;
EOF

git add supabase/migrations/
git commit -m "fix: Add default value to required_field"
git push origin test/failed-migration
```

Watch CI retry automatically and pass.

**✅ Test 4 Complete**: Error handling verified

---

## Test 5: Health Check Failure

Test the health check safety net.

### Prerequisites

Temporarily break the health check to test monitoring.

### Step 1: Comment Out Health Endpoint (Don't Actually Do This)

This is theoretical - demonstrates what would happen if deploy succeeded but app was broken.

### Step 2: Expected Behavior

If health check fails:

```
verify-deployment ✗
  ├─ Wait for Vercel deployment ✓
  ├─ Health check production ✗
  │   Attempt 1/3...
  │   ⚠️  Health check returned: 503
  │   Retrying in 30 seconds...
  │   Attempt 2/3...
  │   ⚠️  Health check returned: 503
  │   Retrying in 30 seconds...
  │   Attempt 3/3...
  │   ⚠️  Health check returned: 503
  └─ ✗ Production health check failed after 3 attempts
```

Workflow would fail, alerting you to issues even though deploy "succeeded".

**✅ Test 5 Complete**: Health check monitoring verified

---

## Verification Checklist

After completing all tests:

- [ ] PR workflow tests migrations without touching production
- [ ] Main push applies migrations to production
- [ ] Vercel deploys after migrations
- [ ] Health check validates deployment
- [ ] Rollback procedure works via forward migration
- [ ] Failed migrations caught before production
- [ ] Branch cleanup always happens
- [ ] CI logs are clear and helpful

## Troubleshooting

### Supabase Branch Creation Fails

**Error**: "Database branching not available"

**Solution**:

- Check Supabase plan (Pro or higher required)
- Verify `SUPABASE_ACCESS_TOKEN` is correct
- Check project ref matches production

### E2E Tests Timeout

**Error**: "Test timeout exceeded"

**Solution**:

- Check Playwright config has CI timeouts
- Verify dev server started successfully
- Check E2E test assertions aren't too strict

### Health Check Fails

**Error**: "Production health check failed"

**Solution**:

- Verify production URL in workflow is correct
- Check `/api/health` endpoint exists and works
- Increase wait time in workflow (currently 90s)

### Branch Not Cleaned Up

**Error**: Old CI branches visible in Supabase

**Solution**:

- Check cleanup step ran in workflow
- Manually delete: `supabase branches delete <branch-name>`
- Verify `--force` flag is used in cleanup

## Next Steps

After successful testing:

1. Document any issues encountered
2. Adjust timeouts if needed
3. Train team on workflow
4. Monitor first few real deployments closely
5. Iterate on process based on feedback

## Success Criteria

All tests passing means:

✅ Migrations are safe to deploy
✅ Production is protected
✅ Rollbacks are straightforward
✅ CI/CD pipeline is reliable
✅ Team can deploy with confidence
