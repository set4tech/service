import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { supabaseAdmin } from '@/lib/supabase-server';

function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { filename, contentType, projectId } = await request.json();
    const supabase = supabaseAdmin();
    const s3Client = getS3Client();

    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    let key;
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const originalName = filename.replace(/\.[^/.]+$/, ''); // Remove extension
    const extension = filename.split('.').pop(); // Get extension

    if (projectId) {
      // Get project details for human-readable filename
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .single();

      if (projectError || !project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      // Generate human-readable filename with project name
      const projectName = project.name.replace(/[^a-zA-Z0-9]/g, '_'); // Sanitize project name for filename
      key = `analysis-app-data/pdfs/${projectName}_${originalName}_${timestamp}.${extension}`;
    } else {
      // Generate temporary filename without project name (for upload before project creation)
      const randomId = Math.random().toString(36).substring(2, 15);
      key = `analysis-app-data/pdfs/temp_${originalName}_${timestamp}_${randomId}.${extension}`;
    }

    const bucketName = 'set4-data';

    // Create the PutObject command
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType || 'application/pdf',
    });

    // Generate pre-signed URL (valid for 5 minutes)
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    // Construct the final URL where the file will be accessible
    const fileUrl = `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;

    return NextResponse.json({
      uploadUrl,
      fileUrl,
      key,
    });
  } catch (error) {
    console.error('Error generating pre-signed URL:', error);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
