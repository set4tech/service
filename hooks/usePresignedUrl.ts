import { useState, useEffect } from 'react';

interface CacheEntry {
  url: string;
  expiresAt: number;
}

// Module-level cache (persists across component mounts)
const CACHE = new Map<string, CacheEntry>();
const INFLIGHT = new Map<string, Promise<string>>();
const CACHE_DURATION_MS = 50 * 60 * 1000; // 50 minutes

/**
 * Hook for fetching and caching presigned URLs for S3 objects.
 *
 * Features:
 * - In-memory cache with expiration
 * - Request deduplication (multiple components requesting same URL)
 * - Automatic refresh before expiration
 *
 * @example
 * ```typescript
 * const { url, loading, error } = usePresignedUrl('s3://bucket/file.pdf');
 *
 * if (loading) return <Spinner />;
 * if (error) return <Error />;
 * if (!url) return null;
 *
 * return <PDFViewer pdfUrl={url} />;
 * ```
 */
export function usePresignedUrl(originalUrl: string | null): {
  url: string | null;
  loading: boolean;
  error: string | null;
} {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!originalUrl);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!originalUrl) {
      setUrl(null);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);

      try {
        // Check cache first
        const cached = CACHE.get(originalUrl);
        if (cached && cached.expiresAt > Date.now()) {
          if (!cancelled) {
            setUrl(cached.url);
            setLoading(false);
          }
          return;
        }

        // Check if request is already in-flight
        let inflightPromise = INFLIGHT.get(originalUrl);

        if (!inflightPromise) {
          // Start new request
          inflightPromise = (async () => {
            const response = await fetch('/api/pdf/presign', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pdfUrl: originalUrl }),
            });

            if (!response.ok) {
              throw new Error(`Presign failed: ${response.status}`);
            }

            const data = await response.json();

            // Cache the result
            CACHE.set(originalUrl, {
              url: data.url,
              expiresAt: Date.now() + CACHE_DURATION_MS,
            });

            // Clear in-flight marker
            INFLIGHT.delete(originalUrl);

            return data.url;
          })();

          INFLIGHT.set(originalUrl, inflightPromise);
        }

        // Wait for promise (whether new or existing)
        const presignedUrl = await inflightPromise;

        if (!cancelled) {
          setUrl(presignedUrl);
          setLoading(false);
        }
      } catch (err) {
        console.error('[usePresignedUrl] Error:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load URL');
          setUrl(null);
          setLoading(false);
        }
        // Clean up in-flight on error
        INFLIGHT.delete(originalUrl);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [originalUrl]);

  return { url, loading, error };
}

/**
 * Clear the presigned URL cache.
 * Useful for testing or forcing refresh.
 */
export function clearPresignCache(): void {
  CACHE.clear();
  INFLIGHT.clear();
}

/**
 * Get cache statistics for debugging.
 */
export function getPresignCacheStats() {
  return {
    cached: CACHE.size,
    inflight: INFLIGHT.size,
    entries: Array.from(CACHE.entries()).map(([url, entry]) => ({
      url,
      expiresIn: Math.max(0, entry.expiresAt - Date.now()),
    })),
  };
}
