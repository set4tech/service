/* eslint-disable react-hooks/rules-of-hooks, no-console */
import { test as base, expect, Page } from '@playwright/test';

/**
 * Test Data interface
 */
export interface TestAssessmentData {
  assessmentId: string;
  projectId: string;
  customerId: string;
}

/**
 * Extended test with custom fixtures for assessment testing
 */
export const test = base.extend<{
  /**
   * The test assessment data (created in global setup or from env)
   */
  testData: TestAssessmentData;

  /**
   * Navigate to an assessment page and wait for PDF to load
   */
  assessmentPage: {
    goto: (assessmentId?: string) => Promise<void>;
    page: Page;
  };

  /**
   * Get the PDF viewer canvas element
   */
  pdfCanvas: () => Promise<ReturnType<Page['locator']>>;

  /**
   * Wait for PDF to be fully loaded
   */
  waitForPDF: () => Promise<void>;
}>({
  // Test data fixture - uses env vars set by global setup
  testData: async ({}, use) => {
    const assessmentId = process.env.TEST_ASSESSMENT_ID;
    const projectId = process.env.TEST_PROJECT_ID || '';
    const customerId = process.env.TEST_CUSTOMER_ID || '';

    if (!assessmentId) {
      throw new Error(
        'TEST_ASSESSMENT_ID not set. Either:\n' +
          '1. Let global setup create test data automatically, or\n' +
          '2. Set TEST_ASSESSMENT_ID env var to an existing assessment'
      );
    }

    await use({
      assessmentId,
      projectId,
      customerId,
    });
  },

  // Assessment page navigation fixture
  assessmentPage: async ({ page, testData }, use) => {
    await use({
      page,
      async goto(assessmentId?: string) {
        const id = assessmentId || testData.assessmentId;
        console.log(`[Test] Navigating to assessment: ${id}`);

        await page.goto(`/assessments/${id}`);

        // Wait for check list to load
        await page.waitForSelector('button:has-text("11B-")', { timeout: 30000 });
        console.log(`[Test] Check list loaded`);

        // Click on first check to open PDF viewer
        const firstCheck = page.locator('button:has-text("11B-")').first();
        await firstCheck.click();

        // Wait for PDF viewer canvas to be present
        await page.waitForSelector('canvas', { timeout: 30000 });

        // Wait for PDF to finish loading (canvas has content)
        await page.waitForFunction(
          () => {
            const canvas = document.querySelector('canvas');
            return canvas && canvas.width > 0 && canvas.height > 0;
          },
          { timeout: 30000 }
        );

        console.log(`[Test] Assessment page loaded with PDF viewer`);
      },
    });
  },

  // PDF canvas locator
  pdfCanvas: async ({ page }, use) => {
    await use(async () => {
      return page.locator('canvas').first();
    });
  },

  // Wait for PDF rendering
  waitForPDF: async ({ page }, use) => {
    await use(async () => {
      // Wait for canvas to be visible and have non-zero dimensions
      await page.waitForFunction(
        () => {
          const canvas = document.querySelector('canvas');
          return canvas && canvas.width > 0 && canvas.height > 0;
        },
        { timeout: 30000 }
      );
    });
  },
});

export { expect };

/**
 * Helper to skip tests that require test data
 */
export function requireTestData(testFn: typeof test) {
  return testFn.extend({
    testData: async ({ testData }, use, testInfo) => {
      if (!testData.assessmentId) {
        testInfo.skip(true, 'No test assessment available');
        return;
      }
      await use(testData);
    },
  });
}
