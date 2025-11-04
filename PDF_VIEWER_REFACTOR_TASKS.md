# PDF Viewer & Hooks Refactoring - Detailed Task List

> **Status:** Planning Phase  
> **Created:** 2025-11-04  
> **Total Tasks:** 67  

---

## Phase 1: Foundation - Shared Utilities

### Task 1.1.1: Create `lib/hooks/useFetch.ts`

**File:** `lib/hooks/useFetch.ts` (new file)

**Complete Implementation:**
```typescript
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

export function useFetch<T = any>(
  url: string | null,
  options?: UseFetchOptions<T>
): UseFetchReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const retriesRef = useRef(0);

  const execute = useCallback(async () => {
    if (!url || options?.enabled === false) return;

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(url, {
        method: options?.method || 'GET',
        headers: {
          ...(options?.body && { 'Content-Type': 'application/json' }),
          ...options?.headers,
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: abortControllerRef.current.signal,
      });

      const contentType = response.headers.get('content-type');
      const responseData = contentType?.includes('application/json')
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        const errorMessage = typeof responseData === 'object' && responseData?.error
          ? responseData.error
          : `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      setData(responseData);
      retriesRef.current = 0;
      options?.onSuccess?.(responseData);
    } catch (err: any) {
      // Don't set error if request was aborted
      if (err.name === 'AbortError') return;

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      
      // Retry logic
      if (options?.retry && retriesRef.current < options.retry) {
        retriesRef.current++;
        const delay = options.retryDelay || 1000;
        setTimeout(() => execute(), delay * retriesRef.current);
        return;
      }

      setError(errorMessage);
      options?.onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [url, JSON.stringify(options)]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
    retriesRef.current = 0;
  }, []);

  useEffect(() => {
    if (options?.enabled !== false) {
      execute();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [url, execute, options?.enabled]);

  return { data, loading, error, refetch: execute, reset };
}
```

**Lines saved:** ~80+ across all hooks

---

### Task 1.1.2: Add tests for `useFetch`

**File:** `__tests__/hooks/useFetch.test.tsx` (new file)

**Complete Implementation:**
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { useFetch } from '@/lib/hooks/useFetch';

// Mock fetch
global.fetch = jest.fn();

describe('useFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch data successfully', async () => {
    const mockData = { id: 1, name: 'Test' };
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => mockData,
    });

    const { result } = renderHook(() => useFetch('/api/test'));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBeNull();
  });

  it('should handle errors', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Resource not found' }),
    });

    const { result } = renderHook(() => useFetch('/api/test'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Resource not found');
    expect(result.current.data).toBeNull();
  });

  it('should abort on unmount', async () => {
    const abortSpy = jest.spyOn(AbortController.prototype, 'abort');
    
    const { unmount } = renderHook(() => useFetch('/api/test'));
    
    unmount();

    expect(abortSpy).toHaveBeenCalled();
  });

  it('should retry on failure', async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true }),
      });

    const { result } = renderHook(() => 
      useFetch('/api/test', { retry: 2, retryDelay: 100 })
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ success: true });
    }, { timeout: 3000 });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should respect enabled flag', () => {
    renderHook(() => useFetch('/api/test', { enabled: false }));

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should call onSuccess callback', async () => {
    const onSuccess = jest.fn();
    const mockData = { id: 1 };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => mockData,
    });

    renderHook(() => useFetch('/api/test', { onSuccess }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(mockData);
    });
  });

  it('should refetch when calling refetch', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ count: 1 }),
    });

    const { result } = renderHook(() => useFetch('/api/test'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    (global.fetch as jest.Mock).mockClear();
    
    await result.current.refetch();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
```

---

### Task 1.1.3: Document `useFetch` API

**File:** `lib/hooks/useFetch.ts` (add JSDoc)

**Add to top of file:**
```typescript
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
```

---

### Task 1.2.1: Create `lib/hooks/usePersisted.ts`

**File:** `lib/hooks/usePersisted.ts` (new file)

**Complete Implementation:**
```typescript
import { useState, useEffect, useRef, useCallback } from 'react';

export interface UsePersistedOptions<T> {
  /**
   * Validate and transform loaded value before using it.
   * Useful for migration or validation logic.
   */
  validate?: (value: T) => T;
  
  /**
   * Debounce delay in milliseconds before persisting to localStorage.
   * Default: 0 (immediate)
   */
  debounce?: number;
  
  /**
   * Serialize function (default: JSON.stringify)
   */
  serialize?: (value: T) => string;
  
  /**
   * Deserialize function (default: JSON.parse)
   */
  deserialize?: (value: string) => T;
}

/**
 * Hook that persists state to localStorage with automatic sync.
 * 
 * Features:
 * - SSR-safe (checks for window)
 * - Debounced writes to reduce localStorage thrashing
 * - Optional validation/transformation of loaded values
 * - Type-safe with generics
 * - Automatic cleanup
 * 
 * @example
 * ```typescript
 * // Simple usage
 * const [count, setCount] = usePersisted('my-count', 0);
 * 
 * // With validation (e.g., version migration)
 * const [settings, setSettings] = usePersisted('settings', defaultSettings, {
 *   validate: (loaded) => {
 *     if (loaded.version < 2) {
 *       return migrateToV2(loaded);
 *     }
 *     return loaded;
 *   },
 *   debounce: 500
 * });
 * 
 * // Transform validation
 * const [scale, setScale] = usePersisted('zoom', 1, {
 *   validate: (s) => s < 0.5 || s > 2 ? 1 : s
 * });
 * ```
 */
export function usePersisted<T>(
  key: string | undefined,
  initialValue: T,
  options?: UsePersistedOptions<T>
): [T, (value: T | ((prev: T) => T)) => void] {
  // Read from localStorage on mount
  const [value, setValueInternal] = useState<T>(() => {
    if (!key || typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const saved = localStorage.getItem(key);
      if (!saved) return initialValue;

      const deserialize = options?.deserialize || JSON.parse;
      const parsed = deserialize(saved) as T;
      
      return options?.validate ? options.validate(parsed) : parsed;
    } catch (error) {
      console.warn(`Failed to load persisted value for key "${key}":`, error);
      return initialValue;
    }
  });

  const timeoutRef = useRef<number | null>(null);

  // Wrapper that handles functional updates
  const setValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValueInternal(prev => {
      const resolved = typeof newValue === 'function' 
        ? (newValue as (prev: T) => T)(prev)
        : newValue;
      return resolved;
    });
  }, []);

  // Persist to localStorage with debounce
  useEffect(() => {
    if (!key || typeof window === 'undefined') return;

    // Clear existing timeout
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    // Debounce write
    timeoutRef.current = window.setTimeout(() => {
      try {
        const serialize = options?.serialize || JSON.stringify;
        localStorage.setItem(key, serialize(value));
      } catch (error) {
        console.warn(`Failed to persist value for key "${key}":`, error);
      }
      timeoutRef.current = null;
    }, options?.debounce ?? 0);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [key, value, options?.debounce, options?.serialize]);

  return [value, setValue];
}
```

**Lines saved:** ~100+ in PDFViewer

---

### Task 1.2.2: Add tests for `usePersisted`

**File:** `__tests__/hooks/usePersisted.test.tsx` (new file)

**Complete Implementation:**
```typescript
import { renderHook, act } from '@testing-library/react';
import { usePersisted } from '@/lib/hooks/usePersisted';

describe('usePersisted', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should use initial value when nothing is persisted', () => {
    const { result } = renderHook(() => usePersisted('test-key', 'initial'));
    
    expect(result.current[0]).toBe('initial');
  });

  it('should load persisted value on mount', () => {
    localStorage.setItem('test-key', JSON.stringify('persisted'));
    
    const { result } = renderHook(() => usePersisted('test-key', 'initial'));
    
    expect(result.current[0]).toBe('persisted');
  });

  it('should persist value to localStorage', async () => {
    const { result } = renderHook(() => usePersisted('test-key', 'initial'));
    
    act(() => {
      result.current[1]('updated');
    });

    // Wait for debounce (default is 0, but still async)
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(localStorage.getItem('test-key')).toBe(JSON.stringify('updated'));
  });

  it('should validate loaded value', () => {
    localStorage.setItem('test-key', JSON.stringify(10));
    
    const { result } = renderHook(() => 
      usePersisted('test-key', 1, {
        validate: (value) => value > 5 ? 1 : value
      })
    );
    
    expect(result.current[0]).toBe(1); // Validated back to initial
  });

  it('should debounce writes', async () => {
    const { result } = renderHook(() => 
      usePersisted('test-key', 0, { debounce: 100 })
    );
    
    act(() => {
      result.current[1](1);
    });
    
    // Should not be written immediately
    expect(localStorage.getItem('test-key')).toBeNull();
    
    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(localStorage.getItem('test-key')).toBe(JSON.stringify(1));
  });

  it('should handle functional updates', () => {
    const { result } = renderHook(() => usePersisted('test-key', 0));
    
    act(() => {
      result.current[1](prev => prev + 1);
    });
    
    expect(result.current[0]).toBe(1);
  });

  it('should work with complex types', () => {
    interface User {
      name: string;
      age: number;
    }
    
    const { result } = renderHook(() => 
      usePersisted<User>('test-key', { name: 'John', age: 30 })
    );
    
    act(() => {
      result.current[1]({ name: 'Jane', age: 25 });
    });
    
    expect(result.current[0]).toEqual({ name: 'Jane', age: 25 });
  });

  it('should handle undefined key gracefully', () => {
    const { result } = renderHook(() => usePersisted(undefined, 'initial'));
    
    expect(result.current[0]).toBe('initial');
    
    act(() => {
      result.current[1]('updated');
    });
    
    // Should not throw
    expect(result.current[0]).toBe('updated');
  });
});
```

---

### Task 1.3.1: Create `lib/hooks/usePolling.ts`

**File:** `lib/hooks/usePolling.ts` (new file)

**Complete Implementation:**
```typescript
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
export function usePolling(
  callback: () => Promise<boolean>,
  options: UsePollingOptions
) {
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
            error instanceof Error 
              ? error 
              : new Error('Polling failed after max retries')
          );
        } else {
          // Report error but continue polling
          options.onError?.(
            error instanceof Error
              ? error
              : new Error('Polling error')
          );
        }
      }
    };

    // Start polling immediately
    poll();

    // Then poll at interval
    intervalIdRef.current = window.setInterval(
      poll,
      options.interval ?? 2000
    );

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [options.enabled, options.interval, callback, options.onComplete, options.onError, options.maxErrors]);
}
```

**Lines saved:** ~40+ in polling hooks

---

### Task 1.3.2: Add tests for `usePolling`

**File:** `__tests__/hooks/usePolling.test.tsx` (new file)

**Complete Implementation:**
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { usePolling } from '@/lib/hooks/usePolling';

jest.useFakeTimers();

describe('usePolling', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it('should call callback at regular intervals', async () => {
    const callback = jest.fn().mockResolvedValue(false);
    
    renderHook(() => usePolling(callback, { enabled: true, interval: 1000 }));
    
    // Should be called immediately
    expect(callback).toHaveBeenCalledTimes(1);
    
    // Advance timers
    jest.advanceTimersByTime(1000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(2));
    
    jest.advanceTimersByTime(1000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(3));
  });

  it('should stop polling when callback returns true', async () => {
    const callback = jest.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    
    const onComplete = jest.fn();
    
    renderHook(() => 
      usePolling(callback, { enabled: true, interval: 1000, onComplete })
    );
    
    // Wait for initial call
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
    
    // Second call
    jest.advanceTimersByTime(1000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(2));
    
    // Third call should stop
    jest.advanceTimersByTime(1000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(3));
    
    // Should call onComplete
    expect(onComplete).toHaveBeenCalledTimes(1);
    
    // Should not poll anymore
    jest.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('should not poll when disabled', () => {
    const callback = jest.fn().mockResolvedValue(false);
    
    renderHook(() => usePolling(callback, { enabled: false }));
    
    expect(callback).not.toHaveBeenCalled();
    
    jest.advanceTimersByTime(5000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('should handle errors and retry', async () => {
    const callback = jest.fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValueOnce(true);
    
    const onError = jest.fn();
    
    renderHook(() => 
      usePolling(callback, { 
        enabled: true, 
        interval: 1000,
        onError,
        maxErrors: 5
      })
    );
    
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledTimes(1);
    
    jest.advanceTimersByTime(1000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(2));
    expect(onError).toHaveBeenCalledTimes(2);
    
    jest.advanceTimersByTime(1000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(3));
    
    // Should continue after errors
  });

  it('should stop polling after max errors', async () => {
    const callback = jest.fn().mockRejectedValue(new Error('Fail'));
    const onError = jest.fn();
    
    renderHook(() => 
      usePolling(callback, { 
        enabled: true, 
        interval: 1000,
        onError,
        maxErrors: 2
      })
    );
    
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
    
    jest.advanceTimersByTime(1000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(2));
    
    // Should stop after 2 errors
    jest.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(2);
    
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('should cleanup on unmount', () => {
    const callback = jest.fn().mockResolvedValue(false);
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    
    const { unmount } = renderHook(() => 
      usePolling(callback, { enabled: true })
    );
    
    unmount();
    
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
```

---

### Task 1.4.1: Create `lib/hooks/types.ts`

**File:** `lib/hooks/types.ts` (new file)

**Complete Implementation:**
```typescript
/**
 * Standard shape for async data state
 */
export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Standard hook return shape with state, actions, and computed values
 */
export interface HookReturn<TState, TActions, TComputed = {}> {
  state: TState;
  actions: TActions;
  computed?: TComputed;
}

/**
 * Common fetch options
 */
export interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
  retry?: number;
  retryDelay?: number;
}

/**
 * Common persistence options
 */
export interface PersistenceOptions<T> {
  validate?: (value: T) => T;
  debounce?: number;
  serialize?: (value: T) => string;
  deserialize?: (value: string) => T;
}

/**
 * Standard CRUD actions interface
 */
export interface CrudActions<T, TCreate = Partial<T>> {
  create: (item: TCreate) => Promise<T>;
  update: (id: string, item: Partial<T>) => Promise<T>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Selection state interface
 */
export interface SelectionState<T = string> {
  selectedId: T | null;
  select: (id: T | null) => void;
}
```

---

### Task 1.4.2: Create hook index file

**File:** `lib/hooks/index.ts` (new file)

**Complete Implementation:**
```typescript
// Base hooks
export { useFetch } from './useFetch';
export type { UseFetchOptions, UseFetchReturn } from './useFetch';

export { usePersisted } from './usePersisted';
export type { UsePersistedOptions } from './usePersisted';

export { usePolling } from './usePolling';
export type { UsePollingOptions } from './usePolling';

// Types
export type {
  AsyncState,
  HookReturn,
  FetchOptions,
  PersistenceOptions,
  CrudActions,
  SelectionState,
} from './types';
```

---

## Phase 2: Standardize Existing Hooks

### Task 2.1.1: Update `useAssessmentScreenshots` to use `useFetch`

**File:** `hooks/useAssessmentScreenshots.ts`

**BEFORE:**
```typescript
const [allScreenshots, setAllScreenshots] = useState<Screenshot[]>([]);
const [loading, setLoading] = useState(false);

const fetchScreenshots = useCallback(async () => {
  if (!assessmentId) {
    setAllScreenshots([]);
    return;
  }

  setLoading(true);
  try {
    const response = await fetch(`/api/screenshots?assessment_id=${assessmentId}`);
    if (!response.ok) {
      console.error('[useAssessmentScreenshots] Failed to fetch screenshots:', response.status);
      return;
    }

    const data = await response.json();
    setAllScreenshots(data.screenshots || []);
  } catch (error) {
    console.error('[useAssessmentScreenshots] Error fetching screenshots:', error);
  } finally {
    setLoading(false);
  }
}, [assessmentId]);
```

**AFTER:**
```typescript
import { useFetch } from '@/lib/hooks/useFetch';

// Use the shared hook
const { data, loading, refetch } = useFetch<{ screenshots: Screenshot[] }>(
  assessmentId ? `/api/screenshots?assessment_id=${assessmentId}` : null
);

const allScreenshots = data?.screenshots ?? [];
```

**Lines removed:** ~25

---

### Task 2.1.2: Standardize `useAssessmentScreenshots` return shape

**File:** `hooks/useAssessmentScreenshots.ts`

**BEFORE:**
```typescript
return {
  screenshots,
  allScreenshots,
  loading,
  refresh: fetchScreenshots,
};
```

**AFTER:**
```typescript
return {
  state: {
    screenshots,
    allScreenshots,
    loading,
  },
  actions: {
    refresh: refetch,
  },
};
```

---

### Task 2.1.3: Update consumers of `useAssessmentScreenshots`

**File:** `components/pdf/PDFViewer.tsx`

**Find (line ~278):**
```typescript
const { screenshots: screenshotIndicators, refresh: refreshScreenshots } =
  useAssessmentScreenshots(readOnly ? undefined : assessmentId, state.pageNumber);
```

**Replace with:**
```typescript
const screenshotsHook = useAssessmentScreenshots(readOnly ? undefined : assessmentId, state.pageNumber);
const screenshotIndicators = screenshotsHook.state.screenshots;
const refreshScreenshots = screenshotsHook.actions.refresh;
```

---

### Task 2.2.1: Update `useManualOverride` in hooks folder

**File:** `hooks/useManualOverride.ts`

**No changes needed** - This hook already uses the correct pattern with `{ state, actions }` return!

Just verify it matches the standard:
```typescript
return {
  state: {
    override,
    note,
    saving,
    error,
    showNoteInput,
  },
  actions: {
    setOverride,
    setNote,
    setShowNoteInput,
    saveOverride,
    clearError,
  },
};
```

---

### Task 2.3.1: Update `useCheckData` to use `useFetch` for check loading

**File:** `components/checks/hooks/useCheckData.ts`

**BEFORE (lines 39-83):**
```typescript
fetch(`/api/checks/${checkId}`)
  .then(res => res.json())
  .then(data => {
    if (data.check) {
      console.log('useCheckData: Loaded check', {
        id: data.check.id,
        type: data.check.check_type,
        instance_number: data.check.instance_number,
        element_sections: data.check.element_sections,
      });
      setCheck(data.check);

      // If this is an element check, fetch child section checks
      if (data.check.check_type === 'element') {
        console.log('useCheckData: Fetching child checks for element check', checkId);
        return fetch(`/api/checks?parent_check_id=${checkId}`).then(res => res.json());
      }
    }
    return null;
  })
  .then(childData => {
    if (childData && Array.isArray(childData)) {
      console.log('useCheckData: Loaded child checks', {
        count: childData.length,
        sections: childData.map((c: any) => c.code_section_number),
      });
      // Sort by section number
      const sorted = childData.sort((a: any, b: any) =>
        (a.code_section_number || '').localeCompare(b.code_section_number || '')
      );
      setChildChecks(sorted);
      // Set first child as active
      if (sorted.length > 0) {
        setActiveChildCheckId(sorted[0].id);
      } else {
        setActiveChildCheckId(null);
      }
    } else {
      console.log('useCheckData: No child checks found');
      setActiveChildCheckId(null);
    }
  })
  .catch(err => {
    console.error('Failed to load check:', err);
  });
```

**AFTER:**
```typescript
import { useFetch } from '@/lib/hooks/useFetch';

// Load check data
const { data: checkData, loading: loadingCheck } = useFetch<{ check: Check }>(
  checkId ? `/api/checks/${checkId}` : null,
  {
    onSuccess: (data) => {
      if (data.check) {
        console.log('useCheckData: Loaded check', {
          id: data.check.id,
          type: data.check.check_type,
          instance_number: data.check.instance_number,
          element_sections: data.check.element_sections,
        });
        setCheck(data.check);
      }
    }
  }
);

const check = checkData?.check ?? null;

// Load child checks if this is an element check
const shouldLoadChildren = check?.check_type === 'element';
const { data: childData, loading: loadingChildren } = useFetch<any[]>(
  shouldLoadChildren && checkId ? `/api/checks?parent_check_id=${checkId}` : null,
  {
    onSuccess: (data) => {
      if (Array.isArray(data)) {
        console.log('useCheckData: Loaded child checks', {
          count: data.length,
          sections: data.map((c: any) => c.code_section_number),
        });
        const sorted = data.sort((a: any, b: any) =>
          (a.code_section_number || '').localeCompare(b.code_section_number || '')
        );
        setChildChecks(sorted);
        if (sorted.length > 0) {
          setActiveChildCheckId(sorted[0].id);
        } else {
          setActiveChildCheckId(null);
        }
      }
    }
  }
);

const loading = loadingCheck || loadingChildren;
```

**Lines removed:** ~45

---

### Task 2.3.2: Update `useCheckData` section loading

**File:** `components/checks/hooks/useCheckData.ts`

**BEFORE (lines 140-155):**
```typescript
// Load all sections using batch endpoint
fetch('/api/sections/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ keys: sectionKeys }),
})
  .then(res => res.json())
  .then(sections => {
    setSections(sections || []);
    setActiveSectionIndex(0);
    setLoading(false);
  })
  .catch(err => {
    console.error('Failed to load sections:', err);
    setError(err.message);
    setLoading(false);
  });
```

**AFTER:**
```typescript
import { useFetch } from '@/lib/hooks/useFetch';

const { data: sectionsData, loading: loadingSections, error: sectionError } = useFetch<any[]>(
  sectionKeys.length > 0 ? '/api/sections/batch' : null,
  {
    method: 'POST',
    body: { keys: sectionKeys },
    enabled: sectionKeys.length > 0,
    onSuccess: (sections) => {
      setSections(sections || []);
      setActiveSectionIndex(0);
    },
    onError: (err) => setError(err)
  }
);
```

**Lines removed:** ~15

---

### Task 2.3.3: Standardize `useCheckData` return shape

**File:** `components/checks/hooks/useCheckData.ts`

**AFTER all updates, change return to:**
```typescript
return {
  state: {
    check,
    sections,
    section,
    childChecks,
    activeChildCheckId,
    activeSectionIndex,
    loading,
    error,
  },
  actions: {
    setActiveChildCheckId,
    setChildChecks,
    refreshChildChecks,
  },
};
```

---

### Task 2.4.1: Update `useAssessmentPolling` to use `usePolling`

**File:** `hooks/useAssessmentPolling.ts`

**BEFORE (lines 48-109):**
```typescript
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
```

**AFTER:**
```typescript
import { usePolling } from '@/lib/hooks/usePolling';

usePolling(
  async () => {
    if (!checkId) return true;

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
      
      return false; // Keep polling
    }

    // Assessment complete
    console.log('[useAssessmentPolling] Assessment complete, loading results...');
    setProgress(100);
    setMessage('Loading results...');

    if (onComplete) {
      console.log('[useAssessmentPolling] Calling onComplete...');
      await onComplete();
      console.log('[useAssessmentPolling] onComplete finished');
    }

    setMessage('Assessment complete!');
    console.log('[useAssessmentPolling] Stopped assessing');
    
    return true; // Stop polling
  },
  {
    enabled: assessing && !!checkId,
    interval: pollInterval,
    onComplete: () => setAssessing(false),
    onError: (error) => {
      console.error('[useAssessmentPolling] Poll error:', error);
      setAssessing(false);
    }
  }
);
```

**Lines removed:** ~35

---

### Task 2.5.1: Update `useAssessment` to use `usePolling`

**File:** `components/checks/hooks/useAssessment.ts`

**BEFORE (lines 59-135):**
```typescript
useEffect(() => {
  if (!assessing || !checkId) return;

  console.log('[Poll] Starting polling for checkId:', checkId);
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`/api/checks/${checkId}/full`);
      const fullData = await res.json();
      const data = fullData.progress;

      if (data.inProgress) {
        setAssessmentProgress(Math.round((data.completed / data.total) * 100));
        setAssessmentMessage(`Analyzing... (${data.completed}/${data.total})`);

        // Trigger queue processing to ensure jobs are being processed
        fetch('/api/queue/process').catch(err => console.error('Failed to trigger queue:', err));

        // Update runs (only add new ones)
        if (fullData.analysisRuns && fullData.analysisRuns.length > 0) {
          setAnalysisRuns(prev => {
            const existingIds = new Set(prev.map((r: any) => r.id));
            const newRuns = fullData.analysisRuns.filter((r: any) => !existingIds.has(r.id));
            if (newRuns.length > 0) {
              setExpandedRuns(prevExpanded => {
                const updated = new Set(prevExpanded);
                newRuns.forEach((r: any) => updated.add(r.id));
                return updated;
              });
              return [...newRuns, ...prev];
            }
            return prev;
          });
        }
      } else {
        console.log('[Poll] Assessment complete detected');
        setAssessing(false);
        setAssessmentMessage('Assessment complete!');
        setExtraContext('');
        setShowExtraContext(false);

        // Fetch updated analysis runs
        if (checkId) {
          console.log('[Poll] Fetching updated analysis runs for check:', checkId);
          fetch(`/api/checks/${checkId}/analysis-runs`)
            .then(res => {
              console.log('[Poll] Fetch response status:', res.status);
              return res.json();
            })
            .then(runsData => {
              console.log('[Poll] Received runs data:', runsData);
              if (runsData.runs) {
                console.log('[Poll] Setting analysis runs, count:', runsData.runs.length);
                setAnalysisRuns(runsData.runs);
                // Expand the newest run
                if (runsData.runs.length > 0) {
                  console.log('[Poll] Expanding newest run:', runsData.runs[0].id);
                  setExpandedRuns(new Set([runsData.runs[0].id]));
                }
              } else {
                console.log('[Poll] No runs in response');
              }
            })
            .catch(err => console.error('[Poll] Failed to load updated analysis:', err));
        } else {
          console.log('[Poll] No checkId available for fetching runs');
        }

        if (onCheckUpdate) onCheckUpdate();
      }
    } catch (err) {
      console.error('Poll error:', err);
      setAssessing(false);
    }
  }, 2000);

  return () => clearInterval(interval);
}, [assessing, checkId, onCheckUpdate]);
```

**AFTER:**
```typescript
import { usePolling } from '@/lib/hooks/usePolling';

usePolling(
  async () => {
    if (!checkId) return true;

    console.log('[Poll] Fetching progress...');
    const res = await fetch(`/api/checks/${checkId}/full`);
    const fullData = await res.json();
    const data = fullData.progress;

    if (data.inProgress) {
      setAssessmentProgress(Math.round((data.completed / data.total) * 100));
      setAssessmentMessage(`Analyzing... (${data.completed}/${data.total})`);

      // Trigger queue processing
      fetch('/api/queue/process').catch(err => console.error('Failed to trigger queue:', err));

      // Update runs (only add new ones)
      if (fullData.analysisRuns && fullData.analysisRuns.length > 0) {
        setAnalysisRuns(prev => {
          const existingIds = new Set(prev.map((r: any) => r.id));
          const newRuns = fullData.analysisRuns.filter((r: any) => !existingIds.has(r.id));
          if (newRuns.length > 0) {
            setExpandedRuns(prevExpanded => {
              const updated = new Set(prevExpanded);
              newRuns.forEach((r: any) => updated.add(r.id));
              return updated;
            });
            return [...newRuns, ...prev];
          }
          return prev;
        });
      }
      
      return false; // Keep polling
    }

    // Assessment complete
    console.log('[Poll] Assessment complete detected');
    setAssessmentMessage('Assessment complete!');
    setExtraContext('');
    setShowExtraContext(false);

    // Fetch updated analysis runs
    if (checkId) {
      console.log('[Poll] Fetching updated analysis runs for check:', checkId);
      const runsRes = await fetch(`/api/checks/${checkId}/analysis-runs`);
      const runsData = await runsRes.json();
      
      if (runsData.runs) {
        console.log('[Poll] Setting analysis runs, count:', runsData.runs.length);
        setAnalysisRuns(runsData.runs);
        if (runsData.runs.length > 0) {
          setExpandedRuns(new Set([runsData.runs[0].id]));
        }
      }
    }

    if (onCheckUpdate) onCheckUpdate();
    
    return true; // Stop polling
  },
  {
    enabled: assessing && !!checkId,
    interval: 2000,
    onComplete: () => setAssessing(false),
    onError: (err) => {
      console.error('Poll error:', err);
      setAssessing(false);
    }
  }
);
```

**Lines removed:** ~40

---

### Task 2.5.2: Update `useAssessment` to use `useFetch` for runs

**File:** `components/checks/hooks/useAssessment.ts`

**BEFORE (lines 138-161):**
```typescript
useEffect(() => {
  console.log('[InitialLoad] effectiveCheckId changed:', effectiveCheckId);
  if (!effectiveCheckId) {
    setAnalysisRuns([]);
    return;
  }

  console.log('[InitialLoad] Fetching analysis runs for:', effectiveCheckId);
  setLoadingRuns(true);
  fetch(`/api/checks/${effectiveCheckId}/analysis-runs`)
    .then(res => res.json())
    .then(runsData => {
      console.log('[InitialLoad] Received data:', runsData);
      if (runsData.runs) {
        console.log('[InitialLoad] Setting analysis runs, count:', runsData.runs.length);
        setAnalysisRuns(runsData.runs);
      }
      setLoadingRuns(false);
    })
    .catch(err => {
      console.error('[InitialLoad] Failed to load analysis runs:', err);
      setLoadingRuns(false);
    });
}, [effectiveCheckId]);
```

**AFTER:**
```typescript
import { useFetch } from '@/lib/hooks/useFetch';

const { data: runsData, loading: loadingRuns } = useFetch<{ runs: AnalysisRun[] }>(
  effectiveCheckId ? `/api/checks/${effectiveCheckId}/analysis-runs` : null,
  {
    onSuccess: (data) => {
      console.log('[InitialLoad] Received data:', data);
      if (data.runs) {
        console.log('[InitialLoad] Setting analysis runs, count:', data.runs.length);
        setAnalysisRuns(data.runs);
      }
    }
  }
);
```

**Lines removed:** ~25

---

### Task 2.5.3: Update `useAssessment` to use `usePersisted` for model

**File:** `components/checks/hooks/useAssessment.ts`

**BEFORE (lines 32-37, 207):**
```typescript
// Load last selected model from localStorage
useEffect(() => {
  const lastModel = localStorage.getItem('lastSelectedAIModel');
  if (lastModel) {
    setSelectedModel(lastModel);
  }
}, []);

// ... later in handleAssess:
localStorage.setItem('lastSelectedAIModel', selectedModel);
```

**AFTER:**
```typescript
import { usePersisted } from '@/lib/hooks/usePersisted';

const [selectedModel, setSelectedModel] = usePersisted(
  'lastSelectedAIModel',
  'gemini-2.5-pro'
);

// Remove the manual localStorage.setItem call - usePersisted handles it automatically
```

**Lines removed:** ~8

---

## Phase 3: Extract PDF Domain Logic

### Task 3.1.1: Create `hooks/useMeasurements.ts`

**File:** `hooks/useMeasurements.ts` (new file)

**Complete Implementation:**
```typescript
import { useState, useCallback } from 'react';
import { useFetch } from '@/lib/hooks/useFetch';
import type { HookReturn, SelectionState } from '@/lib/hooks/types';

export interface Measurement {
  id: string;
  project_id: string;
  page_number: number;
  start_point: { x: number; y: number };
  end_point: { x: number; y: number };
  pixels_distance: number;
  real_distance_inches: number | null;
  created_at: string;
}

export interface NewMeasurement {
  project_id: string;
  page_number: number;
  start_point: { x: number; y: number };
  end_point: { x: number; y: number };
  pixels_distance: number;
  real_distance_inches: number | null;
}

interface MeasurementsState {
  measurements: Measurement[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
}

interface MeasurementsActions {
  save: (measurement: NewMeasurement) => Promise<Measurement>;
  remove: (id: string) => Promise<void>;
  select: (id: string | null) => void;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing measurements on PDF pages.
 * 
 * Features:
 * - Load measurements for a specific project/page
 * - Create new measurements
 * - Delete measurements
 * - Track selected measurement
 * 
 * @example
 * ```typescript
 * const measurements = useMeasurements(projectId, pageNumber);
 * 
 * // Save a measurement
 * await measurements.actions.save({
 *   project_id: projectId,
 *   page_number: 1,
 *   start_point: { x: 100, y: 200 },
 *   end_point: { x: 300, y: 400 },
 *   pixels_distance: 223.6,
 *   real_distance_inches: 10.5
 * });
 * 
 * // Select a measurement
 * measurements.actions.select(measurementId);
 * 
 * // Delete selected
 * if (measurements.state.selectedId) {
 *   await measurements.actions.remove(measurements.state.selectedId);
 * }
 * ```
 */
export function useMeasurements(
  projectId: string | undefined,
  pageNumber: number
): HookReturn<MeasurementsState, MeasurementsActions> {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, loading, error, refetch } = useFetch<{ measurements: Measurement[] }>(
    projectId ? `/api/measurements?projectId=${projectId}&pageNumber=${pageNumber}` : null
  );

  const measurements = data?.measurements ?? [];

  const save = useCallback(async (measurement: NewMeasurement): Promise<Measurement> => {
    const response = await fetch('/api/measurements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(measurement),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save measurement');
    }

    const { measurement: saved } = await response.json();
    await refetch();
    return saved;
  }, [refetch]);

  const remove = useCallback(async (id: string) => {
    const response = await fetch(`/api/measurements?id=${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete measurement');
    }

    setSelectedId(null);
    await refetch();
  }, [refetch]);

  return {
    state: {
      measurements,
      selectedId,
      loading,
      error,
    },
    actions: {
      save,
      remove,
      select: setSelectedId,
      refresh: refetch,
    },
  };
}
```

**Lines extracted from PDFViewer:** ~60

---

### Task 3.1.2: Add tests for `useMeasurements`

**File:** `__tests__/hooks/useMeasurements.test.tsx` (new file)

**Complete Implementation:**
```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMeasurements } from '@/hooks/useMeasurements';

global.fetch = jest.fn();

describe('useMeasurements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load measurements on mount', async () => {
    const mockMeasurements = [
      { id: '1', project_id: 'proj1', page_number: 1, pixels_distance: 100 },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ measurements: mockMeasurements }),
    });

    const { result } = renderHook(() => useMeasurements('proj1', 1));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(result.current.state.measurements).toEqual(mockMeasurements);
  });

  it('should save a new measurement', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ measurements: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ measurement: { id: 'new1' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ measurements: [{ id: 'new1' }] }),
      });

    const { result } = renderHook(() => useMeasurements('proj1', 1));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    let saved;
    await act(async () => {
      saved = await result.current.actions.save({
        project_id: 'proj1',
        page_number: 1,
        start_point: { x: 0, y: 0 },
        end_point: { x: 100, y: 100 },
        pixels_distance: 141.4,
        real_distance_inches: null,
      });
    });

    expect(saved).toEqual({ id: 'new1' });
    
    await waitFor(() => {
      expect(result.current.state.measurements).toHaveLength(1);
    });
  });

  it('should delete a measurement', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ measurements: [{ id: '1' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ measurements: [] }),
      });

    const { result } = renderHook(() => useMeasurements('proj1', 1));

    await waitFor(() => {
      expect(result.current.state.measurements).toHaveLength(1);
    });

    await act(async () => {
      await result.current.actions.remove('1');
    });

    await waitFor(() => {
      expect(result.current.state.measurements).toHaveLength(0);
    });
  });

  it('should track selected measurement', () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ measurements: [] }),
    });

    const { result } = renderHook(() => useMeasurements('proj1', 1));

    expect(result.current.state.selectedId).toBeNull();

    act(() => {
      result.current.actions.select('measurement-1');
    });

    expect(result.current.state.selectedId).toBe('measurement-1');
  });
});
```

---

### Task 3.2.1: Create `hooks/useCalibration.ts`

**File:** `hooks/useCalibration.ts` (new file)

**Complete Implementation:**
```typescript
import { useCallback } from 'react';
import { useFetch } from '@/lib/hooks/useFetch';
import type { HookReturn } from '@/lib/hooks/types';

export interface Calibration {
  id: string;
  project_id: string;
  page_number: number;
  method: 'page-size' | 'known-length';
  scale_notation?: string;
  print_width_inches?: number;
  print_height_inches?: number;
  pdf_width_points?: number;
  pdf_height_points?: number;
  calibration_line_start?: { x: number; y: number };
  calibration_line_end?: { x: number; y: number };
  known_distance_inches?: number;
  created_at: string;
}

interface CalibrationState {
  calibration: Calibration | null;
  loading: boolean;
  error: string | null;
}

interface CalibrationActions {
  savePageSize: (
    scaleNotation: string,
    printWidth: number,
    printHeight: number,
    pdfWidth: number,
    pdfHeight: number
  ) => Promise<void>;
  saveKnownLength: (
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number },
    knownDistanceInches: number
  ) => Promise<void>;
  refresh: () => Promise<void>;
}

interface CalibrationComputed {
  /**
   * Calculate real-world distance from pixel distance using current calibration.
   * Returns null if no calibration is set.
   */
  calculateRealDistance: (pixelsDistance: number) => number | null;
}

/**
 * Hook for managing PDF page calibration.
 * 
 * Supports two calibration methods:
 * 1. Page Size Method: Uses architectural scale notation (e.g., "1/4" = 1'-0")
 * 2. Known Length Method: Uses a drawn line with known real-world distance
 * 
 * @example
 * ```typescript
 * const calibration = useCalibration(projectId, pageNumber);
 * 
 * // Method 1: Page size calibration
 * await calibration.actions.savePageSize(
 *   '1/4" = 1\'-0"',  // Scale notation
 *   11,               // Print width in inches
 *   8.5,              // Print height in inches
 *   792,              // PDF width in points
 *   612               // PDF height in points
 * );
 * 
 * // Method 2: Known length calibration
 * await calibration.actions.saveKnownLength(
 *   { x: 100, y: 200 },  // Line start
 *   { x: 500, y: 200 },  // Line end
 *   48                   // Known distance: 48 inches (4 feet)
 * );
 * 
 * // Calculate real distance
 * const pixels = 200;
 * const inches = calibration.computed.calculateRealDistance(pixels);
 * ```
 */
export function useCalibration(
  projectId: string | undefined,
  pageNumber: number
): HookReturn<CalibrationState, CalibrationActions, CalibrationComputed> {
  const { data, loading, error, refetch } = useFetch<{ calibration: Calibration | null }>(
    projectId ? `/api/measurements/calibrate?projectId=${projectId}&pageNumber=${pageNumber}` : null
  );

  const calibration = data?.calibration ?? null;

  const savePageSize = useCallback(
    async (
      scaleNotation: string,
      printWidth: number,
      printHeight: number,
      pdfWidth: number,
      pdfHeight: number
    ) => {
      if (!projectId) throw new Error('Project ID required');

      const response = await fetch('/api/measurements/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          page_number: pageNumber,
          method: 'page-size',
          scale_notation: scaleNotation,
          print_width_inches: printWidth,
          print_height_inches: printHeight,
          pdf_width_points: pdfWidth,
          pdf_height_points: pdfHeight,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save calibration');
      }

      await refetch();
    },
    [projectId, pageNumber, refetch]
  );

  const saveKnownLength = useCallback(
    async (
      lineStart: { x: number; y: number },
      lineEnd: { x: number; y: number },
      knownDistanceInches: number
    ) => {
      if (!projectId) throw new Error('Project ID required');

      const response = await fetch('/api/measurements/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          page_number: pageNumber,
          method: 'known-length',
          calibration_line_start: lineStart,
          calibration_line_end: lineEnd,
          known_distance_inches: knownDistanceInches,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save calibration');
      }

      await refetch();
    },
    [projectId, pageNumber, refetch]
  );

  const calculateRealDistance = useCallback(
    (pixelsDistance: number): number | null => {
      if (!calibration) return null;

      try {
        // Method 1: Known Length Method (simpler, more direct)
        if (
          calibration.calibration_line_start &&
          calibration.calibration_line_end &&
          calibration.known_distance_inches
        ) {
          const dx = calibration.calibration_line_end.x - calibration.calibration_line_start.x;
          const dy = calibration.calibration_line_end.y - calibration.calibration_line_start.y;
          const calibrationLineLengthPixels = Math.sqrt(dx * dx + dy * dy);

          if (calibrationLineLengthPixels === 0) return null;

          const pixelsPerInch = calibrationLineLengthPixels / calibration.known_distance_inches;
          return pixelsDistance / pixelsPerInch;
        }

        // Method 2: Page Size Method (requires scale notation and print size)
        if (!calibration.scale_notation) return null;
        if (!calibration.print_width_inches || !calibration.print_height_inches) return null;
        if (!calibration.pdf_width_points) return null;

        // Parse scale notation (e.g., "1/4" = 1'-0")
        const match = calibration.scale_notation.match(
          /^(\d+(?:\/\d+)?)"?\s*=\s*(\d+)'(?:-(\d+)"?)?$/
        );
        if (!match) return null;

        const [, paperInchStr, realFeetStr, realInchesStr] = match;

        // Parse paper inches (could be fraction like 1/8)
        let paperInches: number;
        if (paperInchStr.includes('/')) {
          const [num, denom] = paperInchStr.split('/').map(Number);
          paperInches = num / denom;
        } else {
          paperInches = parseFloat(paperInchStr);
        }

        // Parse real world measurement
        const realFeet = parseFloat(realFeetStr);
        const realInches = realInchesStr ? parseFloat(realInchesStr) : 0;
        const realTotalInches = realFeet * 12 + realInches;

        // Calculate conversion
        // CSS pixels to print inches
        const pixelsPerPrintInch = calibration.pdf_width_points / calibration.print_width_inches;
        
        // Convert pixel distance to paper inches
        const paperInchesDistance = pixelsDistance / pixelsPerPrintInch;
        
        // Convert paper inches to real inches using architectural scale
        const scaleRatio = paperInches / realTotalInches;
        const realInchesDistance = paperInchesDistance / scaleRatio;

        return realInchesDistance;
      } catch (error) {
        console.error('[useCalibration] Error calculating real distance:', error);
        return null;
      }
    },
    [calibration]
  );

  return {
    state: {
      calibration,
      loading,
      error,
    },
    actions: {
      savePageSize,
      saveKnownLength,
      refresh: refetch,
    },
    computed: {
      calculateRealDistance,
    },
  };
}
```

**Lines extracted from PDFViewer:** ~180

---

Due to character limits, I need to continue this in a second message. The remaining tasks follow the same detailed pattern with:
- Exact code snippets
- Before/After comparisons
- Specific line numbers and file paths
- Complete implementations
- Test code

Should I continue with the remaining tasks (3.2.2 through 6.4.2)?