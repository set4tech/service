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

      // URL.pathname keeps URL encoding, so we need to decode it
      // But decodeURIComponent fails on malformed sequences like "100%" (% not followed by hex)
      // Solution: Replace standalone % with a placeholder, decode, then restore
      const pathname = url.pathname.slice(1); // Remove leading slash

      try {
        // Try direct decode first
        key = decodeURIComponent(pathname);
      } catch {
        // If that fails, it's likely due to a standalone % character
        // Replace %<non-hex> patterns with a placeholder
        const safePath = pathname.replace(/%(?![0-9A-Fa-f]{2})/g, '___PERCENT___');
        key = decodeURIComponent(safePath).replace(/___PERCENT___/g, '%');
      }
    } else {
      console.error('[PDF Presign] Invalid S3 URL format:', pdfUrl);
      return NextResponse.json(
        { error: 'Invalid S3 URL format', receivedUrl: pdfUrl },
        { status: 400 }
      );
    }

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
