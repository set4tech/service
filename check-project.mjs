import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkLatestProject() {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name, created_at, extraction_status, extraction_started_at, extraction_completed_at, extraction_error, extraction_progress, extracted_variables')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!projects || projects.length === 0) {
    console.log('No projects found');
    return;
  }

  const project = projects[0];
  console.log('\n=== Latest Project ===');
  console.log('ID:', project.id);
  console.log('Name:', project.name);
  console.log('Created:', project.created_at);
  console.log('\n=== Extraction Status ===');
  console.log('Status:', project.extraction_status || 'not started');
  console.log('Started:', project.extraction_started_at || 'N/A');
  console.log('Completed:', project.extraction_completed_at || 'N/A');
  console.log('Error:', project.extraction_error || 'N/A');

  if (project.extraction_progress) {
    console.log('\n=== Progress ===');
    console.log(JSON.stringify(project.extraction_progress, null, 2));
  }

  if (project.extracted_variables) {
    console.log('\n=== Extracted Variables ===');
    const vars = project.extracted_variables;

    // Count categories and variables
    const categories = Object.keys(vars).filter(k => k !== '_metadata');
    console.log(`Categories: ${categories.length}`);

    let totalVars = 0;
    for (const cat of categories) {
      if (typeof vars[cat] === 'object') {
        const count = Object.keys(vars[cat]).length;
        totalVars += count;
        console.log(`  ${cat}: ${count} variables`);
      }
    }
    console.log(`Total variables extracted: ${totalVars}`);

    if (vars._metadata) {
      console.log('\n=== Metadata ===');
      console.log(JSON.stringify(vars._metadata, null, 2));
    }

    // Show a sample of extracted data
    console.log('\n=== Sample Data ===');
    for (const cat of categories.slice(0, 2)) {
      console.log(`\n${cat}:`);
      const items = vars[cat];
      const sampleKeys = Object.keys(items).slice(0, 3);
      for (const key of sampleKeys) {
        const value = items[key];
        if (typeof value === 'object') {
          console.log(`  ${key}:`, JSON.stringify(value, null, 4));
        } else {
          console.log(`  ${key}: ${value}`);
        }
      }
    }
  } else {
    console.log('\nNo extracted variables yet');
  }
}

checkLatestProject();