import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const assessmentId = 'dac17c6b-4d22-46fc-aa3e-3db9bd1015a3';

async function analyze() {
  console.log(`Analyzing assessment: ${assessmentId}\n`);

  const { data: assessment } = await supabase
    .from('assessments')
    .select('*')
    .eq('id', assessmentId)
    .single();

  console.log('Assessment details:', {
    sections_total: assessment?.sections_total,
    sections_processed: assessment?.sections_processed,
    total_sections: assessment?.total_sections,
    seeding_status: assessment?.seeding_status,
  });

  const { data: checks, count } = await supabase
    .from('checks')
    .select('*', { count: 'exact' })
    .eq('assessment_id', assessmentId)
    .order('code_section_number');

  console.log(`\nTotal checks in DB: ${count}`);

  const parents = checks?.filter(c => !c.parent_check_id) || [];
  const children = checks?.filter(c => c.parent_check_id) || [];
  const sectionChecks = checks?.filter(c => c.check_type !== 'element') || [];
  const elementChecks = checks?.filter(c => c.check_type === 'element') || [];

  console.log(`\nBreakdown:`);
  console.log(`  - Parent checks: ${parents.length}`);
  console.log(`  - Child checks (instances): ${children.length}`);
  console.log(`  - Section checks: ${sectionChecks.length}`);
  console.log(`  - Element checks: ${elementChecks.length}`);

  // Check for duplicates in parents
  const sectionMap = new Map();
  parents.forEach(c => {
    const key = c.code_section_number;
    if (!sectionMap.has(key)) sectionMap.set(key, []);
    sectionMap.get(key).push(c);
  });

  const dupes = Array.from(sectionMap.values()).filter(arr => arr.length > 1);
  console.log(`\nDuplicate parent section numbers: ${dupes.length}`);

  if (dupes.length > 0) {
    console.log(`\nFirst 10 duplicates:`);
    dupes.slice(0, 10).forEach(arr => {
      console.log(`\n  ${arr[0].code_section_number} (${arr.length} copies):`);
      arr.forEach((c, idx) => {
        console.log(`    ${idx + 1}. ID: ${c.id}`);
        console.log(`       Title: ${c.code_section_title}`);
        console.log(`       Key: ${c.code_section_key}`);
        console.log(`       Type: ${c.check_type || 'section'}`);
        console.log(`       Element Group: ${c.element_group_id || 'None'}`);
      });
    });
  }

  // Check section keys
  console.log(`\nChecking section keys for duplicates...`);
  const keyMap = new Map();
  parents.forEach(c => {
    const key = c.code_section_key;
    if (!keyMap.has(key)) keyMap.set(key, []);
    keyMap.get(key).push(c);
  });

  const keyDupes = Array.from(keyMap.values()).filter(arr => arr.length > 1);
  console.log(`Duplicate section keys: ${keyDupes.length}`);

  if (keyDupes.length > 0) {
    console.log(`\nFirst 5 key duplicates:`);
    keyDupes.slice(0, 5).forEach(arr => {
      console.log(`\n  ${arr[0].code_section_key} (${arr.length} copies):`);
      arr.forEach(c => console.log(`    - ${c.id}: ${c.code_section_number}`));
    });
  }
}

analyze().catch(console.error);
