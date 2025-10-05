import { createClient } from 'redis';

// Only create Redis client if connection URL is provided
const REDIS_URL = process.env.KV_URL || process.env.REDIS_URL;
console.log('[KV] Redis URL present:', !!REDIS_URL);
const client = REDIS_URL ? createClient({ url: REDIS_URL }) : null;

if (client) {
  client.on('error', err => console.error('Redis Client Error', err));

  // Connect to Redis if not already connected
  if (!client.isOpen) {
    client.connect().catch(console.error);
  }
}

// Create a KV-compatible wrapper around Redis client
export const kv = {
  async rpop<T = string>(key: string): Promise<T | null> {
    if (!client) {
      console.warn('Redis not configured, rpop returning null');
      return null;
    }
    const result = await client.rPop(key);
    // Return the string directly - no JSON parsing needed for string IDs
    return (result as T) || null;
  },

  async lpush(key: string, ...values: string[]): Promise<number> {
    if (!client) {
      console.error('CRITICAL: Redis not configured - cannot queue jobs!');
      throw new Error('Redis/KV not configured. Set REDIS_URL or KV_URL environment variable.');
    }
    // Don't JSON.stringify strings - Redis lpush already handles strings
    return client.lPush(key, values);
  },

  async hgetall<T = any>(key: string): Promise<T | null> {
    if (!client) {
      console.warn('Redis not configured, hgetall returning null');
      return null;
    }
    const result = await client.hGetAll(key);
    if (!result || Object.keys(result).length === 0) return null;

    // Parse JSON values
    const parsed: any = {};
    for (const [k, v] of Object.entries(result)) {
      try {
        parsed[k] = JSON.parse(v);
      } catch {
        parsed[k] = v;
      }
    }
    return parsed as T;
  },

  async hset(key: string, values: Record<string, any>): Promise<number> {
    if (!client) {
      console.warn('Redis not configured, hset returning 0');
      return 0;
    }
    const serialized: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      serialized[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return client.hSet(key, serialized);
  },
};
