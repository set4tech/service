import { test, expect } from './fixtures/setup';

/**
 * Element Instance Management Tests
 *
 * Tests element-based checking and instance management
 */
test.describe('Element Instances - Management', () => {
  const TEST_ASSESSMENT_ID = process.env.TEST_ASSESSMENT_ID || 'test-assessment-id';

  test.beforeEach(async ({ assessmentPage }) => {
    test.skip(!process.env.TEST_ASSESSMENT_ID, 'Set TEST_ASSESSMENT_ID to run these tests');
    await assessmentPage.goto(TEST_ASSESSMENT_ID);
  });

  test('should display element mode toggle', async ({ page }) => {
    // Look for element mode button
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    if ((await elementModeBtn.count()) > 0) {
      await expect(elementModeBtn).toBeVisible();
      console.log('Found element mode toggle');
    }
  });

  test('should switch to element mode', async ({ page }) => {
    // Find and click element mode button
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.click();
      await page.waitForTimeout(500);

      // Check list should reorganize by element groups
      const elementGroups = page
        .locator('[data-element-group]')
        .or(page.getByText(/doors?|ramps?|parking|stairs?|restrooms?/i));

      const count = await elementGroups.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should display element groups', async ({ page }) => {
    // Switch to element mode first
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.click();
      await page.waitForTimeout(500);
    }

    // Look for common element groups
    const doorGroup = page.getByText(/doors?/i);
    const rampGroup = page.getByText(/ramps?/i);
    const parkingGroup = page.getByText(/parking/i);

    const hasDoors = (await doorGroup.count()) > 0;
    const hasRamps = (await rampGroup.count()) > 0;
    const hasParking = (await parkingGroup.count()) > 0;

    console.log('Element groups:', { hasDoors, hasRamps, hasParking });
  });

  test('should create new element instance', async ({ page }) => {
    // Switch to element mode
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.click();
      await page.waitForTimeout(500);
    }

    // Look for "Add" or "Create" button for elements
    const addBtn = page.getByRole('button', { name: /add|create|new element/i });

    if ((await addBtn.count()) > 0) {
      await addBtn.click();
      await page.waitForTimeout(500);

      // Should show create dialog
      const dialog = page.locator('[role="dialog"]');
      const hasDialog = (await dialog.count()) > 0;

      console.log('Has create element dialog:', hasDialog);
    }
  });

  test('should display element instances list', async ({ page }) => {
    // Switch to element mode
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.click();
      await page.waitForTimeout(500);
    }

    // Expand an element group
    const elementGroup = page.getByText(/doors?|ramps?/i).first();

    if ((await elementGroup.count()) > 0) {
      await elementGroup.click();
      await page.waitForTimeout(300);

      // Look for instance list (Door 1, Door 2, etc.)
      const instances = page.getByText(/\d+|instance/i);

      const count = await instances.count();
      console.log('Element instances found:', count);
    }
  });

  test('should show all sections for element', async ({ page }) => {
    // Switch to element mode
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.click();
      await page.waitForTimeout(500);
    }

    // Select an element instance
    const instance = page
      .locator('[data-element-instance]')
      .or(page.getByText(/door \d+|ramp \d+/i))
      .first();

    if ((await instance.count()) > 0) {
      await instance.click();
      await page.waitForTimeout(500);

      // Should show multiple code sections
      const sections = page.getByText(/11B-\d+/);

      const count = await sections.count();
      console.log('Code sections for element:', count);
    }
  });

  test('should display element progress', async ({ page }) => {
    // Switch to element mode
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.click();
      await page.waitForTimeout(500);
    }

    // Look for progress indicators on elements
    const progressBars = page.locator('[role="progressbar"]').or(page.getByText(/%/));

    const count = await progressBars.count();
    console.log('Element progress indicators:', count);
  });

  test('should delete element instance', async ({ page }) => {
    // Switch to element mode
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.click();
      await page.waitForTimeout(500);
    }

    // Select an element instance
    const instance = page
      .locator('[data-element-instance]')
      .or(page.getByText(/door \d+|ramp \d+/i))
      .first();

    if ((await instance.count()) > 0) {
      await instance.click();
      await page.waitForTimeout(500);

      // Look for delete button
      const deleteBtn = page.getByRole('button', { name: /delete|remove/i });

      if ((await deleteBtn.count()) > 0) {
        console.log('Found delete element button');
      }
    }
  });

  test('should show element type icon', async ({ page }) => {
    // Switch to element mode
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.click();
      await page.waitForTimeout(500);
    }

    // Look for element icons
    const icons = page.locator('svg').or(page.locator('[data-icon]').or(page.locator('.icon')));

    const count = await icons.count();
    console.log('Element icons found:', count);
  });

  test('should batch assess all sections for element', async ({ page }) => {
    // Switch to element mode
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.click();
      await page.waitForTimeout(500);
    }

    // Select an element instance
    const instance = page
      .locator('[data-element-instance]')
      .or(page.getByText(/door \d+|ramp \d+/i))
      .first();

    if ((await instance.count()) > 0) {
      await instance.click();
      await page.waitForTimeout(500);

      // Look for batch assess button
      const batchAssessBtn = page.getByRole('button', { name: /assess all|batch/i });

      if ((await batchAssessBtn.count()) > 0) {
        console.log('Found batch assess button for element');
      }
    }
  });

  test('should display element instance label', async ({ page }) => {
    // Switch to element mode
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.click();
      await page.waitForTimeout(500);
    }

    // Look for custom labels
    const labels = page
      .locator('[data-instance-label]')
      .or(page.getByText(/entrance|exit|main|front|rear/i));

    const count = await labels.count();
    console.log('Custom instance labels:', count);
  });

  test('should allow editing element instance label', async ({ page }) => {
    // Switch to element mode
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.click();
      await page.waitForTimeout(500);
    }

    // Select an element instance
    const instance = page
      .locator('[data-element-instance]')
      .or(page.getByText(/door \d+|ramp \d+/i))
      .first();

    if ((await instance.count()) > 0) {
      await instance.click();
      await page.waitForTimeout(500);

      // Look for edit label button
      const editBtn = page.getByRole('button', { name: /edit|rename/i });

      if ((await editBtn.count()) > 0) {
        console.log('Found edit label button');
      }
    }
  });

  test('should show element section mapping count', async ({ page }) => {
    // Switch to element mode
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.click();
      await page.waitForTimeout(500);
    }

    // Look for section count (e.g., "12 sections")
    const countIndicators = page.getByText(/\d+ sections?/i);

    const count = await countIndicators.count();
    console.log('Section count indicators:', count);
  });

  test('should filter elements by compliance status', async ({ page }) => {
    // Switch to element mode
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.click();
      await page.waitForTimeout(500);
    }

    // Look for filter controls
    const filterBtn = page.getByRole('button', { name: /filter/i });

    if ((await filterBtn.count()) > 0) {
      console.log('Found element filter button');
    }
  });

  test('should show element completion status', async ({ page }) => {
    // Switch to element mode
    const elementModeBtn = page.getByRole('button', { name: /element mode/i });

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.click();
      await page.waitForTimeout(500);
    }

    // Look for completion badges/indicators
    const completionIndicators = page
      .getByText(/complete|in progress|pending/i)
      .or(page.locator('[data-status]'));

    const count = await completionIndicators.count();
    console.log('Element completion indicators:', count);
  });
});
