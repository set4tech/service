import { useCallback, useEffect, useState } from 'react';
import type { Measurement } from '@/components/pdf/MeasurementOverlay';

interface Selection {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export function useMeasurements(
  projectId: string | undefined,
  pageNumber: number,
  readOnly: boolean,
  page: any,
  canvasRef: React.RefObject<HTMLCanvasElement>
) {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [calibration, setCalibration] = useState<any | null>(null);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);

  // Load measurements for current page
  useEffect(() => {
    if (!projectId || readOnly) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/measurements?projectId=${projectId}&pageNumber=${pageNumber}`);
        if (!res.ok) throw new Error('Failed to fetch measurements');
        const data = await res.json();
        if (!cancelled) setMeasurements(data.measurements || []);
      } catch (error) {
        console.error('[useMeasurements] Error loading measurements:', error);
        if (!cancelled) setMeasurements([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, pageNumber, readOnly]);

  // Load calibration for current page
  useEffect(() => {
    if (!projectId || readOnly) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/measurements/calibrate?projectId=${projectId}&pageNumber=${pageNumber}`
        );
        if (!res.ok) throw new Error('Failed to fetch calibration');
        const data = await res.json();
        if (!cancelled) setCalibration(data.calibration || null);
      } catch (error) {
        console.error('[useMeasurements] Error loading calibration:', error);
        if (!cancelled) setCalibration(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, pageNumber, readOnly]);

  // Helper to calculate real distance from pixels using scale notation and PDF dimensions
  const calculateRealDistance = useCallback(
    (pixelsDistance: number): number | null => {
      if (!calibration?.scale_notation || !page) return null;

      try {
        // Parse scale notation to get ratio
        const match = calibration.scale_notation.match(
          /^(\\d+(?:\\/\\d+)?)\"?\\s*=\\s*(\\d+)'(?:-(\\d+)\"?)?$/
        );
        if (!match) return null;

        const [, paperInchStr, realFeetStr, realInchesStr] = match;

        // Parse paper inches (could be fraction)
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

        // Get PDF page dimensions at scale 1
        const viewport = page.getViewport({ scale: 1 });

        // Get canvas width in pixels (at our render scale)
        const canvas = canvasRef.current;
        if (!canvas) return null;

        // Canvas pixels per PDF point
        const canvasWidth = canvas.width;
        const pixelsPerPoint = canvasWidth / viewport.width;

        // Pixels per paper inch
        const pixelsPerPaperInch = pixelsPerPoint * 72;

        // Convert pixel distance to paper inches
        const paperInchesDistance = pixelsDistance / pixelsPerPaperInch;

        // Convert paper inches to real inches using scale
        const scaleRatio = paperInches / realTotalInches; // paper inches per real inch
        const realInchesDistance = paperInchesDistance / scaleRatio;

        return realInchesDistance;
      } catch (error) {
        console.error('[useMeasurements] Error calculating real distance:', error);
        return null;
      }
    },
    [calibration, page, canvasRef]
  );

  const saveMeasurement = useCallback(
    async (selection: Selection | null) => {
      if (!projectId || !selection) return;

      const dx = selection.endX - selection.startX;
      const dy = selection.endY - selection.startY;
      const pixelsDistance = Math.sqrt(dx * dx + dy * dy);

      // Calculate real distance using scale notation and PDF dimensions
      const realDistanceInches = calculateRealDistance(pixelsDistance);

      try {
        const res = await fetch('/api/measurements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            page_number: pageNumber,
            start_point: { x: selection.startX, y: selection.startY },
            end_point: { x: selection.endX, y: selection.endY },
            pixels_distance: pixelsDistance,
            real_distance_inches: realDistanceInches,
          }),
        });

        if (!res.ok) throw new Error('Failed to save measurement');

        const data = await res.json();
        setMeasurements(prev => [...prev, data.measurement]);
      } catch (error) {
        console.error('[useMeasurements] Error saving measurement:', error);
        alert('Failed to save measurement');
      }
    },
    [projectId, pageNumber, calculateRealDistance]
  );

  const deleteMeasurement = useCallback(async (measurementId: string) => {
    try {
      const res = await fetch(`/api/measurements?id=${measurementId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete measurement');

      setMeasurements(prev => prev.filter(m => m.id !== measurementId));
      setSelectedMeasurementId(null);
    } catch (error) {
      console.error('[useMeasurements] Error deleting measurement:', error);
      alert('Failed to delete measurement');
    }
  }, []);

  const saveCalibration = useCallback(
    async (scaleNotation: string) => {
      if (!projectId) return;

      try {
        const res = await fetch('/api/measurements/calibrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            page_number: pageNumber,
            scale_notation: scaleNotation,
          }),
        });

        if (!res.ok) throw new Error('Failed to save calibration');

        const data = await res.json();
        setCalibration(data.calibration);

        // Reload measurements to get updated real distances
        const measurementsRes = await fetch(
          `/api/measurements?projectId=${projectId}&pageNumber=${pageNumber}`
        );
        if (measurementsRes.ok) {
          const measurementsData = await measurementsRes.json();
          setMeasurements(measurementsData.measurements || []);
        }
      } catch (error) {
        console.error('[useMeasurements] Error saving calibration:', error);
        alert('Failed to save calibration');
      }
    },
    [projectId, pageNumber]
  );

  return {
    measurements,
    calibration,
    selectedMeasurementId,
    setSelectedMeasurementId,
    saveMeasurement,
    deleteMeasurement,
    saveCalibration,
    calculateRealDistance,
  };
}