// Database types for the application

// Compliance override status enum (matches PostgreSQL enum: compliance_override_status)
export type ComplianceOverrideStatus =
  | 'compliant'
  | 'non_compliant'
  | 'not_applicable'
  | 'insufficient_information';

export interface Check {
  id: string;
  assessment_id: string;
  code_section_key: string;
  code_section_number: string;
  code_section_title: string;
  check_name: string;
  check_location: string;
  parent_check_id?: string | null;
  instance_number: number;
  instance_label?: string | null;
  prompt_template_id?: string;
  actual_prompt_used?: string;
  status: 'pending' | 'completed' | 'failed';
  manual_override?: ComplianceOverrideStatus | null;
  manual_override_note?: string | null;
  manual_override_at?: string | null;
  manual_override_by?: string | null;
  project_id?: string;
  created_at?: string;
  updated_at?: string;

  // Element check fields
  check_type?: 'section' | 'element';
  element_group_id?: string | null;
  element_sections?: string[]; // Array of section_keys for element checks

  // Virtual fields (populated by queries, not in DB)
  instances?: Check[];
  instance_count?: number;
  element_group_name?: string;
  element_group_slug?: string;
  section_results?: SectionResult[]; // For element checks: per-section breakdown
}

export interface PromptTemplate {
  id: string;
  name: string;
  version: number;
  system_prompt?: string;
  user_prompt_template?: string;
  instruction_template?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Screenshot {
  id: string;
  // check_id REMOVED - now in junction table (screenshot_check_assignments)
  page_number: number;
  crop_coordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom_level: number;
  };
  screenshot_url: string;
  thumbnail_url?: string;
  caption?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ScreenshotCheckAssignment {
  id: string;
  screenshot_id: string;
  check_id: string;
  is_original: boolean;
  assigned_at: string;
  assigned_by?: string;
}

// Extended type for UI with assignment metadata
export interface ScreenshotWithAssignment extends Screenshot {
  assignment?: ScreenshotCheckAssignment;
  original_check_id?: string; // For displaying "From Check X"
  is_original?: boolean; // Flattened from assignment for convenience
}

export interface CodeSection {
  id: number;
  key: string;
  code_id: string;
  parent_key?: string;
  number: string;
  title: string;
  text?: string;
  item_type: 'section' | 'subsection';
  code_type: 'accessibility' | 'building' | 'fire' | 'plumbing' | 'mechanical' | 'energy';
  paragraphs?: string[];
  source_url?: string;
  source_page?: number;
  hash: string;

  // Assessability classification
  drawing_assessable?: boolean;
  assessability_tags?: string[];

  created_at?: string;
  updated_at?: string;
}

export interface ElementGroup {
  id: string;
  name: string;
  slug: 'doors' | 'bathrooms' | 'kitchens';
  description?: string;
  icon?: string;
  sort_order: number;
  created_at?: string;
}

export interface ElementSectionMapping {
  id: string;
  element_group_id: string;
  section_key: string;
  created_at?: string;
}

export interface SectionResult {
  section_key: string;
  section_number?: string;
  section_title?: string;
  status: 'compliant' | 'non_compliant' | 'not_applicable';
  reasoning: string;
  confidence?: 'high' | 'medium' | 'low';
  manual_override?: ComplianceOverrideStatus | null;
  manual_override_note?: string | null;
}
