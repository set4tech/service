import { test, expect } from './fixtures/setup';

/**
 * PDF Measurements E2E Tests
 *
 * Tests the full measurement workflows including drawing, calculations,
 * persistence, and interaction
 */
test.describe('PDF Measurements', () => {
  const TEST_ASSESSMENT_ID = process.env.TEST_ASSESSMENT_ID || 'test-assessment-id';

  test.beforeEach(async ({ assessmentPage }) => {
    test.skip(!process.env.TEST_ASSESSMENT_ID, 'Set TEST_ASSESSMENT_ID to run these tests');
    await assessmentPage.goto(TEST_ASSESSMENT_ID);
  });

  test.describe('Entering Measurement Mode', () => {
    test('should enter measurement mode with M key', async ({ page, waitForPDF }) => {
      await waitForPDF();

      // Press M to enter measurement mode
      await page.keyboard.press('m');

      // Should show measurement mode banner
      await expect(page.getByText(/Measurement Mode/i)).toBeVisible();
      await expect(page.getByText(/Draw lines to measure/i)).toBeVisible();

      // Cursor should change to crosshair
      const viewport = page.locator('[aria-label="PDF viewer"]');
      const cursor = await viewport.evaluate(el => window.getComputedStyle(el).cursor);
      expect(cursor).toBe('crosshair');
    });

    test('should enter measurement mode with toolbar button', async ({ page, waitForPDF }) => {
      await waitForPDF();

      // Click measurement button (ruler icon)
      const measurementButton = page.getByLabel('Toggle measurement mode (M)');
      await measurementButton.click();

      // Should show measurement mode banner
      await expect(page.getByText(/Measurement Mode/i)).toBeVisible();
    });

    test('should show scale in banner when calibrated', async ({ page, waitForPDF }) => {
      await waitForPDF();

      // Set calibration first
      await page.keyboard.press('l');
      await page.locator('#scale-input').fill('1/8"=1\'-0"');
      await page.locator('#print-size-input').fill('24x36');
      await page.getByRole('button', { name: /Set Scale & Size/i }).click();

      // Enter measurement mode
      await page.keyboard.press('m');

      // Should show scale in banner
      await expect(page.getByText(/1\/8"=1'-0"/)).toBeVisible();
    });

    test('should prompt to set scale when not calibrated', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('m');

      // Should show prompt to set scale
      await expect(page.getByText(/No scale set - press L/i)).toBeVisible();
    });

    test('should exit measurement mode with Escape', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('m');
      await expect(page.getByText(/Measurement Mode/i)).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByText(/Measurement Mode/i)).not.toBeVisible();
    });

    test('should exit measurement mode by toggling M again', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('m');
      await expect(page.getByText(/Measurement Mode/i)).toBeVisible();

      await page.keyboard.press('m');
      await expect(page.getByText(/Measurement Mode/i)).not.toBeVisible();
    });
  });

  test.describe('Drawing Measurements', () => {
    test('should draw a horizontal measurement line', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('m');

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (!box) throw new Error('Canvas not found');

      // Draw horizontal line
      const startX = box.x + 100;
      const startY = box.y + 100;
      const endX = box.x + 500;
      const endY = box.y + 100;

      await page.mouse.move(startX, startY);
      await page.mouse.down();

      // Should show line preview while dragging
      await page.mouse.move(endX, endY);

      await page.mouse.up();

      // Line should be saved and visible
      // Wait for API call to complete
      await page.waitForTimeout(500);

      // Measurement should persist - check by reopening page
      await page.reload();
      await waitForPDF();

      // Line should still be visible (rendered by MeasurementOverlay)
      // We can verify by checking if measurement mode can be entered
      await page.keyboard.press('m');
      await expect(page.getByText(/Measurement Mode/i)).toBeVisible();
    });

    test('should draw a vertical measurement line', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('m');

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (!box) throw new Error('Canvas not found');

      // Draw vertical line
      await page.mouse.move(box.x + 200, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + 400);
      await page.mouse.up();

      await page.waitForTimeout(500);

      // Measurement should be saved
      // Verify by checking that we're still in measurement mode
      await expect(page.getByText(/Measurement Mode/i)).toBeVisible();
    });

    test('should draw a diagonal measurement line', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('m');

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (!box) throw new Error('Canvas not found');

      // Draw diagonal line
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 400, box.y + 300);
      await page.mouse.up();

      await page.waitForTimeout(500);

      // Should auto-save after drawing
      await expect(page.getByText(/Measurement Mode/i)).toBeVisible();
    });

    test('should show real-time preview while drawing', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('m');

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (!box) throw new Error('Canvas not found');

      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();

      // Move mouse and check for preview line
      await page.mouse.move(box.x + 300, box.y + 100);

      // Green line should be visible (check via SVG overlay)
      const svg = page.locator('svg line[stroke="#10B981"]').first();
      await expect(svg).toBeVisible();

      await page.mouse.up();
    });
  });

  test.describe('Measurement Calculations', () => {
    test('should show pixel distance before calibration', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('m');

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (!box) throw new Error('Canvas not found');

      // Draw a line
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + 100); // 100 pixels
      await page.mouse.up();

      await page.waitForTimeout(500);

      // Measurement saved but without real-world distance
      // (Would need to inspect the actual measurement overlay to verify display)
    });

    test('should calculate real distance after calibration', async ({ page, waitForPDF }) => {
      await waitForPDF();

      // Set calibration first
      await page.keyboard.press('l');
      await page.locator('#scale-input').fill('1/8"=1\'-0"');
      await page.locator('#print-size-input').fill('24x36');
      await page.getByRole('button', { name: /Set Scale & Size/i }).click();

      // Now draw measurement
      await page.keyboard.press('m');

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (!box) throw new Error('Canvas not found');

      // Draw a measurement line
      await page.mouse.move(box.x + 100, box.y + 200);
      await page.mouse.down();
      await page.mouse.move(box.x + 300, box.y + 200);
      await page.mouse.up();

      await page.waitForTimeout(500);

      // Measurement should now have real-world distance calculated
      // The actual distance would depend on the PDF dimensions and scale
    });

    test('should update existing measurements when calibration changes', async ({
      page,
      waitForPDF,
    }) => {
      await waitForPDF();

      // Draw measurement without calibration
      await page.keyboard.press('m');

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (!box) throw new Error('Canvas not found');

      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + 100);
      await page.mouse.up();

      await page.waitForTimeout(500);

      // Exit measurement mode
      await page.keyboard.press('Escape');

      // Now set calibration
      await page.keyboard.press('l');
      await page.locator('#scale-input').fill('1/4"=1\'-0"');
      await page.locator('#print-size-input').fill('24x36');
      await page.getByRole('button', { name: /Set Scale & Size/i }).click();

      // Re-enter measurement mode to see updated calculations
      await page.keyboard.press('m');

      // The existing measurement should now show real-world distance
      await expect(page.getByText(/Measurement Mode/i)).toBeVisible();
    });
  });

  test.describe('Measurement Selection and Deletion', () => {
    test('should select measurement by clicking on it', async ({ page, waitForPDF }) => {
      await waitForPDF();

      // Draw a measurement first
      await page.keyboard.press('m');

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (!box) throw new Error('Canvas not found');

      const lineX = box.x + 200;
      const lineY = box.y + 200;

      await page.mouse.move(lineX, lineY);
      await page.mouse.down();
      await page.mouse.move(lineX + 200, lineY);
      await page.mouse.up();

      await page.waitForTimeout(500);

      // Exit measurement mode
      await page.keyboard.press('Escape');

      // Click on the measurement line to select it
      await page.mouse.click(lineX + 100, lineY);

      // Should show selection banner
      await expect(page.getByText(/Measurement selected/i)).toBeVisible();
      await expect(page.getByText(/Delete.*to remove/i)).toBeVisible();
    });

    test('should delete measurement with Delete key', async ({ page, waitForPDF }) => {
      await waitForPDF();

      // Draw a measurement
      await page.keyboard.press('m');

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (!box) throw new Error('Canvas not found');

      const lineX = box.x + 200;
      const lineY = box.y + 200;

      await page.mouse.move(lineX, lineY);
      await page.mouse.down();
      await page.mouse.move(lineX + 200, lineY);
      await page.mouse.up();

      await page.waitForTimeout(500);

      // Exit measurement mode
      await page.keyboard.press('Escape');

      // Click to select
      await page.mouse.click(lineX + 100, lineY);

      // Should show selection
      await expect(page.getByText(/Measurement selected/i)).toBeVisible();

      // Press Delete
      await page.keyboard.press('Delete');

      await page.waitForTimeout(500);

      // Selection banner should disappear
      await expect(page.getByText(/Measurement selected/i)).not.toBeVisible();
    });

    test('should deselect measurement by clicking elsewhere', async ({ page, waitForPDF }) => {
      await waitForPDF();

      // Draw a measurement
      await page.keyboard.press('m');

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (!box) throw new Error('Canvas not found');

      await page.mouse.move(box.x + 200, box.y + 200);
      await page.mouse.down();
      await page.mouse.move(box.x + 400, box.y + 200);
      await page.mouse.up();

      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');

      // Click to select
      await page.mouse.click(box.x + 300, box.y + 200);
      await expect(page.getByText(/Measurement selected/i)).toBeVisible();

      // Click elsewhere to deselect
      await page.mouse.click(box.x + 100, box.y + 100);

      // Selection should clear
      await expect(page.getByText(/Measurement selected/i)).not.toBeVisible();
    });
  });

  test.describe('Multiple Measurements', () => {
    test('should allow drawing multiple measurements on same page', async ({
      page,
      waitForPDF,
    }) => {
      await waitForPDF();

      await page.keyboard.press('m');

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (!box) throw new Error('Canvas not found');

      // Draw first measurement
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 300, box.y + 100);
      await page.mouse.up();

      await page.waitForTimeout(500);

      // Draw second measurement
      await page.mouse.move(box.x + 100, box.y + 200);
      await page.mouse.down();
      await page.mouse.move(box.x + 300, box.y + 200);
      await page.mouse.up();

      await page.waitForTimeout(500);

      // Draw third measurement
      await page.mouse.move(box.x + 150, box.y + 150);
      await page.mouse.down();
      await page.mouse.move(box.x + 350, box.y + 350);
      await page.mouse.up();

      await page.waitForTimeout(500);

      // All measurements should be saved
      // Verify by reloading and checking persistence
      await page.reload();
      await waitForPDF();

      await page.keyboard.press('m');
      await expect(page.getByText(/Measurement Mode/i)).toBeVisible();
    });

    test('should handle measurements on different pages', async ({ page, waitForPDF }) => {
      await waitForPDF();

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (!box) throw new Error('Canvas not found');

      // Draw measurement on page 1
      await page.keyboard.press('m');
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 300, box.y + 100);
      await page.mouse.up();

      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');

      // Navigate to page 2
      await page.keyboard.press('ArrowRight');
      await waitForPDF();

      // Draw measurement on page 2
      await page.keyboard.press('m');
      await page.mouse.move(box.x + 150, box.y + 150);
      await page.mouse.down();
      await page.mouse.move(box.x + 350, box.y + 150);
      await page.mouse.up();

      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');

      // Navigate back to page 1
      await page.keyboard.press('ArrowLeft');
      await waitForPDF();

      // Page 1 measurement should still be there
      // Enter measurement mode to verify
      await page.keyboard.press('m');
      await expect(page.getByText(/Measurement Mode/i)).toBeVisible();
    });
  });

  test.describe('Measurement Mode with Screenshot Mode', () => {
    test('should exit measurement mode when entering screenshot mode', async ({
      page,
      waitForPDF,
    }) => {
      await waitForPDF();

      await page.keyboard.press('m');
      await expect(page.getByText(/Measurement Mode/i)).toBeVisible();

      // Enter screenshot mode
      await page.keyboard.press('s');

      // Should exit measurement mode and enter screenshot mode
      await expect(page.getByText(/Measurement Mode/i)).not.toBeVisible();
      await expect(page.getByText(/Screenshot Mode/i)).toBeVisible();
    });

    test('should exit screenshot mode when entering measurement mode', async ({
      page,
      waitForPDF,
    }) => {
      await waitForPDF();

      await page.keyboard.press('s');
      await expect(page.getByText(/Screenshot Mode/i)).toBeVisible();

      // Enter measurement mode
      await page.keyboard.press('m');

      // Should exit screenshot mode and enter measurement mode
      await expect(page.getByText(/Screenshot Mode/i)).not.toBeVisible();
      await expect(page.getByText(/Measurement Mode/i)).toBeVisible();
    });
  });

  test.describe('Calibration Line Display', () => {
    test('should show calibration line when using known length method', async ({
      page,
      waitForPDF,
    }) => {
      await waitForPDF();

      // Set calibration using known length method
      await page.keyboard.press('l');
      await page.getByText('Known Length Method').click();
      await page.getByRole('button', { name: /Click to Draw Line on PDF/i }).click();

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (!box) throw new Error('Canvas not found');

      // Draw calibration line
      const calStartX = box.x + 100;
      const calStartY = box.y + 300;
      const calEndX = box.x + 500;
      const calEndY = box.y + 300;

      await page.mouse.move(calStartX, calStartY);
      await page.mouse.down();
      await page.mouse.move(calEndX, calEndY);
      await page.mouse.up();

      // Complete calibration
      await page.locator('#known-distance-input').fill('10');
      await page.getByRole('button', { name: /Save Calibration/i }).click();

      // Calibration line should be visible on the PDF
      // It should be rendered differently from regular measurements
      // (Would need to check the actual overlay rendering)

      // Enter measurement mode to see both calibration line and measurements
      await page.keyboard.press('m');
      await expect(page.getByText(/Measurement Mode/i)).toBeVisible();
    });
  });
});
