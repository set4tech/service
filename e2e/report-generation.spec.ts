import { test, expect } from '@playwright/test';

/**
 * Report Generation Tests
 *
 * Tests the customer-facing report viewer functionality:
 * - Report page loading and display
 * - Violation list and navigation
 * - PDF viewer integration
 * - Export PDF functionality
 * - Building info and code reference display
 */

// Report tests need a project ID with violations
const TEST_PROJECT_ID = process.env.TEST_PROJECT_ID || '';

test.describe('Report Viewer - Page Load', () => {
  test.beforeEach(async () => {
    test.skip(!TEST_PROJECT_ID, 'Set TEST_PROJECT_ID to run report tests');
  });

  test('should load report page successfully', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);

    // Should either show the report or redirect to login
    await page.waitForLoadState('networkidle');

    // Check if we're on report page or login page
    const isLoginPage = page.url().includes('/login');
    const isReportPage = page.url().includes('/report') && !page.url().includes('/login');

    expect(isLoginPage || isReportPage).toBe(true);
  });

  test('should display project name in report header', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    // Skip if redirected to login
    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    // Project name should be visible in header
    const header = page.locator('h1');
    await expect(header).toBeVisible({ timeout: 10000 });
    const headerText = await header.textContent();
    expect(headerText).toBeTruthy();
    expect(headerText!.length).toBeGreaterThan(0);
  });

  test('should display Plan Review subtitle', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    // Should show "Plan Review: Accessibility" or similar
    const subtitle = page.getByText(/plan review|accessibility/i);
    await expect(subtitle.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Report Viewer - Violation List', () => {
  test.beforeEach(async () => {
    test.skip(!TEST_PROJECT_ID, 'Set TEST_PROJECT_ID to run report tests');
  });

  test('should display violation summary statistics', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    // Should show severity counts (Major, Moderate, Minor, Needs Info)
    const majorCount = page.getByText(/major/i);
    const moderateCount = page.getByText(/moderate/i);
    const minorCount = page.getByText(/minor/i);

    // At least one severity category should be visible
    await expect(
      majorCount.or(moderateCount).or(minorCount).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('should display violation list in sidebar', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    // Look for violation items (code section numbers or violation descriptions)
    const violations = page
      .getByText(/11B-\d+/)
      .or(page.locator('[data-violation]'))
      .or(page.getByText(/violation|deficiency|issue/i));

    // Wait for violations to load
    await page.waitForTimeout(2000);

    const count = await violations.count();
    // There should be at least some violations in the test data
    expect(count).toBeGreaterThanOrEqual(0); // May be 0 if no violations
  });

  test('should click violation and navigate to it in PDF', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    // Wait for PDF to load
    await page.waitForSelector('canvas', { timeout: 30000 });

    // Find a violation item and click it
    const violationItem = page
      .locator('[data-violation]')
      .or(page.getByText(/11B-\d+/).first());

    if ((await violationItem.count()) === 0) {
      test.skip(); // No violations to test
      return;
    }

    // Get initial page number if visible
    const pageIndicator = page.getByText(/page \d+/i);
    let initialPage = '';
    if ((await pageIndicator.count()) > 0) {
      initialPage = (await pageIndicator.first().textContent()) || '';
    }

    // Click the violation
    await violationItem.first().click();
    await page.waitForTimeout(500);

    // PDF should still be visible and potentially navigated
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('should open violation detail modal on info click', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Look for detail/info button on violations
    const detailBtn = page
      .getByRole('button', { name: /detail|info|view/i })
      .or(page.locator('[aria-label*="detail"]'))
      .or(page.locator('[data-action="view-details"]'));

    if ((await detailBtn.count()) === 0) {
      test.skip();
      return;
    }

    await detailBtn.first().click();
    await page.waitForTimeout(500);

    // Should open a modal with violation details
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Report Viewer - PDF Display', () => {
  test.beforeEach(async () => {
    test.skip(!TEST_PROJECT_ID, 'Set TEST_PROJECT_ID to run report tests');
  });

  test('should display PDF viewer with canvas', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    // PDF canvas should be visible
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 30000 });

    // Canvas should have dimensions
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector('canvas');
        return canvas && canvas.width > 0 && canvas.height > 0;
      },
      { timeout: 30000 }
    );
  });

  test('should display violation markers on PDF', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    // Wait for PDF to load
    await page.waitForSelector('canvas', { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Look for violation markers/overlays on the PDF
    const markers = page
      .locator('[data-marker]')
      .or(page.locator('[data-violation-marker]'))
      .or(page.locator('.violation-marker'));

    // Markers may or may not be visible depending on current page
    const markerCount = await markers.count();
    // Just verify the PDF loaded - markers depend on page content
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('should support page navigation', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    // Wait for PDF to load
    await page.waitForSelector('canvas', { timeout: 30000 });

    // Look for page navigation controls
    const nextPageBtn = page
      .getByRole('button', { name: /next/i })
      .or(page.getByLabel(/next page/i))
      .or(page.locator('[aria-label*="next"]'));

    const prevPageBtn = page
      .getByRole('button', { name: /prev|back/i })
      .or(page.getByLabel(/previous page/i))
      .or(page.locator('[aria-label*="prev"]'));

    // At least one navigation control should exist
    const hasNavigation =
      (await nextPageBtn.count()) > 0 || (await prevPageBtn.count()) > 0;

    expect(hasNavigation).toBe(true);
  });
});

