/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAssessmentPolling } from '../../hooks/useAssessmentPolling';

describe('useAssessmentPolling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('Initial state', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() =>
        useAssessmentPolling({
          checkId: 'check-1',
        })
      );

      expect(result.current.assessing).toBe(false);
      expect(result.current.progress).toBe(0);
      expect(result.current.message).toBe('');
    });

    it('should initialize with provided assessing state', () => {
      const { result } = renderHook(() =>
        useAssessmentPolling({
          checkId: 'check-1',
          initialAssessing: true,
        })
      );

      expect(result.current.assessing).toBe(true);
    });
  });

  describe('Polling behavior', () => {
    it('should not poll when assessing is false', async () => {
      renderHook(() =>
        useAssessmentPolling({
          checkId: 'check-1',
          initialAssessing: false,
        })
      );

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not poll when checkId is null', async () => {
      renderHook(() =>
        useAssessmentPolling({
          checkId: null,
          initialAssessing: true,
        })
      );

      await new Promise(resolve => setTimeout(resolve, 100));
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should poll when assessing is true', async () => {
      (global.fetch as any).mockResolvedValue({
        json: async () => ({
          progress: {
            inProgress: true,
            completed: 5,
            total: 10,
          },
          analysisRuns: [],
        }),
      });

      renderHook(() =>
        useAssessmentPolling({
          checkId: 'check-1',
          initialAssessing: true,
          pollInterval: 50,
        })
      );

      await waitFor(
        () => {
          expect(global.fetch).toHaveBeenCalled();
        },
        { timeout: 200 }
      );

      expect(global.fetch).toHaveBeenCalledWith('/api/checks/check-1/full');
    });
  });

  describe('Progress tracking', () => {
    it('should update progress and message during assessment', async () => {
      (global.fetch as any).mockResolvedValue({
        json: async () => ({
          progress: {
            inProgress: true,
            completed: 3,
            total: 10,
          },
          analysisRuns: [],
        }),
      });

      const { result } = renderHook(() =>
        useAssessmentPolling({
          checkId: 'check-1',
          initialAssessing: true,
          pollInterval: 50,
        })
      );

      await waitFor(
        () => {
          expect(result.current.progress).toBe(30);
        },
        { timeout: 200 }
      );

      expect(result.current.message).toBe('Analyzing... (3/10)');
    });
  });

  describe('Assessment completion', () => {
    it('should stop assessing when complete', async () => {
      (global.fetch as any).mockResolvedValue({
        json: async () => ({
          progress: {
            inProgress: false,
          },
          analysisRuns: [],
        }),
      });

      const { result } = renderHook(() =>
        useAssessmentPolling({
          checkId: 'check-1',
          initialAssessing: true,
          pollInterval: 50,
        })
      );

      await waitFor(
        () => {
          expect(result.current.assessing).toBe(false);
        },
        { timeout: 200 }
      );

      expect(result.current.message).toBe('Assessment complete!');
    });

    it('should call onComplete callback', async () => {
      const onComplete = vi.fn();

      (global.fetch as any).mockResolvedValue({
        json: async () => ({
          progress: {
            inProgress: false,
          },
          analysisRuns: [],
        }),
      });

      renderHook(() =>
        useAssessmentPolling({
          checkId: 'check-1',
          initialAssessing: true,
          onComplete,
          pollInterval: 50,
        })
      );

      await waitFor(
        () => {
          expect(onComplete).toHaveBeenCalledTimes(1);
        },
        { timeout: 200 }
      );
    });
  });

  describe('Error handling', () => {
    it('should stop assessing on fetch error', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useAssessmentPolling({
          checkId: 'check-1',
          initialAssessing: true,
          pollInterval: 50,
        })
      );

      await waitFor(
        () => {
          expect(result.current.assessing).toBe(false);
        },
        { timeout: 200 }
      );
    });
  });

  describe('Cleanup', () => {
    it('should stop polling on unmount', async () => {
      (global.fetch as any).mockResolvedValue({
        json: async () => ({
          progress: {
            inProgress: true,
            completed: 1,
            total: 5,
          },
          analysisRuns: [],
        }),
      });

      const { unmount } = renderHook(() =>
        useAssessmentPolling({
          checkId: 'check-1',
          initialAssessing: true,
          pollInterval: 50,
        })
      );

      await waitFor(
        () => {
          expect(global.fetch).toHaveBeenCalled();
        },
        { timeout: 200 }
      );

      const callsBeforeUnmount = (global.fetch as any).mock.calls.length;

      unmount();

      await new Promise(resolve => setTimeout(resolve, 200));

      // Should not have made significantly more calls after unmount
      const callsAfterUnmount = (global.fetch as any).mock.calls.length;
      expect(callsAfterUnmount - callsBeforeUnmount).toBeLessThan(2);
    });

    it('should stop polling when assessing becomes false', async () => {
      (global.fetch as any).mockResolvedValue({
        json: async () => ({
          progress: {
            inProgress: true,
            completed: 1,
            total: 5,
          },
          analysisRuns: [],
        }),
      });

      const { result } = renderHook(() =>
        useAssessmentPolling({
          checkId: 'check-1',
          initialAssessing: true,
          pollInterval: 50,
        })
      );

      await waitFor(
        () => {
          expect(global.fetch).toHaveBeenCalled();
        },
        { timeout: 200 }
      );

      const callsBeforeStop = (global.fetch as any).mock.calls.length;

      act(() => {
        result.current.setAssessing(false);
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // Should not have made significantly more calls after stopping
      const callsAfterStop = (global.fetch as any).mock.calls.length;
      expect(callsAfterStop - callsBeforeStop).toBeLessThan(2);
    });
  });

  describe('State updates', () => {
    it('should allow manually setting assessing state', () => {
      const { result } = renderHook(() =>
        useAssessmentPolling({
          checkId: 'check-1',
          initialAssessing: false,
        })
      );

      expect(result.current.assessing).toBe(false);

      act(() => {
        result.current.setAssessing(true);
      });

      expect(result.current.assessing).toBe(true);

      act(() => {
        result.current.setAssessing(false);
      });

      expect(result.current.assessing).toBe(false);
    });
  });
});
