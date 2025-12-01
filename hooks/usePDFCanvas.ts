'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pdfjs } from 'react-pdf';
import { usePresignedUrl } from './usePresignedUrl';
import { usePdfDocument } from './usePdfDocument';
import { useViewTransform } from './useViewTransform';
import { renderPdfPage } from '@/lib/pdf/canvas-utils';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface Transform {
  tx: number;
  ty: number;
  scale: number;
}

interface UsePDFCanvasOptions {
  pdfUrl: string;
  /** Initial page number (default: 1) */
  initialPage?: number;
  /** Initial transform (default: centered) */
  initialTransform?: Transform;
  /** Render scale multiplier for quality (default: 4) */
  renderScale?: number;
  /** External page control - if provided, component is controlled */
  currentPage?: number;
  /** Callback when page changes */
  onPageChange?: (page: number) => void;
}

interface UsePDFCanvasReturn {
  // Refs to attach to DOM
  containerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;

  // State
  loading: boolean;
  error: string | null;
  pageNumber: number;
  numPages: number;
  transform: Transform;

  // Computed
  /** Base viewport dimensions (at scale 1) */
  viewport: { width: number; height: number } | null;

  // Actions
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  setTransform: (transform: Transform) => void;
  zoom: (direction: 'in' | 'out') => void;
  resetZoom: () => void;
  centerOn: (bounds: { x: number; y: number; width: number; height: number }) => void;

  // For attaching wheel zoom (call in useEffect)
  attachWheelZoom: () => () => void;
}

/**
 * Core hook for PDF canvas rendering with pan/zoom.
 *
 * Provides everything needed to render a PDF with basic navigation.
 * Doesn't include editing features (measurements, screenshots, etc.)
 *
 * @example
 * ```tsx
 * function SimplePDFViewer({ url }) {
 *   const pdf = usePDFCanvas({ pdfUrl: url });
 *
 *   useEffect(() => pdf.attachWheelZoom(), [pdf.attachWheelZoom]);
 *
 *   if (pdf.loading) return <Spinner />;
 *   if (pdf.error) return <Error message={pdf.error} />;
 *
 *   return (
 *     <div ref={pdf.containerRef}>
 *       <div style={{
 *         transform: `translate(${pdf.transform.tx}px, ${pdf.transform.ty}px) scale(${pdf.transform.scale})`,
 *         transformOrigin: '0 0',
 *       }}>
 *         <canvas ref={pdf.canvasRef} />
 *         {children}
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 */
export function usePDFCanvas({
  pdfUrl,
  initialPage = 1,
  initialTransform,
  renderScale = 4,
  currentPage: externalPage,
  onPageChange,
}: UsePDFCanvasOptions): UsePDFCanvasReturn {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  // Page state (internal, synced with external if provided)
  const [pageNumber, setPageNumber] = useState(externalPage ?? initialPage);

  // Transform state
  const [transform, setTransform] = useState<Transform>(
    initialTransform ?? { tx: 0, ty: 0, scale: 1 }
  );

  // Load presigned URL
  const { url: presignedUrl, loading: loadingUrl, error: urlError } = usePresignedUrl(pdfUrl);

  // Load PDF document and page
  const pdf = usePdfDocument(presignedUrl, pageNumber);
  const { page, numPages, loading: loadingPdf, error: pdfError } = pdf.state;

  // View transform helpers
  const viewTransform = useViewTransform(
    containerRef as React.RefObject<HTMLElement>,
    transform,
    setTransform
  );

  // Compute base viewport
  const viewport = useMemo(() => {
    if (!page) return null;
    try {
      const vp = page.getViewport({ scale: 1 });
      if (!vp || !Number.isFinite(vp.width) || !Number.isFinite(vp.height)) return null;
      return { width: vp.width, height: vp.height };
    } catch {
      return null;
    }
  }, [page]);

  // Sync with external page control
  useEffect(() => {
    if (externalPage !== undefined && externalPage !== pageNumber) {
      setPageNumber(externalPage);
    }
  }, [externalPage, pageNumber]);

  // Notify parent of page changes
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;

  useEffect(() => {
    onPageChangeRef.current?.(pageNumber);
  }, [pageNumber]);

  // Center page on initial load
  const initialCenterDone = useRef(false);
  useEffect(() => {
    if (!page || !viewport || !containerRef.current || initialCenterDone.current) return;

    const container = containerRef.current;
    const tx = Math.round((container.clientWidth - viewport.width) / 2);
    const ty = Math.round((container.clientHeight - viewport.height) / 2);

    setTransform({ tx, ty, scale: 1 });
    initialCenterDone.current = true;
  }, [page, viewport]);

  // Render page to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page) return;

    // Cancel previous render
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // Ignore
      }
      renderTaskRef.current = null;
    }

    const render = async () => {
      try {
        const result = renderPdfPage(page, canvas, { scaleMultiplier: renderScale });
        renderTaskRef.current = result.task;
        await result.task.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('[usePDFCanvas] Render error:', err);
        }
      } finally {
        renderTaskRef.current = null;
      }
    };

    render();
  }, [page, renderScale]);

  // Attach wheel zoom
  useEffect(() => {
    if (!containerRef.current) return;
    return viewTransform.attachWheelZoom();
  }, [viewTransform]);

  // Page navigation
  const setPage = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(numPages || 1, page));
      setPageNumber(clamped);
    },
    [numPages]
  );

  const nextPage = useCallback(() => {
    setPage(pageNumber + 1);
  }, [pageNumber, setPage]);

  const prevPage = useCallback(() => {
    setPage(pageNumber - 1);
  }, [pageNumber, setPage]);

  // Combined loading/error state
  const loading = loadingUrl || loadingPdf || !page;
  const error = urlError || pdfError;

  return useMemo(
    () => ({
      containerRef,
      canvasRef,
      loading,
      error,
      pageNumber,
      numPages,
      transform,
      viewport,
      setPage,
      nextPage,
      prevPage,
      setTransform,
      zoom: viewTransform.zoom,
      resetZoom: viewTransform.reset,
      centerOn: viewTransform.centerOn,
      attachWheelZoom: viewTransform.attachWheelZoom,
    }),
    [
      loading,
      error,
      pageNumber,
      numPages,
      transform,
      viewport,
      setPage,
      nextPage,
      prevPage,
      viewTransform.zoom,
      viewTransform.reset,
      viewTransform.centerOn,
      viewTransform.attachWheelZoom,
    ]
  );
}
