import { NextRequest, NextResponse } from 'next/server';
import { presignPut, s3KeyForPdf } from '@/lib/s3';

export async function POST(req: NextRequest) {
  const { projectId, filename } = await req.json();
  if (!projectId || !filename) return NextResponse.json({ error: 'projectId and filename required' }, { status: 400 });
  const key = s3KeyForPdf(projectId, filename);
  const url = await presignPut(key, 'application/pdf', 120);
  return NextResponse.json({ uploadUrl: url, key });
}