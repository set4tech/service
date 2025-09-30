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
    const { screenshotUrl, thumbnailUrl } = await req.json();

    // Extract keys from s3:// URLs
    const getKey = (url: string) => {
      if (url.startsWith('s3://')) {
        const parts = url.replace('s3://', '').split('/');
        parts.shift(); // Remove bucket name
        return parts.join('/');
      }
      return url;
    };

    const screenshotKey = getKey(screenshotUrl);
    const thumbnailKey = getKey(thumbnailUrl);

    // Generate presigned URLs for viewing (1 hour expiry)
    const [screenshotPresigned, thumbnailPresigned] = await Promise.all([
      getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: 'set4-data',
          Key: screenshotKey,
        }),
        { expiresIn: 3600 }
      ),
      getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: 'set4-data',
          Key: thumbnailKey,
        }),
        { expiresIn: 3600 }
      ),
    ]);

    return NextResponse.json({
      screenshot: screenshotPresigned,
      thumbnail: thumbnailPresigned,
    });
  } catch (error) {
    console.error('Failed to generate presigned URLs:', error);
    return NextResponse.json({ error: 'Failed to generate URLs' }, { status: 500 });
  }
}
