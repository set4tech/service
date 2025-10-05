import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const assessmentId = 'dac17c6b-4d22-46fc-aa3e-3db9bd1015a3';

async function cleanup() {
  console.log(`Cleaning up duplicates in assessment: ${assessmentId}\n`);

  const { data: checks } = await supabase
    .from('checks')
    .select('*')
    .eq('assessment_id', assessmentId)
    .is('parent_check_id', null)
    .order('created_at');

  const seen = new Map();
  const toDelete = [];

  checks?.forEach(check => {
    const key = check.code_section_key;
    if (seen.has(key)) {
      // This is a duplicate, mark for deletion
      toDelete.push(check.id);
      console.log(`Duplicate found: ${check.code_section_number} (${check.id})`);
    } else {
      seen.set(key, check);
    }
  });

  console.log(`\nFound ${toDelete.length} duplicates to delete\n`);

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from('checks')
      .delete()
      .in('id', toDelete);

    if (error) {
      console.error('Error deleting duplicates:', error);
    } else {
      console.log(`Successfully deleted ${toDelete.length} duplicate checks`);
    }
  }

  // Verify
  const { count: afterCount } = await supabase
    .from('checks')
    .select('*', { count: 'exact', head: true })
    .eq('assessment_id', assessmentId);

  console.log(`\nFinal check count: ${afterCount}`);
}

cleanup().catch(console.error);
