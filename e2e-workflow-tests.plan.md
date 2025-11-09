# E2E Workflow & Error Testing Plan

## Overview

Add comprehensive end-to-end workflows, authentication, and error handling tests to prevent production issues and ensure complete user journey coverage.

## Current State

**Existing Coverage**: 60+ tests focused on PDF viewer features  
**Missing**: Complete user workflows, auth testing, error scenarios  
**Risk**: Production bugs in critical paths (assessment creation, report generation, auth)

---

## Priority 1: End-to-End User Workflows (Critical)

### 1.1 Complete Assessment Creation Flow

**File**: `e2e/workflows/assessment-creation.spec.ts`

**Test Scenarios**:

```typescript
test.describe('Complete Assessment Creation Workflow', () => {
  test('should create assessment from scratch and complete first check', async ({ page }) => {
    // 1. Navigate to projects
    await page.goto('/projects');

    // 2. Create new customer (if needed)
    await page.getByRole('button', { name: /new customer/i }).click();
    await page.fill('input[name="customer_name"]', 'Test Customer E2E');
    await page.getByRole('button', { name: /save/i }).click();
    await expect(page.getByText('Test Customer E2E')).toBeVisible();

    // 3. Create new project
    await page.getByRole('button', { name: /new project/i }).click();
    await page.fill('input[name="project_name"]', 'Test Project E2E');
    await page.fill('input[name="address"]', '123 Test Street');
    await page.getByRole('button', { name: /create/i }).click();

    // 4. Create assessment
    await page.getByRole('button', { name: /new assessment/i }).click();
    await page.selectOption('select[name="code_version"]', '2025 CBC');

    // 5. Upload PDF
    await page.setInputFiles('input[type="file"]', './e2e/fixtures/test-plans.pdf');
    await expect(page.getByText(/uploading/i)).toBeVisible();
    await expect(page.getByText(/upload complete/i)).toBeVisible({ timeout: 30000 });

    // 6. Wait for seeding to complete
    await expect(page.getByText(/seeding checks/i)).toBeVisible();
    await expect(page.getByText(/seeded \d+ checks/i)).toBeVisible({ timeout: 60000 });

    // 7. Select first check
    const firstCheck = page.locator('[data-check-id]').first();
    await firstCheck.click();

    // 8. Verify PDF loaded
    await expect(page.locator('canvas')).toBeVisible();
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return canvas && canvas.width > 0;
    });

    // 9. Take screenshot
    await page.keyboard.press('s');
    await page.mouse.click(400, 300); // Start selection
    await page.mouse.down();
    await page.mouse.move(600, 450);
    await page.mouse.up();
    await page.getByRole('button', { name: /save to current/i }).click();
    await expect(page.getByText(/screenshot saved/i)).toBeVisible();

    // 10. Mark as compliant
    await page.getByRole('button', { name: /compliant/i }).click();
    await page.fill('textarea[name="note"]', 'Test compliance note');
    await page.getByRole('button', { name: /save/i }).click();

    // 11. Verify progress updated
    await expect(page.getByText(/1 of \d+ complete/i)).toBeVisible();

    // Success - captured assessment ID for cleanup
    const url = page.url();
    const assessmentId = url.match(/assessments\/([^/]+)/)?.[1];
    expect(assessmentId).toBeTruthy();
  });

  test('should handle assessment creation with invalid PDF', async ({ page }) => {
    await page.goto('/projects');

    // Create assessment
    await page.getByRole('button', { name: /new assessment/i }).click();

    // Upload invalid file
    await page.setInputFiles('input[type="file"]', './e2e/fixtures/invalid.txt');

    // Should show error
    await expect(page.getByText(/invalid file type/i)).toBeVisible();
    await expect(page.getByText(/must be a pdf/i)).toBeVisible();
  });

  test('should persist progress across page reload', async ({ page }) => {
    // TODO: Create assessment, complete 3 checks
    // Reload page
    // Verify progress is same
  });
});
```

### 1.2 Upload PDF → Seed Checks → Run Analysis → Generate Report

**File**: `e2e/workflows/full-assessment-cycle.spec.ts`

