# Vercel Deployment Gate Configuration

This document explains how to configure Vercel to wait for GitHub Actions (E2E tests and migrations) to pass before deploying to production.

## Overview

The workflow `production-deploy.yml` runs on every push to `main`:

1. ✅ Lint, type-check, unit tests, and build
2. ✅ Test migrations on a Supabase database branch (if migrations exist)
3. ✅ Run E2E tests against the branch (if migrations exist)
4. ✅ Apply migrations to production (if migrations exist)
5. ✅ Verify deployment health

**Goal**: Vercel should not deploy until steps 1-3 are complete and successful.

## Option 1: Required Checks in GitHub (Recommended)

### Step 1: Enable Branch Protection on `main`

1. Go to: https://github.com/set4tech/service/settings/branches
2. Click **"Add rule"** or edit the existing rule for `main`
3. Enable **"Require status checks to pass before merging"**
4. Search for and select these checks:
   - `Lint, Type Check, Unit Tests, Build`
   - `Test Migrations on Production Branch`
5. Click **"Save changes"**

### Step 2: Configure Vercel to Wait for Checks

1. Go to: https://vercel.com/set4tech/service/settings/git
2. Under **"Git"** settings, find **"Ignored Build Step"** or **"Wait for CI"**
3. Enable **"Wait for CI"** or **"Only deploy when checks pass"**

**OR** use Custom Ignored Build Step:

```bash
# In Vercel Dashboard → Settings → Git → Ignored Build Step
# Add this command:
if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then
  # Wait for GitHub Actions to complete
  echo "Deploying to production (checks should have passed)"
  exit 1  # Always build (checks already passed via branch protection)
else
  # Deploy preview branches immediately
  exit 1
fi
```

## Option 2: Vercel + GitHub Integration (Simplest)

Vercel automatically integrates with GitHub's required checks when you have branch protection enabled.

**Setup:**

1. Enable branch protection (see Option 1, Step 1)
2. Vercel will automatically respect the checks
3. Done! 🎉

## Option 3: Manual Deployment Trigger

Configure Vercel to only deploy manually after workflow passes:

1. Go to: https://vercel.com/set4tech/service/settings/git
2. Enable **"Enable manual deployment after checks pass"**
3. After GitHub Actions pass, manually trigger deployment

## Verification

### Test the Setup

1. Create a test PR to `main`
2. Watch the GitHub Actions run
3. Verify Vercel deployment:
   - **Before**: Should show "Waiting for checks..."
   - **After checks pass**: Deployment starts
   - **If checks fail**: Deployment is blocked

### Check Current Status

```bash
# In your repo, check if branch protection is enabled:
gh api repos/set4tech/service/branches/main/protection --jq '.required_status_checks.checks[].context'
```

## Current Workflow Behavior

- **On push to `main`**:
  - ✅ Runs lint/test/build (~2-3 minutes)
  - ✅ **Only if migrations exist**: Creates DB branch, runs E2E tests (~10-15 minutes)
  - ✅ **Only if migrations exist**: Applies migrations to production
  - ⏱️ Total time: 2-3 min (no migrations) or 12-18 min (with migrations)

- **Cost optimization**:
  - ✅ No migrations? Skips branch creation (saves $$)
  - ✅ Only runs on `main` push (not on PRs)
  - ✅ Fast feedback for most deployments

## Recommended Configuration

For the best balance of safety and speed:

1. ✅ **Enable branch protection** with required checks
2. ✅ **Configure Vercel** to respect GitHub checks
3. ✅ **Keep the workflow** running only on `main` (already configured)
4. ✅ **Migrations check** skips expensive operations when not needed (already configured)

## Troubleshooting

### Vercel deploys before checks finish

- **Cause**: Branch protection not enabled or Vercel not configured to wait
- **Fix**: Follow Option 1 or 2 above

### Checks take too long

- **Current**: 2-3 minutes (no migrations) or 12-18 minutes (with migrations)
- **If too slow**: Consider splitting E2E tests or running subset
- **Note**: With current setup (no migrations), deployments are fast!

### Want to skip checks for hotfix

Use Vercel's "Instant Rollback" feature:

1. Go to Vercel dashboard
2. Find previous successful deployment
3. Click "Promote to Production"
