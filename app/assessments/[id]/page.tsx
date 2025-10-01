import { supabaseAdmin } from '@/lib/supabase-server';
import AssessmentClient from './ui/AssessmentClient';

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const [{ data: assessment }, { data: allChecks }] = await Promise.all([
    supabase.from('assessments').select('*, projects(pdf_url)').eq('id', id).single(),
    supabase
      .from('checks')
      .select('*, element_groups(name, slug)')
      .eq('assessment_id', id)
      .order('code_section_number', { ascending: true }),
  ]);

  // Group checks by parent - instances will be nested under their parent
  const checks = (allChecks || []).reduce((acc: any[], check: any) => {
    if (!check.parent_check_id) {
      // This is a parent check - find all its instances
      const instances = (allChecks || []).filter((c: any) => c.parent_check_id === check.id);

      // Flatten element_groups join
      const elementGroup = check.element_groups;

      acc.push({
        ...check,
        element_group_name: elementGroup?.name || null,
        element_group_slug: elementGroup?.slug || null,
        element_groups: undefined, // Remove nested object
        instances,
        instance_count: instances.length,
      });
    }
    return acc;
  }, []);

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
