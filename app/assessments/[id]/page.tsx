import { supabaseAdmin } from '@/lib/supabase-server';
import AssessmentClient from './ui/AssessmentClient';

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  console.log('Assessment ID:', id);

  const [{ data: assessment, error: assessmentError }, { data: checks, error: checksError }] =
    await Promise.all([
      supabase.from('assessments').select('*, projects(pdf_url)').eq('id', id).single(),
      supabase
        .from('check_summary')
        .select('*')
        .eq('assessment_id', id)
        .order('created_at', { ascending: true }),
    ]);

  console.log('Assessment found:', !!assessment);
  console.log('Assessment error:', assessmentError);
  console.log('Checks count:', checks?.length || 0);
  console.log('Checks error:', checksError);

  if (!assessment) {
    return <div className="p-6">Assessment not found.</div>;
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
