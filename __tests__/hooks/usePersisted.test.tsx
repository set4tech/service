import { renderHook, act } from '@testing-library/react';
import { usePersisted } from '@/lib/hooks/usePersisted';
import { vi } from 'vitest';

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
        validate: value => (value > 5 ? 1 : value),
      })
    );

    expect(result.current[0]).toBe(1); // Validated back to initial
  });

  it('should debounce writes', async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => usePersisted('test-key', 0, { debounce: 100 }));

    act(() => {
      result.current[1](1);
    });

    // Should not be written immediately
    expect(localStorage.getItem('test-key')).toBeNull();

    // Wait for debounce
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(localStorage.getItem('test-key')).toBe(JSON.stringify(1));

    vi.useRealTimers();
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

    const { result } = renderHook(() => usePersisted<User>('test-key', { name: 'John', age: 30 }));

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
