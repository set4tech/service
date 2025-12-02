/* eslint-disable no-console */
import { chromium, FullConfig } from '@playwright/test';
import { getTestDataManager } from './test-data-api';

/**
 * Global setup runs once before all tests
 *
 * - Creates test data (customer, project, assessment) via API
 * - Sets environment variables for test fixtures to use
 */
async function globalSetup(config: FullConfig) {
  console.log('🔧 Running global setup...');

  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // 1. Check if server is running
    console.log('  ↪ Checking server health...');
    const response = await page.goto(`${baseURL}/`);

    if (!response?.ok()) {
      throw new Error(`Server not available at ${baseURL}`);
    }

    console.log('  ✓ Server is running');
    console.log('  ℹ App has no authentication - tests run without login');

    // 2. Create test data (unless using existing assessment)
    if (process.env.TEST_ASSESSMENT_ID) {
      console.log(`  ℹ Using existing assessment: ${process.env.TEST_ASSESSMENT_ID}`);
    } else {
      console.log('  ↪ Creating test data via API...');
      const manager = await getTestDataManager(baseURL);
      const testData = await manager.createTestAssessment();

      // Set env vars for fixtures to use
      process.env.TEST_ASSESSMENT_ID = testData.assessmentId;
      process.env.TEST_PROJECT_ID = testData.projectId;
      process.env.TEST_CUSTOMER_ID = testData.customerId;

      console.log(`  ✓ Test data created:`);
      console.log(`    - Assessment: ${testData.assessmentId}`);
      console.log(`    - Project: ${testData.projectId}`);
      console.log(`    - Customer: ${testData.customerId}`);
    }

    console.log('✅ Global setup complete\n');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
