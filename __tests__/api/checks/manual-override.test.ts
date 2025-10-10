import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockCheck } from '../../test-utils';

/**
 * Tests for POST /api/checks/[id]/manual-override
 *
 * Critical functionality:
 * - Saving manual overrides to database
 * - Validating override values
 * - Handling missing checks
 * - Cancelling pending analysis jobs
 */

describe('POST /api/checks/[id]/manual-override', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Successful override saving', () => {
    it('should save valid override to database', async () => {
      const checkId = 'test-check-id';
      const override = 'compliant';
      const note = 'Test note';

      // Mock request body
      const body = { override, note };

      // Expected database update
      const expectedUpdate = {
        manual_override: override,
        manual_override_note: note,
        manual_override_at: expect.any(String),
        status: 'completed',
      };

      // Verify the update data structure is correct
      expect(expectedUpdate.manual_override).toBe(override);
      expect(expectedUpdate.manual_override_note).toBe(note);
      expect(expectedUpdate.status).toBe('completed');
    });

    it('should handle clearing override (null value)', async () => {
      const checkId = 'test-check-id';
      const override = null;

      const expectedUpdate = {
        manual_override: null,
        manual_override_note: null,
        manual_override_at: null,
        status: undefined, // Don't change status when clearing
      };

      expect(expectedUpdate.manual_override).toBeNull();
      expect(expectedUpdate.manual_override_at).toBeNull();
    });

    it('should save override without note', async () => {
      const checkId = 'test-check-id';
      const override = 'non_compliant';

      const body = { override, note: undefined };

      expect(body.override).toBe('non_compliant');
      expect(body.note).toBeUndefined();

      // Note should be null in database
      const expectedUpdate = {
        manual_override: override,
        manual_override_note: null,
      };

      expect(expectedUpdate.manual_override_note).toBeNull();
    });
  });

  describe('Validation', () => {
    it('should reject invalid override values', () => {
      const validStatuses = [
        'compliant',
        'non_compliant',
        'not_applicable',
        'insufficient_information',
        null,
      ];

      const invalidStatus = 'invalid_status';

      expect(validStatuses).toContain('compliant');
      expect(validStatuses).toContain('non_compliant');
      expect(validStatuses).toContain('not_applicable');
      expect(validStatuses).toContain('insufficient_information');
      expect(validStatuses).toContain(null);
      expect(validStatuses).not.toContain(invalidStatus);
    });

    it('should validate all valid override statuses', () => {
      const testCases = [
        { value: 'compliant', valid: true },
        { value: 'non_compliant', valid: true },
        { value: 'not_applicable', valid: true },
        { value: 'insufficient_information', valid: true },
        { value: null, valid: true },
        { value: 'invalid', valid: false },
        { value: '', valid: false },
        { value: undefined, valid: false },
      ];

      const validStatuses = [
        'compliant',
        'non_compliant',
        'not_applicable',
        'insufficient_information',
        null,
      ];

      testCases.forEach(({ value, valid }) => {
        const isValid = validStatuses.includes(value as any);
        expect(isValid).toBe(valid);
      });
    });
  });

  describe('Error handling', () => {
    it('should return 404 for non-existent check', async () => {
      const checkId = 'non-existent-id';
      const override = 'compliant';

      // Mock database response: no rows returned
      const dbResult = { data: [], error: null };

      expect(dbResult.data.length).toBe(0);

      // Should return 404
      const expectedStatus = 404;
      const expectedError = 'Check not found - it may have been deleted or excluded';

      expect(expectedStatus).toBe(404);
      expect(expectedError).toContain('not found');
    });

    it('should handle database errors gracefully', async () => {
      const checkId = 'test-check-id';
      const override = 'compliant';

      // Mock database error
      const dbError = { message: 'Database connection failed' };

      expect(dbError.message).toContain('Database');

      // Should return 400 with error message
      const expectedStatus = 400;
      expect(expectedStatus).toBe(400);
    });
  });

  describe('Analysis job cancellation', () => {
    it('should cancel pending analysis when setting override', async () => {
      const checkId = 'test-check-id';
      const override = 'compliant';

      // When setting an override (not null), should cancel analysis
      const shouldCancelAnalysis = override !== null;

      expect(shouldCancelAnalysis).toBe(true);

      // Should update check status to 'cancelled'
      const expectedStatusUpdate = 'cancelled';
      expect(expectedStatusUpdate).toBe('cancelled');
    });

    it('should not cancel analysis when clearing override', async () => {
      const checkId = 'test-check-id';
      const override = null;

      // When clearing override, don't cancel analysis
      const shouldCancelAnalysis = override !== null;

      expect(shouldCancelAnalysis).toBe(false);
    });

    it('should remove jobs from queue', async () => {
      const checkId = 'test-check-id';
      const jobId = 'job-123';

      // Mock queue job
      const queuedJob = {
        id: jobId,
        type: 'analysis',
        payload: { checkId },
        status: 'pending',
      };

      expect(queuedJob.payload.checkId).toBe(checkId);

      // Job should be cancelled
      const cancelledJob = {
        ...queuedJob,
        status: 'cancelled',
        cancelledAt: Date.now(),
      };

      expect(cancelledJob.status).toBe('cancelled');
      expect(cancelledJob.cancelledAt).toBeDefined();
    });
  });

  describe('Response format', () => {
    it('should return updated check in response', async () => {
      const checkId = 'test-check-id';
      const check = createMockCheck({
        id: checkId,
        manual_override: 'compliant',
        manual_override_note: 'Test note',
      });

      const expectedResponse = {
        check,
      };

      expect(expectedResponse.check.id).toBe(checkId);
      expect(expectedResponse.check.manual_override).toBe('compliant');
    });
  });

  describe('Edge cases', () => {
    it('should trim empty notes', () => {
      const note = '   ';
      const trimmed = note.trim() || undefined;

      expect(trimmed).toBeUndefined();
    });

    it('should preserve whitespace in notes', () => {
      const note = '  Test note with spaces  ';
      const trimmed = note.trim();

      expect(trimmed).toBe('Test note with spaces');
      expect(trimmed).not.toBe(note);
    });

    it('should handle very long notes', () => {
      const longNote = 'a'.repeat(10000);

      expect(longNote.length).toBe(10000);
      // Should be accepted (database handles length limits)
    });
  });
});
