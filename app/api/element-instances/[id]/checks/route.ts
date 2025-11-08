import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  console.log('[GET /api/element-instances/[id]/checks] Fetching checks for element instance:', id);

  const { data, error } = await supabase
    .from('checks')
    .select('*, sections!checks_section_id_fkey(key)')
    .eq('element_instance_id', id)
    .order('code_section_number');

  if (error) {
    console.error('[GET /api/element-instances/[id]/checks] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log('[GET /api/element-instances/[id]/checks] Found checks:', data?.length);
  if (data && data.length > 0) {
    console.log('[GET /api/element-instances/[id]/checks] First check section data:', {
      has_sections: !!data[0].sections,
      section_key: data[0].sections?.key,
      section_id: data[0].section_id,
    });
  }

  return NextResponse.json({ checks: data || [] });
}
