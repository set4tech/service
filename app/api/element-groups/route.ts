import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const supabase = supabaseAdmin();

  // Get element groups
  const { data: groups, error: groupsError } = await supabase
    .from('element_groups')
    .select('*')
    .order('sort_order', { ascending: true });

  if (groupsError) {
    return NextResponse.json({ error: groupsError.message }, { status: 500 });
  }

  // Get all section counts in a single query
  const { data: mappings, error: mappingsError } = await supabase
    .from('element_section_mappings')
    .select('element_group_id');

  if (mappingsError) {
    return NextResponse.json({ error: mappingsError.message }, { status: 500 });
  }

  // Count sections per group in memory (much faster than N queries)
  const countsByGroup = (mappings || []).reduce(
    (acc, mapping) => {
      acc[mapping.element_group_id] = (acc[mapping.element_group_id] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const groupsWithCounts = (groups || []).map(group => ({
    ...group,
    section_count: countsByGroup[group.id] || 0,
  }));

  return NextResponse.json({ element_groups: groupsWithCounts });
}
