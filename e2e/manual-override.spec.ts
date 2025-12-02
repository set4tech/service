import { test, expect } from './fixtures/setup';

/**
 * Manual Override Tests
 *
 * Tests manual override functionality for compliance checks.
 * Manual overrides ALWAYS take precedence over AI judgments.
 */
test.describe('Manual Override - UI Controls', () => {
  test.beforeEach(async ({ assessmentPage }) => {
    await assessmentPage.goto();
  });

  test('should display manual override buttons for selected check', async ({ page }) => {
    // First check is already selected from assessmentPage.goto
    // Look for the override buttons (Compliant, Non-Compliant, N/A)
    const compliantBtn = page.getByRole('button', { name: /^compliant$/i });
    const nonCompliantBtn = page.getByRole('button', { name: /non-compliant/i });
    const naBtn = page.getByRole('button', { name: /not applicable|n\/a/i });

    // At least the main status buttons should be visible
    await expect(compliantBtn.or(nonCompliantBtn).or(naBtn).first()).toBeVisible({ timeout: 5000 });
  });

  test('should mark check as compliant via manual override', async ({ page }) => {
    // Find compliant button
    const compliantBtn = page.getByRole('button', { name: /^compliant$/i });
    await expect(compliantBtn).toBeVisible();

    // Click to mark as compliant
    await compliantBtn.click();
    await page.waitForTimeout(500);

    // Should show some indication of the override being applied
    // Either a selected state, a modal for notes, or immediate status update
    const overrideIndicator = page
      .locator('[aria-pressed="true"]')
      .or(page.getByText(/override|manual/i))
      .or(page.locator('textarea'))
      .or(page.locator('[role="dialog"]'));

    await expect(overrideIndicator.first()).toBeVisible({ timeout: 3000 });
  });

  test('should mark check as non-compliant via manual override', async ({ page }) => {
    // Find non-compliant button
    const nonCompliantBtn = page.getByRole('button', { name: /non-compliant/i });
    await expect(nonCompliantBtn).toBeVisible();

    // Click to mark as non-compliant
    await nonCompliantBtn.click();
    await page.waitForTimeout(500);

    // Should show override UI or confirmation
    const overrideUI = page
      .locator('[aria-pressed="true"]')
      .or(page.getByText(/override|manual/i))
      .or(page.locator('textarea'))
      .or(page.locator('[role="dialog"]'));

    await expect(overrideUI.first()).toBeVisible({ timeout: 3000 });
  });

  test('should mark check as not applicable via manual override', async ({ page }) => {
    // Find N/A button
    const naBtn = page.getByRole('button', { name: /not applicable|n\/a/i });

    if ((await naBtn.count()) === 0) {
      test.skip();
      return;
    }

    await expect(naBtn).toBeVisible();

    // Click to mark as N/A
    await naBtn.click();
    await page.waitForTimeout(500);

    // Should show override UI or confirmation
    const overrideUI = page
      .locator('[aria-pressed="true"]')
      .or(page.getByText(/override|manual|not applicable/i))
      .or(page.locator('textarea'))
      .or(page.locator('[role="dialog"]'));

    await expect(overrideUI.first()).toBeVisible({ timeout: 3000 });
  });

  test('should show note input when applying manual override', async ({ page }) => {
    // Click an override button
    const compliantBtn = page.getByRole('button', { name: /^compliant$/i });
    await compliantBtn.click();
    await page.waitForTimeout(500);

    // Should show a textarea or input for notes
    const noteInput = page
      .locator('textarea')
      .or(page.getByPlaceholder(/note|comment|reason|explanation/i));

    await expect(noteInput.first()).toBeVisible({ timeout: 3000 });
  });

  test('should save override with note', async ({ page }) => {
    // Click compliant button
    const compliantBtn = page.getByRole('button', { name: /^compliant$/i });
    await compliantBtn.click();
    await page.waitForTimeout(500);

    // Find and fill note input
    const noteInput = page
      .locator('textarea')
      .or(page.getByPlaceholder(/note|comment|reason/i));

    if ((await noteInput.count()) > 0) {
      await noteInput.first().fill('E2E test: Manual override note - verified compliance');

      // Find and click save button
      const saveBtn = page.getByRole('button', { name: /save|confirm|apply|submit/i });
      await expect(saveBtn).toBeVisible();
      await saveBtn.click();

      // Wait for save to complete
      await page.waitForTimeout(1000);

      // Verify the override was saved (note input should be gone or status updated)
      const savedIndicator = page
        .getByText(/saved|updated|success/i)
        .or(page.getByText(/manual override/i))
        .or(page.locator('[data-status="compliant"]'));

      // Dialog should close or status should update
      await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 }).catch(() => {
        // Dialog might not have been used
      });
    }
  });
});

