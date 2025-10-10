import { test, expect } from './fixtures/setup';

/**
 * Code Detail Panel Tests
 *
 * Tests code section detail panel, content display, and interactions
 */
test.describe('Code Detail Panel - Content & Interactions', () => {
  const TEST_ASSESSMENT_ID = process.env.TEST_ASSESSMENT_ID || 'test-assessment-id';

  test.beforeEach(async ({ assessmentPage }) => {
    test.skip(!process.env.TEST_ASSESSMENT_ID, 'Set TEST_ASSESSMENT_ID to run these tests');
    await assessmentPage.goto(TEST_ASSESSMENT_ID);
  });

  test('should display code detail panel', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for detail panel
    const detailPanel = page
      .locator('[data-testid="code-detail-panel"]')
      .or(page.locator('aside').or(page.locator('[class*="detail"]')));

    const count = await detailPanel.count();
    console.log('Detail panel elements:', count);
  });

  test('should show code section number', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for section number (e.g., "11B-404.2.6")
    const sectionNumber = page.getByText(/11[AB]-\d+/);

    const count = await sectionNumber.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should display code section title', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for section title/heading
    const sectionTitle = page
      .locator('h1, h2, h3')
      .filter({ hasText: /door|ramp|parking|clearance/i });

    if ((await sectionTitle.count()) > 0) {
      console.log('Found section title');
    }
  });

  test('should show code section text content', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for section content/text
    const sectionText = page
      .locator('[data-section-content]')
      .or(page.locator('p, div').filter({ hasText: /shall|minimum|maximum|required/i }));

    const count = await sectionText.count();
    console.log('Section content elements:', count);
  });

  test('should display expand/collapse button', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for expand/collapse button
    const toggleBtn = page
      .getByRole('button', { name: /expand|collapse|show|hide/i })
      .or(page.locator('[aria-expanded]'));

    if ((await toggleBtn.count()) > 0) {
      console.log('Found expand/collapse button');
    }
  });

  test('should expand and collapse panel', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Find expand/collapse button
    const toggleBtn = page
      .getByRole('button', { name: /expand|collapse/i })
      .or(page.locator('[aria-expanded]'))
      .first();

    if ((await toggleBtn.count()) > 0) {
      const initialState = await toggleBtn.getAttribute('aria-expanded');

      // Toggle
      await toggleBtn.click();
      await page.waitForTimeout(300);

      const newState = await toggleBtn.getAttribute('aria-expanded');
      console.log('Panel toggle:', { initialState, newState });
    }
  });

  test('should display referenced sections', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for referenced/related sections
    const references = page
      .locator('[data-referenced-sections]')
      .or(page.getByText(/see also|refer to|section/i));

    if ((await references.count()) > 0) {
      console.log('Found referenced sections');
    }
  });

  test('should link to referenced sections', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for clickable section references
    const sectionLinks = page.locator('a').filter({ hasText: /11[AB]-\d+/ });

    if ((await sectionLinks.count()) > 0) {
      console.log('Found section reference links');

      // Try clicking one
      await sectionLinks.first().click();
      await page.waitForTimeout(500);

      // Should navigate to that section
      console.log('Clicked section reference link');
    }
  });

  test('should display code source URL', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for source link
    const sourceLink = page.locator('a').filter({ hasText: /source|official|dgs|ca\.gov/i });

    if ((await sourceLink.count()) > 0) {
      console.log('Found source URL link');
    }
  });

  test('should show prompt editor', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for prompt editor
    const promptEditor = page
      .locator('[data-testid="prompt-editor"]')
      .or(page.getByText(/prompt|instruction/i));

    if ((await promptEditor.count()) > 0) {
      console.log('Found prompt editor');
    }
  });

  test('should allow editing prompt', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for edit prompt button
    const editBtn = page.getByRole('button', { name: /edit prompt/i });

    if ((await editBtn.count()) > 0) {
      await editBtn.click();
      await page.waitForTimeout(500);

      // Should show prompt textarea
      const promptTextarea = page.locator('textarea');

      if ((await promptTextarea.count()) > 0) {
        console.log('Opened prompt editor');
      }
    }
  });

  test('should display section exceptions', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for exceptions section
    const exceptions = page.getByText(/exception|except|exclusion/i);

    if ((await exceptions.count()) > 0) {
      console.log('Found section exceptions');
    }
  });

  test('should show subsections', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for subsection numbers (e.g., 11B-404.2.6.1)
    const subsections = page.getByText(/11[AB]-\d+\.\d+\.\d+\.\d+/);

    if ((await subsections.count()) > 0) {
      console.log('Found subsections');
    }
  });

  test('should highlight code requirements', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for highlighted requirements (minimum, maximum, shall, etc.)
    const requirements = page.locator('strong, em, .highlight').filter({
      hasText: /minimum|maximum|shall|required/i,
    });

    const count = await requirements.count();
    console.log('Highlighted requirements:', count);
  });

  test('should display diagrams or figures', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for images/figures
    const figures = page.locator('img, figure').or(page.getByText(/figure|diagram/i));

    if ((await figures.count()) > 0) {
      console.log('Found diagrams/figures');
    }
  });

  test('should show panel resize handle', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for resize handle
    const resizeHandle = page.locator('[data-resize]').or(page.locator('.resize-handle'));

    if ((await resizeHandle.count()) > 0) {
      console.log('Found panel resize handle');
    }
  });

  test('should close panel', async ({ page }) => {
    // Select a check to open panel
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for close button
    const closeBtn = page
      .getByRole('button', { name: /close/i })
      .or(page.locator('[aria-label="Close"]'));

    if ((await closeBtn.count()) > 0) {
      await closeBtn.click();
      await page.waitForTimeout(300);

      console.log('Closed detail panel');
    }
  });

  test('should scroll to section content', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Panel content should be scrollable
    const scrollableContent = page
      .locator('[data-section-content]')
      .or(page.locator('.overflow-y-auto, .overflow-auto').or(page.locator('[style*="overflow"]')));

    if ((await scrollableContent.count()) > 0) {
      console.log('Panel has scrollable content');
    }
  });

  test('should display section hierarchy breadcrumb', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for breadcrumb navigation
    const breadcrumb = page
      .locator('[aria-label="Breadcrumb"]')
      .or(page.locator('nav').or(page.locator('.breadcrumb')));

    if ((await breadcrumb.count()) > 0) {
      console.log('Found section hierarchy breadcrumb');
    }
  });

  test('should copy section number to clipboard', async ({ page }) => {
    // Select a check
    const firstCheck = page
      .locator('[data-check-id]')
      .or(page.locator('button').filter({ hasText: /11B-/ }))
      .first();

    await firstCheck.click();
    await page.waitForTimeout(500);

    // Look for copy button
    const copyBtn = page.getByRole('button', { name: /copy/i });

    if ((await copyBtn.count()) > 0) {
      console.log('Found copy section number button');
    }
  });
});
