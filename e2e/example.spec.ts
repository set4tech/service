import { test, expect } from '@playwright/test';

/**
 * Example E2E Test
 *
 * This test runs without requiring TEST_ASSESSMENT_ID
 * It validates basic app functionality
 */
test.describe('Example - Basic App Tests', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');

    // Should not show error page
    await expect(page.locator('text=/error/i')).not.toBeVisible();

    // Should have some content (adjust based on your actual home page)
    await expect(page.locator('body')).toBeVisible();
  });

  test('should have working navigation', async ({ page }) => {
    await page.goto('/');

    // Check if navigation exists (adjust selectors based on your actual nav)
    const _nav = page.locator('nav, header, [role="navigation"]');

    // Page should load successfully
    await expect(page).toHaveURL('/');
  });

  test('should load projects page', async ({ page }) => {
    const response = await page.goto('/projects');

    // Should get 200 status (not 404)
    expect(response?.status()).toBe(200);

    // Page should load (body visible)
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load customers page', async ({ page }) => {
    const response = await page.goto('/customers');

    // Should get 200 status (not 404)
    expect(response?.status()).toBe(200);

    // Page should load (body visible)
    await expect(page.locator('body')).toBeVisible();
  });

  test('should have responsive design', async ({ page }) => {
    // Test desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();

    // Test tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();

    // Test mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle 404 gracefully', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist-12345');

    // Should get 404 status
    expect(response?.status()).toBe(404);
  });
});

/**
 * Example showing how to use test.skip conditionally
 */
test.describe('Example - Conditional Tests', () => {
  test('runs only in CI', async ({ page }) => {
    test.skip(!process.env.CI, 'Only runs in CI environment');

    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('runs only locally', async ({ page }) => {
    test.skip(!!process.env.CI, 'Only runs locally');

    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('runs only with test data', async ({ page }) => {
    test.skip(!process.env.TEST_ASSESSMENT_ID, 'Requires TEST_ASSESSMENT_ID');

    // This test would use TEST_ASSESSMENT_ID
    await page.goto(`/assessments/${process.env.TEST_ASSESSMENT_ID}`);
  });
});

/**
 * Example showing custom fixtures usage
 */
test.describe('Example - Using Fixtures', () => {
  test('can use custom fixtures from setup.ts', async ({ page: _page }) => {
    // Import the custom test from fixtures/setup.ts to use fixtures
    // See pdf-viewer-navigation.spec.ts for examples
  });
});

/**
 * Example showing screenshot comparison
 */
test.describe('Example - Visual Regression', () => {
  test('can compare screenshots', async ({ page }) => {
    await page.goto('/');

    // Take a screenshot and compare with baseline
    // First run will create baseline, subsequent runs will compare
    // Uncomment to enable:
    // await expect(page).toHaveScreenshot('homepage.png', {
    //   maxDiffPixels: 100,
    // });
  });
});
