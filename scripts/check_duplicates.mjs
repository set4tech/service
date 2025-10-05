import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDuplicates() {
  // Get an assessment with ~581 checks
  const { data: assessments } = await supabase
    .from('assessments')
    .select('id, project_id')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('Recent assessments:', assessments);

  for (const assessment of assessments || []) {
    const { count } = await supabase
      .from('checks')
      .select('*', { count: 'exact', head: true })
      .eq('assessment_id', assessment.id);

    console.log(`Assessment ${assessment.id}: ${count} checks`);

    // Check for duplicates
    const { data: checks } = await supabase
      .from('checks')
      .select('code_section_number, code_section_title, COUNT(*)')
      .eq('assessment_id', assessment.id);

    console.log('Sample checks:', checks?.slice(0, 10));
  }

  // Check how many sections have drawing_assessable=true
  const { count: totalSections } = await supabase
    .from('sections')
    .select('*', { count: 'exact', head: true })
    .eq('code_id', 'ICC+CBC_Chapter11A_11B+2025+CA')
    .eq('drawing_assessable', true);

  console.log(`Total drawing_assessable sections: ${totalSections}`);

  // Check for duplicate section numbers
  const { data: sectionCounts, error } = await supabase.rpc('get_duplicate_sections');

  if (error) {
    console.log('RPC not available, checking manually...');
    const { data: allSections } = await supabase
      .from('sections')
      .select('key, number, title')
      .eq('code_id', 'ICC+CBC_Chapter11A_11B+2025+CA')
      .eq('drawing_assessable', true)
      .order('number');

    const numberCounts = new Map();
    allSections?.forEach(s => {
      numberCounts.set(s.number, (numberCounts.get(s.number) || 0) + 1);
    });

    const duplicates = Array.from(numberCounts.entries())
      .filter(([_, count]) => count > 1)
      .sort((a, b) => b[1] - a[1]);

    console.log(`\nDuplicate section numbers (${duplicates.length}):`);
    duplicates.slice(0, 20).forEach(([number, count]) => {
      console.log(`  ${number}: ${count} times`);
      const examples = allSections.filter(s => s.number === number);
      examples.forEach(ex => console.log(`    - ${ex.key}: ${ex.title}`));
    });
  } else {
    console.log('Duplicate sections:', sectionCounts);
  }
}

checkDuplicates().catch(console.error);
