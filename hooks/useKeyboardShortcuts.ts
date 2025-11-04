import { useEffect } from 'react';
import type { ViewerMode } from '@/components/pdf/types';

interface ShortcutHandlers {
  onPrevPage: () => void;
  onNextPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onToggleScreenshot: () => void;
  onToggleMeasure: () => void;
  onOpenCalibration: () => void;
  onOpenSearch?: () => void;
  onExit: () => void;
  onDeleteMeasurement?: () => void;
  
  // Screenshot mode shortcuts
  onCaptureCurrent?: () => void;
  onCaptureElevation?: () => void;
  onCaptureBathroom?: () => void;
  onCaptureDoor?: () => void;
  onCaptureKitchen?: () => void;
}

interface ShortcutOptions {
  mode: ViewerMode;
  readOnly: boolean;
  hasSelection: boolean;
  disabled: boolean; // When modals are open
}

/**
 * Hook for managing PDF viewer keyboard shortcuts.
 * 
 * Supports:
 * - Navigation: Arrow keys
 * - Zoom: -/+/0
 * - Modes: S (screenshot), M (measure), L (calibration)
 * - Screenshot: C/E/B/D/K when selection exists
 * - Escape: Exit modes
 * - Delete: Remove selected measurement
 * - F: Open search
 */
export function useKeyboardShortcuts(
  containerRef: React.RefObject<HTMLElement>,
  options: ShortcutOptions,
  handlers: ShortcutHandlers
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when disabled (modals open, etc.)
      if (options.disabled) return;

      const key = e.key.toLowerCase();

      // Navigation
      if (key === 'arrowleft') {
        e.preventDefault();
        handlers.onPrevPage();
        return;
      }
      if (key === 'arrowright') {
        e.preventDefault();
        handlers.onNextPage();
        return;
      }

      // Zoom
      if (key === '-' || key === '_') {
        e.preventDefault();
        handlers.onZoomOut();
        return;
      }
      if (key === '=' || key === '+') {
        e.preventDefault();
        handlers.onZoomIn();
        return;
      }
      if (key === '0') {
        e.preventDefault();
        handlers.onResetZoom();
        return;
      }

      // Search
      if (key === 'f' && !e.ctrlKey && !e.metaKey && handlers.onOpenSearch) {
        e.preventDefault();
        handlers.onOpenSearch();
        return;
      }

      // Exit modes
      if (key === 'escape') {
        e.preventDefault();
        handlers.onExit();
        return;
      }

      // Delete measurement
      if (key === 'delete' && handlers.onDeleteMeasurement) {
        e.preventDefault();
        handlers.onDeleteMeasurement();
        return;
      }

      // Don't allow mode changes in readonly
      if (options.readOnly) return;

      // Toggle modes
      if (key === 's' && !e.repeat) {
        e.preventDefault();
        handlers.onToggleScreenshot();
        return;
      }
      if (key === 'm' && !e.repeat) {
        e.preventDefault();
        handlers.onToggleMeasure();
        return;
      }
      if (key === 'l' && !e.repeat) {
        e.preventDefault();
        handlers.onOpenCalibration();
        return;
      }

      // Screenshot mode shortcuts (require selection)
      if (options.mode.type === 'screenshot' && options.hasSelection && !e.repeat) {
        if (key === 'c' && handlers.onCaptureCurrent) {
          e.preventDefault();
          handlers.onCaptureCurrent();
          return;
        }
        if (key === 'e' && handlers.onCaptureElevation) {
          e.preventDefault();
          handlers.onCaptureElevation();
          return;
        }
        if (key === 'b' && handlers.onCaptureBathroom) {
          e.preventDefault();
          handlers.onCaptureBathroom();
          return;
        }
        if (key === 'd' && handlers.onCaptureDoor) {
          e.preventDefault();
          handlers.onCaptureDoor();
          return;
        }
        if (key === 'k' && handlers.onCaptureKitchen) {
          e.preventDefault();
          handlers.onCaptureKitchen();
          return;
        }
      }
    };

    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [containerRef, options, handlers]);
}

