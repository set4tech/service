'use client';

import { Document, Page, pdfjs } from 'react-pdf';
import { useCallback, useEffect, useRef, useState } from 'react';

// Use the unpkg CDN which is more reliable for Vercel deployments
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Transform {
  x: number;
  y: number;
  scale: number;
}
const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

export function PDFViewer({
  pdfUrl,
  activeCheck,
  onScreenshotSaved,
}: {
  pdfUrl: string;
  activeCheck?: any;
  onScreenshotSaved: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const [screenshotMode, setScreenshotMode] = useState(false);
  const [selection, setSelection] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  const [pdfInstance, setPdfInstance] = useState<any>(null);
  const [pageInstance, setPageInstance] = useState<any>(null);
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);

  // Fetch presigned URL for private S3 PDFs
  useEffect(() => {
    (async () => {
      console.log('PDFViewer: Starting to fetch presigned URL for:', pdfUrl);
      setLoadingUrl(true);
      try {
        const res = await fetch('/api/pdf/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfUrl }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }

        const data = await res.json();
        console.log('PDFViewer: Received presigned URL response:', data);
        setPresignedUrl(data.url);
      } catch (err) {
        console.error('Failed to get presigned URL:', err);
        setPresignedUrl(null);
      } finally {
        setLoadingUrl(false);
      }
    })();
  }, [pdfUrl]);

  const onDocLoad = ({ numPages }: { numPages: number }) => {
    console.log('PDFViewer: Document loaded successfully with', numPages, 'pages');
    setNumPages(numPages);
  };

  const onDocError = (error: Error) => {
    console.error('PDFViewer: Document loading error:', error);
  };

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (screenshotMode) return; // Disable zoom in screenshot mode
      e.preventDefault();
      e.stopPropagation(); // Prevent scroll from bubbling to parent
      const scaleSpeed = 0.003; // Reduced from 0.007 for slower, more controlled zooming
      const scaleDelta = -e.deltaY * scaleSpeed;
      setTransform(prev => {
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * (1 + scaleDelta)));
        const ratio = newScale / prev.scale;
        const rect = containerRef.current!.getBoundingClientRect();
        const cx = e.clientX - rect.left - rect.width / 2;
        const cy = e.clientY - rect.top - rect.height / 2;
        const nx = cx - (cx - prev.x) * ratio;
        const ny = cy - (cy - prev.y) * ratio;
        return { x: nx, y: ny, scale: newScale };
      });
    },
    [screenshotMode]
  );

  const onMouseDown = (e: React.MouseEvent) => {
    console.log('onMouseDown - screenshotMode:', screenshotMode, 'button:', e.button);
    if (screenshotMode) {
      console.log('Screenshot mode - preventing default and setting selection');
      e.preventDefault();
      e.stopPropagation();
      const rect = containerRef.current!.getBoundingClientRect();
      const newSelection = {
        startX: e.clientX - rect.left,
        startY: e.clientY - rect.top,
        endX: e.clientX - rect.left,
        endY: e.clientY - rect.top,
      };
      console.log('Setting selection:', newSelection);
      setSelection(newSelection);
      return;
    }
    if (e.button !== 0) return;
    console.log('Setting isDragging to true');
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (screenshotMode) {
      console.log('onMouseMove - screenshotMode active, selection:', selection);
      if (selection) {
        e.preventDefault();
        e.stopPropagation();
        const rect = containerRef.current!.getBoundingClientRect();
        setSelection(s => s && { ...s, endX: e.clientX - rect.left, endY: e.clientY - rect.top });
      }
      return;
    }
    if (!isDragging) return;
    console.log('onMouseMove - panning');
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setTransform(prev => ({ ...prev, x: dragStart.current.tx + dx, y: dragStart.current.ty + dy }));
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (screenshotMode && selection) {
      e.preventDefault();
      e.stopPropagation();
    }
    setIsDragging(false);
  };

  const zoom = (dir: 'in' | 'out') => {
    const factor = dir === 'in' ? 1.2 : 1 / 1.2;
    setTransform(prev => ({
      ...prev,
      scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor)),
    }));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setPageNumber(p => Math.max(1, p - 1));
      if (e.key === 'ArrowRight') setPageNumber(p => Math.min(numPages || p, p + 1));
      if (e.key === '-' || e.key === '_') zoom('out');
      if (e.key === '=' || e.key === '+') zoom('in');
      if (e.key === '0') setTransform({ x: 0, y: 0, scale: 1 });
      if (e.key.toLowerCase() === 's') setScreenshotMode(v => !v);
      if (e.key === 'Escape' && screenshotMode) setScreenshotMode(false);
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [screenshotMode, numPages]);

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
      const p = await pdfInstance.getPage(pageNumber);
      setPageInstance(p);
    })();
  }, [pdfInstance, pageNumber]);

  const screenToPdf = (sx: number, sy: number) => {
    const el = containerRef.current!;
    const rect = el.getBoundingClientRect();
    const cx = sx - rect.width / 2;
    const cy = sy - rect.height / 2;
    const x = (cx - transform.x) / transform.scale;
    const y = (cy - transform.y) / transform.scale;
    return { x, y };
  };

  const capture = async () => {
    if (!selection || !pageInstance || !activeCheck) return;

    const sx = Math.min(selection.startX, selection.endX);
    const sy = Math.min(selection.startY, selection.endY);
    const ex = Math.max(selection.startX, selection.endX);
    const ey = Math.max(selection.startY, selection.endY);

    // Convert selection box (screen px) to pdf local coords
    const { x: ax, y: ay } = screenToPdf(sx - 0, sy - 0);
    const { x: bx, y: by } = screenToPdf(ex - 0, ey - 0);

    const pdfRect = { x: ax, y: ay, w: bx - ax, h: by - ay };

    // Render the page to offscreen canvas at high DPI
    const renderScale = 2.5; // tweak for quality
    const viewport = pageInstance.getViewport({ scale: renderScale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await pageInstance.render({ canvasContext: ctx, viewport }).promise;

    // Map pdfRect from "scale=1" coords to renderScale
    const crop = {
      x: Math.max(0, Math.round(pdfRect.x * renderScale + viewport.width / 2)),
      y: Math.max(0, Math.round(pdfRect.y * renderScale + viewport.height / 2)),
      w: Math.round(pdfRect.w * renderScale),
      h: Math.round(pdfRect.h * renderScale),
    };

    if (crop.w < 5 || crop.h < 5) {
      setSelection(null);
      setScreenshotMode(false);
      return;
    }

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
    const res = await fetch('/api/screenshots/presign', {
      method: 'POST',
      body: JSON.stringify({
        projectId: activeCheck.project_id || activeCheck.assessment_id,
        checkId: activeCheck.id,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const { _screenshotId, uploadUrl, key, thumbUploadUrl, thumbKey } = await res.json();

    await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: blob });
    await fetch(thumbUploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: thumb,
    });

    // Persist metadata in DB
    await fetch('/api/screenshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        check_id: activeCheck.id,
        page_number: pageNumber,
        crop_coordinates: {
          x: pdfRect.x,
          y: pdfRect.y,
          width: pdfRect.w,
          height: pdfRect.h,
          zoom_level: transform.scale,
        },
        screenshot_url: `s3://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME || 'bucket'}/${key}`,
        thumbnail_url: `s3://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME || 'bucket'}/${thumbKey}`,
        caption: '',
      }),
    });

    setSelection(null);
    setScreenshotMode(false);
    onScreenshotSaved();
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

  const zoomPct = Math.round(transform.scale * 100);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="PDF viewer"
      className="relative h-full w-full outline-none overscroll-contain"
    >
      {screenshotMode && (
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
          aria-pressed={screenshotMode}
          aria-label="Toggle screenshot mode (S)"
          className={`btn-icon shadow-md ${screenshotMode ? 'bg-blue-600 text-white' : 'bg-white'}`}
          onClick={() => {
            console.log('Screenshot button clicked, current mode:', screenshotMode);
            setScreenshotMode(v => {
              console.log('Setting screenshot mode to:', !v);
              return !v;
            });
          }}
        >
          📸
        </button>
        {screenshotMode && selection && (
          <button className="btn-secondary shadow-md" onClick={capture}>
            Save
          </button>
        )}
      </div>

      <div
        className={`absolute inset-0 overflow-hidden ${
          screenshotMode ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onWheel={handleWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          if (!screenshotMode) setIsDragging(false);
        }}
        style={{ clipPath: 'inset(0)' }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: 'center center',
            willChange: 'transform',
          }}
        >
          <Document
            file={presignedUrl}
            onLoadSuccess={onDocLoad}
            onLoadError={onDocError}
            loading={<div className="text-sm text-gray-500">Loading PDF…</div>}
            error={<div className="text-sm text-red-500">Failed to load PDF document</div>}
          >
            <Page
              pageNumber={pageNumber}
              height={800}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </Document>
        </div>
      </div>

      {screenshotMode && selection && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: Math.min(selection.startX, selection.endX),
            top: Math.min(selection.startY, selection.endY),
            width: Math.abs(selection.endX - selection.startX),
            height: Math.abs(selection.endY - selection.startY),
            border: '2px solid rgba(37, 99, 235, 0.8)',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            zIndex: 40,
          }}
        />
      )}

      <div className="absolute bottom-3 left-3 z-50 flex items-center gap-3 bg-white rounded px-3 py-2 border shadow-md pointer-events-auto">
        <button
          className="btn-icon bg-white"
          onClick={() => setPageNumber(p => Math.max(1, p - 1))}
          aria-label="Previous page"
        >
          ◀
        </button>
        <div className="text-sm font-medium">
          Page {pageNumber} / {numPages || '…'}
        </div>
        <button
          className="btn-icon bg-white"
          onClick={() => setPageNumber(p => Math.min(numPages || p, p + 1))}
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
