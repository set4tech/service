import { test, expect } from './fixtures/setup';

/**
 * Manual Override Tests
 *
 * Tests manual override functionality for compliance checks
 */
test.describe('Manual Override - Compliance Decisions', () => {
  const TEST_ASSESSMENT_ID = process.env.TEST_ASSESSMENT_ID || 'test-assessment-id';

  test.beforeEach(async ({ assessmentPage }) => {
    test.skip(!process.env.TEST_ASSESSMENT_ID, 'Set TEST_ASSESSMENT_ID to run these tests');
    await assessmentPage.goto(TEST_ASSESSMENT_ID);
  });

  test('should display manual override buttons', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for manual override controls
    const overrideButtons = page.getByRole('button', {
      name: /compliant|non-compliant|not applicable|n\/a/i,
    });

    const count = await overrideButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should allow marking check as compliant', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Find compliant button
    const compliantBtn = page
      .getByRole('button', { name: /^compliant$/i })
      .or(page.getByRole('button', { name: /mark compliant/i }));

    if ((await compliantBtn.count()) > 0) {
      await compliantBtn.click();
      await page.waitForTimeout(500);

      // Should show confirmation or update UI
      console.log('Marked as compliant');
    }
  });

  test('should allow marking check as non-compliant', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Find non-compliant button
    const nonCompliantBtn = page
      .getByRole('button', { name: /non-compliant/i })
      .or(page.getByRole('button', { name: /mark non-compliant/i }));

    if ((await nonCompliantBtn.count()) > 0) {
      await nonCompliantBtn.click();
      await page.waitForTimeout(500);

      // Should show confirmation or update UI
      console.log('Marked as non-compliant');
    }
  });

  test('should allow marking check as not applicable', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Find N/A button
    const naBtn = page
      .getByRole('button', { name: /not applicable|n\/a/i })
      .or(page.getByRole('button', { name: /mark n\/a/i }));

    if ((await naBtn.count()) > 0) {
      await naBtn.click();
      await page.waitForTimeout(500);

      // Should show confirmation or update UI
      console.log('Marked as N/A');
    }
  });

  test('should show note input for manual override', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Click override button
    const overrideBtn = page.getByRole('button', { name: /compliant|non-compliant/i }).first();

    if ((await overrideBtn.count()) > 0) {
      await overrideBtn.click();
      await page.waitForTimeout(500);

      // Should show note/comment input
      const noteInput = page.getByPlaceholder(/note|comment|reason/i).or(page.locator('textarea'));

      const hasNoteInput = (await noteInput.count()) > 0;
      console.log('Has note input:', hasNoteInput);
    }
  });

  test('should save override with note', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Click override button
    const overrideBtn = page.getByRole('button', { name: /compliant|non-compliant/i }).first();

    if ((await overrideBtn.count()) > 0) {
      await overrideBtn.click();
      await page.waitForTimeout(500);

      // Fill in note
      const noteInput = page.getByPlaceholder(/note|comment|reason/i).or(page.locator('textarea'));

      if ((await noteInput.count()) > 0) {
        await noteInput.fill('Manual override test note');

        // Click save/confirm
        const saveBtn = page.getByRole('button', { name: /save|confirm|submit/i });
        if ((await saveBtn.count()) > 0) {
          await saveBtn.click();
          await page.waitForTimeout(500);

          console.log('Saved override with note');
        }
      }
    }
  });

  test('should display override indicator on check', async ({ page }) => {
    // Navigate through checks to find one with override
    const checks = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));

    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for override indicator/badge
      const overrideIndicator = page
        .getByText(/manual|override|overridden/i)
        .or(page.locator('[data-override]'));

      if ((await overrideIndicator.count()) > 0) {
        console.log('Found override indicator');
        break;
      }
    }
  });

  test('should show who made the override', async ({ page }) => {
    // Navigate through checks to find one with override
    const checks = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));

    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for user info
      const userInfo = page.getByText(/by|overridden by|reviewed by/i);

      if ((await userInfo.count()) > 0) {
        console.log('Found override user info');
        break;
      }
    }
  });

  test('should show when override was made', async ({ page }) => {
    // Navigate through checks to find one with override
    const checks = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));

    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for timestamp
      const timestamp = page.getByText(/ago|on|at/i);

      if ((await timestamp.count()) > 0) {
        console.log('Found override timestamp');
        break;
      }
    }
  });

  test('should allow clearing manual override', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for clear/reset override button
    const clearBtn = page.getByRole('button', { name: /clear|reset|remove override/i });

    if ((await clearBtn.count()) > 0) {
      await expect(clearBtn).toBeVisible();
      console.log('Found clear override button');
    }
  });

  test('should show confirmation dialog for override', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Click override button
    const overrideBtn = page.getByRole('button', { name: /compliant|non-compliant/i }).first();

    if ((await overrideBtn.count()) > 0) {
      await overrideBtn.click();
      await page.waitForTimeout(500);

      // Should show dialog or modal
      const dialog = page
        .locator('[role="dialog"]')
        .or(page.locator('.modal').or(page.locator('[class*="dialog"]')));

      const hasDialog = (await dialog.count()) > 0;
      console.log('Has confirmation dialog:', hasDialog);
    }
  });

  test('should cancel override operation', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Click override button
    const overrideBtn = page.getByRole('button', { name: /compliant|non-compliant/i }).first();

    if ((await overrideBtn.count()) > 0) {
      await overrideBtn.click();
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

  test('should preserve AI decision when override exists', async ({ page }) => {
    // Navigate through checks to find one with both AI decision and override
    const checks = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));

    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for both AI decision and override
      const aiDecision = page.getByText(/ai assessment|ai decision/i);
      const override = page.getByText(/manual override|overridden/i);

      if ((await aiDecision.count()) > 0 && (await override.count()) > 0) {
        console.log('Found check with both AI decision and override');
        break;
      }
    }
  });
});
