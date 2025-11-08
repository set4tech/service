import { useCallback, useRef } from 'react';
import type { ViewerMode } from '@/components/pdf/types';

interface MouseHandlers {
  onStartDrag: () => void;
  onEndDrag: () => void;
  onUpdateDrag: (dx: number, dy: number) => void;
  onStartSelection: (x: number, y: number) => void;
  onUpdateSelection: (x: number, y: number) => void;
  onEndSelection: () => void;
}

/**
 * Hook for managing PDF viewer mouse interactions.
 *
 * Handles:
 * - Pan (drag in idle mode)
 * - Selection (drag in screenshot/measure/calibrate modes)
 */
export function usePdfMouseHandlers(mode: ViewerMode, readOnly: boolean, handlers: MouseHandlers) {
  const dragStartRef = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Interactive modes (screenshot/measure/calibrate)
      if (mode.type !== 'idle' && !readOnly) {
        e.preventDefault();
        e.stopPropagation();
        handlers.onStartSelection(e.clientX, e.clientY);
        return;
      }

      // Pan mode (idle, left button only)
      if (e.button !== 0) return;
      handlers.onStartDrag();
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    },
    [mode, readOnly, handlers]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Update selection
      if (mode.type !== 'idle' && mode.selection) {
        e.preventDefault();
        e.stopPropagation();
        handlers.onUpdateSelection(e.clientX, e.clientY);
        return;
      }

      // Update drag/pan
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      handlers.onUpdateDrag(dx, dy);
    },
    [mode, handlers]
  );

  const onMouseUp = useCallback(() => {
    // End selection
    if (mode.type !== 'idle' && mode.selection) {
      handlers.onEndSelection();
    }

    // End drag
    handlers.onEndDrag();
  }, [mode, handlers]);

  const onMouseLeave = useCallback(() => {
    // Don't end drag if we're selecting
    if (mode.type === 'idle') {
      handlers.onEndDrag();
    }
  }, [mode, handlers]);

  return {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
  };
}
