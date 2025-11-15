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

  let totalDeleted = 0;
  let iteration = 0;

  // Keep deleting until no checks remain
  while (true) {
    iteration++;

    // Get batch of checks to delete
    const { data: targetChecks, error: targetChecksError } = await supabase
      .from('checks')
      .select('id')
      .eq('assessment_id', TARGET_ASSESSMENT_ID)
      .limit(100);

    if (targetChecksError) {
      console.error('Error fetching target checks:', targetChecksError);
      process.exit(1);
    }

    if (!targetChecks || targetChecks.length === 0) {
      console.log(`✓ Deleted total of ${totalDeleted} checks`);
      break;
    }

    console.log(`  Iteration ${iteration}: Found ${targetChecks.length} checks to delete`);

    const targetCheckIds = targetChecks.map(c => c.id);

    // Delete screenshot_check_assignments
    const { error: scaDeleteError } = await supabase
      .from('screenshot_check_assignments')
      .delete()
      .in('check_id', targetCheckIds);

    if (scaDeleteError) {
      console.error('Error deleting screenshot_check_assignments:', scaDeleteError);
      process.exit(1);
    }

    // Delete analysis_runs
    const { error: analysisDeleteError } = await supabase
      .from('analysis_runs')
      .delete()
      .in('check_id', targetCheckIds);

    if (analysisDeleteError) {
      console.error('Error deleting analysis_runs:', analysisDeleteError);
      process.exit(1);
    }

    // Delete checks
    const { error: checksDeleteError } = await supabase
      .from('checks')
      .delete()
      .in('id', targetCheckIds);

    if (checksDeleteError) {
      console.error('Error deleting checks:', checksDeleteError);
      process.exit(1);
    }

    totalDeleted += targetChecks.length;
    console.log(`    Deleted ${targetChecks.length} checks (total: ${totalDeleted})`);
  }

  console.log('');

  // 3. Fetch all checks from source assessment
  console.log('3. Fetching checks from source assessment...');

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

    if (data && data.length > 0) {
      analysisRuns = analysisRuns.concat(data);
      console.log(`  Fetched batch ${i + 1}/${checkBatches} (${data.length} analysis runs)`);
    }
  }

  console.log(`✓ Found ${analysisRuns.length} analysis runs to migrate`);
  console.log('');

  // 5. Create new checks
  console.log('5. Creating new checks...');
  const checkIdMapping: Record<string, string> = {};

  // Insert checks one at a time to preserve order and create ID mapping
  let created = 0;
  for (const sourceCheck of sourceChecks) {
    const { id: oldId, created_at, updated_at, ...checkData } = sourceCheck;

    const newCheck = {
      ...checkData,
      assessment_id: TARGET_ASSESSMENT_ID,
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
    created++;

    if (created % 100 === 0) {
      console.log(`  Created ${created}/${sourceChecks.length} checks...`);
    }
  }

  console.log(`✓ Created ${created} new checks`);
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

  if (analysisRuns.length === 0) {
    console.log('✓ No analysis runs to migrate');
  } else {
    // Insert analysis runs in batches
    const analysisBatchSize = 50;
    const analysisBatches = Math.ceil(analysisRuns.length / analysisBatchSize);
    let insertedAnalysisCount = 0;

    for (let i = 0; i < analysisBatches; i++) {
      const start = i * analysisBatchSize;
      const end = Math.min(start + analysisBatchSize, analysisRuns.length);
      const batch = analysisRuns.slice(start, end);

      const newAnalysisRuns = batch
        .map(analysisRun => {
          const { id, created_at, updated_at, check_id: oldCheckId, ...analysisData } = analysisRun;
          const newCheckId = checkIdMapping[oldCheckId];

          if (!newCheckId) {
            console.warn(`Warning: Could not find new check ID for analysis run with old check_id ${oldCheckId}`);
            return null;
          }

          return {
            ...analysisData,
            check_id: newCheckId,
          };
        })
        .filter(Boolean);

      if (newAnalysisRuns.length > 0) {
        const { error: insertError } = await supabase
          .from('analysis_runs')
          .insert(newAnalysisRuns);

        if (insertError) {
          console.error(`Error inserting analysis runs batch ${i + 1}/${analysisBatches}:`, insertError);
          process.exit(1);
        }

        insertedAnalysisCount += newAnalysisRuns.length;
        console.log(`  Batch ${i + 1}/${analysisBatches} complete (${newAnalysisRuns.length} analysis runs)`);
      }
    }

    console.log(`✓ Created ${insertedAnalysisCount} analysis runs`);
  }

  console.log('');

  // 8. Verify migration
  console.log('8. Verifying migration...');
  const { count, error: verifyError } = await supabase
    .from('checks')
    .select('*', { count: 'exact', head: true })
    .eq('assessment_id', TARGET_ASSESSMENT_ID);

  if (verifyError) {
    console.error('Error verifying checks:', verifyError);
    process.exit(1);
  }

  console.log(`✓ Verification complete:`);
  console.log(`  - Checks: ${count} (expected ${sourceChecks.length})`);
  console.log(`  - Analysis runs: ${analysisRuns.length} migrated`);
  console.log('');

  if (count === sourceChecks.length) {
    console.log('✅ Migration completed successfully!');
  } else {
    console.log('⚠️  Migration completed but check count does not match. Please review.');
  }
}

main().catch(console.error);
