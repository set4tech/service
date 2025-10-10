import { test, expect } from './fixtures/setup';

/**
 * PDF Viewer Navigation Tests
 *
 * Tests pan, zoom, and page navigation functionality
 */
test.describe('PDF Viewer - Navigation', () => {
  // Note: You'll need to replace this with an actual assessment ID from your test database
  const TEST_ASSESSMENT_ID = process.env.TEST_ASSESSMENT_ID || 'test-assessment-id';

  test.beforeEach(async ({ assessmentPage }) => {
    // Skip if no test assessment ID is configured
    test.skip(!process.env.TEST_ASSESSMENT_ID, 'Set TEST_ASSESSMENT_ID to run these tests');

    await assessmentPage.goto(TEST_ASSESSMENT_ID);
  });

  test('should load PDF viewer with canvas', async ({ pdfCanvas }) => {
    const canvas = await pdfCanvas();
    await expect(canvas).toBeVisible();

    // Verify canvas has dimensions
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('should display page controls', async ({ page }) => {
    // Check for page navigation buttons
    await expect(page.getByLabel('Previous page')).toBeVisible();
    await expect(page.getByLabel('Next page')).toBeVisible();

    // Check for page counter
    await expect(page.locator('text=/Page \\d+ \\/ \\d+/')).toBeVisible();
  });

  test('should navigate to next page with button', async ({ page, waitForPDF }) => {
    // Get initial page number
    const pageText = await page.locator('text=/Page \\d+ \\/ \\d+/').textContent();
    const initialPage = parseInt(pageText!.match(/Page (\d+)/)?.[1] || '1');

    // Click next page
    await page.getByLabel('Next page').click();

    // Wait for PDF to update
    await waitForPDF();

    // Verify page number increased
    const newPageText = await page.locator('text=/Page \\d+ \\/ \\d+/').textContent();
    const newPage = parseInt(newPageText!.match(/Page (\d+)/)?.[1] || '1');

    expect(newPage).toBe(initialPage + 1);
  });

  test('should navigate pages with arrow keys', async ({ page, waitForPDF }) => {
    // Focus on PDF viewer
    await page.locator('[role="region"][aria-label="PDF viewer"]').focus();

    // Get initial page
    const pageText = await page.locator('text=/Page \\d+ \\/ \\d+/').textContent();
    const initialPage = parseInt(pageText!.match(/Page (\d+)/)?.[1] || '1');

    // Press right arrow
    await page.keyboard.press('ArrowRight');
    await waitForPDF();

    // Verify page increased
    const newPageText = await page.locator('text=/Page \\d+ \\/ \\d+/').textContent();
    const newPage = parseInt(newPageText!.match(/Page (\d+)/)?.[1] || '1');
    expect(newPage).toBe(initialPage + 1);

    // Press left arrow
    await page.keyboard.press('ArrowLeft');
    await waitForPDF();

    // Verify back to original page
    const finalPageText = await page.locator('text=/Page \\d+ \\/ \\d+/').textContent();
    const finalPage = parseInt(finalPageText!.match(/Page (\d+)/)?.[1] || '1');
    expect(finalPage).toBe(initialPage);
  });

  test('should zoom in with button', async ({ page }) => {
    // Get initial zoom level
    const zoomText = await page.locator('text=/\\d+%/').first().textContent();
    const initialZoom = parseInt(zoomText?.replace('%', '') || '100');

    // Click zoom in
    await page.getByLabel('Zoom in').click();

    // Wait a bit for zoom to apply
    await page.waitForTimeout(200);

    // Verify zoom increased
    const newZoomText = await page.locator('text=/\\d+%/').first().textContent();
    const newZoom = parseInt(newZoomText?.replace('%', '') || '100');

    expect(newZoom).toBeGreaterThan(initialZoom);
  });

  test('should zoom out with button', async ({ page }) => {
    // First zoom in to give room to zoom out
    await page.getByLabel('Zoom in').click();
    await page.waitForTimeout(200);

    // Get current zoom level
    const zoomText = await page.locator('text=/\\d+%/').first().textContent();
    const initialZoom = parseInt(zoomText?.replace('%', '') || '100');

    // Click zoom out
    await page.getByLabel('Zoom out').click();
    await page.waitForTimeout(200);

    // Verify zoom decreased
    const newZoomText = await page.locator('text=/\\d+%/').first().textContent();
    const newZoom = parseInt(newZoomText?.replace('%', '') || '100');

    expect(newZoom).toBeLessThan(initialZoom);
  });

  test('should zoom with keyboard shortcuts', async ({ page }) => {
    // Focus on PDF viewer
    await page.locator('[role="region"][aria-label="PDF viewer"]').focus();

    // Get initial zoom
    const zoomText = await page.locator('text=/\\d+%/').first().textContent();
    const initialZoom = parseInt(zoomText?.replace('%', '') || '100');

    // Zoom in with +
    await page.keyboard.press('+');
    await page.waitForTimeout(200);

    const zoomInText = await page.locator('text=/\\d+%/').first().textContent();
    const zoomIn = parseInt(zoomInText?.replace('%', '') || '100');
    expect(zoomIn).toBeGreaterThan(initialZoom);

    // Zoom out with -
    await page.keyboard.press('-');
    await page.waitForTimeout(200);

    const zoomOutText = await page.locator('text=/\\d+%/').first().textContent();
    const zoomOut = parseInt(zoomOutText?.replace('%', '') || '100');
    expect(zoomOut).toBeLessThan(zoomIn);

    // Reset zoom with 0
    await page.keyboard.press('0');
    await page.waitForTimeout(200);

    const resetText = await page.locator('text=/\\d+%/').first().textContent();
    const resetZoom = parseInt(resetText?.replace('%', '') || '100');
    expect(resetZoom).toBe(100);
  });

  test('should pan the PDF by dragging', async ({ page, pdfCanvas }) => {
    // First zoom in to enable panning
    await page.getByLabel('Zoom in').click();
    await page.getByLabel('Zoom in').click();
    await page.waitForTimeout(300);

    const canvas = await pdfCanvas();
    const box = await canvas.boundingBox();

    if (!box) {
      throw new Error('Canvas not found');
    }

    // Take screenshot before panning
    const beforePan = await page.screenshot();

    // Drag from center to top-left (pan down-right)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 4, box.y + box.height / 4);
    await page.mouse.up();

    await page.waitForTimeout(200);

    // Take screenshot after panning
    const afterPan = await page.screenshot();

    // Screenshots should be different (content panned)
    expect(beforePan).not.toEqual(afterPan);
  });

  test('should persist zoom level across page changes', async ({ page, waitForPDF }) => {
    // Zoom in
    await page.getByLabel('Zoom in').click();
    await page.getByLabel('Zoom in').click();
    await page.waitForTimeout(300);

    const zoomText = await page.locator('text=/\\d+%/').first().textContent();
    const zoomLevel = parseInt(zoomText?.replace('%', '') || '100');

    // Change page
    await page.getByLabel('Next page').click();
    await waitForPDF();

    // Check zoom is still the same
    const newZoomText = await page.locator('text=/\\d+%/').first().textContent();
    const newZoomLevel = parseInt(newZoomText?.replace('%', '') || '100');

    expect(newZoomLevel).toBe(zoomLevel);
  });

  test('should show keyboard shortcuts hint', async ({ page }) => {
    // Look for shortcuts hint (visible on desktop)
    const shortcutsHint = page.locator('text=/Shortcuts.*←.*→/');

    // Should be visible on desktop (hidden on mobile with sm:inline class)
    await expect(shortcutsHint).toBeVisible();
  });
});
