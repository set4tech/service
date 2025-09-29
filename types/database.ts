// Database types for the application

export interface Check {
  id: string;
  assessment_id: string;
  code_section_key: string;
  code_section_number: string;
  code_section_title: string;
  check_name: string;
  check_location: string;
  parent_check_id?: string;
  prompt_template_id?: string;
  actual_prompt_used?: string;
  status: 'pending' | 'completed' | 'failed';
  project_id?: string;
  created_at?: string;
  updated_at?: string;
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
