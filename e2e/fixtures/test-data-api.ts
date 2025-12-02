/* eslint-disable no-console */
import { request, APIRequestContext } from '@playwright/test';

/**
 * Test Data API Client
 *
 * Creates and manages test data via API calls.
 * Works in both local development and CI environments.
 */

export interface TestData {
  customerId: string;
  projectId: string;
  assessmentId: string;
}

// Environment detection
const isCI = !!process.env.CI;
const runId = process.env.GITHUB_RUN_ID || process.env.CI_JOB_ID || Date.now().toString();

// Known chapter IDs from database (same in staging and prod)
const CHAPTER_11A_ID = '0c501993-6248-4f3e-9b39-1ce886e08511';
const CHAPTER_11B_ID = 'edaa97c4-2928-4bf5-bd98-3c4ed0c00a09';

// Test PDF URL - use a stable PDF that exists in S3
// This is a small PDF that's used for testing
const TEST_PDF_URL =
  process.env.TEST_PDF_URL ||
  'https://set4-data.s3.us-east-1.amazonaws.com/analysis-app-data/pdfs/temp_10_4 Markup & Summary_2025-10-05_6kyb0u9jf5y.pdf';

// Prefix for test data names (helps identify and clean up orphaned test data)
const TEST_DATA_PREFIX = isCI ? `CI-${runId}` : 'E2E-Local';

export class TestDataManager {
  private baseUrl: string;
  private context: APIRequestContext | null = null;
  private createdData: TestData[] = [];
  private maxRetries = 3;
  private retryDelay = 1000;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async init(): Promise<void> {
    this.context = await request.newContext({
      baseURL: this.baseUrl,
      timeout: 30000, // 30s timeout for API calls
    });
    console.log(`[TestData] Initialized for ${isCI ? 'CI' : 'local'} environment`);
  }

  async dispose(): Promise<void> {
    if (this.context) {
      await this.context.dispose();
      this.context = null;
    }
  }

  private get api(): APIRequestContext {
    if (!this.context) {
      throw new Error('TestDataManager not initialized. Call init() first.');
    }
    return this.context;
  }

  /**
   * Retry wrapper for flaky operations
   */
  private async withRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.warn(
          `[TestData] ${operationName} failed (attempt ${attempt}/${this.maxRetries}):`,
          lastError.message
        );

        if (attempt < this.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }

