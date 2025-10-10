import { test, expect } from './fixtures/setup';

/**
 * PDF Viewer Layer Management Tests
 *
 * Tests PDF layer (OCG) visibility toggling
 */
test.describe('PDF Viewer - Layer Management', () => {
  const TEST_ASSESSMENT_ID = process.env.TEST_ASSESSMENT_ID || 'test-assessment-id';

  test.beforeEach(async ({ assessmentPage }) => {
    test.skip(!process.env.TEST_ASSESSMENT_ID, 'Set TEST_ASSESSMENT_ID to run these tests');
    await assessmentPage.goto(TEST_ASSESSMENT_ID);
  });

  test('should show layer panel button only if PDF has layers', async ({ page }) => {
    const layerBtn = page.getByLabel('Toggle layers panel');

    // Note: This test depends on whether the test PDF has layers
    // If it has layers, button should be visible
    // If no layers, button should not exist

    const hasLayers = (await layerBtn.count()) > 0;

    if (hasLayers) {
      await expect(layerBtn).toBeVisible();
    } else {
      await expect(layerBtn).not.toBeVisible();
    }
  });

  test('should toggle layer panel', async ({ page }) => {
    const layerBtn = page.getByLabel('Toggle layers panel');

    // Skip if no layers
    if ((await layerBtn.count()) === 0) {
      test.skip(true, 'PDF does not have layers');
      return;
    }

    // Panel should not be visible initially
    await expect(page.locator('h3:has-text("PDF Layers")')).not.toBeVisible();

    // Click to open
    await layerBtn.click();

    // Panel should appear
    await expect(page.locator('h3:has-text("PDF Layers")')).toBeVisible();

    // Click to close (X button)
    await page.locator('button:has-text("✕")').click();

    // Panel should disappear
    await expect(page.locator('h3:has-text("PDF Layers")')).not.toBeVisible();
  });

  test('should list all PDF layers with checkboxes', async ({ page }) => {
    const layerBtn = page.getByLabel('Toggle layers panel');

    if ((await layerBtn.count()) === 0) {
      test.skip(true, 'PDF does not have layers');
      return;
    }

    // Open layer panel
    await layerBtn.click();

    // Should have at least one layer checkbox
    const layerCheckboxes = page.locator('input[type="checkbox"]').filter({
      has: page.locator('~ span'),
    });

    const count = await layerCheckboxes.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should toggle layer visibility', async ({ page }) => {
    const layerBtn = page.getByLabel('Toggle layers panel');

    if ((await layerBtn.count()) === 0) {
      test.skip(true, 'PDF does not have layers');
      return;
    }

    // Open layer panel
    await layerBtn.click();

    // Get first layer checkbox
    const firstLayerCheckbox = page.locator('input[type="checkbox"]').first();
    const isChecked = await firstLayerCheckbox.isChecked();

    // Take screenshot before toggle
    const beforeToggle = await page.screenshot();

    // Toggle the layer
    await firstLayerCheckbox.click();

    // Wait for render to complete
    await page.waitForTimeout(500);

    // Take screenshot after toggle
    const afterToggle = await page.screenshot();

    // Screenshots should be different
    expect(beforeToggle).not.toEqual(afterToggle);

    // Checkbox state should have changed
    const newIsChecked = await firstLayerCheckbox.isChecked();
    expect(newIsChecked).toBe(!isChecked);
  });

  test('should persist layer visibility across page changes', async ({ page, waitForPDF }) => {
    const layerBtn = page.getByLabel('Toggle layers panel');

    if ((await layerBtn.count()) === 0) {
      test.skip(true, 'PDF does not have layers');
      return;
    }

    // Open layer panel
    await layerBtn.click();

    // Toggle first layer off
    const firstLayerCheckbox = page.locator('input[type="checkbox"]').first();
    if (await firstLayerCheckbox.isChecked()) {
      await firstLayerCheckbox.click();
      await page.waitForTimeout(300);
    }

    const layerState = await firstLayerCheckbox.isChecked();

    // Navigate to next page
    await page.getByLabel('Next page').click();
    await waitForPDF();

    // Navigate back
    await page.getByLabel('Previous page').click();
    await waitForPDF();

    // Layer state should be preserved
    // Reopen panel if it closed
    if (!(await page.locator('h3:has-text("PDF Layers")').isVisible())) {
      await layerBtn.click();
    }

    const newLayerState = await firstLayerCheckbox.isChecked();
    expect(newLayerState).toBe(layerState);
  });
});
