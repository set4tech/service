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
      const resolved =
        typeof newValue === 'function' ? (newValue as (prev: T) => T)(prev) : newValue;
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

