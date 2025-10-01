import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = supabaseAdmin();

  // Get element group
  const { data: group, error: groupError } = await supabase
    .from('element_groups')
    .select('*')
    .eq('slug', slug)
    .single();

  if (groupError || !group) {
    return NextResponse.json({ error: 'Element group not found' }, { status: 404 });
  }

  // Get all sections for this element group
  const { data: mappings, error: mappingsError } = await supabase
    .from('element_section_mappings')
    .select(
      `
      section_key,
      sections (*)
    `
    )
    .eq('element_group_id', group.id);

  if (mappingsError) {
    return NextResponse.json({ error: mappingsError.message }, { status: 500 });
  }

  const sections = (mappings || []).map((m: any) => m.sections);

  return NextResponse.json({
    element_group: group,
    sections,
    section_keys: sections.map((s: any) => s.key),
  });
}
