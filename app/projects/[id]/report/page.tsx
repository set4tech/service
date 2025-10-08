import { getProjectViolations } from '@/lib/reports/get-violations';
import { CustomerReportViewer } from '@/components/reports/CustomerReportViewer';

// Force dynamic rendering - don't use static cache
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProjectReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getProjectViolations(id);

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

  return <CustomerReportViewer data={data} />;
}
