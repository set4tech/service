import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  try {
    const { data: allChecks, error } = await supabase
      .from('checks')
      .select('*')
      .eq('assessment_id', id)
      .order('code_section_number', { ascending: true });

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
