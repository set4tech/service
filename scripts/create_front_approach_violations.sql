/* Insert AI analysis runs with MAJOR violations for code section 1126A.3.2.1 (Front approach)
   Assessment: dd3e90be-5200-4d17-a5ac-27530a45be5e
   This creates non compliant analysis runs for all door instances */

INSERT INTO analysis_runs (
  check_id,
  run_number,
  compliance_status,
  confidence,
  ai_reasoning,
  violations,
  recommendations,
  ai_model,
  executed_at
)
SELECT
  c.id as check_id,
  COALESCE(MAX(ar.run_number), 0) + 1 as run_number,  -- Next run number for each check
  'non_compliant' as compliance_status,
  'high' as confidence,
  'The maneuvering clearance on the pull side of the door is significantly deficient, as it does not come to the minimum of 60 inches required for a front approach. This violation will impede accessible use of the doorway and must be corrected.' as ai_reasoning,
  jsonb_build_array(
    jsonb_build_object(
      'severity', 'major',
      'description', 'The maneuvering clearance on the pull side of the door is significantly deficient, as it does not come to the minimum of 60 inches required for a front approach.',
      'location', 'Pull side maneuvering clearance',
      'recommendation', 'Ensure minimum 60 inches of maneuvering clearance on pull side for front approach per Section 1126A.3.2.1.'
    )
  ) as violations,
  jsonb_build_array(
    'Increase the maneuvering clearance on the pull side to meet the minimum 60-inch requirement for front approach.',
    'Verify compliance with Section 1126A.3.2.1 after corrections are made.'
  ) as recommendations,
  'manual-backfill' as ai_model,
  NOW() as executed_at
FROM checks c
LEFT JOIN analysis_runs ar ON c.id = ar.check_id
WHERE c.assessment_id = 'dd3e90be-5200-4d17-a5ac-27530a45be5e'
  AND c.code_section_number = '1126A.3.2.1'
GROUP BY c.id
ORDER BY c.instance_label;

/* Verify the insertions */
SELECT
  c.instance_label,
  ar.run_number,
  ar.compliance_status,
  ar.confidence,
  ar.violations->0->>'severity' as violation_severity,
  ar.violations->0->>'description' as violation_description,
  ar.executed_at
FROM checks c
JOIN analysis_runs ar ON c.id = ar.check_id
WHERE c.assessment_id = 'dd3e90be-5200-4d17-a5ac-27530a45be5e'
  AND c.code_section_number = '1126A.3.2.1'
  AND ar.ai_model = 'manual-backfill'
ORDER BY c.instance_label
LIMIT 20;
