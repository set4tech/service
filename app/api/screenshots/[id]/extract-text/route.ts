import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { extractTextFromImage } from '@/lib/vision-ocr';
import { presignGet } from '@/lib/s3';

/**
 * POST /api/screenshots/[id]/extract-text
 * Extract text from screenshot image using vision OCR
 * This is meant to be called asynchronously after screenshot upload
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  console.log('[OCR] Starting text extraction for screenshot:', id);

  try {
    const supabase = supabaseAdmin();

    // 1. Get screenshot metadata
    const { data: screenshot, error: fetchError } = await supabase
      .from('screenshots')
      .select('id, screenshot_url, extracted_text')
      .eq('id', id)
      .single();

    if (fetchError || !screenshot) {
      console.error('[OCR] Screenshot not found:', id, fetchError);
      return NextResponse.json({ error: 'Screenshot not found' }, { status: 404 });
    }

    // Skip if already has extracted text (avoid reprocessing)
    if (screenshot.extracted_text && screenshot.extracted_text.trim().length > 0) {
      console.log('[OCR] Screenshot already has extracted text, skipping');
      return NextResponse.json({
        message: 'Already extracted',
        text: screenshot.extracted_text,
      });
    }

    // 2. Parse S3 URL and get presigned download URL
    const s3Url = screenshot.screenshot_url;
    if (!s3Url.startsWith('s3://')) {
      console.error('[OCR] Invalid S3 URL format:', s3Url);
      return NextResponse.json({ error: 'Invalid S3 URL format' }, { status: 400 });
    }

    // Extract S3 key from s3://bucket/key format
    const s3Key = s3Url.replace(/^s3:\/\/[^/]+\//, '');
    console.log('[OCR] S3 key:', s3Key);

    // Get presigned download URL
    const downloadUrl = await presignGet(s3Key, 300); // 5 minute expiry

    // 3. Extract text using vision OCR
    console.log('[OCR] Calling vision OCR...');
    const result = await extractTextFromImage(downloadUrl);

    if (result.error) {
      console.error('[OCR] Vision OCR failed:', result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // 4. Update screenshot with extracted text
    const { error: updateError } = await supabase
      .from('screenshots')
      .update({ extracted_text: result.text })
      .eq('id', id);

    if (updateError) {
      console.error('[OCR] Failed to update screenshot:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log('[OCR] Successfully extracted and saved text:', result.text.length, 'characters');

    return NextResponse.json({
      message: 'Text extracted successfully',
      text: result.text,
      provider: result.provider,
      length: result.text.length,
    });
  } catch (error) {
    console.error('[OCR] Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Failed to extract text',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
