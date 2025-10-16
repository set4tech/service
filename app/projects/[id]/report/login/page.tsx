import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-server';
import { isAuthenticatedForReport } from '@/lib/auth';
import { LoginForm } from './LoginForm';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ReportLoginPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Check if already authenticated
  const isAuthenticated = await isAuthenticatedForReport(id);
  if (isAuthenticated) {
    redirect(`/projects/${id}/report`);
  }

  // Fetch project name for display
  const supabase = supabaseAdmin();
  const { data: project } = await supabase.from('projects').select('name').eq('id', id).single();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-blue-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img src="/set4-logo.svg" alt="Set4" className="w-16 h-16" />
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Project Report Access</h1>
            {project?.name && <p className="text-sm text-gray-600">{project.name}</p>}
            <p className="text-sm text-gray-500 mt-2">Enter the password to view this report</p>
          </div>

          {/* Login Form */}
          <LoginForm projectId={id} />

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              Don&apos;t have the password? Contact your project administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
