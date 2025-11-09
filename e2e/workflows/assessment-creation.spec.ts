import { test, expect } from '../fixtures/setup';
import { loginAsUser } from '../fixtures/auth-helpers';
import { createTestAssessment, deleteTestAssessment, seedTestChecks } from '../fixtures/test-data';

/**
 * Complete Assessment Creation Workflow Tests
 *
 * Tests the full user journey from creating an assessment to completing checks
 */
test.describe('Complete Assessment Creation Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure we're logged in before each test
    await loginAsUser(page);
  });

  test('should create assessment from scratch and complete first check', async ({ page }) => {
    // Create a new assessment (customer, project, upload PDF, seed checks)
    const { assessmentId } = await createTestAssessment(page, {
      customerName: 'E2E Test Customer',
      projectName: 'E2E Test Project',
      waitForSeeding: true,
    });

    // Verify we're on the assessment page
    await expect(page).toHaveURL(new RegExp(`/assessments/${assessmentId}`));

    // Verify PDF loaded
    await expect(page.locator('canvas')).toBeVisible();
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return canvas && (canvas as HTMLCanvasElement).width > 0;
    });

    // Verify checks are loaded
    const checks = page.locator('[data-check-id]');
    const checkCount = await checks.count();
    expect(checkCount).toBeGreaterThan(0);

    // Select first check
    const firstCheck = checks.first();
    await firstCheck.click();
    await page.waitForTimeout(500);

    // Take a screenshot for the check
    await page.keyboard.press('s'); // Enter screenshot mode

    // Wait for screenshot mode banner
    await expect(page.getByText(/screenshot mode/i)).toBeVisible();

    // Draw selection
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();

    if (!box) {
      throw new Error('Canvas not found');
    }

    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 400, box.y + 350);
    await page.mouse.up();

    // Save screenshot to current check
    await page.getByRole('button', { name: /save to current|save screenshot/i }).click();
    await page.waitForTimeout(1000);

    // Mark check as compliant
    await page.getByRole('button', { name: /^compliant$/i }).click();

    // Fill in note
    const noteInput = page.locator('textarea').or(page.getByPlaceholder(/note|comment/i));
    if (await noteInput.isVisible()) {
      await noteInput.fill('Test compliance note - check meets all requirements');
    }

    // Save the override
    const saveBtn = page.getByRole('button', { name: /save|confirm/i });
    await saveBtn.click();
    await page.waitForTimeout(1000);

    // Verify progress updated
    const progressText = page.getByText(/\d+ of \d+ complete/i);
    await expect(progressText).toBeVisible();

    // Verify screenshot appears in gallery
    const screenshot = page
      .locator('img[src*="screenshot"]')
      .or(page.locator('[data-screenshot-id]'));
    await expect(screenshot).toBeVisible({ timeout: 5000 });

    // Clean up - delete test assessment
    await deleteTestAssessment(page, assessmentId);
  });

  test('should handle assessment creation with invalid PDF', async ({ page }) => {
    await page.goto('/projects');

    // Click new assessment button
    const newAssessmentBtn = page.getByRole('button', {
      name: /new assessment|create assessment/i,
    });
    await newAssessmentBtn.click();

    // Try to upload invalid file (text file instead of PDF)
    const fileInput = page.locator('input[type="file"]');

    // Create a temporary text file
    await fileInput.setInputFiles({
      name: 'invalid.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('This is not a PDF'),
    });

    // Should show error message
    await expect(page.getByText(/invalid file type|must be a pdf|only pdf files/i)).toBeVisible({
      timeout: 5000,
    });

    // Cancel button should be visible
    const cancelBtn = page.getByRole('button', { name: /cancel/i });
    await expect(cancelBtn).toBeVisible();
  });

  test('should persist progress across page reload', async ({ page }) => {
    // Create assessment and complete 3 checks
    const { assessmentId } = await createTestAssessment(page, {
      waitForSeeding: true,
    });

    // Complete 3 checks with different statuses
    await seedTestChecks(page, assessmentId, {
      compliant: 2,
      nonCompliant: 1,
      notApplicable: 0,
    });

    // Get progress before reload
    const progressBefore = await page
      .getByText(/\d+ of \d+/)
      .first()
      .textContent();

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify progress is still the same
    const progressAfter = await page
      .getByText(/\d+ of \d+/)
      .first()
      .textContent();

    expect(progressAfter).toBe(progressBefore);

    // Verify checks still have their status
    const compliantChecks = page.locator('[data-status="compliant"]');
    await expect(compliantChecks).toHaveCount(2);

    const nonCompliantChecks = page.locator('[data-status="non-compliant"]');
    await expect(nonCompliantChecks).toHaveCount(1);

    // Clean up
    await deleteTestAssessment(page, assessmentId);
  });

  test('should handle large PDF upload (50+ pages)', async ({ page }) => {
    // Note: This test requires a large test PDF file
    // Skip if file doesn't exist
    test.skip(
      true, // TODO: Add large PDF fixture
      'Requires large test PDF - create ./e2e/fixtures/large-test-plans.pdf'
    );

    const { assessmentId } = await createTestAssessment(page, {
      pdfPath: './e2e/fixtures/large-test-plans.pdf',
      waitForSeeding: true,
    });

    // Verify PDF loaded
    await expect(page.locator('canvas')).toBeVisible({ timeout: 60000 });

    // Verify page navigation works with many pages
    const pageInfo = page.getByText(/Page \d+ \/ \d+/);
    await expect(pageInfo).toBeVisible();

    const pageText = await pageInfo.textContent();
    const totalPages = parseInt(pageText?.match(/\/ (\d+)/)?.[1] || '0');
    expect(totalPages).toBeGreaterThan(50);

    // Navigate to page 25
    await page.keyboard.press('g'); // Jump to page shortcut
    await page.fill('input[type="number"]', '25');
    await page.keyboard.press('Enter');

    await expect(page.getByText(/Page 25 \//)).toBeVisible({ timeout: 5000 });

    // Clean up
    await deleteTestAssessment(page, assessmentId);
  });
});
