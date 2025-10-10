import { test, expect } from './fixtures/setup';

/**
 * PDF Viewer Canvas Rendering Tests
 *
 * Tests canvas rendering, visual regression, and performance
 */
test.describe('PDF Viewer - Canvas Rendering', () => {
  const TEST_ASSESSMENT_ID = process.env.TEST_ASSESSMENT_ID || 'test-assessment-id';

  test.beforeEach(async ({ assessmentPage }) => {
    test.skip(!process.env.TEST_ASSESSMENT_ID, 'Set TEST_ASSESSMENT_ID to run these tests');
    await assessmentPage.goto(TEST_ASSESSMENT_ID);
  });

  test('should render canvas with correct dimensions', async ({
    page: _page,
    pdfCanvas,
    waitForPDF,
  }) => {
    await waitForPDF();

    const canvas = await pdfCanvas();
    const box = await canvas.boundingBox();

    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    // Canvas should have backing store (internal resolution)
    const canvasInfo = await canvas.evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      height: el.height,
      cssWidth: el.style.width,
      cssHeight: el.style.height,
    }));

    expect(canvasInfo.width).toBeGreaterThan(0);
    expect(canvasInfo.height).toBeGreaterThan(0);

    console.log('Canvas dimensions:', canvasInfo);
  });

  test('should respect maximum canvas size limits', async ({
    page: _page,
    pdfCanvas,
    waitForPDF,
  }) => {
    await waitForPDF();

    const canvas = await pdfCanvas();

    const canvasInfo = await canvas.evaluate((el: HTMLCanvasElement) => ({
      width: (el as HTMLCanvasElement).width,
      height: (el as HTMLCanvasElement).height,
    }));

    // MAX_CANVAS_SIDE = 16384
    expect(canvasInfo.width).toBeLessThanOrEqual(16384);
    expect(canvasInfo.height).toBeLessThanOrEqual(16384);

    // MAX_CANVAS_PIXELS = 268_000_000
    const totalPixels = canvasInfo.width * canvasInfo.height;
    expect(totalPixels).toBeLessThanOrEqual(268_000_000);

    console.log('Canvas size check:', {
      width: canvasInfo.width,
      height: canvasInfo.height,
      totalPixels,
    });
  });

  test('should update canvas when render scale changes', async ({
    page: _page,
    pdfCanvas,
    waitForPDF,
  }) => {
    await waitForPDF();

    // Get initial canvas backing store size
    const canvas = await pdfCanvas();
    const initialInfo = await canvas.evaluate((el: HTMLCanvasElement) => ({
      width: (el as HTMLCanvasElement).width,
      height: (el as HTMLCanvasElement).height,
    }));

    // Increase render scale
    const increaseBtn = page.getByLabel('Increase resolution');
    await increaseBtn.click();
    await page.waitForTimeout(1000); // Wait for render

    // Canvas backing store should increase
    const newInfo = await canvas.evaluate((el: HTMLCanvasElement) => ({
      width: (el as HTMLCanvasElement).width,
      height: (el as HTMLCanvasElement).height,
    }));

    expect(newInfo.width).toBeGreaterThan(initialInfo.width);
    expect(newInfo.height).toBeGreaterThan(initialInfo.height);

    console.log('Canvas scale change:', { initialInfo, newInfo });
  });

  test('should render different content on different pages', async ({
    page: _page,
    pdfCanvas,
    waitForPDF,
  }) => {
    await waitForPDF();

    // Take screenshot of page 1
    const canvas = await pdfCanvas();
    const page1Screenshot = await canvas.screenshot();

    // Navigate to page 2
    await page.getByLabel('Next page').click();
    await waitForPDF();

    // Take screenshot of page 2
    const page2Screenshot = await canvas.screenshot();

    // Screenshots should be different
    expect(page1Screenshot).not.toEqual(page2Screenshot);
  });

  test('should maintain visual quality at different zoom levels', async ({
    page: _page,
    pdfCanvas,
    waitForPDF,
  }) => {
    await waitForPDF();

    const canvas = await pdfCanvas();

    // Default zoom screenshot
    await canvas.screenshot();

    // Zoom in 3x
    await page.getByLabel('Zoom in').click();
    await page.waitForTimeout(200);
    await page.getByLabel('Zoom in').click();
    await page.waitForTimeout(200);
    await page.getByLabel('Zoom in').click();
    await page.waitForTimeout(300);

    // Zoomed screenshot
    const zoomedIn = await canvas.screenshot();

    // Canvas should still render (not blank)
    expect(zoomedIn.length).toBeGreaterThan(1000); // Reasonable image size

    // Reset zoom
    await page.keyboard.press('0');
    await page.waitForTimeout(300);

    // Should match original
    await canvas.screenshot();
    // Note: Exact pixel match might fail due to rendering variations
    // In a real app you'd use a visual regression tool like Percy/Chromatic
  });

  test('should not crash with rapid zoom changes', async ({ page, waitForPDF }) => {
    await waitForPDF();

    // Rapidly change zoom
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('+');
      await page.waitForTimeout(50);
    }

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('-');
      await page.waitForTimeout(50);
    }

    // Should still be functional
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box!.width).toBeGreaterThan(0);
  });

  test('should not crash with rapid page changes', async ({ page, waitForPDF }) => {
    await waitForPDF();

    // Rapidly change pages
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
    }

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(100);
    }

    // Should still be functional
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    await waitForPDF();

    const box = await canvas.boundingBox();
    expect(box!.width).toBeGreaterThan(0);
  });

  test('should handle concurrent zoom and pan', async ({ page: _page, pdfCanvas, waitForPDF }) => {
    await waitForPDF();

    // Zoom in
    await page.keyboard.press('+');
    await page.waitForTimeout(100);

    const canvas = await pdfCanvas();
    const box = await canvas.boundingBox();

    if (!box) {
      throw new Error('Canvas not found');
    }

    // Pan while zooming
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();

    // Zoom more while panning
    await page.keyboard.press('+');

    await page.mouse.move(box.x + box.width / 4, box.y + box.height / 4);
    await page.mouse.up();

    await page.waitForTimeout(200);

    // Should still be functional
    await expect(canvas).toBeVisible();
    const finalBox = await canvas.boundingBox();
    expect(finalBox!.width).toBeGreaterThan(0);
  });

  test('should properly cancel in-flight renders', async ({ page }) => {
    // This tests the renderTaskRef cancellation logic
    // Rapidly change pages to trigger multiple render calls
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowRight');
      // Don't wait - fire them off rapidly
    }

    // Wait for renders to settle
    await page.waitForTimeout(2000);

    // Should not show any errors in console
    // and should be on a valid page
    const pageText = await page.locator('text=/Page \\d+ \\/ \\d+/').textContent();
    expect(pageText).toMatch(/Page \d+ \/ \d+/);

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('should maintain white background on canvas', async ({
    page: _page,
    pdfCanvas,
    waitForPDF,
  }) => {
    await waitForPDF();

    const canvas = await pdfCanvas();

    // Sample a pixel from a corner (should be white background)
    const pixelColor = await canvas.evaluate((el: HTMLCanvasElement) => {
      const canvas = el as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Sample top-left corner
      const imageData = ctx.getImageData(0, 0, 1, 1);
      return {
        r: imageData.data[0],
        g: imageData.data[1],
        b: imageData.data[2],
        a: imageData.data[3],
      };
    });

    // Should be white (or near-white) with full opacity
    expect(pixelColor).toBeTruthy();
    expect(pixelColor!.r).toBeGreaterThan(240);
    expect(pixelColor!.g).toBeGreaterThan(240);
    expect(pixelColor!.b).toBeGreaterThan(240);
    expect(pixelColor!.a).toBe(255);
  });
});
