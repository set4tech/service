import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigate() {
  // Get assessments with ~581 checks
  const { data: allAssessments } = await supabase
    .from('assessments')
    .select('id, created_at, sections_total, total_sections')
    .order('created_at', { ascending: false })
    .limit(20);

  console.log('Recent assessments with check counts:\n');

  for (const assessment of allAssessments || []) {
    const { count } = await supabase
      .from('checks')
      .select('*', { count: 'exact', head: true })
      .eq('assessment_id', assessment.id);

    console.log(`${assessment.id}: ${count} checks (sections_total: ${assessment.sections_total}, total_sections: ${assessment.total_sections})`);

    // If this has ~581 checks, analyze it
    if (count && count > 500 && count < 600) {
      console.log(`\n  ⚠️  Analyzing ${assessment.id} with ${count} checks:\n`);

      const { data: checks } = await supabase
        .from('checks')
        .select('id, code_section_number, parent_check_id, check_type')
        .eq('assessment_id', assessment.id);

      const parents = checks?.filter(c => !c.parent_check_id) || [];
      const children = checks?.filter(c => c.parent_check_id) || [];

      console.log(`  - Parent checks: ${parents.length}`);
      console.log(`  - Child checks (instances): ${children.length}`);

      // Check for duplicates in parents
      const sectionMap = new Map();
      parents.forEach(c => {
        const key = c.code_section_number;
        if (!sectionMap.has(key)) sectionMap.set(key, []);
        sectionMap.get(key).push(c);
      });

      const dupes = Array.from(sectionMap.values()).filter(arr => arr.length > 1);
      console.log(`  - Duplicate parent section numbers: ${dupes.length}`);

      if (dupes.length > 0) {
        console.log(`\n  First 5 duplicates:`);
        dupes.slice(0, 5).forEach(arr => {
          console.log(`    ${arr[0].code_section_number}: ${arr.length} copies`);
          console.log(`      IDs: ${arr.map(c => c.id).join(', ')}`);
        });
      }
    }
  }
}

investigate().catch(console.error);
