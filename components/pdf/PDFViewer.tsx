'use client';

import { Document, Page, pdfjs } from 'react-pdf';
import { useCallback, useEffect, useRef, useState } from 'react';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

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

  const onDocLoad = ({ numPages }: { numPages: number }) => setNumPages(numPages);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const scaleSpeed = 0.007;
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
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (screenshotMode) {
      const rect = containerRef.current!.getBoundingClientRect();
      setSelection({
        startX: e.clientX - rect.left,
        startY: e.clientY - rect.top,
        endX: e.clientX - rect.left,
        endY: e.clientY - rect.top,
      });
      return;
    }
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (screenshotMode && selection) {
      const rect = containerRef.current!.getBoundingClientRect();
      setSelection(s => s && { ...s, endX: e.clientX - rect.left, endY: e.clientY - rect.top });
      return;
    }
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setTransform(prev => ({ ...prev, x: dragStart.current.tx + dx, y: dragStart.current.ty + dy }));
  };

  const onMouseUp = () => {
    setIsDragging(false);
  };

  const zoom = (dir: 'in' | 'out') => {
    const factor = dir === 'in' ? 1.2 : 1 / 1.2;
    setTransform(prev => ({
      ...prev,
      scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor)),
    }));
  };

  // Advanced: access raw pdf via pdfjs for cropping
  useEffect(() => {
    (async () => {
      const loadingTask = pdfjs.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      setPdfInstance(pdf);
    })();
  }, [pdfUrl]);

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

  return (
    <div className="relative h-full w-full">
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button className="px-3 py-2 border rounded" onClick={() => zoom('out')}>
          −
        </button>
        <button className="px-3 py-2 border rounded" onClick={() => zoom('in')}>
          +
        </button>
        <button
          className={`px-3 py-2 border rounded ${screenshotMode ? 'bg-blue-600 text-white' : ''}`}
          onClick={() => setScreenshotMode(v => !v)}
        >
          📸 Screenshot
        </button>
        {screenshotMode && selection && (
          <button className="px-3 py-2 border rounded" onClick={capture}>
            Save
          </button>
        )}
      </div>

      <div
        ref={containerRef}
        className={`absolute inset-0 overflow-hidden ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onWheel={handleWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => setIsDragging(false)}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
        >
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocLoad}
            loading={<div className="text-sm text-gray-500">Loading PDF…</div>}
          >
            <Page
              pageNumber={pageNumber}
              height={800}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </Document>
        </div>

        {screenshotMode && selection && (
          <div
            className="absolute border-2 border-blue-600/80 bg-blue-600/10"
            style={{
              left: Math.min(selection.startX, selection.endX),
              top: Math.min(selection.startY, selection.endY),
              width: Math.abs(selection.endX - selection.startX),
              height: Math.abs(selection.endY - selection.startY),
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 bg-white/90 rounded px-2 py-1 border">
        <button
          className="px-2 py-1 border rounded"
          onClick={() => setPageNumber(p => Math.max(1, p - 1))}
        >
          ◀
        </button>
        <div className="text-sm">
          Page {pageNumber} / {numPages || '…'}
        </div>
        <button
          className="px-2 py-1 border rounded"
          onClick={() => setPageNumber(p => Math.min(numPages || p, p + 1))}
        >
          ▶
        </button>
      </div>
    </div>
  );
}