```typescript
test.describe('Full Assessment Lifecycle', () => {
  test('should complete full assessment and generate report', async ({ page }) => {
    // 1. Create assessment (use helper)
    const { assessmentId } = await createTestAssessment(page);

    // 2. Navigate to assessment
    await page.goto(`/assessments/${assessmentId}`);

    // 3. Run batch analysis on all checks
    await page.getByRole('button', { name: /batch analyze/i }).click();
    await page.getByRole('button', { name: /analyze all/i }).click();

    // 4. Wait for batch completion
    await expect(page.getByText(/analyzing checks/i)).toBeVisible();
    await expect(page.getByText(/analysis complete/i)).toBeVisible({ timeout: 120000 });

    // 5. Review results
    const checks = page.locator('[data-check-id]');
    const count = await checks.count();
    expect(count).toBeGreaterThan(0);

    // 6. Make manual overrides on 3 checks
    for (let i = 0; i < 3; i++) {
      await checks.nth(i).click();
      await page.getByRole('button', { name: /compliant/i }).click();
      await page.fill('textarea', `Manual override ${i + 1}`);
      await page.getByRole('button', { name: /save/i }).click();
    }

    // 7. Generate report
    await page.getByRole('button', { name: /generate report/i }).click();

    // 8. Verify report page
    await expect(page.getByText(/assessment report/i)).toBeVisible();
    await expect(page.getByText(/compliance summary/i)).toBeVisible();

    // 9. Export as PDF
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export pdf/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/assessment.*\.pdf$/);
  });

  test('should handle AI analysis timeout gracefully', async ({ page }) => {
    // Mock slow AI response
    await page.route('**/api/analyze', route => {
      setTimeout(() => route.fulfill({ status: 504 }), 31000);
    });

    const { assessmentId } = await createTestAssessment(page);
    await page.goto(`/assessments/${assessmentId}`);

    // Try to analyze
    const firstCheck = page.locator('[data-check-id]').first();
    await firstCheck.click();
    await page.getByRole('button', { name: /analyze/i }).click();

    // Should show timeout error
    await expect(page.getByText(/analysis timed out/i)).toBeVisible({ timeout: 35000 });
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
  });
});
```

### 1.3 Multi-User Collaboration

**File**: `e2e/workflows/collaboration.spec.ts`

```typescript
test.describe('Multi-User Collaboration', () => {
  test('should handle concurrent edits gracefully', async ({ browser }) => {
    // Create two browser contexts (two users)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Both navigate to same assessment
    const { assessmentId } = await createTestAssessment(page1);
    await page1.goto(`/assessments/${assessmentId}`);
    await page2.goto(`/assessments/${assessmentId}`);

    // User 1 selects check 1
    await page1.locator('[data-check-id]').first().click();

    // User 2 selects check 2
    await page2.locator('[data-check-id]').nth(1).click();

    // User 1 marks check 1 as compliant
    await page1.getByRole('button', { name: /compliant/i }).click();
    await page1.getByRole('button', { name: /save/i }).click();

    // User 2 should see updated progress
    await expect(page2.getByText(/1 of \d+ complete/i)).toBeVisible({ timeout: 5000 });

    // Clean up
    await context1.close();
    await context2.close();
  });

  test('should prevent duplicate screenshot uploads', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    const { assessmentId } = await createTestAssessment(page1);
    await page1.goto(`/assessments/${assessmentId}`);
    await page2.goto(`/assessments/${assessmentId}`);

    // Both users select same check
    await page1.locator('[data-check-id]').first().click();
    await page2.locator('[data-check-id]').first().click();

    // Both try to upload screenshot simultaneously
    await page1.keyboard.press('s');
    await page2.keyboard.press('s');

    // Both draw selection
    await Promise.all([page1.mouse.click(400, 300), page2.mouse.click(400, 300)]);

    // Both save
    await Promise.all([
      page1.getByRole('button', { name: /save to current/i }).click(),
      page2.getByRole('button', { name: /save to current/i }).click(),
    ]);

    // Should show 2 screenshots (not duplicated)
    await expect(page1.locator('img[src*="screenshot"]')).toHaveCount(2);

    await context1.close();
    await context2.close();
  });
});
```

### 1.4 Report Generation & Export

**File**: `e2e/workflows/reporting.spec.ts`

