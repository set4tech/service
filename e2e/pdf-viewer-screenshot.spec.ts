import { test, expect } from './fixtures/setup';

/**
 * PDF Viewer Screenshot Capture Tests
 *
 * Tests screenshot capture functionality including:
 * - Entering screenshot mode
 * - Selecting regions
 * - Saving screenshots
 * - Keyboard shortcuts
 */
test.describe('PDF Viewer - Screenshot Capture', () => {
  const TEST_ASSESSMENT_ID = process.env.TEST_ASSESSMENT_ID || 'test-assessment-id';

  test.beforeEach(async ({ assessmentPage }) => {
    test.skip(!process.env.TEST_ASSESSMENT_ID, 'Set TEST_ASSESSMENT_ID to run these tests');
    await assessmentPage.goto(TEST_ASSESSMENT_ID);
  });

  test('should toggle screenshot mode with button', async ({ page }) => {
    // Find screenshot button (camera emoji)
    const screenshotBtn = page.getByLabel('Toggle screenshot mode (S)');

    // Should not show screenshot mode banner initially
    await expect(page.locator('text=📸 Screenshot Mode')).not.toBeVisible();

    // Click screenshot button
    await screenshotBtn.click();

    // Should show screenshot mode banner
    await expect(page.locator('text=📸 Screenshot Mode')).toBeVisible();

    // Click again to toggle off
    await screenshotBtn.click();

    // Banner should disappear
    await expect(page.locator('text=📸 Screenshot Mode')).not.toBeVisible();
  });

  test('should toggle screenshot mode with S key', async ({ page }) => {
    // Focus PDF viewer
    await page.locator('[role="region"][aria-label="PDF viewer"]').focus();

    // Press S
    await page.keyboard.press('s');

    // Should show screenshot mode banner
    await expect(page.locator('text=📸 Screenshot Mode')).toBeVisible();

    // Press S again
    await page.keyboard.press('s');

    // Banner should disappear
    await expect(page.locator('text=📸 Screenshot Mode')).not.toBeVisible();
  });

  test('should exit screenshot mode with Escape key', async ({ page }) => {
    // Focus and enter screenshot mode
    await page.locator('[role="region"][aria-label="PDF viewer"]').focus();
    await page.keyboard.press('s');

    await expect(page.locator('text=📸 Screenshot Mode')).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Should exit screenshot mode
    await expect(page.locator('text=📸 Screenshot Mode')).not.toBeVisible();
  });

  test('should show keyboard shortcuts when selection is made', async ({
    page: _page,
    pdfCanvas,
  }) => {
    // Enter screenshot mode
    await page.locator('[role="region"][aria-label="PDF viewer"]').focus();
    await page.keyboard.press('s');

    // Should not show shortcuts yet
    await expect(page.locator('text=C - Current')).not.toBeVisible();

    // Make a selection
    const canvas = await pdfCanvas();
    const box = await canvas.boundingBox();

    if (!box) {
      throw new Error('Canvas not found');
    }

    // Draw a selection rectangle
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.up();

    // Should now show keyboard shortcuts
    await expect(page.locator('text=C - Current')).toBeVisible();
    await expect(page.locator('text=B - Bathroom')).toBeVisible();
    await expect(page.locator('text=D - Door')).toBeVisible();
    await expect(page.locator('text=K - Kitchen')).toBeVisible();
  });

  test('should draw selection rectangle', async ({ page: _page, pdfCanvas }) => {
    // Enter screenshot mode
    await page.locator('[role="region"][aria-label="PDF viewer"]').focus();
    await page.keyboard.press('s');

    const canvas = await pdfCanvas();
    const box = await canvas.boundingBox();

    if (!box) {
      throw new Error('Canvas not found');
    }

    // Draw selection
    const startX = box.x + 100;
    const startY = box.y + 100;
    const endX = box.x + 300;
    const endY = box.y + 300;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY);

    // Selection rectangle should be visible (blue border overlay)
    // This is rendered as a div with specific styling
    // Selection should exist while mouse is down
    await page.mouse.up();

    // After mouse up, "Save to Current" button should appear
    await expect(page.locator('button:has-text("Save to Current")')).toBeVisible();
  });

  test('should show cursor change in screenshot mode', async ({ page: _page, pdfCanvas }) => {
    const canvas = await pdfCanvas();

    // Default cursor should be grab/grabbing
    const defaultCursor = await canvas.evaluate(
      (el: HTMLCanvasElement) => window.getComputedStyle(el.parentElement!).cursor
    );
    expect(defaultCursor).toMatch(/grab/);

    // Enter screenshot mode
    await page.keyboard.press('s');

    // Cursor should change to crosshair
    const screenshotCursor = await canvas.evaluate(
      (el: HTMLCanvasElement) => window.getComputedStyle(el.parentElement!).cursor
    );
    expect(screenshotCursor).toBe('crosshair');
  });

  test('should clear selection when exiting screenshot mode', async ({
    page: _page,
    pdfCanvas,
  }) => {
    // Enter screenshot mode and make selection
    await page.keyboard.press('s');

    const canvas = await pdfCanvas();
    const box = await canvas.boundingBox();

    if (!box) {
      throw new Error('Canvas not found');
    }

    // Draw selection
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.up();

    // Should show save button
    await expect(page.locator('button:has-text("Save to Current")')).toBeVisible();

    // Exit screenshot mode
    await page.keyboard.press('Escape');

    // Save button should disappear
    await expect(page.locator('button:has-text("Save to Current")')).not.toBeVisible();
  });

  test('should disable panning in screenshot mode', async ({ page: _page, pdfCanvas }) => {
    // First zoom in to enable panning
    await page.getByLabel('Zoom in').click();
    await page.getByLabel('Zoom in').click();
    await page.waitForTimeout(300);

    // Enter screenshot mode
    await page.keyboard.press('s');

    const canvas = await pdfCanvas();
    const box = await canvas.boundingBox();

    if (!box) {
      throw new Error('Canvas not found');
    }

    // Try to pan - should create selection instead
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 4, box.y + box.height / 4);
    await page.mouse.up();

    // Should show selection tools (not pan)
    await expect(page.locator('button:has-text("Save to Current")')).toBeVisible();
  });

  test('should change page and exit screenshot mode', async ({ page, waitForPDF }) => {
    // Enter screenshot mode
    await page.keyboard.press('s');

    await expect(page.locator('text=📸 Screenshot Mode')).toBeVisible();

    // Change page
    await page.getByLabel('Next page').click();
    await waitForPDF();

    // Should exit screenshot mode
    await expect(page.locator('text=📸 Screenshot Mode')).not.toBeVisible();
  });

  test('should update detail (render scale) controls', async ({ page }) => {
    // Find detail controls
    const increaseBtn = page.getByLabel('Increase resolution');

    // Get initial scale
    const scaleText = await page.locator('text=/\\d+\\.\\d+x/').first().textContent();
    const initialScale = parseFloat(scaleText?.replace('x', '') || '2.0');

    // Click increase
    await increaseBtn.click();
    await page.waitForTimeout(500); // Wait for API call

    // Check scale increased
    const newScaleText = await page.locator('text=/\\d+\\.\\d+x/').first().textContent();
    const newScale = parseFloat(newScaleText?.replace('x', '') || '2.0');

    expect(newScale).toBe(initialScale + 0.5);
  });

  test('should respect min/max render scale limits', async ({ page }) => {
    const decreaseBtn = page.getByLabel('Decrease resolution');
    const increaseBtn = page.getByLabel('Increase resolution');

    // Try to decrease below minimum (2.0)
    // Click decrease multiple times
    for (let i = 0; i < 10; i++) {
      await decreaseBtn.click({ force: true });
      await page.waitForTimeout(100);
    }

    // Should be capped at 2.0
    const minScaleText = await page.locator('text=/\\d+\\.\\d+x/').first().textContent();
    const minScale = parseFloat(minScaleText?.replace('x', '') || '2.0');
    expect(minScale).toBe(2.0);

    // Button should be disabled at minimum
    await expect(decreaseBtn).toBeDisabled();

    // Try to increase beyond maximum (8.0)
    for (let i = 0; i < 20; i++) {
      await increaseBtn.click({ force: true });
      await page.waitForTimeout(100);
    }

    // Should be capped at 8.0
    const maxScaleText = await page.locator('text=/\\d+\\.\\d+x/').first().textContent();
    const maxScale = parseFloat(maxScaleText?.replace('x', '') || '8.0');
    expect(maxScale).toBe(8.0);

    // Button should be disabled at maximum
    await expect(increaseBtn).toBeDisabled();
  });
});
