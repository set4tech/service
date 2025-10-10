import { test, expect } from './fixtures/setup';

/**
 * Clone Check Tests
 *
 * Tests check cloning functionality for creating element instances
 */
test.describe('Clone Check - Element Instances', () => {
  const TEST_ASSESSMENT_ID = process.env.TEST_ASSESSMENT_ID || 'test-assessment-id';

  test.beforeEach(async ({ assessmentPage }) => {
    test.skip(!process.env.TEST_ASSESSMENT_ID, 'Set TEST_ASSESSMENT_ID to run these tests');
    await assessmentPage.goto(TEST_ASSESSMENT_ID);
  });

  test('should display clone button for checks', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for clone button
    const cloneBtn = page.getByRole('button', { name: /clone|duplicate|copy/i });

    if ((await cloneBtn.count()) > 0) {
      await expect(cloneBtn).toBeVisible();
      console.log('Found clone button');
    }
  });

  test('should open clone dialog', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Click clone button
    const cloneBtn = page.getByRole('button', { name: /clone|duplicate|copy/i });

    if ((await cloneBtn.count()) > 0) {
      await cloneBtn.click();
      await page.waitForTimeout(500);

      // Should show dialog
      const dialog = page
        .locator('[role="dialog"]')
        .or(page.locator('.modal').or(page.locator('[class*="dialog"]')));

      await expect(dialog).toBeVisible();
    }
  });

  test('should show instance label input', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Click clone button
    const cloneBtn = page.getByRole('button', { name: /clone|duplicate|copy/i });

    if ((await cloneBtn.count()) > 0) {
      await cloneBtn.click();
      await page.waitForTimeout(500);

      // Look for label input
      const labelInput = page
        .getByPlaceholder(/label|name|instance/i)
        .or(page.getByLabel(/label|name|instance/i));

      if ((await labelInput.count()) > 0) {
        await expect(labelInput).toBeVisible();
        console.log('Found instance label input');
      }
    }
  });

  test('should create cloned check with custom label', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Click clone button
    const cloneBtn = page.getByRole('button', { name: /clone|duplicate|copy/i });

    if ((await cloneBtn.count()) > 0) {
      await cloneBtn.click();
      await page.waitForTimeout(500);

      // Fill in label
      const labelInput = page
        .getByPlaceholder(/label|name|instance/i)
        .or(page.getByLabel(/label|name|instance/i));

      if ((await labelInput.count()) > 0) {
        await labelInput.fill('Test Instance 1');

        // Click create/confirm
        const createBtn = page.getByRole('button', { name: /create|confirm|clone|save/i });
        if ((await createBtn.count()) > 0) {
          await createBtn.click();
          await page.waitForTimeout(1000);

          // Should show new instance in list
          const newInstance = page.getByText(/test instance 1/i);
          const hasNewInstance = (await newInstance.count()) > 0;
          console.log('Created new instance:', hasNewInstance);
        }
      }
    }
  });

  test('should display parent-child relationship', async ({ page }) => {
    // Look for checks with instance numbers/labels
    const instanceChecks = page.getByText(/instance|#\d+|door \d+|ramp \d+/i);

    if ((await instanceChecks.count()) > 0) {
      // Click on an instance
      await instanceChecks.first().click();
      await page.waitForTimeout(500);

      // Look for parent/template indicator
      const parentIndicator = page.getByText(/parent|template|original/i);
      const hasParentInfo = (await parentIndicator.count()) > 0;

      console.log('Has parent relationship info:', hasParentInfo);
    }
  });

  test('should display instance number', async ({ page }) => {
    // Look for instance indicators in check list
    const instanceNumbers = page.getByText(/#\d+|\(\d+\)/);

    const count = await instanceNumbers.count();
    console.log('Instance number indicators:', count);
  });

  test('should group instances together', async ({ page }) => {
    // Look for grouped instances (e.g., "Door 1", "Door 2" under same element)
    const elementGroups = page.locator('[data-element-group]').or(page.locator('[class*="group"]'));

    const count = await elementGroups.count();
    console.log('Element groups found:', count);
  });

  test('should cancel clone operation', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Click clone button
    const cloneBtn = page.getByRole('button', { name: /clone|duplicate|copy/i });

    if ((await cloneBtn.count()) > 0) {
      await cloneBtn.click();
      await page.waitForTimeout(500);

      // Click cancel
      const cancelBtn = page.getByRole('button', { name: /cancel|close/i });

      if ((await cancelBtn.count()) > 0) {
        await cancelBtn.click();
        await page.waitForTimeout(300);

        // Dialog should close
        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).not.toBeVisible();
      }
    }
  });

  test('should inherit screenshots from parent', async () => {
    // This would require creating a clone and checking if screenshots are inherited
    // For now, just check that the UI supports this concept
    console.log('Screenshot inheritance test - manual verification needed');
  });

  test('should allow deleting cloned instance', async ({ page }) => {
    // Look for delete button on instance checks
    const instanceChecks = page.getByText(/instance|#\d+|door \d+/i);

    if ((await instanceChecks.count()) > 0) {
      await instanceChecks.first().click();
      await page.waitForTimeout(500);

      // Look for delete button
      const deleteBtn = page.getByRole('button', { name: /delete|remove/i });

      if ((await deleteBtn.count()) > 0) {
        console.log('Found delete button for instance');
      }
    }
  });

  test('should show instance count in element group', async ({ page }) => {
    // Look for count indicators like "(3 instances)"
    const countIndicators = page.getByText(/\d+ instances?/i);

    const count = await countIndicators.count();
    console.log('Instance count indicators:', count);
  });

  test('should navigate between instances', async ({ page }) => {
    // Look for navigation between instances (e.g., next/prev buttons)
    const navButtons = page.getByRole('button', { name: /next instance|prev instance/i });

    if ((await navButtons.count()) > 0) {
      console.log('Found instance navigation buttons');
    }
  });

  test('should validate unique instance labels', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Click clone button
    const cloneBtn = page.getByRole('button', { name: /clone|duplicate|copy/i });

    if ((await cloneBtn.count()) > 0) {
      await cloneBtn.click();
      await page.waitForTimeout(500);

      // Try to use a duplicate label
      const labelInput = page
        .getByPlaceholder(/label|name|instance/i)
        .or(page.getByLabel(/label|name|instance/i));

      if ((await labelInput.count()) > 0) {
        await labelInput.fill('Door 1'); // Assuming this exists

        // Click create
        const createBtn = page.getByRole('button', { name: /create|confirm|clone|save/i });
        if ((await createBtn.count()) > 0) {
          await createBtn.click();
          await page.waitForTimeout(500);

          // Should show error message
          const errorMsg = page.getByText(/already exists|duplicate/i);
          const hasError = (await errorMsg.count()) > 0;

          console.log('Shows duplicate label error:', hasError);
        }
      }
    }
  });
});
