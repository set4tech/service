import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const SIMILARITY_THRESHOLD = 0.3; // Trigram similarity threshold for fuzzy matching

/**
 * GET: Search PDF chunks using full-text search or fuzzy matching
 * Query parameters:
 *   - q: search query (required)
 *   - limit: max results (default 50)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    if (!query || query.trim() === '') {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Verify project exists
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, chunking_status')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.chunking_status !== 'completed') {
      return NextResponse.json(
        { error: 'PDF has not been chunked yet', status: project.chunking_status },
        { status: 400 }
      );
    }

    // Try full-text search first
    const { data: ftsResults, error: ftsError } = await supabase.rpc('search_pdf_fulltext', {
      p_project_id: projectId,
      p_query: query,
      p_limit: limit,
    });

    if (ftsError) {
      console.error('[Search] Full-text search error:', ftsError);
      // Fall through to fuzzy search
    }

    // If full-text search succeeded and has results, return them
    if (ftsResults && ftsResults.length > 0) {
      // Group by page and aggregate ranks
      const pageMap = new Map<number, number>();

      for (const result of ftsResults) {
        const existing = pageMap.get(result.page_number) || 0;
        pageMap.set(result.page_number, Math.max(existing, result.rank));
      }

      const matches = Array.from(pageMap.entries())
        .map(([page_number, rank]) => ({ page_number, rank }))
        .sort((a, b) => b.rank - a.rank);

      return NextResponse.json({
        matches,
        method: 'fulltext',
        total: matches.length,
      });
    }

    // Fallback to fuzzy (trigram) search
    console.log('[Search] No full-text results, trying fuzzy search...');

    const { data: fuzzyResults, error: fuzzyError } = await supabase.rpc('search_pdf_fuzzy', {
      p_project_id: projectId,
      p_query: query,
      p_threshold: SIMILARITY_THRESHOLD,
      p_limit: limit,
    });

    if (fuzzyError) {
      console.error('[Search] Fuzzy search error:', fuzzyError);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    if (!fuzzyResults || fuzzyResults.length === 0) {
      return NextResponse.json({
        matches: [],
        method: 'fuzzy',
        total: 0,
      });
    }

    // Group by page and aggregate similarity scores
    const pageMap = new Map<number, number>();

    for (const result of fuzzyResults) {
      const existing = pageMap.get(result.page_number) || 0;
      pageMap.set(result.page_number, Math.max(existing, result.similarity));
    }

    const matches = Array.from(pageMap.entries())
      .map(([page_number, rank]) => ({ page_number, rank }))
      .sort((a, b) => b.rank - a.rank);

    return NextResponse.json({
      matches,
      method: 'fuzzy',
      total: matches.length,
    });
  } catch (error: any) {
    console.error('[Search] Error:', error);
    return NextResponse.json({ error: error.message || 'Search failed' }, { status: 500 });
  }
}


