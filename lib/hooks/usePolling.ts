import { useEffect, useRef } from 'react';

export interface UsePollingOptions {
  /**
   * Whether polling is enabled
   */
  enabled: boolean;

  /**
   * Polling interval in milliseconds
   * @default 2000
   */
  interval?: number;

  /**
   * Called when polling completes (callback returns true)
   */
  onComplete?: () => void;

  /**
   * Called when polling encounters an error
   */
  onError?: (error: Error) => void;

  /**
   * Maximum number of consecutive errors before giving up
   * @default Infinity
   */
  maxErrors?: number;
}

/**
 * Hook for polling a callback function at regular intervals.
 *
 * The callback should return `true` when polling should stop.
 *
 * Features:
 * - Automatic cleanup on unmount
 * - Error handling with configurable retry limit
 * - Conditional enabling
 * - Completion callback
 *
 * @example
 * ```typescript
 * const [status, setStatus] = useState<'pending' | 'complete'>('pending');
 *
 * usePolling(
 *   async () => {
 *     const res = await fetch('/api/status');
 *     const data = await res.json();
 *     setStatus(data.status);
 *     return data.status === 'complete'; // Stop polling when complete
 *   },
 *   {
 *     enabled: status === 'pending',
 *     interval: 2000,
 *     onComplete: () => console.log('Done!'),
 *     maxErrors: 3
 *   }
 * );
 * ```
 *
 * @param callback - Async function that returns true when polling should stop
 * @param options - Polling configuration
 */
export function usePolling(callback: () => Promise<boolean>, options: UsePollingOptions) {
  const errorCountRef = useRef(0);
  const intervalIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!options.enabled) {
      // Clear interval if disabled
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      return;
    }

    // Reset error count when enabled
    errorCountRef.current = 0;

    const poll = async () => {
      try {
        const shouldStop = await callback();

        if (shouldStop) {
          // Stop polling
          if (intervalIdRef.current) {
            clearInterval(intervalIdRef.current);
            intervalIdRef.current = null;
          }

          // Reset error count on success
          errorCountRef.current = 0;

          // Trigger completion callback
          options.onComplete?.();
        } else {
          // Reset error count on successful poll
          errorCountRef.current = 0;
        }
      } catch (error) {
        errorCountRef.current++;

        const maxErrors = options.maxErrors ?? Infinity;

        if (errorCountRef.current >= maxErrors) {
          // Too many errors, give up
          if (intervalIdRef.current) {
            clearInterval(intervalIdRef.current);
            intervalIdRef.current = null;
          }

          options.onError?.(
            error instanceof Error ? error : new Error('Polling failed after max retries')
          );
        } else {
          // Report error but continue polling
          options.onError?.(error instanceof Error ? error : new Error('Polling error'));
        }
      }
    };

    // Start polling immediately
    poll();

    // Then poll at interval
    intervalIdRef.current = window.setInterval(poll, options.interval ?? 2000);

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [
    options.enabled,
    options.interval,
    callback,
    options.onComplete,
    options.onError,
    options.maxErrors,
  ]);
}

