import { chromium, FullConfig } from '@playwright/test';

/* eslint-disable no-console */
/**
 * Global setup runs once before all tests
 * Use this to create test users, seed database, etc.
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

    // Note: Skipping test user setup - app is open access
    // Only customer reports require password protection

    console.log('✅ Global setup complete\n');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
