# Getting Started with E2E Workflow Tests

This guide shows you how to implement the new end-to-end workflow tests.

## What's Been Set Up

✅ **Test Infrastructure** (Ready to use):

- `fixtures/auth-helpers.ts` - Login/logout utilities
- `fixtures/test-data.ts` - Create/cleanup test data
- `fixtures/global-setup.ts` - Runs before all tests
- `fixtures/global-teardown.ts` - Runs after all tests
- `playwright.config.ts` - Updated with global setup/teardown

✅ **Example Test**:

- `workflows/assessment-creation.spec.ts` - Complete workflow example

## Quick Start

### 1. Set Up Test Users

Create these test users in your Supabase database:

```sql
-- Admin user
INSERT INTO auth.users (email, encrypted_password, role)
VALUES ('admin@test.com', crypt('TestPassword123!', gen_salt('bf')), 'authenticated');

-- Viewer user
INSERT INTO auth.users (email, encrypted_password, role)
VALUES ('viewer@test.com', crypt('TestPassword123!', gen_salt('bf')), 'authenticated');

-- Editor user
INSERT INTO auth.users (email, encrypted_password, role)
VALUES ('editor@test.com', crypt('TestPassword123!', gen_salt('bf')), 'authenticated');
```

Or create them through your app's sign-up flow.

### 2. Add Test PDF Fixture

Place a sample PDF in `e2e/fixtures/`:

```bash
cp ~/Downloads/sample-floor-plan.pdf e2e/fixtures/test-plans.pdf
```

### 3. Run the Example Test

```bash
# Run the assessment creation workflow test
npx playwright test e2e/workflows/assessment-creation.spec.ts

# Or run in UI mode to see it in action
npx playwright test e2e/workflows/assessment-creation.spec.ts --ui
```

## Using the Test Helpers

### Authentication

```typescript
import { loginAsUser, logout } from '../fixtures/auth-helpers';

test('my test', async ({ page }) => {
  // Login as admin
  await loginAsUser(page);

  // Or login as specific role
  await loginAsUser(page, undefined, 'viewer');

  // Or login with custom email
  await loginAsUser(page, 'custom@test.com', 'admin');

  // Logout
  await logout(page);
});
```

### Creating Test Data

```typescript
import { createTestAssessment, deleteTestAssessment } from '../fixtures/test-data';

test('my test', async ({ page }) => {
  // Create a complete assessment (customer, project, PDF upload, seeding)
  const { assessmentId, projectId, customerName } = await createTestAssessment(page);

  // Use the assessment in your test
  await page.goto(`/assessments/${assessmentId}`);

  // Clean up when done
  await deleteTestAssessment(page, assessmentId);
});
```

### Seeding Test Checks

```typescript
import { seedTestChecks } from '../fixtures/test-data';

test('my test', async ({ page }) => {
  const { assessmentId } = await createTestAssessment(page);

  // Complete some checks with different statuses
  await seedTestChecks(page, assessmentId, {
    compliant: 3, // Mark 3 checks as compliant
    nonCompliant: 2, // Mark 2 checks as non-compliant
    notApplicable: 1, // Mark 1 check as N/A
  });

  // Now you have an assessment with 6 completed checks
});
```

## Implementing the Plan

Follow the implementation plan in `e2e-workflow-tests.plan.md`:

### Phase 1: Foundation ✅ (DONE)

You can now start implementing tests!

### Phase 2: Core Workflows (Next)

Create these test files:

1. **`workflows/full-assessment-cycle.spec.ts`**
   - Test: Upload → Seed → Analyze → Report
   - Test: Batch analysis
   - Test: AI timeout handling

2. **`workflows/reporting.spec.ts`**
   - Test: Generate comprehensive report
   - Test: Export as PDF
   - Test: Export as Excel

3. **`workflows/collaboration.spec.ts`**
   - Test: Concurrent edits
   - Test: Duplicate screenshot prevention

### Phase 3: Authentication

Create these test files:

1. **`auth/login-logout.spec.ts`**
   - Test: Login with valid credentials
   - Test: Reject invalid credentials
   - Test: Logout successfully
   - Test: Session persistence

2. **`auth/permissions.spec.ts`**
   - Test: Viewer can view but not edit
   - Test: Admin can create and delete
   - Test: Unauthorized API access

