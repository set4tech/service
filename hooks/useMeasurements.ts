import { useState, useCallback } from 'react';
import { useFetch } from '@/lib/hooks/useFetch';
import type { HookReturn } from '@/lib/hooks/types';

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
  selectedId: string | null; // Legacy single selection
  selectedIds: string[]; // New multi-selection support
  loading: boolean;
  error: string | null;
}

interface MeasurementsActions {
  save: (measurement: NewMeasurement) => Promise<Measurement>;
  remove: (id: string) => Promise<void>;
  removeMultiple: (ids: string[]) => Promise<void>;
  select: (id: string | null) => void; // Legacy single selection
  selectMultiple: (ids: string[], append?: boolean) => void; // New multi-selection
  clearSelection: () => void;
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data, loading, error, refetch } = useFetch<{ measurements: Measurement[] }>(
    projectId ? `/api/measurements?projectId=${projectId}&pageNumber=${pageNumber}` : null
  );

  const measurements = data?.measurements ?? [];

  const save = useCallback(
    async (measurement: NewMeasurement): Promise<Measurement> => {
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
    },
    [refetch]
  );

  const remove = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/measurements?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete measurement');
      }

      setSelectedId(null);
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
      await refetch();
    },
    [refetch]
  );

  const removeMultiple = useCallback(
    async (ids: string[]) => {
      // Delete all measurements in parallel
      await Promise.all(
        ids.map(async id => {
          const response = await fetch(`/api/measurements?id=${id}`, {
            method: 'DELETE',
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Failed to delete measurement ${id}`);
          }

          return response;
        })
      );

      setSelectedId(null);
      setSelectedIds([]);
      await refetch();
    },
    [refetch]
  );

  const selectMultiple = useCallback((ids: string[], append: boolean = false) => {
    setSelectedIds(prev => {
      if (append) {
        // Toggle: add if not present, remove if present
        const newSelection = [...prev];
        ids.forEach(id => {
          const index = newSelection.indexOf(id);
          if (index >= 0) {
            newSelection.splice(index, 1);
          } else {
            newSelection.push(id);
          }
        });
        return newSelection;
      }
      return ids;
    });
    // Keep selectedId in sync with the first item (for legacy compatibility)
    setSelectedId(ids.length > 0 ? ids[0] : null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setSelectedIds([]);
  }, []);

  return {
    state: {
      measurements,
      selectedId,
      selectedIds,
      loading,
      error,
    },
    actions: {
      save,
      remove,
      removeMultiple,
      select: setSelectedId,
      selectMultiple,
      clearSelection,
      refresh: refetch,
    },
  };
}
