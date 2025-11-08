import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export const maxDuration = 60; // 60 seconds timeout for large PDFs

/**
 * GET: Extract PDF dimensions from the project's PDF and store in database
 * Returns the extracted dimensions
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  try {
    const supabase = supabaseAdmin();

    // Get project with PDF URL
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, pdf_url, pdf_width_inches, pdf_height_inches')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // If dimensions already exist, return them
    if (project.pdf_width_inches && project.pdf_height_inches) {
      return NextResponse.json({
        dimensions: {
          widthInches: project.pdf_width_inches,
          heightInches: project.pdf_height_inches,
        },
        cached: true,
      });
    }

    if (!project.pdf_url) {
      return NextResponse.json({ error: 'No PDF uploaded for this project' }, { status: 400 });
    }

    // Download and extract PDF dimensions
    const { downloadPdfFromUrl, getPdfPageSizesWithPdfLib } = await import('@/lib/pdf-extractor');

    const pdfBuffer = await downloadPdfFromUrl(project.pdf_url);
    const pages = await getPdfPageSizesWithPdfLib(new Uint8Array(pdfBuffer));

    if (pages.length === 0) {
      return NextResponse.json({ error: 'Failed to extract PDF dimensions' }, { status: 500 });
    }

    const firstPage = pages[0];

    // Update project with dimensions via PUT endpoint
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        pdf_width_points: firstPage.widthPoints,
        pdf_height_points: firstPage.heightPoints,
        pdf_width_inches: firstPage.widthIn,
        pdf_height_inches: firstPage.heightIn,
      })
      .eq('id', projectId);

    if (updateError) {
      console.error('[Dimensions] Error updating project:', updateError);
      return NextResponse.json({ error: 'Failed to store dimensions' }, { status: 500 });
    }

    return NextResponse.json({
      dimensions: {
        widthInches: firstPage.widthIn,
        heightInches: firstPage.heightIn,
      },
      cached: false,
    });
  } catch (error) {
    console.error('[Dimensions] Error:', error);
    return NextResponse.json(
      { error: 'Failed to extract PDF dimensions', details: String(error) },
      { status: 500 }
    );
  }
}