```typescript
test.describe('Report Generation', () => {
  test('should generate comprehensive report', async ({ page }) => {
    const { assessmentId } = await createTestAssessment(page);
    await page.goto(`/assessments/${assessmentId}`);

    // Complete at least 5 checks with different statuses
    const checks = page.locator('[data-check-id]');

    // 2 compliant
    await checks.nth(0).click();
    await page.getByRole('button', { name: /compliant/i }).click();
    await page.getByRole('button', { name: /save/i }).click();

    await checks.nth(1).click();
    await page.getByRole('button', { name: /compliant/i }).click();
    await page.getByRole('button', { name: /save/i }).click();

    // 2 non-compliant
    await checks.nth(2).click();
    await page.getByRole('button', { name: /non-compliant/i }).click();
    await page.fill('textarea', 'Issue description');
    await page.getByRole('button', { name: /save/i }).click();

    await checks.nth(3).click();
    await page.getByRole('button', { name: /non-compliant/i }).click();
    await page.fill('textarea', 'Another issue');
    await page.getByRole('button', { name: /save/i }).click();

    // 1 N/A
    await checks.nth(4).click();
    await page.getByRole('button', { name: /not applicable/i }).click();
    await page.getByRole('button', { name: /save/i }).click();

    // Generate report
    await page.getByRole('button', { name: /generate report/i }).click();

    // Verify report content
    await expect(page.getByText(/assessment report/i)).toBeVisible();
    await expect(page.getByText(/2 compliant/i)).toBeVisible();
    await expect(page.getByText(/2 non-compliant/i)).toBeVisible();
    await expect(page.getByText(/1 not applicable/i)).toBeVisible();

    // Verify screenshots appear in report
    await expect(page.locator('img[src*="screenshot"]')).toHaveCount.toBeGreaterThan(0);

    // Verify violation details
    await expect(page.getByText(/issue description/i)).toBeVisible();
    await expect(page.getByText(/another issue/i)).toBeVisible();
  });

  test('should export report as PDF', async ({ page }) => {
    const { assessmentId } = await createTestAssessment(page);
    await page.goto(`/reports/${assessmentId}`);

    // Export as PDF
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export pdf/i }).click();
    const download = await downloadPromise;

    // Verify download
    expect(download.suggestedFilename()).toMatch(/assessment.*\.pdf$/);

    // Verify file size > 0
    const path = await download.path();
    const fs = require('fs');
    const stats = fs.statSync(path);
    expect(stats.size).toBeGreaterThan(1000); // At least 1KB
  });

  test('should export report as Excel', async ({ page }) => {
    const { assessmentId } = await createTestAssessment(page);
    await page.goto(`/reports/${assessmentId}`);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export excel/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/assessment.*\.xlsx$/);
  });
});
```

---

## Priority 2: Authentication & Authorization Tests

### 2.1 Login/Logout Flows

**File**: `e2e/auth/login-logout.spec.ts`

```typescript
test.describe('Authentication', () => {
  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill credentials
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'testpassword123');

    // Submit
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should redirect to projects
    await expect(page).toHaveURL('/projects');

    // Should show user menu
    await expect(page.getByText('test@example.com')).toBeVisible();
  });

  test('should reject invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');

    await page.getByRole('button', { name: /sign in/i }).click();

    // Should show error
    await expect(page.getByText(/invalid credentials/i)).toBeVisible();

    // Should stay on login page
    await expect(page).toHaveURL('/login');
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await loginAsUser(page, 'test@example.com');
    await expect(page).toHaveURL('/projects');

    // Logout
    await page.getByRole('button', { name: /user menu/i }).click();
    await page.getByRole('button', { name: /sign out/i }).click();

    // Should redirect to login
    await expect(page).toHaveURL('/login');

    // Should not be able to access protected pages
    await page.goto('/projects');
    await expect(page).toHaveURL('/login');
  });

  test('should persist session across page reload', async ({ page }) => {
    await loginAsUser(page, 'test@example.com');
    await expect(page).toHaveURL('/projects');

    // Reload page
    await page.reload();

    // Should still be logged in
    await expect(page).toHaveURL('/projects');
    await expect(page.getByText('test@example.com')).toBeVisible();
  });
});
```

### 2.2 Permission Checks

**File**: `e2e/auth/permissions.spec.ts`

