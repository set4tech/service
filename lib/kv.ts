import { createClient } from '@vercel/kv';

// Use KV_URL for Redis Cloud or KV_REST_API_URL for Vercel KV
const kv = createClient({
  url: process.env.KV_URL || process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN || process.env.KV_URL!,
});

export { kv };