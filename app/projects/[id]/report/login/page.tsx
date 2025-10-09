import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-server';
import { verifyPassword, createReportSession, isAuthenticatedForReport } from '@/lib/auth';

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function handleLogin(formData: FormData, projectId: string) {
  'use server';

  const password = formData.get('password') as string;

  if (!password) {
    return { error: 'Password is required' };
  }

  // Fetch project with report password
  const supabase = supabaseAdmin();
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, report_password')
    .eq('id', projectId)
    .single();

  if (error || !project) {
    return { error: 'Project not found' };
  }

  if (!project.report_password) {
    return { error: 'This project does not have a password set' };
  }

  // Verify password
  const isValid = await verifyPassword(password, project.report_password);

  if (!isValid) {
    return { error: 'Incorrect password' };
  }

  // Create session
  await createReportSession(projectId);

  // Redirect to report
  redirect(`/projects/${projectId}/report`);
}

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
            {project?.name && (
              <p className="text-sm text-gray-600">
                {project.name}
              </p>
            )}
            <p className="text-sm text-gray-500 mt-2">Enter the password to view this report</p>
          </div>

          {/* Login Form */}
          <form
            action={async (formData: FormData) => {
              'use server';
              await handleLogin(formData, id);
            }}
          >
            <div className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  required
                  autoFocus
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  placeholder="Enter password"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                Access Report
              </button>
            </div>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              Don't have the password? Contact your project administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
