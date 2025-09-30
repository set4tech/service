// Database types for the application

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
  manual_override?: 'compliant' | 'non_compliant' | 'not_applicable' | null;
  manual_override_note?: string | null;
  manual_override_at?: string | null;
  manual_override_by?: string | null;
  project_id?: string;
  created_at?: string;
  updated_at?: string;

  // Virtual fields (populated by queries, not in DB)
  instances?: Check[];
  instance_count?: number;
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
  check_id: string;
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
