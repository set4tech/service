import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  const supabase = supabaseAdmin();

  try {
    const query = supabase.from('checks').select('*').eq('assessment_id', id);

    // Add full-text search if search query provided
    if (search && search.trim()) {
      console.log('[SEARCH] Query:', search.trim(), 'Assessment ID:', id);
      const searchPattern = search.trim().toLowerCase();

      // Get all checks for this assessment
      const { data: allChecksData, error: checksError } = await supabase
        .from('checks')
        .select('*')
        .eq('assessment_id', id);

      if (checksError) {
        console.error('[SEARCH] Checks error:', checksError);
        throw checksError;
      }

      console.log('[SEARCH] Found checks:', allChecksData?.length);

      // First filter by check fields (fast, in-memory)
      const checksMatchingCheckFields =
        allChecksData?.filter(
          (check: any) =>
            check.code_section_number?.toLowerCase().includes(searchPattern) ||
            check.code_section_title?.toLowerCase().includes(searchPattern)
        ) || [];

      console.log('[SEARCH] Checks matching titles/numbers:', checksMatchingCheckFields.length);

      // Get sections that match the search pattern
      const { data: matchingSections, error: sectionsError } = await supabase
        .from('sections')
        .select('key')
        .or(`text.ilike.%${search.trim()}%,paragraphs::text.ilike.%${search.trim()}%`);

      if (sectionsError) {
        console.error('[SEARCH] Sections error:', sectionsError);
        throw sectionsError;
      }

      console.log('[SEARCH] Sections matching content:', matchingSections?.length);

      // Create a set of matching section keys
      const matchingSectionKeys = new Set(matchingSections?.map((s: any) => s.key) || []);

      // Get checks that reference matching sections
      const checksMatchingSectionContent =
        allChecksData?.filter((check: any) => matchingSectionKeys.has(check.code_section_key)) ||
        [];

      console.log('[SEARCH] Checks matching section content:', checksMatchingSectionContent.length);

      // Combine both sets (unique checks)
      const allMatchingCheckIds = new Set([
        ...checksMatchingCheckFields.map((c: any) => c.id),
        ...checksMatchingSectionContent.map((c: any) => c.id),
      ]);

      const allChecks =
        allChecksData?.filter((check: any) => allMatchingCheckIds.has(check.id)) || [];

      console.log('[SEARCH] Total unique matches:', allChecks.length);

      // Group and return
      const checks = allChecks.reduce((acc: any[], check: any) => {
        if (!check.parent_check_id) {
          const instances = allChecks.filter((c: any) => c.parent_check_id === check.id);
          acc.push({ ...check, instances, instance_count: instances.length });
        }
        return acc;
      }, []);

      return NextResponse.json(checks);
    }

    // No search - use original query
    const { data: allChecks, error } = await query.order('code_section_number', {
      ascending: true,
    });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch checks', details: error.message },
        { status: 500 }
      );
    }

    // Group checks by parent - instances will be nested under their parent
    const checks = (allChecks || []).reduce((acc: any[], check: any) => {
      if (!check.parent_check_id) {
        // This is a parent check - find all its instances
        const instances = (allChecks || []).filter((c: any) => c.parent_check_id === check.id);
        acc.push({
          ...check,
          instances,
          instance_count: instances.length,
        });
      }
      return acc;
    }, []);

    return NextResponse.json(checks);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch checks',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
