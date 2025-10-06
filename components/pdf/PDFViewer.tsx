'use client';

import { pdfjs } from 'react-pdf';
import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ViolationMarker as ViolationMarkerType } from '@/lib/reports/get-violations';
import { ViolationMarker } from '../reports/ViolationMarker';

// Use the unpkg CDN which is more reliable for Vercel deployments
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const MAX_CANVAS_SIDE = 8192;
const MAX_CANVAS_PIXELS = 140_000_000;
const TRANSFORM_SAVE_DEBOUNCE_MS = 500;

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

  // Initial state from storage
  const [state, dispatch] = useReducer(viewerReducer, {
    transform: getSaved(`pdf-transform-${assessmentId}`, { tx: 0, ty: 0, scale: 1 }, s =>
      JSON.parse(s)
    ),
    pageNumber: getSaved(`pdf-page-${assessmentId}`, 1, s => parseInt(s, 10) || 1),
    numPages: 0,
    isDragging: false,
    screenshotMode: false,
    isSelecting: false,
    selection: null,
  });

  // Core PDF state
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [page, setPage] = useState<any>(null);
  const [ocConfig, setOcConfig] = useState<any>(null);

  // UI state
  const [layers, setLayers] = useState<PDFLayer[]>([]);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [renderScale, setRenderScale] = useState(2);
  const [savingScale, setSavingScale] = useState(false);

  const dpr = typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1;

  // External page control → internal
  useEffect(() => {
    if (externalCurrentPage && externalCurrentPage !== state.pageNumber) {
      dispatch({ type: 'SET_PAGE', payload: externalCurrentPage });
    }
  }, [externalCurrentPage, state.pageNumber]);

  // Notify parent + persist page number
  useEffect(() => {
    onPageChange?.(state.pageNumber);
    if (assessmentId && typeof window !== 'undefined') {
      localStorage.setItem(`pdf-page-${assessmentId}`, String(state.pageNumber));
    }
  }, [state.pageNumber, onPageChange, assessmentId]);

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
        const presign = await fetch('/api/pdf/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfUrl }),
        });
        if (!presign.ok) throw new Error(`presign ${presign.status}`);
        const { url } = await presign.json();
        if (!cancelled) setPresignedUrl(url);
      } catch {
        if (!cancelled) setPresignedUrl(null);
      } finally {
        if (!cancelled) setLoadingUrl(false);
      }

      if (!assessmentId || readOnly) return;
      try {
        const res = await fetch(`/api/assessments/${assessmentId}/pdf-scale`);
        if (res.ok) {
          const data = await res.json();
          if (data?.pdf_scale) setRenderScale(data.pdf_scale);
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
      const loadingTask = pdfjs.getDocument(presignedUrl);
      try {
        const doc = await loadingTask.promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setPage(null);
        setOcConfig(null);
        setLayers([]);
        dispatch({ type: 'SET_NUM_PAGES', payload: doc.numPages });
      } catch {
        if (!cancelled) setPdfDoc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [presignedUrl]);

  // Load current page proxy
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await pdfDoc.getPage(state.pageNumber);
        if (cancelled) return;
        setPage(p);
      } catch {
        if (!cancelled) setPage(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, state.pageNumber]);

  // Extract optional content config and layers, restore visibility before first paint
  useEffect(() => {
    if (!pdfDoc) return;
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
      } catch {
        // No layers or error: fall back to default render via our canvas
        setOcConfig(null);
        setLayers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, assessmentId]);

  // DPR-aware safe scale selection
  const pickRenderScale = useCallback((p: any, desired: number, devicePixelRatio: number) => {
    const base = p.getViewport({ scale: 1 });
    const bySide = Math.min(
      MAX_CANVAS_SIDE / (base.width * devicePixelRatio),
      MAX_CANVAS_SIDE / (base.height * devicePixelRatio)
    );
    const byPixels = Math.sqrt(
      MAX_CANVAS_PIXELS / (base.width * base.height * devicePixelRatio * devicePixelRatio)
    );
    const cap = Math.max(1, Math.min(bySide, byPixels));
    return Math.min(desired, cap);
  }, []);

  // Core render function (single path)
  const renderPage = useCallback(
    async (why: string) => {
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

      const scale = pickRenderScale(page, renderScale, dpr);

      const viewport = page.getViewport({ scale });
      // Device-pixel sized backing store with CSS sized element
      const widthCSS = Math.ceil(viewport.width);
      const heightCSS = Math.ceil(viewport.height);
      c.style.width = `${widthCSS}px`;
      c.style.height = `${heightCSS}px`;
      c.width = Math.ceil(widthCSS * dpr);
      c.height = Math.ceil(heightCSS * dpr);

      const ctx = c.getContext('2d');
      if (!ctx) return;

      // White background to avoid transparency over gray app background
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.restore();

      // Paint with DPR transform so PDF.js draws crisp pixels
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Ensure ocConfig reflects our current layer state
      if (ocConfig && layers.length > 0) {
        for (const layer of layers) {
          try {
            ocConfig.setVisibility?.(layer.id, layer.visible);
          } catch {
            // ignore per-layer failure and keep going
          }
        }
      }

      const task = page.render({
        canvasContext: ctx,
        viewport,
        optionalContentConfigPromise: Promise.resolve(ocConfig || undefined),
      });
      renderTaskRef.current = task;

      try {
        await task.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('[PDFViewer] render error:', err, 'why:', why);
        }
      } finally {
        if (renderTaskRef.current === task) renderTaskRef.current = null;
      }
    },
    [page, renderScale, dpr, ocConfig, layers, pickRenderScale]
  );

  // Kick renders when inputs change
  useEffect(() => {
    if (page) renderPage('initial/changed deps');
  }, [page, renderScale, layers, ocConfig, dpr, renderPage]);

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
      if (state.screenshotMode && state.selection && !e.repeat) {
        const k = e.key.toLowerCase();
        if (k === 'c') {
          e.preventDefault();
          capture('current');
          return;
        }
        if (k === 'b') {
          e.preventDefault();
          capture('bathroom');
          return;
        }
        if (k === 'd') {
          e.preventDefault();
          capture('door');
          return;
        }
        if (k === 'k') {
          e.preventDefault();
          capture('kitchen');
          return;
        }
      }

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
  }, [state.screenshotMode, state.selection, state.numPages, state.pageNumber, readOnly, zoom]);

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
        await fetch(`/api/assessments/${assessmentId}/pdf-scale`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdf_scale: newScale }),
        });
      } catch {
        // ignore
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
        // render immediately with new visibility; ocConfig is mutated in renderPage()
        renderPage('toggleLayer');
        return next;
      });
    },
    [page, renderPage]
  );

  // Screenshot capture reusing DPR + ocConfig for fidelity
  const findElementTemplate = async (
    elementSlug: 'bathroom' | 'door' | 'kitchen'
  ): Promise<string | null> => {
    const elementGroupIds: Record<string, string> = {
      bathroom: 'f9557ba0-1cf6-41b2-a030-984cfe0c8c15',
      door: '3cf23143-d9cc-436c-885e-fa6391c20caf',
      kitchen: '709e704b-35d8-47f1-8ba0-92c22fdf3008',
    };
    const elementGroupId = elementGroupIds[elementSlug];
    if (!elementGroupId || !assessmentId) return null;
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/checks`);
      if (!res.ok) return null;
      const checks = await res.json();
      const template = checks.find(
        (c: any) => c.element_group_id === elementGroupId && c.instance_number === 0
      );
      return template?.id || null;
    } catch {
      return null;
    }
  };

  const capture = useCallback(
    async (target: 'current' | 'bathroom' | 'door' | 'kitchen' = 'current') => {
      try {
        if (readOnly || !state.selection || !page) return;
        if (capturingRef.current) return;
        capturingRef.current = true;

        const savedSelection = { ...state.selection };
        dispatch({ type: 'CLEAR_SELECTION' });

        let targetCheckId = activeCheck?.id;
        if (target !== 'current') {
          const templateId = await findElementTemplate(target);
          if (!templateId) {
            alert(`Could not find ${target} template check.`);
            return;
          }
          const cloneRes = await fetch(`/api/checks/${templateId}/clone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instanceLabel: undefined, copyScreenshots: false }),
          });
          if (!cloneRes.ok) {
            const e = await cloneRes.json().catch(() => ({}));
            alert(`Failed to create new ${target} instance: ${e.error || 'Unknown error'}`);
            return;
          }
          const { check: newCheck } = await cloneRes.json();
          targetCheckId = newCheck.id;
          onCheckAdded?.(newCheck);
          onCheckSelect?.(newCheck.id);
        }
        if (!targetCheckId) {
          alert('No check selected. Please select a check first.');
          return;
        }

        const canvas = canvasRef.current!;
        const cssToCanvas = canvas.width / canvas.clientWidth; // this is ≈ dpr
        const sx = Math.min(savedSelection.startX, savedSelection.endX);
        const sy = Math.min(savedSelection.startY, savedSelection.endY);
        const sw = Math.abs(savedSelection.endX - savedSelection.startX);
        const sh = Math.abs(savedSelection.endY - savedSelection.startY);

        const canvasSx = Math.floor(sx * cssToCanvas);
        const canvasSy = Math.floor(sy * cssToCanvas);
        const canvasSw = Math.max(1, Math.ceil(sw * cssToCanvas));
        const canvasSh = Math.max(1, Math.ceil(sh * cssToCanvas));

        // High-res offscreen render with the same ocConfig, scale and DPR caps
        const scale = pickRenderScale(page, renderScale, dpr);
        const viewport = page.getViewport({ scale });
        const off = document.createElement('canvas');
        off.width = Math.ceil(viewport.width * dpr);
        off.height = Math.ceil(viewport.height * dpr);
        const octx = off.getContext('2d')!;
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        octx.fillStyle = 'white';
        octx.fillRect(0, 0, off.width, off.height);

        await page.render({
          canvasContext: octx,
          viewport,
          optionalContentConfigPromise: Promise.resolve(ocConfig || undefined),
        }).promise;

        // Map selection from on-screen canvas pixels to offscreen pixels (both include DPR)
        const renderToDisplayedRatio = (viewport.width * dpr) / canvas.width;
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

        await fetch('/api/screenshots', {
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

        onScreenshotSaved?.();
      } catch (err) {
        alert('Failed to save screenshot.');

        console.error('[PDFViewer] capture failed:', err);
      } finally {
        capturingRef.current = false;
      }
    },
    [
      readOnly,
      state.selection,
      state.pageNumber,
      state.transform.scale,
      page,
      activeCheck,
      assessmentId,
      renderScale,
      dpr,
      ocConfig,
      pickRenderScale,
      onCheckAdded,
      onCheckSelect,
      onScreenshotSaved,
    ]
  );

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
            C - Current
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
              violationMarkers
                .filter(m => m.pageNumber === state.pageNumber)
                .map((marker, idx) => (
                  <ViolationMarker
                    key={`${marker.checkId}-${marker.screenshotId}-${idx}`}
                    marker={marker}
                    onClick={onMarkerClick || (() => {})}
                    isVisible={true}
                  />
                ))}
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
    </div>
  );
}
