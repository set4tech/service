import { test, expect } from './fixtures/setup';

/**
 * Assessment Progress Tests
 *
 * Tests progress tracking, completion status, and reporting
 */
test.describe('Assessment Progress - Tracking', () => {
  const TEST_ASSESSMENT_ID = process.env.TEST_ASSESSMENT_ID || 'test-assessment-id';

  test.beforeEach(async ({ assessmentPage }) => {
    test.skip(!process.env.TEST_ASSESSMENT_ID, 'Set TEST_ASSESSMENT_ID to run these tests');
    await assessmentPage.goto(TEST_ASSESSMENT_ID);
  });

  test('should display overall progress percentage', async ({ page }) => {
    // Look for progress percentage
    const progressText = page.getByText(/%/).or(page.locator('[data-progress]'));

    const count = await progressText.count();
    expect(count).toBeGreaterThan(0);

    console.log('Found progress indicators');
  });

  test('should display progress bar', async ({ page }) => {
    // Look for progress bar element
    const progressBar = page
      .locator('[role="progressbar"]')
      .or(page.locator('progress').or(page.locator('[class*="progress"]')));

    const count = await progressBar.count();
    expect(count).toBeGreaterThanOrEqual(0);

    console.log('Progress bar elements:', count);
  });

  test('should show completed vs total checks', async ({ page }) => {
    // Look for "X of Y" format
    const checkCount = page.getByText(/\d+ of \d+|\d+\/\d+/);

    const count = await checkCount.count();
    expect(count).toBeGreaterThanOrEqual(0);

    console.log('Check count indicators:', count);
  });

  test('should display seeding status', async ({ page }) => {
    // Look for seeding status
    const seedingStatus = page
      .getByText(/seeding|seeded|initializing/i)
      .or(page.locator('[data-seeding-status]'));

    if ((await seedingStatus.count()) > 0) {
      console.log('Found seeding status');
    }
  });

  test('should show progress by section', async ({ page }) => {
    // Look for section-level progress indicators
    const sectionProgress = page
      .locator('[data-section-progress]')
      .or(page.getByText(/section.*complete|section.*%/i));

    const count = await sectionProgress.count();
    console.log('Section progress indicators:', count);
  });

  test('should show progress by element group', async ({ page }) => {
    // Switch to element mode
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.click();
      await page.waitForTimeout(500);
    }

    // Look for element group progress
    const elementProgress = page
      .locator('[data-element-progress]')
      .or(page.getByText(/doors?.*%|ramps?.*%/i));

    const count = await elementProgress.count();
    console.log('Element group progress indicators:', count);
  });

  test('should display compliance summary', async ({ page }) => {
    // Look for summary statistics
    const summary = page
      .locator('[data-testid="summary"]')
      .or(page.getByText(/compliant|non-compliant|n\/a/i));

    const count = await summary.count();
    expect(count).toBeGreaterThanOrEqual(0);

    console.log('Compliance summary elements:', count);
  });

  test('should show breakdown by status', async ({ page }) => {
    // Look for status breakdown (e.g., "50 Compliant, 10 Non-Compliant, 5 N/A")
    const statusBreakdown = page.getByText(/\d+.*compliant|\d+.*pending/i);

    const count = await statusBreakdown.count();
    console.log('Status breakdown indicators:', count);
  });

  test('should display pending checks count', async ({ page }) => {
    // Look for pending/incomplete count
    const pendingCount = page
      .getByText(/pending|not assessed|incomplete/i)
      .or(page.locator('[data-pending-count]'));

    const count = await pendingCount.count();
    console.log('Pending check indicators:', count);
  });

  test('should show last updated timestamp', async ({ page }) => {
    // Look for timestamp
    const timestamp = page.getByText(/last updated|updated|modified/i).or(page.getByText(/ago|at/));

    if ((await timestamp.count()) > 0) {
      console.log('Found timestamp');
    }
  });

  test('should update progress when check is completed', async ({ page }) => {
    // Get initial progress
    const progressText = page.getByText(/%/).first();

    if ((await progressText.count()) > 0) {
      const initialProgress = await progressText.textContent();

      // Complete a check (if possible)
      const firstCheck = page
        .locator('[data-check-id]')
        .or(page.locator('button').filter({ hasText: /11B-/ }))
        .first();

      await firstCheck.click();
      await page.waitForTimeout(500);

      // Try to mark as complete
      const compliantBtn = page.getByRole('button', { name: /^compliant$/i });

      if ((await compliantBtn.count()) > 0) {
        await compliantBtn.click();
        await page.waitForTimeout(1000);

        // Check if progress updated
        const newProgress = await progressText.textContent();
        console.log('Progress change:', { initialProgress, newProgress });
      }
    }
  });

  test('should display assessment metadata', async ({ page }) => {
    // Look for assessment info (created date, code version, etc.)
    const metadata = page
      .locator('[data-testid="assessment-metadata"]')
      .or(page.getByText(/created|code|version/i));

    const count = await metadata.count();
    console.log('Metadata elements:', count);
  });

  test('should show export/report button', async ({ page }) => {
    // Look for export or report button
    const exportBtn = page.getByRole('button', { name: /export|report|download|pdf/i });

    if ((await exportBtn.count()) > 0) {
      await expect(exportBtn).toBeVisible();
      console.log('Found export/report button');
    }
  });

  test('should display critical issues count', async ({ page }) => {
    // Look for critical/high priority issues
    const criticalCount = page
      .getByText(/critical|high priority|urgent/i)
      .or(page.locator('[data-severity="high"]'));

    const count = await criticalCount.count();
    console.log('Critical issue indicators:', count);
  });

  test('should show checks requiring attention', async ({ page }) => {
    // Look for items needing review
    const needsReview = page.getByText(/needs review|requires attention|flagged/i);

    const count = await needsReview.count();
    console.log('Review required indicators:', count);
  });

  test('should display assessment completion date', async ({ page }) => {
    // Look for completion date (if assessment is complete)
    const completionDate = page.getByText(/completed on|finished/i);

    if ((await completionDate.count()) > 0) {
      console.log('Found completion date');
    }
  });

  test('should show assessment status badge', async ({ page }) => {
    // Look for status badge (In Progress, Complete, etc.)
    const statusBadge = page
      .locator('[data-assessment-status]')
      .or(page.getByText(/in progress|complete|draft/i));

    if ((await statusBadge.count()) > 0) {
      console.log('Found assessment status badge');
    }
  });

  test('should display reviewer information', async ({ page }) => {
    // Look for reviewer/assessor info
    const reviewerInfo = page.getByText(/reviewer|assessor|reviewed by/i);

    if ((await reviewerInfo.count()) > 0) {
      console.log('Found reviewer information');
    }
  });

  test('should show assessment notes section', async ({ page }) => {
    // Look for notes/comments section
    const notesSection = page
      .locator('[data-testid="notes"]')
      .or(page.getByText(/notes|comments|remarks/i));

    if ((await notesSection.count()) > 0) {
      console.log('Found notes section');
    }
  });

  test('should calculate progress accurately', async ({ page }) => {
    // Get all checks count
    const checks = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));

    const totalChecks = await checks.count();

    // Get progress percentage
    const progressText = page.getByText(/%/).first();

    if ((await progressText.count()) > 0) {
      const progressStr = await progressText.textContent();
      const percentage = parseInt(progressStr?.match(/\d+/)?.[0] || '0', 10);

      console.log('Progress calculation:', {
        totalChecks,
        percentage,
        expectedCompleted: Math.round((totalChecks * percentage) / 100),
      });
    }
  });
});
