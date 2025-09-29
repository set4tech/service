const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://grosxzvvmhakkxybeuwu.supabase.co';
// Using anon key for checking tables (service role key from environment if needed)
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb3N4enZ2bWhha2t4eWJldXd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjczODQ0NjIsImV4cCI6MjA0Mjk2MDQ2Mn0.fO01VfIB_DzRCcB0hPH25QJSzgPQ5ksG0eIQgKDXvVY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  console.log('Checking database tables...\n');

  const tables = ['customers', 'projects', 'assessments', 'checks', 'analysis_runs'];

  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        console.log(`❌ Table '${table}': ${error.message}`);
      } else {
        console.log(`✅ Table '${table}': EXISTS (found ${data?.length || 0} rows in test query)`);
      }
    } catch (e) {
      console.log(`❌ Table '${table}': ${e.message}`);
    }
  }

  // Check if we need to run migrations
  const { data: migrationData, error: migrationError } = await supabase
    .from('projects')
    .select('id')
    .limit(1);

  if (migrationError?.message?.includes('does not exist')) {
    console.log('\n⚠️  MIGRATION NEEDED: Tables do not exist in the database');
    console.log('Run the migration file at: supabase/migrations/20250929_compliance.sql');
  } else {
    console.log('\n✅ Database appears to be properly set up');
  }
}

checkTables().then(() => process.exit(0));