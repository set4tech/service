import { Page, expect } from '@playwright/test';

/**
 * Authentication helper functions for E2E tests
 */

export interface TestUser {
  email: string;
  password: string;
  role: 'admin' | 'viewer' | 'editor';
}

// Test users (should match your Supabase test data)
export const TEST_USERS: Record<string, TestUser> = {
  admin: {
    email: 'admin@test.com',
    password: 'TestPassword123!',
    role: 'admin',
  },
  viewer: {
    email: 'viewer@test.com',
    password: 'TestPassword123!',
    role: 'viewer',
  },
  editor: {
    email: 'editor@test.com',
    password: 'TestPassword123!',
    role: 'editor',
  },
};

/**
 * Login as a specific user
 */
export async function loginAsUser(
  page: Page,
  email?: string,
  role: 'admin' | 'viewer' | 'editor' = 'admin'
): Promise<void> {
  const user = email ? { email, password: TEST_USERS.admin.password, role } : TEST_USERS[role];

  await page.goto('/login');

  // Fill in credentials
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);

  // Submit form
  await page.getByRole('button', { name: /sign in|log in|login/i }).click();

  // Wait for successful login (redirect to projects or dashboard)
  await expect(page).toHaveURL(/\/(projects|dashboard|assessments)/);

  // Verify user menu or profile is visible
  const userMenu = page.getByText(user.email).or(page.getByRole('button', { name: /user menu/i }));
  await expect(userMenu.first()).toBeVisible({ timeout: 5000 });
}

/**
 * Logout current user
 */
export async function logout(page: Page): Promise<void> {
  // Open user menu
  const userMenuButton = page
    .getByRole('button', { name: /user menu|profile/i })
    .or(page.locator('[data-testid="user-menu"]'));

  if ((await userMenuButton.count()) > 0) {
    await userMenuButton.click();
  }

  // Click logout
  await page.getByRole('button', { name: /sign out|log out|logout/i }).click();

  // Verify redirected to login
  await expect(page).toHaveURL(/\/login/);
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  try {
    // Try to navigate to protected page
    await page.goto('/projects');

    // If we're still on projects page (not redirected to login), we're authenticated
    await page.waitForTimeout(1000);
    const url = page.url();
    return !url.includes('/login');
  } catch {
    return false;
  }
}

/**
 * Get current user's session token (if exposed in UI)
 */
export async function getSessionToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    // Try to get token from localStorage or sessionStorage
    return localStorage.getItem('supabase.auth.token') || sessionStorage.getItem('session_token');
  });
}

/**
 * Clear all cookies and storage (full logout)
 */
export async function clearAuthState(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}
