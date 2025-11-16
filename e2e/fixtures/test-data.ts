import { Page, expect } from '@playwright/test';

/**
 * Test data creation and cleanup helpers
 */

export interface TestAssessment {
  assessmentId: string;
  projectId: string;
  customerId: string;
  projectName: string;
  customerName: string;
}

export interface CreateAssessmentOptions {
  customerName?: string;
  projectName?: string;
  projectAddress?: string;
  codeVersion?: string;
  pdfPath?: string;
  waitForSeeding?: boolean;
}

/**
 * Create a complete test assessment with customer, project, and seeded checks
 */
export async function createTestAssessment(
  page: Page,
  options: CreateAssessmentOptions = {}
): Promise<TestAssessment> {
  const {
    customerName = `Test Customer ${Date.now()}`,
    projectName = `Test Project ${Date.now()}`,
    projectAddress = '123 Test Street, Test City, CA 90000',
    codeVersion = '2025 CBC',
    pdfPath = './e2e/fixtures/test-plans.pdf',
    waitForSeeding = true,
  } = options;

  // Navigate to projects
  await page.goto('/projects');
  await page.waitForLoadState('networkidle');

  // Create customer (if needed)
  const customerId = '';
  const existingCustomer = page.getByText(customerName).first();

  if ((await existingCustomer.count()) === 0) {
    // Create new customer
    const newCustomerBtn = page.getByRole('button', { name: /new customer|add customer/i });
    if ((await newCustomerBtn.count()) > 0) {
      await newCustomerBtn.click();
      await page.fill('input[name="customer_name"]', customerName);
      await page.getByRole('button', { name: /save|create/i }).click();
      await expect(page.getByText(customerName)).toBeVisible({ timeout: 5000 });
    }
  }

  // Create project
  await page.getByRole('button', { name: /new project|create project/i }).click();
  await page.fill('input[name="project_name"]', projectName);
  await page.fill('input[name="address"]', projectAddress);

  // Select customer if dropdown exists
  const customerSelect = page.locator('select[name="customer_id"]');
  if ((await customerSelect.count()) > 0) {
    await customerSelect.selectOption({ label: customerName });
  }

  await page.getByRole('button', { name: /create|save/i }).click();
  await expect(page.getByText(projectName)).toBeVisible({ timeout: 5000 });

  // Get project ID from URL or API response
  let projectId = '';
  const projectUrl = page.url();
  const projectMatch = projectUrl.match(/projects\/([a-f0-9-]+)/);
  if (projectMatch) {
    projectId = projectMatch[1];
  }

  // Create assessment
  await page.getByRole('button', { name: /new assessment|create assessment/i }).click();

  // Select code version
  const codeSelect = page.locator('select[name="code_version"]');
  if ((await codeSelect.count()) > 0) {
    await codeSelect.selectOption(codeVersion);
  }

  // Upload PDF
  await page.setInputFiles('input[type="file"]', pdfPath);

  // Wait for upload
  await expect(page.getByText(/uploading|processing/i)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/upload complete|uploaded/i)).toBeVisible({ timeout: 30000 });

  // Get assessment ID from URL
  await page.waitForURL(/assessments\/[a-f0-9-]+/, { timeout: 30000 });
  const assessmentUrl = page.url();
  const assessmentMatch = assessmentUrl.match(/assessments\/([a-f0-9-]+)/);

  if (!assessmentMatch) {
    throw new Error('Failed to get assessment ID from URL');
  }

  const assessmentId = assessmentMatch[1];

  // Wait for seeding if requested
  if (waitForSeeding) {
    await expect(page.getByText(/seeding checks/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/seeded \d+ checks|seeding complete/i)).toBeVisible({
      timeout: 60000,
    });
  }

  return {
    assessmentId,
    projectId,
    customerId,
    projectName,
    customerName,
  };
}

/**
 * Delete test assessment and associated data
 */
export async function deleteTestAssessment(page: Page, assessmentId: string): Promise<void> {
  await page.goto(`/assessments/${assessmentId}`);

  // Find and click delete button
  const deleteBtn = page.getByRole('button', { name: /delete assessment/i });

  if ((await deleteBtn.count()) > 0) {
    await deleteBtn.click();

    // Confirm deletion
    const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i });
    await confirmBtn.click();

    // Wait for deletion to complete
    await expect(page.getByText(/deleted|removed/i)).toBeVisible({ timeout: 5000 });
  }
}

/**
 * Create multiple test checks with different statuses
 */
export async function seedTestChecks(
  page: Page,
  assessmentId: string,
  options: {
    compliant?: number;
    nonCompliant?: number;
    notApplicable?: number;
  } = {}
): Promise<void> {
  const { compliant = 2, nonCompliant = 2, notApplicable = 1 } = options;

  await page.goto(`/assessments/${assessmentId}`);

  const checks = page.locator('[data-check-id]');

  let index = 0;

  // Mark checks as compliant
  for (let i = 0; i < compliant; i++) {
    await checks.nth(index).click();
    await page.getByRole('button', { name: /^compliant$/i }).click();
    await page.fill('textarea', `Compliant test note ${i + 1}`);
    await page.getByRole('button', { name: /save|confirm/i }).click();
    await page.waitForTimeout(500);
    index++;
  }

  // Mark checks as non-compliant
  for (let i = 0; i < nonCompliant; i++) {
    await checks.nth(index).click();
    await page.getByRole('button', { name: /non-compliant/i }).click();
    await page.fill('textarea', `Non-compliant test issue ${i + 1}`);
    await page.getByRole('button', { name: /save|confirm/i }).click();
    await page.waitForTimeout(500);
    index++;
  }

  // Mark checks as N/A
  for (let i = 0; i < notApplicable; i++) {
    await checks.nth(index).click();
    await page.getByRole('button', { name: /not applicable|n\/a/i }).click();
    await page.fill('textarea', `N/A test note ${i + 1}`);
    await page.getByRole('button', { name: /save|confirm/i }).click();
    await page.waitForTimeout(500);
    index++;
  }
}

/**
 * Clean up test data by deleting all test entities
 */
export async function cleanupTestData(page: Page): Promise<void> {
  // This would call your API to delete test data
  // For now, we can navigate to projects and delete anything with "Test" in the name

  await page.goto('/projects');

  const testProjects = page.getByText(/Test (Project|Customer)/i);
  const count = await testProjects.count();

  for (let i = 0; i < count; i++) {
    try {
      await testProjects.first().click();
      const deleteBtn = page.getByRole('button', { name: /delete/i });

      if ((await deleteBtn.count()) > 0) {
        await deleteBtn.click();
        await page.getByRole('button', { name: /confirm/i }).click();
        await page.waitForTimeout(500);
      }
    } catch (error) {
      console.error('Failed to delete test project:', error);
    }
  }
}
