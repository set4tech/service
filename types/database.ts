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
  section_id: string; // UUID reference to sections.id
  code_section_number: string;
  code_section_title: string;
  check_name: string;
  check_location: string;
  instance_label?: string | null; // Label for element instances (e.g., "Door 1", "Bathrooms 2")
  prompt_template_id?: string;
  actual_prompt_used?: string;
  status: 'pending' | 'completed' | 'failed';
  manual_status?: ComplianceOverrideStatus | null;
  manual_status_note?: string | null;
  manual_status_at?: string | null;
  manual_status_by?: string | null;
  created_at?: string;
  updated_at?: string;

  // Element grouping field
  // Note: check_type was removed from DB schema. Use element_group_id to determine type:
  // - If element_group_id is NOT NULL, it's an element-grouped check
  // - If element_group_id is NULL, it's a standalone section check
  check_type?: 'section' | 'element'; // Deprecated: computed from element_group_id
  element_group_id?: string | null;
  element_instance_id?: string | null; // FK to element_instances (normalized way to identify element instances)

  // Virtual fields (populated by queries, not in DB)
  element_group_slug?: string;
  section_results?: SectionResult[]; // For element checks: per-section breakdown
  sections?: { key: string }; // Joined section data from Supabase JOIN (table name is plural)
}

// Helper function to compute check type from element_group_id
export function getCheckType(check: Check | null | undefined): 'section' | 'element' {
  return check?.element_group_id ? 'element' : 'section';
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
  screenshot_type: 'plan' | 'elevation'; // Type of screenshot
  element_group_id?: string | null; // Reference to element_groups for elevations
  extracted_text?: string | null; // Text extracted from PDF region for searchability
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

export interface ElementInstance {
  id: string;
  label: string;
  element_group_id: string;
  assessment_id: string;
  parameters?: any; // JSONB field for element-specific parameters (e.g., DoorParameters)
  created_at?: string;
  updated_at?: string;
  element_groups?: ElementGroup;
}

export interface ElementSectionMapping {
  id: string;
  element_group_id: string;
  section_id: string; // UUID reference to sections.id
  section_key?: string; // Deprecated: kept for backwards compatibility
  created_at?: string;
}

export interface SectionResult {
  section_id?: string; // UUID reference to sections.id (preferred)
  section_key?: string; // Deprecated: kept for backwards compatibility
  section_number?: string;
  section_title?: string;
  status: 'compliant' | 'non_compliant' | 'not_applicable';
  reasoning: string;
  confidence?: 'high' | 'medium' | 'low';
  manual_status?: ComplianceOverrideStatus | null;
  manual_status_note?: string | null;
}
