#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from('sections')
  .select('drawing_assessable, assessability_tags');

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

const assessable = data.filter(s => s.drawing_assessable).length;
const nonAssessable = data.filter(s => !s.drawing_assessable).length;
const tagged = data.filter(s => s.assessability_tags && s.assessability_tags.length > 0).length;

console.log('Classification Progress:');
console.log('  Total sections:', data.length);
console.log('  Tagged sections:', tagged);
console.log('  Assessable:', assessable);
console.log('  Non-assessable:', nonAssessable);

// Tag breakdown
const tags = {};
data.filter(s => !s.drawing_assessable).forEach(s => {
  (s.assessability_tags || []).forEach(tag => {
    tags[tag] = (tags[tag] || 0) + 1;
  });
});

console.log('\nNon-assessable breakdown:');
Object.entries(tags).sort((a, b) => b[1] - a[1]).forEach(([tag, count]) => {
  console.log('  ' + tag + ':', count);
});
