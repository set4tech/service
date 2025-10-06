/**
 * Shared types for AI analysis and assessment
 */

export interface SectionResult {
  section_key: string;
  section_number: string;
  compliance_status: string;
  confidence: string;
  reasoning: string;
  violations?: any[];
  recommendations?: string[];
  section_text?: string;
  section_title?: string;
}

export interface AnalysisRun {
  id: string;
  run_number: number;
  compliance_status: string;
  confidence: string;
  ai_provider: string;
  ai_model: string;
  ai_reasoning?: string;
  violations?: any[];
  recommendations?: string[];
  executed_at: string;
  execution_time_ms?: number;
  batch_group_id?: string;
  batch_number?: number;
  total_batches?: number;
  section_keys_in_batch?: string[];
  section_results?: SectionResult[];
}

export interface CodeSection {
  key: string;
  number: string;
  title: string;
  text?: string;
  requirements?: Array<string | { text: string; [key: string]: any }>;
  tables?: TableBlock[];
  figures?: string[];
  source_url?: string;
  floorplan_relevant?: boolean;
  intro_section?: IntroSection;
  references?: Array<{
    key: string;
    number: string;
    title: string;
    text?: string;
  }>;
  parent_key?: string;
  parent_section?: {
    key: string;
    number: string;
    title: string;
  };
}

export interface TableBlock {
  number: string;
  title: string;
  csv: string;
}

export interface IntroSection {
  key: string;
  number: string;
  title: string;
  text?: string;
}
