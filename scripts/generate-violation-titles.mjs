#!/usr/bin/env node

/**
 * Batch generate human-readable titles for all existing violations
 *
 * Usage:
 *   node scripts/generate-violation-titles.mjs [--dry-run] [--limit=N]
 *
 * Options:
 *   --dry-run    Show what would be generated without saving to database
 *   --limit=N    Only process first N checks
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !OPENAI_API_KEY) {
  console.error('Missing required environment variables:');
  console.error('  SUPABASE_URL:', !!SUPABASE_URL);
  console.error('  SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY:', !!SUPABASE_SERVICE_KEY);
  console.error('  OPENAI_API_KEY:', !!OPENAI_API_KEY);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Parse CLI args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

console.log('🚀 Starting violation title generation');
console.log('  Mode:', isDryRun ? 'DRY RUN (no database updates)' : 'LIVE');
if (limit) {
  console.log('  Limit:', limit, 'checks');
}
console.log('');

/**
 * Generate a human-readable title for a violation
 */
async function generateTitle({
  codeSectionNumber,
  codeSectionText,
  aiReasoning,
  elementType,
  checkName,
}) {
  const contextParts = [];

  contextParts.push(`Code Section: ${codeSectionNumber}`);

  if (elementType) {
    contextParts.push(`Building Element: ${elementType}`);
  }

  if (checkName) {
    contextParts.push(`Check Name: ${checkName}`);
  }

  if (codeSectionText) {
    const maxSectionLength = 500;
    const sectionText =
      codeSectionText.length > maxSectionLength
        ? codeSectionText.slice(0, maxSectionLength) + '...'
        : codeSectionText;
    contextParts.push(`Section Text: ${sectionText}`);
  }

  if (aiReasoning) {
    const maxReasoningLength = 300;
    const reasoning =
      aiReasoning.length > maxReasoningLength
        ? aiReasoning.slice(0, maxReasoningLength) + '...'
        : aiReasoning;
    contextParts.push(`Violation Analysis: ${reasoning}`);
  }

  const context = contextParts.join('\n\n');

  const prompt = `You are a building code compliance expert. Convert the following technical accessibility violation into a short, actionable title in plain English.

${context}

REQUIREMENTS:
- Maximum 60 characters
- Use plain, non-technical language
- Be specific about what's wrong (e.g., "too small", "missing", "exceeds limit")
- Focus on the actual problem, not the code section
- Use active voice when possible
- Do NOT include the code section number
- Do NOT use jargon or abbreviations unless universally understood

GOOD EXAMPLES:
- "Latchside clearance too small"
- "Bathroom door too narrow"
- "Ramp slope exceeds maximum"
- "Accessible parking signage missing"

Generate ONLY the title, nothing else:`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert at converting technical building code violations into clear, concise, actionable titles for non-technical audiences.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 30,
    });

    let title = response.choices[0]?.message?.content?.trim() || '';

    // Remove surrounding quotes if present (LLM sometimes adds them)
    if ((title.startsWith('"') && title.endsWith('"')) || (title.startsWith("'") && title.endsWith("'"))) {
      title = title.slice(1, -1);
    }

    // Validate title length
    if (title.length > 80) {
      title = title.slice(0, 77) + '...';
    }

    return title;
  } catch (error) {
    console.error('    ⚠️  Error generating title:', error.message);

    // Fallback to a generic title
    if (elementType) {
      return `${elementType} compliance issue`;
    }
    return `Code section ${codeSectionNumber} violation`;
  }
}

/**
 * Main execution
 */
async function main() {
  // Query all checks that have violations (non-compliant or needs_more_info)
  // and don't already have a human_readable_title
  console.log('📋 Fetching checks with violations...\n');

  // First get checks with manual overrides
  const { data: manualChecks } = await supabase
    .from('checks')
    .select(
      `
      id,
      code_section_key,
      code_section_number,
      check_name,
      human_readable_title,
      element_group_id,
      manual_override,
      latest_analysis_runs(
        compliance_status,
        ai_reasoning
      )
    `
    )
    .in('manual_override', ['non_compliant', 'needs_more_info'])
    .is('human_readable_title', null)
    .limit(limit || 1000);

  // Then get checks with AI analysis showing violations
  const { data: aiChecks } = await supabase
    .from('checks')
    .select(
      `
      id,
      code_section_key,
      code_section_number,
      check_name,
      human_readable_title,
      element_group_id,
      manual_override,
      latest_analysis_runs!inner(
        compliance_status,
        ai_reasoning
      )
    `
    )
    .is('manual_override', null)
    .is('human_readable_title', null)
    .limit(limit || 1000);

  // Combine and deduplicate
  const allChecks = [...(manualChecks || []), ...(aiChecks || [])];
  const uniqueChecksMap = new Map();
  allChecks.forEach(check => {
    if (!uniqueChecksMap.has(check.id)) {
      uniqueChecksMap.set(check.id, check);
    }
  });
  const checks = Array.from(uniqueChecksMap.values()).slice(0, limit || 1000);

  const checksError = null; // Already handled in individual queries

  if (checksError) {
    console.error('❌ Failed to fetch checks:', checksError);
    process.exit(1);
  }

  if (!checks || checks.length === 0) {
    console.log('✅ No checks found needing title generation');
    process.exit(0);
  }

  console.log(`Found ${checks.length} checks needing titles\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    const progress = `[${i + 1}/${checks.length}]`;

    console.log(`${progress} Processing check ${check.id.slice(0, 8)}...`);

    // Get element group name if applicable
    let elementType;
    if (check.element_group_id) {
      const { data: elementGroup } = await supabase
        .from('element_groups')
        .select('name')
        .eq('id', check.element_group_id)
        .single();

      elementType = elementGroup?.name;
    }

    // Get section text for additional context
    let sectionText;
    if (check.code_section_key) {
      const { data: section } = await supabase
        .from('sections')
        .select('text')
        .eq('key', check.code_section_key)
        .single();

      sectionText = section?.text;
    }

    // Extract AI reasoning from latest analysis
    const latestAnalysis = Array.isArray(check.latest_analysis_runs)
      ? check.latest_analysis_runs[0]
      : check.latest_analysis_runs;

    const aiReasoning = latestAnalysis?.ai_reasoning;

    try {
      // Generate the title
      const title = await generateTitle({
        codeSectionNumber: check.code_section_number || check.code_section_key,
        codeSectionText: sectionText,
        aiReasoning,
        elementType,
        checkName: check.check_name,
      });

      console.log(`  ✅ Generated: "${title}"`);

      // Save to database (unless dry run)
      if (!isDryRun) {
        const { error: updateError } = await supabase
          .from('checks')
          .update({ human_readable_title: title })
          .eq('id', check.id);

        if (updateError) {
          console.error('    ⚠️  Failed to save:', updateError.message);
          errorCount++;
        } else {
          successCount++;
        }
      } else {
        successCount++;
      }

      // Rate limiting: wait 200ms between requests to avoid hitting API limits
      if (i < checks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`  ❌ Error processing check:`, error.message);
      errorCount++;
    }

    console.log('');
  }

  // Summary
  console.log('═'.repeat(60));
  console.log('📊 Summary');
  console.log('═'.repeat(60));
  console.log(`  Total checks processed: ${checks.length}`);
  console.log(`  ✅ Successful: ${successCount}`);
  console.log(`  ❌ Errors: ${errorCount}`);
  if (isDryRun) {
    console.log(`  🔍 Mode: DRY RUN (no changes saved)`);
  }
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
