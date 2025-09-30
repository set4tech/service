# AI-Based Streaming Applicability Filter - Implementation Plan

**Date:** 2025-09-30
**Status:** Ready for Implementation
**Author:** Claude Code

---

## Overview

Replace the current Postgres rule-based filtering (`filter_sections_explain`) with Claude Opus 4.1 AI analysis that streams results in batches of 10 sections, allowing the UI to load progressively instead of waiting for all sections to process.

### Key Goals

1. **AI-powered filtering**: Use Claude Opus 4.1 to intelligently determine section applicability
2. **Filter out generic sections**: Exclude headers like "GENERAL", "DEFINITIONS" with no substantive requirements
3. **Filter out irrelevant sections**: Exclude sections for features the building doesn't have (e.g., "fishing pier" for office buildings)
4. **Conservative approach**: When uncertain, include the section (false positives preferred over false negatives)
5. **Progressive loading**: Stream results in batches so checks appear incrementally
6. **User feedback**: Display "Still loading code sections..." with progress spinner

---

## Architecture

### System Flow

```
User visits assessment page
    ↓
Frontend detects no checks exist
    ↓
POST /api/assessments/{id}/seed (streaming)
    ↓
Backend:
  1. Fetch all sections for selected code_ids
  2. Fetch project variables (occupancy, size, work type, etc.)
  3. Loop through sections in batches of 10:
     a. Call Claude Opus 4.1 with batch prompt
     b. Parse AI decisions (applies: true/false + reason)
     c. Insert checks for applicable sections
     d. Log all decisions to audit table
     e. Stream batch result to client
  4. Mark assessment as complete
    ↓
Frontend:
  - Receives streaming updates
  - Shows progress bar (X / Y sections processed)
  - Incrementally loads checks as batches complete
  - Shows "Still loading code sections" spinner
  - Reloads page when complete
```

---

## Component 1: AI Prompt Design

### Model

**Claude Opus 4.1**: `claude-opus-4-20250514`

### Prompt Structure

```typescript
const prompt = `You are a building code compliance expert analyzing which code sections apply to this project.

PROJECT DETAILS:
- Occupancy: ${occupancy} (e.g., "B - Business")
- Building Size: ${size} sq ft, ${stories} stories
- Work Type: ${workType} (e.g., "New Construction", "Alteration/Renovation")
- Has Parking: ${hasParking ? 'Yes' : 'No'}
- Facility Type: ${facilityCategory} (e.g., "Private Commercial (ADA Title III)")

ANALYZE THESE 10 SECTIONS:
${sections.map((s, i) => `
${i+1}. Section ${s.number}: ${s.title}
   Text: ${(s.text || s.paragraphs?.join(' ') || 'N/A').slice(0, 500)}
`).join('\n')}

For each section, determine if it applies to this building. Rules:
- EXCLUDE if section is just a header (e.g., "GENERAL", "DEFINITIONS") with no substantive requirements
- EXCLUDE if section is for a specific feature this building clearly doesn't have (e.g., "fishing pier" for an office building, "dispersion of railings on fishing platform")
- INCLUDE if section contains requirements that could apply to this building type
- Be conservative: when uncertain about applicability, INCLUDE it (prefer false positives over false negatives)

Return ONLY a JSON array with 10 objects (one per section, in order):
[
  {
    "section_number": "11B-1001",
    "applies": false,
    "confidence": "high",
    "reason": "Section titled 'GENERAL' with no substantive requirements"
  },
  {
    "section_number": "11B-1005.2",
    "applies": false,
    "confidence": "high",
    "reason": "Fishing pier railings do not apply to office building"
  },
  {
    "section_number": "11B-206.1",
    "applies": true,
    "confidence": "high",
    "reason": "Accessible route requirements apply to all commercial buildings"
  }
]`;
```

### Example Filtering Logic

**EXCLUDE Examples:**
- Section "11B-1001 GENERAL" - Generic header with text "general" only
- Section "11B-1005.2 Dispersion" - About fishing pier railings (not applicable to office)
- Section "11B-XXX DEFINITIONS" - Just definitions, no requirements

