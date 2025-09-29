const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Use the service role key for admin access
const supabaseUrl = 'https://grosxzvvmhakkxybeuwu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb3N4enZ2bWhha2t4eWJldXd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNzM4NDQ2MiwiZXhwIjoyMDQyOTYwNDYyfQ.VoMrqMihOhTGlxP-oqaP5S8VKEhbgsysIV_CqpGGsAE';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  db: { schema: 'public' }
});

async function runMigration() {
  console.log('Running database migration...\n');

  // Read the migration file
  const migrationSQL = fs.readFileSync('./supabase/migrations/20250929_compliance.sql', 'utf8');

  // Split by semicolons and filter out empty statements
  const statements = migrationSQL
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

  console.log(`Found ${statements.length} SQL statements to execute\n`);

  // For Supabase, we need to use the REST API or run via SQL editor
  // Since we can't run raw SQL via the JS client, let's check what tables exist

  console.log('Checking existing tables...');

  const tables = ['customers', 'projects', 'assessments', 'checks', 'analysis_runs', 'screenshots'];

  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(0);

      if (error) {
        console.log(`❌ Table '${table}': Does not exist`);
      } else {
        console.log(`✅ Table '${table}': Already exists`);
      }
    } catch (e) {
      console.log(`❌ Table '${table}': ${e.message}`);
    }
  }

  console.log('\n⚠️  IMPORTANT: To run the migration, please:');
  console.log('1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/grosxzvvmhakkxybeuwu');
  console.log('2. Navigate to the SQL Editor');
  console.log('3. Copy and paste the contents of: supabase/migrations/20250929_compliance.sql');
  console.log('4. Click "Run" to execute the migration\n');
  console.log('Alternatively, you can use the Supabase CLI with proper authentication.');
}

runMigration().then(() => process.exit(0)).catch(console.error);