import { renderHook, act, waitFor } from '@testing-library/react';
import { useCalibration } from '@/hooks/useCalibration';
import { vi } from 'vitest';

global.fetch = vi.fn();

describe('useCalibration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load calibration on mount', async () => {
    const mockCalibration = {
      id: '1',
      project_id: 'proj1',
      page_number: 1,
      method: 'known-length' as const,
      calibration_line_start: { x: 0, y: 0 },
      calibration_line_end: { x: 100, y: 0 },
      known_distance_inches: 10,
      created_at: '2024-01-01',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ calibration: mockCalibration }),
    });

    const { result } = renderHook(() => useCalibration('proj1', 1));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(result.current.state.calibration).toEqual(mockCalibration);
  });

  it('should save page size calibration', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ calibration: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          calibration: {
            id: '1',
            method: 'page-size',
            scale_notation: '1/4" = 1\'-0"',
          },
        }),
      });

    const { result } = renderHook(() => useCalibration('proj1', 1));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    await act(async () => {
      await result.current.actions.savePageSize(
        '1/4" = 1\'-0"',
        11,
        8.5,
        792,
        612
      );
    });

    await waitFor(() => {
      expect(result.current.state.calibration?.scale_notation).toBe('1/4" = 1\'-0"');
    });
  });

  it('should save known length calibration', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ calibration: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          calibration: {
            id: '1',
            method: 'known-length',
            known_distance_inches: 48,
          },
        }),
      });

    const { result } = renderHook(() => useCalibration('proj1', 1));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    await act(async () => {
      await result.current.actions.saveKnownLength(
        { x: 100, y: 200 },
        { x: 500, y: 200 },
        48
      );
    });

    await waitFor(() => {
      expect(result.current.state.calibration?.known_distance_inches).toBe(48);
    });
  });

  it('should calculate real distance using known length method', async () => {
    const mockCalibration = {
      id: '1',
      project_id: 'proj1',
      page_number: 1,
      method: 'known-length' as const,
      calibration_line_start: { x: 0, y: 0 },
      calibration_line_end: { x: 100, y: 0 },
      known_distance_inches: 10,
      created_at: '2024-01-01',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ calibration: mockCalibration }),
    });

    const { result } = renderHook(() => useCalibration('proj1', 1));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    // 100 pixels = 10 inches, so 50 pixels = 5 inches
    const realDistance = result.current.computed?.calculateRealDistance(50);
    expect(realDistance).toBeCloseTo(5, 1);
  });

  it('should return null when no calibration is set', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ calibration: null }),
    });

    const { result } = renderHook(() => useCalibration('proj1', 1));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    const realDistance = result.current.computed?.calculateRealDistance(50);
    expect(realDistance).toBeNull();
  });
});