```typescript
test.describe('Authorization', () => {
  test('viewer can view but not edit assessments', async ({ page }) => {
    await loginAsUser(page, 'viewer@example.com', 'viewer');

    const { assessmentId } = await createTestAssessment(page);
    await page.goto(`/assessments/${assessmentId}`);

    // Can view checks
    await expect(page.locator('[data-check-id]').first()).toBeVisible();

    // Cannot edit (buttons disabled/hidden)
    await page.locator('[data-check-id]').first().click();
    await expect(page.getByRole('button', { name: /compliant/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /analyze/i })).toBeHidden();
  });

  test('admin can create and delete assessments', async ({ page }) => {
    await loginAsUser(page, 'admin@example.com', 'admin');

    await page.goto('/projects');

    // Can create
    await expect(page.getByRole('button', { name: /new assessment/i })).toBeVisible();

    const { assessmentId } = await createTestAssessment(page);

    // Can delete
    await page.goto(`/assessments/${assessmentId}`);
    await page.getByRole('button', { name: /delete assessment/i }).click();
    await page.getByRole('button', { name: /confirm delete/i }).click();

    await expect(page.getByText(/assessment deleted/i)).toBeVisible();
  });

  test('should prevent unauthorized API access', async ({ page, request }) => {
    // Try to access API without auth
    const response = await request.get('/api/assessments');
    expect(response.status()).toBe(401);

    // Try to create assessment without auth
    const createResponse = await request.post('/api/assessments', {
      data: { project_id: 'test' },
    });
    expect(createResponse.status()).toBe(401);
  });
});
```

### 2.3 Session Expiration

**File**: `e2e/auth/session-expiration.spec.ts`

```typescript
test.describe('Session Management', () => {
  test('should handle expired session gracefully', async ({ page, context }) => {
    await loginAsUser(page, 'test@example.com');
    await page.goto('/projects');

    // Simulate session expiration by clearing cookies
    await context.clearCookies();

    // Try to navigate to protected page
    await page.goto('/assessments/123');

    // Should redirect to login with return URL
    await expect(page).toHaveURL(/\/login\?returnUrl=/);

    // Should show session expired message
    await expect(page.getByText(/session expired/i)).toBeVisible();

    // Login again
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'testpassword123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should redirect back to original URL
    await expect(page).toHaveURL('/assessments/123');
  });

  test('should refresh token automatically', async ({ page }) => {
    await loginAsUser(page, 'test@example.com');

    // Monitor network for refresh token calls
    let refreshCalled = false;
    page.on('request', request => {
      if (request.url().includes('/api/auth/refresh')) {
        refreshCalled = true;
      }
    });

    // Wait for token to expire (or mock it)
    await page.waitForTimeout(60000); // 1 minute

    // Make API call
    await page.goto('/projects');

    // Should have refreshed token automatically
    expect(refreshCalled).toBeTruthy();

    // Should still be logged in
    await expect(page.getByText('test@example.com')).toBeVisible();
  });
});
```

---

## Priority 3: Error Handling Coverage

### 3.1 Network Errors

**File**: `e2e/errors/network-errors.spec.ts`

```typescript
test.describe('Network Error Handling', () => {
  test('should handle PDF upload failure', async ({ page }) => {
    await page.goto('/projects');

    // Mock upload failure
    await page.route('**/api/upload', route => route.abort('failed'));

    await page.getByRole('button', { name: /new assessment/i }).click();
    await page.setInputFiles('input[type="file"]', './e2e/fixtures/test-plans.pdf');

    // Should show error message
    await expect(page.getByText(/upload failed/i)).toBeVisible();

    // Should allow retry
    await expect(page.getByRole('button', { name: /retry upload/i })).toBeVisible();
  });

  test('should handle API timeout', async ({ page }) => {
    const { assessmentId } = await createTestAssessment(page);
    await page.goto(`/assessments/${assessmentId}`);

    // Mock API timeout
    await page.route('**/api/checks/*/analyze', route => {
      setTimeout(() => route.abort('timedout'), 31000);
    });

    // Try to analyze
    await page.locator('[data-check-id]').first().click();
    await page.getByRole('button', { name: /analyze/i }).click();

    // Should show timeout error
    await expect(page.getByText(/request timed out/i)).toBeVisible({ timeout: 35000 });
    await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();
  });

  test('should handle offline mode', async ({ page, context }) => {
    await loginAsUser(page, 'test@example.com');
    const { assessmentId } = await createTestAssessment(page);
    await page.goto(`/assessments/${assessmentId}`);

    // Go offline
    await context.setOffline(true);

    // Try to make changes
    await page.locator('[data-check-id]').first().click();
    await page.getByRole('button', { name: /compliant/i }).click();

    // Should show offline message
    await expect(page.getByText(/you are offline/i)).toBeVisible();

    // Go back online
    await context.setOffline(false);

    // Should sync automatically
    await expect(page.getByText(/back online/i)).toBeVisible();
  });

  test('should handle API 500 error gracefully', async ({ page }) => {
    await page.route('**/api/assessments', route => {
      route.fulfill({ status: 500, body: 'Internal Server Error' });
    });

    await page.goto('/projects');

    // Should show error message
    await expect(page.getByText(/something went wrong/i)).toBeVisible();
    await expect(page.getByText(/try refreshing/i)).toBeVisible();
  });
});
```

