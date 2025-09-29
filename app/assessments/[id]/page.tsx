import { supabaseAdmin } from '@/lib/supabase-server';
import { getCodeAssembly } from '@/lib/neo4j';
import AssessmentClient from './ui/AssessmentClient';

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  console.log('Assessment ID:', id);

  const [
    { data: assessment, error: assessmentError },
    { data: initialChecks, error: checksError },
  ] = await Promise.all([
    supabase.from('assessments').select('*, projects(pdf_url)').eq('id', id).single(),
    supabase
      .from('check_summary')
      .select('*')
      .eq('assessment_id', id)
      .order('created_at', { ascending: true }),
  ]);

  let checks = initialChecks;

  console.log('Assessment found:', !!assessment);
  console.log('Assessment error:', assessmentError);
  console.log('Checks count:', checks?.length || 0);
  console.log('Checks error:', checksError);

  if (!assessment) {
    return <div className="p-6">Assessment not found.</div>;
  }

  // If no checks exist, automatically seed them from the code assembly
  if (!checks || checks.length === 0) {
    console.log('No checks found, seeding from code assembly...');

    // Default to California Building Code for now
    const codeId = 'ICC+CBC_Chapter11A_11B+2025+CA';

    try {
      // Get the code assembly from Neo4j
      const assembly = await getCodeAssembly(codeId);
      const sections = assembly.sections || [];

      if (sections.length > 0) {
        // Create check records for each section
        const checkRows = sections.map((s: any) => ({
          assessment_id: id,
          code_section_key: s.key,
          code_section_number: s.number,
          code_section_title: s.title,
          check_name: `${s.number} - ${s.title}`,
          check_location: '',
          status: 'pending',
        }));

        // Insert all checks
        const { error: insertError } = await supabase.from('checks').insert(checkRows);

        if (!insertError) {
          console.log(`Seeded ${checkRows.length} checks for assessment`);

          // Update assessment with total sections count
          await supabase
            .from('assessments')
            .update({ total_sections: checkRows.length })
            .eq('id', id);

          // Reload the checks after seeding
          const { data: newChecks } = await supabase
            .from('check_summary')
            .select('*')
            .eq('assessment_id', id)
            .order('created_at', { ascending: true });

          checks = newChecks;
        } else {
          console.error('Failed to seed checks:', insertError);
        }
      }
    } catch (error) {
      console.error('Error seeding assessment:', error);
    }
  }

  // Get PDF URL from the related project
  const assessmentWithPdf = {
    ...assessment,
    pdf_url: assessment.projects?.pdf_url || null,
  };

  // Progress: completed checks over total checks
  const totalChecks = checks?.length || 0;
  const completed = (checks || []).filter(c => c.latest_status || c.status === 'completed').length;
  const pct = totalChecks ? Math.round((completed / totalChecks) * 100) : 0;

  return (
    <AssessmentClient
      assessment={assessmentWithPdf}
      checks={checks || []}
      progress={{ totalChecks, completed, pct }}
    />
  );
}
