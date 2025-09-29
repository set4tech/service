import { NextRequest, NextResponse } from 'next/server';
import { PromptVariablesSchema, renderTemplate } from '@/lib/prompt';

export async function POST(req: NextRequest) {
  const { systemPrompt, userPromptTemplate, instructionTemplate, variables } = await req.json();
  const parsed = PromptVariablesSchema.safeParse(variables);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  const preview = [
    systemPrompt?.trim() || '',
    renderTemplate(userPromptTemplate || '', parsed.data),
    instructionTemplate?.trim() || ''
  ].filter(Boolean).join('\n\n');
  return NextResponse.json({ preview });
}