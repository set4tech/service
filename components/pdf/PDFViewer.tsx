'use client';

import { Document, Page, pdfjs } from 'react-pdf';
import { useCallback, useEffect, useRef, useState } from 'react';

// Use the unpkg CDN which is more reliable for Vercel deployments
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Transform {
  tx: number;
  ty: number;
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const _contentRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [transform, setTransform] = useState<Transform>({ tx: 200, ty: 100, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const [screenshotMode, setScreenshotMode] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selection, setSelection] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null); // Content coordinates, top-left origin
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
      e.preventDefault();
      e.stopPropagation();
      if (screenshotMode) return;

      const scaleSpeed = 0.003;
      const scaleDelta = -e.deltaY * scaleSpeed;

      setTransform(prev => {
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * (1 + scaleDelta)));
        const _ratio = newScale / prev.scale;

        // Zoom toward cursor position
        const vp = viewportRef.current!;
        const rect = vp.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        // Point in content space before zoom
        const cx = (sx - prev.tx) / prev.scale;
        const cy = (sy - prev.ty) / prev.scale;

        // New translate to keep that point under cursor
        const tx = sx - cx * newScale;
        const ty = sy - cy * newScale;

        return { tx, ty, scale: newScale };
      });
    },
    [screenshotMode]
  );

  const screenToContent = useCallback(
    (clientX: number, clientY: number) => {
      const vp = viewportRef.current!;
      const rect = vp.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;

      // Invert M = T(tx,ty) · S(scale) with origin (0,0)
      const x = (sx - transform.tx) / transform.scale;
      const y = (sy - transform.ty) / transform.scale;
      return { x, y };
    },
    [transform]
  );

  const onMouseDown = (e: React.MouseEvent) => {
    if (screenshotMode) {
      e.preventDefault();
      e.stopPropagation();
      const { x, y } = screenToContent(e.clientX, e.clientY);
      setSelection({ startX: x, startY: y, endX: x, endY: y });
      setIsSelecting(true);
      return;
    }
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, tx: transform.tx, ty: transform.ty };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (screenshotMode) {
      if (isSelecting && selection) {
        e.preventDefault();
        e.stopPropagation();
        const { x, y } = screenToContent(e.clientX, e.clientY);
        setSelection(s => s && { ...s, endX: x, endY: y });
      }
      return;
    }
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setTransform(prev => ({
      ...prev,
      tx: dragStart.current.tx + dx,
      ty: dragStart.current.ty + dy,
    }));
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (screenshotMode && selection) {
      e.preventDefault();
      e.stopPropagation();
      setIsSelecting(false);
    }
    setIsDragging(false);
  };

  const zoom = (dir: 'in' | 'out') => {
    const factor = dir === 'in' ? 1.2 : 1 / 1.2;
    setTransform(prev => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor));
      // Zoom toward center
      const vp = viewportRef.current;
      if (!vp) return { ...prev, scale: newScale };

      const rect = vp.getBoundingClientRect();
      const sx = rect.width / 2;
      const sy = rect.height / 2;
      const cx = (sx - prev.tx) / prev.scale;
      const cy = (sy - prev.ty) / prev.scale;
      const tx = sx - cx * newScale;
      const ty = sy - cy * newScale;

      return { tx, ty, scale: newScale };
    });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setPageNumber(p => Math.max(1, p - 1));
      if (e.key === 'ArrowRight') setPageNumber(p => Math.min(numPages || p, p + 1));
      if (e.key === '-' || e.key === '_') zoom('out');
      if (e.key === '=' || e.key === '+') zoom('in');
      if (e.key === '0') setTransform({ tx: 200, ty: 100, scale: 1 });
      if (e.key.toLowerCase() === 's') setScreenshotMode(v => !v);
      if (e.key === 'Escape' && screenshotMode) setScreenshotMode(false);
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [screenshotMode, numPages]);

  // Clear selection on page change
  useEffect(() => {
    setSelection(null);
    setScreenshotMode(false);
  }, [pageNumber]);

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
      if (!selection || !pageInstance || !activeCheck) return;

      const sx = Math.min(selection.startX, selection.endX);
      const sy = Math.min(selection.startY, selection.endY);
      const sw = Math.abs(selection.endX - selection.startX);
      const sh = Math.abs(selection.endY - selection.startY);

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
        setSelection(null);
        setScreenshotMode(false);
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
          page_number: pageNumber,
          crop_coordinates: {
            x: sx,
            y: sy,
            width: sw,
            height: sh,
            zoom_level: transform.scale,
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

      setSelection(null);
      setScreenshotMode(false);
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

  const zoomPct = Math.round(transform.scale * 100);

  return (
    <div
      ref={viewportRef}
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
          <>
            {console.log(
              'Rendering Save button - screenshotMode:',
              screenshotMode,
              'selection:',
              selection
            )}
            <button
              className="btn-secondary shadow-md"
              onClick={() => {
                console.log('Save button clicked!');
                capture();
              }}
            >
              Save
            </button>
          </>
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
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
            transformOrigin: '0 0',
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
        </div>
      </div>

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
