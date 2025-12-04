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
  projectDescription?: string;
  pdfPath?: string;
  waitForSeeding?: boolean;
}

/**
 * Create a complete test assessment using the multi-step project wizard
 *
 * The app flow is:
 * 1. Home page (/) → Click "Create New Project" link
 * 2. /projects/new → Step 1: Project Info
 * 3. Step 2: PDF Upload
 * 4. Step 3: Code Book Selection
 * 5. Step 4: Customer Info
 * 6. Step 5: Review → Create Project
 * 7. Redirects to /assessments/[id]
 */
export async function createTestAssessment(
  page: Page,
  options: CreateAssessmentOptions = {}
): Promise<TestAssessment> {
  const {
    customerName = `Test Customer ${Date.now()}`,
    projectName = `Test Project ${Date.now()}`,
    projectDescription = 'E2E test project',
    pdfPath = './e2e/fixtures/test-plans.pdf',
    waitForSeeding = true,
  } = options;

  // Navigate to home page
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Click "Create New Project" link (it's a Link component, not a button)
  await page.getByRole('link', { name: /create new project/i }).click();

  // Wait for the wizard to load
  await page.waitForURL('/projects/new');
  await expect(page.getByText('Project Information')).toBeVisible();

  // Step 1: Project Info
  await page.fill('input[type="text"]', projectName);
  const descriptionTextarea = page.locator('textarea').first();
  if (await descriptionTextarea.isVisible()) {
    await descriptionTextarea.fill(projectDescription);
  }
  await page.getByRole('button', { name: /next/i }).click();

  // Step 2: PDF Upload
  await expect(page.getByText('Upload PDF Document')).toBeVisible();
  await page.setInputFiles('input[type="file"]', pdfPath);
  // Wait for file to be selected (green checkmark appears)
  await expect(page.locator('.text-green-600')).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: /next/i }).click();

  // Step 3: Code Book Selection
  await expect(page.getByText('Select Code Books')).toBeVisible();
  // Select at least one chapter (click first checkbox)
  const firstCheckbox = page.locator('input[type="checkbox"]').first();
  await firstCheckbox.check();
  await page.getByRole('button', { name: /next/i }).click();

  // Step 4: Customer Info
  await expect(page.getByText('Customer Information')).toBeVisible();
  // Click "Create New" to create a new customer
  await page.getByRole('button', { name: /create new/i }).click();
  await page.fill('input[placeholder="Enter customer name"]', customerName);
  await page.getByRole('button', { name: /next/i }).click();

  // Step 5: Review & Create
  await expect(page.getByText('Review & Create')).toBeVisible();
  await page.getByRole('button', { name: /create project/i }).click();

  // Wait for redirect to assessment page
  await page.waitForURL(/\/assessments\/[a-f0-9-]+/, { timeout: 60000 });

  // Extract assessment ID from URL
  const assessmentUrl = page.url();
  const assessmentMatch = assessmentUrl.match(/assessments\/([a-f0-9-]+)/);

  if (!assessmentMatch) {
    throw new Error('Failed to get assessment ID from URL');
  }

  const assessmentId = assessmentMatch[1];

  // Wait for seeding if requested
  if (waitForSeeding) {
    // Wait for seeding to start (may show "seeding checks" or similar)
    const seedingIndicator = page.getByText(/seeding|processing|loading checks/i);
    if (await seedingIndicator.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Wait for seeding to complete
      await expect(page.getByText(/seeded|complete|loaded/i)).toBeVisible({
        timeout: 120000,
      });
    }
  }

  return {
    assessmentId,
    projectId: '', // Not easily extractable from this flow
    customerId: '',
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
  await page.waitForLoadState('networkidle');

  const checks = page.locator('[data-check-id]');

  // Wait for checks to be visible
  await expect(checks.first()).toBeVisible({ timeout: 30000 });

  let index = 0;

  // Mark checks as compliant
  for (let i = 0; i < compliant; i++) {
    await checks.nth(index).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^compliant$/i }).click();
    const textarea = page.locator('textarea');
    if (await textarea.isVisible()) {
      await textarea.fill(`Compliant test note ${i + 1}`);
    }
    await page.getByRole('button', { name: /save|confirm/i }).click();
    await page.waitForTimeout(500);
    index++;
  }

  // Mark checks as non-compliant
  for (let i = 0; i < nonCompliant; i++) {
    await checks.nth(index).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /non-compliant/i }).click();
    const textarea = page.locator('textarea');
    if (await textarea.isVisible()) {
      await textarea.fill(`Non-compliant test issue ${i + 1}`);
    }
    await page.getByRole('button', { name: /save|confirm/i }).click();
    await page.waitForTimeout(500);
    index++;
  }

  // Mark checks as N/A
  for (let i = 0; i < notApplicable; i++) {
    await checks.nth(index).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /not applicable|n\/a/i }).click();
    const textarea = page.locator('textarea');
    if (await textarea.isVisible()) {
      await textarea.fill(`N/A test note ${i + 1}`);
    }
    await page.getByRole('button', { name: /save|confirm/i }).click();
    await page.waitForTimeout(500);
    index++;
  }
}

/**
 * Clean up test data by deleting all test entities
 */
export async function cleanupTestData(page: Page): Promise<void> {
  // Navigate to home and delete any test projects
  await page.goto('/');

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
