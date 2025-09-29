const https = require('https');
const fs = require('fs');

// Read the migration file
const migrationSQL = fs.readFileSync('./supabase/migrations/20250929_compliance.sql', 'utf8');

// Prepare the request
const data = JSON.stringify({
  query: migrationSQL
});

const options = {
  hostname: 'grosxzvvmhakkxybeuwu.supabase.co',
  port: 443,
  path: '/rest/v1/rpc',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb3N4enZ2bWhha2t4eWJldXd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNzM4NDQ2MiwiZXhwIjoyMDQyOTYwNDYyfQ.VoMrqMihOhTGlxP-oqaP5S8VKEhbgsysIV_CqpGGsAE',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb3N4enZ2bWhha2t4eWJldXd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNzM4NDQ2MiwiZXhwIjoyMDQyOTYwNDYyfQ.VoMrqMihOhTGlxP-oqaP5S8VKEhbgsysIV_CqpGGsAE'
  }
};

console.log('Attempting to run migration via Supabase API...\n');

const req = https.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response:', responseData);

    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log('\n✅ Migration might have succeeded. Check your database.');
    } else {
      console.log('\n❌ Migration failed. Please run manually in Supabase dashboard.');
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

req.write(data);
req.end();