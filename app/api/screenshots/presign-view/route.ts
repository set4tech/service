import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Support both single URL format and array format
    const screenshotUrls = body.screenshotUrls || (body.screenshotUrl ? [body.screenshotUrl] : []);
    const thumbnailUrls = body.thumbnailUrls || (body.thumbnailUrl ? [body.thumbnailUrl] : []);

    // Extract keys from s3:// URLs
    const getKey = (url: string | null | undefined): string | null => {
      if (!url || url === '') return null;
      if (url.startsWith('s3://')) {
        const parts = url.replace('s3://', '').split('/');
        parts.shift(); // Remove bucket name
        return parts.join('/');
      }
      return url;
    };

    // Generate presigned URLs for all provided screenshots
    const presignedScreenshots = await Promise.all(
      screenshotUrls.filter(Boolean).map(async (url: string) => {
        const key = getKey(url);
        if (!key) return null;
        return getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: 'set4-data',
            Key: key,
          }),
          { expiresIn: 3600 }
        );
      })
    );

    const presignedThumbnails = await Promise.all(
      thumbnailUrls.filter(Boolean).map(async (url: string) => {
        const key = getKey(url);
        if (!key) return null;
        return getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: 'set4-data',
            Key: key,
          }),
          { expiresIn: 3600 }
        );
      })
    );

    // Return both array format (new) and single format (legacy)
    return NextResponse.json({
      presignedUrls: presignedScreenshots.filter(Boolean),
      presignedThumbnails: presignedThumbnails.filter(Boolean),
      // Legacy format for backwards compatibility
      screenshot: presignedScreenshots[0] || null,
      thumbnail: presignedThumbnails[0] || null,
    });
  } catch (error) {
    console.error('Failed to generate presigned URLs:', error);
    return NextResponse.json({ error: 'Failed to generate URLs' }, { status: 500 });
  }
}
