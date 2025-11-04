import { useState, useEffect } from 'react';
import { pdfjs } from 'react-pdf';
import type { HookReturn } from '@/lib/hooks/types';

interface PdfDocumentState {
  doc: any | null;
  page: any | null;
  numPages: number;
  loading: boolean;
  error: string | null;
}

interface PdfDocumentActions {
  setPage: (pageNumber: number) => void;
}

/**
 * Hook for loading and managing PDF.js document and page instances.
 * 
 * Features:
 * - Loads PDF document from presigned URL
 * - Loads specific page on demand
 * - Handles loading states and errors
 * - Automatic cleanup on unmount
 * 
 * @example
 * ```typescript
 * const pdf = usePdfDocument(presignedUrl, pageNumber);
 * 
 * if (pdf.state.loading) return <Spinner />;
 * if (pdf.state.error) return <Error message={pdf.state.error} />;
 * if (!pdf.state.page) return null;
 * 
 * // Render page
 * await page.render({ canvasContext: ctx, viewport });
 * ```
 */
export function usePdfDocument(
  presignedUrl: string | null,
  pageNumber: number
): HookReturn<PdfDocumentState, PdfDocumentActions> {
  const [doc, setDoc] = useState<any>(null);
  const [page, setPage] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load PDF document
  useEffect(() => {
    if (!presignedUrl) {
      setDoc(null);
      setNumPages(0);
      setPage(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const loadingTask = pdfjs.getDocument({
      url: presignedUrl,
      disableAutoFetch: false,
      disableStream: false,
      disableRange: false,
    });

    loadingTask.promise
      .then((document) => {
        if (cancelled) return;
        setDoc(document);
        setNumPages(document.numPages);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[usePdfDocument] Failed to load PDF:', err);
        setError(err.message || 'Failed to load PDF');
        setDoc(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      try {
        loadingTask.destroy();
      } catch (_err) {
        // Ignore cleanup errors
      }
    };
  }, [presignedUrl]);

  // Track current page to avoid redundant loads
  const [currentPageNumber, setCurrentPageNumber] = useState<number | null>(null);

  // Load specific page
  useEffect(() => {
    if (!doc || !pageNumber) {
      setPage(null);
      return;
    }

    // Skip if we're already on this page
    if (currentPageNumber === pageNumber) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    doc
      .getPage(pageNumber)
      .then((p: any) => {
        if (cancelled) return;
        setPage(p);
        setCurrentPageNumber(pageNumber);
        setLoading(false);
      })
      .catch((err: any) => {
        if (cancelled) return;
        console.error('[usePdfDocument] Failed to load page:', err);
        setError(err.message || `Failed to load page ${pageNumber}`);
        setPage(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [doc, pageNumber, currentPageNumber]);

  // Reset page tracking when document changes
  useEffect(() => {
    setCurrentPageNumber(null);
  }, [doc]);

  return {
    state: {
      doc,
      page,
      numPages,
      loading,
      error,
    },
    actions: {
      setPage: setCurrentPageNumber,
    },
  };
}
