import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Configure max file size to 50MB (default is 4MB)
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds timeout

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(request: NextRequest) {
  try {
    // Check content length header to prevent large uploads early
    const contentLength = request.headers.get('content-length');
    const MAX_SIZE = 4.5 * 1024 * 1024; // 4.5MB for Vercel Hobby plan

    if (contentLength && parseInt(contentLength) > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 4.5MB for Vercel Hobby plan.' },
        { status: 413 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Additional size check
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 4.5MB for Vercel Hobby plan.' },
        { status: 413 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate unique filename with hardcoded bucket and prefix
    const timestamp = Date.now();
    const filename = `analysis-app-data/pdfs/${timestamp}-${file.name}`;
    const bucketName = 'set4-data';

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: filename,
      Body: buffer,
      ContentType: 'application/pdf',
    });

    await s3Client.send(command);

    // Construct the public URL
    const url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${filename}`;

    return NextResponse.json({ url });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
