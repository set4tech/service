# GitHub Branch Protection Setup

## Overview

Configure branch protection rules for the `main` branch to ensure migrations are tested before production deployment.

## Setup Steps

### 1. Navigate to Branch Protection Settings

1. Go to your GitHub repository: `https://github.com/set4tech/service`
2. Click **Settings** tab
3. Click **Branches** in the left sidebar
4. Under "Branch protection rules", click **Add rule**

### 2. Configure Branch Name Pattern

- **Branch name pattern**: `main`

### 3. Enable Required Status Checks

Check these boxes:

- [x] **Require status checks to pass before merging**

  Select the following status checks (they will appear after first workflow run):
  - `lint-and-build`
  - `test-migrations-on-prod-branch`

- [x] **Require branches to be up to date before merging**
  - This ensures the branch has the latest migrations before merge

### 4. Enable Additional Protection (Recommended)

- [x] **Require a pull request before merging**
  - **Required approvals**: 1 (or 0 if solo developer)
- [x] **Require conversation resolution before merging**
  - Ensures all review comments are addressed

- [ ] **Require signed commits** (optional)
  - Only if you're using GPG signing

- [x] **Require linear history** (optional but recommended)
  - Prevents merge commits, enforces rebase or squash

- [x] **Include administrators**
  - Enforces rules even for repo admins

### 5. Enable Force Push Protection

- [x] **Do not allow bypassing the above settings**
- [x] **Do not allow force pushes**
- [x] **Do not allow deletions**

### 6. Save Protection Rule

Click **Create** or **Save changes** at the bottom

## What These Rules Prevent

### Without Branch Protection

```
Developer → Push to main → Breaks production
```

### With Branch Protection

```
Developer → Create PR → CI tests migrations → Tests pass → Merge → Deploy
                                         ↓
                                    Tests fail → Fix required
```

## Testing the Protection

### Test 1: Try to Push Directly to Main

```bash
git checkout main
git commit --allow-empty -m "test: direct push"
git push origin main
```

**Expected Result**: Push rejected with message about branch protection

### Test 2: Create PR Without Tests Passing

1. Create a branch with a broken migration
2. Open PR to main
3. Try to merge

**Expected Result**: Merge button disabled until CI passes

### Test 3: Valid PR Workflow

1. Create branch: `git checkout -b feat/test-protection`
2. Add a small test migration
3. Push and open PR
4. Wait for CI to pass
5. Merge button becomes available

**Expected Result**: Can merge after tests pass

## Status Checks Reference

### lint-and-build

- Runs linter
- Type checks TypeScript
- Runs unit tests
- Verifies build succeeds

**Time**: ~2-3 minutes

### test-migrations-on-prod-branch

- Creates Supabase branch from production
- Applies pending migrations
- Runs E2E tests against migrated database
- Cleans up branch

**Time**: ~10-15 minutes

## Troubleshooting

### "Required status checks not found"

**Cause**: Status checks only appear after first workflow run

**Solution**:

1. Trigger the workflow by pushing to a branch
2. After workflow completes, status checks will appear
3. Edit branch protection rule to select them

### "Cannot merge: required status check is failing"

**Cause**: CI tests failed

**Solution**:

1. Click "Details" next to failing check
2. Review GitHub Actions logs
3. Fix the issue locally
4. Push fix to branch
5. CI will re-run automatically

### "Merge button says: Review required"

**Cause**: Pull request review is required

**Solution**:

1. Request review from team member
2. Or adjust protection rules to require 0 reviews

### "Cannot push to main"

**Cause**: Direct pushes are blocked

**Solution**:

1. Create a feature branch
2. Open PR
3. Merge via PR after CI passes

## Bypassing Protection (Emergency Only)

If you absolutely must bypass protection (e.g., emergency hotfix):

1. Go to Settings → Branches
2. Edit the branch protection rule
3. Temporarily uncheck "Include administrators"
4. Make your emergency push
5. **Immediately re-enable** the protection

**⚠️ Always document emergency bypasses in team chat**

## Recommended Team Workflow

### For Individual Contributors

```bash
# 1. Create feature branch
git checkout -b feat/your-feature

# 2. Make changes and commit
git add .
git commit -m "feat: your feature"

# 3. Push to GitHub
git push origin feat/your-feature

# 4. Open PR via GitHub UI
# 5. Wait for CI to pass
# 6. Request review (if required)
# 7. Merge via GitHub UI
```

### For Urgent Fixes

```bash
# 1. Create hotfix branch
git checkout -b hotfix/critical-issue

# 2. Make minimal fix
git add .
git commit -m "fix: critical issue"

# 3. Push and open PR
git push origin hotfix/critical-issue

# 4. Monitor CI closely
# 5. Merge immediately after CI passes
```

## Benefits of Branch Protection

1. **Prevents Broken Deployments**
   - Migrations tested before production
   - E2E tests catch integration issues

2. **Maintains Code Quality**
   - Linting and type checks enforced
   - Unit tests must pass

3. **Enables Confident Merging**
   - Green checkmarks = safe to deploy
   - No guesswork about safety

4. **Provides Audit Trail**
   - All changes go through PR
   - CI logs available for review

5. **Catches Issues Early**
   - Failed CI on PR, not on production
   - Easy to fix before merge

## Next Steps

After configuring branch protection:

1. Test the workflow with a small PR
2. Verify status checks appear and work
3. Document any team-specific adjustments
4. Train team on new workflow

## References

- [GitHub Branch Protection Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Status Checks Documentation](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks)
