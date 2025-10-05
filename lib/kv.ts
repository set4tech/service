import { createClient } from 'redis';

// Only create Redis client if connection URL is provided
const REDIS_URL = process.env.KV_URL || process.env.REDIS_URL;
const client = REDIS_URL ? createClient({ url: REDIS_URL }) : null;

let isConnecting = false;

if (client) {
  client.on('error', err => console.error('Redis Client Error', err));

  // Start connection
  if (!client.isOpen) {
    isConnecting = true;
    client
      .connect()
      .then(() => {
        isConnecting = false;
      })
      .catch(err => {
        console.error('Failed to connect to Redis:', err);
        isConnecting = false;
      });
  }
}

// Helper to ensure client is connected
async function ensureConnected() {
  if (!client) {
    throw new Error('Redis/KV not configured. Set REDIS_URL or KV_URL environment variable.');
  }

  // Wait for connection if currently connecting
  if (isConnecting) {
    let attempts = 0;
    while (isConnecting && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
  }

  if (!client.isOpen) {
    throw new Error('Redis client is not connected');
  }
}

// Create a KV-compatible wrapper around Redis client
export const kv = {
  async rpop<T = string>(key: string): Promise<T | null> {
    if (!client) {
      console.warn('Redis not configured, rpop returning null');
      return null;
    }
    await ensureConnected();
    const result = await client.rPop(key);
    // eslint-disable-next-line no-console
    console.log(`[KV] rpop('${key}'): ${result || 'null'}`);
    // Return the string directly - no JSON parsing needed for string IDs
    return (result as T) || null;
  },

  async lpush(key: string, ...values: string[]): Promise<number> {
    if (!client) {
      console.error('CRITICAL: Redis not configured - cannot queue jobs!');
      throw new Error('Redis/KV not configured. Set REDIS_URL or KV_URL environment variable.');
    }
    await ensureConnected();
    // Don't JSON.stringify strings - Redis lpush already handles strings
    const count = await client.lPush(key, values);
    // eslint-disable-next-line no-console
    console.log(`[KV] lpush('${key}', ${values.length} values): queue length now ${count}`);
    return count;
  },

  async hgetall<T = any>(key: string): Promise<T | null> {
    if (!client) {
      console.warn('Redis not configured, hgetall returning null');
      return null;
    }
    await ensureConnected();
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
    await ensureConnected();
    const serialized: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      serialized[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return client.hSet(key, serialized);
  },
};
