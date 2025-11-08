import { test, expect } from './fixtures/setup';

/**
 * PDF Calibration E2E Tests
 *
 * Tests the full calibration workflows for both Page Size and Known Length methods
 */
test.describe('PDF Calibration', () => {
  const TEST_ASSESSMENT_ID = process.env.TEST_ASSESSMENT_ID || 'test-assessment-id';

  test.beforeEach(async ({ assessmentPage }) => {
    test.skip(!process.env.TEST_ASSESSMENT_ID, 'Set TEST_ASSESSMENT_ID to run these tests');
    await assessmentPage.goto(TEST_ASSESSMENT_ID);
  });

  test.describe('Opening Calibration Modal', () => {
    test('should open calibration modal with L key', async ({ page, waitForPDF }) => {
      await waitForPDF();

      // Press L key to open calibration
      await page.keyboard.press('l');

      // Modal should be visible
      const modal = page.getByText('Calibrate Measurements');
      await expect(modal).toBeVisible();

      // Should show both method tabs
      await expect(page.getByText('Page Size Method')).toBeVisible();
      await expect(page.getByText('Known Length Method')).toBeVisible();
    });

    test('should open calibration modal with toolbar button', async ({ page, waitForPDF }) => {
      await waitForPDF();

      // Click calibration button (wrench icon)
      const calibrationButton = page.getByLabel('Set drawing scale (L)');
      await calibrationButton.click();

      // Modal should be visible
      const modal = page.getByText('Calibrate Measurements');
      await expect(modal).toBeVisible();
    });

    test('should show PDF dimensions in modal', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('l');

      // Should show PDF dimensions (internal coordinate space)
      await expect(page.getByText(/PDF dimensions:/)).toBeVisible();
    });
  });

  test.describe('Page Size Method', () => {
    test('should calibrate using page size method', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('l');

      // Page Size Method should be selected by default
      const pageSizeTab = page.getByText('Page Size Method');
      await expect(pageSizeTab).toHaveClass(/bg-white/);

      // Enter scale notation
      const scaleInput = page.locator('#scale-input');
      await scaleInput.fill('1/8"=1\'-0"');

      // Enter print size
      const printSizeInput = page.locator('#print-size-input');
      await printSizeInput.fill('24x36');

      // Should show validation checkmark
      await expect(page.getByText(/✓ Scale:/)).toBeVisible();
      await expect(page.getByText(/✓ Print size:/)).toBeVisible();

      // Save calibration
      const saveButton = page.getByRole('button', { name: /Set Scale & Size/i });
      await saveButton.click();

      // Modal should close
      await expect(page.getByText('Calibrate Measurements')).not.toBeVisible();

      // Calibration should be saved (verify by reopening)
      await page.keyboard.press('l');
      await expect(scaleInput).toHaveValue('1/8"=1\'-0"');
      await expect(printSizeInput).toHaveValue('24x36');
    });

    test('should use quick scale buttons', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('l');

      // Click on a quick scale button
      const quickScale = page.getByRole('button', { name: '1/4"=1\'-0"' });
      await quickScale.click();

      // Scale input should be populated
      const scaleInput = page.locator('#scale-input');
      await expect(scaleInput).toHaveValue('1/4"=1\'-0"');
    });

    test('should use quick sheet size buttons', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('l');

      // Click on a quick sheet size button
      const quickSize = page.getByRole('button', { name: /ANSI D \(24×36\)/i });
      await quickSize.click();

      // Print size input should be populated
      const printSizeInput = page.locator('#print-size-input');
      await expect(printSizeInput).toHaveValue('24x36');
    });

    test('should validate scale notation format', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('l');

      const scaleInput = page.locator('#scale-input');
      const printSizeInput = page.locator('#print-size-input');
      const saveButton = page.getByRole('button', { name: /Set Scale & Size/i });

      // Invalid scale
      await scaleInput.fill('invalid');
      await printSizeInput.fill('24x36');

      // Save button should be disabled
      await expect(saveButton).toBeDisabled();

      // Valid scale
      await scaleInput.fill('1/8"=1\'-0"');

      // Save button should be enabled
      await expect(saveButton).toBeEnabled();
    });

    test('should validate print size dimensions', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('l');

      const scaleInput = page.locator('#scale-input');
      const printSizeInput = page.locator('#print-size-input');
      const saveButton = page.getByRole('button', { name: /Set Scale & Size/i });

      await scaleInput.fill('1/8"=1\'-0"');

      // Invalid format
      await printSizeInput.fill('invalid');
      await expect(saveButton).toBeDisabled();

      // Too small
      await printSizeInput.fill('0.5x0.5');
      await expect(saveButton).toBeDisabled();

      // Too large
      await printSizeInput.fill('200x200');
      await expect(saveButton).toBeDisabled();

      // Valid size
      await printSizeInput.fill('24x36');
      await expect(saveButton).toBeEnabled();
    });

    test('should detect PDF dimensions', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('l');

      // Click "Detect PDF Size" button if available
      const detectButton = page.getByRole('button', { name: /Detect PDF Size/i });

      if (await detectButton.isVisible()) {
        await detectButton.click();

        // Should show detecting status
        await expect(page.getByText(/Detecting PDF size/i)).toBeVisible();

        // Wait for detection to complete
        await page.waitForTimeout(2000);

        // Print size should be populated
        const printSizeInput = page.locator('#print-size-input');
        const value = await printSizeInput.inputValue();
        expect(value).toMatch(/^\d+x\d+$/);
      }
    });

    test('should close modal with Escape key', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('l');
      await expect(page.getByText('Calibrate Measurements')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByText('Calibrate Measurements')).not.toBeVisible();
    });

    test('should close modal with Cancel button', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('l');
      await expect(page.getByText('Calibrate Measurements')).toBeVisible();

      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await cancelButton.click();

      await expect(page.getByText('Calibrate Measurements')).not.toBeVisible();
    });
  });

  test.describe('Known Length Method', () => {
    test('should calibrate using known length method', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('l');

      // Switch to Known Length Method
      const knownLengthTab = page.getByText('Known Length Method');
      await knownLengthTab.click();

      // Click to draw calibration line
      const drawButton = page.getByRole('button', { name: /Click to Draw Line on PDF/i });
      await drawButton.click();

      // Modal should close to allow drawing
      await expect(page.getByText('Calibrate Measurements')).not.toBeVisible();

      // Should show calibration mode banner
      await expect(page.getByText(/Calibration Mode/i)).toBeVisible();
      await expect(page.getByText(/Draw a line along a known distance/i)).toBeVisible();

      // Get PDF canvas position
      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (!box) throw new Error('Canvas not found');

      // Draw a line on the PDF
      const startX = box.x + 100;
      const startY = box.y + 100;
      const endX = box.x + 500;
      const endY = box.y + 100;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY);
      await page.mouse.up();

      // Modal should reopen with line info
      await expect(page.getByText('Calibrate Measurements')).toBeVisible();
      await expect(page.getByText(/✓ Line drawn/i)).toBeVisible();

      // Enter known distance
      const distanceInput = page.locator('#known-distance-input');
      await distanceInput.fill('10');

      // Select unit (feet)
      const unitSelect = page.locator('select').filter({ hasText: 'feet' });
      await unitSelect.selectOption('feet');

      // Should show validation checkmark
      await expect(page.getByText(/✓ Calibration line:/)).toBeVisible();
      await expect(page.getByText(/✓ Known distance:/)).toBeVisible();

      // Save calibration
      const saveButton = page.getByRole('button', { name: /Save Calibration/i });
      await saveButton.click();

      // Modal should close
      await expect(page.getByText('Calibrate Measurements')).not.toBeVisible();
    });

    test('should allow redrawing calibration line', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('l');

      const knownLengthTab = page.getByText('Known Length Method');
      await knownLengthTab.click();

      const drawButton = page.getByRole('button', { name: /Click to Draw Line on PDF/i });
      await drawButton.click();

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (!box) throw new Error('Canvas not found');

      // Draw first line
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 300, box.y + 100);
      await page.mouse.up();

      // Modal reopens
      await expect(page.getByText('Calibrate Measurements')).toBeVisible();

      // Click to redraw
      const redrawButton = page.getByRole('button', { name: /✓ Line Drawn - Click to Redraw/i });
      await redrawButton.click();

      // Should close modal again
      await expect(page.getByText('Calibrate Measurements')).not.toBeVisible();

      // Draw new line
      await page.mouse.move(box.x + 150, box.y + 150);
      await page.mouse.down();
      await page.mouse.move(box.x + 450, box.y + 150);
      await page.mouse.up();

      // Should show new line info
      await expect(page.getByText(/✓ Line drawn/i)).toBeVisible();
    });

    test('should cancel calibration line drawing with Escape', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('l');

      const knownLengthTab = page.getByText('Known Length Method');
      await knownLengthTab.click();

      const drawButton = page.getByRole('button', { name: /Click to Draw Line on PDF/i });
      await drawButton.click();

      // Should be in calibration mode
      await expect(page.getByText(/Calibration Mode/i)).toBeVisible();

      // Press Escape to cancel
      await page.keyboard.press('Escape');

      // Should exit calibration mode
      await expect(page.getByText(/Calibration Mode/i)).not.toBeVisible();
    });

    test('should validate known distance input', async ({ page, waitForPDF }) => {
      await waitForPDF();

      await page.keyboard.press('l');

      const knownLengthTab = page.getByText('Known Length Method');
      await knownLengthTab.click();

      const drawButton = page.getByRole('button', { name: /Click to Draw Line on PDF/i });
      await drawButton.click();

      const canvas = page.locator('canvas').first();
      const box = await canvas.boundingBox();

      if (!box) throw new Error('Canvas not found');

      // Draw a line
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 500, box.y + 100);
      await page.mouse.up();

      const distanceInput = page.locator('#known-distance-input');
      const saveButton = page.getByRole('button', { name: /Save Calibration/i });

      // Empty input - should be disabled
      await expect(saveButton).toBeDisabled();

      // Invalid input
      await distanceInput.fill('invalid');
      await expect(saveButton).toBeDisabled();

      // Zero - should be disabled
      await distanceInput.fill('0');
      await expect(saveButton).toBeDisabled();

      // Valid input
      await distanceInput.fill('10');
      await expect(saveButton).toBeEnabled();
    });
  });

  test.describe('Calibration Persistence', () => {
    test('should persist calibration across page navigation', async ({ page, waitForPDF }) => {
      await waitForPDF();

      // Set calibration on page 1
      await page.keyboard.press('l');
      await page.locator('#scale-input').fill('1/8"=1\'-0"');
      await page.locator('#print-size-input').fill('24x36');
      await page.getByRole('button', { name: /Set Scale & Size/i }).click();

      // Navigate to page 2
      await page.keyboard.press('ArrowRight');
      await waitForPDF();

      // Set different calibration on page 2
      await page.keyboard.press('l');
      await page.locator('#scale-input').fill('1/4"=1\'-0"');
      await page.locator('#print-size-input').fill('11x17');
      await page.getByRole('button', { name: /Set Scale & Size/i }).click();

      // Navigate back to page 1
      await page.keyboard.press('ArrowLeft');
      await waitForPDF();

      // Check that page 1 calibration is preserved
      await page.keyboard.press('l');
      await expect(page.locator('#scale-input')).toHaveValue('1/8"=1\'-0"');
      await expect(page.locator('#print-size-input')).toHaveValue('24x36');

      const cancelButton = page.getByRole('button', { name: 'Cancel' });
      await cancelButton.click();

      // Navigate to page 2
      await page.keyboard.press('ArrowRight');
      await waitForPDF();

      // Check that page 2 calibration is preserved
      await page.keyboard.press('l');
      await expect(page.locator('#scale-input')).toHaveValue('1/4"=1\'-0"');
      await expect(page.locator('#print-size-input')).toHaveValue('11x17');
    });
  });
});
