import { renderHook, waitFor } from '@testing-library/react';
import { useFetch } from '@/lib/hooks/useFetch';
import { vi } from 'vitest';

// Mock fetch
global.fetch = vi.fn();

describe('useFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch data successfully', async () => {
    const mockData = { id: 1, name: 'Test' };
    (global.fetch as any).mockResolvedValueOnce({
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
    (global.fetch as any).mockResolvedValueOnce({
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
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

    const { unmount } = renderHook(() => useFetch('/api/test'));

    unmount();

    expect(abortSpy).toHaveBeenCalled();
  });

  it('should retry on failure', async () => {
    vi.useFakeTimers();

    (global.fetch as any).mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useFetch('/api/test', { retry: 2, retryDelay: 100 }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    // Fast-forward to trigger retry
    vi.advanceTimersByTime(200);

    await waitFor(
      () => {
        expect(result.current.data).toEqual({ success: true });
      },
      { timeout: 3000 }
    );

    expect(global.fetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('should respect enabled flag', () => {
    renderHook(() => useFetch('/api/test', { enabled: false }));

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should call onSuccess callback', async () => {
    const onSuccess = vi.fn();
    const mockData = { id: 1 };

    (global.fetch as any).mockResolvedValueOnce({
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
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ count: 1 }),
    });

    const { result } = renderHook(() => useFetch('/api/test'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    (global.fetch as any).mockClear();

    await result.current.refetch();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
