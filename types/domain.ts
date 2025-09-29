// Domain types for the compliance assessment application
export type CheckStatus = 'completed' | 'active' | 'pending' | 'error';

export type Check = {
  id: string;
  check_name: string;
  status: CheckStatus;
  check_location?: string;
  latest_status?: 'compliant' | 'non_compliant' | 'unknown';
  project_id?: string;
  assessment_id?: string;
};

export type AnalysisRun = {
  compliance_status: 'compliant' | 'non_compliant' | 'unknown';
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
