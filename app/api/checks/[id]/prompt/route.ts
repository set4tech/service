import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getCodeAssembly } from '@/lib/neo4j';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: checkId } = await params;
  const supabase = supabaseAdmin();

  try {
    // 1. Fetch check from DB
    const { data: check, error: checkError } = await supabase
      .from('checks')
      .select('*, assessments(project_id, projects(extracted_variables, code_assembly_id))')
      .eq('id', checkId)
      .single();

    if (checkError || !check) {
      return NextResponse.json({ error: 'Check not found' }, { status: 404 });
    }

    // 2. Get project variables
    const assessment = check.assessments as any;
    const project = assessment?.projects;
    const buildingContext = project?.extracted_variables || {};
    const codeAssemblyId = project?.code_assembly_id;

    // 3. Fetch code section text from Neo4j
    let codeSectionText = '';
    let codeSectionData: any = null;

    if (check.code_section_key && codeAssemblyId) {
      const assembly = await getCodeAssembly(codeAssemblyId);
      const section = assembly.sections?.find((s: any) => s.key === check.code_section_key);
      if (section) {
        codeSectionText = section.fullText || '';
        codeSectionData = {
          number: section.number || check.code_section_number || '',
          title: section.title || check.code_section_title || '',
          text: codeSectionText,
        };
      }
    }

    // Fallback if Neo4j doesn't have the section
    if (!codeSectionData) {
      codeSectionData = {
        number: check.code_section_number || '',
        title: check.code_section_title || '',
        text: 'Section text not available from code assembly',
      };
    }

    // 4. Fetch screenshot count
    const { count: screenshotCount } = await supabase
      .from('screenshots')
      .select('*', { count: 'exact', head: true })
      .eq('check_id', checkId);

    // 5. Build the default prompt
    const screenshotsSection =
      screenshotCount && screenshotCount > 0
        ? `# Evidence (Screenshots)\nProvided ${screenshotCount} screenshot(s) showing relevant documentation.`
        : '# Evidence\nNo screenshots provided. Base assessment on building information and code requirements.';

    const prompt = `You are an expert building code compliance analyst. Your task is to assess whether the provided project demonstrates compliance with a specific building code section.

# Building Code Section
Section: ${codeSectionData.number} - ${codeSectionData.title}

${codeSectionData.text}

# Project Information
${JSON.stringify(buildingContext, null, 2)}

# Check Details
Location: ${check.check_location || 'Not specified'}
Check: ${check.check_name || 'Compliance check'}

${screenshotsSection}

# Your Task
Analyze the evidence and determine:
1. Compliance status: Must be one of: "compliant", "violation", "needs_more_info"
2. Confidence level: "high", "medium", or "low"
3. Reasoning for your determination
4. Any violations found (if applicable)
5. Recommendations (if applicable)

Return your response as a JSON object with this exact structure:
{
  "compliance_status": "compliant" | "violation" | "needs_more_info",
  "confidence": "high" | "medium" | "low",
  "reasoning": "your detailed reasoning here",
  "violations": [{"description": "...", "severity": "minor"|"moderate"|"major"}],
  "recommendations": ["recommendation 1", "recommendation 2"]
}`;

    return NextResponse.json({ prompt });
  } catch (error: any) {
    console.error('Prompt generation error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate prompt' },
      { status: 500 }
    );
  }
}