**INCLUDE Examples:**
- Section "11B-206.1 Accessible Routes" - Applies to all buildings
- Section "11B-208.3 Parking Spaces" - If building has parking
- Section "11B-305.2 Clear Floor Space" - Universal requirement

---

## Component 2: API Endpoint (Streaming)

### File: `/app/api/assessments/[id]/seed/route.ts`

**Current Implementation**:
- Uses Postgres RPC `filter_sections_explain` with rule-based logic
- Returns single response after all processing

**New Implementation**:
- Replace rule-based filtering with AI batch processing
- Use ReadableStream for chunked JSON responses
- Process sections in batches of 10
- Write checks to DB after each batch
- Stream progress updates to client

### Implementation

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  try {
    // 1. Fetch assessment + project + variables
    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .select(`
        id,
        project_id,
        projects (
          id,
          selected_code_ids,
          extracted_variables
        )
      `)
      .eq('id', id)
      .single();

    if (assessmentError || !assessment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Check if already has checks
    const { data: existingChecks } = await supabase
      .from('checks')
      .select('id')
      .eq('assessment_id', id)
      .limit(1);

    if (existingChecks && existingChecks.length > 0) {
      return NextResponse.json({
        message: 'Assessment already has checks',
        count: existingChecks.length,
      });
    }

    const variables = (assessment.projects as any)?.extracted_variables ?? {};
    const codeIds: string[] = (assessment.projects as any)?.selected_code_ids ?? ['ICC+CBC_Chapter11A_11B+2025+CA'];

    // 2. Fetch ALL sections for selected codes
    const { data: allSections, error: sectionsError } = await supabase
      .from('sections')
      .select('*')
      .in('code_id', codeIds)
      .order('number');

    if (sectionsError || !allSections) {
      return NextResponse.json({ error: 'Failed to fetch sections' }, { status: 500 });
    }

    // 3. Initialize status
    await supabase
      .from('assessments')
      .update({
        seeding_status: 'in_progress',
        sections_total: allSections.length,
        sections_processed: 0
      })
      .eq('id', id);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // 4. Stream response using ReadableStream
    const stream = new ReadableStream({
      async start(controller) {
        const BATCH_SIZE = 10;
        let processedCount = 0;
        let includedCount = 0;

        for (let i = 0; i < allSections.length; i += BATCH_SIZE) {
          const batch = allSections.slice(i, i + BATCH_SIZE);

          try {
            // AI Analysis
            const prompt = buildBatchPrompt(batch, variables);
            const response = await anthropic.messages.create({
              model: 'claude-opus-4-20250514',
              max_tokens: 2000,
              temperature: 0.1,
              messages: [{ role: 'user', content: prompt }]
            });

            const decisionsText = response.content[0].type === 'text'
              ? response.content[0].text
              : '[]';
            const decisions = JSON.parse(decisionsText);

            // Filter applicable sections
            const applicable = batch.filter((section, idx) =>
              decisions[idx]?.applies === true
            );

            // Insert checks for this batch
            if (applicable.length > 0) {
              const checkRows = applicable.map((s) => ({
                assessment_id: id,
                code_section_key: s.key,
                code_section_number: s.number,
                code_section_title: s.title,
                check_name: `${s.number} - ${s.title}`,
                status: 'pending',
              }));

              const { error: insertError } = await supabase.from('checks').insert(checkRows);
              if (insertError) {
                console.error('Failed to insert checks:', insertError);
              }
            }

            // Log ALL decisions (both included and excluded) to audit table
            const logRows = batch.map((s, idx) => ({
              assessment_id: id,
              section_key: s.key,
              decision: decisions[idx]?.applies || false,
              decision_source: 'ai',
              decision_confidence: decisions[idx]?.confidence || 'low',
              reasons: [decisions[idx]?.reason || 'No reason provided'],
              details: {},
              building_params_hash: 'ai_hash',
              variables_snapshot: variables
            }));

            await supabase.from('section_applicability_log').insert(logRows);

            processedCount += batch.length;
            includedCount += applicable.length;

            // Update progress in assessments table
            await supabase
              .from('assessments')
              .update({ sections_processed: processedCount })
              .eq('id', id);

            // Stream batch result to client
            const message = JSON.stringify({
              type: 'batch_complete',
              processed: processedCount,
              total: allSections.length,
              included_in_batch: applicable.length,
              total_included: includedCount
            }) + '\n';

            controller.enqueue(new TextEncoder().encode(message));

          } catch (error) {
            console.error('Batch processing error:', error);
            const errorMsg = JSON.stringify({
              type: 'error',
              message: error instanceof Error ? error.message : 'Unknown error',
              batch_index: i
            }) + '\n';
            controller.enqueue(new TextEncoder().encode(errorMsg));
          }
        }

        // Finalize
        await supabase
          .from('assessments')
          .update({
            seeding_status: 'completed',
            total_sections: includedCount
          })
          .eq('id', id);

        const finalMsg = JSON.stringify({
          type: 'complete',
          total_processed: processedCount,
          total_included: includedCount,
          total_excluded: processedCount - includedCount
        }) + '\n';

        controller.enqueue(new TextEncoder().encode(finalMsg));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error) {
    console.error('Error seeding assessment:', error);
    return NextResponse.json(
      {
        error: 'Failed to seed assessment',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function buildBatchPrompt(sections: any[], variables: any): string {
  // Extract building characteristics
  const occ = variables?.building_characteristics?.occupancy_classification?.value || 'Unknown';
  const size = variables?.building_characteristics?.building_size_sf?.value || 'Unknown';
  const stories = variables?.building_characteristics?.number_of_stories?.value || 'Unknown';
  const workType = variables?.project_scope?.work_type?.value || 'Unknown';
  const hasParking = variables?.building_characteristics?.has_parking?.value;
  const facilityCategory = variables?.facility_type?.category?.value || 'Unknown';

  return `You are a building code compliance expert analyzing which code sections apply to this project.

PROJECT DETAILS:
- Occupancy: ${occ}
- Building Size: ${size} sq ft, ${stories} stories
- Work Type: ${workType}
- Has Parking: ${hasParking ? 'Yes' : 'No'}
- Facility Type: ${facilityCategory}

ANALYZE THESE ${sections.length} SECTIONS:
${sections.map((s, i) => `
${i+1}. Section ${s.number}: ${s.title}
   Text: ${(s.text || (s.paragraphs && Array.isArray(s.paragraphs) ? s.paragraphs.join(' ') : '') || 'N/A').slice(0, 500)}
`).join('\n')}

For each section, determine if it applies to this building. Rules:
- EXCLUDE if section is just a header (e.g., "GENERAL", "DEFINITIONS") with no substantive requirements
- EXCLUDE if section is for a specific feature this building clearly doesn't have (e.g., "fishing pier" for an office building, "dispersion of railings on fishing platform")
- INCLUDE if section contains requirements that could apply to this building type
- Be conservative: when uncertain about applicability, INCLUDE it (prefer false positives over false negatives)

Return ONLY a JSON array with ${sections.length} objects (one per section, in order):
[
  {
    "section_number": "11B-xxx",
    "applies": true,
    "confidence": "high",
    "reason": "Brief explanation in one sentence"
  }
]`;
}
```

---

## Component 3: Database Schema Changes

### Add Seeding Status Columns to Assessments

**Migration File**: `supabase/migrations/YYYYMMDD_add_streaming_status.sql`

```sql
-- Add columns to track streaming progress
ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS seeding_status TEXT DEFAULT 'not_started',
  -- 'not_started' | 'in_progress' | 'completed' | 'failed'
  ADD COLUMN IF NOT EXISTS sections_processed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sections_total INTEGER DEFAULT 0;

-- Index for querying in-progress assessments
CREATE INDEX IF NOT EXISTS idx_assessments_seeding_status
  ON assessments(seeding_status);
```

### Leverage Existing Tables

**No changes needed** - existing schema already supports AI decisions:

- **`checks` table**: Stores applicable sections (status: 'pending')
- **`section_applicability_log` table**: Audit trail with:
  - `decision_source`: 'ai' (vs 'rule')
  - `decision_confidence`: 'high' | 'medium' | 'low'
  - `reasons`: TEXT[] array for AI reasoning

---

## Component 4: Frontend Changes

### File: `app/assessments/[id]/ui/AssessmentClient.tsx`

**Current Implementation** (lines 68-93):
- Simple POST request to `/api/assessments/{id}/seed`
- Reloads page when complete
- No progress feedback

**New Implementation**:
- Streaming fetch with ReadableStream
- Parse chunked JSON responses
- Update progress UI in real-time
- Show "Still loading code sections" modal with spinner
- Incrementally refetch checks (optional)
- Reload page when complete

### Code Changes

```typescript
'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
// ... other imports

interface Props {
  assessment: any;
  checks: any[];
  progress: { totalChecks: number; completed: number; pct: number };
}

export default function AssessmentClient({
  assessment,
  checks: initialChecks,
  progress: initialProgress,
}: Props) {
  const [checks, setChecks] = useState(initialChecks);
  const [progress] = useState(initialProgress);
  const [isSeeding, setIsSeeding] = useState(false);
  const [activeCheckId, setActiveCheckId] = useState<string | null>(checks[0]?.id || null);

  // NEW: Streaming progress state
  const [seedingProgress, setSeedingProgress] = useState<{
    processed: number;
    total: number;
    included: number;
  } | null>(null);

  // ... other state ...

  // Auto-seed checks if empty (only try once)
  const [hasSeedAttempted, setHasSeedAttempted] = useState(false);

  useEffect(() => {
    if (checks.length === 0 && !isSeeding && !hasSeedAttempted) {
      setIsSeeding(true);
      setHasSeedAttempted(true);

      // Streaming fetch
      fetch(`/api/assessments/${assessment.id}/seed`, { method: 'POST' })
        .then(async response => {
          if (!response.ok) {
            throw new Error(`Seed failed: ${response.status}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('No response body reader');
          }

          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(l => l.trim());

            for (const line of lines) {
              try {
                const message = JSON.parse(line);

                if (message.type === 'batch_complete') {
                  // Update UI with progress
                  setSeedingProgress({
                    processed: message.processed,
                    total: message.total,
                    included: message.total_included
                  });

                  // Optionally refetch checks incrementally
                  // This would require a separate endpoint to fetch checks
                  // For now, we'll just show progress and reload at the end

                } else if (message.type === 'complete') {
                  console.log('Seeding complete:', message);
                  // Reload to show all checks
                  setTimeout(() => {
                    window.location.reload();
                  }, 500);

                } else if (message.type === 'error') {
                  console.error('Batch error:', message.message);
                }
              } catch (e) {
                console.error('Failed to parse stream message:', e);
              }
            }
          }
        })
        .catch(error => {
          console.error('Failed to seed assessment:', error);
          setIsSeeding(false);
        });
    }
  }, [assessment.id, checks.length, isSeeding, hasSeedAttempted]);

  // ... rest of component ...

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-100">
      {/* Loading Modal */}
      {isSeeding && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <h3 className="text-lg font-semibold">Loading Code Sections</h3>
            </div>

            {seedingProgress && (
              <div className="space-y-3">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Processed: {seedingProgress.processed} / {seedingProgress.total}</span>
                  <span className="font-medium text-blue-600">
                    Applicable: {seedingProgress.included}
                  </span>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                    style={{
                      width: `${Math.round((seedingProgress.processed / seedingProgress.total) * 100)}%`
                    }}
                  />
                </div>

                <div className="text-xs text-gray-500 text-center">
                  {Math.round((seedingProgress.processed / seedingProgress.total) * 100)}% complete
                </div>
              </div>
            )}

            <p className="text-sm text-gray-500 mt-4">
              AI is analyzing code sections for applicability to your project.
              Generic sections and irrelevant features are being filtered out.
            </p>
          </div>
        </div>
      )}

      {/* ... rest of UI ... */}
    </div>
  );
}
```

---

## Cost Analysis

### Claude Opus 4.1 Pricing

- **Input**: $15/MTok
- **Output**: $75/MTok

### Per Assessment Cost (700 sections example)

**Without Prompt Caching**:
- 70 batches of 10 sections
- ~1,500 tokens input per batch (project details + 10 sections with text)
- ~500 tokens output per batch (JSON decisions array)
- **Total Input**: 70 × 1,500 = 105,000 tokens = 105K
- **Total Output**: 70 × 500 = 35,000 tokens = 35K
- **Cost**:
  - Input: 105K × $15/M = $1.58
  - Output: 35K × $75/M = $2.63
  - **Total: $4.21 per assessment**

**With Prompt Caching** (cache project details):
- Cache project details block (~300 tokens)
- Cache hit reduces input cost by ~20-30%
- **Estimated Cost: $2.50-$3.00 per assessment**

### Monthly Cost Estimate

- **10 assessments/month**: $25-$42
- **50 assessments/month**: $125-$210
- **100 assessments/month**: $250-$420

---

## Testing Plan

### Phase 1: Prompt Engineering (1 day)

1. **Test prompt with sample sections**:
   - 3 generic headers ("GENERAL", "DEFINITIONS", "SCOPE")
   - 3 irrelevant features (fishing pier, swimming pool, elevator for single-story building)
   - 4 universal requirements (accessible routes, door width, floor surfaces)

2. **Validate AI decisions**:
   - Target: 95%+ accuracy on clear cases
   - Target: Conservative on ambiguous cases (prefer inclusion)

3. **Iterate prompt if needed**:
   - Adjust wording for better consistency
   - Add examples if AI struggles with edge cases

### Phase 2: API Integration (1 day)

1. **Unit test streaming endpoint**:
   - Mock 30 sections (3 batches)
   - Verify streaming output format
   - Verify checks are inserted correctly
   - Verify audit log is populated

2. **Test error handling**:
   - API timeout
   - Invalid JSON from AI
   - Database insert failure

### Phase 3: Full Integration (2 days)

1. **Test with small code book** (50-100 sections):
   - Verify end-to-end flow
   - Verify UI updates correctly
   - Verify page reload shows all checks

2. **Test with full CBC book** (682 sections):
   - Monitor performance (~7 minutes expected)
   - Monitor AI cost (~$4)
   - Verify accuracy by sampling 50 random sections

3. **Load testing**:
   - Multiple concurrent assessments
   - Verify no rate limiting issues
   - Verify no memory leaks

### Phase 4: Validation (1 day)

1. **Expert review**:
   - Have code expert review 100 random decisions
   - Target: 95%+ agreement rate
   - Document any systematic errors

2. **User testing**:
   - Test with 3-5 different building types
   - Verify filtering makes sense
   - Gather feedback on progress UI

---

## Migration Strategy

### Option A: Direct Cutover

1. Deploy new streaming endpoint
2. Remove old Postgres RPC function
3. Monitor first 5-10 assessments closely

**Pros**: Simple, clean break
**Cons**: No fallback if issues arise

### Option B: Feature Flag (Recommended)

1. Add environment variable `ENABLE_AI_FILTERING=true`
2. Keep old endpoint as fallback
3. Gradually enable for new assessments
4. Monitor accuracy and cost
5. Full cutover after 20-30 successful assessments

**Pros**: Safe, allows rollback
**Cons**: More complex deployment

### Option C: A/B Testing

1. Randomly assign 50% of new assessments to AI filtering
2. Compare results side-by-side
3. Measure accuracy, cost, performance
4. Choose winner after 50 assessments

**Pros**: Data-driven decision
**Cons**: Most complex, requires dual implementation

---

## Rollout Plan

### Week 1: Development
- Day 1-2: Implement streaming API endpoint
- Day 3: Implement frontend changes
- Day 4: Database migration
- Day 5: Testing & bug fixes

### Week 2: Testing & Validation
- Day 1-2: Unit & integration testing
- Day 3: Full load testing with CBC book
- Day 4: Expert validation
- Day 5: User acceptance testing

### Week 3: Deployment
- Day 1: Deploy to staging
- Day 2: Final validation on staging
- Day 3: Deploy to production with feature flag OFF
- Day 4: Enable for 25% of assessments
- Day 5: Monitor & adjust

### Week 4: Full Rollout
- Day 1-2: Enable for 100% if no issues
- Day 3-5: Monitor, optimize, document

---

## Success Metrics

### Accuracy
- **Target**: 95%+ agreement with expert review
- **Measure**: Sample 100 sections, compare AI vs. expert decisions

### Performance
- **Target**: <10 minutes for 700 sections
- **Measure**: Average time from start to completion

### Cost
- **Target**: <$5 per assessment
- **Measure**: Track Anthropic API usage

### User Experience
- **Target**: 90%+ of users find filtering helpful
- **Measure**: User survey after 30 days

---

## Risk Mitigation

### Risk 1: AI Accuracy Issues
**Mitigation**:
- Conservative prompt design (prefer inclusion)
- Log all decisions for audit
- Allow manual review of filtered sections
- Add "Show all sections" toggle in UI

### Risk 2: High API Costs
**Mitigation**:
- Implement prompt caching
- Set daily spending limit on Anthropic account
- Monitor costs per assessment
- Consider cheaper model (Sonnet 3.7) if Opus too expensive

### Risk 3: Streaming Failures
**Mitigation**:
- Keep old endpoint as fallback
- Add retry logic for individual batches
- Save progress to DB (can resume if interrupted)
- Add timeout handling (10 min max)

### Risk 4: User Confusion
**Mitigation**:
- Clear progress messaging
- Show count of filtered vs. total sections
- Add "Why was this filtered?" explainer
- Document filtering logic in help docs

---

## Future Enhancements

### Phase 2 Features (Post-MVP)

1. **Manual Override**: Allow users to add filtered sections back
2. **Confidence Flagging**: Mark low-confidence sections for review
3. **Learning Loop**: Track user overrides to improve prompt
4. **Batch Optimization**: Process larger batches (20-30) if accuracy remains high
5. **Cost Optimization**: Switch to Sonnet 3.7 if accuracy comparable

### Long-term Vision

- **Hybrid Approach**: Use rules for obvious cases, AI for edge cases
- **Section Clustering**: Group similar sections for batch analysis
- **Custom Filters**: Allow users to define custom filtering rules
- **Multi-code Support**: Optimize for multiple code books simultaneously

---

## Files to Create/Modify

### Create
1. `supabase/migrations/YYYYMMDD_add_streaming_status.sql` - Streaming status columns

### Modify
1. `app/api/assessments/[id]/seed/route.ts` - Replace with streaming AI endpoint
2. `app/assessments/[id]/ui/AssessmentClient.tsx` - Add streaming UI and progress modal
3. `package.json` - Add `@anthropic-ai/sdk` if not already present

### Delete (Post-migration)
1. `lib/variables.ts` - May no longer be needed if not using rule-based filtering
2. `supabase/migrations/20250930_applicability.sql` - Old rule-based schema (keep for reference)

---

## Environment Variables

Add to `.env` or `.envrc`:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Optional
ENABLE_AI_FILTERING=true  # Feature flag
AI_FILTERING_BATCH_SIZE=10
AI_FILTERING_MODEL=claude-opus-4-20250514
AI_FILTERING_MAX_TOKENS=2000
```

---

## Documentation

### User-Facing
- **Help Article**: "How Code Sections Are Filtered"
- **FAQ**: "Why don't I see all code sections?"
- **Changelog**: Document this feature release

### Developer-Facing
- **API Docs**: Document streaming endpoint
- **Prompt Engineering**: Document prompt design decisions
- **Cost Monitoring**: Set up dashboard for API costs

---

## Summary

This implementation plan provides:

1. ✅ **AI-powered filtering** using Claude Opus 4.1
2. ✅ **Streaming architecture** for progressive loading
3. ✅ **Smart filtering** of generic/irrelevant sections
4. ✅ **Conservative approach** (prefer false positives)
5. ✅ **User feedback** with progress spinner
6. ✅ **Cost-effective** (~$2-4 per assessment)
7. ✅ **Comprehensive testing** plan
8. ✅ **Safe rollout** strategy

**Estimated Effort**: 2-3 weeks (1 dev, full-time)

**Estimated Cost**: $2-4 per assessment, $100-400/month for 50-100 assessments

---

**Next Steps**: Review plan → Approve → Begin Week 1 development
