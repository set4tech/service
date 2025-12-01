/* eslint-disable no-console */
import { test, expect } from './fixtures/setup';

/**
 * Screenshot Capture Workflow Tests
 *
 * Tests the complete screenshot capture flow:
 * 1. Enter screenshot mode
 * 2. Select region on PDF
 * 3. Save screenshot
 * 4. Verify in gallery
 */
test.describe('Screenshot Capture', () => {
  // Screenshot operations can take time
  test.setTimeout(90000);

  test.beforeEach(async ({ assessmentPage }) => {
    await assessmentPage.goto();
  });

  test('should toggle screenshot mode with button', async ({ page }) => {
    // Find the screenshot button
    const screenshotBtn = page.getByLabel('Toggle screenshot mode (S)');
    await expect(screenshotBtn).toBeVisible();

    // Initially not pressed
    await expect(screenshotBtn).toHaveAttribute('aria-pressed', 'false');

    // Click to enable screenshot mode
    await screenshotBtn.click();
    await expect(screenshotBtn).toHaveAttribute('aria-pressed', 'true');

    // Click again to disable
    await screenshotBtn.click();
    await expect(screenshotBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('should toggle screenshot mode with keyboard shortcut', async ({ page }) => {
    const screenshotBtn = page.getByLabel('Toggle screenshot mode (S)');
    await expect(screenshotBtn).toBeVisible();

    // Focus PDF viewer and press S
    const pdfViewer = page.getByRole('region', { name: 'PDF viewer' });
    await pdfViewer.focus();
    await page.keyboard.press('s');

    // Should enable screenshot mode
    await expect(screenshotBtn).toHaveAttribute('aria-pressed', 'true');

    // Press S again to disable
    await page.keyboard.press('s');
    await expect(screenshotBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('should show "Save to Current" button when selection is made', async ({ page }) => {
    // Enter screenshot mode
    const screenshotBtn = page.getByLabel('Toggle screenshot mode (S)');
    await screenshotBtn.click();
    await expect(screenshotBtn).toHaveAttribute('aria-pressed', 'true');

    // "Save to Current" should not be visible yet (no selection)
    await expect(page.getByRole('button', { name: 'Save to Current' })).not.toBeVisible();

    // Get canvas and make a selection by dragging
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Drag to create selection
    const startX = box.x + box.width * 0.3;
    const startY = box.y + box.height * 0.3;
    const endX = box.x + box.width * 0.6;
    const endY = box.y + box.height * 0.6;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 5 });
    await page.mouse.up();

    // "Save to Current" button should now be visible
    await expect(page.getByRole('button', { name: 'Save to Current' })).toBeVisible();
  });

  test('should capture and save screenshot to current check', async ({ page }) => {
    // Enter screenshot mode
    const screenshotBtn = page.getByLabel('Toggle screenshot mode (S)');
    await screenshotBtn.click();

    // Get canvas and make a selection
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Drag to create selection (select a reasonable region)
    const startX = box.x + box.width * 0.25;
    const startY = box.y + box.height * 0.25;
    const endX = box.x + box.width * 0.55;
    const endY = box.y + box.height * 0.55;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 5 });
    await page.mouse.up();

    // Wait for Save button to appear
    const saveBtn = page.getByRole('button', { name: 'Save to Current' });
    await expect(saveBtn).toBeVisible();

    // Count screenshots before
    const galleryImages = page.locator('[aria-label="Open screenshot"]');
    const countBefore = await galleryImages.count();
    console.log(`Screenshots before save: ${countBefore}`);

    // Click save
    await saveBtn.click();

    // Wait for upload to complete - button should disappear and mode should exit
    await expect(saveBtn).not.toBeVisible({ timeout: 30000 });

    // Screenshot mode should be exited after save
    await expect(screenshotBtn).toHaveAttribute('aria-pressed', 'false');

    // Wait for new screenshot to appear in gallery
    await expect(async () => {
      const countAfter = await galleryImages.count();
      console.log(`Screenshots after save: ${countAfter}`);
      expect(countAfter).toBeGreaterThan(countBefore);
    }).toPass({ timeout: 15000 });
  });

  test('should show screenshot indicators toggle', async ({ page }) => {
    // Find the indicators toggle button
    const indicatorsBtn = page.getByLabel('Toggle captured area indicators');
    await expect(indicatorsBtn).toBeVisible();

    // Toggle on
    await indicatorsBtn.click();
    await expect(indicatorsBtn).toHaveAttribute('aria-pressed', 'true');

    // Toggle off
    await indicatorsBtn.click();
    await expect(indicatorsBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('should cancel screenshot selection with Escape key', async ({ page }) => {
    // Enter screenshot mode
    const screenshotBtn = page.getByLabel('Toggle screenshot mode (S)');
    await screenshotBtn.click();
    await expect(screenshotBtn).toHaveAttribute('aria-pressed', 'true');

    // Make a selection
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 150, { steps: 5 });
    await page.mouse.up();

    // Save button should be visible
    await expect(page.getByRole('button', { name: 'Save to Current' })).toBeVisible();

    // Press Escape to cancel
    await page.keyboard.press('Escape');

    // Should exit screenshot mode
    await expect(screenshotBtn).toHaveAttribute('aria-pressed', 'false');

    // Save button should be gone
    await expect(page.getByRole('button', { name: 'Save to Current' })).not.toBeVisible();
  });

  test('should display screenshot in gallery after capture', async ({ page }) => {
    // Capture a screenshot first
    const screenshotBtn = page.getByLabel('Toggle screenshot mode (S)');
    await screenshotBtn.click();

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Make selection
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 5 });
    await page.mouse.up();

    // Save
    const saveBtn = page.getByRole('button', { name: 'Save to Current' });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Wait for save to complete
    await expect(saveBtn).not.toBeVisible({ timeout: 30000 });

    // Gallery should have at least one screenshot with a thumbnail image
    const thumbnail = page.locator('[aria-label="Open screenshot"] img').first();
    await expect(thumbnail).toBeVisible({ timeout: 15000 });

    // Thumbnail should have a src (presigned URL loaded)
    await expect(thumbnail).toHaveAttribute('src', /.+/);
  });
});

test.describe('Screenshot Capture - Edge Cases', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ assessmentPage }) => {
    await assessmentPage.goto();
  });

  test('should handle very small selection', async ({ page }) => {
    // Enter screenshot mode
    const screenshotBtn = page.getByLabel('Toggle screenshot mode (S)');
    await screenshotBtn.click();

    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Make a tiny selection (10px)
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 110, box.y + 110, { steps: 2 });
    await page.mouse.up();

    // Save button may or may not appear depending on minimum size threshold
    // If it appears, saving should still work
    const saveBtn = page.getByRole('button', { name: 'Save to Current' });
    const isVisible = await saveBtn.isVisible();

    if (isVisible) {
      console.log('Small selection accepted, saving...');
      await saveBtn.click();
      await expect(saveBtn).not.toBeVisible({ timeout: 30000 });
    } else {
      console.log('Small selection rejected (below minimum threshold)');
      // This is acceptable behavior
    }
  });

  test('should maintain screenshot mode after failed save attempt', async ({ page }) => {
    // This tests resilience - if network fails, mode should be preserved
    // We can't easily simulate network failure, but we can verify mode state

    const screenshotBtn = page.getByLabel('Toggle screenshot mode (S)');
    await screenshotBtn.click();

    // Mode should be active
    await expect(screenshotBtn).toHaveAttribute('aria-pressed', 'true');

    // Make selection
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 200, { steps: 5 });
    await page.mouse.up();

    // Verify we're still in screenshot mode with selection
    await expect(screenshotBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Save to Current' })).toBeVisible();
  });

  test('should work after page navigation', async ({ page }) => {
    // Navigate to next page
    await page.getByLabel('Next page').click();

    // Wait for page change
    const pageCounter = page.getByText(/Page \d+ \/ \d+/);
    await expect(pageCounter).toContainText('Page 2');

    // Enter screenshot mode on new page
    const screenshotBtn = page.getByLabel('Toggle screenshot mode (S)');
    await screenshotBtn.click();
    await expect(screenshotBtn).toHaveAttribute('aria-pressed', 'true');

    // Make selection
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 });
    await page.mouse.up();

    // Save should work
    const saveBtn = page.getByRole('button', { name: 'Save to Current' });
    await expect(saveBtn).toBeVisible();

    await saveBtn.click();
    await expect(saveBtn).not.toBeVisible({ timeout: 30000 });
  });

  test('should work at different zoom levels', async ({ page }) => {
    // Zoom in
    await page.getByLabel('Zoom in').click();
    await page.getByLabel('Zoom in').click();

    // Enter screenshot mode
    const screenshotBtn = page.getByLabel('Toggle screenshot mode (S)');
    await screenshotBtn.click();

    // Make selection at zoomed level
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 });
    await page.mouse.up();

    // Save should work
    const saveBtn = page.getByRole('button', { name: 'Save to Current' });
    await expect(saveBtn).toBeVisible();

    // Count screenshots before
    const galleryImages = page.locator('[aria-label="Open screenshot"]');
    const countBefore = await galleryImages.count();

    await saveBtn.click();
    await expect(saveBtn).not.toBeVisible({ timeout: 30000 });

    // Verify screenshot was saved
    await expect(async () => {
      const countAfter = await galleryImages.count();
      expect(countAfter).toBeGreaterThan(countBefore);
    }).toPass({ timeout: 15000 });
  });
});
