export type ComplianceStatus = 'non_compliant' | 'compliant' | 'partially_compliant' | 'unclear' | 'not_applicable';
export type Confidence = 'high' | 'medium' | 'low';

export interface AIResponse {
  compliance_status: ComplianceStatus;
  confidence: Confidence;
  violations?: { description: string; severity: 'minor' | 'moderate' | 'major'; location_in_evidence?: string }[];
  compliant_aspects?: string[];
  reasoning?: string;
  recommendations?: string[];
  additional_evidence_needed?: string[];
}