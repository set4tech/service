import { supabaseAdmin } from '@/lib/supabase-server';
import { normalizeVariables } from '@/lib/variables';
import { getAssessmentChecks } from '@/lib/queries/get-assessment-checks';
import AssessmentClient from './ui/AssessmentClient';

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

  // Get ALL checks for initial load (both section and element checks)
  // The client will filter them based on the selected mode
  const [sectionChecks, elementChecks] = await Promise.all([
    getAssessmentChecks(id, { mode: 'section' }),
    getAssessmentChecks(id, { mode: 'element' }),
  ]);
  
  // Combine both types of checks
  const checks = [...(sectionChecks || []), ...(elementChecks || [])];

  // Get violations using RPC (already filtered - for ViolationsSummary component)
  const { data: rpcViolations } = await supabase.rpc('get_assessment_report', {
    assessment_uuid: id,
  });

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