### 3.2 Data Validation Errors

**File**: `e2e/errors/validation-errors.spec.ts`

```typescript
test.describe('Data Validation', () => {
  test('should validate required fields on assessment creation', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('button', { name: /new assessment/i }).click();

    // Try to submit without required fields
    await page.getByRole('button', { name: /create/i }).click();

    // Should show validation errors
    await expect(page.getByText(/project is required/i)).toBeVisible();
    await expect(page.getByText(/pdf is required/i)).toBeVisible();
  });

  test('should validate PDF file type', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('button', { name: /new assessment/i }).click();

    // Upload non-PDF file
    await page.setInputFiles('input[type="file"]', './e2e/fixtures/image.jpg');

    // Should show error
    await expect(page.getByText(/must be a pdf file/i)).toBeVisible();
  });

  test('should validate PDF file size', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('button', { name: /new assessment/i }).click();

    // Mock large file (create 51MB file)
    const largeFile = new File([new ArrayBuffer(51 * 1024 * 1024)], 'large.pdf', {
      type: 'application/pdf',
    });

    await page.setInputFiles('input[type="file"]', './e2e/fixtures/large-file.pdf');

    // Should show error
    await expect(page.getByText(/file too large/i)).toBeVisible();
    await expect(page.getByText(/maximum 50mb/i)).toBeVisible();
  });

  test('should handle corrupted PDF', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('button', { name: /new assessment/i }).click();

    // Upload corrupted PDF
    await page.setInputFiles('input[type="file"]', './e2e/fixtures/corrupted.pdf');

    // Should show error after processing
    await expect(page.getByText(/could not read pdf/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/file may be corrupted/i)).toBeVisible();
  });
});
```

### 3.3 Database & State Errors

**File**: `e2e/errors/state-errors.spec.ts`

