import { useState, useEffect } from 'react';

export interface AssessmentPollingState {
  assessing: boolean;
  progress: number;
  message: string;
}

export interface AssessmentPollingActions {
  setAssessing: (value: boolean) => void;
}

export interface UseAssessmentPollingReturn
  extends AssessmentPollingState,
    AssessmentPollingActions {}

export interface UseAssessmentPollingOptions {
  checkId: string | null;
  initialAssessing?: boolean;
  onComplete?: () => void;
  pollInterval?: number;
}

/**
 * Hook for polling assessment progress
 *
 * Handles:
 * - Polling check assessment progress at regular intervals
 * - Tracking progress percentage and messages
 * - Triggering queue processing
 * - Completing assessment when done
 * - Cleanup on unmount
 */
export function useAssessmentPolling(
  options: UseAssessmentPollingOptions
): UseAssessmentPollingReturn {
  const { checkId, initialAssessing = false, onComplete, pollInterval = 2000 } = options;

  console.log('[useAssessmentPolling] Hook initialized with:', {
    checkId,
    initialAssessing,
  });

  const [assessing, setAssessing] = useState(initialAssessing);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  // Sync initialAssessing to state when it changes
  useEffect(() => {
    console.log(
      '[useAssessmentPolling] Syncing initialAssessing:',
      initialAssessing,
      '→ current:',
      assessing
    );
    if (initialAssessing !== assessing) {
      console.log('[useAssessmentPolling] ✓ Updating assessing state to:', initialAssessing);
      setAssessing(initialAssessing);
    }
  }, [initialAssessing]);

  console.log('[useAssessmentPolling] Current state:', { assessing, progress, message });

  useEffect(() => {
    console.log('[useAssessmentPolling] Effect running with:', { assessing, checkId });

    if (!assessing || !checkId) {
      console.log('[useAssessmentPolling] Not polling:', { assessing, checkId });
      return;
    }

    console.log('[useAssessmentPolling] Starting polling for check:', checkId);

    const interval = setInterval(async () => {
      try {
        console.log('[useAssessmentPolling] Fetching progress...');
        const res = await fetch(`/api/checks/${checkId}/full`);
        const fullData = await res.json();
        const data = fullData.progress;

        console.log('[useAssessmentPolling] Progress data:', {
          inProgress: data.inProgress,
          completed: data.completed,
          total: data.total,
          batchGroupId: data.batchGroupId,
          runsCount: fullData.analysisRuns?.length,
        });

        if (data.inProgress) {
          const percent = Math.round((data.completed / data.total) * 100);
          setProgress(percent);
          setMessage(`Analyzing... (${data.completed}/${data.total})`);
          console.log('[useAssessmentPolling] Still in progress:', percent + '%');

          // Trigger queue processing
          fetch('/api/queue/process').catch(err => console.error('Failed to trigger queue:', err));
        } else {
          console.log('[useAssessmentPolling] Assessment complete, loading results...');
          // Assessment complete - show loading message while fetching results
          setProgress(100);
          setMessage('Loading results...');

          // Call onComplete to fetch the results
          if (onComplete) {
            console.log('[useAssessmentPolling] Calling onComplete...');
            await onComplete();
            console.log('[useAssessmentPolling] onComplete finished');
          }

          // Only stop assessing after results are loaded
          setAssessing(false);
          setMessage('Assessment complete!');
          console.log('[useAssessmentPolling] Stopped assessing');
        }
      } catch (err) {
        console.error('[useAssessmentPolling] Poll error:', err);
        setAssessing(false);
      }
    }, pollInterval);

    return () => {
      console.log('[useAssessmentPolling] Cleaning up interval for check:', checkId);
      clearInterval(interval);
    };
  }, [assessing, checkId, onComplete, pollInterval]);

  return { assessing, progress, message, setAssessing };
}
