import { chromium, FullConfig } from '@playwright/test';
import { TEST_USERS } from './auth-helpers';

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
    const response = await page.goto(`${baseURL}/api/health`);

    if (!response?.ok()) {
      throw new Error(`Server not available at ${baseURL}`);
    }

    console.log('  ✓ Server is running');

    // 2. Create test users if they don't exist
    console.log('  ↪ Ensuring test users exist...');

    for (const [role, user] of Object.entries(TEST_USERS)) {
      try {
        // Try to login - if it fails, user doesn't exist
        await page.goto(`${baseURL}/login`);
        await page.fill('input[name="email"]', user.email);
        await page.fill('input[name="password"]', user.password);

        const loginBtn = page.getByRole('button', { name: /sign in|log in/i });
        await loginBtn.click();

        // Wait briefly to see if login succeeds
        await page.waitForTimeout(2000);

        const url = page.url();
        if (url.includes('/login')) {
          console.log(`  ⚠ Test user ${role} (${user.email}) does not exist - create manually`);
        } else {
          console.log(`  ✓ Test user ${role} exists`);
        }
      } catch (error) {
        console.log(`  ⚠ Could not verify test user ${role}:`, error);
      }
    }

    // 3. Clean up old test data
    console.log('  ↪ Cleaning up old test data...');
    console.log('  ↪ Would delete test data older than 24 hours');

    console.log('✅ Global setup complete\n');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
