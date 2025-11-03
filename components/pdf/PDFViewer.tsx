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
import { usePdfLayers } from '@/hooks/usePdfLayers';
import { usePdfRender } from '@/hooks/usePdfRender';
import { useMeasurements } from '@/hooks/useMeasurements';
import { useScreenshotCapture } from '@/hooks/useScreenshotCapture';
import { LayerPanel } from './LayerPanel';

// Use the unpkg CDN which is more reliable for Vercel deployments
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const TRANSFORM_SAVE_DEBOUNCE_MS = 500;

// Stable empty function to avoid creating new functions on every render
const NOOP = () => {};

// In-memory cache for presigned URLs (valid for 50 minutes to be safe)
const PRESIGN_CACHE = new Map<string, { url: string; expiresAt: number }>();
const CACHE_DURATION_MS = 50 * 60 * 1000; // 50 minutes

// In-flight request deduplication
const PRESIGN_INFLIGHT = new Map<string, Promise<string>>();

interface ViewerState {
  transform: { tx: number; ty: number; scale: number };
  pageNumber: number;
  numPages: number;
  isDragging: boolean;
  screenshotMode: boolean;
  measurementMode: boolean;
  calibrationMode: boolean;
  isSelecting: boolean;
  selection: { startX: number; startY: number; endX: number; endY: number } | null;
}

type ViewerAction =
  | { type: 'SET_TRANSFORM'; payload: ViewerState['transform'] }
  | { type: 'SET_PAGE'; payload: number }
  | { type: 'SET_NUM_PAGES'; payload: number }
  | { type: 'START_DRAG' }
  | { type: 'END_DRAG' }
  | { type: 'TOGGLE_SCREENSHOT_MODE' }
  | { type: 'TOGGLE_MEASUREMENT_MODE' }
  | { type: 'TOGGLE_CALIBRATION_MODE' }
  | { type: 'START_SELECTION'; payload: { x: number; y: number } }
  | { type: 'UPDATE_SELECTION'; payload: { x: number; y: number } }
  | { type: 'END_SELECTION' }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'RESET_ZOOM' };

