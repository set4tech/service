import { supabaseAdmin } from '@/lib/supabase-server';
import AssessmentClient from './ui/AssessmentClient';

export default async function AssessmentPage({ params }: { params: { id: string } }) {
  const supabase = supabaseAdmin();
  const [{ data: assessment }, { data: checks }] = await Promise.all([
    supabase.from('assessments').select('*').eq('id', params.id).single(),
    supabase.from('check_summary').select('*').eq('assessment_id', params.id).order('created_at', { ascending: true })
  ]);

  if (!assessment) {
    return <div className="p-6">Assessment not found.</div>;
  }

  // Progress: completed checks over total checks
  const totalChecks = checks?.length || 0;
  const completed = (checks || []).filter(c => c.latest_status || c.status === 'completed').length;
  const pct = totalChecks ? Math.round((completed / totalChecks) * 100) : 0;

  return (
    <AssessmentClient
      assessment={assessment}
      checks={checks || []}
      progress={{ totalChecks, completed, pct }}
    />
  );
}