```typescript
test.describe('State & Database Errors', () => {
  test('should handle concurrent modification conflict', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    const { assessmentId } = await createTestAssessment(page1);

    // Both users load same check
    await page1.goto(`/assessments/${assessmentId}`);
    await page2.goto(`/assessments/${assessmentId}`);

    await page1.locator('[data-check-id]').first().click();
    await page2.locator('[data-check-id]').first().click();

    // User 1 marks compliant
    await page1.getByRole('button', { name: /compliant/i }).click();
    await page1.getByRole('button', { name: /save/i }).click();

    // User 2 tries to mark non-compliant
    await page2.getByRole('button', { name: /non-compliant/i }).click();
    await page2.getByRole('button', { name: /save/i }).click();

    // Should show conflict message
    await expect(page2.getByText(/check was modified/i)).toBeVisible();
    await expect(page2.getByRole('button', { name: /reload/i })).toBeVisible();

    await context1.close();
    await context2.close();
  });

  test('should handle deleted assessment gracefully', async ({ page }) => {
    const { assessmentId } = await createTestAssessment(page);

    // Load assessment
    await page.goto(`/assessments/${assessmentId}`);
    await expect(page.locator('canvas')).toBeVisible();

    // Delete assessment in background (via API)
    await fetch(`http://localhost:3000/api/assessments/${assessmentId}`, {
      method: 'DELETE',
    });

    // Try to interact
    await page.locator('[data-check-id]').first().click();

    // Should show error
    await expect(page.getByText(/assessment not found/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /go to projects/i })).toBeVisible();
  });

  test('should handle database connection error', async ({ page }) => {
    // Mock database error
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 503,
        body: JSON.stringify({ error: 'Database connection failed' }),
      });
    });

    await page.goto('/projects');

    // Should show error message
    await expect(page.getByText(/unable to connect/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
  });
});
```

---

## Implementation Order

### Phase 1: Foundation (Week 1)

**Priority**: Test infrastructure setup

1. ✅ Create test data fixtures
   - `e2e/fixtures/test-data.ts` - Helper to create/cleanup test data
   - `e2e/fixtures/auth-helpers.ts` - Login/logout helpers
   - `e2e/fixtures/test-plans.pdf` - Sample PDF for testing

2. ✅ Add authentication helpers

   ```typescript
   // e2e/fixtures/auth-helpers.ts
   export async function loginAsUser(page, email, role = 'admin') {
     await page.goto('/login');
     await page.fill('input[name="email"]', email);
     await page.fill('input[name="password"]', getTestPassword(role));
     await page.getByRole('button', { name: /sign in/i }).click();
     await expect(page).toHaveURL('/projects');
   }

   export async function createTestAssessment(page) {
     // Create customer, project, assessment with test data
     // Return IDs for use in tests
   }
   ```

3. ✅ Update playwright.config.ts
   ```typescript
   // Add global setup/teardown
   globalSetup: require.resolve('./e2e/fixtures/global-setup'),
   globalTeardown: require.resolve('./e2e/fixtures/global-teardown'),
   ```

**Time**: 2-3 days

### Phase 2: Core Workflows (Week 2)

**Priority**: End-to-end user journeys

4. ✅ Assessment creation workflow (3 tests)
5. ✅ Full assessment cycle (2 tests)
6. ✅ Report generation (3 tests)

**Time**: 3-4 days

### Phase 3: Authentication (Week 2-3)

**Priority**: Security & access control

7. ✅ Login/logout flows (4 tests)
8. ✅ Permission checks (3 tests)
9. ✅ Session management (2 tests)

**Time**: 2-3 days

### Phase 4: Error Handling (Week 3)

**Priority**: Robustness & user experience

10. ✅ Network errors (4 tests)
11. ✅ Validation errors (4 tests)
12. ✅ State errors (3 tests)

**Time**: 3-4 days

### Phase 5: Collaboration (Week 4)

**Priority**: Multi-user scenarios

13. ✅ Concurrent edits (2 tests)
14. ✅ Real-time updates (2 tests)

**Time**: 2-3 days

---

## Success Metrics

| Area                | Current  | Target    | Tests Added       |
| ------------------- | -------- | --------- | ----------------- |
| **E2E Workflows**   | 0        | 12        | 12 new tests      |
| **Auth Testing**    | 0        | 9         | 9 new tests       |
| **Error Scenarios** | ~5       | 15+       | 11 new tests      |
| **Total Coverage**  | 60 tests | 92+ tests | **32+ new tests** |
| **Critical Paths**  | 0%       | 100%      | Full coverage     |

## Files to Create

```
e2e/
├── workflows/
│   ├── assessment-creation.spec.ts      (NEW)
│   ├── full-assessment-cycle.spec.ts    (NEW)
│   ├── collaboration.spec.ts            (NEW)
│   └── reporting.spec.ts                (NEW)
├── auth/
│   ├── login-logout.spec.ts             (NEW)
│   ├── permissions.spec.ts              (NEW)
│   └── session-expiration.spec.ts       (NEW)
├── errors/
│   ├── network-errors.spec.ts           (NEW)
│   ├── validation-errors.spec.ts        (NEW)
│   └── state-errors.spec.ts             (NEW)
└── fixtures/
    ├── test-data.ts                     (NEW)
    ├── auth-helpers.ts                  (NEW)
    ├── global-setup.ts                  (NEW)
    ├── global-teardown.ts               (NEW)
    └── test-plans.pdf                   (NEW)
```

## Risk Mitigation

**Risks**:

- Tests may be flaky due to timing issues
- Test data cleanup might fail
- Long test execution times

**Mitigations**:

1. Use proper wait conditions instead of timeouts
2. Implement robust cleanup in `afterEach`
3. Run tests in parallel where possible
4. Add retries for flaky tests
5. Use database transactions for test isolation

## Next Steps

Ready to implement when you approve! I recommend starting with Phase 1 (fixtures) since all other tests depend on it.

**Questions for you**:

1. Do you have existing auth setup I should know about?
2. What user roles exist in your system?
3. Should I use actual Supabase auth or mock it for tests?
4. Do you want me to start with Phase 1 now?
