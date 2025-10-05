'use client';

import { Document, Page, pdfjs } from 'react-pdf';
import { useCallback, useEffect, useRef, useReducer, useState } from 'react';
import { ViolationMarker as ViolationMarkerType } from '@/lib/reports/get-violations';
import { ViolationMarker } from '../reports/ViolationMarker';

// Use the unpkg CDN which is more reliable for Vercel deployments
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

// Consolidated viewer state
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
  | { type: 'START_DRAG'; payload: { x: number; y: number } }
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
}) {
  const assessmentId = propAssessmentId || activeCheck?.assessment_id;
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // Consolidated state management
  const [state, dispatch] = useReducer(viewerReducer, {
    transform: { tx: 0, ty: 0, scale: 1 },
    pageNumber: 1,
    numPages: 0,
    isDragging: false,
    screenshotMode: false,
    isSelecting: false,
    selection: null,
  });

  const [pdfInstance, setPdfInstance] = useState<any>(null);
  const [pageInstance, setPageInstance] = useState<any>(null);
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [renderScale, setRenderScale] = useState(2.0); // Safe default that won't exceed canvas limits
  const [savingScale, setSavingScale] = useState(false);
  const [cappedRenderScale, setCappedRenderScale] = useState(2.0); // Actually safe scale to use
  const [layers, setLayers] = useState<PDFLayer[]>([]);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [optionalContentConfig, setOptionalContentConfig] = useState<any>(null);
  const [layerVersion, setLayerVersion] = useState(0);
  const capturingRef = useRef(false); // Prevent concurrent captures

  // Log render scale changes
  useEffect(() => {
    console.log('PDFViewer: Render scale changed to', renderScale);
  }, [renderScale]);

  // Sync external page number with internal state
  useEffect(() => {
    if (externalCurrentPage && externalCurrentPage !== state.pageNumber) {
      dispatch({ type: 'SET_PAGE', payload: externalCurrentPage });
    }
  }, [externalCurrentPage]);

  // Notify parent of page changes
  useEffect(() => {
    if (onPageChange) {
      onPageChange(state.pageNumber);
    }
  }, [state.pageNumber, onPageChange]);

  // Fetch presigned URL for private S3 PDFs and load saved scale preference
  useEffect(() => {
    async function fetchPresignedUrl() {
      console.log('PDFViewer: Fetching presigned URL for', pdfUrl);
      setLoadingUrl(true);
      const res = await fetch('/api/pdf/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfUrl }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log('PDFViewer: Presigned URL obtained');
        setPresignedUrl(data.url);
      } else {
        console.error('PDFViewer: Failed to get presigned URL', res.status);
        setPresignedUrl(null);
      }
      setLoadingUrl(false);
    }

    async function loadSavedScale() {
      if (!assessmentId || readOnly) return;
      try {
        const res = await fetch(`/api/assessments/${assessmentId}/pdf-scale`);
        if (res.ok) {
          const data = await res.json();
          if (data.pdf_scale) {
            console.log('PDFViewer: Loading saved scale', data.pdf_scale);
            setRenderScale(data.pdf_scale);
          } else {
            console.log('PDFViewer: No saved scale, using default', 2.0);
          }
        }
      } catch (err) {
        console.error('Failed to load saved PDF scale:', err);
      }
    }

    fetchPresignedUrl();
    loadSavedScale();
  }, [pdfUrl, assessmentId, readOnly]);

  const onDocLoad = ({ numPages }: { numPages: number }) => {
    console.log('PDFViewer: Document loaded successfully', { numPages, renderScale });
    dispatch({ type: 'SET_NUM_PAGES', payload: numPages });
  };

  const onDocError = (error: Error) => {
    console.error('PDFViewer: Document loading error:', error);
  };

  // Native wheel handler for reliable zoom (prevents page scroll)
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const onWheel = (e: WheelEvent) => {
      if (state.screenshotMode) return;

      e.preventDefault();
      e.stopPropagation();

      const scaleSpeed = 0.003;
      const scaleDelta = -e.deltaY * scaleSpeed;
      const prev = state.transform;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * (1 + scaleDelta)));

      const rect = vp.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const cx = (sx - prev.tx) / prev.scale;
      const cy = (sy - prev.ty) / prev.scale;

      const tx = sx - cx * newScale;
      const ty = sy - cy * newScale;

      dispatch({ type: 'SET_TRANSFORM', payload: { tx, ty, scale: newScale } });
    };

    // Non-passive is the whole point
    vp.addEventListener('wheel', onWheel, { passive: false });

    // Safari pinch zoom emits gesture*; cancel it so it doesn't zoom the page
    const cancel = (e: Event) => e.preventDefault();
    vp.addEventListener('gesturestart', cancel as EventListener, { passive: false });
    vp.addEventListener('gesturechange', cancel as EventListener, { passive: false });
    vp.addEventListener('gestureend', cancel as EventListener, { passive: false });

    return () => {
      vp.removeEventListener('wheel', onWheel as EventListener);
      vp.removeEventListener('gesturestart', cancel as EventListener);
      vp.removeEventListener('gesturechange', cancel as EventListener);
      vp.removeEventListener('gestureend', cancel as EventListener);
    };
  }, [state.screenshotMode, state.transform]);

  const screenToContent = useCallback(
    (clientX: number, clientY: number) => {
      if (!pageContainerRef.current || !viewportRef.current) return { x: 0, y: 0 };

      const viewportRect = viewportRef.current.getBoundingClientRect();

      // Account for the transform's translation when converting to content coordinates
      const x = (clientX - viewportRect.left - state.transform.tx) / state.transform.scale;
      const y = (clientY - viewportRect.top - state.transform.ty) / state.transform.scale;

      console.log('screenToContent:', {
        clientX,
        clientY,
        viewportLeft: viewportRect.left,
        viewportTop: viewportRect.top,
        tx: state.transform.tx,
        ty: state.transform.ty,
        scale: state.transform.scale,
        contentX: x,
        contentY: y,
      });

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
    dispatch({ type: 'START_DRAG', payload: { x: e.clientX, y: e.clientY } });
    dragStart.current = {
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
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    dispatch({
      type: 'SET_TRANSFORM',
      payload: {
        ...state.transform,
        tx: dragStart.current.tx + dx,
        ty: dragStart.current.ty + dy,
      },
    });
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (state.screenshotMode && state.selection) {
      e.preventDefault();
      e.stopPropagation();
      dispatch({ type: 'END_SELECTION' });
    }
    dispatch({ type: 'END_DRAG' });
  };

  const zoom = (dir: 'in' | 'out') => {
    const factor = dir === 'in' ? 1.2 : 1 / 1.2;
    const prev = state.transform;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor));

    console.log('PDFViewer: Button zoom', {
      direction: dir,
      prevScale: prev.scale,
      newScale,
      factor,
    });

    // Zoom toward center
    const vp = viewportRef.current;
    if (!vp) {
      dispatch({ type: 'SET_TRANSFORM', payload: { ...prev, scale: newScale } });
      return;
    }

    const rect = vp.getBoundingClientRect();
    const sx = rect.width / 2;
    const sy = rect.height / 2;
    const cx = (sx - prev.tx) / prev.scale;
    const cy = (sy - prev.ty) / prev.scale;
    const tx = sx - cx * newScale;
    const ty = sy - cy * newScale;

    dispatch({ type: 'SET_TRANSFORM', payload: { tx, ty, scale: newScale } });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      // Screenshot mode shortcuts (when selection is active)
      if (state.screenshotMode && state.selection && !e.repeat) {
        const key = e.key.toLowerCase();
        if (key === 'c') {
          e.preventDefault();
          capture('current');
          return;
        }
        if (key === 'b') {
          e.preventDefault();
          console.log('[PDFViewer] b key pressed, calling capture(bathroom)');
          capture('bathroom');
          return;
        }
        if (key === 'd') {
          e.preventDefault();
          console.log('[PDFViewer] d key pressed, calling capture(door)');
          capture('door');
          return;
        }
        if (key === 'k') {
          e.preventDefault();
          console.log('[PDFViewer] k key pressed, calling capture(kitchen)');
          capture('kitchen');
          return;
        }
      }

      // Navigation shortcuts
      if (e.key === 'ArrowLeft')
        dispatch({ type: 'SET_PAGE', payload: Math.max(1, state.pageNumber - 1) });
      if (e.key === 'ArrowRight')
        dispatch({
          type: 'SET_PAGE',
          payload: Math.min(state.numPages || state.pageNumber, state.pageNumber + 1),
        });
      if (e.key === '-' || e.key === '_') zoom('out');
      if (e.key === '=' || e.key === '+') zoom('in');
      if (e.key === '0') dispatch({ type: 'RESET_ZOOM' });
      if (!readOnly && e.key.toLowerCase() === 's') dispatch({ type: 'TOGGLE_SCREENSHOT_MODE' });
      if (!readOnly && e.key === 'Escape' && state.screenshotMode)
        dispatch({ type: 'TOGGLE_SCREENSHOT_MODE' });
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [state.screenshotMode, state.selection, state.numPages, state.pageNumber, readOnly]);

  // Clear selection on page change happens in reducer via SET_PAGE action

  // Advanced: access raw pdf via pdfjs for cropping
  useEffect(() => {
    if (!presignedUrl) return;
    (async () => {
      console.log('[PDFViewer] Loading PDF instance from presigned URL...');
      const loadingTask = pdfjs.getDocument(presignedUrl);
      const pdf = await loadingTask.promise;
      console.log('[PDFViewer] PDF instance loaded, setting state');
      setPdfInstance(pdf);
    })();
  }, [presignedUrl]);

  // Extract PDF layers (Optional Content Groups)
  useEffect(() => {
    console.log('[PDFViewer] Layer extraction effect running, pdfInstance:', pdfInstance);
    if (!pdfInstance) {
      console.log('[PDFViewer] No pdfInstance yet, skipping layer extraction');
      return;
    }
    (async () => {
      try {
        console.log('[PDFViewer] Attempting to extract layers from PDF...');
        const ocConfig = await pdfInstance.getOptionalContentConfig();
        console.log('[PDFViewer] Got optionalContentConfig:', ocConfig);

        if (!ocConfig) {
          console.log('[PDFViewer] No optionalContentConfig found');
          setLayers([]);
          return;
        }

        setOptionalContentConfig(ocConfig);

        console.log(
          '[PDFViewer] optionalContentConfig methods:',
          Object.getOwnPropertyNames(Object.getPrototypeOf(ocConfig))
        );

        // Try getOrder() which returns array of IDs
        const order = ocConfig.getOrder();
        console.log('[PDFViewer] Layer order:', order);

        if (!order || order.length === 0) {
          setLayers([]);
          return;
        }

        const layerList: PDFLayer[] = [];
        for (const id of order) {
          try {
            const group = ocConfig.getGroup(id);
            console.log('[PDFViewer] Group', id, ':', group);
            layerList.push({
              id: id,
              name: group?.name || `Layer ${id}`,
              visible: ocConfig.isVisible(id),
            });
          } catch (err) {
            console.error('[PDFViewer] Error getting group', id, err);
          }
        }

        console.log('[PDFViewer] Extracted layers:', layerList);
        setLayers(layerList);
      } catch (err) {
        console.error('Failed to extract PDF layers:', err);
        setLayers([]);
      }
    })();
  }, [pdfInstance]);

  useEffect(() => {
    (async () => {
      if (!pdfInstance) return;
      console.log('PDFViewer: Loading page', state.pageNumber);
      const p = await pdfInstance.getPage(state.pageNumber);
      console.log('PDFViewer: Page loaded', state.pageNumber);

      // Calculate safe render scale that won't exceed canvas limits
      const base = p.getViewport({ scale: 1 });
      const maxSide = 8192;
      const maxPixels = 140_000_000;

      const bySide = Math.min(maxSide / base.width, maxSide / base.height);
      const byPixels = Math.sqrt(maxPixels / (base.width * base.height));
      const cap = Math.max(1, Math.min(bySide, byPixels));
      const safeScale = Math.min(renderScale, cap);

      console.log('PDFViewer: Render dimensions check', {
        baseWidth: base.width,
        baseHeight: base.height,
        requestedScale: renderScale,
        cappedScale: safeScale,
        finalWidth: base.width * safeScale,
        finalHeight: base.height * safeScale,
        wasCapped: renderScale > cap,
      });

      setCappedRenderScale(safeScale);
      setPageInstance(p);
    })();
  }, [pdfInstance, state.pageNumber, renderScale]);

  const pickRenderScale = (page: any, desired: number) => {
    const base = page.getViewport({ scale: 1 });
    const maxSide = 8192;
    const maxPixels = 140_000_000;

    const bySide = Math.min(maxSide / base.width, maxSide / base.height);
    const byPixels = Math.sqrt(maxPixels / (base.width * base.height));
    const cap = Math.max(1, Math.min(bySide, byPixels));

    const finalScale = Math.min(desired, cap);

    console.log('PDFViewer: pickRenderScale', {
      baseWidth: base.width,
      baseHeight: base.height,
      desired,
      cap,
      finalScale,
      wouldExceedLimit: desired > cap,
    });

    return finalScale;
  };

  const updateRenderScale = async (newScale: number) => {
    console.log('PDFViewer: Updating render scale', {
      oldScale: renderScale,
      newScale,
    });
    setRenderScale(newScale);
    if (!assessmentId) return;

    setSavingScale(true);
    try {
      await fetch(`/api/assessments/${assessmentId}/pdf-scale`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_scale: newScale }),
      });
    } catch (err) {
      console.error('Failed to save PDF scale:', err);
    } finally {
      setSavingScale(false);
    }
  };

  const toggleLayer = async (layerId: string) => {
    if (!optionalContentConfig) return;

    // Update the layer visibility in the config
    const currentVisibility = optionalContentConfig.isVisible(layerId);
    optionalContentConfig.setVisibility(layerId, !currentVisibility);

    // Update our local state
    setLayers(prev =>
      prev.map(layer => (layer.id === layerId ? { ...layer, visible: !layer.visible } : layer))
    );

    // Force a re-render by incrementing version
    setLayerVersion(prev => prev + 1);
  };

  const findElementTemplate = async (
    elementSlug: 'bathroom' | 'door' | 'kitchen'
  ): Promise<string | null> => {
    // Element groups mapped to their IDs from database
    const elementGroupIds: Record<string, string> = {
      bathroom: 'f9557ba0-1cf6-41b2-a030-984cfe0c8c15',
      door: '3cf23143-d9cc-436c-885e-fa6391c20caf',
      kitchen: '709e704b-35d8-47f1-8ba0-92c22fdf3008',
    };

    const elementGroupId = elementGroupIds[elementSlug];
    if (!elementGroupId) {
      console.error(`[findElementTemplate] No element group ID for ${elementSlug}`);
      return null;
    }
    if (!assessmentId) {
      console.error(`[findElementTemplate] No assessment ID available for ${elementSlug}`);
      return null;
    }

    try {
      // Find the template check (instance_number = 0) for this element group
      console.log(`[findElementTemplate] Fetching checks for assessment ${assessmentId}`);
      const res = await fetch(`/api/assessments/${assessmentId}/checks`);

      if (!res.ok) {
        console.error(`[findElementTemplate] API error: ${res.status} ${res.statusText}`);
        return null;
      }

      const checks = await res.json();
      console.log(
        `[findElementTemplate] Found ${checks.length} parent checks, searching for ${elementSlug} template`
      );

      // Find template check for this element group
      const template = checks.find(
        (c: any) => c.element_group_id === elementGroupId && c.instance_number === 0
      );

      if (template) {
        console.log(`[findElementTemplate] Found template for ${elementSlug}: ${template.id}`);
      } else {
        console.error(
          `[findElementTemplate] No template found for ${elementSlug} (element_group_id: ${elementGroupId})`
        );
      }

      return template?.id || null;
    } catch (error) {
      console.error(`[findElementTemplate] Error finding ${elementSlug} template:`, error);
      return null;
    }
  };

  const capture = async (target: 'current' | 'bathroom' | 'door' | 'kitchen' = 'current') => {
    try {
      if (readOnly || !state.selection || !pageInstance) return;

      // Prevent concurrent captures
      if (capturingRef.current) {
        console.log('[capture] Already capturing, ignoring duplicate call');
        return;
      }
      capturingRef.current = true;

      // Clear selection immediately for better UX (optimistic update)
      const savedSelection = { ...state.selection };
      dispatch({ type: 'CLEAR_SELECTION' });

      let targetCheckId = activeCheck?.id;

      // If saving to new element, create instance first
      if (target !== 'current') {
        console.log(`[capture] Creating new instance for target: ${target}`);
        const templateCheckId = await findElementTemplate(target);
        if (!templateCheckId) {
          alert(
            `Could not find ${target} template check. Please ensure ${target}s are enabled for this assessment.`
          );
          return;
        }

        console.log(`[capture] Cloning template ${templateCheckId} for ${target}`);
        // Clone the template to create new instance
        const cloneRes = await fetch(`/api/checks/${templateCheckId}/clone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instanceLabel: undefined, // Auto-generate
            copyScreenshots: false,
          }),
        });

        if (!cloneRes.ok) {
          const errorData = await cloneRes.json();
          alert(`Failed to create new ${target} instance: ${errorData.error || 'Unknown error'}`);
          return;
        }

        const { check: newCheck } = await cloneRes.json();
        targetCheckId = newCheck.id;

        // Add check to state and select it (reuse CheckList pattern)
        if (onCheckAdded) {
          onCheckAdded(newCheck);
        }

        // Select the new check
        if (onCheckSelect) {
          onCheckSelect(newCheck.id);
        }
      }

      if (!targetCheckId) {
        alert('No check selected. Please select a check first.');
        return;
      }

      // Get the actual canvas element to understand its coordinate system
      const canvas = pageContainerRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) {
        console.error('capture() cannot find canvas element');
        return;
      }

      console.log('capture() canvas info:', {
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        ratio: canvas.width / canvas.clientWidth,
      });

      // Selection coordinates are relative to the pageContainer (in CSS pixels)
      // Use savedSelection since we cleared state.selection early
      const sx = Math.min(savedSelection.startX, savedSelection.endX);
      const sy = Math.min(savedSelection.startY, savedSelection.endY);
      const sw = Math.abs(savedSelection.endX - savedSelection.startX);
      const sh = Math.abs(savedSelection.endY - savedSelection.startY);

      console.log('capture() selection in CSS pixels:', { sx, sy, sw, sh });

      // The canvas internal resolution is higher than CSS pixels
      // Convert CSS pixels to canvas pixels
      const canvasScale = canvas.width / canvas.clientWidth;
      const canvasSx = sx * canvasScale;
      const canvasSy = sy * canvasScale;
      const canvasSw = sw * canvasScale;
      const canvasSh = sh * canvasScale;

      console.log('capture() selection in canvas pixels:', {
        canvasSx,
        canvasSy,
        canvasSw,
        canvasSh,
        canvasScale,
      });

      // Render page offscreen at high resolution
      const screenshotRenderScale = pickRenderScale(pageInstance, renderScale);
      const viewport = pageInstance.getViewport({ scale: screenshotRenderScale });

      console.log('capture() render viewport:', {
        width: viewport.width,
        height: viewport.height,
        renderScale: screenshotRenderScale,
      });

      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = Math.ceil(viewport.width);
      offscreenCanvas.height = Math.ceil(viewport.height);
      const ctx = offscreenCanvas.getContext('2d')!;

      console.log('capture() rendering PDF page at high resolution...');
      const renderStart = performance.now();
      await pageInstance.render({ canvasContext: ctx, viewport }).promise;
      const renderEnd = performance.now();
      console.log('capture() PDF render complete in', (renderEnd - renderStart).toFixed(0), 'ms');

      // Map from canvas pixels to render pixels
      // Both the displayed canvas and the offscreen render are at different scales from the natural PDF
      // We need to find the ratio between them
      const renderToDisplayedRatio = viewport.width / canvas.width;

      const rx = Math.max(0, Math.floor(canvasSx * renderToDisplayedRatio));
      const ry = Math.max(0, Math.floor(canvasSy * renderToDisplayedRatio));
      const rw = Math.max(1, Math.ceil(canvasSw * renderToDisplayedRatio));
      const rh = Math.max(1, Math.ceil(canvasSh * renderToDisplayedRatio));

      console.log('capture() render coords:', {
        rx,
        ry,
        rw,
        rh,
        renderToDisplayedRatio,
      });

      // Clamp to page bounds
      const cx = Math.min(rx, offscreenCanvas.width - 1);
      const cy = Math.min(ry, offscreenCanvas.height - 1);
      const cw = Math.min(rw, offscreenCanvas.width - cx);
      const ch = Math.min(rh, offscreenCanvas.height - cy);

      console.log('capture() clamped coords:', {
        cx,
        cy,
        cw,
        ch,
        offscreenW: offscreenCanvas.width,
        offscreenH: offscreenCanvas.height,
      });

      if (cw < 5 || ch < 5) {
        console.warn('capture() WARNING: selection was clamped to tiny size:', { cw, ch });
        console.warn('This usually means coordinates are outside the page bounds');
      }

      const crop = { x: cx, y: cy, w: cw, h: ch };
      console.log('capture() final crop:', crop);
      const out = document.createElement('canvas');
      out.width = crop.w;
      out.height = crop.h;
      const octx = out.getContext('2d')!;
      octx.drawImage(offscreenCanvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

      // Thumbnail
      const thumbMax = 240;
      const ratio = Math.min(1, thumbMax / Math.max(crop.w, crop.h));
      const tw = Math.max(1, Math.round(crop.w * ratio));
      const th = Math.max(1, Math.round(crop.h * ratio));
      const tcanvas = document.createElement('canvas');
      tcanvas.width = tw;
      tcanvas.height = th;
      const tctx = tcanvas.getContext('2d')!;
      tctx.drawImage(out, 0, 0, tw, th);

      console.log('capture() converting canvases to PNG blobs...');
      const blobStart = performance.now();
      const [blob, thumb] = await Promise.all([
        new Promise<Blob>(resolve => out.toBlob(b => resolve(b!), 'image/png')),
        new Promise<Blob>(resolve => tcanvas.toBlob(b => resolve(b!), 'image/png')),
      ]);
      const blobEnd = performance.now();
      console.log('capture() blob conversion complete in', (blobEnd - blobStart).toFixed(0), 'ms');

      // Get presigned upload targets
      console.log('capture() fetching presigned URLs...');
      const presignStart = performance.now();
      const res = await fetch('/api/screenshots/presign', {
        method: 'POST',
        body: JSON.stringify({
          projectId: activeCheck?.project_id || assessmentId,
          checkId: targetCheckId,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        console.error('capture() presign failed:', res.status, await res.text());
        throw new Error('Failed to get presigned URLs');
      }
      const { _screenshotId, uploadUrl, key, thumbUploadUrl, thumbKey } = await res.json();
      const presignEnd = performance.now();
      console.log('capture() got presigned URLs in', (presignEnd - presignStart).toFixed(0), 'ms');

      console.log('capture() uploading to S3 in parallel...');
      const uploadStart = performance.now();
      await Promise.all([
        fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/png' },
          body: blob,
        }),
        fetch(thumbUploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/png' },
          body: thumb,
        }),
      ]);
      const uploadEnd = performance.now();
      console.log('capture() S3 upload complete in', (uploadEnd - uploadStart).toFixed(0), 'ms');

      // Persist metadata in DB
      console.log('capture() saving to database...');
      const dbStart = performance.now();
      const dbRes = await fetch('/api/screenshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          check_id: targetCheckId,
          page_number: state.pageNumber,
          crop_coordinates: {
            x: sx,
            y: sy,
            width: sw,
            height: sh,
            zoom_level: state.transform.scale,
          },
          screenshot_url: `s3://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME || 'bucket'}/${key}`,
          thumbnail_url: `s3://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME || 'bucket'}/${thumbKey}`,
          caption: '',
        }),
      });
      const dbEnd = performance.now();
      if (!dbRes.ok) {
        console.error('capture() database save failed:', dbRes.status, await dbRes.text());
        throw new Error('Failed to save screenshot to database');
      }
      console.log('capture() database save complete in', (dbEnd - dbStart).toFixed(0), 'ms');
      console.log('capture() complete!');

      // Selection already cleared at start for better UX
      if (onScreenshotSaved) onScreenshotSaved();
    } catch (error) {
      console.error('capture() failed with error:', error);
      alert(
        'Failed to save screenshot: ' + (error instanceof Error ? error.message : 'Unknown error')
      );
    } finally {
      capturingRef.current = false;
    }
  };

  if (loadingUrl) {
    return (
      <div className="p-6 text-center">
        <div>Loading PDF...</div>
        <div className="text-sm text-gray-500 mt-2">PDF URL: {pdfUrl}</div>
      </div>
    );
  }

  if (!presignedUrl) {
    return (
      <div className="p-6 text-center text-red-600">
        <div>Failed to load PDF</div>
        <div className="text-sm text-gray-500 mt-2">Original URL: {pdfUrl}</div>
        <div className="text-xs text-gray-400 mt-1">Check browser console for more details</div>
      </div>
    );
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
            C - Current Check
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
            onClick={() => updateRenderScale(Math.max(1, renderScale - 0.5))}
            disabled={savingScale || renderScale <= 1}
          >
            −
          </button>
          <span className="text-xs font-medium w-8 text-center">{renderScale.toFixed(1)}x</span>
          <button
            aria-label="Increase resolution"
            className="btn-icon bg-white text-xs px-1.5 py-0.5"
            onClick={() => updateRenderScale(Math.min(10, renderScale + 0.5))}
            disabled={savingScale || renderScale >= 10}
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
              title="Capture a portion of the plan to be checked against a code section or saved as an instance of an element"
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

      {/* Layer Panel */}
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
          }}
        >
          <Document
            file={presignedUrl}
            onLoadSuccess={onDocLoad}
            onLoadError={onDocError}
            loading={<div className="text-sm text-gray-500">Loading PDF…</div>}
            error={<div className="text-sm text-red-500">Failed to load PDF document</div>}
          >
            <div ref={pageContainerRef} style={{ position: 'relative' }}>
              <Page
                key={`page-${state.pageNumber}-layers-${layerVersion}`}
                pageNumber={state.pageNumber}
                scale={cappedRenderScale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onRenderSuccess={() => {
                  console.log('PDFViewer: Page rendered successfully', {
                    pageNumber: state.pageNumber,
                    requestedScale: renderScale,
                    actualScale: cappedRenderScale,
                    viewportScale: state.transform.scale,
                  });
                }}
                onRenderError={(error: Error) => {
                  console.error('PDFViewer: Page render error', {
                    pageNumber: state.pageNumber,
                    requestedScale: renderScale,
                    actualScale: cappedRenderScale,
                    error,
                  });
                }}
                {...({
                  optionalContentConfigPromise: optionalContentConfig
                    ? Promise.resolve(optionalContentConfig)
                    : undefined,
                } as Record<string, unknown>)}
              />
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
              {/* Violation Markers */}
              {readOnly &&
                violationMarkers
                  .filter(marker => marker.pageNumber === state.pageNumber)
                  .map((marker, idx) => (
                    <ViolationMarker
                      key={`${marker.checkId}-${marker.screenshotId}-${idx}`}
                      marker={marker}
                      onClick={onMarkerClick || (() => {})}
                      isVisible={true}
                    />
                  ))}
            </div>
          </Document>
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
    </div>
  );
}
