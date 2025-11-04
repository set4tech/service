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
      await refetch();
    },
    [refetch]
  );

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
