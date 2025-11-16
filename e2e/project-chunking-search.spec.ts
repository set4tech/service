import { test, expect } from './fixtures/setup';
import { loginAsUser } from './fixtures/auth-helpers';

/**
 * Regression test for PDF Chunking & Search Feature
 *
 * This test prevents the following bugs:
 * 1. URL typo in chunking endpoint call (/api/project vs /api/projects)
 * 2. Client crash when API returns 400 error for un-chunked PDFs
 *
 * Bug History (November 2024):
 * - Projects were created but PDFs never chunked due to URL typo
 * - Search feature always failed with 400 "PDF has not been chunked yet"
 * - Client crashed with "Cannot read properties of undefined (reading 'length')"
 *
 * Related files:
 * - app/projects/new/page.tsx (line 264) - Fixed URL typo
 * - hooks/useTextSearch.ts (line 164) - Added error handling
 */
test.describe('Project Chunking and Search Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('should call correct chunking endpoint URL during project creation', async ({ page }) => {
    // Monitor network requests to verify correct URL is called
    const chunkRequests: Array<{ url: string; method: string }> = [];

    page.on('request', request => {
      const url = request.url();
      if (url.includes('/chunk')) {
        chunkRequests.push({
          url: url,
          method: request.method(),
        });
      }
    });

    // Navigate to new project page
    await page.goto('/projects/new');

    // Fill in project details - Step 1: Project Name
    await page.getByLabel(/project name/i).fill('PDF Search Test Project');
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2: Upload PDF
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('./data/2010ADAStandards.pdf');
    await page.waitForTimeout(1000); // Wait for upload
    await page.getByRole('button', { name: /next/i }).click();

    // Step 3: Select code chapters
    const chapterCheckbox = page.locator('input[type="checkbox"]').first();
    if (!(await chapterCheckbox.isChecked())) {
      await chapterCheckbox.click();
    }
    await page.getByRole('button', { name: /next/i }).click();

    // Step 4: Skip variables (click next)
    await page.getByRole('button', { name: /next/i }).click();

    // Step 5: Select first customer
    const firstCustomer = page.locator('[data-customer]').first();
    if (await firstCustomer.isVisible()) {
      await firstCustomer.click();
    }
    await page.getByRole('button', { name: /next/i }).click();

    // Step 6: Submit project
    await page.getByRole('button', { name: /create|submit/i }).click();

    // Wait for redirect (should go to assessment page)
    await page.waitForURL(/\/assessments\/.+/, { timeout: 30000 });

    // Give time for background chunking call
    await page.waitForTimeout(2000);

    // CRITICAL TEST: Verify chunking endpoint was called with CORRECT URL
    const correctUrlCalled = chunkRequests.some(
      req =>
        req.url.includes('/api/projects/') && req.url.includes('/chunk') && req.method === 'POST'
    );
    expect(correctUrlCalled).toBe(true);

    // CRITICAL TEST: Verify the WRONG URL was NOT called (typo without 's')
    // The typo would be: /api/project/{id}/chunk (missing 's' in 'project')
    const wrongUrlCalled = chunkRequests.some(req => {
      // Match pattern like /api/project/{uuid}/chunk where 'project' has no 's'
      return (
        /\/api\/project\/[a-f0-9-]+\/chunk/.test(req.url) && !/\/api\/projects\//.test(req.url)
      );
    });
    expect(wrongUrlCalled).toBe(false);

    // Additional verification: log the URLs called for debugging
    if (!correctUrlCalled) {
      console.error('Chunking URLs called:', chunkRequests);
    }
  });

  test('should gracefully handle search when PDF is not yet chunked', async ({ page }) => {
    // This test ensures the client doesn't crash when searching
    // before chunking completes or when chunking status is 'pending'

    // Go directly to an assessment page
    // (Skipping project creation to save time - assumes assessment exists)
    const testAssessmentId = process.env.TEST_ASSESSMENT_ID;

    if (!testAssessmentId) {
      test.skip(true, 'Set TEST_ASSESSMENT_ID environment variable to run this test');
      return;
    }

    await page.goto(`/assessments/${testAssessmentId}`);

    // Wait for PDF to load
    await expect(page.locator('canvas')).toBeVisible({ timeout: 10000 });

    // Monitor console errors
    const errors: string[] = [];
    page.on('pageerror', error => {
      errors.push(error.message);
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Try to search (press 'f' or 'Ctrl+F' to open search)
    await page.keyboard.press('f');

    // Wait for search input to appear
    const searchInput = page.locator('input[type="search"]').or(page.getByPlaceholder(/search/i));
    await expect(searchInput.first()).toBeVisible({ timeout: 5000 });

    // Type a search query
    await searchInput.first().fill('door');
    await page.waitForTimeout(500); // Debounce delay

    // Type more to trigger multiple searches
    await searchInput.first().fill('doorway');
    await page.waitForTimeout(500);

    await searchInput.first().fill('upper parapet');
    await page.waitForTimeout(500);

    // Wait a bit more for any async errors to appear
    await page.waitForTimeout(1000);

    // CRITICAL TEST: Should NOT have "Cannot read properties of undefined" error
    const hasUndefinedError = errors.some(
      e =>
        e.includes('Cannot read properties of undefined') ||
        e.includes("Cannot read property 'length'") ||
        e.includes('undefined.length')
    );

    if (hasUndefinedError) {
      console.error('Errors found:', errors);
    }

    expect(hasUndefinedError).toBe(false);

    // Should not have crashed - page should still be interactive
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Search input should still be functional
    await expect(searchInput.first()).toBeVisible();
  });

  test('should successfully search after PDF is chunked', async ({ page }) => {
    // This test verifies the complete happy path:
    // Project created → PDF chunked → Search works

    const testAssessmentId = process.env.TEST_ASSESSMENT_ID;

    if (!testAssessmentId) {
      test.skip(true, 'Set TEST_ASSESSMENT_ID environment variable to run this test');
      return;
    }

    // Get assessment details to find project ID
    const assessmentResponse = await page.request.get(`/api/assessments/${testAssessmentId}`);
    if (!assessmentResponse.ok()) {
      test.skip(true, 'Assessment not found');
      return;
    }

    const assessment = await assessmentResponse.json();
    const projectId = assessment.project_id;

    // Check if PDF is chunked, if not, trigger chunking
    const statusResponse = await page.request.get(`/api/projects/${projectId}/chunk`);
    const status = await statusResponse.json();

    if (status.status === 'pending') {
      // Trigger chunking
      const chunkResponse = await page.request.post(`/api/projects/${projectId}/chunk`);
      expect(chunkResponse.ok()).toBe(true);

      // Wait for chunking to complete (max 60 seconds for large PDFs)
      let attempts = 0;
      let chunkingComplete = false;

      while (attempts < 60 && !chunkingComplete) {
        await page.waitForTimeout(1000);
        const checkStatus = await page.request.get(`/api/projects/${projectId}/chunk`);
        const currentStatus = await checkStatus.json();

        if (currentStatus.status === 'completed') {
          chunkingComplete = true;
        } else if (currentStatus.status === 'failed') {
          throw new Error(`Chunking failed: ${currentStatus.error}`);
        }
        attempts++;
      }

      expect(chunkingComplete).toBe(true);
    } else if (status.status === 'failed') {
      test.skip(true, 'PDF chunking failed - cannot test search');
      return;
    }

    // Now test search functionality
    await page.goto(`/assessments/${testAssessmentId}`);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 10000 });

    // Open search
    await page.keyboard.press('f');
    const searchInput = page.locator('input[type="search"]').or(page.getByPlaceholder(/search/i));
    await expect(searchInput.first()).toBeVisible();

    // Search for a common term
    await searchInput.first().fill('door');
    await page.waitForTimeout(500);

    // Should either show results or "no results" message (not crash)
    const hasResults = page.getByText(/\d+ match(es)?/i).or(page.getByText(/found/i));
    const noResults = page.getByText(/no results|no matches/i);

    // At least one should be visible
    const resultsVisible = await Promise.race([
      hasResults.isVisible().catch(() => false),
      noResults.isVisible().catch(() => false),
    ]);

    // Either message should appear (search completed without crashing)
    expect(resultsVisible).toBe(true);
  });

  test('should handle rapid search queries without crashing', async ({ page }) => {
    // Test that rapid typing doesn't cause race conditions or crashes

    const testAssessmentId = process.env.TEST_ASSESSMENT_ID;

    if (!testAssessmentId) {
      test.skip(true, 'Set TEST_ASSESSMENT_ID environment variable to run this test');
      return;
    }

    await page.goto(`/assessments/${testAssessmentId}`);
    await expect(page.locator('canvas')).toBeVisible({ timeout: 10000 });

    const errors: string[] = [];
    page.on('pageerror', error => {
      errors.push(error.message);
    });

    // Open search
    await page.keyboard.press('f');
    const searchInput = page.locator('input[type="search"]').or(page.getByPlaceholder(/search/i));
    await expect(searchInput.first()).toBeVisible();

    // Rapidly type different queries
    const queries = [
      'a',
      'do',
      'door',
      'doorw',
      'doorwa',
      'doorway',
      'w',
      'wi',
      'win',
      'wind',
      'window',
    ];

    for (const query of queries) {
      await searchInput.first().fill(query);
      await page.waitForTimeout(50); // Very short delay to simulate rapid typing
    }

    // Wait for final search to complete
    await page.waitForTimeout(1000);

    // Should not have crashed
    const hasUndefinedError = errors.some(e => e.includes('Cannot read properties of undefined'));
    expect(hasUndefinedError).toBe(false);

    // Page should still be interactive
    await expect(page.locator('canvas')).toBeVisible();
  });
});
