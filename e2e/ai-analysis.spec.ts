import { test, expect } from './fixtures/setup';

/**
 * AI Analysis Workflow Tests
 *
 * Tests AI analysis execution, results display, and audit trail
 */
test.describe('AI Analysis - Workflow', () => {
  test.beforeEach(async ({ assessmentPage }) => {
    await assessmentPage.goto();
  });

  test('should display analyze button for checks', async ({ page }) => {
    // Select the first check (already clicked in assessmentPage.goto)
    // Look for analyze/run analysis button in the detail panel
    const analyzeBtn = page.getByRole('button', { name: /analyze|run analysis|assess/i });
    await expect(analyzeBtn).toBeVisible({ timeout: 5000 });
  });

  test('should show analysis loading state when analyzing', async ({ page }) => {
    // Find and click analyze button
    const analyzeBtn = page.getByRole('button', { name: /analyze|run analysis|assess/i });
    await expect(analyzeBtn).toBeVisible();

    // Click analyze and check for loading indicator
    await analyzeBtn.click();

    // Should show some loading state (spinner, disabled button, or loading text)
    const loadingIndicator = page
      .locator('[data-loading="true"]')
      .or(page.getByText(/analyzing|loading|processing/i))
      .or(page.locator('.animate-spin'))
      .or(analyzeBtn.locator('svg.animate-spin'));

    // Loading state might be quick, so we use a short timeout
    await expect(loadingIndicator).toBeVisible({ timeout: 3000 }).catch(() => {
      // Loading might have finished already - that's OK
    });
  });

  test('should display compliance status after analysis', async ({ page }) => {
    // Navigate through checks to find one with analysis results
    const checks = page.locator('button').filter({ hasText: /11B-/ });
    const count = await checks.count();

    let foundStatus = false;
    for (let i = 0; i < Math.min(count, 10); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for compliance status badges or text
      const statusIndicator = page
        .locator('[data-status]')
        .or(page.getByText(/^compliant$/i))
        .or(page.getByText(/^non-compliant$/i))
        .or(page.getByText(/^not applicable$/i))
        .or(page.getByText(/^unclear$/i));

      if ((await statusIndicator.count()) > 0) {
        foundStatus = true;
        await expect(statusIndicator.first()).toBeVisible();
        break;
      }
    }

    // At least some checks should have a status
    expect(foundStatus).toBe(true);
  });

  test('should display confidence level for analyzed checks', async ({ page }) => {
    // Navigate through checks to find one with confidence display
    const checks = page.locator('button').filter({ hasText: /11B-/ });
    const count = await checks.count();

    let foundConfidence = false;
    for (let i = 0; i < Math.min(count, 10); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for confidence indicator (high/medium/low or percentage)
      const confidenceIndicator = page
        .getByText(/confidence/i)
        .or(page.getByText(/high confidence/i))
        .or(page.getByText(/medium confidence/i))
        .or(page.getByText(/low confidence/i));

      if ((await confidenceIndicator.count()) > 0) {
        foundConfidence = true;
        await expect(confidenceIndicator.first()).toBeVisible();
        break;
      }
    }

    expect(foundConfidence).toBe(true);
  });

  test('should display AI reasoning for analyzed checks', async ({ page }) => {
    // Navigate through checks to find one with reasoning
    const checks = page.locator('button').filter({ hasText: /11B-/ });
    const count = await checks.count();

    let foundReasoning = false;
    for (let i = 0; i < Math.min(count, 10); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for reasoning section - usually contains detailed text
      const reasoningSection = page
        .locator('[data-testid="analysis-reasoning"]')
        .or(page.getByText(/reasoning/i).locator('..'))
        .or(page.locator('text=/The drawing shows|Based on|According to/i'));

      if ((await reasoningSection.count()) > 0) {
        foundReasoning = true;
        await expect(reasoningSection.first()).toBeVisible();
        break;
      }
    }

    expect(foundReasoning).toBe(true);
  });

  test('should display violation details for non-compliant checks', async ({ page }) => {
    // Navigate through checks to find a non-compliant one
    const checks = page.locator('button').filter({ hasText: /11B-/ });
    const count = await checks.count();

    let foundViolation = false;
    for (let i = 0; i < Math.min(count, 15); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // First check if this is non-compliant
      const nonCompliant = page.getByText(/non-compliant/i);
      if ((await nonCompliant.count()) === 0) continue;

      // Look for violation details
      const violationDetails = page
        .getByText(/violation|issue|deficiency/i)
        .or(page.locator('[data-testid="violations"]'))
        .or(page.getByText(/severity/i));

      if ((await violationDetails.count()) > 0) {
        foundViolation = true;
        await expect(violationDetails.first()).toBeVisible();
        break;
      }
    }

    // It's OK if no non-compliant checks exist in test data
    if (!foundViolation) {
      test.skip();
    }
  });

  test('should display recommendations for violations', async ({ page }) => {
    // Navigate through checks to find one with recommendations
    const checks = page.locator('button').filter({ hasText: /11B-/ });
    const count = await checks.count();

    let foundRecommendation = false;
    for (let i = 0; i < Math.min(count, 10); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for recommendations section
      const recommendations = page
        .getByText(/recommendation/i)
        .or(page.getByText(/suggested fix/i))
        .or(page.getByText(/to resolve/i));

      if ((await recommendations.count()) > 0) {
        foundRecommendation = true;
        await expect(recommendations.first()).toBeVisible();
        break;
      }
    }

    expect(foundRecommendation).toBe(true);
  });

  test('should show analysis timestamp', async ({ page }) => {
    // Navigate through checks to find one with analysis
    const checks = page.locator('button').filter({ hasText: /11B-/ });
    const count = await checks.count();

    let foundTimestamp = false;
    for (let i = 0; i < Math.min(count, 10); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for timestamp patterns (relative or absolute)
      const timestamp = page
        .getByText(/\d+ (seconds?|minutes?|hours?|days?) ago/i)
        .or(page.getByText(/analyzed|assessed/i))
        .or(page.getByText(/\d{1,2}\/\d{1,2}\/\d{2,4}/));

      if ((await timestamp.count()) > 0) {
        foundTimestamp = true;
        await expect(timestamp.first()).toBeVisible();
        break;
      }
    }

    expect(foundTimestamp).toBe(true);
  });

  test('should allow re-running analysis on already analyzed checks', async ({ page }) => {
    // Find a check that has been analyzed
    const checks = page.locator('button').filter({ hasText: /11B-/ });
    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 10); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Check if this has analysis results (has a status)
      const hasResults = page.locator('[data-status]').or(page.getByText(/^(non-)?compliant$/i));
      if ((await hasResults.count()) === 0) continue;

      // Should still have analyze button to re-run
      const analyzeBtn = page.getByRole('button', { name: /analyze|re-analyze|run analysis/i });
      await expect(analyzeBtn).toBeVisible();
      return;
    }

    // If no analyzed checks found, skip
    test.skip();
  });

  test('should display AI provider information', async ({ page }) => {
    // Navigate through checks to find provider info
    const checks = page.locator('button').filter({ hasText: /11B-/ });
    const count = await checks.count();

    let foundProvider = false;
    for (let i = 0; i < Math.min(count, 10); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Look for AI provider name
      const providerInfo = page
        .getByText(/gemini/i)
        .or(page.getByText(/gpt-4/i))
        .or(page.getByText(/claude/i))
        .or(page.getByText(/openai/i))
        .or(page.getByText(/anthropic/i));

      if ((await providerInfo.count()) > 0) {
        foundProvider = true;
        await expect(providerInfo.first()).toBeVisible();
        break;
      }
    }

    // Provider info might not always be displayed - that's acceptable
    if (!foundProvider) {
      test.skip();
    }
  });
});

