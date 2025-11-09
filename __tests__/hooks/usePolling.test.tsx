import { renderHook, waitFor } from '@testing-library/react';
import { usePolling } from '@/lib/hooks/usePolling';
import { vi } from 'vitest';

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should call callback at regular intervals', async () => {
    const callback = vi.fn().mockResolvedValue(false);

    renderHook(() => usePolling(callback, { enabled: true, interval: 1000 }));

    // Should be called immediately
    expect(callback).toHaveBeenCalledTimes(1);

    // Advance timers
    vi.advanceTimersByTime(1000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(2));

    vi.advanceTimersByTime(1000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(3));
  });

  it('should stop polling when callback returns true', async () => {
    const callback = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const onComplete = vi.fn();

    renderHook(() => usePolling(callback, { enabled: true, interval: 1000, onComplete }));

    // Wait for initial call
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

    // Second call
    vi.advanceTimersByTime(1000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(2));

    // Third call should stop
    vi.advanceTimersByTime(1000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(3));

    // Should call onComplete
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Should not poll anymore
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('should not poll when disabled', () => {
    const callback = vi.fn().mockResolvedValue(false);

    renderHook(() => usePolling(callback, { enabled: false }));

    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('should handle errors and retry', async () => {
    const callback = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValueOnce(true);

    const onError = vi.fn();

    renderHook(() =>
      usePolling(callback, {
        enabled: true,
        interval: 1000,
        onError,
        maxErrors: 5,
      })
    );

    await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(2));
    expect(onError).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(3));

    // Should continue after errors
  });

  it('should stop polling after max errors', async () => {
    const callback = vi.fn().mockRejectedValue(new Error('Fail'));
    const onError = vi.fn();

    renderHook(() =>
      usePolling(callback, {
        enabled: true,
        interval: 1000,
        onError,
        maxErrors: 2,
      })
    );

    await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

    vi.advanceTimersByTime(1000);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(2));

    // Should stop after 2 errors
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(2);

    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('should cleanup on unmount', () => {
    const callback = vi.fn().mockResolvedValue(false);
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    const { unmount } = renderHook(() => usePolling(callback, { enabled: true }));

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
