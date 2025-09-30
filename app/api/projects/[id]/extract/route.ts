import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { downloadPdfFromUrl, extractPdfWithPages, formatPdfForLlm } from '@/lib/pdf-extractor';
import { extractAllVariables, cleanExtractedVariables, type VariableChecklist } from '@/lib/gemini-extractor';
import fs from 'fs/promises';
import path from 'path';

export const maxDuration = 600; // 10 minutes for large PDFs

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const supabase = supabaseAdmin();

    // Get project with PDF URL
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, pdf_url, extraction_status')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    if (!project.pdf_url) {
      return NextResponse.json(
        { error: 'No PDF uploaded for this project' },
        { status: 400 }
      );
    }

    // Check if already processing
    if (project.extraction_status === 'processing') {
      return NextResponse.json(
        { error: 'Extraction already in progress' },
        { status: 409 }
      );
    }

    // Update status to processing
    await supabase
      .from('projects')
      .update({
        extraction_status: 'processing',
        extraction_started_at: new Date().toISOString(),
        extraction_error: null
      })
      .eq('id', projectId);

    // Load variable checklist
    const checklistPath = path.join(process.cwd(), 'public', 'variable_checklist.json');
    const checklistData = await fs.readFile(checklistPath, 'utf-8');
    const checklist: VariableChecklist = JSON.parse(checklistData);

    // Download and extract PDF
    console.log('Downloading PDF from:', project.pdf_url);
    const pdfBuffer = await downloadPdfFromUrl(project.pdf_url);

    console.log('Extracting text from PDF...');
    const pagesContent = await extractPdfWithPages(pdfBuffer);

    if (pagesContent.length === 0) {
      await supabase
        .from('projects')
        .update({
          extraction_status: 'failed',
          extraction_error: 'Failed to extract text from PDF',
          extraction_completed_at: new Date().toISOString()
        })
        .eq('id', projectId);

      return NextResponse.json(
        { error: 'Failed to extract text from PDF' },
        { status: 500 }
      );
    }

    console.log(`Extracted ${pagesContent.length} pages`);

    // Format for LLM
    const formattedPdf = formatPdfForLlm(pagesContent);
    console.log(`Formatted PDF: ${formattedPdf.length} characters`);

    // Calculate chunks
    const maxCharsPerChunk = 40000;
    const numChunks = Math.ceil(formattedPdf.length / maxCharsPerChunk);
    if (numChunks > 1) {
      console.log(`Document will be processed in ${numChunks} chunks`);
    }

    // Extract variables with progress tracking
    console.log('Starting variable extraction...');
    const extractedVariables = await extractAllVariables(
      checklist,
      formattedPdf,
      async (current, total, category, variable) => {
        // Update progress in database
        await supabase
          .from('projects')
          .update({
            extraction_progress: {
              current,
              total,
              category,
              variable
            }
          })
          .eq('id', projectId);

        console.log(`[${current}/${total}] ${category} -> ${variable}`);
      }
    );

    // Clean the extracted variables
    const cleanedVariables = cleanExtractedVariables(extractedVariables);

    // Add metadata
    const finalVariables = {
      ...cleanedVariables,
      _metadata: {
        extraction_date: new Date().toISOString(),
        total_pages: pagesContent.length,
        document_size_chars: formattedPdf.length,
        chunks_processed: numChunks,
        checklist_version: 'variable_checklist.json'
      }
    };

    // Save to database
    await supabase
      .from('projects')
      .update({
        extracted_variables: finalVariables,
        extraction_status: 'completed',
        extraction_completed_at: new Date().toISOString(),
        extraction_progress: null
      })
      .eq('id', projectId);

    console.log('Variable extraction completed successfully');

    return NextResponse.json({
      success: true,
      variables: finalVariables,
      stats: {
        total_pages: pagesContent.length,
        categories_extracted: Object.keys(cleanedVariables).length,
        total_variables: Object.values(cleanedVariables).reduce(
          (sum, cat) => sum + Object.keys(cat as Record<string, any>).length,
          0
        )
      }
    });

  } catch (error: any) {
    console.error('Error extracting variables:', error);

    // Update status to failed
    const supabase = supabaseAdmin();
    await supabase
      .from('projects')
      .update({
        extraction_status: 'failed',
        extraction_error: error.message || 'Unknown error',
        extraction_completed_at: new Date().toISOString()
      })
      .eq('id', projectId);

    // Check if it's a rate limit error
    if (error.message === 'RATE_LIMITED') {
      return NextResponse.json(
        { error: 'Rate limited by Gemini API. Please try again later.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to extract variables' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check extraction status
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  try {
    const supabase = supabaseAdmin();

    const { data: project, error } = await supabase
      .from('projects')
      .select('extraction_status, extraction_progress, extraction_error, extracted_variables, extraction_started_at, extraction_completed_at')
      .eq('id', projectId)
      .single();

    if (error || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: project.extraction_status,
      progress: project.extraction_progress,
      error: project.extraction_error,
      variables: project.extracted_variables,
      started_at: project.extraction_started_at,
      completed_at: project.extraction_completed_at
    });

  } catch (error: any) {
    console.error('Error fetching extraction status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch extraction status' },
      { status: 500 }
    );
  }
}