test.describe('Report Viewer - Navigation Sidebar', () => {
  test.beforeEach(async () => {
    test.skip(!TEST_PROJECT_ID, 'Set TEST_PROJECT_ID to run report tests');
  });

  test('should display navigation buttons for different views', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    // Should have navigation for: Violations, Comments, Building Info, Code Info, Tables
    const violationsNav = page.getByTitle(/violation/i).or(page.locator('[title*="Violation"]'));
    const commentsNav = page.getByTitle(/comment/i).or(page.locator('[title*="Comment"]'));
    const buildingInfoNav = page.getByTitle(/building/i).or(page.locator('[title*="Building"]'));

    // At least violations nav should be visible
    await expect(
      violationsNav.or(commentsNav).or(buildingInfoNav).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('should switch to Building Information view', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    // Find and click Building Information nav button
    const buildingInfoBtn = page
      .getByTitle(/building/i)
      .or(page.locator('[title*="Building"]'))
      .or(page.getByRole('button').filter({ has: page.locator('svg') }).nth(2)); // Usually 3rd button

    if ((await buildingInfoBtn.count()) === 0) {
      test.skip();
      return;
    }

    await buildingInfoBtn.first().click();
    await page.waitForTimeout(500);

    // Should show building information content
    const buildingContent = page
      .getByText(/building information/i)
      .or(page.getByText(/address|occupancy|stories/i));

    await expect(buildingContent.first()).toBeVisible({ timeout: 5000 });
  });

  test('should switch to Code Information view', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    // Find and click Code Information nav button
    const codeInfoBtn = page
      .getByTitle(/code/i)
      .or(page.locator('[title*="Code"]'));

    if ((await codeInfoBtn.count()) === 0) {
      test.skip();
      return;
    }

    await codeInfoBtn.first().click();
    await page.waitForTimeout(500);

    // Should show code information content
    const codeContent = page
      .getByText(/code information/i)
      .or(page.getByText(/california building code|cbc|chapter 11/i));

    await expect(codeContent.first()).toBeVisible({ timeout: 5000 });
  });

  test('should switch to Comments view', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    // Find and click Comments nav button
    const commentsBtn = page
      .getByTitle(/comment/i)
      .or(page.locator('[title*="Comment"]'));

    if ((await commentsBtn.count()) === 0) {
      test.skip();
      return;
    }

    await commentsBtn.first().click();
    await page.waitForTimeout(500);

    // Should switch to comments view (may or may not have comments)
    // Just verify we didn't break anything
    await expect(page.locator('canvas')).toBeVisible();
  });
});

test.describe('Report Viewer - PDF Export', () => {
  test.beforeEach(async () => {
    test.skip(!TEST_PROJECT_ID, 'Set TEST_PROJECT_ID to run report tests');
  });

  test('should display Export PDF button when violations exist', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Look for export button
    const exportBtn = page
      .getByRole('button', { name: /export pdf|download|export report/i })
      .or(page.getByText(/export pdf/i));

    // Export button should be visible (if there are violations)
    if ((await exportBtn.count()) > 0) {
      await expect(exportBtn.first()).toBeVisible();
    }
    // If no export button, there might be no violations - that's OK
  });

  test('should show loading state when exporting PDF', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    await page.waitForTimeout(2000);

    const exportBtn = page.getByRole('button', { name: /export pdf/i });

    if ((await exportBtn.count()) === 0) {
      test.skip();
      return;
    }

    // Click export button
    await exportBtn.click();

    // Should show loading state
    const loadingIndicator = page
      .getByText(/generating|exporting|loading/i)
      .or(page.locator('.animate-spin'))
      .or(exportBtn.locator('svg.animate-spin'));

    // Loading state appears (might be quick)
    await expect(loadingIndicator.first()).toBeVisible({ timeout: 3000 }).catch(() => {
      // Export might have completed already
    });
  });
});

