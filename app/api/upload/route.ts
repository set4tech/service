import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // Check content length header to prevent large uploads early
    const contentLength = request.headers.get('content-length');
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB for Vercel Pro plan

    if (contentLength && parseInt(contentLength) > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 50MB.' }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const projectId = formData.get('projectId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Additional size check
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 50MB.' }, { status: 413 });
    }

    // Get project details for human-readable filename
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate human-readable filename
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const projectName = project.name.replace(/[^a-zA-Z0-9]/g, '_'); // Sanitize project name for filename
    const originalName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
    const extension = file.name.split('.').pop(); // Get extension
    const filename = `analysis-app-data/pdfs/${projectName}_${originalName}_${timestamp}.${extension}`;
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
