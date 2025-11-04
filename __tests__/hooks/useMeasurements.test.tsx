import { renderHook, act, waitFor } from '@testing-library/react';
import { useMeasurements } from '@/hooks/useMeasurements';
import { vi } from 'vitest';

global.fetch = vi.fn();

describe('useMeasurements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load measurements on mount', async () => {
    const mockMeasurements = [
      { 
        id: '1', 
        project_id: 'proj1', 
        page_number: 1, 
        start_point: { x: 0, y: 0 },
        end_point: { x: 100, y: 100 },
        pixels_distance: 100,
        real_distance_inches: null,
        created_at: '2024-01-01'
      },
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
    (global.fetch as any)
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
    (global.fetch as any)
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
    (global.fetch as any).mockResolvedValue({
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

