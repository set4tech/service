import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

export async function POST(req: NextRequest) {
  const { checkIds, prompt, screenshots, provider } = await req.json();
  if (!Array.isArray(checkIds) || checkIds.length === 0) return NextResponse.json({ error: 'checkIds required' }, { status: 400 });

  const jobIds: string[] = [];
  for (const checkId of checkIds) {
    const id = crypto.randomUUID();
    await kv.hset(`job:${id}`, {
      id,
      type: 'analysis',
      payload: JSON.stringify({ checkId, prompt, screenshots, provider }),
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      createdAt: Date.now()
    });
    await kv.lpush('queue:analysis', id);
    jobIds.push(id);
  }
  return NextResponse.json({ status: 'queued', jobIds });
}