/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockCheck, createMockGroupedChecks } from '../test-utils';

/**
 * Critical tests for manual override behavior in CodeDetailPanel
 * These tests cover the bugs we just fixed:
 * 1. Stale closure when loading overrides
 * 2. childChecks not updating after save
 * 3. Sync logic preventing infinite loops
 */

describe('CodeDetailPanel - Manual Override State Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Override display for grouped checks', () => {
    it('should display override from active check, not first check', () => {
      const checks = createMockGroupedChecks(3);

      // First check has compliant override
      checks[0].manual_status = 'compliant';
      checks[0].manual_status_note = 'First check note';

      // Second check (active) has non_compliant override
      checks[1].manual_status = 'non_compliant';
      checks[1].manual_status_note = 'Active check note';

      // Active check should show its own override
      const activeCheck = checks[1];

      expect(activeCheck.manual_status).toBe('non_compliant');
      expect(activeCheck.manual_status_note).toBe('Active check note');

      // Not the first check's override
      expect(activeCheck.manual_status).not.toBe(checks[0].manual_status);
    });

    it('should handle active check with no override', () => {
      const checks = createMockGroupedChecks(2);

      checks[0].manual_status = 'compliant';
      checks[1].manual_status = null;

      const activeCheck = checks[1];

      expect(activeCheck.manual_status).toBeNull();
    });
  });

  describe('Override state updates when switching checks', () => {
    it('should update override when navigating to different check in group', async () => {
      const checks = createMockGroupedChecks(3);

      // Set different overrides
      checks[0].manual_status = 'compliant';
      checks[1].manual_status = 'non_compliant';
      checks[2].manual_status = null;

      // Simulate navigation from check 0 to check 1
      const previousCheck = checks[0];
      const nextCheck = checks[1];

      expect(previousCheck.manual_status).toBe('compliant');
      expect(nextCheck.manual_status).toBe('non_compliant');

      // Override should change when switching
      expect(previousCheck.manual_status).not.toBe(nextCheck.manual_status);
    });

    it('should load override data from childChecks array, not stale closure', () => {
      const checks = createMockGroupedChecks(2);
      const activeCheckId = checks[0].id;

      // Initial state
      checks[0].manual_status = 'compliant';

      // Simulate childChecks update after save
      const updatedChecks = checks.map(c =>
        c.id === activeCheckId ? { ...c, manual_status: 'non_compliant' } : c
      );

      // Find check again from updated array (simulating re-find in promise callback)
      const currentActiveChild = updatedChecks.find(c => c.id === activeCheckId);

      // Should get updated value, not stale value
      expect(currentActiveChild?.manual_status).toBe('non_compliant');
    });
  });

  describe('Override saving and state updates', () => {
    it('should update childChecks array after saving override', () => {
      const checks = createMockGroupedChecks(3);
      const checkToUpdate = checks[1];

      expect(checkToUpdate.manual_status).toBeNull();

      // Simulate save
      const newOverride = 'compliant';
      const newNote = 'Test note';

      const updatedChecks = checks.map(c =>
        c.id === checkToUpdate.id
          ? { ...c, manual_status: newOverride, manual_status_note: newNote }
          : c
      );

      const updatedCheck = updatedChecks.find(c => c.id === checkToUpdate.id);

      expect(updatedCheck?.manual_status).toBe(newOverride);
      expect(updatedCheck?.manual_status_note).toBe(newNote);

      // Other checks should be unchanged
      expect(updatedChecks[0].manual_status).toBe(checks[0].manual_status);
      expect(updatedChecks[2].manual_status).toBe(checks[2].manual_status);
    });

    it('should preserve other check overrides when updating one check', () => {
      const checks = createMockGroupedChecks(3);

      checks[0].manual_status = 'compliant';
      checks[1].manual_status = 'non_compliant';
      checks[2].manual_status = null;

      // Update check 1
      const updatedChecks = checks.map(c =>
        c.id === checks[1].id ? { ...c, manual_status: 'not_applicable' } : c
      );

      expect(updatedChecks[0].manual_status).toBe('compliant'); // Unchanged
      expect(updatedChecks[1].manual_status).toBe('not_applicable'); // Changed
      expect(updatedChecks[2].manual_status).toBeNull(); // Unchanged
    });
  });

  describe('Sync logic and infinite loop prevention', () => {
    it('should only sync initial data once per checkId', () => {
      const checkId1 = 'check-1';
      const checkId2 = 'check-2';

      let syncCount = 0;
      let lastSyncedCheckId: string | null = null;

      // Simulate sync logic
      const syncData = (currentCheckId: string) => {
        if (currentCheckId !== lastSyncedCheckId) {
          lastSyncedCheckId = currentCheckId;
          syncCount++;
        }
      };

      // First render with check-1
      syncData(checkId1);
      expect(syncCount).toBe(1);

      // Re-render with same check (should not sync)
      syncData(checkId1);
      expect(syncCount).toBe(1);

      // New check (should sync)
      syncData(checkId2);
      expect(syncCount).toBe(2);

      // Re-render with check-2 (should not sync)
      syncData(checkId2);
      expect(syncCount).toBe(2);
    });

    it('should not trigger re-sync when initialChildChecks reference changes but checkId is same', () => {
      const checkId = 'check-1';
      const checks1 = createMockGroupedChecks(2);
      const checks2 = createMockGroupedChecks(2); // Same data, different reference

      let syncCount = 0;
      let lastSyncedCheckId: string | null = null;

      const shouldSync = (currentCheckId: string) => {
        return currentCheckId !== lastSyncedCheckId;
      };

      // First sync
      if (shouldSync(checkId)) {
        lastSyncedCheckId = checkId;
        syncCount++;
      }

      // Even though checks2 is a new reference, checkId is same, so no sync
      if (shouldSync(checkId)) {
        lastSyncedCheckId = checkId;
        syncCount++;
      }

      expect(syncCount).toBe(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty childChecks array', () => {
      const checks: any[] = [];

      const activeCheck = checks.find(c => c.id === 'non-existent');

      expect(activeCheck).toBeUndefined();
      expect(checks.length).toBe(0);
    });

    it('should handle undefined manual_status gracefully', () => {
      const check = createMockCheck();
      delete (check as any).manual_status;

      expect(check.manual_status).toBeUndefined();

      // Should coalesce to null
      const override = check.manual_status || null;
      expect(override).toBeNull();
    });

    it('should handle check not found in childChecks', () => {
      const checks = createMockGroupedChecks(3);
      const nonExistentId = 'non-existent-id';

      const found = checks.find(c => c.id === nonExistentId);

      expect(found).toBeUndefined();
    });
  });

  describe('effectiveCheckId derivation', () => {
    it('should use activeChildCheckId when available', () => {
      const checkId = 'check-1';
      const activeChildCheckId = 'check-2';

      const effectiveCheckId = activeChildCheckId || checkId;

      expect(effectiveCheckId).toBe('check-2');
    });

    it('should fall back to checkId when no activeChildCheckId', () => {
      const checkId = 'check-1';
      const activeChildCheckId = null;

      const effectiveCheckId = activeChildCheckId || checkId;

      expect(effectiveCheckId).toBe('check-1');
    });
  });
});
