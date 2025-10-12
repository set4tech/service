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

  const [assessing, setAssessing] = useState(initialAssessing);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!assessing || !checkId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/checks/${checkId}/assessment-progress`);
        const data = await res.json();

        if (data.inProgress) {
          const percent = Math.round((data.completed / data.total) * 100);
          setProgress(percent);
          setMessage(`Analyzing... (${data.completed}/${data.total})`);

          // Trigger queue processing
          fetch('/api/queue/process').catch(err => console.error('Failed to trigger queue:', err));
        } else {
          // Assessment complete - show loading message while fetching results
          setProgress(100);
          setMessage('Loading results...');

          // Call onComplete to fetch the results
          if (onComplete) {
            await onComplete();
          }

          // Only stop assessing after results are loaded
          setAssessing(false);
          setMessage('Assessment complete!');
        }
      } catch (err) {
        console.error('Poll error:', err);
        setAssessing(false);
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [assessing, checkId, onComplete, pollInterval]);

  return { assessing, progress, message, setAssessing };
}