function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case 'SET_TRANSFORM':
      return { ...state, transform: action.payload };
    case 'SET_PAGE':
      return {
        ...state,
        pageNumber: action.payload,
        selection: null,
        screenshotMode: false,
        measurementMode: false,
        calibrationMode: false,
      };
    case 'SET_NUM_PAGES':
      return { ...state, numPages: action.payload };
    case 'START_DRAG':
      return { ...state, isDragging: true };
    case 'END_DRAG':
      return { ...state, isDragging: false };
    case 'TOGGLE_SCREENSHOT_MODE':
      return {
        ...state,
        screenshotMode: !state.screenshotMode,
        measurementMode: false,
        calibrationMode: false,
        selection: null,
      };
    case 'TOGGLE_MEASUREMENT_MODE':
      return {
        ...state,
        measurementMode: !state.measurementMode,
        screenshotMode: false,
        calibrationMode: false,
        selection: null,
      };
    case 'TOGGLE_CALIBRATION_MODE':
      // Don't toggle calibration mode - it's handled by modal now
      return state;
    case 'START_SELECTION':
      return {
        ...state,
        isSelecting: true,
        selection: {
          startX: action.payload.x,
          startY: action.payload.y,
          endX: action.payload.x,
          endY: action.payload.y,
        },
      };
    case 'UPDATE_SELECTION':
      return state.selection
        ? {
            ...state,
            selection: { ...state.selection, endX: action.payload.x, endY: action.payload.y },
          }
        : state;
    case 'END_SELECTION':
      return { ...state, isSelecting: false };
    case 'CLEAR_SELECTION':
      return {
        ...state,
        selection: null,
        screenshotMode: false,
        measurementMode: false,
        calibrationMode: false,
      };
    case 'RESET_ZOOM':
      return { ...state, transform: { tx: 0, ty: 0, scale: 1 } };
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
}) {
  const assessmentId = propAssessmentId || activeCheck?.assessment_id;

  const viewportRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const transformSaveTimer = useRef<number | null>(null);

  const getSaved = useCallback(
    <T,>(key: string, fallback: T, parser: (s: string) => T) => {
      if (typeof window === 'undefined' || !assessmentId) return fallback;
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      try {
        return parser(raw);
      } catch {
        return fallback;
      }
    },
    [assessmentId]
  );

  // Initial state from storage with validation
  const savedTransform = getSaved(`pdf-transform-${assessmentId}`, { tx: 0, ty: 0, scale: 1 }, s =>
    JSON.parse(s)
  );

  // Viewport is now always at 1x (renderScale only affects canvas quality)
  // Old saved transforms from when viewport scaled to 6-10x are invalid
  // Valid scale should be 0.5-2.0 for reasonable zoom levels
  const validatedTransform =
    savedTransform.scale < 0.5 || savedTransform.scale > 2.0
      ? { tx: 0, ty: 0, scale: 1 }
      : savedTransform;

  const [state, dispatch] = useReducer(viewerReducer, {
    transform: validatedTransform,
    pageNumber: getSaved(`pdf-page-${assessmentId}`, 1, s => parseInt(s, 10) || 1),
    numPages: 0,
    isDragging: false,
    screenshotMode: false,
    measurementMode: false,
    calibrationMode: false,
    isSelecting: false,
    selection: null,
  });

  // Keep a ref to the current state to avoid stale closures in keyboard handler
  const stateRef = useRef(state);
  stateRef.current = state;

  // Core PDF state
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [page, setPage] = useState<any>(null);

  // UI state
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [renderScale, setRenderScale] = useState(4);
  const [savingScale, setSavingScale] = useState(false);
  const [smoothTransition, setSmoothTransition] = useState(false);
  const [showElevationPrompt, setShowElevationPrompt] = useState(false);
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);

  // Screenshot indicators state
  const [showScreenshotIndicators, setShowScreenshotIndicators] = useState(() => {
    if (typeof window === 'undefined' || !assessmentId || readOnly) return false;
    const saved = localStorage.getItem(`pdf-show-indicators-${assessmentId}`);
    return saved === null ? true : saved === 'true'; // Default to true
  });

  // Fetch assessment screenshots for indicators
  const { screenshots: screenshotIndicators, refresh: refreshScreenshots } =
    useAssessmentScreenshots(readOnly ? undefined : assessmentId, state.pageNumber);

  // Text search hook
  const handleSearchPageChange = useCallback((page: number) => {
    dispatch({ type: 'SET_PAGE', payload: page });
  }, []);
  const textSearch = useTextSearch({
    projectId: projectId || '',
    pdfDoc,
    onPageChange: handleSearchPageChange,
  });

  // Memoize violation groups to avoid recalculating on every render
  const violationGroups = useMemo(() => {
    if (!readOnly || violationMarkers.length === 0) return [];

    // Expand violations to create separate markers for each screenshot
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

  // Store latest onPageChange callback in a ref to avoid unnecessary re-renders
  const onPageChangeRef = useRef(onPageChange);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  // External page control → internal
  const prevExternalPageRef = useRef(externalCurrentPage);
  useEffect(() => {
    if (externalCurrentPage && externalCurrentPage !== prevExternalPageRef.current) {
      prevExternalPageRef.current = externalCurrentPage;
      if (externalCurrentPage !== state.pageNumber) {
        dispatch({ type: 'SET_PAGE', payload: externalCurrentPage });
      }
    }
  }, [externalCurrentPage, state.pageNumber]);

  // Notify parent + persist page number
  useEffect(() => {
    onPageChangeRef.current?.(state.pageNumber);
    if (assessmentId && typeof window !== 'undefined') {
      localStorage.setItem(`pdf-page-${assessmentId}`, String(state.pageNumber));
    }
  }, [state.pageNumber, assessmentId]);

  // Debounced transform persistence
  useEffect(() => {
    if (!assessmentId || typeof window === 'undefined') return;
    if (transformSaveTimer.current) {
      window.clearTimeout(transformSaveTimer.current);
    }
    transformSaveTimer.current = window.setTimeout(() => {
      localStorage.setItem(`pdf-transform-${assessmentId}`, JSON.stringify(state.transform));
      transformSaveTimer.current = null;
    }, TRANSFORM_SAVE_DEBOUNCE_MS);
    return () => {
      if (transformSaveTimer.current) {
        window.clearTimeout(transformSaveTimer.current);
        transformSaveTimer.current = null;
      }
    };
  }, [state.transform, assessmentId]);

  // Persist screenshot indicators toggle
  useEffect(() => {
    if (!assessmentId || typeof window === 'undefined' || readOnly) return;
    localStorage.setItem(`pdf-show-indicators-${assessmentId}`, String(showScreenshotIndicators));
  }, [showScreenshotIndicators, assessmentId, readOnly]);

  // Fetch presigned URL and saved render scale
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingUrl(true);
      try {
        const cached = PRESIGN_CACHE.get(pdfUrl);
        if (cached && cached.expiresAt > Date.now()) {
          if (!cancelled) setPresignedUrl(cached.url);
          if (!cancelled) setLoadingUrl(false);
          return;
        }

        let inflightPromise = PRESIGN_INFLIGHT.get(pdfUrl);
        if (!inflightPromise) {
          inflightPromise = (async () => {
            const presign = await fetch('/api/pdf/presign', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pdfUrl }),
            });
            if (!presign.ok) throw new Error(`presign ${presign.status}`);
            const { url } = await presign.json();

            PRESIGN_CACHE.set(pdfUrl, {
              url,
              expiresAt: Date.now() + CACHE_DURATION_MS,
            });

            PRESIGN_INFLIGHT.delete(pdfUrl);
            return url;
          })();

          PRESIGN_INFLIGHT.set(pdfUrl, inflightPromise);
        }

        const url = await inflightPromise;
        if (!cancelled) setPresignedUrl(url);
      } catch {
        if (!cancelled) setPresignedUrl(null);
        PRESIGN_INFLIGHT.delete(pdfUrl);
      } finally {
        if (!cancelled) setLoadingUrl(false);
      }

      if (!assessmentId || readOnly) return;
      try {
        const res = await fetch(`/api/assessments/${assessmentId}/pdf-scale`);
        if (res.ok) {
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
  }, [pdfUrl, assessmentId, readOnly]);

  // Load PDF document via pdfjs directly
  useEffect(() => {
    if (!presignedUrl) return;
    let cancelled = false;
    (async () => {
      const loadingTask = pdfjs.getDocument({
        url: presignedUrl,
        disableAutoFetch: false,
        disableStream: false,
        disableRange: false,
      });

      try {
        const doc = await loadingTask.promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setPage(null);
        dispatch({ type: 'SET_NUM_PAGES', payload: doc.numPages });
      } catch (error) {
        console.error('[PDFViewer] Failed to load PDF:', error);
        if (!cancelled) setPdfDoc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presignedUrl]);

  // Track current page number to avoid redundant loads
  const currentPageNumRef = useRef<number | null>(null);

  // Reset page tracking when PDF document changes
  useEffect(() => {
    currentPageNumRef.current = null;
  }, [pdfDoc]);

  // Load current page proxy
  useEffect(() => {
    if (!pdfDoc) return;

    if (currentPageNumRef.current === state.pageNumber) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const p = await pdfDoc.getPage(state.pageNumber);
        if (cancelled) return;
        currentPageNumRef.current = state.pageNumber;
        setPage(p);
      } catch {
        if (!cancelled) setPage(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, state.pageNumber]);

  // Center the page initially when it first loads
  const pageCenteredRef = useRef<number | null>(null);
  useEffect(() => {
    if (!page || !viewportRef.current) return;

    if (pageCenteredRef.current === state.pageNumber) return;

    const viewport = page.getViewport({ scale: 1 });
    const container = viewportRef.current;

    const centeredTx = (container.clientWidth - viewport.width) / 2;
    const centeredTy = (container.clientHeight - viewport.height) / 2;

    const isOffScreen =
      state.transform.tx < -viewport.width ||
      state.transform.tx > container.clientWidth ||
      state.transform.ty < -viewport.height ||
      state.transform.ty > container.clientHeight;

    const isInitialLoad =
      state.transform.tx === 0 && state.transform.ty === 0 && state.transform.scale === 1;

    if (isInitialLoad || isOffScreen) {
      dispatch({
        type: 'SET_TRANSFORM',
        payload: { tx: centeredTx, ty: centeredTy, scale: 1 },
      });
      pageCenteredRef.current = state.pageNumber;
    }
  }, [page, state.pageNumber]);

  // Layers + rendering hooks
  const { ocConfig, layers, layersVersion, toggleLayer } = usePdfLayers(pdfDoc, assessmentId, disableLayers);
  const { renderPage, getSafeRenderMultiplier } = usePdfRender(
    page,
    canvasRef,
    ocConfig,
    layers,
    disableLayers,
    renderScale
  );

  // Kick renders when inputs change
  useEffect(() => {
    if (page) renderPage();
  }, [page, renderScale, layersVersion, renderPage]);

  // Measurements hook
  const {
    measurements,
    calibration,
    selectedMeasurementId,
    setSelectedMeasurementId,
    saveMeasurement,
    deleteMeasurement,
    saveCalibration,
  } = useMeasurements(projectId, state.pageNumber, readOnly, page, canvasRef);

  // Screenshot capture hook
  const { capture: captureSelection } = useScreenshotCapture({
    page,
    canvasRef,
    ocConfig,
    renderScale,
    getSafeRenderMultiplier,
    assessmentId,
    activeCheck,
    onCheckAdded,
    onCheckSelect,
    onScreenshotSaved,
    refreshScreenshots,
  });

  // Wheel zoom centred at pointer
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (state.screenshotMode) return;
      e.preventDefault();
      const prev = state.transform;
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * (1 - e.deltaY * 0.003)));

      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const cx = (sx - prev.tx) / prev.scale;
      const cy = (sy - prev.ty) / prev.scale;

      const tx = sx - cx * next;
      const ty = sy - cy * next;
      dispatch({ type: 'SET_TRANSFORM', payload: { tx, ty, scale: next } });
    };
    el.addEventListener('wheel', onWheel, { passive: false });

    const cancel = (ev: Event) => ev.preventDefault();
    el.addEventListener('gesturestart', cancel as EventListener, { passive: false });
    el.addEventListener('gesturechange', cancel as EventListener, { passive: false });
    el.addEventListener('gestureend', cancel as EventListener, { passive: false });

    return () => {
      el.removeEventListener('wheel', onWheel as EventListener);
      el.removeEventListener('gesturestart', cancel as EventListener);
      el.removeEventListener('gesturechange', cancel as EventListener);
      el.removeEventListener('gestureend', cancel as EventListener);
    };
  }, [state.screenshotMode, state.transform]);

  // Toolbar zoom buttons
  const zoom = useCallback(
    (dir: 'in' | 'out') => {
      const factor = dir === 'in' ? 1.2 : 1 / 1.2;
      const prev = state.transform;
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor));
      const el = viewportRef.current;
      if (!el) {
        dispatch({ type: 'SET_TRANSFORM', payload: { ...prev, scale: next } });
        return;
      }
      const rect = el.getBoundingClientRect();
      const sx = rect.width / 2;
      const sy = rect.height / 2;
      const cx = (sx - prev.tx) / prev.scale;
      const cy = (sy - prev.ty) / prev.scale;
      const tx = sx - cx * next;
      const ty = sy - cy * next;
      dispatch({ type: 'SET_TRANSFORM', payload: { tx, ty, scale: next } });
    },
    [state.transform]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onKey = (e: KeyboardEvent) => {
      const currentState = stateRef.current;

      if (showElevationPrompt) return;
      if (textSearch.isOpen) return;
      if (showCalibrationModal) return;

      if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.repeat && projectId) {
        e.preventDefault();
        textSearch.open();
        return;
      }

      if (e.key === 'Delete' && selectedMeasurementId && !e.repeat) {
        e.preventDefault();
        deleteMeasurement(selectedMeasurementId);
        return;
      }

      if (currentState.screenshotMode && !e.repeat) {
        const k = e.key.toLowerCase();
        if (currentState.selection) {
          if (k === 'c') {
            e.preventDefault();
            captureSelection(
              currentState.selection,
              currentState.pageNumber,
              currentState.transform.scale,
              'current',
              'plan'
            );
            dispatch({ type: 'CLEAR_SELECTION' });
            return;
          }
          if (k === 'e') {
            e.preventDefault();
            setShowElevationPrompt(true);
            return;
          }
          if (k === 'b') {
            e.preventDefault();
            captureSelection(
              currentState.selection,
              currentState.pageNumber,
              currentState.transform.scale,
              'bathroom',
              'plan'
            );
            dispatch({ type: 'CLEAR_SELECTION' });
            return;
          }
          if (k === 'd') {
            e.preventDefault();
            captureSelection(
              currentState.selection,
              currentState.pageNumber,
              currentState.transform.scale,
              'door',
              'plan'
            );
            dispatch({ type: 'CLEAR_SELECTION' });
            return;
          }
          if (k === 'k') {
            e.preventDefault();
            captureSelection(
              currentState.selection,
              currentState.pageNumber,
              currentState.transform.scale,
              'kitchen',
              'plan'
            );
            dispatch({ type: 'CLEAR_SELECTION' });
            return;
          }
        }
      }

      if (e.key === 'ArrowLeft')
        dispatch({ type: 'SET_PAGE', payload: Math.max(1, currentState.pageNumber - 1) });
      if (e.key === 'ArrowRight')
        dispatch({
          type: 'SET_PAGE',
          payload: Math.min(
            currentState.numPages || currentState.pageNumber,
            currentState.pageNumber + 1
          ),
        });
      if (e.key === '-' || e.key === '_') zoom('out');
      if (e.key === '=' || e.key === '+') zoom('in');
      if (e.key === '0') dispatch({ type: 'RESET_ZOOM' });
      if (!readOnly && e.key.toLowerCase() === 's' && !e.repeat)
        dispatch({ type: 'TOGGLE_SCREENSHOT_MODE' });
      if (!readOnly && e.key.toLowerCase() === 'm' && !e.repeat)
        dispatch({ type: 'TOGGLE_MEASUREMENT_MODE' });
      if (!readOnly && e.key.toLowerCase() === 'l' && !e.repeat) {
        e.preventDefault();
        setShowCalibrationModal(true);
      }
      if (!readOnly && e.key === 'Escape') {
        if (currentState.screenshotMode) dispatch({ type: 'TOGGLE_SCREENSHOT_MODE' });
        if (currentState.measurementMode) dispatch({ type: 'TOGGLE_MEASUREMENT_MODE' });
      }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
    };
  }, [
    state.screenshotMode,
    state.measurementMode,
    state.calibrationMode,
    state.numPages,
    state.pageNumber,
    readOnly,
    zoom,
    showElevationPrompt,
    showCalibrationModal,
    textSearch,
    projectId,
    selectedMeasurementId,
    deleteMeasurement,
    captureSelection,
  ]);

  // Mouse handlers for pan / selection
  const screenToContent = useCallback(
    (clientX: number, clientY: number) => {
      if (!viewportRef.current) return { x: 0, y: 0 };
      const r = viewportRef.current.getBoundingClientRect();
      const x = (clientX - r.left - state.transform.tx) / state.transform.scale;
      const y = (clientY - r.top - state.transform.ty) / state.transform.scale;
      return { x, y };
    },
    [state.transform]
  );

  const onMouseDown = (e: React.MouseEvent) => {
    if ((state.screenshotMode || state.measurementMode) && !readOnly) {
      e.preventDefault();
      e.stopPropagation();
      const { x, y } = screenToContent(e.clientX, e.clientY);
      dispatch({ type: 'START_SELECTION', payload: { x, y } });
      return;
    }
    if (e.button !== 0) return;
    dispatch({ type: 'START_DRAG' });
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: state.transform.tx,
      ty: state.transform.ty,
    };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (state.screenshotMode || state.measurementMode) {
      if (state.isSelecting && state.selection) {
        e.preventDefault();
        e.stopPropagation();
        const { x, y } = screenToContent(e.clientX, e.clientY);
        dispatch({ type: 'UPDATE_SELECTION', payload: { x, y } });
      }
      return;
    }
    if (!state.isDragging) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dispatch({
      type: 'SET_TRANSFORM',
      payload: { ...state.transform, tx: dragRef.current.tx + dx, ty: dragRef.current.ty + dy },
    });
  };

  const onMouseUp = () => {
    if (state.screenshotMode && state.selection) {
      dispatch({ type: 'END_SELECTION' });
    } else if (state.measurementMode && state.selection) {
      dispatch({ type: 'END_SELECTION' });
      saveMeasurement(state.selection);
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

  if (!pdfDoc || !page) {
    return <BlueprintLoader />;
  }

  const zoomPct = Math.round(state.transform.scale * 100);

  return (
    <div
      ref={viewportRef}
      tabIndex={0}
      role="region"
      aria-label="PDF viewer"
      className="relative h-full w-full outline-none overscroll-contain"
      style={{ touchAction: 'none' }}
    >
      {state.screenshotMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-blue-600 text-white px-4 py-2 rounded shadow-lg text-sm font-medium">
            📸 Screenshot Mode: Click and drag to select area
          </div>
        </div>
      )}

      {state.measurementMode && (
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

      {!state.measurementMode && selectedMeasurementId && measurements.length > 0 && !readOnly && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-blue-600 text-white px-4 py-2 rounded shadow-lg text-sm font-medium">
            Measurement selected • Press{' '}
            <kbd className="px-1.5 py-0.5 bg-blue-700 rounded mx-1 font-mono text-xs">Delete</kbd>{' '}
            to remove
          </div>
        </div>
      )}

      {state.screenshotMode && state.selection && (
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

      {screenshotNavigation && (
        <div className="absolute top-3 left-3 z-50 flex items-center gap-1.5 pointer-events-auto max-w-[500px]">
          <button
            onClick={screenshotNavigation.onPrev}
            disabled={!screenshotNavigation.canGoPrev}
            className="flex items-center justify-center p-1.5 text-gray-700 bg-white border-2 border-gray-300 rounded-md shadow-lg hover:bg-gray-50 hover:border-blue-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300"
            title="Show previous relevant area of drawing"
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex flex-col items-center px-4 py-2 text-xs bg-white border-2 border-blue-500 rounded-lg shadow-lg">
            <div className="font-semibold text-blue-600 mb-0.5">
              <span className="text-blue-600">{screenshotNavigation.current}</span>
              <span className="text-gray-400 mx-1">/</span>
              <span className="text-gray-600">{screenshotNavigation.total}</span>
            </div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">Relevant Drawings</div>
          </div>
          <button
            onClick={screenshotNavigation.onNext}
            disabled={!screenshotNavigation.canGoNext}
            className="flex items-center justify-center p-1.5 text-gray-700 bg-white border-2 border-gray-300 rounded-md shadow-lg hover:bg-gray-50 hover:border-blue-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300"
            title="Show next relevant area of drawing"
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      <div className="absolute top-3 right-3 z-50 flex items-center gap-2 pointer-events-auto">
        <button aria-label="Zoom out" className="btn-icon bg-white shadow-md" onClick={() => zoom('out')}>−</button>
        <div className="px-2 py-2 text-sm bg-white border rounded shadow-md">{zoomPct}%</div>
        <button aria-label="Zoom in" className="btn-icon bg-white shadow-md" onClick={() => zoom('in')}>+</button>
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
        {layers.length > 0 && (
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
              aria-pressed={state.screenshotMode}
              aria-label="Toggle screenshot mode (S)"
              title="Capture a portion of the plan"
              className={`btn-icon shadow-md ${state.screenshotMode ? 'bg-blue-600 text-white' : 'bg-white'}`}
              onClick={() => dispatch({ type: 'TOGGLE_SCREENSHOT_MODE' })}
            >
              📸
            </button>
            {state.screenshotMode && state.selection && (
              <button
                className="btn-secondary shadow-md"
                onClick={() => {
                  captureSelection(
                    state.selection,
                    state.pageNumber,
                    state.transform.scale,
                    'current',
                    'plan'
                  );
                  dispatch({ type: 'CLEAR_SELECTION' });
                }}
              >
                Save to Current
              </button>
            )}
            <button
              aria-pressed={state.measurementMode}
              aria-label="Toggle measurement mode (M)"
              title="Measure distances on the plan"
              className={`btn-icon shadow-md ${state.measurementMode ? 'bg-green-600 text-white' : 'bg-white'}`}
              onClick={() => dispatch({ type: 'TOGGLE_MEASUREMENT_MODE' })}
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

      {showLayerPanel && layers.length > 0 && (
        <LayerPanel layers={layers} onToggle={toggleLayer} onClose={() => setShowLayerPanel(false)} />
      )}

      <div
        className={`absolute inset-0 overflow-hidden ${
          state.screenshotMode || state.measurementMode
            ? 'cursor-crosshair'
            : state.isDragging
              ? 'cursor-grabbing'
              : 'cursor-grab'
        }`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          if (!state.screenshotMode && !state.measurementMode) dispatch({ type: 'END_DRAG' });
        }}
        style={{ clipPath: 'inset(0)' }}
      >
        <div
          style={{
            transform: `translate(${state.transform.tx}px, ${state.transform.ty}px) scale(${state.transform.scale})`,
            transformOrigin: '0 0',
            willChange: 'transform',
            position: 'absolute',
            left: 0,
            top: 0,
            transition: smoothTransition ? 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
          }}
        >
          <div ref={pageContainerRef} style={{ position: 'relative' }}>
            <canvas ref={canvasRef} />
            {state.screenshotMode && state.selection && (
              <div
                className="pointer-events-none"
                style={{
                  position: 'absolute',
                  left: Math.min(state.selection.startX, state.selection.endX),
                  top: Math.min(state.selection.startY, state.selection.endY),
                  width: Math.abs(state.selection.endX - state.selection.startX),
                  height: Math.abs(state.selection.endY - state.selection.startY),
                  border: '2px solid rgba(37, 99, 235, 0.8)',
                  backgroundColor: 'rgba(37, 99, 235, 0.1)',
                  zIndex: 40,
                }}
              />
            )}

            {state.measurementMode && state.selection && (
              <svg
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 40,
                }}
              >
                <defs>
                  <marker id="drawing-arrow-start" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 0 4 L 8 0 L 8 8 Z" fill="#10B981" stroke="white" strokeWidth="0.5" />
                  </marker>
                  <marker id="drawing-arrow-end" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 8 4 L 0 0 L 0 8 Z" fill="#10B981" stroke="white" strokeWidth="0.5" />
                  </marker>
                </defs>

                <line
                  x1={state.selection.startX}
                  y1={state.selection.startY}
                  x2={state.selection.endX}
                  y2={state.selection.endY}
                  stroke="#10B981"
                  strokeWidth="3"
                  markerStart="url(#drawing-arrow-start)"
                  markerEnd="url(#drawing-arrow-end)"
                />
              </svg>
            )}

            {!readOnly &&
              showScreenshotIndicators &&
              screenshotIndicators.map(screenshot => (
                <ScreenshotIndicatorOverlay key={screenshot.id} bounds={screenshot.crop_coordinates} />
              ))}

            {readOnly &&
              violationGroups.map((group, groupIdx) => {
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

            {textSearch.isOpen &&
              textSearch.matches
                .filter(match => match.pageNumber === state.pageNumber)
                .map((match, idx) => {
                  const globalIdx = textSearch.matches.indexOf(match);
                  const isCurrent = globalIdx === textSearch.currentIndex;

                  return <TextHighlight key={`search-${match.pageNumber}-${idx}`} bounds={match.bounds} isCurrent={isCurrent} />;
                })}

            {!readOnly && (
              <MeasurementOverlay
                measurements={measurements}
                selectedMeasurementId={selectedMeasurementId}
                onMeasurementClick={setSelectedMeasurementId}
                calibrationLine={
                  calibration && calibration.calibration_line_start && calibration.calibration_line_end
                    ? { start_point: calibration.calibration_line_start, end_point: calibration.calibration_line_end }
                    : null
                }
              />
            )}
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 z-50 flex items-center gap-3 bg-white rounded px-3 py-2 border shadow-md pointer-events-auto">
        <button
          className="btn-icon bg-white"
          onClick={() => dispatch({ type: 'SET_PAGE', payload: Math.max(1, state.pageNumber - 1) })}
          aria-label="Previous page"
        >
          ◀
        </button>
        <div className="text-sm font-medium">Page {state.pageNumber} / {state.numPages || '…'}</div>
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
        <ElevationCapturePrompt
          onSave={(elementGroupId, caption) => {
            const currentState = stateRef.current;
            if (!currentState.selection) return;
            captureSelection(
              currentState.selection,
              currentState.pageNumber,
              currentState.transform.scale,
              'current',
              'elevation',
              elementGroupId,
              caption
            );
            setShowElevationPrompt(false);
            setTimeout(() => viewportRef.current?.focus(), 0);
          }}
          onCancel={() => {
            setShowElevationPrompt(false);
            setTimeout(() => viewportRef.current?.focus(), 0);
          }}
        />
      )}

      {showCalibrationModal && (
        <CalibrationModal
          currentScale={calibration?.scale_notation}
          onSave={async notation => {
            await saveCalibration(notation);
            setShowCalibrationModal(false);
            setTimeout(() => viewportRef.current?.focus(), 0);
          }}
          onCancel={() => setShowCalibrationModal(false)}
        />
      )}
    </div>
  );
},
    [
      readOnly,
      page,
      activeCheck,
      assessmentId,
      renderScale,
      dpr,
      ocConfig,
      getSafeRenderMultiplier,
      onCheckAdded,
      onCheckSelect,
      onScreenshotSaved,
    ]
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

  const zoomPct = Math.round(state.transform.scale * 100);

  return (
    <div
      ref={viewportRef}
      tabIndex={0}
      role="region"
      aria-label="PDF viewer"
      className="relative h-full w-full outline-none overscroll-contain"
      style={{ touchAction: 'none' }}
    >
      {state.screenshotMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-blue-600 text-white px-4 py-2 rounded shadow-lg text-sm font-medium">
            📸 Screenshot Mode: Click and drag to select area
          </div>
        </div>
      )}

      {state.measurementMode && (
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

      {!state.measurementMode && selectedMeasurementId && measurements.length > 0 && !readOnly && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-blue-600 text-white px-4 py-2 rounded shadow-lg text-sm font-medium">
            Measurement selected • Press{' '}
            <kbd className="px-1.5 py-0.5 bg-blue-700 rounded mx-1 font-mono text-xs">Delete</kbd>{' '}
            to remove
          </div>
        </div>
      )}

      {state.screenshotMode && state.selection && (
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
        {layers.length > 0 && (
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
              aria-pressed={state.screenshotMode}
              aria-label="Toggle screenshot mode (S)"
              title="Capture a portion of the plan"
              className={`btn-icon shadow-md ${state.screenshotMode ? 'bg-blue-600 text-white' : 'bg-white'}`}
              onClick={() => dispatch({ type: 'TOGGLE_SCREENSHOT_MODE' })}
            >
              📸
            </button>
            {state.screenshotMode && state.selection && (
              <button className="btn-secondary shadow-md" onClick={() => capture('current')}>
                Save to Current
              </button>
            )}
            <button
              aria-pressed={state.measurementMode}
              aria-label="Toggle measurement mode (M)"
              title="Measure distances on the plan"
              className={`btn-icon shadow-md ${state.measurementMode ? 'bg-green-600 text-white' : 'bg-white'}`}
              onClick={() => dispatch({ type: 'TOGGLE_MEASUREMENT_MODE' })}
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

      {showLayerPanel && layers.length > 0 && (
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
            {layers.map(layer => (
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
          state.screenshotMode || state.measurementMode
            ? 'cursor-crosshair'
            : state.isDragging
              ? 'cursor-grabbing'
              : 'cursor-grab'
        }`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          if (!state.screenshotMode && !state.measurementMode) dispatch({ type: 'END_DRAG' });
        }}
        style={{ clipPath: 'inset(0)' }}
      >
        <div
          style={{
            transform: `translate(${state.transform.tx}px, ${state.transform.ty}px) scale(${state.transform.scale})`,
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
            {state.screenshotMode && state.selection && (
              <div
                className="pointer-events-none"
                style={{
                  position: 'absolute',
                  left: Math.min(state.selection.startX, state.selection.endX),
                  top: Math.min(state.selection.startY, state.selection.endY),
                  width: Math.abs(state.selection.endX - state.selection.startX),
                  height: Math.abs(state.selection.endY - state.selection.startY),
                  border: '2px solid rgba(37, 99, 235, 0.8)',
                  backgroundColor: 'rgba(37, 99, 235, 0.1)',
                  zIndex: 40,
                }}
              />
            )}

            {/* Measurement mode line preview */}
            {state.measurementMode && state.selection && (
              <svg
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 40,
                }}
              >
                {/* Define arrow markers for drawing line */}
                <defs>
                  <marker
                    id="drawing-arrow-start"
                    markerWidth="8"
                    markerHeight="8"
                    refX="4"
                    refY="4"
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path d="M 0 4 L 8 0 L 8 8 Z" fill="#10B981" stroke="white" strokeWidth="0.5" />
                  </marker>
                  <marker
                    id="drawing-arrow-end"
                    markerWidth="8"
                    markerHeight="8"
                    refX="4"
                    refY="4"
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path d="M 8 4 L 0 0 L 0 8 Z" fill="#10B981" stroke="white" strokeWidth="0.5" />
                  </marker>
                </defs>

                <line
                  x1={state.selection.startX}
                  y1={state.selection.startY}
                  x2={state.selection.endX}
                  y2={state.selection.endY}
                  stroke="#10B981"
                  strokeWidth="3"
                  markerStart="url(#drawing-arrow-start)"
                  markerEnd="url(#drawing-arrow-end)"
                />
              </svg>
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

            {/* Measurement overlay */}
            {!readOnly && (
              <MeasurementOverlay
                measurements={measurements}
                selectedMeasurementId={selectedMeasurementId}
                onMeasurementClick={setSelectedMeasurementId}
                calibrationLine={
                  calibration &&
                  calibration.calibration_line_start &&
                  calibration.calibration_line_end
                    ? {
                        start_point: calibration.calibration_line_start,
                        end_point: calibration.calibration_line_end,
                      }
                    : null
                }
              />
            )}
          </div>
        </div>
      </div>

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

      {showCalibrationModal && (
        <CalibrationModal
          currentScale={calibration?.scale_notation}
          onSave={saveCalibration}
          onCancel={() => setShowCalibrationModal(false)}
        />
      )}
    </div>
  );
}
