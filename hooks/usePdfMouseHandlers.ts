import { useCallback, useRef } from 'react';
import { screenToContent } from '@/hooks/useViewTransform';
import { lineIntersectsRect } from '@/lib/pdf/geometry-utils';

// Minimum line length for calibration
const MIN_CALIBRATION_PIXELS = 10;

interface Selection {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface ViewerMode {
  type: 'idle' | 'screenshot' | 'measure' | 'calibrate';
  selection: Selection | null;
}

interface Transform {
  tx: number;
  ty: number;
  scale: number;
}

interface Measurement {
  id: string;
  start_point: { x: number; y: number };
  end_point: { x: number; y: number };
}

interface UsePdfMouseHandlersOptions {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  mode: ViewerMode;
  isDrawingCalibrationLine: boolean;
  isDragging: boolean;
  readOnly: boolean;
  transform: Transform;
  measurements: Measurement[];

  // Actions
  dispatch: (action: any) => void;
  setTransform: (transform: Transform) => void;
  saveMeasurement: (selection: Selection) => void;
  setCalibrationLine: (
    line: { start: { x: number; y: number }; end: { x: number; y: number } } | null
  ) => void;
  setShowCalibrationModal: (show: boolean) => void;
  setIsDrawingCalibrationLine: (drawing: boolean) => void;
  selectMeasurements: (ids: string[], append: boolean) => void;
}

interface UsePdfMouseHandlersReturn {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
}

export function usePdfMouseHandlers({
  viewportRef,
  mode,
  isDrawingCalibrationLine,
  isDragging,
  readOnly,
  transform,
  measurements,
  dispatch,
  setTransform,
  saveMeasurement,
  setCalibrationLine,
  setShowCalibrationModal,
  setIsDrawingCalibrationLine,
  selectMeasurements,
}: UsePdfMouseHandlersOptions): UsePdfMouseHandlersReturn {
  const dragStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const lastClickTimeRef = useRef<number>(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Prevent rapid double-clicks from creating 0-pixel measurements
      const now = Date.now();
      const timeSinceLastClick = now - lastClickTimeRef.current;

      if (timeSinceLastClick < 300 && mode.type === 'measure') {
        return;
      }
      lastClickTimeRef.current = now;

      // Special modes: only left-click for selection, no panning allowed
      if ((mode.type !== 'idle' || isDrawingCalibrationLine) && !readOnly) {
        if (e.button === 0) {
          // Left-click only
          e.preventDefault();
          e.stopPropagation();
          const { x, y } = screenToContent(transform, viewportRef.current, e.clientX, e.clientY);
          dispatch({ type: 'START_SELECTION', payload: { x, y } });
        }
        return;
      }

      // Idle mode left-click: selection box for measurements
      if (e.button === 0 && mode.type === 'idle' && !readOnly) {
        e.preventDefault();
        e.stopPropagation();
        const { x, y } = screenToContent(transform, viewportRef.current, e.clientX, e.clientY);
        dispatch({ type: 'START_SELECTION', payload: { x, y } });
        return;
      }

      // Middle-click (1) or right-click (2) for panning
      if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        dispatch({ type: 'START_DRAG' });
        dragStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          tx: transform.tx,
          ty: transform.ty,
        };
      }
    },
    [mode.type, isDrawingCalibrationLine, readOnly, transform, viewportRef, dispatch]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Handle selection box drawing in any mode that has selection
      if (mode.type !== 'idle' || isDrawingCalibrationLine) {
        if (mode.type !== 'idle' && mode.selection) {
          e.preventDefault();
          e.stopPropagation();
          const { x, y } = screenToContent(transform, viewportRef.current, e.clientX, e.clientY);
          dispatch({ type: 'UPDATE_SELECTION', payload: { x, y } });
        }
        return;
      }

      // Idle mode with selection: update selection box
      if (mode.type === 'idle' && mode.selection) {
        e.preventDefault();
        e.stopPropagation();
        const { x, y } = screenToContent(transform, viewportRef.current, e.clientX, e.clientY);
        dispatch({ type: 'UPDATE_SELECTION', payload: { x, y } });
        return;
      }

      // Pan mode: update transform
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setTransform({
        ...transform,
        tx: dragStartRef.current.tx + dx,
        ty: dragStartRef.current.ty + dy,
      });
    },
    [mode, isDrawingCalibrationLine, isDragging, transform, viewportRef, dispatch, setTransform]
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (mode.type === 'screenshot' && mode.selection) {
        // Keep the selection visible so user can save it with button or keyboard shortcut
        // Don't auto-clear like we do for measurements
      } else if (mode.type === 'measure' && mode.selection) {
        // Auto-save measurement (validation happens in saveMeasurement)
        const selectionToSave = mode.selection;
        // Clear selection immediately so it doesn't interfere with next drag
        dispatch({ type: 'CLEAR_SELECTION' });
        // Save async in background
        saveMeasurement(selectionToSave);
      } else if (isDrawingCalibrationLine && mode.type !== 'idle' && mode.selection) {
        // Validate calibration line length before showing modal
        const selection = mode.selection;
        const dx = selection.endX - selection.startX;
        const dy = selection.endY - selection.startY;
        const pixelsDistance = Math.sqrt(dx * dx + dy * dy);

        if (pixelsDistance >= MIN_CALIBRATION_PIXELS) {
          setCalibrationLine({
            start: { x: selection.startX, y: selection.startY },
            end: { x: selection.endX, y: selection.endY },
          });
          setShowCalibrationModal(true);
        } else {
          console.log(
            '[usePdfMouseHandlers] Ignoring calibration line - too short:',
            pixelsDistance
          );
        }
        setIsDrawingCalibrationLine(false);
        dispatch({ type: 'CLEAR_SELECTION' });
      } else if (mode.type === 'idle' && mode.selection) {
        // Idle mode: select measurements that intersect with selection box
        const selection = mode.selection;
        const selectionRect = {
          x: Math.min(selection.startX, selection.endX),
          y: Math.min(selection.startY, selection.endY),
          width: Math.abs(selection.endX - selection.startX),
          height: Math.abs(selection.endY - selection.startY),
        };

        // Find all measurements that intersect with the selection box
        const selectedIds = measurements
          .filter(m => lineIntersectsRect(m.start_point, m.end_point, selectionRect))
          .map(m => m.id);

        // Check if Shift key is held for append mode
        const shiftHeld = e.shiftKey;
        selectMeasurements(selectedIds, shiftHeld);

        // Clear the selection box
        dispatch({ type: 'CLEAR_SELECTION' });

        // Refocus viewport so keyboard shortcuts work (especially Delete key)
        setTimeout(() => viewportRef.current?.focus(), 0);
      }
      dispatch({ type: 'END_DRAG' });
    },
    [
      mode,
      isDrawingCalibrationLine,
      measurements,
      dispatch,
      saveMeasurement,
      setCalibrationLine,
      setShowCalibrationModal,
      setIsDrawingCalibrationLine,
      selectMeasurements,
      viewportRef,
    ]
  );

  const onMouseLeave = useCallback(() => {
    if (mode.type === 'idle' && !isDrawingCalibrationLine) {
      dispatch({ type: 'END_DRAG' });
    }
  }, [mode.type, isDrawingCalibrationLine, dispatch]);

  return {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
  };
}
