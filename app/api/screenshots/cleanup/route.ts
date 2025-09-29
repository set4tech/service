import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '@/lib/s3';

export async function POST(request: NextRequest) {
  try {
    const { keys } = await request.json();

    if (!Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json({ error: 'Invalid keys array' }, { status: 400 });
    }

    const bucket = process.env.AWS_S3_BUCKET_NAME;
    if (!bucket) {
      return NextResponse.json({ error: 'S3 bucket not configured' }, { status: 500 });
    }

    // Delete all keys (best effort, don't fail if some don't exist)
    await Promise.allSettled(
      keys.map(key =>
        s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
          })
        )
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Cleanup failed:', error);
    return NextResponse.json(
      {
        error: 'Cleanup failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
