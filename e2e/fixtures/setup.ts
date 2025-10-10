/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, expect } from '@playwright/test';

/**
 * Extended test with custom fixtures for PDF viewer testing
 */
export const test = base.extend<{
  /**
   * Navigate to an assessment page and wait for PDF to load
   */
  assessmentPage: { goto: (assessmentId: string) => Promise<void> };

  /**
   * Get the PDF viewer canvas element
   */
  pdfCanvas: () => Promise<any>;

  /**
   * Wait for PDF to be fully loaded
   */
  waitForPDF: () => Promise<void>;
}>({
  assessmentPage: async ({ page }, use) => {
    await use({
      async goto(assessmentId: string) {
        await page.goto(`/assessments/${assessmentId}`);

        // Wait for PDF viewer to be present
        await page.waitForSelector('canvas', { timeout: 30000 });

        // Wait for PDF to finish loading (no loading spinner)
        await page.waitForFunction(() => !document.body.textContent?.includes('Loading PDF'), {
          timeout: 30000,
        });
      },
    });
  },

  pdfCanvas: async ({ page }, use) => {
    await use(async () => {
      return page.locator('canvas').first();
    });
  },

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
