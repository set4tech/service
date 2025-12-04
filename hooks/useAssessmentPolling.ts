import { useState, useEffect, useRef } from 'react';

export interface AssessmentPollingState {
  assessing: boolean;
  progress: number;
  message: string;
}

export type UseAssessmentPollingReturn = AssessmentPollingState;

export interface UseAssessmentPollingOptions {
  checkId: string | null;
  onComplete?: () => void;
  pollInterval?: number;
}

// Cache state across component mounts per checkId
const stateCache = new Map<string, AssessmentPollingState>();

// Export for testing - clears the module-level cache
export function clearStateCacheForTesting() {
  stateCache.clear();
}

/**
 * Ultra-simple polling hook - API is the ONLY source of truth.
 *
 * Core principles:
 * 1. No optimistic updates - just reflect what API says
 * 2. Continuous lightweight polling - always check status
 * 3. Stable dependencies - don't restart on every render
 * 4. Let DB check.status drive UI state
 * 5. Cache state across unmount/remount to prevent flicker
 *
 * The component should call /api/checks/[id]/assess, then this hook
 * will automatically pick up the status change from the DB.
 */
export function useAssessmentPolling(
  options: UseAssessmentPollingOptions
): UseAssessmentPollingReturn {
  const { checkId, onComplete, pollInterval = 2000 } = options; // Changed from 1000 to 2000

  // Initialize from cache if available
  const [state, setState] = useState<AssessmentPollingState>(() => {
    if (checkId && stateCache.has(checkId)) {
      return stateCache.get(checkId)!;
    }
    return {
      assessing: false,
      progress: 0,
      message: '',
    };
  });

  // Control polling based on page visibility
  const [pollingEnabled, setPollingEnabled] = useState(true);

  // Stable refs for callbacks to prevent polling restarts
  const onCompleteRef = useRef(onComplete);
  const previousInProgressRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Reset state when checkId changes (useState initializer only runs on mount)
  useEffect(() => {
    if (checkId) {
      if (stateCache.has(checkId)) {
        setState(stateCache.get(checkId)!);
      } else {
        // New check with no cached state - reset to default
        setState({ assessing: false, progress: 0, message: '' });
      }
    } else {
      setState({ assessing: false, progress: 0, message: '' });
    }
    // Reset the previous in-progress ref for the new check
    previousInProgressRef.current = false;
  }, [checkId]);

  // Stop polling when page is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      setPollingEnabled(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!checkId || !pollingEnabled) {
      // Clear state if no checkId, but keep state if just paused due to visibility
      if (!checkId) {
        setState({ assessing: false, progress: 0, message: '' });
      }
      return;
    }

    let mounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    const poll = async () => {
      if (!mounted || !pollingEnabled) return;

      try {
        const res = await fetch(`/api/checks/${checkId}/full`);
        if (!mounted) return;

        const fullData = await res.json();
        const progress = fullData.progress;
        const check = fullData.check;

        // Check if assessment is in progress
        const isInProgress =
          progress.inProgress || check.status === 'processing' || check.status === 'analyzing';

        let newState: AssessmentPollingState;

        if (isInProgress) {
          // Assessment is running
          const percent =
            progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

          newState = {
            assessing: true,
            progress: percent,
            message:
              progress.total > 0
                ? `Analyzing... (${progress.completed}/${progress.total})`
                : 'Starting assessment...',
          };

          // Trigger queue processing
          fetch('/api/queue/process').catch(() => {});
        } else {
          // Assessment complete or not started
          newState = {
            assessing: false,
            progress: 0,
            message: '',
          };

          // If we were just in progress, call onComplete
          if (previousInProgressRef.current && !isInProgress) {
            onCompleteRef.current?.();
          }
        }

        // Update both component state and cache
        setState(newState);
        stateCache.set(checkId, newState);

        // Track previous state for completion detection
        previousInProgressRef.current = isInProgress;
      } catch (error) {
        console.error('[useAssessmentPolling] Poll error:', error);
        // On error, don't change state - keep showing last known state
      }

      // Schedule next poll
      if (mounted) {
        timeoutId = setTimeout(poll, pollInterval);
      }
    };

    // Poll immediately on mount
    poll();

    return () => {
      mounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [checkId, pollInterval, pollingEnabled]);

  return state;
}
