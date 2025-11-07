'use client';

import { pdfjs } from 'react-pdf';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ViolationMarker as ViolationMarkerType } from '@/lib/reports/get-violations';
import { ViolationBoundingBox } from '../reports/ViolationBoundingBox';
import { groupOverlappingViolations } from '@/lib/reports/group-violations';
import { BlueprintLoader } from '../reports/BlueprintLoader';
import { ElevationCapturePrompt } from './ElevationCapturePrompt';
import { ScreenshotIndicatorOverlay } from './ScreenshotIndicatorOverlay';
import { useAssessmentScreenshots } from '@/hooks/useAssessmentScreenshots';
import { useTextSearch } from '@/hooks/useTextSearch';
import { PDFSearchOverlay } from './PDFSearchOverlay';
import { TextHighlight } from './TextHighlight';
import { MeasurementOverlay } from './MeasurementOverlay';
import { CalibrationModal } from './CalibrationModal';
import {
  ViewerMode,
  enterMode,
  exitMode,
  startSelection,
  updateSelection,
  clearSelection,
} from './types';
import { usePresignedUrl } from '@/hooks/usePresignedUrl';
import { usePdfDocument } from '@/hooks/usePdfDocument';
import { usePdfLayers } from '@/hooks/usePdfLayers';
import { usePdfPersistence } from '@/hooks/usePdfPersistence';
import { useViewTransform, screenToContent } from '@/hooks/useViewTransform';
import { useMeasurements } from '@/hooks/useMeasurements';
import { useCalibration } from '@/hooks/useCalibration';
import { useScreenshotCapture } from '@/hooks/useScreenshotCapture';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { renderPdfPage } from '@/lib/pdf/canvas-utils';
import { lineIntersectsRect } from '@/lib/pdf/geometry-utils';

// Use the unpkg CDN which is more reliable for Vercel deployments
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Stable empty function to avoid creating new functions on every render
const NOOP = () => {};

interface ViewerState {
  pageNumber: number;
  numPages: number;
  isDragging: boolean;
  mode: ViewerMode;
}

type ViewerAction =
  | { type: 'SET_PAGE'; payload: number }
  | { type: 'SET_NUM_PAGES'; payload: number }
  | { type: 'START_DRAG' }
  | { type: 'END_DRAG' }
  | { type: 'SET_MODE'; payload: 'idle' | 'screenshot' | 'measure' | 'calibrate' }
  | { type: 'START_SELECTION'; payload: { x: number; y: number } }
  | { type: 'UPDATE_SELECTION'; payload: { x: number; y: number } }
  | { type: 'CLEAR_SELECTION' };

function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case 'SET_PAGE':
      return {
        ...state,
        pageNumber: action.payload,
        mode: exitMode(),
      };
    case 'SET_NUM_PAGES':
      return { ...state, numPages: action.payload };
    case 'START_DRAG':
      return { ...state, isDragging: true };
    case 'END_DRAG':
      return { ...state, isDragging: false };
    case 'SET_MODE':
      return {
        ...state,
        mode: action.payload === 'idle' ? exitMode() : enterMode(action.payload),
      };
    case 'START_SELECTION':
      return {
        ...state,
        mode: startSelection(state.mode, action.payload.x, action.payload.y),
      };
    case 'UPDATE_SELECTION':
      return {
        ...state,
        mode: updateSelection(state.mode, action.payload.x, action.payload.y),
      };
    case 'CLEAR_SELECTION':
      return {
        ...state,
        mode: clearSelection(state.mode),
      };
    default:
      return state;
  }
}

