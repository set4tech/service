'use client';

import { Document, Page, pdfjs } from 'react-pdf';
import { useCallback, useEffect, useRef, useReducer, useState } from 'react';

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
  activeCheck,
  onScreenshotSaved,
}: {
  pdfUrl: string;
  activeCheck?: any;
  onScreenshotSaved: () => void;
}) {
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

  // Fetch presigned URL for private S3 PDFs
  useEffect(() => {
    async function fetchPresignedUrl() {
      setLoadingUrl(true);
      const res = await fetch('/api/pdf/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfUrl }),
      });

      if (res.ok) {
        const data = await res.json();
        setPresignedUrl(data.url);
      } else {
        setPresignedUrl(null);
      }
      setLoadingUrl(false);
    }

    fetchPresignedUrl();
  }, [pdfUrl]);

  const onDocLoad = ({ numPages }: { numPages: number }) => {
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
      if (!pageContainerRef.current) return { x: 0, y: 0 };

      const pageRect = pageContainerRef.current.getBoundingClientRect();
      const x = (clientX - pageRect.left) / state.transform.scale;
      const y = (clientY - pageRect.top) / state.transform.scale;

      return { x, y };
    },
    [state.transform.scale]
  );

  const onMouseDown = (e: React.MouseEvent) => {
    if (state.screenshotMode) {
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
      if (e.key.toLowerCase() === 's') dispatch({ type: 'TOGGLE_SCREENSHOT_MODE' });
      if (e.key === 'Escape' && state.screenshotMode) dispatch({ type: 'TOGGLE_SCREENSHOT_MODE' });
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [state.screenshotMode, state.numPages, state.pageNumber]);

  // Clear selection on page change happens in reducer via SET_PAGE action

  // Advanced: access raw pdf via pdfjs for cropping
  useEffect(() => {
    if (!presignedUrl) return;
    (async () => {
      const loadingTask = pdfjs.getDocument(presignedUrl);
      const pdf = await loadingTask.promise;
      setPdfInstance(pdf);
    })();
  }, [presignedUrl]);

  useEffect(() => {
    (async () => {
      if (!pdfInstance) return;
      const p = await pdfInstance.getPage(state.pageNumber);
      setPageInstance(p);
    })();
  }, [pdfInstance, state.pageNumber]);

  const pickRenderScale = (page: any, desired = 2.5) => {
    const base = page.getViewport({ scale: 1 });
    const maxSide = 8192;
    const maxPixels = 140_000_000;

    const bySide = Math.min(maxSide / base.width, maxSide / base.height);
    const byPixels = Math.sqrt(maxPixels / (base.width * base.height));
    const cap = Math.max(1, Math.min(bySide, byPixels));

    return Math.min(desired, cap);
  };

  const capture = async () => {
    try {
      if (!state.selection || !pageInstance || !activeCheck) return;

      const sx = Math.min(state.selection.startX, state.selection.endX);
      const sy = Math.min(state.selection.startY, state.selection.endY);
      const sw = Math.abs(state.selection.endX - state.selection.startX);
      const sh = Math.abs(state.selection.endY - state.selection.startY);

      // Render page offscreen
      const renderScale = pickRenderScale(pageInstance, 2.5);
      const viewport = pageInstance.getViewport({ scale: renderScale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d')!;

      await pageInstance.render({ canvasContext: ctx, viewport }).promise;

      // Map content→render (pure scale, no center offsets)
      const rx = Math.max(0, Math.floor(sx * renderScale));
      const ry = Math.max(0, Math.floor(sy * renderScale));
      const rw = Math.max(1, Math.ceil(sw * renderScale));
      const rh = Math.max(1, Math.ceil(sh * renderScale));

      // Clamp to page bounds
      const cx = Math.min(rx, canvas.width - 1);
      const cy = Math.min(ry, canvas.height - 1);
      const cw = Math.min(rw, canvas.width - cx);
      const ch = Math.min(rh, canvas.height - cy);

      if (cw < 5 || ch < 5) {
        dispatch({ type: 'CLEAR_SELECTION' });
        return;
      }

      const crop = { x: cx, y: cy, w: cw, h: ch };
      const out = document.createElement('canvas');
      out.width = crop.w;
      out.height = crop.h;
      const octx = out.getContext('2d')!;
      octx.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

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

      const [blob, thumb] = await Promise.all([
        new Promise<Blob>(resolve => out.toBlob(b => resolve(b!), 'image/png')),
        new Promise<Blob>(resolve => tcanvas.toBlob(b => resolve(b!), 'image/png')),
      ]);

      // Get presigned upload targets
      console.log('capture() fetching presigned URLs...');
      const res = await fetch('/api/screenshots/presign', {
        method: 'POST',
        body: JSON.stringify({
          projectId: activeCheck.project_id || activeCheck.assessment_id,
          checkId: activeCheck.id,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        console.error('capture() presign failed:', res.status, await res.text());
        throw new Error('Failed to get presigned URLs');
      }
      const { _screenshotId, uploadUrl, key, thumbUploadUrl, thumbKey } = await res.json();
      console.log('capture() got presigned URLs');

      console.log('capture() uploading to S3...');
      await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: blob,
      });
      await fetch(thumbUploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: thumb,
      });
      console.log('capture() S3 upload complete');

      // Persist metadata in DB
      console.log('capture() saving to database...');
      const dbRes = await fetch('/api/screenshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          check_id: activeCheck.id,
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
      if (!dbRes.ok) {
        console.error('capture() database save failed:', dbRes.status, await dbRes.text());
        throw new Error('Failed to save screenshot to database');
      }
      console.log('capture() complete!');

      dispatch({ type: 'CLEAR_SELECTION' });
      onScreenshotSaved();
    } catch (error) {
      console.error('capture() failed with error:', error);
      alert(
        'Failed to save screenshot: ' + (error instanceof Error ? error.message : 'Unknown error')
      );
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
        <button
          aria-pressed={state.screenshotMode}
          aria-label="Toggle screenshot mode (S)"
          className={`btn-icon shadow-md ${state.screenshotMode ? 'bg-blue-600 text-white' : 'bg-white'}`}
          onClick={() => dispatch({ type: 'TOGGLE_SCREENSHOT_MODE' })}
        >
          📸
        </button>
        {state.screenshotMode && state.selection && (
          <button className="btn-secondary shadow-md" onClick={() => capture()}>
            Save
          </button>
        )}
      </div>

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
                pageNumber={state.pageNumber}
                height={800}
                renderTextLayer={false}
                renderAnnotationLayer={false}
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
