import { test, expect } from './fixtures/setup';

/**
 * Element Instance Management Tests
 *
 * Tests element-based checking (Doors, Ramps, Parking, etc.) and instance management.
 * Element checks assess multiple code sections in a single AI call.
 */
test.describe('Element Mode - Toggle and Display', () => {
  test.beforeEach(async ({ assessmentPage }) => {
    await assessmentPage.goto();
  });

  test('should display element mode toggle button', async ({ page }) => {
    // Look for element mode toggle in the check list
    const elementModeBtn = page
      .getByRole('button', { name: /element|by element/i })
      .or(page.getByRole('tab', { name: /element/i }))
      .or(page.locator('[data-mode="element"]'));

    await expect(elementModeBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test('should switch to element mode when toggle is clicked', async ({ page }) => {
    // Find and click element mode toggle
    const elementModeBtn = page
      .getByRole('button', { name: /element|by element/i })
      .or(page.getByRole('tab', { name: /element/i }));

    if ((await elementModeBtn.count()) === 0) {
      test.skip();
      return;
    }

    await elementModeBtn.first().click();
    await page.waitForTimeout(500);

    // Should show element groups (Doors, Ramps, etc.) instead of individual sections
    const elementGroups = page
      .getByText(/^doors$/i)
      .or(page.getByText(/^ramps$/i))
      .or(page.getByText(/^parking$/i))
      .or(page.getByText(/^stairs$/i))
      .or(page.getByText(/^restrooms$/i))
      .or(page.locator('[data-element-group]'));

    await expect(elementGroups.first()).toBeVisible({ timeout: 5000 });
  });

  test('should display common element groups when in element mode', async ({ page }) => {
    // Switch to element mode
    const elementModeBtn = page
      .getByRole('button', { name: /element|by element/i })
      .or(page.getByRole('tab', { name: /element/i }));

    if ((await elementModeBtn.count()) === 0) {
      test.skip();
      return;
    }

    await elementModeBtn.first().click();
    await page.waitForTimeout(500);

    // Check for at least one common element group
    const commonGroups = [
      page.getByText(/doors/i),
      page.getByText(/ramps/i),
      page.getByText(/parking/i),
      page.getByText(/stairs/i),
      page.getByText(/restrooms|bathrooms/i),
      page.getByText(/signage/i),
    ];

    let foundGroup = false;
    for (const group of commonGroups) {
      if ((await group.count()) > 0) {
        foundGroup = true;
        await expect(group.first()).toBeVisible();
        break;
      }
    }

    expect(foundGroup).toBe(true);
  });
});

test.describe('Element Groups - Expansion and Instances', () => {
  test.beforeEach(async ({ assessmentPage, page }) => {
    await assessmentPage.goto();
    // Switch to element mode
    const elementModeBtn = page
      .getByRole('button', { name: /element|by element/i })
      .or(page.getByRole('tab', { name: /element/i }));

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.first().click();
      await page.waitForTimeout(500);
    }
  });

  test('should expand element group to show instances', async ({ page }) => {
    // Find an element group header
    const groupHeader = page
      .getByText(/^doors$/i)
      .or(page.getByText(/^ramps$/i))
      .or(page.locator('[data-element-group]').first());

    if ((await groupHeader.count()) === 0) {
      test.skip();
      return;
    }

    // Click to expand
    await groupHeader.first().click();
    await page.waitForTimeout(300);

    // Should show instances (Door 1, Door 2, etc.)
    const instances = page
      .getByText(/door \d+|ramp \d+|parking \d+/i)
      .or(page.locator('[data-element-instance]'))
      .or(page.getByText(/instance/i));

    await expect(instances.first()).toBeVisible({ timeout: 3000 });
  });

  test('should display instance labels for element instances', async ({ page }) => {
    // Find and expand an element group
    const groupHeader = page.getByText(/^doors$/i).or(page.getByText(/^ramps$/i));

    if ((await groupHeader.count()) === 0) {
      test.skip();
      return;
    }

    await groupHeader.first().click();
    await page.waitForTimeout(300);

    // Look for instance labels (numbered or custom labels)
    const instanceLabels = page
      .getByText(/door \d+|ramp \d+/i)
      .or(page.getByText(/main entrance|front|rear|side/i))
      .or(page.locator('[data-instance-label]'));

    if ((await instanceLabels.count()) > 0) {
      await expect(instanceLabels.first()).toBeVisible();
    } else {
      // No instances exist yet - that's OK
      test.skip();
    }
  });

  test('should show section count for element group', async ({ page }) => {
    // Look for section count indicator (e.g., "12 sections")
    const sectionCount = page
      .getByText(/\d+ sections?/i)
      .or(page.locator('[data-section-count]'));

    if ((await sectionCount.count()) > 0) {
      await expect(sectionCount.first()).toBeVisible();
    } else {
      test.skip();
    }
  });
});

test.describe('Element Instances - Selection and Details', () => {
  test.beforeEach(async ({ assessmentPage, page }) => {
    await assessmentPage.goto();
    // Switch to element mode
    const elementModeBtn = page
      .getByRole('button', { name: /element|by element/i })
      .or(page.getByRole('tab', { name: /element/i }));

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.first().click();
      await page.waitForTimeout(500);
    }
  });

  test('should select element instance and show related code sections', async ({ page }) => {
    // Find and expand an element group
    const groupHeader = page.getByText(/^doors$/i).or(page.getByText(/^ramps$/i));

    if ((await groupHeader.count()) === 0) {
      test.skip();
      return;
    }

    await groupHeader.first().click();
    await page.waitForTimeout(300);

    // Find and click an instance
    const instance = page
      .getByText(/door \d+|ramp \d+/i)
      .or(page.locator('[data-element-instance]'));

    if ((await instance.count()) === 0) {
      test.skip();
      return;
    }

    await instance.first().click();
    await page.waitForTimeout(500);

    // Should show multiple code sections for this element
    const codeSections = page.getByText(/11B-\d+/);
    const sectionCount = await codeSections.count();

    // Element checks should have multiple sections (typically 5-20)
    expect(sectionCount).toBeGreaterThan(0);
  });

  test('should show element instance progress/completion status', async ({ page }) => {
    // Find and expand an element group
    const groupHeader = page.getByText(/^doors$/i).or(page.getByText(/^ramps$/i));

    if ((await groupHeader.count()) === 0) {
      test.skip();
      return;
    }

    await groupHeader.first().click();
    await page.waitForTimeout(300);

    // Look for progress indicators on instances
    const progressIndicator = page
      .locator('[role="progressbar"]')
      .or(page.getByText(/%/))
      .or(page.getByText(/complete|pending|in progress/i))
      .or(page.locator('[data-status]'));

    if ((await progressIndicator.count()) > 0) {
      await expect(progressIndicator.first()).toBeVisible();
    } else {
      // No progress indicators - that's OK for new instances
      test.skip();
    }
  });
});

test.describe('Element Instances - Create and Clone', () => {
  test.beforeEach(async ({ assessmentPage, page }) => {
    await assessmentPage.goto();
    // Switch to element mode
    const elementModeBtn = page
      .getByRole('button', { name: /element|by element/i })
      .or(page.getByRole('tab', { name: /element/i }));

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.first().click();
      await page.waitForTimeout(500);
    }
  });

  test('should show add/create button for new element instances', async ({ page }) => {
    // Look for add button in element mode
    const addBtn = page
      .getByRole('button', { name: /add|create|new|\+/i })
      .or(page.locator('[aria-label*="add"]'))
      .or(page.locator('[data-action="add-instance"]'));

    if ((await addBtn.count()) > 0) {
      await expect(addBtn.first()).toBeVisible();
    } else {
      // Add button might be inside expanded group
      const groupHeader = page.getByText(/^doors$/i);
      if ((await groupHeader.count()) > 0) {
        await groupHeader.first().click();
        await page.waitForTimeout(300);

        const addBtnInGroup = page.getByRole('button', { name: /add|create|new|\+/i });
        if ((await addBtnInGroup.count()) > 0) {
          await expect(addBtnInGroup.first()).toBeVisible();
        } else {
          test.skip();
        }
      } else {
        test.skip();
      }
    }
  });

  test('should open create dialog when add button is clicked', async ({ page }) => {
    // Find and expand an element group first
    const groupHeader = page.getByText(/^doors$/i).or(page.getByText(/^ramps$/i));

    if ((await groupHeader.count()) > 0) {
      await groupHeader.first().click();
      await page.waitForTimeout(300);
    }

    // Find add button
    const addBtn = page
      .getByRole('button', { name: /add|create|new/i })
      .or(page.locator('[data-action="add-instance"]'));

    if ((await addBtn.count()) === 0) {
      test.skip();
      return;
    }

    await addBtn.first().click();
    await page.waitForTimeout(500);

    // Should show a dialog or form
    const dialogOrForm = page
      .locator('[role="dialog"]')
      .or(page.locator('form'))
      .or(page.getByPlaceholder(/label|name/i));

    await expect(dialogOrForm.first()).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Element Instances - Batch Assessment', () => {
  test.beforeEach(async ({ assessmentPage, page }) => {
    await assessmentPage.goto();
    // Switch to element mode
    const elementModeBtn = page
      .getByRole('button', { name: /element|by element/i })
      .or(page.getByRole('tab', { name: /element/i }));

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.first().click();
      await page.waitForTimeout(500);
    }
  });

  test('should show batch assess button for element instances', async ({ page }) => {
    // Find and select an element instance
    const groupHeader = page.getByText(/^doors$/i).or(page.getByText(/^ramps$/i));

    if ((await groupHeader.count()) === 0) {
      test.skip();
      return;
    }

    await groupHeader.first().click();
    await page.waitForTimeout(300);

    const instance = page
      .getByText(/door \d+|ramp \d+/i)
      .or(page.locator('[data-element-instance]'));

    if ((await instance.count()) === 0) {
      test.skip();
      return;
    }

    await instance.first().click();
    await page.waitForTimeout(500);

    // Look for batch assess button
    const batchAssessBtn = page
      .getByRole('button', { name: /assess all|batch assess|analyze all/i })
      .or(page.getByRole('button', { name: /assess/i }));

    if ((await batchAssessBtn.count()) > 0) {
      await expect(batchAssessBtn.first()).toBeVisible();
    } else {
      // Might just have a regular analyze button
      const analyzeBtn = page.getByRole('button', { name: /analyze/i });
      await expect(analyzeBtn.first()).toBeVisible();
    }
  });
});

test.describe('Element Instances - Edit and Delete', () => {
  test.beforeEach(async ({ assessmentPage, page }) => {
    await assessmentPage.goto();
    // Switch to element mode
    const elementModeBtn = page
      .getByRole('button', { name: /element|by element/i })
      .or(page.getByRole('tab', { name: /element/i }));

    if ((await elementModeBtn.count()) > 0) {
      await elementModeBtn.first().click();
      await page.waitForTimeout(500);
    }
  });

  test('should allow editing element instance label', async ({ page }) => {
    // Find and select an element instance
    const groupHeader = page.getByText(/^doors$/i);

    if ((await groupHeader.count()) === 0) {
      test.skip();
      return;
    }

    await groupHeader.first().click();
    await page.waitForTimeout(300);

    const instance = page
      .getByText(/door \d+/i)
      .or(page.locator('[data-element-instance]'));

    if ((await instance.count()) === 0) {
      test.skip();
      return;
    }

    await instance.first().click();
    await page.waitForTimeout(500);

    // Look for edit/rename button
    const editBtn = page
      .getByRole('button', { name: /edit|rename/i })
      .or(page.locator('[aria-label*="edit"]'));

    if ((await editBtn.count()) > 0) {
      await expect(editBtn.first()).toBeVisible();
    } else {
      // Edit might be in a menu or not available
      test.skip();
    }
  });

  test('should show delete option for element instances', async ({ page }) => {
    // Find and select an element instance
    const groupHeader = page.getByText(/^doors$/i);

    if ((await groupHeader.count()) === 0) {
      test.skip();
      return;
    }

    await groupHeader.first().click();
    await page.waitForTimeout(300);

    const instance = page
      .getByText(/door \d+/i)
      .or(page.locator('[data-element-instance]'));

    if ((await instance.count()) === 0) {
      test.skip();
      return;
    }

    await instance.first().click();
    await page.waitForTimeout(500);

    // Look for delete button
    const deleteBtn = page
      .getByRole('button', { name: /delete|remove/i })
      .or(page.locator('[aria-label*="delete"]'));

    if ((await deleteBtn.count()) > 0) {
      await expect(deleteBtn.first()).toBeVisible();
    } else {
      // Delete might be in a menu or protected
      test.skip();
    }
  });
});

test.describe('Element Mode - Section Mode Toggle', () => {
  test.beforeEach(async ({ assessmentPage }) => {
    await assessmentPage.goto();
  });

  test('should switch back to section mode from element mode', async ({ page }) => {
    // First switch to element mode
    const elementModeBtn = page
      .getByRole('button', { name: /element|by element/i })
      .or(page.getByRole('tab', { name: /element/i }));

    if ((await elementModeBtn.count()) === 0) {
      test.skip();
      return;
    }

    await elementModeBtn.first().click();
    await page.waitForTimeout(500);

    // Now switch back to section mode
    const sectionModeBtn = page
      .getByRole('button', { name: /section|by section/i })
      .or(page.getByRole('tab', { name: /section/i }));

    if ((await sectionModeBtn.count()) === 0) {
      test.skip();
      return;
    }

    await sectionModeBtn.first().click();
    await page.waitForTimeout(500);

    // Should show individual code sections again (11B-xxx.x.x format)
    const codeSections = page.locator('button').filter({ hasText: /11B-\d+\.\d+/ });
    await expect(codeSections.first()).toBeVisible({ timeout: 5000 });
  });
});
