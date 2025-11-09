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
        created_at: '2024-01-01',
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

  it('should support multi-select', () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ measurements: [] }),
    });

    const { result } = renderHook(() => useMeasurements('proj1', 1));

    expect(result.current.state.selectedIds).toEqual([]);

    // Select multiple measurements
    act(() => {
      result.current.actions.selectMultiple(['measurement-1', 'measurement-2']);
    });

    expect(result.current.state.selectedIds).toEqual(['measurement-1', 'measurement-2']);
    expect(result.current.state.selectedId).toBe('measurement-1'); // Legacy compatibility
  });

  it('should toggle selection when appending', () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ measurements: [] }),
    });

    const { result } = renderHook(() => useMeasurements('proj1', 1));

    // Select first measurement
    act(() => {
      result.current.actions.selectMultiple(['measurement-1']);
    });

    expect(result.current.state.selectedIds).toEqual(['measurement-1']);

    // Append second measurement (with toggle mode)
    act(() => {
      result.current.actions.selectMultiple(['measurement-2'], true);
    });

    expect(result.current.state.selectedIds).toEqual(['measurement-1', 'measurement-2']);

    // Toggle off first measurement
    act(() => {
      result.current.actions.selectMultiple(['measurement-1'], true);
    });

    expect(result.current.state.selectedIds).toEqual(['measurement-2']);
  });

  it('should delete multiple measurements', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          measurements: [
            { id: '1', project_id: 'proj1', page_number: 1 },
            { id: '2', project_id: 'proj1', page_number: 1 },
            { id: '3', project_id: 'proj1', page_number: 1 },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // Delete '1'
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // Delete '2'
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ measurements: [{ id: '3' }] }),
      });

    const { result } = renderHook(() => useMeasurements('proj1', 1));

    await waitFor(() => {
      expect(result.current.state.measurements).toHaveLength(3);
    });

    // Select two measurements
    act(() => {
      result.current.actions.selectMultiple(['1', '2']);
    });

    // Delete them
    await act(async () => {
      await result.current.actions.removeMultiple(['1', '2']);
    });

    expect(result.current.state.selectedIds).toEqual([]);

    await waitFor(() => {
      expect(result.current.state.measurements).toHaveLength(1);
    });
  });

  it('should clear selection', () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ measurements: [] }),
    });

    const { result } = renderHook(() => useMeasurements('proj1', 1));

    act(() => {
      result.current.actions.selectMultiple(['measurement-1', 'measurement-2']);
    });

    expect(result.current.state.selectedIds).toEqual(['measurement-1', 'measurement-2']);

    act(() => {
      result.current.actions.clearSelection();
    });

    expect(result.current.state.selectedIds).toEqual([]);
    expect(result.current.state.selectedId).toBeNull();
  });

  // Regression test for async race condition bug
  it('should refetch and update measurements after save when initial data provided', async () => {
    // This test ensures that even when initial data is provided (from consolidated state),
    // the refetch still works properly after saving a new measurement.
    // Previously, using enabled:false in useFetch broke the refetch functionality.

    const initialMeasurements = [
      {
        id: 'existing-1',
        project_id: 'proj1',
        page_number: 1,
        start_point: { x: 0, y: 0 },
        end_point: { x: 50, y: 50 },
        pixels_distance: 70.7,
        real_distance_inches: null,
        created_at: '2024-01-01',
      },
    ];

    const newMeasurement = {
      id: 'new-measurement',
      project_id: 'proj1',
      page_number: 1,
      start_point: { x: 100, y: 100 },
      end_point: { x: 200, y: 200 },
      pixels_distance: 141.4,
      real_distance_inches: 10,
      created_at: '2024-01-02',
    };

    // Mock fetch responses:
    // 1. Initial fetch (should happen even with initialData)
    // 2. Save POST request
    // 3. Refetch after save
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ measurements: initialMeasurements }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ measurement: newMeasurement }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          measurements: [...initialMeasurements, newMeasurement],
        }),
      });

    // Pass initial data (simulating consolidated state from parent)
    const { result } = renderHook(() => useMeasurements('proj1', 1, initialMeasurements));

    // Initial data should be available immediately
    expect(result.current.state.measurements).toHaveLength(1);
    expect(result.current.state.measurements[0].id).toBe('existing-1');

    // Wait for initial fetch to complete (it should still fetch even with initialData)
    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    // Save a new measurement
    let saved;
    await act(async () => {
      saved = await result.current.actions.save({
        project_id: 'proj1',
        page_number: 1,
        start_point: { x: 100, y: 100 },
        end_point: { x: 200, y: 200 },
        pixels_distance: 141.4,
        real_distance_inches: 10,
      });
    });

    expect(saved).toEqual(newMeasurement);

    // CRITICAL: The measurements list should update to include the new measurement
    // This is the regression we're testing - refetch must work even when initialData was provided
    await waitFor(() => {
      expect(result.current.state.measurements).toHaveLength(2);
    });

    expect(result.current.state.measurements.map(m => m.id)).toEqual([
      'existing-1',
      'new-measurement',
    ]);
  });

  it('should handle multiple rapid saves without race conditions', async () => {
    // Test that multiple rapid saves don't cause race conditions
    // This ensures the double-click protection and async handling work correctly

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ measurements: [] }),
      })
      // First save
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ measurement: { id: 'measure-1' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ measurements: [{ id: 'measure-1' }] }),
      })
      // Second save
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ measurement: { id: 'measure-2' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({
          measurements: [{ id: 'measure-1' }, { id: 'measure-2' }],
        }),
      });

    const { result } = renderHook(() => useMeasurements('proj1', 1));

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    // Save two measurements in rapid succession
    await act(async () => {
      const save1 = result.current.actions.save({
        project_id: 'proj1',
        page_number: 1,
        start_point: { x: 0, y: 0 },
        end_point: { x: 100, y: 100 },
        pixels_distance: 141.4,
        real_distance_inches: null,
      });

      const save2 = result.current.actions.save({
        project_id: 'proj1',
        page_number: 1,
        start_point: { x: 200, y: 200 },
        end_point: { x: 300, y: 300 },
        pixels_distance: 141.4,
        real_distance_inches: null,
      });

      await Promise.all([save1, save2]);
    });

    // Both measurements should be in the list
    await waitFor(() => {
      expect(result.current.state.measurements).toHaveLength(2);
    });
  });
});
