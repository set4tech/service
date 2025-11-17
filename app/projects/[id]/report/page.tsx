import { redirect } from 'next/navigation';
import { getProjectViolations } from '@/lib/reports/get-violations';
import { CustomerReportViewer } from '@/components/reports/CustomerReportViewer';
import { isAuthenticatedForReport } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-server';

// Force dynamic rendering - don't use static cache
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProjectReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: assessmentId } = await params;

  const data = await getProjectViolations(assessmentId);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Project Not Found</h1>
          <p className="text-gray-600">Unable to load violation report for this project.</p>
        </div>
      </div>
    );
  }

  // Check if project has a password set
  const supabase = supabaseAdmin();
  const { data: project } = await supabase
    .from('projects')
    .select('id, report_password')
    .eq('id', data.projectId)
    .single();

  // If project has a password, check authentication
  if (project?.report_password) {
    const isAuthenticated = await isAuthenticatedForReport(data.projectId);
    if (!isAuthenticated) {
      redirect(`/projects/${data.projectId}/report/login`);
    }
  }

  // If no password or authenticated, show the report
  return <CustomerReportViewer data={data} />;
}
