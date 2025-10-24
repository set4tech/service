import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

export async function POST(req: NextRequest) {
  const { checkIds, prompt, provider } = await req.json();
  if (!Array.isArray(checkIds) || checkIds.length === 0)
    return NextResponse.json({ error: 'checkIds required' }, { status: 400 });

  const jobIds: string[] = [];
  for (const checkId of checkIds) {
    const id = crypto.randomUUID();
    // Don't store screenshots in Redis to avoid OOM errors
    // The queue processor will fetch screenshots from the database
    await kv.hset(`job:${id}`, {
      id,
      type: 'analysis',
      payload: JSON.stringify({
        checkId,
        prompt,
        provider,
        // Don't store screenshots - fetch from DB during processing
        fetchScreenshots: true,
      }),
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      createdAt: Date.now(),
    });
    await kv.lpush('queue:analysis', id);
    jobIds.push(id);
  }
  return NextResponse.json({ status: 'queued', jobIds });
}
