'use client';

import { pdfjs } from 'react-pdf';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ViolationMarker as ViolationMarkerType } from '@/lib/reports/get-violations';
import { ViolationBoundingBox } from '../reports/ViolationBoundingBox';
import { groupOverlappingViolations } from '@/lib/reports/group-violations';
import { BlueprintLoader } from '../reports/BlueprintLoader';
import { ElevationCapturePrompt } from './ElevationCapturePrompt';
import { extractTextFromRegion } from '@/lib/pdf-text-extraction';

// Use the unpkg CDN which is more reliable for Vercel deployments
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const MAX_CANVAS_SIDE = 16384; // Sweet spot: 5.4x multiplier without crashing
const MAX_CANVAS_PIXELS = 268_000_000; // 16384^2
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
  isSelecting: boolean;
  selection: { startX: number; startY: number; endX: number; endY: number } | null;
}

interface PDFLayer {
  id: string;
  name: string;
  visible: boolean;
}

type ViewerAction =
  | { type: 'SET_TRANSFORM'; payload: ViewerState['transform'] }
  | { type: 'SET_PAGE'; payload: number }
  | { type: 'SET_NUM_PAGES'; payload: number }
  | { type: 'START_DRAG' }
  | { type: 'END_DRAG' }
  | { type: 'TOGGLE_SCREENSHOT_MODE' }
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
      return { ...state, pageNumber: action.payload, selection: null, screenshotMode: false };
    case 'SET_NUM_PAGES':
      return { ...state, numPages: action.payload };
    case 'START_DRAG':
      return { ...state, isDragging: true };
    case 'END_DRAG':
      return { ...state, isDragging: false };
    case 'TOGGLE_SCREENSHOT_MODE':
      return { ...state, screenshotMode: !state.screenshotMode, selection: null };
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
      return { ...state, selection: null, screenshotMode: false };
    case 'RESET_ZOOM':
      return { ...state, transform: { tx: 0, ty: 0, scale: 1 } };
    default:
      return state;
  }
}

