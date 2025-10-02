import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function findDefinitionalSections() {
  console.log('Finding definitional/scoping sections...\n');

  // Query for sections matching our patterns
  const { data: sections, error } = await supabase
    .from('sections')
    .select('id, number, title, parent_key')
    .or(
      'title.ilike.%definition%,' +
        'title.ilike.%scope%,' +
        'title.ilike.%application%,' +
        'title.ilike.general,' +
        'title.ilike.%where required%,' +
        'title.ilike.%purpose%'
    )
    .order('number');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${sections.length} definitional/scoping sections:\n`);

  // Group by pattern
  const byPattern = {
    definition: [],
    scope: [],
    application: [],
    general: [],
    whereRequired: [],
    purpose: [],
  };

  sections.forEach(s => {
    const title = s.title.toLowerCase();
    if (title.includes('definition')) byPattern.definition.push(s);
    else if (title.includes('scope')) byPattern.scope.push(s);
    else if (title.includes('application')) byPattern.application.push(s);
    else if (title === 'general') byPattern.general.push(s);
    else if (title.includes('where required')) byPattern.whereRequired.push(s);
    else if (title.includes('purpose')) byPattern.purpose.push(s);
  });

  // Print results
  Object.entries(byPattern).forEach(([pattern, items]) => {
    if (items.length > 0) {
      console.log(`\n=== ${pattern.toUpperCase()} (${items.length}) ===`);
      items.forEach(s => {
        console.log(`  ID: ${s.id} | ${s.number} - ${s.title}`);
      });
    }
  });

  // Also check for .1 sections (first subsections)
  const { data: firstSubsections, error: error2 } = await supabase
    .from('sections')
    .select('id, number, title, parent_key')
    .not('parent_key', 'is', null)
    .like('number', '%.1')
    .order('number')
    .limit(20);

  if (!error2 && firstSubsections.length > 0) {
    console.log(`\n\n=== FIRST SUBSECTIONS (.1) (showing first 20) ===`);
    firstSubsections.forEach(s => {
      console.log(`  ID: ${s.id} | ${s.number} - ${s.title}`);
    });
  }

  // Generate the array of IDs
  console.log('\n\n=== HARDCODED IDS ARRAY ===');
  console.log('const DEFINITIONAL_SECTION_IDS = [');
  sections.forEach(s => {
    console.log(`  ${s.id}, // ${s.number} - ${s.title}`);
  });
  console.log('];');
}

findDefinitionalSections();
