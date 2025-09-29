const fs = require('fs');

// Supabase project details
const SUPABASE_URL = 'https://grosxzvvmhakkxybeuwu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb3N4enZ2bWhha2t4eWJldXd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNzM4NDQ2MiwiZXhwIjoyMDQyOTYwNDYyfQ.VoMrqMihOhTGlxP-oqaP5S8VKEhbgsysIV_CqpGGsAE';

async function runMigration() {
  try {
    console.log('Reading migration file...');
    const migrationSQL = fs.readFileSync('./supabase/migrations/20250929_compliance.sql', 'utf8');

    // Use the Supabase REST API to execute SQL
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        query: migrationSQL
      })
    });

    if (!response.ok) {
      // Try alternative approach - using the SQL endpoint if available
      console.log('REST RPC failed, trying alternative approach...');

      // Split migration into individual statements
      const statements = migrationSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

      console.log(`\nFound ${statements.length} SQL statements. Due to API limitations,`);
      console.log('you need to run the migration manually:\n');
      console.log('1. Go to: https://supabase.com/dashboard/project/grosxzvvmhakkxybeuwu/sql/new');
      console.log('2. Copy the contents of: supabase/migrations/20250929_compliance.sql');
      console.log('3. Paste and click "Run"\n');

      return;
    }

    const result = await response.text();
    console.log('Migration response:', result);
    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error.message);
    console.log('\n⚠️  Please run the migration manually:');
    console.log('1. Go to: https://supabase.com/dashboard/project/grosxzvvmhakkxybeuwu/sql/new');
    console.log('2. Copy the contents of: supabase/migrations/20250929_compliance.sql');
    console.log('3. Paste and click "Run"');
  }
}

runMigration();