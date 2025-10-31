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

  // Get assessment info
  const { data: assessment } = await supabase
    .from('assessments')
    .select('*, selected_chapter_ids, projects(id, name, pdf_url, extracted_variables)')
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

  const checksResponse = await fetch(`${baseUrl}/api/assessments/${id}/checks`, {
    cache: 'no-store',
  });
  const checks = checksResponse.ok ? await checksResponse.json() : [];

  // Get violations using RPC (already filtered - for ViolationsSummary component)
  const { data: rpcViolations, error: rpcError } = await supabase.rpc('get_assessment_report', {
    assessment_uuid: id,
  });

  // Debug logging
  console.log('[AssessmentPage] RPC Violations count:', rpcViolations?.length || 0);
  console.log('[AssessmentPage] RPC Error:', rpcError);

  // Filter to needs_more_info
  const needsMoreInfo =
    rpcViolations?.filter(
      (v: any) =>
        v.effective_status === 'needs_more_info' || v.compliance_status === 'needs_more_info'
    ) || [];
  console.log('[AssessmentPage] needs_more_info violations:', needsMoreInfo.length);
  if (needsMoreInfo.length > 0) {
    console.log('[AssessmentPage] Sample needs_more_info:', {
      check_id: needsMoreInfo[0].check_id,
      check_name: needsMoreInfo[0].check_name,
      effective_status: needsMoreInfo[0].effective_status,
      compliance_status: needsMoreInfo[0].compliance_status,
      manual_status: needsMoreInfo[0].manual_status,
      element_group_name: needsMoreInfo[0].element_group_name,
    });
  }

  // Get progress stats
  const { data: progress } = await supabase.rpc('get_assessment_progress', {
    assessment_uuid: id,
  });
  const progressData = progress?.[0] || { total_checks: 0, completed_checks: 0, progress_pct: 0 };

  // Get codebooks from assessment-level chapter selection
  const selectedChapterIds = (assessment.selected_chapter_ids as string[]) || [];
  const { data: codes } =
    selectedChapterIds.length > 0
      ? await supabase.from('codes').select('id, title').in('id', selectedChapterIds)
      : { data: null };
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