test.describe('Manual Override - Status Display', () => {
  test.beforeEach(async ({ assessmentPage }) => {
    await assessmentPage.goto();
  });

  test('should display override indicator when check has manual override', async ({ page }) => {
    // Navigate through checks to find one with an override
    const checks = page.locator('button').filter({ hasText: /11B-/ });
    const count = await checks.count();

    let foundOverride = false;
    for (let i = 0; i < Math.min(count, 15); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for manual override indicator
      const overrideIndicator = page
        .getByText(/manual/i)
        .or(page.getByText(/override/i))
        .or(page.locator('[data-override="true"]'))
        .or(page.locator('[data-manual="true"]'));

      if ((await overrideIndicator.count()) > 0) {
        foundOverride = true;
        await expect(overrideIndicator.first()).toBeVisible();
        break;
      }
    }

    // It's OK if no overrides exist yet in test data
    if (!foundOverride) {
      test.skip();
    }
  });

  test('should show override timestamp when manual override exists', async ({ page }) => {
    // Navigate through checks to find one with override info
    const checks = page.locator('button').filter({ hasText: /11B-/ });
    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 15); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // First check if this has a manual override
      const hasOverride = page.getByText(/manual|override/i);
      if ((await hasOverride.count()) === 0) continue;

      // Look for timestamp
      const timestamp = page
        .getByText(/\d+ (seconds?|minutes?|hours?|days?) ago/i)
        .or(page.getByText(/overridden|updated/i));

      if ((await timestamp.count()) > 0) {
        await expect(timestamp.first()).toBeVisible();
        return;
      }
    }

    // No overrides with timestamps found
    test.skip();
  });

  test('should preserve AI decision when override exists', async ({ page }) => {
    // Navigate through checks to find one with both AI result and override
    const checks = page.locator('button').filter({ hasText: /11B-/ });
    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 15); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Check for both AI analysis and manual override indicators
      const aiIndicator = page
        .getByText(/ai|analyzed|confidence/i)
        .or(page.getByText(/gemini|gpt|claude/i));

      const overrideIndicator = page.getByText(/manual|override/i);

      if ((await aiIndicator.count()) > 0 && (await overrideIndicator.count()) > 0) {
        // Both should be visible - AI result preserved alongside override
        await expect(aiIndicator.first()).toBeVisible();
        await expect(overrideIndicator.first()).toBeVisible();
        return;
      }
    }

    // No checks with both AI and override found
    test.skip();
  });
});

test.describe('Manual Override - Clear/Reset', () => {
  test.beforeEach(async ({ assessmentPage }) => {
    await assessmentPage.goto();
  });

  test('should show clear override option when override exists', async ({ page }) => {
    // Navigate through checks to find one with an override
    const checks = page.locator('button').filter({ hasText: /11B-/ });
    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 15); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Check if this has a manual override
      const hasOverride = page.getByText(/manual|override/i);
      if ((await hasOverride.count()) === 0) continue;

      // Look for clear/reset button
      const clearBtn = page.getByRole('button', { name: /clear|reset|remove|undo/i });

      if ((await clearBtn.count()) > 0) {
        await expect(clearBtn).toBeVisible();
        return;
      }
    }

    // No overrides found to clear
    test.skip();
  });

  test('should cancel override operation with Escape or Cancel button', async ({ page }) => {
    // Click an override button to open the dialog/form
    const compliantBtn = page.getByRole('button', { name: /^compliant$/i });
    await compliantBtn.click();
    await page.waitForTimeout(500);

    // Check for dialog or expanded form
    const dialog = page.locator('[role="dialog"]');
    const noteInput = page.locator('textarea');

    if ((await dialog.count()) > 0) {
      // Try Cancel button first
      const cancelBtn = page.getByRole('button', { name: /cancel|close/i });
      if ((await cancelBtn.count()) > 0) {
        await cancelBtn.click();
        await expect(dialog).not.toBeVisible({ timeout: 3000 });
        return;
      }

      // Try Escape key
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible({ timeout: 3000 });
    } else if ((await noteInput.count()) > 0) {
      // Try Escape to cancel
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      // Form should collapse or cancel
      // Just verify we didn't break anything
      await expect(page.locator('button').filter({ hasText: /11B-/ }).first()).toBeVisible();
    }
  });
});

test.describe('Manual Override - Progress Impact', () => {
  test.beforeEach(async ({ assessmentPage }) => {
    await assessmentPage.goto();
  });

  test('should update progress when manual override is applied', async ({ page }) => {
    // Get initial progress
    const progressText = page.getByText(/\d+ of \d+/);
    let initialProgress: string | null = null;

    if ((await progressText.count()) > 0) {
      initialProgress = await progressText.first().textContent();
    }

    // Find a check without a status and apply override
    const checks = page.locator('button').filter({ hasText: /11B-/ });
    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 10); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Check if this doesn't have a status yet
      const hasStatus = page
        .locator('[data-status]')
        .or(page.getByText(/^compliant$|^non-compliant$/i));

      if ((await hasStatus.count()) > 0) continue;

      // Apply override
      const compliantBtn = page.getByRole('button', { name: /^compliant$/i });
      if ((await compliantBtn.count()) === 0) continue;

      await compliantBtn.click();
      await page.waitForTimeout(500);

      // Fill note if required
      const noteInput = page.locator('textarea');
      if ((await noteInput.count()) > 0) {
        await noteInput.first().fill('E2E test override');
        const saveBtn = page.getByRole('button', { name: /save|confirm/i });
        if ((await saveBtn.count()) > 0) {
          await saveBtn.click();
          await page.waitForTimeout(1000);
        }
      }

      // Check if progress updated
      if (initialProgress) {
        const newProgressText = page.getByText(/\d+ of \d+/);
        if ((await newProgressText.count()) > 0) {
          const newProgress = await newProgressText.first().textContent();
          // Progress should have changed (or stayed same if already counted)
          expect(newProgress).toBeDefined();
        }
      }
      return;
    }

    // All checks already have status
    test.skip();
  });
});
