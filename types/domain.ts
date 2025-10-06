// Domain types for the compliance assessment application
export type CheckStatus = 'completed' | 'active' | 'pending' | 'error';

export type ComplianceStatus =
  | 'compliant'
  | 'non_compliant'
  | 'violation'
  | 'needs_more_info'
  | 'not_applicable'
  | 'unknown';

export type Check = {
  id: string;
  check_name: string;
  status: CheckStatus;
  check_location?: string;
  latest_status?: ComplianceStatus;
  project_id?: string;
  assessment_id?: string;
};

export type AnalysisRun = {
  compliance_status: ComplianceStatus;
  ai_model: string;
  ai_reasoning: string;
  created_at: string;
};

export type Screenshot = {
  id: string;
  thumbnail_url: string;
  screenshot_url: string;
  caption?: string;
  page_number?: number;
  check_id: string;
  crop_coordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom_level: number;
  };
};
