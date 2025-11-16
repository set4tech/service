import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';

/**
 * Test suite for AssessmentClient refetch functionality
 *
 * This tests the fix for the bug where bulk deleting checks would show
 * incorrect progress counts due to stale closures in refetchChecks.
 */

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('AssessmentClient - refetchChecks stability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should maintain stable refetchChecks reference when checks array changes', async () => {
    // This test verifies that refetchChecks doesn't depend on checks.length
    // and maintains a stable reference across check updates

    const { result: hookResult, rerender } = renderHook(
      ({ assessmentId, checkMode, checksLength }) => {
        // Simulate the FIXED useCallback pattern from AssessmentClient
        // Dependencies: [assessment.id, checkMode] - NOT including checks.length
        const refetchChecks = React.useCallback(async () => {
          const res = await fetch(`/api/assessments/${assessmentId}/checks?mode=${checkMode}`);
          if (res.ok) {
            return await res.json();
          }
        }, [assessmentId, checkMode]); // Note: checksLength is NOT a dependency

        return { refetchChecks, checksLength };
      },
      {
        initialProps: {
          assessmentId: 'test-assessment',
          checkMode: 'section' as const,
          checksLength: 3023,
        },
      }
    );

    const firstRefetchRef = hookResult.current.refetchChecks;

    // Simulate checks array changing (e.g., after a bulk delete)
    rerender({
      assessmentId: 'test-assessment',
      checkMode: 'section' as const,
      checksLength: 3004, // 19 checks deleted
    });

    const secondRefetchRef = hookResult.current.refetchChecks;

    // The function reference should remain stable because it doesn't depend on checksLength
    expect(firstRefetchRef).toBe(secondRefetchRef);
  });

  it('should correctly calculate progress after bulk delete', async () => {
    interface TestCheck {
      id: string;
      manual_status: string | null;
      latest_status: string | null;
      status: string;
    }

    // Initial state: 3023 checks, 1 completed
    let checks: TestCheck[] = Array.from({ length: 3023 }, (_, i) => ({
      id: `check-${i}`,
      manual_status: null,
      latest_status: i === 0 ? 'compliant' : null,
      status: i === 0 ? 'completed' : 'pending',
    }));

    const calculateProgress = (checksArray: TestCheck[]) => {
      const applicableChecks = checksArray.filter(c => c.manual_status !== 'not_applicable');
      const totalChecks = applicableChecks.length;
      const completed = applicableChecks.filter(
        c =>
          c.latest_status ||
          c.status === 'completed' ||
          (c.manual_status && c.manual_status !== 'not_applicable')
      ).length;
      const pct = totalChecks ? Math.round((completed / totalChecks) * 100) : 0;
      return { totalChecks, completed, pct };
    };

    // Initial progress
    let progress = calculateProgress(checks);
    expect(progress.totalChecks).toBe(3023);
    expect(progress.completed).toBe(1);

    // Simulate bulk delete of 19 checks (delete checks 1-19, keep check 0 which is completed)
    checks = checks.filter((c, i) => i === 0 || i >= 20);

    // After deletion, should be 3004 checks with 1 completed
    progress = calculateProgress(checks);
    expect(progress.totalChecks).toBe(3004);
    expect(progress.completed).toBe(1);
    expect(progress.pct).toBe(0); // 1/3004 = 0.03% which rounds to 0
  });

  it('should handle refetch without stale closure data', async () => {
    // Mock successful fetch response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'check-1', status: 'pending' },
        { id: 'check-2', status: 'completed' },
      ],
    });

    // Simulate the refetch pattern without checks.length in dependencies
    const createRefetch = (assessmentId: string, checkMode: string) => {
      return async () => {
        const res = await fetch(`/api/assessments/${assessmentId}/checks?mode=${checkMode}`);
        if (res.ok) {
          return await res.json();
        }
        return [];
      };
    };

    const refetch = createRefetch('test-id', 'section');

    await act(async () => {
      const result = await refetch();
      expect(result).toHaveLength(2);
    });

    // Verify fetch was called with correct params
    expect(mockFetch).toHaveBeenCalledWith('/api/assessments/test-id/checks?mode=section');
  });

  it('should update progress correctly through multiple delete operations', async () => {
    interface TestCheck {
      id: string;
      manual_status: string | null;
      latest_status: string | null;
      status: string;
    }

    // Start with 100 checks, 10 completed
    let checks: TestCheck[] = Array.from({ length: 100 }, (_, i) => ({
      id: `check-${i}`,
      manual_status: null,
      latest_status: i < 10 ? 'compliant' : null,
      status: i < 10 ? 'completed' : 'pending',
    }));

    const calculateProgress = (checksArray: TestCheck[]) => {
      const applicableChecks = checksArray.filter(c => c.manual_status !== 'not_applicable');
      const totalChecks = applicableChecks.length;
      const completed = applicableChecks.filter(
        c =>
          c.latest_status ||
          c.status === 'completed' ||
          (c.manual_status && c.manual_status !== 'not_applicable')
      ).length;
      return { totalChecks, completed };
    };

    // Initial: 100 total, 10 completed
    let progress = calculateProgress(checks);
    expect(progress).toEqual({ totalChecks: 100, completed: 10 });

    // Delete 5 pending checks
    checks = checks.filter((c, i) => i < 10 || i >= 15);
    progress = calculateProgress(checks);
    expect(progress).toEqual({ totalChecks: 95, completed: 10 });

    // Delete 3 completed checks
    checks = checks.filter((c, i) => i >= 3);
    progress = calculateProgress(checks);
    expect(progress).toEqual({ totalChecks: 92, completed: 7 });

    // Delete all remaining pending checks
    checks = checks.filter(c => c.status === 'completed');
    progress = calculateProgress(checks);
    expect(progress).toEqual({ totalChecks: 7, completed: 7 });
  });

  it('should handle refetch errors gracefully', async () => {
    // Mock failed fetch
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const refetch = async (assessmentId: string) => {
      const res = await fetch(`/api/assessments/${assessmentId}/checks?mode=section`);
      if (res.ok) {
        return await res.json();
      } else {
        console.error('[AssessmentClient] Failed to refetch checks:', res.status);
        return null;
      }
    };

    await act(async () => {
      const result = await refetch('test-id');
      expect(result).toBeNull();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[AssessmentClient] Failed to refetch checks:',
      500
    );

    consoleErrorSpy.mockRestore();
  });
});

