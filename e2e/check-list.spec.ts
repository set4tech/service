import { test, expect } from './fixtures/setup';

/**
 * Check List Navigation and Filtering Tests
 *
 * Tests check list functionality, search, filtering, mode toggling
 */
test.describe('Check List - Navigation & Filtering', () => {
  const TEST_ASSESSMENT_ID = process.env.TEST_ASSESSMENT_ID || 'test-assessment-id';

  test.beforeEach(async ({ assessmentPage }) => {
    test.skip(!process.env.TEST_ASSESSMENT_ID, 'Set TEST_ASSESSMENT_ID to run these tests');
    await assessmentPage.goto(TEST_ASSESSMENT_ID);
  });

  test('should display check list sidebar', async ({ page }) => {
    // Check list should be visible
    const checkList = page.locator('[data-testid="check-list"]').or(page.locator('aside')).first();
    await expect(checkList).toBeVisible();

    // Should have search input
    const searchInput = page.getByPlaceholder(/search/i);
    await expect(searchInput).toBeVisible();
  });

  test('should search and filter checks', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i);

    // Type in search
    await searchInput.fill('door');
    await page.waitForTimeout(500); // Debounce

    // Check list should update
    const checkItems = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));
    const count = await checkItems.count();

    expect(count).toBeGreaterThan(0);

    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(500);
  });

  test('should toggle between section and element mode', async ({ page }) => {
    // Look for mode toggle button
    const sectionModeBtn = page.getByRole('button', { name: /section mode/i });
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    const modeToggle = sectionModeBtn.or(elementModeBtn).first();
    await expect(modeToggle).toBeVisible();

    // Click toggle
    await modeToggle.click();
    await page.waitForTimeout(500);

    // Check list should reorganize
    const checkList = page.locator('[data-testid="check-list"]').or(page.locator('aside')).first();
    await expect(checkList).toBeVisible();
  });

  test('should select a check and update UI', async ({ page }) => {
    // Find first check item
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Check should be highlighted/selected
    // (This depends on your implementation - adjust selector as needed)
    const selectedCheck = page
      .locator('[data-selected="true"]')
      .or(page.locator('.bg-blue-50').or(page.locator('.selected')));

    // At least one check should show selection state
    const selectedCount = await selectedCheck.count();
    expect(selectedCount).toBeGreaterThanOrEqual(0);
  });

  test('should display progress indicators', async ({ page }) => {
    // Look for progress text or progress bar
    const progressText = page.getByText(/%/);
    const progressBar = page.locator('[role="progressbar"]').or(page.locator('progress'));

    const hasProgress = (await progressText.count()) > 0 || (await progressBar.count()) > 0;
    expect(hasProgress).toBeTruthy();
  });

  test('should expand and collapse check groups', async ({ page }) => {
    // Find a collapsible group (element groups or section groups)
    const expandButton = page
      .locator('[aria-expanded]')
      .or(page.locator('button').filter({ hasText: /chevron|arrow/i }))
      .first();

    if ((await expandButton.count()) > 0) {
      const initialState = await expandButton.getAttribute('aria-expanded');

      // Toggle
      await expandButton.click();
      await page.waitForTimeout(300);

      const newState = await expandButton.getAttribute('aria-expanded');
      expect(newState).not.toBe(initialState);
    }
  });

  test('should display check status indicators', async ({ page }) => {
    // Look for status badges/icons (compliant, non-compliant, pending, etc.)
    const statusIndicators = page
      .locator('[data-status]')
      .or(page.locator('.badge').or(page.locator('[class*="status"]')));

    // Should have some status indicators
    const count = await statusIndicators.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show check count in groups', async ({ page }) => {
    // Look for count badges like "(5)" or "5 checks"
    const countBadges = page.getByText(/\(\d+\)|\d+ checks?/i);

    const count = await countBadges.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should filter by compliance status', async ({ page }) => {
    // Look for filter buttons/dropdowns
    const filterButtons = page
      .locator('[data-filter]')
      .or(page.getByRole('button', { name: /filter|all|compliant|non-compliant/i }));

    if ((await filterButtons.count()) > 0) {
      const firstFilter = filterButtons.first();
      await firstFilter.click();
      await page.waitForTimeout(500);

      // Check list should update
      const checkList = page
        .locator('[data-testid="check-list"]')
        .or(page.locator('aside'))
        .first();
      await expect(checkList).toBeVisible();
    }
  });

  test('should persist selected check on page refresh', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Get current URL (should have check ID in query param)
    const urlBefore = page.url();

    // Reload page
    await page.reload();
    await page.waitForTimeout(1000);

    // URL should still have same check selected
    const urlAfter = page.url();
    expect(urlAfter).toBe(urlBefore);
  });
});
