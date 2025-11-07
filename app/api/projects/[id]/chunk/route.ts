import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export const maxDuration = 600; // 10 minutes for large PDFs

const CHUNK_SIZE = 3000; // Characters per chunk
const OVERLAP_SIZE = 200; // Overlap to avoid splitting words

/**
 * Chunk text with overlap to prevent splitting words across boundaries
 */
function chunkText(
  text: string,
  pageNumber: number
): Array<{ page_number: number; chunk_number: number; content: string }> {
  const chunks: Array<{ page_number: number; chunk_number: number; content: string }> = [];

  if (text.length <= CHUNK_SIZE) {
    chunks.push({
      page_number: pageNumber,
      chunk_number: 0,
      content: text,
    });
    return chunks;
  }

  let start = 0;
  let chunkNumber = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const chunk = text.slice(start, end);

    chunks.push({
      page_number: pageNumber,
      chunk_number: chunkNumber,
      content: chunk,
    });

    chunkNumber++;
    // Move start forward, but overlap by OVERLAP_SIZE
    start = end - OVERLAP_SIZE;

    // Avoid infinite loop if we're at the end
    if (start >= text.length - OVERLAP_SIZE) {
      break;
    }
  }

  return chunks;
}

/**
 * POST: Chunk PDF text and store in database
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  try {
    // Dynamic import to avoid build-time issues with pdf-parse
    const { downloadPdfFromUrl, extractPdfWithPages } = await import('@/lib/pdf-extractor');

    const supabase = supabaseAdmin();

    // Get project with PDF URL
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, pdf_url, chunking_status')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (!project.pdf_url) {
      return NextResponse.json({ error: 'No PDF uploaded for this project' }, { status: 400 });
    }

    // Check if already processing
    if (project.chunking_status === 'processing') {
      return NextResponse.json({ error: 'Chunking already in progress' }, { status: 409 });
    }

    // Update status to processing
    await supabase
      .from('projects')
      .update({
        chunking_status: 'processing',
        chunking_started_at: new Date().toISOString(),
        chunking_error: null,
      })
      .eq('id', projectId);

    // Download and extract PDF
    console.log('[Chunking] Downloading PDF from:', project.pdf_url);
    const pdfBuffer = await downloadPdfFromUrl(project.pdf_url);

    console.log('[Chunking] Extracting text from PDF...');
    const pagesContent = await extractPdfWithPages(pdfBuffer);

    if (pagesContent.length === 0) {
      await supabase
        .from('projects')
        .update({
          chunking_status: 'failed',
          chunking_error: 'Failed to extract text from PDF',
          chunking_completed_at: new Date().toISOString(),
        })
        .eq('id', projectId);

      return NextResponse.json({ error: 'Failed to extract text from PDF' }, { status: 500 });
    }

    console.log(`[Chunking] Extracted ${pagesContent.length} pages`);

    // Chunk all pages
    const allChunks: Array<{
      project_id: string;
      page_number: number;
      chunk_number: number;
      content: string;
    }> = [];

    for (let i = 0; i < pagesContent.length; i++) {
      const pageText = pagesContent[i].text;
      const pageNumber = i + 1; // 1-indexed page numbers

      const pageChunks = chunkText(pageText, pageNumber);

      for (const chunk of pageChunks) {
        allChunks.push({
          project_id: projectId,
          ...chunk,
        });
      }
    }

    console.log(
      `[Chunking] Created ${allChunks.length} chunks across ${pagesContent.length} pages`
    );

    // Delete existing chunks for this project (if re-chunking)
    await supabase.from('pdf_chunks').delete().eq('project_id', projectId);

    // Insert chunks in batches (Supabase has a limit on bulk inserts)
    const BATCH_SIZE = 1000;
    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
      const batch = allChunks.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase.from('pdf_chunks').insert(batch);

      if (insertError) {
        console.error('[Chunking] Error inserting chunks:', insertError);
        throw insertError;
      }
    }

    // Update status to completed
    await supabase
      .from('projects')
      .update({
        chunking_status: 'completed',
        chunking_completed_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    console.log('[Chunking] Completed successfully');

    return NextResponse.json({
      success: true,
      stats: {
        total_pages: pagesContent.length,
        total_chunks: allChunks.length,
        avg_chunks_per_page: (allChunks.length / pagesContent.length).toFixed(2),
      },
    });
  } catch (error: any) {
    console.error('[Chunking] Error:', error);

    // Update status to failed
    const supabase = supabaseAdmin();
    await supabase
      .from('projects')
      .update({
        chunking_status: 'failed',
        chunking_error: error.message || 'Unknown error',
        chunking_completed_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    return NextResponse.json({ error: error.message || 'Failed to chunk PDF' }, { status: 500 });
  }
}

/**
 * GET: Check chunking status
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  try {
    const supabase = supabaseAdmin();

    const { data: project, error } = await supabase
      .from('projects')
      .select('chunking_status, chunking_error, chunking_started_at, chunking_completed_at')
      .eq('id', projectId)
      .single();

    if (error || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Also get chunk count if completed
    let chunkCount = 0;
    if (project.chunking_status === 'completed') {
      const { count } = await supabase
        .from('pdf_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId);

      chunkCount = count || 0;
    }

    return NextResponse.json({
      status: project.chunking_status,
      error: project.chunking_error,
      started_at: project.chunking_started_at,
      completed_at: project.chunking_completed_at,
      chunk_count: chunkCount,
    });
  } catch (error: any) {
    console.error('[Chunking] Error fetching status:', error);
    return NextResponse.json({ error: 'Failed to fetch chunking status' }, { status: 500 });
  }
}