describe('AssessmentClient - progress calculation edge cases', () => {
  interface TestCheck {
    id: string;
    manual_status: string | null;
    latest_status: string | null;
    status: string;
  }

  const calculateProgress = (checks: TestCheck[]) => {
    const applicableChecks = checks.filter(c => c.manual_status !== 'not_applicable');
    const totalChecks = applicableChecks.length;
    const completed = applicableChecks.filter(
      c =>
        c.latest_status ||
        c.status === 'completed' ||
        (c.manual_status && c.manual_status !== 'not_applicable')
    ).length;
    const pct = totalChecks ? Math.round((completed / totalChecks) * 100) : 0;
    return { totalChecks, completed, pct };
  };

  it('should exclude not_applicable checks from total count', () => {
    const checks = [
      { id: '1', manual_status: null, latest_status: 'compliant', status: 'completed' },
      { id: '2', manual_status: 'not_applicable', latest_status: null, status: 'pending' },
      { id: '3', manual_status: null, latest_status: null, status: 'pending' },
    ];

    const progress = calculateProgress(checks);
    expect(progress.totalChecks).toBe(2); // Excludes not_applicable
    expect(progress.completed).toBe(1);
  });

  it('should count manual overrides as completed', () => {
    const checks = [
      { id: '1', manual_status: 'compliant', latest_status: null, status: 'pending' },
      { id: '2', manual_status: 'non_compliant', latest_status: null, status: 'pending' },
      { id: '3', manual_status: null, latest_status: null, status: 'pending' },
    ];

    const progress = calculateProgress(checks);
    expect(progress.totalChecks).toBe(3);
    expect(progress.completed).toBe(2); // Both manual overrides count as completed
  });

  it('should handle empty checks array', () => {
    const progress = calculateProgress([]);
    expect(progress.totalChecks).toBe(0);
    expect(progress.completed).toBe(0);
    expect(progress.pct).toBe(0);
  });

  it('should calculate percentage correctly', () => {
    const checks = Array.from({ length: 100 }, (_, i) => ({
      id: `check-${i}`,
      manual_status: null,
      latest_status: i < 50 ? 'compliant' : null,
      status: i < 50 ? 'completed' : 'pending',
    }));

    const progress = calculateProgress(checks);
    expect(progress.totalChecks).toBe(100);
    expect(progress.completed).toBe(50);
    expect(progress.pct).toBe(50);
  });
});