3. **`auth/session-expiration.spec.ts`**
   - Test: Handle expired session
   - Test: Refresh token automatically

### Phase 4: Error Handling

Create these test files:

1. **`errors/network-errors.spec.ts`**
   - Test: PDF upload failure
   - Test: API timeout
   - Test: Offline mode
   - Test: 500 errors

2. **`errors/validation-errors.spec.ts`**
   - Test: Required field validation
   - Test: File type validation
   - Test: File size validation
   - Test: Corrupted PDF handling

3. **`errors/state-errors.spec.ts`**
   - Test: Concurrent modification conflict
   - Test: Deleted assessment
   - Test: Database connection error

## Tips & Best Practices

### 1. Always Clean Up

```typescript
test('my test', async ({ page }) => {
  const { assessmentId } = await createTestAssessment(page);

  try {
    // Your test logic
  } finally {
    // Always clean up, even if test fails
    await deleteTestAssessment(page, assessmentId);
  }
});
```

### 2. Use Proper Waits

```typescript
// ❌ Bad - brittle timing
await page.waitForTimeout(1000);

// ✅ Good - wait for specific condition
await expect(page.getByText('Success')).toBeVisible();

// ✅ Good - wait for network idle
await page.waitForLoadState('networkidle');

// ✅ Good - wait for custom condition
await page.waitForFunction(() => {
  return document.querySelector('canvas')?.width > 0;
});
```

### 3. Make Tests Independent

```typescript
// ❌ Bad - depends on previous test
test('test 1', async ({ page }) => {
  await createTestAssessment(page); // assessmentId stored globally
});

test('test 2', async ({ page }) => {
  await page.goto(`/assessments/${globalAssessmentId}`); // Uses test 1's data
});

// ✅ Good - each test is self-contained
test('test 1', async ({ page }) => {
  const { assessmentId } = await createTestAssessment(page);
  // Use assessmentId only in this test
});

test('test 2', async ({ page }) => {
  const { assessmentId } = await createTestAssessment(page);
  // Create its own data
});
```

### 4. Add Descriptive Test Names

```typescript
// ❌ Bad
test('test 1', async ({ page }) => { ... });

// ✅ Good
test('should prevent viewer from editing assessment checks', async ({ page }) => { ... });
```

### 5. Use Test Fixtures for Common Operations

```typescript
// Create reusable fixtures in setup.ts
export const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    await loginAsUser(page);
    await use(page);
  },

  assessmentWithData: async ({ page }, use) => {
    const assessment = await createTestAssessment(page);
    await seedTestChecks(page, assessment.assessmentId, {
      compliant: 2,
      nonCompliant: 2,
    });
    await use(assessment);
    await deleteTestAssessment(page, assessment.assessmentId);
  },
});

// Use in tests
test('my test', async ({ assessmentWithData }) => {
  // Already logged in, assessment created with data, will be cleaned up
});
```

## Running Tests

```bash
# Run all workflow tests
npx playwright test e2e/workflows

# Run all auth tests
npx playwright test e2e/auth

# Run all error tests
npx playwright test e2e/errors

# Run specific test file
npx playwright test e2e/workflows/assessment-creation.spec.ts

# Run in UI mode (recommended for development)
npx playwright test --ui

# Run in headed mode (see browser)
npx playwright test --headed

# Run with debugging
npx playwright test --debug

# Run tests matching pattern
npx playwright test --grep "should create assessment"
```

## Debugging Failed Tests

When a test fails, Playwright captures:

1. **Screenshot** - `test-results/[test-name]/test-failed-1.png`
2. **Video** - `test-results/[test-name]/video.webm`
3. **Trace** - `test-results/[test-name]/trace.zip`

View the trace:

```bash
npx playwright show-trace test-results/[test-name]/trace.zip
```

## Next Steps

1. ✅ Review the example test in `workflows/assessment-creation.spec.ts`
2. ✅ Run it to verify everything works
3. ✅ Start implementing Phase 2 tests from the plan
4. ✅ Use the helpers to speed up test creation
5. ✅ Run tests frequently to catch issues early

## Questions?

- See `e2e-workflow-tests.plan.md` for the complete implementation plan
- See `TEST_COVERAGE_SUMMARY.md` for a quick overview
- Check existing tests in `e2e/` for examples
- Reference Playwright docs: https://playwright.dev

Good luck! 🚀