    throw new Error(
      `${operationName} failed after ${this.maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Create a complete test assessment with customer, project, and seeded checks.
   * This is the main method tests should use.
   */
  async createTestAssessment(
    options: {
      customerName?: string;
      projectName?: string;
      chapters?: string[];
      seedChecks?: boolean;
    } = {}
  ): Promise<TestData> {
    const timestamp = Date.now();
    const {
      customerName = `${TEST_DATA_PREFIX} Customer ${timestamp}`,
      projectName = `${TEST_DATA_PREFIX} Project ${timestamp}`,
      chapters = [CHAPTER_11A_ID, CHAPTER_11B_ID],
      seedChecks = true,
    } = options;

    console.log(`[TestData] Creating test assessment (${isCI ? 'CI' : 'local'} mode)...`);

    // 1. Create customer
    const customerId = await this.withRetry(async () => {
      const res = await this.api.post('/api/customers', {
        data: { name: customerName },
      });

      if (!res.ok()) {
        throw new Error(`HTTP ${res.status()}: ${await res.text()}`);
      }

      const customer = await res.json();
      return customer.id;
    }, 'Create customer');

    console.log(`[TestData] Created customer: ${customerId}`);

    // 2. Create project with PDF URL
    const projectId = await this.withRetry(async () => {
      const res = await this.api.post('/api/projects', {
        data: {
          customer_id: customerId,
          name: projectName,
          pdf_url: TEST_PDF_URL,
          building_type: 'Commercial',
          building_address: `${TEST_DATA_PREFIX} Test Address`,
        },
      });

      if (!res.ok()) {
        throw new Error(`HTTP ${res.status()}: ${await res.text()}`);
      }

      const project = await res.json();
      return project.id;
    }, 'Create project');

    console.log(`[TestData] Created project: ${projectId}`);

    // 3. Create assessment with selected chapters
    const assessmentId = await this.withRetry(async () => {
      const res = await this.api.post(`/api/projects/${projectId}/assessment`, {
        data: {
          selected_chapter_ids: chapters,
        },
      });

      if (!res.ok()) {
        throw new Error(`HTTP ${res.status()}: ${await res.text()}`);
      }

      const assessmentData = await res.json();
      return assessmentData.assessmentId;
    }, 'Create assessment');

    console.log(`[TestData] Created assessment: ${assessmentId}`);

    // 4. Seed the assessment with checks (if requested)
    if (seedChecks) {
      console.log(`[TestData] Seeding assessment with checks...`);

      try {
        const seedRes = await this.api.post(`/api/assessments/${assessmentId}/seed`, {
          timeout: 60000, // Seeding can take a while
        });

        if (seedRes.ok()) {
          const seedResult = await seedRes.json();
          console.log(`[TestData] Seeded ${seedResult.checks_created || 0} checks`);
        } else {
          console.warn(`[TestData] Warning: Seeding returned ${seedRes.status()}`);
        }
      } catch {
        console.warn(`[TestData] Warning: Seeding failed`);
        // Don't throw - seeding failure might be acceptable for some tests
      }
    }

    const testData: TestData = {
      customerId,
      projectId,
      assessmentId,
    };

    // Track for cleanup
    this.createdData.push(testData);

    console.log(`[TestData] Test assessment ready: ${assessmentId}`);
    return testData;
  }

  /**
   * Delete a specific test assessment and all related data.
   * Uses CASCADE delete - removing project removes assessment, checks, etc.
   * Note: Customers are left behind (no delete endpoint) - they're harmless orphans.
   */
  async deleteTestData(data: TestData): Promise<void> {
    console.log(`[TestData] Cleaning up test data for assessment: ${data.assessmentId}`);

    try {
      // Delete project (cascades to assessment, checks, screenshots, etc.)
      const projectRes = await this.api.delete(`/api/projects/${data.projectId}`);
      if (!projectRes.ok()) {
        const errorText = await projectRes.text();
        if (projectRes.status() !== 404) {
          console.warn(`[TestData] Failed to delete project: ${errorText}`);
        }
      }

      console.log(`[TestData] Cleanup complete`);
    } catch (error) {
      console.error(`[TestData] Cleanup error:`, error);
    }

    // Remove from tracked data
    this.createdData = this.createdData.filter(d => d.assessmentId !== data.assessmentId);
  }

  /**
   * Clean up all test data created by this manager instance.
   * Call this in global teardown.
   */
  async cleanupAll(): Promise<void> {
    console.log(`[TestData] Cleaning up ${this.createdData.length} test assessments...`);

    for (const data of [...this.createdData]) {
      await this.deleteTestData(data);
    }
  }

  /**
   * Get an existing assessment ID from environment or create new test data.
   * Useful for running tests against existing data.
   */
  async getOrCreateAssessment(): Promise<TestData> {
    const existingId = process.env.TEST_ASSESSMENT_ID;

    if (existingId) {
      console.log(`[TestData] Using existing assessment from TEST_ASSESSMENT_ID: ${existingId}`);

      // Verify it exists
      try {
        const res = await this.api.get(`/api/assessments/${existingId}?include=`);
        if (res.ok()) {
          // Try to get project_id from the response
          const data = await res.json();
          return {
            assessmentId: existingId,
            projectId: data.data?.project_id || '',
            customerId: '', // Unknown for existing data
          };
        }
      } catch {
        // Fall through to create new
      }
      console.warn(`[TestData] Existing assessment ${existingId} not found, creating new one`);
    }

    return this.createTestAssessment();
  }
}

// Singleton instance for use in fixtures
let testDataManager: TestDataManager | null = null;

export async function getTestDataManager(baseUrl?: string): Promise<TestDataManager> {
  if (!testDataManager) {
    testDataManager = new TestDataManager(baseUrl);
    await testDataManager.init();
  }
  return testDataManager;
}

export async function disposeTestDataManager(): Promise<void> {
  if (testDataManager) {
    await testDataManager.cleanupAll();
    await testDataManager.dispose();
    testDataManager = null;
  }
}
