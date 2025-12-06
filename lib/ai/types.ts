export type ComplianceStatus =
  | 'non_compliant'
  | 'compliant'
  | 'partially_compliant'
  | 'unclear'
  | 'not_applicable'
  | 'needs_more_info';
export type Confidence = 'high' | 'medium' | 'low';

/**
 * Normalized bounding box from Gemini's spatial understanding.
 * Coordinates are in 0-1 range (already normalized from Gemini's 0-1000).
 */
export interface ViolationBoundingBox {
  x: number; // Left edge (0-1)
  y: number; // Top edge (0-1)
  width: number; // Width (0-1)
  height: number; // Height (0-1)
  label?: string; // Optional description of what this box highlights
}

export interface AIResponse {
  compliance_status: ComplianceStatus;
  confidence: Confidence;
  violations?: {
    description: string;
    severity: 'minor' | 'moderate' | 'major';
    location_in_evidence?: string;
    /** Bounding boxes highlighting specific violation areas in the screenshot (normalized 0-1) */
    bounding_boxes?: ViolationBoundingBox[];
  }[];
  compliant_aspects?: string[];
  reasoning?: string;
  recommendations?: string[];
  additional_evidence_needed?: string[];
  sections?: any[];
  overall_summary?: string;
}
