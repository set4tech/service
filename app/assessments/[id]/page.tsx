import { supabaseAdmin } from '@/lib/supabase-server';
import { normalizeVariables } from '@/lib/variables';
import AssessmentClient from './ui/AssessmentClient';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ProjectData {
  id: string;
  name: string;
  pdf_url: string | null;
  selected_code_ids: string[];
  extracted_variables: Record<string, unknown>;
}

interface AssessmentWithProject {
  id: string;
  project_id: string;
  projects: ProjectData;
  [key: string]: unknown;
}

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const startTime = Date.now();

  // Get assessment info
  const { data: assessment } = await supabase
    .from('assessments')
    .select('*, projects(id, name, pdf_url, selected_code_ids, extracted_variables)')
    .eq('id', id)
    .single();

  if (!assessment) {
    return <div className="p-6">Assessment not found.</div>;
  }

  const typedAssessment = assessment as unknown as AssessmentWithProject;

  // Get ALL checks for the assessment (for CheckList component)
  const headersList = await headers();
  const host = headersList.get('host');

  if (!host) {
    throw new Error('Missing host header - cannot fetch checks');
  }

  // More robust protocol detection for local development
  const isLocal =
    host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    host.includes('[::1]') || // IPv6 loopback
    host.startsWith('192.168.');
  const protocol = isLocal ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  console.log(`[DEBUG] Fetching checks from: ${baseUrl}/api/assessments/${id}/checks`);

  const checksResponse = await fetch(`${baseUrl}/api/assessments/${id}/checks`, {
    cache: 'no-store',
  });
  const checks = checksResponse.ok ? await checksResponse.json() : [];

  // Get violations using RPC (already filtered - for ViolationsSummary component)
  const { data: rpcViolations } = await supabase.rpc('get_assessment_report', {
    assessment_uuid: id,
  });

  // Get progress stats
  const { data: progress } = await supabase.rpc('get_assessment_progress', {
    assessment_uuid: id,
  });
  const progressData = progress?.[0] || { total_checks: 0, completed_checks: 0, progress_pct: 0 };

  // Get codebooks
  const selectedCodeIds = typedAssessment.projects?.selected_code_ids || [];
  const { data: codes } = await supabase
    .from('codes')
    .select('id, title')
    .in('id', selectedCodeIds);
  const codebooks = codes?.map(c => ({ id: c.id, name: c.title })) || [];

  // Extract building info
  const extractedVars = typedAssessment.projects?.extracted_variables || {};
  const normalizedVars = normalizeVariables(extractedVars);
  const buildingInfo = {
    occupancy: normalizedVars.occupancy_letter || 'Unknown',
    size_sf: normalizedVars.building_size_sf,
    stories: normalizedVars.number_of_stories,
    work_type: normalizedVars.work_type || 'Unknown',
    has_parking: normalizedVars.has_parking,
    facility_category: normalizedVars.facility_category || 'Unknown',
  };

  const assessmentWithPdf = {
    ...assessment,
    pdf_url: typedAssessment.projects?.pdf_url || null,
  };

  // eslint-disable-next-line no-console -- Logging is allowed for internal debugging
  console.log(`[Perf] TOTAL page load time: ${Date.now() - startTime}ms`);

  // Format progress data to match AssessmentClient's expected shape
  const formattedProgress = {
    totalChecks: progressData.total_checks,
    completed: progressData.completed_checks,
    pct: progressData.progress_pct,
  };

  return (
    <AssessmentClient
      assessment={assessmentWithPdf}
      checks={checks || []}
      rpcViolations={rpcViolations || []}
      progress={formattedProgress}
      buildingInfo={buildingInfo}
      codebooks={codebooks}
    />
  );
}
