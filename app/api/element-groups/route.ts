import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const supabase = supabaseAdmin();

  // Get element groups with section counts
  const { data: groups, error: groupsError } = await supabase
    .from('element_groups')
    .select('*')
    .order('sort_order', { ascending: true });

  if (groupsError) {
    return NextResponse.json({ error: groupsError.message }, { status: 500 });
  }

  // Get section counts for each group
  const groupsWithCounts = await Promise.all(
    (groups || []).map(async group => {
      const { count } = await supabase
        .from('element_section_mappings')
        .select('*', { count: 'exact', head: true })
        .eq('element_group_id', group.id);

      return {
        ...group,
        section_count: count || 0,
      };
    })
  );

  return NextResponse.json({ element_groups: groupsWithCounts });
}
