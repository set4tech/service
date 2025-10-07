import { NextRequest, NextResponse } from 'next/server';
import { presignGet } from '@/lib/s3';

export async function POST(req: NextRequest) {
  try {
    const { pdfUrl } = await req.json();
    if (!pdfUrl) return NextResponse.json({ error: 'pdfUrl required' }, { status: 400 });

    console.log('[PDF Presign] Processing URL:', pdfUrl);

    // Extract key from S3 URL (supports both https://bucket.s3.region.amazonaws.com/key and s3://bucket/key formats)
    let key: string;
    if (pdfUrl.startsWith('s3://')) {
      const parts = pdfUrl.replace('s3://', '').split('/');
      key = parts.slice(1).join('/');
    } else if (pdfUrl.includes('.s3.') || pdfUrl.includes('.s3-')) {
      const url = new URL(pdfUrl);
      // URL.pathname is already decoded by the URL constructor, just remove leading slash
      // Don't use decodeURIComponent again as it will fail on malformed sequences (e.g., "100%" without hex digits)
      key = url.pathname.slice(1); // Remove leading slash
    } else {
      console.error('[PDF Presign] Invalid S3 URL format:', pdfUrl);
      return NextResponse.json(
        { error: 'Invalid S3 URL format', receivedUrl: pdfUrl },
        { status: 400 }
      );
    }

    console.log('[PDF Presign] Extracted key:', key);
    const presignedUrl = await presignGet(key, 3600); // 1 hour expiry
    return NextResponse.json({ url: presignedUrl });
  } catch (error) {
    console.error('[PDF Presign] Error generating presigned URL:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate presigned URL',
        details: error instanceof Error ? error.message : 'Unknown error',
        pdfUrl: req.nextUrl ? 'URL received' : 'No URL',
      },
      { status: 500 }
    );
  }
}
