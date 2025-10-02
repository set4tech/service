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
      // Join with sections table and search across section content
      const { data: searchResults, error: searchError } = await supabase
        .from('checks')
        .select(
          `
          *,
          section:sections!checks_code_section_key_fkey(text, paragraphs)
        `
        )
        .eq('assessment_id', id)
        .or(
          `code_section_number.ilike.%${search.trim()}%,code_section_title.ilike.%${search.trim()}%`
        );

      if (searchError) throw searchError;

      // Additional filtering for section text/paragraphs content
      const searchPattern = search.trim().toLowerCase();
      const allChecks = (searchResults || []).filter((check: any) => {
        const matchesCheckFields =
          check.code_section_number?.toLowerCase().includes(searchPattern) ||
          check.code_section_title?.toLowerCase().includes(searchPattern);

        if (matchesCheckFields) return true;

        // Check section text and paragraphs
        const section = check.section;
        if (!section) return false;

        const matchesText = section.text?.toLowerCase().includes(searchPattern);
        const matchesParagraphs = section.paragraphs?.some((p: any) => {
          const text = typeof p === 'string' ? p : p.text || '';
          return text.toLowerCase().includes(searchPattern);
        });

        return matchesText || matchesParagraphs;
      });

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
