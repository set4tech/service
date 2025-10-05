import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkActual() {
  // Get the most recent assessment
  const { data: assessments } = await supabase
    .from('assessments')
    .select('id, project_id, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('Recent assessments:');
  assessments?.forEach(a => {
    console.log(`  ${a.id} (${a.created_at})`);
  });

  if (!assessments || assessments.length === 0) {
    console.log('No assessments found');
    return;
  }

  // Pick the first one
  const assessmentId = assessments[0].id;
  console.log(`\nAnalyzing assessment: ${assessmentId}\n`);

  // Get all checks for this assessment
  const { data: checks } = await supabase
    .from('checks')
    .select('id, code_section_number, code_section_title, code_section_key, parent_check_id')
    .eq('assessment_id', assessmentId)
    .order('code_section_number');

  console.log(`Total checks: ${checks?.length || 0}\n`);

  if (!checks || checks.length === 0) {
    console.log('No checks found for this assessment');
    return;
  }

  // Count by section number
  const sectionCounts = new Map();
  checks.forEach(c => {
    const num = c.code_section_number;
    if (!sectionCounts.has(num)) {
      sectionCounts.set(num, []);
    }
    sectionCounts.get(num).push(c);
  });

  // Find duplicates
  const duplicates = Array.from(sectionCounts.entries())
    .filter(([_, checks]) => checks.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`Duplicate section numbers: ${duplicates.length}\n`);

  if (duplicates.length > 0) {
    console.log('Top 10 duplicates:');
    duplicates.slice(0, 10).forEach(([num, checksList]) => {
      console.log(`\n  ${num} (${checksList.length} times):`);
      checksList.forEach((c, idx) => {
        console.log(`    ${idx + 1}. ID: ${c.id}`);
        console.log(`       Title: ${c.code_section_title}`);
        console.log(`       Key: ${c.code_section_key}`);
        console.log(`       Parent: ${c.parent_check_id || 'None'}`);
      });
    });
  }

  // Check if they're actually duplicates or instances
  const parentsOnly = checks.filter(c => !c.parent_check_id);
  console.log(`\n\nParent checks (no parent_check_id): ${parentsOnly.length}`);
  console.log(`Child checks (with parent_check_id): ${checks.length - parentsOnly.length}`);

  // Recount duplicates for parents only
  const parentSectionCounts = new Map();
  parentsOnly.forEach(c => {
    const num = c.code_section_number;
    if (!parentSectionCounts.has(num)) {
      parentSectionCounts.set(num, []);
    }
    parentSectionCounts.get(num).push(c);
  });

  const parentDuplicates = Array.from(parentSectionCounts.entries())
    .filter(([_, checks]) => checks.length > 1);

  console.log(`\nDuplicate section numbers (parents only): ${parentDuplicates.length}`);

  if (parentDuplicates.length > 0) {
    console.log('\nParent duplicates:');
    parentDuplicates.slice(0, 10).forEach(([num, checksList]) => {
      console.log(`\n  ${num} (${checksList.length} times):`);
      checksList.forEach((c, idx) => {
        console.log(`    ${idx + 1}. ID: ${c.id}, Title: ${c.code_section_title}`);
      });
    });
  }
}

checkActual().catch(console.error);
