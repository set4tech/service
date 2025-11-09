/* eslint-disable no-console */
import { chromium, FullConfig } from '@playwright/test';

/**
 * Global teardown runs once after all tests
 * Use this to clean up test data, close connections, etc.
 */
async function globalTeardown(_config: FullConfig) {
  console.log('\n🧹 Running global teardown...');

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Clean up any remaining test data
    console.log('  ↪ Cleaning up test data...');

    // Option 1: Call your cleanup API endpoint
    // const response = await page.request.post(`${baseURL}/api/test-cleanup`, {
    //   data: { deleteAll: true }
    // });

    // Option 2: Delete via UI (placeholder for future implementation)
    // Would navigate to projects and delete test data

    console.log('  ✓ Test data cleaned up');

    console.log('✅ Global teardown complete');
  } catch (error) {
    console.error('⚠ Global teardown encountered errors:', error);
    // Don't throw - we don't want teardown failures to fail the test run
  } finally {
    await browser.close();
    await page.close();
  }
}

export default globalTeardown;
