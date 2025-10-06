import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: checkId } = await params;
    const supabase = supabaseAdmin();

    const { data: runs, error } = await supabase
      .from('analysis_runs')
      .select('*')
      .eq('check_id', checkId)
      .order('run_number', { ascending: false });

    if (error) {
      console.error('Error fetching analysis runs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch section overrides for this check
    const { data: overrides } = await supabase
      .from('section_overrides')
      .select('*')
      .eq('check_id', checkId);

    const overrideMap = new Map(
      (overrides || []).map(o => [o.section_key, { status: o.override_status, note: o.note }])
    );

    // Enrich section_results with section text, title, and apply overrides
    if (runs && runs.length > 0) {
      for (const run of runs) {
        if (run.section_results && Array.isArray(run.section_results)) {
          // Collect all unique section keys
          const sectionKeys = run.section_results.map((sr: any) => sr.section_key).filter(Boolean);

          if (sectionKeys.length > 0) {
            // Fetch section data
            const { data: sections } = await supabase
              .from('sections')
              .select('key, text, title')
              .in('key', sectionKeys);

            if (sections) {
              // Create lookup map
              const sectionMap = new Map(sections.map(s => [s.key, s]));

              // Enrich each section result and apply overrides
              run.section_results = run.section_results.map((sr: any) => {
                const override = overrideMap.get(sr.section_key);
                return {
                  ...sr,
                  section_text: sectionMap.get(sr.section_key)?.text || null,
                  section_title: sectionMap.get(sr.section_key)?.title || null,
                  // Apply override if it exists
                  compliance_status: override?.status || sr.compliance_status,
                  has_override: !!override,
                  override_note: override?.note || null,
                };
              });
            }
          }
        }
      }
    }

    return NextResponse.json({ runs: runs || [] });
  } catch (error) {
    console.error('Failed to fetch analysis runs:', error);
    return NextResponse.json({ error: 'Failed to fetch analysis runs' }, { status: 500 });
  }
}
