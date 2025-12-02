/* eslint-disable no-console */
import { FullConfig } from '@playwright/test';
import { disposeTestDataManager } from './test-data-api';

/**
 * Global teardown runs once after all tests complete
 *
 * Cleans up test data created during global setup
 */
async function globalTeardown(_config: FullConfig) {
  console.log('\n🧹 Running global teardown...');

  try {
    // Only cleanup if we created test data (not using existing assessment)
    if (process.env.SKIP_TEST_DATA_CLEANUP !== 'true') {
      console.log('  ↪ Cleaning up test data...');
      await disposeTestDataManager();
      console.log('  ✓ Test data cleaned up');
    } else {
      console.log('  ℹ Skipping cleanup (SKIP_TEST_DATA_CLEANUP=true)');
    }

    console.log('✅ Global teardown complete\n');
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw - we want other cleanup to continue
  }
}

export default globalTeardown;
