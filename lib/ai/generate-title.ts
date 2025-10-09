import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ViolationTitleInput {
  codeSectionNumber: string;
  codeSectionText?: string;
  aiReasoning?: string;
  elementType?: string; // e.g., "Door", "Ramp", "Parking"
  checkName?: string;
}

/**
 * Generates a human-readable, natural language title for a violation using GPT-4o-mini
 *
 * Examples:
 * - "Latchside clearance too small"
 * - "Bathroom door too narrow"
 * - "Ramp slope exceeds maximum"
 * - "Accessible parking signage missing"
 */
export async function generateViolationTitle(input: ViolationTitleInput): Promise<string> {
  console.log('[generateViolationTitle] Generating title for:', {
    section: input.codeSectionNumber,
    element: input.elementType,
  });

  // Build context for the LLM
  const contextParts: string[] = [];

  contextParts.push(`Code Section: ${input.codeSectionNumber}`);

  if (input.elementType) {
    contextParts.push(`Building Element: ${input.elementType}`);
  }

  if (input.checkName) {
    contextParts.push(`Check Name: ${input.checkName}`);
  }

  if (input.codeSectionText) {
    // Truncate section text if too long
    const maxSectionLength = 500;
    const sectionText = input.codeSectionText.length > maxSectionLength
      ? input.codeSectionText.slice(0, maxSectionLength) + '...'
      : input.codeSectionText;
    contextParts.push(`Section Text: ${sectionText}`);
  }

  if (input.aiReasoning) {
    // Truncate reasoning if too long
    const maxReasoningLength = 300;
    const reasoning = input.aiReasoning.length > maxReasoningLength
      ? input.aiReasoning.slice(0, maxReasoningLength) + '...'
      : input.aiReasoning;
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
- "Elevator button height too high"
- "Door opening force too strong"

BAD EXAMPLES:
- "11B-404.2.6 violation" (includes code section)
- "Non-compliant maneuvering clearance" (too technical)
- "Issue with door" (too vague)
- "The provided evidence indicates that the door clearance is insufficient" (too long/formal)

Generate ONLY the title, nothing else:`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at converting technical building code violations into clear, concise, actionable titles for non-technical audiences.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3, // Low temperature for more consistent, focused outputs
      max_tokens: 30, // Short titles only
    });

    let title = response.choices[0]?.message?.content?.trim() || '';

    // Remove surrounding quotes if present (LLM sometimes adds them)
    if ((title.startsWith('"') && title.endsWith('"')) || (title.startsWith("'") && title.endsWith("'"))) {
      title = title.slice(1, -1);
    }

    console.log('[generateViolationTitle] Generated title:', title);

    // Validate title length
    if (title.length > 80) {
      console.warn('[generateViolationTitle] Title too long, truncating:', title);
      return title.slice(0, 77) + '...';
    }

    return title;
  } catch (error) {
    console.error('[generateViolationTitle] Error generating title:', error);

    // Fallback to a generic title based on available info
    if (input.elementType) {
      return `${input.elementType} compliance issue`;
    }
    return `Code section ${input.codeSectionNumber} violation`;
  }
}
