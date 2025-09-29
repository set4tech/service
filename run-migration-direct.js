const { Client } = require('pg');
const fs = require('fs');

// Database connection using credentials from your environment
const client = new Client({
  host: 'db.grosxzvvmhakkxybeuwu.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'JRY!wvz_juw6fvy*fvz',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    // Read the migration file
    const migrationSQL = fs.readFileSync('./supabase/migrations/20250929_compliance.sql', 'utf8');

    // Split into individual statements (simple split by semicolon)
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`Running ${statements.length} SQL statements...\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';

      // Get the first few words for logging
      const preview = statement.substring(0, 50).replace(/\n/g, ' ');

      try {
        await client.query(statement);
        console.log(`✅ [${i + 1}/${statements.length}] ${preview}...`);
      } catch (error) {
        console.log(`⚠️  [${i + 1}/${statements.length}] ${preview}...`);
        console.log(`   Error: ${error.message}`);
      }
    }

    console.log('\n✅ Migration completed!');

    // Verify tables were created
    console.log('\nVerifying tables...');
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log('\nTables in database:');
    result.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.end();
  }
}

runMigration().catch(console.error);