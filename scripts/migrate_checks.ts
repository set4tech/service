import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://grosxzvvmhakkxybeuwu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const SOURCE_ASSESSMENT_ID = '9218af5e-7570-49fb-b281-e3d4eae323f8';
const TARGET_ASSESSMENT_ID = '3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83';

async function main() {
  console.log('=== Assessment Check Migration ===');
  console.log(`Source: ${SOURCE_ASSESSMENT_ID}`);
  console.log(`Target: ${TARGET_ASSESSMENT_ID}`);
  console.log('');

  // 1. Verify both assessments exist
  console.log('1. Verifying assessments exist...');
  const { data: assessments, error: assessmentsError } = await supabase
    .from('assessments')
    .select('id, project_id')
    .in('id', [SOURCE_ASSESSMENT_ID, TARGET_ASSESSMENT_ID]);

  if (assessmentsError) {
    console.error('Error fetching assessments:', assessmentsError);
    process.exit(1);
  }

  if (assessments.length !== 2) {
    console.error(`Expected 2 assessments, found ${assessments.length}`);
    console.log('Found:', assessments);
    process.exit(1);
  }

  const sourceAssessment = assessments.find(a => a.id === SOURCE_ASSESSMENT_ID);
  const targetAssessment = assessments.find(a => a.id === TARGET_ASSESSMENT_ID);

  console.log(`✓ Source assessment: ${sourceAssessment!.id}`);
  console.log(`✓ Target assessment: ${targetAssessment!.id}`);
  console.log('');

  // 2. Delete all existing checks from target assessment
  console.log('2. Deleting existing checks from target assessment...');

  // First get the check IDs to delete related records
  const { data: targetChecks, error: targetChecksError } = await supabase
    .from('checks')
    .select('id')
    .eq('assessment_id', TARGET_ASSESSMENT_ID);

  if (targetChecksError) {
    console.error('Error fetching target checks:', targetChecksError);
    process.exit(1);
  }

  console.log(`Found ${targetChecks.length} checks to delete`);

  if (targetChecks.length > 0) {
    const targetCheckIds = targetChecks.map(c => c.id);

    // Delete in batches of 100 to avoid Supabase limits
    const batchSize = 100;
    const batches = Math.ceil(targetCheckIds.length / batchSize);

    // Delete screenshot_check_assignments
    console.log('  - Deleting screenshot_check_assignments...');
    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, targetCheckIds.length);
      const batch = targetCheckIds.slice(start, end);

      const { error: scaDeleteError } = await supabase
        .from('screenshot_check_assignments')
        .delete()
        .in('check_id', batch);

      if (scaDeleteError) {
        console.error(`Error deleting screenshot_check_assignments batch ${i + 1}/${batches}:`, scaDeleteError);
        process.exit(1);
      }
      console.log(`    Batch ${i + 1}/${batches} complete`);
    }

    // Delete analysis_runs
    console.log('  - Deleting analysis_runs...');
    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, targetCheckIds.length);
      const batch = targetCheckIds.slice(start, end);

      const { error: analysisDeleteError } = await supabase
        .from('analysis_runs')
        .delete()
        .in('check_id', batch);

      if (analysisDeleteError) {
        console.error(`Error deleting analysis_runs batch ${i + 1}/${batches}:`, analysisDeleteError);
        process.exit(1);
      }
      console.log(`    Batch ${i + 1}/${batches} complete`);
    }

    // Delete checks
    console.log('  - Deleting checks...');
    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, targetCheckIds.length);
      const batch = targetCheckIds.slice(start, end);

      const { error: checksDeleteError } = await supabase
        .from('checks')
        .delete()
        .in('id', batch);

      if (checksDeleteError) {
        console.error(`Error deleting checks batch ${i + 1}/${batches}:`, checksDeleteError);
        process.exit(1);
      }
      console.log(`    Batch ${i + 1}/${batches} complete`);
    }

    console.log(`✓ Deleted ${targetChecks.length} checks and their related records`);
  } else {
    console.log('✓ No existing checks to delete');
  }
  console.log('');

  // 3. Fetch all checks from source assessment
  console.log('3. Fetching checks from source assessment...');

  // Fetch in pages to handle large datasets
  let sourceChecks: any[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('checks')
      .select('*')
      .eq('assessment_id', SOURCE_ASSESSMENT_ID)
      .order('created_at')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching source checks:', error);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    sourceChecks = sourceChecks.concat(data);
    console.log(`  Fetched page ${page + 1} (${data.length} checks)`);

    if (data.length < pageSize) break;
    page++;
  }

  console.log(`✓ Found ${sourceChecks.length} checks to migrate`);
  console.log('');

  // 4. Fetch all analysis_runs for source checks
  console.log('4. Fetching analysis runs...');
  const sourceCheckIds = sourceChecks.map(c => c.id);

  // Fetch analysis runs in batches
  let analysisRuns: any[] = [];
  const checkBatchSize = 100;
  const checkBatches = Math.ceil(sourceCheckIds.length / checkBatchSize);

  for (let i = 0; i < checkBatches; i++) {
    const start = i * checkBatchSize;
    const end = Math.min(start + checkBatchSize, sourceCheckIds.length);
    const batch = sourceCheckIds.slice(start, end);

    const { data, error } = await supabase
      .from('analysis_runs')
      .select('*')
      .in('check_id', batch)
      .order('executed_at');

    if (error) {
      console.error(`Error fetching analysis runs batch ${i + 1}/${checkBatches}:`, error);
      process.exit(1);
    }

    if (data) {
      analysisRuns = analysisRuns.concat(data);
    }
    console.log(`  Fetched batch ${i + 1}/${checkBatches} (${data?.length || 0} analysis runs)`);
  }

  console.log(`✓ Found ${analysisRuns.length} analysis runs to migrate`);
  console.log('');

  // 5. Create mapping of old check IDs to new check IDs
  console.log('5. Creating new checks...');
  const checkIdMapping: Record<string, string> = {};

  for (const sourceCheck of sourceChecks) {
    const { id: oldId, created_at, updated_at, ...checkData } = sourceCheck;

    const newCheck = {
      ...checkData,
      assessment_id: TARGET_ASSESSMENT_ID,
      // Preserve parent_check_id relationships (will update after all checks created)
    };

    const { data: insertedCheck, error: insertError } = await supabase
      .from('checks')
      .insert(newCheck)
      .select('id')
      .single();

    if (insertError) {
      console.error('Error inserting check:', insertError);
      console.error('Check data:', newCheck);
      process.exit(1);
    }

    checkIdMapping[oldId] = insertedCheck.id;
  }

  console.log(`✓ Created ${Object.keys(checkIdMapping).length} new checks`);
  console.log('');

  // 6. Update parent_check_id references
  console.log('6. Updating parent_check_id references...');
  let parentUpdates = 0;

  for (const sourceCheck of sourceChecks) {
    if (sourceCheck.parent_check_id) {
      const newCheckId = checkIdMapping[sourceCheck.id];
      const newParentCheckId = checkIdMapping[sourceCheck.parent_check_id];

      if (!newParentCheckId) {
        console.warn(`Warning: Could not find new parent check ID for ${sourceCheck.parent_check_id}`);
        continue;
      }

      const { error: updateError } = await supabase
        .from('checks')
        .update({ parent_check_id: newParentCheckId })
        .eq('id', newCheckId);

      if (updateError) {
        console.error('Error updating parent_check_id:', updateError);
        process.exit(1);
      }

      parentUpdates++;
    }
  }

  console.log(`✓ Updated ${parentUpdates} parent_check_id references`);
  console.log('');

  // 7. Create new analysis_runs
  console.log('7. Creating analysis runs...');

  for (const analysisRun of analysisRuns) {
    const { id, created_at, updated_at, check_id: oldCheckId, ...analysisData } = analysisRun;
    const newCheckId = checkIdMapping[oldCheckId];

    if (!newCheckId) {
      console.warn(`Warning: Could not find new check ID for analysis run with old check_id ${oldCheckId}`);
      continue;
    }

    const newAnalysisRun = {
      ...analysisData,
      check_id: newCheckId,
    };

    const { error: insertError } = await supabase
      .from('analysis_runs')
      .insert(newAnalysisRun);

    if (insertError) {
      console.error('Error inserting analysis run:', insertError);
      console.error('Analysis run data:', newAnalysisRun);
      process.exit(1);
    }
  }

  console.log(`✓ Created ${analysisRuns.length} analysis runs`);
  console.log('');

  // 8. Verify migration
  console.log('8. Verifying migration...');
  const { data: newChecks, error: verifyError } = await supabase
    .from('checks')
    .select('id')
    .eq('assessment_id', TARGET_ASSESSMENT_ID);

  if (verifyError) {
    console.error('Error verifying checks:', verifyError);
    process.exit(1);
  }

  const { data: newAnalysisRuns, error: verifyAnalysisError } = await supabase
    .from('analysis_runs')
    .select('id')
    .in('check_id', newChecks.map(c => c.id));

  if (verifyAnalysisError) {
    console.error('Error verifying analysis runs:', verifyAnalysisError);
    process.exit(1);
  }

  console.log(`✓ Verification complete:`);
  console.log(`  - Checks: ${newChecks.length} (expected ${sourceChecks.length})`);
  console.log(`  - Analysis runs: ${newAnalysisRuns.length} (expected ${analysisRuns.length})`);
  console.log('');

  if (newChecks.length === sourceChecks.length && newAnalysisRuns.length === analysisRuns.length) {
    console.log('✅ Migration completed successfully!');
  } else {
    console.log('⚠️  Migration completed but counts do not match. Please review.');
  }
}

main().catch(console.error);
