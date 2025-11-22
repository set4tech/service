'use server';

import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-server';
import { verifyPassword, createReportSession } from '@/lib/auth';

interface LoginState {
  error?: string;
}

export async function handleLogin(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const projectId = formData.get('projectId') as string;
  const password = formData.get('password') as string;

  console.log('[Login] Attempting login for project:', projectId);

  if (!password) {
    console.log('[Login] Error: No password provided');
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
    console.log('[Login] Error: Project not found', error);
    return { error: 'Project not found' };
  }

  if (!project.report_password) {
    console.log('[Login] Error: Project has no password set');
    return { error: 'This project does not have a password set' };
  }

  console.log('[Login] Verifying password...');
  console.log('[Login] Password length:', password.length);
  console.log('[Login] Stored password preview:', project.report_password.substring(0, 10));

  // Verify password (support both plain text and hashed passwords)
  let isValid = false;

  // First try plain text comparison
  if (password === project.report_password) {
    isValid = true;
    console.log('[Login] Plain text password match');
  }
  // If stored password looks like bcrypt hash, try bcrypt verification
  else if (project.report_password.startsWith('$2')) {
    isValid = await verifyPassword(password, project.report_password);
    console.log('[Login] Bcrypt verification result:', isValid);
  }

  console.log('[Login] Password valid:', isValid);

  if (!isValid) {
    console.log('[Login] Error: Incorrect password');
    return { error: 'Incorrect password' };
  }

  // Create session
  console.log('[Login] Creating session...');
  await createReportSession(projectId);
  console.log('[Login] Session created, redirecting...');

  // Redirect to report
  redirect(`/projects/${projectId}/report`);
}
