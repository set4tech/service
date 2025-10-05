import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSectionDuplicates() {
  const codeId = 'ICC+CBC_Chapter11A_11B+2025+CA';

  const { data: sections } = await supabase
    .from('sections')
    .select('key, number, title, id')
    .eq('code_id', codeId)
    .eq('drawing_assessable', true)
    .order('number');

  console.log(`Total sections: ${sections?.length}\n`);

  // Group by key
  const keyMap = new Map();
  sections?.forEach(s => {
    if (!keyMap.has(s.key)) {
      keyMap.set(s.key, []);
    }
    keyMap.get(s.key).push(s);
  });

  const duplicateKeys = Array.from(keyMap.entries())
    .filter(([_, arr]) => arr.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`Sections with duplicate keys: ${duplicateKeys.length}\n`);

  if (duplicateKeys.length > 0) {
    console.log('First 20 duplicate keys:');
    duplicateKeys.slice(0, 20).forEach(([key, arr]) => {
      console.log(`\n  ${key} (${arr.length} copies):`);
      arr.forEach((s, idx) => {
        console.log(`    ${idx + 1}. ${s.number}: ${s.title} (ID: ${s.id})`);
      });
    });
  }

  // Group by number
  const numberMap = new Map();
  sections?.forEach(s => {
    if (!numberMap.has(s.number)) {
      numberMap.set(s.number, []);
    }
    numberMap.get(s.number).push(s);
  });

  const duplicateNumbers = Array.from(numberMap.entries())
    .filter(([_, arr]) => arr.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`\n\nSections with duplicate numbers: ${duplicateNumbers.length}\n`);

  if (duplicateNumbers.length > 0) {
    console.log('First 20 duplicate numbers:');
    duplicateNumbers.slice(0, 20).forEach(([number, arr]) => {
      console.log(`\n  ${number} (${arr.length} copies):`);
      arr.forEach((s, idx) => {
        console.log(`    ${idx + 1}. Key: ${s.key}, Title: ${s.title}`);
      });
    });
  }
}

checkSectionDuplicates().catch(console.error);