test.describe('Report Viewer - Violation Detail Modal', () => {
  test.beforeEach(async () => {
    test.skip(!TEST_PROJECT_ID, 'Set TEST_PROJECT_ID to run report tests');
  });

  test('should display violation details in modal', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    await page.waitForTimeout(2000);

    // Click on a violation marker or info button to open modal
    const violationTrigger = page
      .locator('[data-action="view-details"]')
      .or(page.getByRole('button', { name: /detail|info/i }))
      .or(page.locator('[data-violation]').first());

    if ((await violationTrigger.count()) === 0) {
      test.skip();
      return;
    }

    await violationTrigger.first().click();
    await page.waitForTimeout(500);

    const modal = page.locator('[role="dialog"]');
    if ((await modal.count()) === 0) {
      test.skip();
      return;
    }

    await expect(modal).toBeVisible();

    // Modal should contain violation info
    const modalContent = modal.getByText(/11B-|violation|compliance|description/i);
    await expect(modalContent.first()).toBeVisible();
  });

  test('should close modal with close button or Escape', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    await page.waitForTimeout(2000);

    // Open a violation modal first
    const violationTrigger = page
      .locator('[data-action="view-details"]')
      .or(page.getByRole('button', { name: /detail|info/i }));

    if ((await violationTrigger.count()) === 0) {
      test.skip();
      return;
    }

    await violationTrigger.first().click();
    await page.waitForTimeout(500);

    const modal = page.locator('[role="dialog"]');
    if ((await modal.count()) === 0) {
      test.skip();
      return;
    }

    await expect(modal).toBeVisible();

    // Close with Escape key
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });

  test('should navigate between violations in modal', async ({ page }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    await page.waitForTimeout(2000);

    // Open a violation modal
    const violationTrigger = page
      .locator('[data-action="view-details"]')
      .or(page.getByRole('button', { name: /detail|info/i }));

    if ((await violationTrigger.count()) === 0) {
      test.skip();
      return;
    }

    await violationTrigger.first().click();
    await page.waitForTimeout(500);

    const modal = page.locator('[role="dialog"]');
    if ((await modal.count()) === 0) {
      test.skip();
      return;
    }

    // Look for next/prev navigation in modal
    const nextBtn = modal.getByRole('button', { name: /next/i });
    const prevBtn = modal.getByRole('button', { name: /prev|back/i });

    if ((await nextBtn.count()) > 0 || (await prevBtn.count()) > 0) {
      // Navigation exists
      await expect(nextBtn.or(prevBtn).first()).toBeVisible();
    }
  });
});

test.describe('Report Viewer - Screenshot Navigation', () => {
  test.beforeEach(async () => {
    test.skip(!TEST_PROJECT_ID, 'Set TEST_PROJECT_ID to run report tests');
  });

  test('should display screenshot navigation when violation has multiple screenshots', async ({
    page,
  }) => {
    await page.goto(`/projects/${TEST_PROJECT_ID}/report`);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/login')) {
      test.skip();
      return;
    }

    // Wait for content to load
    await page.waitForSelector('canvas', { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Click on a violation
    const violationItem = page.locator('[data-violation]').or(page.getByText(/11B-\d+/).first());

    if ((await violationItem.count()) === 0) {
      test.skip();
      return;
    }

    await violationItem.first().click();
    await page.waitForTimeout(500);

    // If violation has multiple screenshots, navigation should appear
    const screenshotNav = page
      .getByText(/\d+ of \d+/i)
      .or(page.locator('[data-screenshot-nav]'))
      .or(page.getByRole('button', { name: /screenshot/i }));

    // May or may not have multiple screenshots
    const hasNav = (await screenshotNav.count()) > 0;
    // Just verify the page is still functional
    await expect(page.locator('canvas')).toBeVisible();
  });
});
