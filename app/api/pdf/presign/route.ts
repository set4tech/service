import { NextRequest, NextResponse } from 'next/server';
import { presignGet } from '@/lib/s3';

export async function POST(req: NextRequest) {
  try {
    const { pdfUrl } = await req.json();
    if (!pdfUrl) return NextResponse.json({ error: 'pdfUrl required' }, { status: 400 });

    // Extract key from S3 URL (supports both https://bucket.s3.region.amazonaws.com/key and s3://bucket/key formats)
    let key: string;
    if (pdfUrl.startsWith('s3://')) {
      const parts = pdfUrl.replace('s3://', '').split('/');
      key = parts.slice(1).join('/');
    } else if (pdfUrl.includes('.s3.') || pdfUrl.includes('.s3-')) {
      const url = new URL(pdfUrl);
      // Decode the pathname to handle URL-encoded characters properly
      key = decodeURIComponent(url.pathname.slice(1)); // Remove leading slash and decode
    } else {
      return NextResponse.json({ error: 'Invalid S3 URL format' }, { status: 400 });
    }

    const presignedUrl = await presignGet(key, 3600); // 1 hour expiry
    return NextResponse.json({ url: presignedUrl });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate presigned URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
