import { createClient } from '@supabase/supabase-js';

// Retry fetch with exponential backoff
async function fetchWithRetry(
  url: RequestInfo | URL,
  options: RequestInit | undefined,
  retries = 3
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      return await globalThis.fetch(url, {
        ...options,
        // Add timeout
        signal: options?.signal || AbortSignal.timeout(30000),
      });
    } catch (error) {
      const urlString =
        typeof url === 'string' ? url : url instanceof URL ? url.toString() : '[Request object]';
      console.error(`[SUPABASE] Fetch attempt ${i + 1} failed for ${urlString}:`, error);

      // If this was the last retry, throw the error
      if (i === retries - 1) {
        throw error;
      }

      // Wait before retrying (exponential backoff: 100ms, 200ms, 400ms...)
      const delay = Math.pow(2, i) * 100;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('All retries failed');
}

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (requestUrl, options) => fetchWithRetry(requestUrl, options, 3),
    },
  });
}
