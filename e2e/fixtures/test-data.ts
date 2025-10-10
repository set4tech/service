/**
 * Test data fixtures for E2E tests
 */

export const TEST_CUSTOMER = {
  name: 'E2E Test Customer',
  email: 'e2e-test@example.com',
};

export const TEST_PROJECT = {
  name: 'E2E Test Project',
  location: '123 Test Street, San Francisco, CA',
  occupancy: 'E - Educational',
};

export const TEST_ASSESSMENT = {
  code_id: 'california-building-code-11b', // This should match your actual code ID
};

export const TEST_CHECK = {
  code_section_number: '11B-404.2.6',
  code_section_title: 'Clear Floor Space',
};

/**
 * Helper to generate unique test data to avoid conflicts
 */
export function uniqueTestData<T extends Record<string, any>>(base: T): T {
  const timestamp = Date.now();
  return {
    ...base,
    name: `${base.name} ${timestamp}`,
  };
}
