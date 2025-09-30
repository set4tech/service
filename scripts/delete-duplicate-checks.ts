import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteDuplicateChecks() {
  console.log('Finding duplicate checks...');

  // Find all checks grouped by assessment_id and code_section_number
  const { data: checks, error } = await supabase
    .from('checks')
    .select('id, assessment_id, code_section_number')
    .order('assessment_id')
    .order('code_section_number')
    .order('id');

  if (error) {
    console.error('Error fetching checks:', error);
    return;
  }

  // Group by assessment_id + code_section_number
  const groups = new Map<string, any[]>();
  for (const check of checks!) {
    const key = `${check.assessment_id}::${check.code_section_number}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(check);
  }

  // Find duplicates (keep first, delete rest)
  const toDelete: string[] = [];
  for (const [key, group] of groups) {
    if (group.length > 1) {
      // Keep the first one, delete the rest
      for (let i = 1; i < group.length; i++) {
        toDelete.push(group[i].id);
      }
      console.log(`Found ${group.length} duplicates for ${key}, will delete ${group.length - 1}`);
    }
  }

  console.log(`\nTotal duplicate checks to delete: ${toDelete.length}`);

  if (toDelete.length === 0) {
    console.log('No duplicates found!');
    return;
  }

  // Delete in batches of 100
  const batchSize = 100;
  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = toDelete.slice(i, i + batchSize);
    const { error: deleteError } = await supabase
      .from('checks')
      .delete()
      .in('id', batch);

    if (deleteError) {
      console.error(`Error deleting batch ${i / batchSize + 1}:`, deleteError);
    } else {
      console.log(`Deleted batch ${i / batchSize + 1} (${batch.length} records)`);
    }
  }

  console.log('\nDone!');
}

deleteDuplicateChecks().catch(console.error);
