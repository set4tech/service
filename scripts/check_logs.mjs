import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const assessmentId = 'dac17c6b-4d22-46fc-aa3e-3db9bd1015a3';

async function checkLogs() {
  console.log(`Checking applicability logs for: ${assessmentId}\n`);

  const { data: logs } = await supabase
    .from('section_applicability_log')
    .select('*')
    .eq('assessment_id', assessmentId)
    .order('created_at');

  console.log(`Total applicability log entries: ${logs?.length}\n`);

  // Group by section_key
  const keyMap = new Map();
  logs?.forEach(log => {
    const key = log.section_key;
    if (!keyMap.has(key)) {
      keyMap.set(key, []);
    }
    keyMap.get(key).push(log);
  });

  const duplicateKeys = Array.from(keyMap.entries())
    .filter(([_, arr]) => arr.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`Sections logged multiple times: ${duplicateKeys.length}\n`);

  if (duplicateKeys.length > 0) {
    console.log('First 10 sections logged multiple times:');
    duplicateKeys.slice(0, 10).forEach(([key, arr]) => {
      console.log(`\n  ${key} (logged ${arr.length} times):`);
      arr.forEach((log, idx) => {
        console.log(`    ${idx + 1}. Decision: ${log.decision}, Created: ${log.created_at}`);
      });
    });
  }

  // Check distinct timestamps
  const timestamps = [...new Set(logs?.map(l => l.created_at.split('T')[0] + ' ' + l.created_at.split('T')[1].split('.')[0].substring(0, 8)))];
  console.log(`\nDistinct timestamps (grouped by minute): ${timestamps.length}`);
  timestamps.forEach(ts => {
    const count = logs?.filter(l => l.created_at.startsWith(ts.replace(' ', 'T'))).length;
    console.log(`  ${ts}: ${count} logs`);
  });
}

checkLogs().catch(console.error);
