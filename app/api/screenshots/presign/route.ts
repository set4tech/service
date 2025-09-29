import { NextRequest, NextResponse } from 'next/server';
import { presignPut, s3KeyForScreenshot, s3KeyForThumb } from '@/lib/s3';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  const { projectId, checkId } = await req.json();
  if (!projectId || !checkId) return NextResponse.json({ error: 'projectId and checkId required' }, { status: 400 });
  const screenshotId = randomUUID();
  const key = s3KeyForScreenshot(projectId, checkId, screenshotId);
  const tkey = s3KeyForThumb(projectId, checkId, screenshotId);
  const uploadUrl = await presignPut(key, 'image/png', 120);
  const thumbUploadUrl = await presignPut(tkey, 'image/png', 120);
  return NextResponse.json({ screenshotId, key, uploadUrl, thumbKey: tkey, thumbUploadUrl });
}