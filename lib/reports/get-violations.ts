import { supabaseAdmin } from '@/lib/supabase-server';
import { processRpcRowsToViolations } from './process-violations';

export interface ViolationScreenshot {
  id: string;
  url: string;
  thumbnailUrl: string;
  pageNumber: number;
  bounds: { x: number; y: number; width: number; height: number; zoom_level: number };
}

export interface ViolationMarker {
  checkId: string;
  checkName: string;
  codeSectionKey: string;
  codeSectionNumber: string;
  pageNumber: number; // Page of the first/primary screenshot
  bounds: { x: number; y: number; width: number; height: number; zoom_level: number }; // Bounds of first/primary screenshot
  severity: 'minor' | 'moderate' | 'major' | 'needs_more_info';
  description: string;
  screenshotUrl: string; // Primary/first screenshot URL (for backward compatibility)
  thumbnailUrl: string; // Primary/first screenshot thumbnail (for backward compatibility)
  screenshotId: string; // Primary/first screenshot ID (for backward compatibility)
  allScreenshots: ViolationScreenshot[]; // All screenshots for this violation, sorted by page number
  reasoning?: string;
  recommendations?: string[];
  confidence?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  humanReadableTitle?: string; // AI-generated natural language title (e.g., "Latchside clearance too small")
  checkType?: 'section' | 'element'; // Type of check
  elementGroupName?: string; // Element group name (e.g., "Doors", "Ramps")
  instanceLabel?: string; // Instance label (e.g., "Door 1", "Ramp 2")
}

export interface CodeInfo {
  id: string;
  title: string;
  version: string;
  sourceUrl?: string;
}

export interface ProjectViolationsData {
  projectId: string;
  projectName: string;
  assessmentId: string;
  pdfUrl: string;
  violations: ViolationMarker[];
  buildingParams?: any; // extracted_variables from projects table
  codeInfo?: CodeInfo;
}

/**
 * Fetches all violations for a project report view
 */
export async function getProjectViolations(
  projectId: string
): Promise<ProjectViolationsData | null> {
  const supabase = supabaseAdmin();

  // Get the most recent assessment for this project
  const { data: assessment, error: assessmentError } = await supabase
    .from('assessments')
    .select('id')
    .eq('project_id', projectId)
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  if (assessmentError || !assessment) {
    console.error('[getProjectViolations] Failed to fetch assessment:', assessmentError);
    return null;
  }

  // Call the database function
  const { data, error } = await supabase.rpc('get_assessment_report', {
    assessment_uuid: assessment.id,
  });

  if (error) {
    console.error('[getProjectViolations] RPC error:', error);
    return null;
  }

  if (!data || data.length === 0) {
    // Try to at least get project info
    const { data: project } = await supabase
      .from('projects')
      .select('id, name, pdf_url, extracted_variables')
      .eq('id', projectId)
      .single();

    if (!project) return null;

    return {
      projectId: project.id,
      projectName: project.name,
      assessmentId: assessment.id,
      pdfUrl: project.pdf_url,
      violations: [],
      buildingParams: project.extracted_variables,
      codeInfo: undefined,
    };
  }

  // Extract project-level info from first row
  const firstRow = data[0];
  const projectInfo = {
    projectId: firstRow.project_id,
    projectName: firstRow.project_name,
    assessmentId: firstRow.assessment_id,
    pdfUrl: firstRow.pdf_url,
    buildingParams: firstRow.building_params,
    codeInfo: firstRow.code_id
      ? {
          id: firstRow.code_id,
          title: firstRow.code_title,
          version: firstRow.code_version,
          sourceUrl: firstRow.code_source_url,
        }
      : undefined,
  };

  // Process violations directly from RPC data (no restructuring needed!)
  const violations = processRpcRowsToViolations(data);

  return {
    ...projectInfo,
    violations,
  };
}