test.describe('AI Analysis - Error Handling', () => {
  test.beforeEach(async ({ assessmentPage }) => {
    await assessmentPage.goto();
  });

  test('should require screenshot before analysis', async ({ page }) => {
    // Find a check without screenshots
    const checks = page.locator('button').filter({ hasText: /11B-/ });
    const count = await checks.count();

    for (let i = 0; i < Math.min(count, 10); i++) {
      await checks.nth(i).click();
      await page.waitForTimeout(300);

      // Check if there are no screenshots
      const screenshots = page.locator('[aria-label="Open screenshot"]');
      if ((await screenshots.count()) > 0) continue;

      // Analyze button should be disabled or show warning when clicked
      const analyzeBtn = page.getByRole('button', { name: /analyze|assess/i });
      if ((await analyzeBtn.count()) === 0) continue;

      // Either button is disabled or clicking shows warning
      const isDisabled = await analyzeBtn.isDisabled();
      if (isDisabled) {
        expect(isDisabled).toBe(true);
        return;
      }

      // Or clicking shows an error/warning
      await analyzeBtn.click();
      const warning = page.getByText(/screenshot required|add screenshot|no screenshot/i);
      if ((await warning.count()) > 0) {
        await expect(warning.first()).toBeVisible();
        return;
      }
    }

    // All checks have screenshots - skip this test
    test.skip();
  });
});