export function PDFViewer({
  pdfUrl,
  projectId,
  assessmentId: propAssessmentId,
  activeCheck,
  onScreenshotSaved,
  onCheckAdded,
  onCheckSelect,
  readOnly = false,
  violationMarkers = [],
  onMarkerClick,
  currentPage: externalCurrentPage,
  onPageChange,
  highlightedViolationId,
  disableLayers = false,
  screenshotNavigation,
  refetchChecks,
}: {
  pdfUrl: string;
  projectId?: string;
  assessmentId?: string;
  activeCheck?: any;
  onScreenshotSaved?: (checkId: string) => void;
  onCheckAdded?: (check: any) => void;
  onCheckSelect?: (checkId: string) => void;
  readOnly?: boolean;
  violationMarkers?: ViolationMarkerType[];
  onMarkerClick?: (marker: ViolationMarkerType) => void;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  highlightedViolationId?: string | null;
  disableLayers?: boolean;
  screenshotNavigation?: {
    current: number;
    total: number;
    onNext: () => void;
    onPrev: () => void;
    canGoNext: boolean;
    canGoPrev: boolean;
  };
  refetchChecks?: () => Promise<void>;
}) {
  const assessmentId = useMemo(
    () => propAssessmentId || activeCheck?.assessment_id,
    [propAssessmentId, activeCheck?.assessment_id]
  );

  // ============================================================================
  // SECTION 1: REFS
  // ============================================================================
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const dragStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const loadedScaleForRef = useRef<string | null>(null);

  // ============================================================================
  // SECTION 2: PERSISTENCE & STATE
  // ============================================================================
  const persistence = usePdfPersistence(assessmentId);
  const transform = persistence.state.transform;
  const setTransform = persistence.actions.setTransform;
  const showScreenshotIndicators = persistence.state.showIndicators;
  const setShowScreenshotIndicators = persistence.actions.setShowIndicators;

  const [state, dispatch] = useReducer(viewerReducer, {
    pageNumber: persistence.state.page,
    numPages: 0,
    isDragging: false,
    mode: { type: 'idle', selection: null },
  });

  // Keep a ref to the current state to avoid stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  // ============================================================================
  // SECTION 3: UI STATE
  // ============================================================================
  const [renderScale, setRenderScale] = useState(4);
  const [savingScale, setSavingScale] = useState(false);
  const [smoothTransition, setSmoothTransition] = useState(false);
  const [showElevationPrompt, setShowElevationPrompt] = useState(false);
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [calibrationLine, setCalibrationLine] = useState<{
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);
  const [isDrawingCalibrationLine, setIsDrawingCalibrationLine] = useState(false);
  const [showLayerPanel, setShowLayerPanel] = useState(false);

  // ============================================================================
  // SECTION 4: PDF DOCUMENT & LAYERS
  // ============================================================================
  const { url: presignedUrl, loading: loadingUrl } = usePresignedUrl(pdfUrl);
  const pdf = usePdfDocument(presignedUrl, state.pageNumber);
  const layers = usePdfLayers(pdf.state.doc, assessmentId, disableLayers);
  const { doc: pdfDoc, page, numPages } = pdf.state;
  const { ocConfig, layers: layerList } = layers.state;

  // ============================================================================
  // SECTION 5: FEATURE HOOKS
  // ============================================================================
  const measurementsHook = useMeasurements(readOnly ? undefined : projectId, state.pageNumber);
  const calibrationHook = useCalibration(readOnly ? undefined : projectId, state.pageNumber);
  const screenshotsHook = useAssessmentScreenshots(
    readOnly ? undefined : assessmentId,
    state.pageNumber
  );
  const viewTransform = useViewTransform(
    viewportRef as React.RefObject<HTMLElement>,
    transform,
    setTransform
  );

  const measurements = measurementsHook.state.measurements;
  const selectedMeasurementId = measurementsHook.state.selectedId;
  const setSelectedMeasurementId = measurementsHook.actions.select;
  const calibration = calibrationHook.state.calibration;
  const calculateRealDistance = calibrationHook.computed?.calculateRealDistance ?? (() => null);
  const screenshotIndicators = screenshotsHook.state.screenshots;
  const refreshScreenshots = screenshotsHook.actions.refresh;

  // Text search hook
  const handleSearchPageChange = useCallback((page: number) => {
    dispatch({ type: 'SET_PAGE', payload: page });
  }, []);

  const textSearch = useTextSearch({
    projectId: projectId || '',
    pdfDoc,
    onPageChange: handleSearchPageChange,
  });

  // Screenshot capture hook
  const screenshotCapture = useScreenshotCapture({
    page,
    canvas: canvasRef.current,
    ocConfig,
    renderScale,
    assessmentId,
    activeCheck,
    onCheckAdded,
    onCheckSelect,
    onScreenshotSaved,
    refreshScreenshots,
    refetchChecks,
  });

  // ============================================================================
  // SECTION 6: COMPUTED VALUES
  // ============================================================================

  // Memoize violation groups
  const violationGroups = useMemo(() => {
    if (!readOnly || violationMarkers.length === 0) return [];

    const expandedMarkers: ViolationMarkerType[] = [];
    violationMarkers.forEach(violation => {
      if (violation.allScreenshots && violation.allScreenshots.length > 0) {
        violation.allScreenshots.forEach(screenshot => {
          expandedMarkers.push({
            ...violation,
            screenshotId: screenshot.id,
            screenshotUrl: screenshot.url,
            thumbnailUrl: screenshot.thumbnailUrl,
            pageNumber: screenshot.pageNumber,
            bounds: screenshot.bounds,
          });
        });
      } else {
        expandedMarkers.push(violation);
      }
    });

    return groupOverlappingViolations(expandedMarkers, state.pageNumber);
  }, [readOnly, violationMarkers, state.pageNumber]);

  // ============================================================================
  // SECTION 7: SYNC EFFECTS
  // ============================================================================
  // Sync page with persistence
  useEffect(() => {
    if (state.pageNumber !== persistence.state.page) {
      persistence.actions.setPage(state.pageNumber);
    }
  }, [state.pageNumber, persistence.state.page, persistence.actions]);

  // Notify parent of page changes
  useEffect(() => {
    onPageChangeRef.current?.(state.pageNumber);
  }, [state.pageNumber]);

  // Sync numPages
  useEffect(() => {
    if (numPages > 0 && numPages !== state.numPages) {
      dispatch({ type: 'SET_NUM_PAGES', payload: numPages });
    }
  }, [numPages, state.numPages]);

  useEffect(() => {
    if (!readOnly || !highlightedViolationId || !canvasRef.current || !viewportRef.current) {
      return;
    }

    const [checkId, screenshotId] = highlightedViolationId.split(':::');
    const violation = violationMarkers.find(v => v.checkId === checkId);
    if (!violation) return;

    const screenshot =
      violation.allScreenshots?.find(s => s.id === screenshotId) ||
      (violation.screenshotId === screenshotId
        ? {
            pageNumber: violation.pageNumber,
            bounds: violation.bounds,
          }
        : null);

    if (!screenshot) return;
    if (screenshot.pageNumber !== state.pageNumber) return;

    const bounds = screenshot.bounds;
    const hasValidBounds = bounds.width > 0 && bounds.height > 0;
    if (!hasValidBounds) return;

    const timeoutId = setTimeout(() => {
      setSmoothTransition(true);
      viewTransform.centerOn(bounds);
      setTimeout(() => setSmoothTransition(false), 500);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [highlightedViolationId, state.pageNumber, readOnly, violationMarkers, viewTransform]);

  // Center on current search match
  useEffect(() => {
    if (
      !textSearch.isOpen ||
      textSearch.matches.length === 0 ||
      !canvasRef.current ||
      !viewportRef.current
    ) {
      return;
    }

    const currentMatch = textSearch.matches[textSearch.currentIndex];
    if (!currentMatch) return;
    if (currentMatch.pageNumber !== state.pageNumber) return;

    const bounds = currentMatch.bounds;
    const hasValidBounds = bounds.width > 0 && bounds.height > 0;
    if (!hasValidBounds) return;

    const timeoutId = setTimeout(() => {
      setSmoothTransition(true);
      viewTransform.centerOn(bounds);
      setTimeout(() => setSmoothTransition(false), 500);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [
    textSearch.isOpen,
    textSearch.matches,
    textSearch.currentIndex,
    state.pageNumber,
    viewTransform,
  ]);

  // External page control
  const prevExternalPageRef = useRef(externalCurrentPage);
  useEffect(() => {
    if (externalCurrentPage && externalCurrentPage !== prevExternalPageRef.current) {
      prevExternalPageRef.current = externalCurrentPage;
      if (externalCurrentPage !== state.pageNumber) {
        dispatch({ type: 'SET_PAGE', payload: externalCurrentPage });
      }
    }
  }, [externalCurrentPage, state.pageNumber]);

  // Load saved render scale
  useEffect(() => {
    if (!assessmentId || readOnly || loadedScaleForRef.current === assessmentId) return;

    // Mark as loading immediately to prevent duplicate fetches
    loadedScaleForRef.current = assessmentId;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/assessments/${assessmentId}/pdf-scale`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data?.pdf_scale) {
            const loadedScale = Math.min(8, Math.max(2, data.pdf_scale));
            setRenderScale(loadedScale < 3 ? 4 : loadedScale);
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assessmentId, readOnly]);

  // Center the page initially when it first loads
  // Track whether we've already centered this page to avoid re-centering on zoom
  const pageCenteredRef = useRef<number | null>(null);

  useEffect(() => {
    if (!page || !viewportRef.current) return;

    // Only center if we haven't centered this page yet
    if (pageCenteredRef.current === state.pageNumber) return;

    const viewport = page.getViewport({ scale: 1 });
    const container = viewportRef.current;

    // Calculate what the centered position should be
    const centeredTx = (container.clientWidth - viewport.width) / 2;
    const centeredTy = (container.clientHeight - viewport.height) / 2;

    // Check if current transform would put the page off-screen or is initial load
    const isOffScreen =
      transform.tx < -viewport.width ||
      transform.tx > container.clientWidth ||
      transform.ty < -viewport.height ||
      transform.ty > container.clientHeight;

    const isInitialLoad = transform.tx === 0 && transform.ty === 0 && transform.scale === 1;

    if (isInitialLoad || isOffScreen) {
      setTransform({ tx: centeredTx, ty: centeredTy, scale: 1 });
      // Mark this page as centered
      pageCenteredRef.current = state.pageNumber;
    }
  }, [page, state.pageNumber]);

  // Core render function
  const renderPage = useCallback(async () => {
    const c = canvasRef.current;
    if (!c || !page) return;

    // Cancel any in-flight render
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // ignore
      }
      renderTaskRef.current = null;
    }

    try {
      const result = renderPdfPage(page, c, {
        scaleMultiplier: renderScale,
        optionalContentConfig: ocConfig && !disableLayers ? ocConfig : undefined,
      });

      // Store task so we can cancel next time
      renderTaskRef.current = result.task;

      // Now await the render
      await result.task.promise;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('[PDFViewer] Render error:', err);
      }
    } finally {
      // Clear ref after completion
      renderTaskRef.current = null;
    }
  }, [page, renderScale, ocConfig, disableLayers]);

  // Kick renders when inputs change
  // Note: renderPage is not in deps because it already depends on all these values
  useEffect(() => {
    if (page) renderPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, renderScale, layerList]);

  // Attach wheel zoom handler
  useEffect(() => {
    if (!viewportRef.current) return;
    return viewTransform.attachWheelZoom();
  }, [viewTransform]);

  // Toolbar zoom (use viewTransform)
  const zoom = useCallback(
    (dir: 'in' | 'out') => {
      viewTransform.zoom(dir);
    },
    [viewTransform]
  );

  // Measurement handlers
  const saveMeasurement = useCallback(
    async (selection: any) => {
      if (!projectId || !selection) return;

      const dx = selection.endX - selection.startX;
      const dy = selection.endY - selection.startY;
      const pixelsDistance = Math.sqrt(dx * dx + dy * dy);

      // Get canvas CSS width for page-size calibration method
      const cssWidth = canvasRef.current?.offsetWidth;

      // Calculate real distance using scale notation and PDF dimensions
      const realDistanceInches = calculateRealDistance(pixelsDistance, cssWidth);

      try {
        await measurementsHook.actions.save({
          project_id: projectId,
          page_number: state.pageNumber,
          start_point: { x: selection.startX, y: selection.startY },
          end_point: { x: selection.endX, y: selection.endY },
          pixels_distance: pixelsDistance,
          real_distance_inches: realDistanceInches,
        });
        dispatch({ type: 'CLEAR_SELECTION' });
      } catch (error) {
        console.error('[PDFViewer] Error saving measurement:', error);
        alert('Failed to save measurement');
      }
    },
    [projectId, state.pageNumber, calculateRealDistance, measurementsHook.actions]
  );

  const deleteMeasurement = useCallback(
    async (measurementId: string) => {
      try {
        await measurementsHook.actions.remove(measurementId);
        setSelectedMeasurementId(null);
      } catch (error) {
        console.error('[PDFViewer] Error deleting measurement:', error);
        alert('Failed to delete measurement');
      }
    },
    [measurementsHook.actions, setSelectedMeasurementId]
  );

  const saveCalibration = useCallback(
    async (scaleNotation: string, printWidth: number, printHeight: number) => {
      if (!projectId || !page) return;

      try {
        // Get PDF dimensions in points for calculation
        const viewport = page.getViewport({ scale: 1 });

        await calibrationHook.actions.savePageSize(
          scaleNotation,
          printWidth,
          printHeight,
          viewport.width,
          viewport.height
        );

        setShowCalibrationModal(false);
        setCalibrationLine(null);

        // Refresh measurements to get updated real distances
        await measurementsHook.actions.refresh();
      } catch (error) {
        console.error('[PDFViewer] Error saving calibration:', error);
        alert('Failed to save calibration');
      }
    },
    [projectId, page, calibrationHook.actions, measurementsHook.actions]
  );

  const saveCalibrationKnownLength = useCallback(
    async (
      lineStart: { x: number; y: number },
      lineEnd: { x: number; y: number },
      knownDistanceInches: number
    ) => {
      if (!projectId) return;

      try {
        await calibrationHook.actions.saveKnownLength(lineStart, lineEnd, knownDistanceInches);

        setShowCalibrationModal(false);
        setCalibrationLine(null);
        setIsDrawingCalibrationLine(false);

        // Refresh measurements to get updated real distances
        await measurementsHook.actions.refresh();
      } catch (error) {
        console.error('[PDFViewer] Error saving calibration:', error);
        alert('Failed to save calibration');
      }
    },
    [projectId, calibrationHook.actions, measurementsHook.actions]
  );

  const handleRequestLineDraw = useCallback(() => {
    setIsDrawingCalibrationLine(true);
    setCalibrationLine(null);
    setShowCalibrationModal(false);
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts(
    viewportRef as React.RefObject<HTMLElement>,
    {
      mode: state.mode,
      readOnly,
      hasSelection: state.mode.type !== 'idle' && state.mode.selection !== null,
      disabled: showElevationPrompt || showCalibrationModal || textSearch.isOpen,
    },
    {
      onPrevPage: () => dispatch({ type: 'SET_PAGE', payload: Math.max(1, state.pageNumber - 1) }),
      onNextPage: () =>
        dispatch({ type: 'SET_PAGE', payload: Math.min(state.numPages, state.pageNumber + 1) }),
      onZoomIn: () => viewTransform.zoom('in'),
      onZoomOut: () => viewTransform.zoom('out'),
      onResetZoom: () => viewTransform.reset(),
      onToggleScreenshot: () =>
        dispatch({
          type: 'SET_MODE',
          payload: state.mode.type === 'screenshot' ? 'idle' : 'screenshot',
        }),
      onToggleMeasure: () =>
        dispatch({
          type: 'SET_MODE',
          payload: state.mode.type === 'measure' ? 'idle' : 'measure',
        }),
      onOpenCalibration: () => setShowCalibrationModal(true),
      onOpenSearch: projectId ? textSearch.open : undefined,
      onExit: () => {
        if (isDrawingCalibrationLine) {
          setIsDrawingCalibrationLine(false);
          setCalibrationLine(null);
        }
        dispatch({ type: 'SET_MODE', payload: 'idle' });
        dispatch({ type: 'CLEAR_SELECTION' });
      },
      onDeleteMeasurement: selectedMeasurementId
        ? () => deleteMeasurement(selectedMeasurementId)
        : undefined,
      onCaptureCurrent: () => capture('current', 'plan'),
      onCaptureElevation: () => setShowElevationPrompt(true),
      onCaptureBathroom: () => capture('bathroom', 'plan'),
      onCaptureDoor: () => capture('door', 'plan'),
      onCaptureKitchen: () => capture('kitchen', 'plan'),
    }
  );

  // Mouse handlers for pan / selection
  const onMouseDown = (e: React.MouseEvent) => {
    // Special modes: only left-click for selection, no panning allowed
    if ((state.mode.type !== 'idle' || isDrawingCalibrationLine) && !readOnly) {
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
    if (e.button === 0 && state.mode.type === 'idle' && !readOnly) {
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
  };

  const onMouseMove = (e: React.MouseEvent) => {
    // Handle selection box drawing in any mode that has selection
    if (state.mode.type !== 'idle' || isDrawingCalibrationLine) {
      if (state.mode.type !== 'idle' && state.mode.selection) {
        e.preventDefault();
        e.stopPropagation();
        const { x, y } = screenToContent(transform, viewportRef.current, e.clientX, e.clientY);
        dispatch({ type: 'UPDATE_SELECTION', payload: { x, y } });
      }
      return;
    }

    // Idle mode with selection: update selection box
    if (state.mode.type === 'idle' && state.mode.selection) {
      e.preventDefault();
      e.stopPropagation();
      const { x, y } = screenToContent(transform, viewportRef.current, e.clientX, e.clientY);
      dispatch({ type: 'UPDATE_SELECTION', payload: { x, y } });
      return;
    }

    // Pan mode: update transform
    if (!state.isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setTransform({
      ...transform,
      tx: dragStartRef.current.tx + dx,
      ty: dragStartRef.current.ty + dy,
    });
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (state.mode.type === 'screenshot' && state.mode.selection) {
      // Keep the selection visible so user can save it with button or keyboard shortcut
      // Don't auto-clear like we do for measurements
    } else if (state.mode.type === 'measure' && state.mode.selection) {
      // Auto-save measurement when line is complete
      saveMeasurement(state.mode.selection);
      dispatch({ type: 'CLEAR_SELECTION' });
    } else if (isDrawingCalibrationLine && state.mode.type !== 'idle' && state.mode.selection) {
      // Save calibration line and show modal
      setCalibrationLine({
        start: { x: state.mode.selection.startX, y: state.mode.selection.startY },
        end: { x: state.mode.selection.endX, y: state.mode.selection.endY },
      });
      setIsDrawingCalibrationLine(false);
      setShowCalibrationModal(true);
      dispatch({ type: 'CLEAR_SELECTION' });
    } else if (state.mode.type === 'idle' && state.mode.selection) {
      // Idle mode: select measurements that intersect with selection box
      const selection = state.mode.selection;
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
      measurementsHook.actions.selectMultiple(selectedIds, shiftHeld);

      // Clear the selection box
      dispatch({ type: 'CLEAR_SELECTION' });
    }
    dispatch({ type: 'END_DRAG' });
  };

  // User-facing controls
  const updateRenderScale = useCallback(
    async (newScale: number) => {
      setRenderScale(newScale);
      if (!assessmentId) return;
      setSavingScale(true);
      try {
        const response = await fetch(`/api/assessments/${assessmentId}/pdf-scale`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdf_scale: newScale }),
        });
        if (!response.ok) {
          console.error('[PDFViewer] Failed to save render scale');
        }
      } catch (err) {
        console.error('[PDFViewer] Error saving render scale:', err);
      } finally {
        setSavingScale(false);
      }
    },
    [assessmentId]
  );

  const toggleLayer = layers.actions.toggleLayer;

  const capture = useCallback(
    async (
      target: 'current' | 'bathroom' | 'door' | 'kitchen' = 'current',
      screenshotType: 'plan' | 'elevation' = 'plan',
      elementGroupId?: string,
      caption?: string
    ) => {
      const currentState = stateRef.current;
      if (currentState.mode.type === 'idle' || !currentState.mode.selection) return;

      // Save selection before clearing it
      const selection = currentState.mode.selection;

      // Clear selection and exit screenshot mode IMMEDIATELY for plan screenshots
      // This prevents the blue box from lingering during the async capture
      if (screenshotType === 'plan') {
        dispatch({ type: 'CLEAR_SELECTION' });
        dispatch({ type: 'SET_MODE', payload: 'idle' });
      }

      try {
        await screenshotCapture.capture({
          target,
          type: screenshotType,
          selection,
          elementGroupId,
          caption,
          pageNumber: currentState.pageNumber,
          zoomLevel: transform.scale,
        });
      } catch (err) {
        console.error('[PDFViewer] capture failed:', err);
        alert('Failed to save screenshot.');
      }
    },
    [screenshotCapture, transform.scale]
  );

  // Stable callbacks for ElevationCapturePrompt to prevent infinite re-renders
  const handleElevationSave = useCallback(
    (elementGroupId: string, caption: string) => {
      // IMPORTANT: Capture FIRST while selection still exists, THEN close modal
      capture('current', 'elevation', elementGroupId, caption);
      setShowElevationPrompt(false);
      // Refocus viewport to restore keyboard handling
      setTimeout(() => viewportRef.current?.focus(), 0);
    },
    [capture]
  );

  const handleElevationCancel = useCallback(() => {
    setShowElevationPrompt(false);
    // Refocus viewport to restore keyboard handling
    setTimeout(() => viewportRef.current?.focus(), 0);
  }, []);

  if (loadingUrl) {
    return <BlueprintLoader />;
  }

  if (!presignedUrl) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-red-50">
        <div className="p-6 text-center text-red-600 max-w-md">
          <div className="text-lg font-medium mb-2">Failed to load PDF</div>
          <div className="text-sm text-gray-600 mt-2 break-all">Original URL: {pdfUrl}</div>
          <div className="text-xs text-gray-500 mt-2">Check browser console for more details</div>
        </div>
      </div>
    );
  }

  // Show loading animation while PDF document or first page is loading
  if (!pdfDoc || !page) {
    return <BlueprintLoader />;
  }

  const zoomPct = Math.round(transform.scale * 100);

  return (
    <div
      ref={viewportRef}
      tabIndex={0}
      role="region"
      aria-label="PDF viewer"
      className="relative h-full w-full outline-none overscroll-contain"
      style={{ touchAction: 'none' }}
    >
      {state.mode.type === 'screenshot' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-blue-600 text-white px-4 py-2 rounded shadow-lg text-sm font-medium">
            📸 Screenshot Mode: Click and drag to select area
          </div>
        </div>
      )}

      {state.mode.type === 'measure' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-green-600 text-white px-4 py-2 rounded shadow-lg text-sm font-medium">
            📏 Measurement Mode: Draw lines to measure
            {calibration?.scale_notation ? (
              <span className="ml-2 opacity-90 font-mono">({calibration.scale_notation})</span>
            ) : (
              <span className="ml-2 opacity-90">(No scale set - press L)</span>
            )}
            <span className="ml-3 opacity-90 text-xs">Click line to select • Delete to remove</span>
          </div>
        </div>
      )}

      {isDrawingCalibrationLine && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-purple-600 text-white px-4 py-2 rounded shadow-lg text-sm font-medium">
            📐 Calibration Mode: Draw a line along a known distance
            <span className="ml-3 opacity-90 text-xs">Press Esc to cancel</span>
          </div>
        </div>
      )}

      {state.mode.type !== 'measure' &&
        selectedMeasurementId &&
        measurements.length > 0 &&
        !readOnly && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            <div className="bg-blue-600 text-white px-4 py-2 rounded shadow-lg text-sm font-medium">
              Measurement selected • Press{' '}
              <kbd className="px-1.5 py-0.5 bg-blue-700 rounded mx-1 font-mono text-xs">Delete</kbd>{' '}
              to remove
            </div>
          </div>
        )}

      {state.mode.type === 'screenshot' && state.mode.selection && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 flex gap-2 pointer-events-none">
          <kbd className="px-3 py-2 bg-white shadow-md rounded text-sm border-2 border-blue-500 font-mono">
            C - Save to Current (exits)
          </kbd>
          <kbd className="px-3 py-2 bg-white shadow-md rounded text-sm border-2 border-green-500 font-mono">
            E - Save as Elevation (stays active)
          </kbd>
          <kbd className="px-3 py-2 bg-white shadow-md rounded text-sm border-2 border-gray-300 font-mono">
            B - Bathroom
          </kbd>
          <kbd className="px-3 py-2 bg-white shadow-md rounded text-sm border-2 border-gray-300 font-mono">
            D - Door
          </kbd>
          <kbd className="px-3 py-2 bg-white shadow-md rounded text-sm border-2 border-gray-300 font-mono">
            K - Kitchen
          </kbd>
        </div>
      )}

      {/* Screenshot navigation arrows (top-left) */}
      {screenshotNavigation && (
        <div className="absolute top-3 left-3 z-50 flex items-center gap-1.5 pointer-events-auto max-w-[500px]">
          <button
            onClick={screenshotNavigation.onPrev}
            disabled={!screenshotNavigation.canGoPrev}
            className="flex items-center justify-center p-1.5 text-gray-700 bg-white border-2 border-gray-300 rounded-md shadow-lg hover:bg-gray-50 hover:border-blue-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300"
            title="Show previous relevant area of drawing"
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <div className="flex flex-col items-center px-4 py-2 text-xs bg-white border-2 border-blue-500 rounded-lg shadow-lg">
            <div className="font-semibold text-blue-600 mb-0.5">
              <span className="text-blue-600">{screenshotNavigation.current}</span>
              <span className="text-gray-400 mx-1">/</span>
              <span className="text-gray-600">{screenshotNavigation.total}</span>
            </div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">
              Relevant Drawings
            </div>
          </div>
          <button
            onClick={screenshotNavigation.onNext}
            disabled={!screenshotNavigation.canGoNext}
            className="flex items-center justify-center p-1.5 text-gray-700 bg-white border-2 border-gray-300 rounded-md shadow-lg hover:bg-gray-50 hover:border-blue-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300"
            title="Show next relevant area of drawing"
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      )}

      <div className="absolute top-3 right-3 z-50 flex items-center gap-2 pointer-events-auto">
        <button
          aria-label="Zoom out"
          className="btn-icon bg-white shadow-md"
          onClick={() => zoom('out')}
        >
          −
        </button>
        <div className="px-2 py-2 text-sm bg-white border rounded shadow-md">{zoomPct}%</div>
        <button
          aria-label="Zoom in"
          className="btn-icon bg-white shadow-md"
          onClick={() => zoom('in')}
        >
          +
        </button>
        <div className="flex items-center gap-1 bg-white border rounded shadow-md px-2 py-1">
          <span className="text-xs text-gray-600 whitespace-nowrap">Detail:</span>
          <button
            aria-label="Decrease resolution"
            className="btn-icon bg-white text-xs px-1.5 py-0.5"
            onClick={() => updateRenderScale(Math.max(2, renderScale - 0.5))}
            disabled={savingScale || renderScale <= 2}
          >
            −
          </button>
          <span className="text-xs font-medium w-8 text-center">{renderScale.toFixed(1)}x</span>
          <button
            aria-label="Increase resolution"
            className="btn-icon bg-white text-xs px-1.5 py-0.5"
            onClick={() => updateRenderScale(Math.min(8, renderScale + 0.5))}
            disabled={savingScale || renderScale >= 8}
          >
            +
          </button>
        </div>
        {layerList.length > 0 && (
          <button
            aria-pressed={showLayerPanel}
            aria-label="Toggle layers panel"
            className={`btn-icon shadow-md ${showLayerPanel ? 'bg-blue-600 text-white' : 'bg-white'}`}
            onClick={() => setShowLayerPanel(!showLayerPanel)}
            title="Layers"
          >
            ☰
          </button>
        )}
        {!readOnly && (
          <>
            <button
              aria-pressed={showScreenshotIndicators}
              aria-label="Toggle captured area indicators"
              title="Show/hide previously captured areas"
              className={`btn-icon shadow-md ${showScreenshotIndicators ? 'bg-blue-600 text-white' : 'bg-white'}`}
              onClick={() => setShowScreenshotIndicators(!showScreenshotIndicators)}
            >
              📦
            </button>
            <button
              aria-pressed={state.mode.type === 'screenshot'}
              aria-label="Toggle screenshot mode (S)"
              title="Capture a portion of the plan"
              className={`btn-icon shadow-md ${state.mode.type === 'screenshot' ? 'bg-blue-600 text-white' : 'bg-white'}`}
              onClick={() =>
                dispatch({
                  type: 'SET_MODE',
                  payload: state.mode.type === 'screenshot' ? 'idle' : 'screenshot',
                })
              }
            >
              📸
            </button>
            {state.mode.type === 'screenshot' && state.mode.selection && (
              <button className="btn-secondary shadow-md" onClick={() => capture('current')}>
                Save to Current
              </button>
            )}
            <button
              aria-pressed={state.mode.type === 'measure'}
              aria-label="Toggle measurement mode (M)"
              title="Measure distances on the plan"
              className={`btn-icon shadow-md ${state.mode.type === 'measure' ? 'bg-green-600 text-white' : 'bg-white'}`}
              onClick={() =>
                dispatch({
                  type: 'SET_MODE',
                  payload: state.mode.type === 'measure' ? 'idle' : 'measure',
                })
              }
            >
              📏
            </button>
            <button
              aria-label="Set drawing scale (L)"
              title="Set drawing scale"
              className="btn-icon shadow-md bg-white"
              onClick={() => setShowCalibrationModal(true)}
            >
              🔧
            </button>
          </>
        )}
      </div>

      {showLayerPanel && layerList.length > 0 && (
        <div className="absolute top-16 right-3 z-50 bg-white border rounded shadow-lg p-3 w-64 pointer-events-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">PDF Layers</h3>
            <button
              className="text-xs text-gray-500 hover:text-gray-700"
              onClick={() => setShowLayerPanel(false)}
            >
              ✕
            </button>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {layerList.map((layer: any) => (
              <label
                key={layer.id}
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
              >
                <input
                  type="checkbox"
                  checked={layer.visible}
                  onChange={() => toggleLayer(layer.id)}
                  className="w-4 h-4"
                />
                <span className="text-sm">{layer.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div
        className={`absolute inset-0 overflow-hidden ${
          state.mode.type !== 'idle' || isDrawingCalibrationLine
            ? 'cursor-crosshair'
            : 'cursor-default'
        }`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          if (state.mode.type === 'idle' && !isDrawingCalibrationLine)
            dispatch({ type: 'END_DRAG' });
        }}
        onContextMenu={e => e.preventDefault()}
        style={{ clipPath: 'inset(0)' }}
      >
        <div
          style={{
            transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
            transformOrigin: '0 0',
            willChange: 'transform',
            position: 'absolute',
            left: 0,
            top: 0,
            transition: smoothTransition
              ? 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
              : 'none',
          }}
        >
          <div ref={pageContainerRef} style={{ position: 'relative' }}>
            <canvas ref={canvasRef} />
            {/* Selection boxes for screenshot and idle (measurement selection) modes */}
            {(state.mode.type === 'screenshot' || state.mode.type === 'idle') &&
              state.mode.selection && (
                <div
                  className="pointer-events-none"
                  style={{
                    position: 'absolute',
                    left: Math.min(state.mode.selection.startX, state.mode.selection.endX),
                    top: Math.min(state.mode.selection.startY, state.mode.selection.endY),
                    width: Math.abs(state.mode.selection.endX - state.mode.selection.startX),
                    height: Math.abs(state.mode.selection.endY - state.mode.selection.startY),
                    border:
                      state.mode.type === 'idle'
                        ? '2px dashed rgba(59, 130, 246, 0.8)' // Blue dashed for selection
                        : '2px solid rgba(37, 99, 235, 0.8)', // Blue solid for screenshot
                    backgroundColor:
                      state.mode.type === 'idle'
                        ? 'rgba(59, 130, 246, 0.05)' // Lighter blue for selection
                        : 'rgba(37, 99, 235, 0.1)', // Darker blue for screenshot
                    zIndex: 40,
                  }}
                />
              )}

            {/* Screenshot area indicators (show previously captured areas) */}
            {!readOnly &&
              showScreenshotIndicators &&
              screenshotIndicators.map(screenshot => (
                <ScreenshotIndicatorOverlay
                  key={screenshot.id}
                  bounds={screenshot.crop_coordinates}
                />
              ))}

            {/* Violation markers for report view */}
            {readOnly &&
              violationGroups.map((group, groupIdx) => {
                // Check if any violation in this group is highlighted
                // Use ::: as delimiter since both IDs are UUIDs that contain dashes
                const isHighlighted = highlightedViolationId
                  ? group.violations.some(v => {
                      const highlightedId = `${v.checkId}:::${v.screenshotId}`;
                      return highlightedId === highlightedViolationId;
                    })
                  : false;

                return (
                  <ViolationBoundingBox
                    key={group.key}
                    violations={group.violations}
                    onClick={onMarkerClick || NOOP}
                    isVisible={true}
                    isHighlighted={isHighlighted}
                    fanOutIndex={groupIdx}
                    totalInGroup={group.violations.length}
                  />
                );
              })}

            {/* Text search highlights */}
            {textSearch.isOpen &&
              textSearch.matches
                .filter(match => match.pageNumber === state.pageNumber)
                .map((match, idx) => {
                  // Find global index of this match
                  const globalIdx = textSearch.matches.indexOf(match);
                  const isCurrent = globalIdx === textSearch.currentIndex;

                  return (
                    <TextHighlight
                      key={`search-${match.pageNumber}-${idx}`}
                      bounds={match.bounds}
                      isCurrent={isCurrent}
                    />
                  );
                })}
          </div>
        </div>
      </div>

      {/* Measurement overlay - outside scaled container for crisp rendering */}
      {!readOnly && (
        <MeasurementOverlay
          measurements={measurements}
          selectedMeasurementId={selectedMeasurementId}
          onMeasurementClick={setSelectedMeasurementId}
          zoom={transform.scale}
          translateX={transform.tx}
          translateY={transform.ty}
          calibrationLine={
            calibration && calibration.calibration_line_start && calibration.calibration_line_end
              ? {
                  start_point: calibration.calibration_line_start,
                  end_point: calibration.calibration_line_end,
                }
              : null
          }
        />
      )}

      {/* Measurement mode line preview - sibling to MeasurementOverlay */}
      {state.mode.type !== 'idle' &&
        (state.mode.type === 'measure' || isDrawingCalibrationLine) &&
        state.mode.selection &&
        (() => {
          // Convert PDF coords to screen coords
          const toScreen = (pdfX: number, pdfY: number) => ({
            x: pdfX * transform.scale + transform.tx,
            y: pdfY * transform.scale + transform.ty,
          });

          const start = toScreen(state.mode.selection.startX, state.mode.selection.startY);
          const end = toScreen(state.mode.selection.endX, state.mode.selection.endY);

          // Calculate angle for arrow
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const angle = Math.atan2(dy, dx);

          // Fixed sizes (no scaling with zoom)
          const arrowSize = 8;
          const strokeWidth = 3;

          // Arrow points
          const arrowPoints = (x: number, y: number, reverse: boolean) => {
            const dir = reverse ? -1 : 1;
            return [
              [x, y],
              [
                x - dir * arrowSize * Math.cos(angle - Math.PI / 6),
                y - dir * arrowSize * Math.sin(angle - Math.PI / 6),
              ],
              [
                x - dir * arrowSize * Math.cos(angle + Math.PI / 6),
                y - dir * arrowSize * Math.sin(angle + Math.PI / 6),
              ],
            ]
              .map(([px, py]) => `${px},${py}`)
              .join(' ');
          };

          return (
            <svg
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 40,
              }}
            >
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={isDrawingCalibrationLine ? '#9333EA' : '#10B981'}
                strokeWidth={strokeWidth}
                opacity={0.8}
                strokeLinecap="round"
              />

              <polygon
                points={arrowPoints(start.x, start.y, true)}
                fill={isDrawingCalibrationLine ? '#9333EA' : '#10B981'}
                opacity={0.8}
              />

              <polygon
                points={arrowPoints(end.x, end.y, false)}
                fill={isDrawingCalibrationLine ? '#9333EA' : '#10B981'}
                opacity={0.8}
              />

              <circle
                cx={start.x}
                cy={start.y}
                r={strokeWidth}
                fill={isDrawingCalibrationLine ? '#9333EA' : '#10B981'}
                opacity={0.8}
              />
              <circle
                cx={end.x}
                cy={end.y}
                r={strokeWidth}
                fill={isDrawingCalibrationLine ? '#9333EA' : '#10B981'}
                opacity={0.8}
              />
            </svg>
          );
        })()}

      <div className="absolute bottom-3 left-3 z-50 flex items-center gap-3 bg-white rounded px-3 py-2 border shadow-md pointer-events-auto">
        <button
          className="btn-icon bg-white"
          onClick={() => dispatch({ type: 'SET_PAGE', payload: Math.max(1, state.pageNumber - 1) })}
          aria-label="Previous page"
        >
          ◀
        </button>
        <div className="text-sm font-medium">
          Page {state.pageNumber} / {state.numPages || '…'}
        </div>
        <button
          className="btn-icon bg-white"
          onClick={() =>
            dispatch({
              type: 'SET_PAGE',
              payload: Math.min(state.numPages || state.pageNumber, state.pageNumber + 1),
            })
          }
          aria-label="Next page"
        >
          ▶
        </button>
        <span className="text-xs text-gray-600 ml-2 hidden sm:inline">
          Shortcuts: ←/→, -/+, 0, S, M, L, Esc{projectId && ', F'}
        </span>
      </div>

      {/* PDF text search overlay */}
      <PDFSearchOverlay
        isOpen={textSearch.isOpen}
        query={textSearch.query}
        onQueryChange={textSearch.setQuery}
        currentIndex={textSearch.currentIndex}
        totalMatches={textSearch.totalMatches}
        isSearching={textSearch.isSearching}
        searchMethod={textSearch.searchMethod}
        onNext={textSearch.goToNext}
        onPrev={textSearch.goToPrev}
        onClose={textSearch.close}
      />

      {showElevationPrompt && (
        <ElevationCapturePrompt onSave={handleElevationSave} onCancel={handleElevationCancel} />
      )}

      {showCalibrationModal && page && (
        <CalibrationModal
          currentScale={calibration?.scale_notation}
          currentPrintSize={
            calibration?.print_width_inches && calibration?.print_height_inches
              ? {
                  width: calibration.print_width_inches,
                  height: calibration.print_height_inches,
                }
              : undefined
          }
          pdfDimensions={
            page
              ? {
                  width: page.getViewport({ scale: 1 }).width,
                  height: page.getViewport({ scale: 1 }).height,
                }
              : undefined
          }
          projectId={projectId}
          onSave={saveCalibration}
          onSaveKnownLength={saveCalibrationKnownLength}
          onCancel={() => {
            setShowCalibrationModal(false);
            setCalibrationLine(null);
            setIsDrawingCalibrationLine(false);
          }}
          onRequestLineDraw={handleRequestLineDraw}
          calibrationLine={calibrationLine}
        />
      )}
    </div>
  );
}
