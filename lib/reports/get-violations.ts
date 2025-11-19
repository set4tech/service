import { supabaseAdmin } from '@/lib/supabase-server';
import { processRpcRowsToViolations } from './process-violations';

export interface ViolationScreenshot {
  id: string;
  url: string;
  thumbnailUrl: string;
  pageNumber: number;
  bounds: { x: number; y: number; width: number; height: number; zoom_level: number };
}

export interface CalculationTable {
  title: string;
  headers: string[];
  rows: string[][];
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
  reasoning?: string; // AI reasoning (fallback if no manual reasoning)
  manualReasoning?: string; // Human reasoning from manual override (takes priority)
  recommendations?: string[];
  confidence?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  humanReadableTitle?: string; // AI-generated natural language title (e.g., "Latchside clearance too small")
  checkType?: 'section' | 'element'; // Type of check
  elementGroupName?: string; // Element group name (e.g., "Doors", "Ramps")
  instanceLabel?: string; // Instance label (e.g., "Door 1", "Ramp 2")
  calculationTable?: CalculationTable; // Optional calculation table for this check
}

/**
 * Comment screenshot - reuses same structure as ViolationScreenshot
 */
export type CommentScreenshot = ViolationScreenshot;

/**
 * Comment marker - coordination/QC/constructability issues NOT tied to code sections
 */
export interface CommentMarker {
  commentId: string;
  assessmentId: string;
  title: string;
  description: string;
  commentType: 'coordination' | 'qc' | 'constructability' | 'general';
  severity: 'info' | 'minor' | 'moderate' | 'major';
  status: 'open' | 'resolved' | 'acknowledged';
  pageNumber: number;
  bounds?: { x: number; y: number; width: number; height: number; zoom_level: number };
  screenshots: CommentScreenshot[];
  primaryScreenshot: CommentScreenshot | null;
  sheetName?: string;
  discipline?: string;
  tags?: string[];
  resolvedNote?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
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
  comments?: CommentMarker[]; // Comments for coordination/QC/constructability
  buildingParams?: any; // extracted_variables from projects table
  codeInfo?: CodeInfo;
}

/**
 * Fetches all comments for an assessment
 */
export async function getAssessmentComments(assessmentId: string): Promise<CommentMarker[]> {
  const supabase = supabaseAdmin();

  console.log('[getAssessmentComments] Fetching comments for assessment:', assessmentId);

  const { data: comments, error } = await supabase
    .from('comments')
    .select(
      `
      id,
      assessment_id,
      page_number,
      crop_coordinates,
      comment_type,
      title,
      description,
      severity,
      status,
      resolved_note,
      resolved_at,
      resolved_by,
      created_at,
      created_by,
      updated_at,
      sheet_name,
      discipline,
      tags,
      screenshot_comment_assignments(
        screenshot:screenshots(
          id,
          screenshot_url,
          thumbnail_url,
          page_number,
          crop_coordinates,
          caption
        )
      )
    `
    )
    .eq('assessment_id', assessmentId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getAssessmentComments] Database error:', error);
    return [];
  }

  // Transform to CommentMarker format
  const transformedComments: CommentMarker[] =
    comments?.map((comment: any) => {
      const screenshots =
        comment.screenshot_comment_assignments?.map((sca: any) => sca.screenshot).filter(Boolean) ||
        [];

      return {
        commentId: comment.id,
        assessmentId: comment.assessment_id,
        pageNumber: comment.page_number,
        bounds: comment.crop_coordinates,
        commentType: comment.comment_type,
        title: comment.title,
        description: comment.description,
        severity: comment.severity,
        status: comment.status,
        resolvedNote: comment.resolved_note,
        resolvedAt: comment.resolved_at,
        resolvedBy: comment.resolved_by,
        createdAt: comment.created_at,
        createdBy: comment.created_by,
        updatedAt: comment.updated_at,
        sheetName: comment.sheet_name,
        discipline: comment.discipline,
        tags: comment.tags,
        screenshots: screenshots.map((s: any) => ({
          id: s.id,
          url: s.screenshot_url,
          thumbnailUrl: s.thumbnail_url,
          pageNumber: s.page_number,
          bounds: s.crop_coordinates,
        })),
        primaryScreenshot: screenshots[0]
          ? {
              id: screenshots[0].id,
              url: screenshots[0].screenshot_url,
              thumbnailUrl: screenshots[0].thumbnail_url,
              pageNumber: screenshots[0].page_number,
              bounds: screenshots[0].crop_coordinates,
            }
          : null,
      };
    }) || [];

  console.log(`[getAssessmentComments] Found ${transformedComments.length} comments`);
  return transformedComments;
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

  // Fetch comments for this assessment
  const comments = await getAssessmentComments(assessment.id);

  return {
    ...projectInfo,
    violations,
    comments,
  };
}
