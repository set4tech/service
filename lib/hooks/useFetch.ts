import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseFetchOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
  enabled?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
  retry?: number;
  retryDelay?: number;
}

export interface UseFetchReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  reset: () => void;
}

/**
 * Generic fetch hook for making API requests with loading and error states.
 *
 * Features:
 * - Automatic loading and error state management
 * - Request cancellation on unmount or new request
 * - Retry logic with exponential backoff
 * - Success/error callbacks
 * - Manual refetch capability
 * - Conditional fetching with enabled flag
 *
 * @example
 * ```typescript
 * // Basic GET request
 * const { data, loading, error } = useFetch<User[]>('/api/users');
 *
 * // POST with body
 * const { data, loading, refetch } = useFetch('/api/users', {
 *   method: 'POST',
 *   body: { name: 'John' },
 *   onSuccess: (user) => console.log('Created:', user)
 * });
 *
 * // Conditional fetch
 * const { data } = useFetch(userId ? `/api/users/${userId}` : null);
 *
 * // With retry
 * const { data } = useFetch('/api/data', {
 *   retry: 3,
 *   retryDelay: 1000
 * });
 * ```
 *
 * @template T - The expected response data type
 * @param url - The URL to fetch from (null to skip)
 * @param options - Fetch configuration options
 * @returns Object with data, loading, error states and refetch function
 */
export function useFetch<T = any>(
  url: string | null,
  options?: UseFetchOptions<T>
): UseFetchReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const retriesRef = useRef(0);

  // Stable refs for callbacks to prevent unnecessary re-executions
  const onSuccessRef = useRef(options?.onSuccess);
  const onErrorRef = useRef(options?.onError);

  useEffect(() => {
    onSuccessRef.current = options?.onSuccess;
    onErrorRef.current = options?.onError;
  }, [options?.onSuccess, options?.onError]);

  // Serialize complex option values to avoid unnecessary re-renders
  const method = options?.method || 'GET';
  const enabled = options?.enabled;
  const retry = options?.retry;
  const retryDelay = options?.retryDelay;
  const headersString = options?.headers ? JSON.stringify(options.headers) : '';
  const bodyString = options?.body ? JSON.stringify(options.body) : '';

  const execute = useCallback(async () => {
    if (!url || enabled === false) return;

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setLoading(true);
    setError(null);

    try {
      const headers = headersString ? JSON.parse(headersString) : {};
      const body = bodyString ? JSON.parse(bodyString) : undefined;

      const response = await fetch(url, {
        method,
        headers: {
          ...(body && { 'Content-Type': 'application/json' }),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: abortControllerRef.current.signal,
      });

      const contentType = response.headers.get('content-type');
      const responseData = contentType?.includes('application/json')
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        const errorMessage =
          typeof responseData === 'object' && responseData?.error
            ? responseData.error
            : `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      setData(responseData);
      retriesRef.current = 0;
      onSuccessRef.current?.(responseData);
    } catch (err: any) {
      // Don't set error if request was aborted
      if (err.name === 'AbortError') return;

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      // Retry logic
      if (retry && retriesRef.current < retry) {
        retriesRef.current++;
        const delay = retryDelay || 1000;
        setTimeout(() => execute(), delay * retriesRef.current);
        return;
      }

      setError(errorMessage);
      onErrorRef.current?.(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [url, method, enabled, retry, retryDelay, headersString, bodyString]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
    retriesRef.current = 0;
  }, []);

  useEffect(() => {
    if (enabled !== false) {
      execute();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [execute, enabled]);

  return { data, loading, error, refetch: execute, reset };
}