export function PDFViewer({
  pdfUrl,
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
  assessmentId?: string;
  activeCheck?: any;
  onScreenshotSaved?: () => void;
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
  const renderTaskRef = useRef<any>(null);
  const dragRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const transformSaveTimer = useRef<number | null>(null);
  const capturingRef = useRef(false);

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
    isSelecting: false,
    selection: null,
  });

  // Keep a ref to the current state to avoid stale closures in keyboard handler
  const stateRef = useRef(state);
  // Update ref whenever state changes (must be done immediately, not in useEffect)
  stateRef.current = state;

  // Core PDF state
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [page, setPage] = useState<any>(null);
  const [ocConfig, setOcConfig] = useState<any>(null);

  // UI state
  const [layers, setLayers] = useState<PDFLayer[]>([]);
  const [layersVersion, setLayersVersion] = useState(0); // Increment when layers change
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [renderScale, setRenderScale] = useState(2); // Quality multiplier, NOT viewport scale
  const [savingScale, setSavingScale] = useState(false);
  const [smoothTransition, setSmoothTransition] = useState(false);
  const [showElevationPrompt, setShowElevationPrompt] = useState(false);

  // Use useState for dpr to ensure stability
  const [dpr] = useState(() =>
    typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1
  );

  // Memoize violation groups to avoid recalculating on every render
  const violationGroups = useMemo(() => {
    if (!readOnly || violationMarkers.length === 0) return [];

    // Expand violations to create separate markers for each screenshot
    const expandedMarkers: ViolationMarkerType[] = [];

    violationMarkers.forEach(violation => {
      // Add marker for each screenshot in allScreenshots array
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
        // Fallback to original violation if no allScreenshots
        expandedMarkers.push(violation);
      }
    });

    console.log('[PDFViewer] Expanded markers:', {
      originalCount: violationMarkers.length,
      expandedCount: expandedMarkers.length,
      forPage: state.pageNumber,
      sample: expandedMarkers[0]
        ? {
            checkId: expandedMarkers[0].checkId,
            screenshotId: expandedMarkers[0].screenshotId,
            pageNumber: expandedMarkers[0].pageNumber,
            bounds: expandedMarkers[0].bounds,
          }
        : null,
    });

    const groups = groupOverlappingViolations(expandedMarkers, state.pageNumber);
    console.log('[PDFViewer] Grouped markers:', {
      groupCount: groups.length,
      totalMarkers: groups.reduce((sum, g) => sum + g.violations.length, 0),
    });

    return groups;
  }, [readOnly, violationMarkers, state.pageNumber]);

  // Store latest onPageChange callback in a ref to avoid unnecessary re-renders
  const onPageChangeRef = useRef(onPageChange);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  // Center on highlighted violation when it changes
  useEffect(() => {
    console.log('[PDFViewer] Centering effect triggered', {
      readOnly,
      highlightedViolationId,
      hasCanvas: !!canvasRef.current,
      hasViewport: !!viewportRef.current,
      currentPage: state.pageNumber,
      violationMarkersCount: violationMarkers.length,
    });

    if (!readOnly || !highlightedViolationId || !canvasRef.current || !viewportRef.current) {
      console.log('[PDFViewer] Skipping - preconditions not met');
      return;
    }

    // Parse highlightedViolationId to extract checkId and screenshotId
    // Use ::: as delimiter since both IDs are UUIDs that contain dashes
    const [checkId, screenshotId] = highlightedViolationId.split(':::');
    console.log('[PDFViewer] Parsed IDs:', { checkId, screenshotId });

    // Find the violation marker by checkId
    const violation = violationMarkers.find(v => v.checkId === checkId);

    if (!violation) {
      console.log('[PDFViewer] No violation found for checkId:', checkId);
      return;
    }

    console.log('[PDFViewer] Found violation:', {
      checkId: violation.checkId,
      allScreenshotsCount: violation.allScreenshots?.length,
      screenshotId: violation.screenshotId,
    });

    // Find the specific screenshot in allScreenshots array
    const screenshot =
      violation.allScreenshots?.find(s => s.id === screenshotId) ||
      (violation.screenshotId === screenshotId
        ? {
            pageNumber: violation.pageNumber,
            bounds: violation.bounds,
          }
        : null);

    if (!screenshot) {
      console.log('[PDFViewer] No screenshot found for screenshotId:', screenshotId);
      return;
    }

    console.log('[PDFViewer] Found screenshot:', {
      screenshotId,
      pageNumber: screenshot.pageNumber,
      bounds: screenshot.bounds,
      currentPage: state.pageNumber,
    });

    // Check if we're on the right page
    if (screenshot.pageNumber !== state.pageNumber) {
      console.log(
        '[PDFViewer] Wrong page - need:',
        screenshot.pageNumber,
        'current:',
        state.pageNumber
      );
      return;
    }

    // Skip centering if violation has no valid bounds (e.g., no screenshot)
    const bounds = screenshot.bounds;
    const hasValidBounds = bounds.width > 0 && bounds.height > 0;
    if (!hasValidBounds) {
      console.log(
        '[PDFViewer] Skipping center - violation has no valid bounds:',
        violation.checkId,
        bounds
      );
      return;
    }

    console.log('[PDFViewer] Proceeding with centering on bounds:', bounds);

    // Small delay to ensure canvas is rendered
    const timeoutId = setTimeout(() => {
      console.log('[PDFViewer] Executing centering after delay');
      if (!viewportRef.current) {
        console.log('[PDFViewer] No viewport ref!');
        return;
      }

      // Calculate center of violation bounds
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;

      // Get viewport dimensions
      const viewportRect = viewportRef.current.getBoundingClientRect();
      const viewportCenterX = viewportRect.width / 2;
      const viewportCenterY = viewportRect.height / 2;

      // Calculate transform to center the violation (using current scale)
      const currentScale = state.transform.scale;
      const tx = viewportCenterX - centerX * currentScale;
      const ty = viewportCenterY - centerY * currentScale;

      console.log('[PDFViewer] Calculated centering transform:', {
        centerX,
        centerY,
        viewportCenterX,
        viewportCenterY,
        currentScale,
        tx,
        ty,
      });

      // Enable smooth transition for centering
      setSmoothTransition(true);

      // Update transform to center the violation
      dispatch({
        type: 'SET_TRANSFORM',
        payload: { scale: currentScale, tx, ty },
      });

      console.log('[PDFViewer] Dispatched SET_TRANSFORM');

      // Disable smooth transition after animation completes
      const transitionTimeout = setTimeout(() => {
        setSmoothTransition(false);
      }, 500);

      return () => clearTimeout(transitionTimeout);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [highlightedViolationId, state.pageNumber, readOnly, violationMarkers]);

  // External page control → internal
  // Track previous external page to only respond to actual changes
  const prevExternalPageRef = useRef(externalCurrentPage);
  useEffect(() => {
    // Only update if externalCurrentPage actually changed (not internal state change)
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

  // Persist layer visibility
  useEffect(() => {
    if (!assessmentId || typeof window === 'undefined' || layers.length === 0) return;
    const map: Record<string, boolean> = {};
    for (const l of layers) map[l.id] = l.visible;
    localStorage.setItem(`pdf-layers-${assessmentId}`, JSON.stringify(map));
  }, [layers, assessmentId]);

  // Fetch presigned URL and saved render scale
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingUrl(true);
      try {
        // Check cache first
        const cached = PRESIGN_CACHE.get(pdfUrl);
        if (cached && cached.expiresAt > Date.now()) {
          console.log('[PDFViewer] Using cached presigned URL');
          if (!cancelled) setPresignedUrl(cached.url);
          if (!cancelled) setLoadingUrl(false);
          return;
        }

        // Check if request is already in-flight
        let inflightPromise = PRESIGN_INFLIGHT.get(pdfUrl);
        if (!inflightPromise) {
          console.log('[PDFViewer] Fetching new presigned URL');
          inflightPromise = (async () => {
            const presign = await fetch('/api/pdf/presign', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pdfUrl }),
            });
            if (!presign.ok) throw new Error(`presign ${presign.status}`);
            const { url } = await presign.json();

            // Cache the result
            PRESIGN_CACHE.set(pdfUrl, {
              url,
              expiresAt: Date.now() + CACHE_DURATION_MS,
            });

            // Clear in-flight marker
            PRESIGN_INFLIGHT.delete(pdfUrl);

            return url;
          })();

          PRESIGN_INFLIGHT.set(pdfUrl, inflightPromise);
        } else {
          console.log('[PDFViewer] Waiting for in-flight presign request');
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
          // Cap loaded scale to 2-8 range (renderScale is quality multiplier, not viewport scale)
          if (data?.pdf_scale) setRenderScale(Math.min(8, Math.max(2, data.pdf_scale)));
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
      console.log('[PDFViewer] Starting PDF load from presigned URL');
      const loadingTask = pdfjs.getDocument({
        url: presignedUrl,
        // Enable streaming and range requests for large files
        disableAutoFetch: false,
        disableStream: false,
        disableRange: false,
      });

      // Track loading progress - log only at 10% intervals
      let lastLoggedPercent = -1;
      loadingTask.onProgress = (progress: any) => {
        if (progress.total) {
          const percent = Math.floor((progress.loaded / progress.total) * 100);
          if (percent >= lastLoggedPercent + 10) {
            console.log(
              `[PDFViewer] Loading progress: ${percent}% (${progress.loaded} / ${progress.total} bytes)`
            );
            lastLoggedPercent = percent;
          }
        } else if (lastLoggedPercent < 0) {
          // Log once if total is unknown
          console.log(`[PDFViewer] Loading progress: ${progress.loaded} bytes (total unknown)`);
          lastLoggedPercent = 0;
        }
      };

      try {
        const doc = await loadingTask.promise;
        if (cancelled) return;
        console.log('[PDFViewer] PDF loaded successfully, pages:', doc.numPages);
        setPdfDoc(doc);
        setPage(null);
        setOcConfig(null);
        setLayers([]);
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

    // Skip if we're already on this page
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
      // Mark this page as centered
      pageCenteredRef.current = state.pageNumber;
    }
  }, [page, state.pageNumber]);

  // Extract optional content config and layers, restore visibility before first paint
  useEffect(() => {
    if (!pdfDoc) return;

    // Skip loading layers entirely if disabled
    if (disableLayers) {
      setOcConfig(null);
      setLayers([]);
      setLayersVersion(v => v + 1);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const cfg = await pdfDoc.getOptionalContentConfig();
        if (cancelled) return;

        // No OCGs: still render through our canvas path
        if (!cfg) {
          setOcConfig(null);
          setLayers([]);
          return;
        }

        // Build layer list
        const order = cfg.getOrder?.() || [];
        const initialLayers: PDFLayer[] = [];
        for (const id of order) {
          const group = cfg.getGroup?.(id);
          initialLayers.push({
            id: String(id),
            name: group?.name || `Layer ${id}`,
            visible: cfg.isVisible?.(id),
          });
        }

        // Restore saved visibility (if any)
        if (assessmentId && typeof window !== 'undefined') {
          const raw = localStorage.getItem(`pdf-layers-${assessmentId}`);
          if (raw) {
            try {
              const saved = JSON.parse(raw) as Record<string, boolean>;
              for (const layer of initialLayers) {
                if (Object.prototype.hasOwnProperty.call(saved, layer.id)) {
                  layer.visible = !!saved[layer.id];
                  try {
                    cfg.setVisibility?.(layer.id, layer.visible);
                  } catch {
                    // ignore per-id errors
                  }
                }
              }
            } catch {
              // ignore parse errors
            }
          }
        }

        setOcConfig(cfg);
        setLayers(initialLayers);
        setLayersVersion(v => v + 1);
      } catch {
        // No layers or error: fall back to default render via our canvas
        setOcConfig(null);
        setLayers([]);
        setLayersVersion(v => v + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, assessmentId, disableLayers]);

  // Calculate safe rendering multiplier that respects canvas limits
  const getSafeRenderMultiplier = useCallback((baseViewport: any, desiredMultiplier: number) => {
    const maxBySide = Math.min(
      MAX_CANVAS_SIDE / baseViewport.width,
      MAX_CANVAS_SIDE / baseViewport.height
    );
    const maxByPixels = Math.sqrt(MAX_CANVAS_PIXELS / (baseViewport.width * baseViewport.height));
    const cap = Math.min(maxBySide, maxByPixels);
    return Math.max(1, Math.min(desiredMultiplier, cap));
  }, []);

  // Core render function (single path)
  const renderPage = useCallback(async () => {
    const c = canvasRef.current;
    if (!c || !page) {
      return;
    }

    // Validate page object has required methods
    if (typeof page.getViewport !== 'function' || typeof page.render !== 'function') {
      console.error('[PDFViewer] Invalid page object');
      return;
    }

    // Cancel any in-flight render
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // ignore
      }
      renderTaskRef.current = null;
    }

    // Calculate safe multiplier for rendering quality
    const baseViewport = page.getViewport({ scale: 1 });
    if (!baseViewport) {
      console.error('[PDFViewer] Failed to get base viewport from page');
      return;
    }

    // renderScale IS the quality multiplier (don't multiply by DPR - that causes immediate capping)
    const desiredMultiplier = renderScale;
    const safeMultiplier = getSafeRenderMultiplier(baseViewport, desiredMultiplier);

    // Create viewport at safe scale for PDF.js rendering
    const viewport = page.getViewport({ scale: safeMultiplier });
    if (!viewport) {
      console.error('[PDFViewer] Failed to get viewport at scale', safeMultiplier);
      return;
    }

    // CSS size at 1x (base PDF dimensions), canvas at safeMultiplier for quality
    const widthCSS = Math.ceil(baseViewport.width);
    const heightCSS = Math.ceil(baseViewport.height);
    c.style.width = `${widthCSS}px`;
    c.style.height = `${heightCSS}px`;
    c.width = Math.ceil(viewport.width);
    c.height = Math.ceil(viewport.height);

    const ctx = c.getContext('2d');
    if (!ctx) return;

    // White background to avoid transparency over gray app background
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();

    // No transform needed - viewport scale already matches canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Ensure ocConfig reflects our current layer state
    if (ocConfig && layers.length > 0) {
      for (const layer of layers) {
        try {
          ocConfig.setVisibility?.(layer.id, layer.visible);
        } catch (err) {
          console.error('[PDFViewer] Error setting layer visibility:', err);
        }
      }
    }

    // Validate render parameters
    if (!viewport || !viewport.width || !viewport.height) {
      console.error('[PDFViewer] Invalid viewport');
      return;
    }

    const renderParams = {
      canvasContext: ctx,
      viewport: viewport,
      ...(ocConfig &&
        !disableLayers && { optionalContentConfigPromise: Promise.resolve(ocConfig) }),
    };

    const task = page.render(renderParams);
    renderTaskRef.current = task;

    try {
      await task.promise;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        // Only log unexpected errors
        console.error('[PDFViewer] Render error:', err);
      }
    } finally {
      if (renderTaskRef.current === task) renderTaskRef.current = null;
    }
  }, [page, renderScale, ocConfig, layers, getSafeRenderMultiplier, disableLayers]);

  // Kick renders when inputs change
  // Note: renderPage is not in deps because it already depends on all these values
  // Using layersVersion instead of layers array to avoid reference equality issues
  useEffect(() => {
    if (page) renderPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, renderScale, layersVersion]);

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
    if (!el) {
      console.log('[PDFViewer] No viewport element, cannot attach keyboard listener');
      return;
    }
    console.log('[PDFViewer] Attaching keyboard listener to viewport element');
    const onKey = (e: KeyboardEvent) => {
      // Get fresh state from stateRef to avoid stale closure
      const currentState = stateRef.current;

      console.log('[PDFViewer] Key pressed:', {
        key: e.key,
        screenshotMode: currentState.screenshotMode,
        hasSelection: !!currentState.selection,
        repeat: e.repeat,
        showElevationPrompt,
      });

      // Handle screenshot mode shortcuts - check selection individually for each key
      // Skip if elevation prompt is open (let the modal handle keyboard input)
      if (currentState.screenshotMode && !e.repeat && !showElevationPrompt) {
        const k = e.key.toLowerCase();
        console.log('[PDFViewer] Key pressed in screenshot mode:', {
          key: k,
          hasSelection: !!currentState.selection,
          showElevationPrompt,
        });

        // These shortcuts require a selection
        if (currentState.selection) {
          if (k === 'c') {
            e.preventDefault();
            capture('current', 'plan');
            return;
          }
          if (k === 'e') {
            console.log('[PDFViewer] E key pressed, opening elevation prompt');
            e.preventDefault();
            setShowElevationPrompt(true);
            return;
          }
          if (k === 'b') {
            e.preventDefault();
            capture('bathroom', 'plan');
            return;
          }
          if (k === 'd') {
            e.preventDefault();
            capture('door', 'plan');
            return;
          }
          if (k === 'k') {
            e.preventDefault();
            capture('kitchen', 'plan');
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
      if (!readOnly && e.key.toLowerCase() === 's') dispatch({ type: 'TOGGLE_SCREENSHOT_MODE' });
      if (!readOnly && e.key === 'Escape' && currentState.screenshotMode)
        dispatch({ type: 'TOGGLE_SCREENSHOT_MODE' });
    };
    el.addEventListener('keydown', onKey);
    return () => {
      console.log('[PDFViewer] Removing keyboard listener from viewport element');
      el.removeEventListener('keydown', onKey);
    };
  }, [state.screenshotMode, state.numPages, state.pageNumber, readOnly, zoom, showElevationPrompt]);

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
    if (state.screenshotMode && !readOnly) {
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
    if (state.screenshotMode) {
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
    if (state.screenshotMode && state.selection) dispatch({ type: 'END_SELECTION' });
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

  const toggleLayer = useCallback(
    async (layerId: string) => {
      if (!page) return;
      setLayers(prev => {
        const next = prev.map(l => (l.id === layerId ? { ...l, visible: !l.visible } : l));
        return next;
      });
      setLayersVersion(v => v + 1);
      // renderPage will be called automatically by the useEffect when layersVersion changes
    },
    [page]
  );

  // Screenshot capture reusing DPR + ocConfig for fidelity
  const createElementInstance = async (
    elementSlug: 'bathroom' | 'door' | 'kitchen'
  ): Promise<any | null> => {
    const elementGroupSlugs: Record<string, string> = {
      bathroom: 'bathrooms',
      door: 'doors',
      kitchen: 'kitchens',
    };
    const slug = elementGroupSlugs[elementSlug];
    if (!slug || !assessmentId) return null;
    try {
      const res = await fetch(`/api/checks/create-element`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId, elementGroupSlug: slug }),
      });
      if (!res.ok) return null;
      const { check } = await res.json();
      return check;
    } catch {
      return null;
    }
  };

  const capture = useCallback(
    async (
      target: 'current' | 'bathroom' | 'door' | 'kitchen' = 'current',
      screenshotType: 'plan' | 'elevation' = 'plan',
      elementGroupId?: string,
      caption?: string
    ) => {
      console.log('[PDFViewer] capture() called:', {
        target,
        screenshotType,
        elementGroupId,
        caption,
        readOnly,
        hasPage: !!page,
        capturingRef: capturingRef.current,
        stateRef: stateRef.current,
        selection: stateRef.current?.selection,
      });
      try {
        // Use stateRef for fresh state without causing dependency issues
        const currentState = stateRef.current;
        if (readOnly || !currentState.selection || !page) {
          console.log('[PDFViewer] Early return from capture:', {
            readOnly,
            hasSelection: !!currentState.selection,
            hasPage: !!page,
          });
          return;
        }
        if (capturingRef.current) {
          console.log('[PDFViewer] Already capturing, skipping');
          return;
        }
        capturingRef.current = true;

        const savedSelection = { ...currentState.selection };

        // Only clear selection for plan screenshots (not elevations)
        if (screenshotType === 'plan') {
          console.log('[PDFViewer] Clearing selection (plan screenshot)');
          dispatch({ type: 'CLEAR_SELECTION' });
        } else {
          console.log('[PDFViewer] NOT clearing selection (elevation screenshot)');
        }

        let targetCheckId = activeCheck?.id;
        if (target !== 'current') {
          const newCheck = await createElementInstance(target);
          if (!newCheck) {
            alert(`Failed to create new ${target} instance.`);
            return;
          }
          targetCheckId = newCheck.id;
          onCheckAdded?.(newCheck);
          onCheckSelect?.(newCheck.id);
        }
        if (!targetCheckId) {
          alert('No check selected. Please select a check first.');
          return;
        }

        const canvas = canvasRef.current!;
        // cssToCanvas is the safeMultiplier (canvas backing store pixels per CSS pixel)
        const baseViewportForCalc = page.getViewport({ scale: 1 });
        const cssToCanvas = canvas.width / Math.ceil(baseViewportForCalc.width);
        const sx = Math.min(savedSelection.startX, savedSelection.endX);
        const sy = Math.min(savedSelection.startY, savedSelection.endY);
        const sw = Math.abs(savedSelection.endX - savedSelection.startX);
        const sh = Math.abs(savedSelection.endY - savedSelection.startY);

        const canvasSx = Math.floor(sx * cssToCanvas);
        const canvasSy = Math.floor(sy * cssToCanvas);
        const canvasSw = Math.max(1, Math.ceil(sw * cssToCanvas));
        const canvasSh = Math.max(1, Math.ceil(sh * cssToCanvas));

        // High-res offscreen render with the same ocConfig and multiplier
        const baseViewport = page.getViewport({ scale: 1 });
        const desiredMultiplier = renderScale;
        const safeMultiplier = getSafeRenderMultiplier(baseViewport, desiredMultiplier);
        const viewport = page.getViewport({ scale: safeMultiplier });
        const off = document.createElement('canvas');
        off.width = Math.ceil(viewport.width);
        off.height = Math.ceil(viewport.height);
        const octx = off.getContext('2d')!;
        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.fillStyle = 'white';
        octx.fillRect(0, 0, off.width, off.height);

        const screenshotRenderParams = {
          canvasContext: octx,
          viewport: viewport,
          ...(ocConfig && { optionalContentConfigPromise: Promise.resolve(ocConfig) }),
        };

        await page.render(screenshotRenderParams).promise;

        // Map selection from on-screen canvas pixels to offscreen pixels
        const renderToDisplayedRatio = viewport.width / canvas.width;
        const rx = Math.max(0, Math.floor(canvasSx * renderToDisplayedRatio));
        const ry = Math.max(0, Math.floor(canvasSy * renderToDisplayedRatio));
        const rw = Math.max(1, Math.ceil(canvasSw * renderToDisplayedRatio));
        const rh = Math.max(1, Math.ceil(canvasSh * renderToDisplayedRatio));

        const cx = Math.min(rx, off.width - 1);
        const cy = Math.min(ry, off.height - 1);
        const cw = Math.min(rw, off.width - cx);
        const ch = Math.min(rh, off.height - cy);

        const out = document.createElement('canvas');
        out.width = cw;
        out.height = ch;
        out.getContext('2d')!.drawImage(off, cx, cy, cw, ch, 0, 0, cw, ch);

        // Thumbnail
        const thumbMax = 240;
        const r = Math.min(1, thumbMax / Math.max(cw, ch));
        const tw = Math.max(1, Math.round(cw * r));
        const th = Math.max(1, Math.round(ch * r));
        const t = document.createElement('canvas');
        t.width = tw;
        t.height = th;
        t.getContext('2d')!.drawImage(out, 0, 0, tw, th);

        const [blob, thumb] = await Promise.all([
          new Promise<Blob>(resolve => out.toBlob(b => resolve(b!), 'image/png')),
          new Promise<Blob>(resolve => t.toBlob(b => resolve(b!), 'image/png')),
        ]);

        const res = await fetch('/api/screenshots/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: activeCheck?.project_id || assessmentId,
            checkId: targetCheckId,
          }),
        });
        if (!res.ok) throw new Error('Failed to get presigned URLs');
        const { _screenshotId, uploadUrl, key, thumbUploadUrl, thumbKey } = await res.json();

        await Promise.all([
          fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: blob }),
          fetch(thumbUploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/png' },
            body: thumb,
          }),
        ]);

        // Extract text from PDF region for elevations
        let extractedText = '';
        if (screenshotType === 'elevation' && page) {
          console.log('[PDFViewer] Extracting text from region for elevation screenshot');
          extractedText = await extractTextFromRegion(page, {
            x: sx,
            y: sy,
            width: sw,
            height: sh,
          });
          console.log('[PDFViewer] Extracted text:', extractedText);
        }

        await fetch('/api/screenshots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            check_id: screenshotType === 'plan' ? targetCheckId : null, // Only assign to check for plan screenshots
            page_number: currentState.pageNumber,
            crop_coordinates: {
              x: sx,
              y: sy,
              width: sw,
              height: sh,
              zoom_level: currentState.transform.scale,
            },
            screenshot_url: `s3://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME || 'bucket'}/${key}`,
            thumbnail_url: `s3://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME || 'bucket'}/${thumbKey}`,
            caption: caption || '',
            screenshot_type: screenshotType,
            element_group_id: elementGroupId || null,
            extracted_text: extractedText || null,
          }),
        });

        console.log('[PDFViewer] Calling onScreenshotSaved callback');
        onScreenshotSaved?.();
      } catch (err) {
        alert('Failed to save screenshot.');

        console.error('[PDFViewer] capture failed:', err);
      } finally {
        capturingRef.current = false;
        console.log(
          '[PDFViewer] Capture complete. screenshotType:',
          screenshotType,
          'selection still exists:',
          !!stateRef.current?.selection
        );
      }
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
      console.log('[PDFViewer] ElevationCapturePrompt onSave called');
      // IMPORTANT: Capture FIRST while selection still exists, THEN close modal
      capture('current', 'elevation', elementGroupId, caption);
      setShowElevationPrompt(false);
      // Refocus viewport to restore keyboard handling
      setTimeout(() => viewportRef.current?.focus(), 0);
    },
    [capture]
  );

  const handleElevationCancel = useCallback(() => {
    console.log('[PDFViewer] ElevationCapturePrompt onCancel called, closing modal');
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
          state.screenshotMode
            ? 'cursor-crosshair'
            : state.isDragging
              ? 'cursor-grabbing'
              : 'cursor-grab'
        }`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          if (!state.screenshotMode) dispatch({ type: 'END_DRAG' });
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
          Shortcuts: ←/→, -/+, 0, S, Esc
        </span>
      </div>

      {showElevationPrompt && (
        <ElevationCapturePrompt onSave={handleElevationSave} onCancel={handleElevationCancel} />
      )}
    </div>
  );
}
