import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const assessmentId = 'dac17c6b-4d22-46fc-aa3e-3db9bd1015a3';

async function check() {
  // Get assessment with project info
  const { data: assessment } = await supabase
    .from('assessments')
    .select(`
      id,
      sections_total,
      sections_processed,
      total_sections,
      seeding_status,
      projects (
        id,
        selected_code_ids
      )
    `)
    .eq('id', assessmentId)
    .single();

  console.log('Assessment:', {
    id: assessment?.id,
    sections_total: assessment?.sections_total,
    sections_processed: assessment?.sections_processed,
    total_sections: assessment?.total_sections,
    seeding_status: assessment?.seeding_status,
    selected_codes: assessment?.projects?.selected_code_ids,
  });

  // Check for duplicates in current checks
  const { data: checks } = await supabase
    .from('checks')
    .select('id, code_section_number, code_section_key, created_at')
    .eq('assessment_id', assessmentId)
    .is('parent_check_id', null)
    .order('code_section_number');

  console.log(`\nTotal parent checks: ${checks?.length}`);

  // Group by section key
  const keyMap = new Map();
  checks?.forEach(c => {
    const key = c.code_section_key;
    if (!keyMap.has(key)) {
      keyMap.set(key, []);
    }
    keyMap.get(key).push(c);
  });

  const dupes = Array.from(keyMap.values()).filter(arr => arr.length > 1);

  if (dupes.length > 0) {
    console.log(`\n❌ DUPLICATES FOUND: ${dupes.length}`);
    dupes.slice(0, 5).forEach(arr => {
      console.log(`  ${arr[0].code_section_number}: ${arr.length} copies`);
    });
  } else {
    console.log(`\n✅ No duplicates found!`);
  }
}

check().catch(console.error);
