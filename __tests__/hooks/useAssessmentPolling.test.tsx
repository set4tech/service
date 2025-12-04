import { renderHook, waitFor } from '@testing-library/react';
import { useAssessmentPolling } from '@/hooks/useAssessmentPolling';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockResponse(isInProgress: boolean, completed = 0, total = 0) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        check: {
          status: isInProgress ? 'processing' : 'completed',
        },
        progress: {
          inProgress: isInProgress,
          completed,
          total,
        },
      }),
  };
}

describe('useAssessmentPolling', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Default to not-in-progress state
    mockFetch.mockResolvedValue(createMockResponse(false));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should start with assessing=false for a new check', () => {
    const { result } = renderHook(() => useAssessmentPolling({ checkId: 'new-check-123' }));

    // Initial state should be not assessing (no cache exists)
    expect(result.current.assessing).toBe(false);
    expect(result.current.progress).toBe(0);
    expect(result.current.message).toBe('');
  });

  it('should reset state immediately when checkId changes to a new check', async () => {
    // First check will be processing
    mockFetch.mockResolvedValue(createMockResponse(true, 5, 10));

    const { result, rerender } = renderHook(({ checkId }) => useAssessmentPolling({ checkId }), {
      initialProps: { checkId: 'check-reset-a' },
    });

    // Wait for polling to update state
    await waitFor(
      () => {
        expect(result.current.assessing).toBe(true);
      },
      { timeout: 3000 }
    );

    expect(result.current.progress).toBe(50);

    // Switch to a different check - mock returns not-in-progress
    mockFetch.mockResolvedValue(createMockResponse(false));
    rerender({ checkId: 'check-reset-b' });

    // State should reset IMMEDIATELY (before any polling completes)
    // This is the key assertion - the bug was that state persisted
    expect(result.current.assessing).toBe(false);
    expect(result.current.progress).toBe(0);
  });

  it('should restore cached state when switching back to a processing check', async () => {
    // Check A is processing
    mockFetch.mockResolvedValue(createMockResponse(true, 3, 10));

    const { result, rerender } = renderHook(({ checkId }) => useAssessmentPolling({ checkId }), {
      initialProps: { checkId: 'check-cache-a' },
    });

    // Wait for state to be cached
    await waitFor(
      () => {
        expect(result.current.assessing).toBe(true);
      },
      { timeout: 3000 }
    );

    // Switch to check B (not processing)
    mockFetch.mockResolvedValue(createMockResponse(false));
    rerender({ checkId: 'check-cache-b' });

    expect(result.current.assessing).toBe(false);

    // Switch back to check A - should restore cached state immediately
    mockFetch.mockResolvedValue(createMockResponse(true, 5, 10));
    rerender({ checkId: 'check-cache-a' });

    // Should immediately show cached state (assessing: true, progress: 30)
    // before new polling completes
    expect(result.current.assessing).toBe(true);
    expect(result.current.progress).toBe(30); // Cached from first poll
  });

  it('should clear state when checkId becomes null', async () => {
    mockFetch.mockResolvedValue(createMockResponse(true, 5, 10));

    const { result, rerender } = renderHook(({ checkId }) => useAssessmentPolling({ checkId }), {
      initialProps: { checkId: 'check-null-a' as string | null },
    });

    await waitFor(
      () => {
        expect(result.current.assessing).toBe(true);
      },
      { timeout: 3000 }
    );

    // Set checkId to null
    rerender({ checkId: null });

    expect(result.current.assessing).toBe(false);
    expect(result.current.progress).toBe(0);
  });

  it('should call onComplete when assessment finishes', async () => {
    const onComplete = vi.fn();

    // Start as processing
    mockFetch.mockResolvedValue(createMockResponse(true, 5, 10));

    const { result } = renderHook(() =>
      useAssessmentPolling({ checkId: 'check-complete-test', onComplete, pollInterval: 100 })
    );

    await waitFor(
      () => {
        expect(result.current.assessing).toBe(true);
      },
      { timeout: 3000 }
    );

    // Now it completes
    mockFetch.mockResolvedValue(createMockResponse(false));

    await waitFor(
      () => {
        expect(result.current.assessing).toBe(false);
      },
      { timeout: 3000 }
    );

    expect(onComplete).toHaveBeenCalled();
  });
});
