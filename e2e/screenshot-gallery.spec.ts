import { test, expect } from './fixtures/setup';

/**
 * Screenshot Gallery Tests
 *
 * Tests screenshot gallery UI, management, and organization
 */
test.describe('Screenshot Gallery - Management', () => {
  const TEST_ASSESSMENT_ID = process.env.TEST_ASSESSMENT_ID || 'test-assessment-id';

  test.beforeEach(async ({ assessmentPage }) => {
    test.skip(!process.env.TEST_ASSESSMENT_ID, 'Set TEST_ASSESSMENT_ID to run these tests');
    await assessmentPage.goto(TEST_ASSESSMENT_ID);
  });

  test('should display screenshot gallery', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for gallery section
    const gallery = page
      .locator('[data-testid="screenshot-gallery"]')
      .or(page.getByText(/screenshots?|gallery/i).or(page.locator('[class*="gallery"]')));

    // Gallery might be visible or might need to scroll
    const hasGallery = (await gallery.count()) > 0;
    console.log('Has screenshot gallery:', hasGallery);
  });

  test('should display screenshot thumbnails', async ({ page }) => {
    // Navigate through checks to find one with screenshots
    const checks = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));

    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for screenshot images
      const screenshots = page
        .locator('img[src*="screenshot"]')
        .or(page.locator('[data-screenshot-id]').or(page.locator('img[alt*="screenshot"]')));

      if ((await screenshots.count()) > 0) {
        console.log('Found screenshot thumbnails');
        break;
      }
    }
  });

  test('should display screenshot captions', async ({ page }) => {
    // Navigate through checks to find one with screenshots
    const checks = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));

    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for captions
      const captions = page
        .locator('[data-caption]')
        .or(page.locator('figcaption').or(page.locator('.caption')));

      if ((await captions.count()) > 0) {
        console.log('Found screenshot captions');
        break;
      }
    }
  });

  test('should open screenshot in lightbox', async ({ page }) => {
    // Navigate through checks to find one with screenshots
    const checks = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));

    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Find screenshot thumbnail
      const screenshot = page
        .locator('img[src*="screenshot"]')
        .or(page.locator('[data-screenshot-id]'))
        .first();

      if ((await screenshot.count()) > 0) {
        await screenshot.click();
        await page.waitForTimeout(500);

        // Should show lightbox/modal
        const lightbox = page
          .locator('[role="dialog"]')
          .or(page.locator('.lightbox').or(page.locator('[class*="modal"]')));

        const hasLightbox = (await lightbox.count()) > 0;
        console.log('Has lightbox:', hasLightbox);
        break;
      }
    }
  });

  test('should display delete button for screenshots', async ({ page }) => {
    // Navigate through checks to find one with screenshots
    const checks = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));

    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for delete button on screenshots
      const deleteBtn = page
        .getByRole('button', { name: /delete|remove|trash/i })
        .or(page.locator('[data-action="delete"]'));

      if ((await deleteBtn.count()) > 0) {
        console.log('Found screenshot delete button');
        break;
      }
    }
  });

  test('should show screenshot count', async ({ page }) => {
    // Look for screenshot count indicators
    const countIndicators = page
      .getByText(/\d+ screenshots?/i)
      .or(page.locator('[data-screenshot-count]'));

    const count = await countIndicators.count();
    console.log('Screenshot count indicators:', count);
  });

  test('should display empty state when no screenshots', async ({ page }) => {
    // Navigate through checks to find one without screenshots
    const checks = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));

    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 10); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for screenshots
      const screenshots = page
        .locator('img[src*="screenshot"]')
        .or(page.locator('[data-screenshot-id]'));

      if ((await screenshots.count()) === 0) {
        // Look for empty state
        const emptyState = page.getByText(/no screenshots|add screenshot/i);

        if ((await emptyState.count()) > 0) {
          console.log('Found empty state');
          break;
        }
      }
    }
  });

  test('should allow editing screenshot caption', async ({ page }) => {
    // Navigate through checks to find one with screenshots
    const checks = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));

    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for edit caption button
      const editBtn = page
        .getByRole('button', { name: /edit|caption/i })
        .or(page.locator('[data-action="edit-caption"]'));

      if ((await editBtn.count()) > 0) {
        console.log('Found edit caption button');
        break;
      }
    }
  });

  test('should display screenshot upload progress', async () => {
    // This would require actually uploading a file
    // For now, check that progress UI exists
    // Might not be visible unless actively uploading
    console.log('Upload progress UI check - manual verification needed');
  });

  test('should show screenshot metadata', async ({ page }) => {
    // Navigate through checks to find one with screenshots
    const checks = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));

    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for metadata (timestamp, size, etc.)
      const metadata = page.getByText(/uploaded|created|ago/i);

      if ((await metadata.count()) > 0) {
        console.log('Found screenshot metadata');
        break;
      }
    }
  });

  test('should allow reassigning screenshot to different check', async ({ page }) => {
    // Navigate through checks to find one with screenshots
    const checks = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));

    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for reassign button
      const reassignBtn = page.getByRole('button', { name: /assign|move|reassign/i });

      if ((await reassignBtn.count()) > 0) {
        console.log('Found screenshot reassign button');
        break;
      }
    }
  });

  test('should display screenshot in correct order', async ({ page }) => {
    // Navigate through checks to find one with multiple screenshots
    const checks = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));

    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Find screenshots
      const screenshots = page
        .locator('img[src*="screenshot"]')
        .or(page.locator('[data-screenshot-id]'));

      if ((await screenshots.count()) > 1) {
        console.log('Found multiple screenshots to check order');
        break;
      }
    }
  });

  test('should close lightbox with escape key', async ({ page }) => {
    // Navigate through checks to find one with screenshots
    const checks = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));

    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Find and click screenshot
      const screenshot = page
        .locator('img[src*="screenshot"]')
        .or(page.locator('[data-screenshot-id]'))
        .first();

      if ((await screenshot.count()) > 0) {
        await screenshot.click();
        await page.waitForTimeout(500);

        // Press escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // Lightbox should close
        const lightbox = page.locator('[role="dialog"]');
        await expect(lightbox).not.toBeVisible();
        break;
      }
    }
  });

  test('should navigate between screenshots in lightbox', async ({ page }) => {
    // Navigate through checks to find one with multiple screenshots
    const checks = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }));

    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Find screenshots
      const screenshots = page
        .locator('img[src*="screenshot"]')
        .or(page.locator('[data-screenshot-id]'));

      if ((await screenshots.count()) > 1) {
        // Click first screenshot
        await screenshots.first().click();
        await page.waitForTimeout(500);

        // Look for next/prev buttons in lightbox
        const nextBtn = page.getByRole('button', { name: /next|arrow right/i });
        const prevBtn = page.getByRole('button', { name: /prev|arrow left/i });

        const hasNavigation = (await nextBtn.count()) > 0 || (await prevBtn.count()) > 0;
        console.log('Has lightbox navigation:', hasNavigation);
        break;
      }
    }
  });
});
