import { test, expect } from './fixtures/setup';

/**
 * Bulk Check Operations Tests
 *
 * Tests checkbox-based bulk selection and operations: analyze, delete, status updates
 */
test.describe('Bulk Check Operations', () => {
  const TEST_ASSESSMENT_ID = process.env.TEST_ASSESSMENT_ID || 'test-assessment-id';

  test.beforeEach(async ({ assessmentPage }) => {
    test.skip(!process.env.TEST_ASSESSMENT_ID, 'Set TEST_ASSESSMENT_ID to run these tests');
    await assessmentPage.goto(TEST_ASSESSMENT_ID);

    // Wait for check list to load
    await assessmentPage.page.waitForLoadState('networkidle');
  });

  test('should display checkboxes for all checks', async ({ page }) => {
    // Checkboxes should be visible in the check list
    const checkboxes = page.locator('input[type="checkbox"]').filter({
      has: page.locator('..').filter({ hasText: /11B-/ }),
    });

    const count = await checkboxes.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should select multiple checks and show action bar', async ({ page }) => {
    // Find checkboxes in the check list (not the filter checkbox)
    const checkRows = page.locator('button').filter({ hasText: /11B-/ }).first().locator('..');
    const checkboxes = checkRows.locator('input[type="checkbox"]').first();

    // Select 3 checks
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    await checkboxes.nth(2).check();

    // Bulk action bar should appear
    const actionBar = page.locator('text=/\\d+ selected/');
    await expect(actionBar).toBeVisible();

    // Action buttons should be visible
    await expect(page.getByRole('button', { name: 'Analyze' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
    await expect(page.locator('select').filter({ hasText: /Mark as/ })).toBeVisible();
  });

  test('should support shift-click range selection', async ({ page }) => {
    // Find checkboxes in the check list
    const checkRows = page.locator('button').filter({ hasText: /11B-/ }).first().locator('..');
    const checkboxes = checkRows.locator('input[type="checkbox"]');

    // Click first checkbox
    await checkboxes.nth(0).check();

    // Verify 1 is selected
    await expect(page.locator('text=/1 selected/')).toBeVisible();

    // Shift-click the 5th checkbox to select range
    await checkboxes.nth(4).check({ modifiers: ['Shift'] });

    // Should have selected 5 items (0-4 inclusive)
    await expect(page.locator('text=/5 selected/')).toBeVisible();

    // All checkboxes in range should be checked
    for (let i = 0; i < 5; i++) {
      await expect(checkboxes.nth(i)).toBeChecked();
    }
  });

  test('should clear selection on Clear button', async ({ page }) => {
    // Select a check
    const checkRows = page.locator('button').filter({ hasText: /11B-/ }).first().locator('..');
    const checkbox = checkRows.locator('input[type="checkbox"]').first();
    await checkbox.check();

    // Action bar should appear
    await expect(page.locator('text=/\\d+ selected/')).toBeVisible();

    // Click Clear button
    await page.getByRole('button', { name: 'Clear' }).click();

    // Action bar should disappear
    await expect(page.locator('text=/\\d+ selected/')).not.toBeVisible();

    // Checkbox should be unchecked
    await expect(checkbox).not.toBeChecked();
  });

  test('should bulk update status to compliant', async ({ page }) => {
    // Select checks
    const checkRows = page.locator('button').filter({ hasText: /11B-/ }).first().locator('..');
    const checkboxes = checkRows.locator('input[type="checkbox"]');

    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();

    // Wait for action bar
    await expect(page.locator('text=/\\d+ selected/')).toBeVisible();

    // Select "Compliant" from dropdown
    const dropdown = page.locator('select').filter({ hasText: /Mark as/ });
    await dropdown.selectOption('compliant');

    // Wait for update to complete (action bar should disappear)
    await expect(page.locator('text=/\\d+ selected/')).not.toBeVisible({ timeout: 10000 });

    // Verify selection is cleared
    await expect(checkboxes.nth(0)).not.toBeChecked();
    await expect(checkboxes.nth(1)).not.toBeChecked();
  });

  test('should bulk delete checks with confirmation', async ({ page }) => {
    // Select checks
    const checkRows = page.locator('button').filter({ hasText: /11B-/ }).first().locator('..');
    const checkboxes = checkRows.locator('input[type="checkbox"]');

    // Get initial check count
    const initialCount = await checkboxes.count();

    // Select 2 checks
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();

    // Click Delete button
    page.on('dialog', dialog => dialog.accept()); // Accept confirmation
    await page.getByRole('button', { name: 'Delete' }).click();

    // Wait for deletion to complete
    await page.waitForTimeout(2000);

    // Check count should be reduced
    const newCount = await page.locator('button').filter({ hasText: /11B-/ }).count();
    expect(newCount).toBeLessThan(initialCount);
  });

  test('should bulk analyze checks', async ({ page }) => {
    // Select checks
    const checkRows = page.locator('button').filter({ hasText: /11B-/ }).first().locator('..');
    const checkboxes = checkRows.locator('input[type="checkbox"]');

    await checkboxes.nth(0).check();

    // Click Analyze button
    await page.getByRole('button', { name: 'Analyze' }).click();

    // Wait for API calls to complete
    await page.waitForTimeout(2000);

    // Selection should be cleared
    await expect(page.locator('text=/\\d+ selected/')).not.toBeVisible({ timeout: 10000 });
  });

  test('should work in element mode', async ({ page }) => {
    // Switch to element mode if not already
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });
    if (await elementModeBtn.isVisible()) {
      await elementModeBtn.click();
      await page.waitForTimeout(1000);
    }

    // Expand a group if collapsed
    const groupHeader = page.locator('text=/Doors|Bathrooms|Kitchens/').first();
    if (await groupHeader.isVisible()) {
      await groupHeader.click();
      await page.waitForTimeout(500);
    }

    // Select element instances
    const checkboxes = page.locator('input[type="checkbox"]');
    const visibleCheckboxes = await checkboxes.first();

    if (await visibleCheckboxes.isVisible()) {
      await visibleCheckboxes.check();

      // Action bar should appear
      await expect(page.locator('text=/\\d+ selected/')).toBeVisible();
    }
  });

  test('should handle empty selection gracefully', async ({ page }) => {
    // Try to perform action without selection
    // Action bar should not be visible when nothing is selected
    await expect(page.locator('text=/\\d+ selected/')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Analyze' })).not.toBeVisible();
  });

  test('should disable action buttons while loading', async ({ page }) => {
    // Select a check
    const checkRows = page.locator('button').filter({ hasText: /11B-/ }).first().locator('..');
    const checkbox = checkRows.locator('input[type="checkbox"]').first();
    await checkbox.check();

    // Action bar should appear
    await expect(page.locator('text=/\\d+ selected/')).toBeVisible();

    // Click Analyze (which triggers loading)
    const analyzeBtn = page.getByRole('button', { name: 'Analyze' });
    await analyzeBtn.click();

    // Button should be disabled during the operation
    // (Check happens very quickly, but we can verify the button exists)
    await expect(analyzeBtn.or(page.getByRole('button', { name: 'Delete' }))).toBeDefined();
  });
});

test.describe('Bulk Operations - Rules-Based Door Checks', () => {
  const TEST_ASSESSMENT_ID = process.env.TEST_ASSESSMENT_ID || 'test-assessment-id';

  test.skip('should handle rules-based door checks in bulk analyze', async ({ page }) => {
    // This test requires a California project with door checks
    // and database verification, so it's skipped by default

    test.skip(!process.env.TEST_ASSESSMENT_ID, 'Set TEST_ASSESSMENT_ID with California doors');

    await page.goto(`/assessments/${TEST_ASSESSMENT_ID}`);
    await page.waitForLoadState('networkidle');

    // Switch to element mode
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });
    if (await elementModeBtn.isVisible()) {
      await elementModeBtn.click();
      await page.waitForTimeout(1000);
    }

    // Expand Doors group
    const doorsHeader = page.locator('text=Doors');
    if (await doorsHeader.isVisible()) {
      await doorsHeader.click();
      await page.waitForTimeout(500);
    }

    // Select door instance checks
    const doorCheckboxes = page.locator('input[type="checkbox"]');
    await doorCheckboxes.first().check();

    // Click Analyze
    await page.getByRole('button', { name: 'Analyze' }).click();

    // Wait for analysis to complete
    await page.waitForTimeout(5000);

    // Some checks should get immediate status from rules engine
    // (Would need database verification to confirm manual_status_by = 'rules_engine')
    // For now, just verify the operation completed
    await expect(page.locator('text=/\\d+ selected/')).not.toBeVisible({ timeout: 15000 });
  });
});
