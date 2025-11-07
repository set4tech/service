import { useState } from 'react';
import { usePolling } from '@/lib/hooks/usePolling';

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

  usePolling(
    async () => {
      if (!checkId) return true;

      const res = await fetch(`/api/checks/${checkId}/full`);
      const fullData = await res.json();
      const data = fullData.progress;

      if (data.inProgress) {
        const percent = Math.round((data.completed / data.total) * 100);
        setProgress(percent);
        setMessage(`Analyzing... (${data.completed}/${data.total})`);

        // Trigger queue processing
        fetch('/api/queue/process').catch(err => console.error('Failed to trigger queue:', err));

        return false; // Keep polling
      }

      setProgress(100);
      setMessage('Loading results...');

      if (onComplete) {
        await onComplete();
      }

      setMessage('Assessment complete!');

      return true; // Stop polling
    },
    {
      enabled: assessing && !!checkId,
      interval: pollInterval,
      onComplete: () => setAssessing(false),
      onError: error => {
        console.error('[useAssessmentPolling] Poll error:', error);
        setAssessing(false);
      },
    }
  );

  return { assessing, progress, message, setAssessing };
}
