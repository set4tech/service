-- Duplicate "255 California" project (DEV VERSION)
-- Source project ID: 5548b030-77d1-4f62-81ee-3a001a70a466
-- Source assessment ID: 3b543619-6080-46f3-9187-7760eb83cea0
-- New name: "255 California DUPLICATE DONOT USE"

DO $$
DECLARE
  v_new_project_id uuid;
  v_new_assessment_id uuid;
  v_element_instances_count integer;
  v_checks_count integer;
  v_screenshots_count integer;
  v_analysis_runs_count integer;
BEGIN
  -- Create temporary tables to track ID mappings
  CREATE TEMP TABLE IF NOT EXISTS project_id_map (old_id uuid, new_id uuid);
  CREATE TEMP TABLE IF NOT EXISTS assessment_id_map (old_id uuid, new_id uuid);
  CREATE TEMP TABLE IF NOT EXISTS element_instance_id_map (old_id uuid, new_id uuid);
  CREATE TEMP TABLE IF NOT EXISTS check_id_map (old_id uuid, new_id uuid);
  CREATE TEMP TABLE IF NOT EXISTS screenshot_id_map (old_id uuid, new_id uuid);
  CREATE TEMP TABLE IF NOT EXISTS analysis_run_id_map (old_id uuid, new_id uuid);

  -- Clear any existing data in temp tables
  DELETE FROM project_id_map;
  DELETE FROM assessment_id_map;
  DELETE FROM element_instance_id_map;
  DELETE FROM check_id_map;
  DELETE FROM screenshot_id_map;
  DELETE FROM analysis_run_id_map;

  RAISE NOTICE 'Starting duplication of project 5548b030-77d1-4f62-81ee-3a001a70a466...';

  -- Step 1: Duplicate project
  INSERT INTO projects (
    id, customer_id, name, description, building_address, building_type,
    code_assembly_id, pdf_url, status, selected_code_ids, extracted_variables,
    extraction_status, extraction_progress, extraction_started_at,
    extraction_completed_at, extraction_error, unannotated_drawing_url,
    report_password, chunking_status, chunking_started_at, chunking_completed_at,
    chunking_error, pdf_width_points, pdf_height_points, pdf_width_inches, pdf_height_inches
  )
  SELECT
    gen_random_uuid(), customer_id, '255 California DUPLICATE DONOT USE',
    description, building_address, building_type, code_assembly_id, pdf_url,
    status, selected_code_ids, extracted_variables, extraction_status,
    extraction_progress, extraction_started_at, extraction_completed_at,
    extraction_error, unannotated_drawing_url, report_password, chunking_status,
    chunking_started_at, chunking_completed_at, chunking_error, pdf_width_points,
    pdf_height_points, pdf_width_inches, pdf_height_inches
  FROM projects
  WHERE id = '5548b030-77d1-4f62-81ee-3a001a70a466'
  RETURNING id INTO v_new_project_id;

  -- Store project ID mapping
  INSERT INTO project_id_map (old_id, new_id)
  VALUES ('5548b030-77d1-4f62-81ee-3a001a70a466', v_new_project_id);

  RAISE NOTICE 'Created new project: %', v_new_project_id;

  -- Step 2: Duplicate assessments
  INSERT INTO assessments (
    id, project_id, started_at, completed_at, total_sections, assessed_sections,
    status, seeding_status, sections_processed, sections_total, pdf_scale,
    selected_chapter_ids
  )
  SELECT
    gen_random_uuid(), v_new_project_id,
    started_at, completed_at, total_sections, assessed_sections, status,
    seeding_status, sections_processed, sections_total, pdf_scale, selected_chapter_ids
  FROM assessments
  WHERE id = '3b543619-6080-46f3-9187-7760eb83cea0'
  RETURNING id INTO v_new_assessment_id;

  -- Store assessment ID mapping
  INSERT INTO assessment_id_map (old_id, new_id)
  VALUES ('3b543619-6080-46f3-9187-7760eb83cea0', v_new_assessment_id);

  RAISE NOTICE 'Created new assessment: %', v_new_assessment_id;

  -- Step 3: Duplicate element_instances (DEV: without bounding_box and page_number)
  INSERT INTO element_instances (
    id, assessment_id, element_group_id, label, created_at, updated_at, parameters
  )
  SELECT
    gen_random_uuid(), v_new_assessment_id, element_group_id, label,
    created_at, updated_at, parameters
  FROM element_instances
  WHERE assessment_id = '3b543619-6080-46f3-9187-7760eb83cea0';

  GET DIAGNOSTICS v_element_instances_count = ROW_COUNT;
  RAISE NOTICE 'Created % element instances', v_element_instances_count;

  -- Store element_instance ID mappings
  INSERT INTO element_instance_id_map (old_id, new_id)
  SELECT
    old_ei.id,
    new_ei.id
  FROM element_instances old_ei
  JOIN element_instances new_ei ON
    old_ei.assessment_id = '3b543619-6080-46f3-9187-7760eb83cea0'
    AND new_ei.assessment_id = v_new_assessment_id
    AND old_ei.element_group_id = new_ei.element_group_id
    AND old_ei.label = new_ei.label;

  -- Step 4: Duplicate checks
  INSERT INTO checks (
    id, assessment_id, code_section_number, code_section_title, check_name,
    check_location, prompt_template_id, status, created_at, updated_at,
    requires_review, instance_label, manual_status, manual_status_note,
    manual_status_at, manual_status_by, element_group_id, human_readable_title,
    is_excluded, excluded_reason, section_id, element_instance_id
  )
  SELECT
    gen_random_uuid(), v_new_assessment_id, code_section_number, code_section_title,
    check_name, check_location, prompt_template_id, status, created_at, updated_at,
    requires_review, instance_label, manual_status, manual_status_note,
    manual_status_at, manual_status_by, element_group_id, human_readable_title,
    is_excluded, excluded_reason, section_id,
    CASE
      WHEN old_c.element_instance_id IS NOT NULL THEN eim.new_id
      ELSE NULL
    END
  FROM checks old_c
  LEFT JOIN element_instance_id_map eim ON old_c.element_instance_id = eim.old_id
  WHERE old_c.assessment_id = '3b543619-6080-46f3-9187-7760eb83cea0';

  GET DIAGNOSTICS v_checks_count = ROW_COUNT;
  RAISE NOTICE 'Created % checks', v_checks_count;

  -- Store check ID mappings (match based on section_id and element characteristics)
  INSERT INTO check_id_map (old_id, new_id)
  SELECT
    old_c.id,
    new_c.id
  FROM checks old_c
  JOIN checks new_c ON
    old_c.assessment_id = '3b543619-6080-46f3-9187-7760eb83cea0'
    AND new_c.assessment_id = v_new_assessment_id
    AND old_c.section_id = new_c.section_id
    AND COALESCE(old_c.instance_label, '') = COALESCE(new_c.instance_label, '')
    AND COALESCE(old_c.element_group_id::text, '') = COALESCE(new_c.element_group_id::text, '')
    AND COALESCE(old_c.code_section_number, '') = COALESCE(new_c.code_section_number, '');

  -- Step 5: Duplicate screenshots
  INSERT INTO screenshots (
    id, screenshot_url, thumbnail_url, caption, page_number, created_at, analysis_run_id
  )
  SELECT DISTINCT
    gen_random_uuid(),
    s.screenshot_url, s.thumbnail_url, s.caption, s.page_number, s.created_at, NULL::uuid
  FROM screenshots s
  JOIN screenshot_check_assignments sca ON s.id = sca.screenshot_id
  JOIN checks c ON sca.check_id = c.id
  WHERE c.assessment_id = '3b543619-6080-46f3-9187-7760eb83cea0';

  GET DIAGNOSTICS v_screenshots_count = ROW_COUNT;
  RAISE NOTICE 'Created % screenshots', v_screenshots_count;

  -- Store screenshot ID mappings (match on URL and page number)
  INSERT INTO screenshot_id_map (old_id, new_id)
  SELECT DISTINCT
    old_s.id,
    new_s.id
  FROM screenshots old_s
  JOIN screenshot_check_assignments sca ON old_s.id = sca.screenshot_id
  JOIN checks c ON sca.check_id = c.id
  JOIN screenshots new_s ON
    old_s.screenshot_url = new_s.screenshot_url
    AND COALESCE(old_s.page_number, -1) = COALESCE(new_s.page_number, -1)
    AND old_s.created_at = new_s.created_at
  WHERE c.assessment_id = '3b543619-6080-46f3-9187-7760eb83cea0'
  AND new_s.id NOT IN (
    SELECT s2.id FROM screenshots s2
    JOIN screenshot_check_assignments sca2 ON s2.id = sca2.screenshot_id
    JOIN checks c2 ON sca2.check_id = c2.id
    WHERE c2.assessment_id = '3b543619-6080-46f3-9187-7760eb83cea0'
  );

  -- Step 6: Duplicate screenshot_check_assignments
  INSERT INTO screenshot_check_assignments (id, screenshot_id, check_id, is_original, assigned_at, assigned_by)
  SELECT
    gen_random_uuid(),
    sm.new_id,
    cm.new_id,
    sca.is_original,
    sca.assigned_at,
    sca.assigned_by
  FROM screenshot_check_assignments sca
  JOIN screenshot_id_map sm ON sca.screenshot_id = sm.old_id
  JOIN check_id_map cm ON sca.check_id = cm.old_id;

  -- Step 7: Duplicate analysis_runs
  INSERT INTO analysis_runs (
    id, check_id, run_number, compliance_status, confidence, ai_provider, ai_model,
    ai_reasoning, violations, compliant_aspects, recommendations, additional_evidence_needed,
    raw_ai_response, executed_at, execution_time_ms, section_results, batch_group_id,
    batch_number, total_batches, section_keys_in_batch
  )
  SELECT
    gen_random_uuid(),
    cm.new_id,
    ar.run_number, ar.compliance_status, ar.confidence, ar.ai_provider, ar.ai_model,
    ar.ai_reasoning, ar.violations, ar.compliant_aspects, ar.recommendations,
    ar.additional_evidence_needed, ar.raw_ai_response, ar.executed_at, ar.execution_time_ms,
    ar.section_results, ar.batch_group_id, ar.batch_number, ar.total_batches, ar.section_keys_in_batch
  FROM analysis_runs ar
  JOIN check_id_map cm ON ar.check_id = cm.old_id;

  GET DIAGNOSTICS v_analysis_runs_count = ROW_COUNT;
  RAISE NOTICE 'Created % analysis runs', v_analysis_runs_count;

  -- Store analysis run mappings for potential screenshot updates
  INSERT INTO analysis_run_id_map (old_id, new_id)
  SELECT
    old_ar.id,
    new_ar.id
  FROM analysis_runs old_ar
  JOIN check_id_map cm ON old_ar.check_id = cm.old_id
  JOIN analysis_runs new_ar ON
    cm.new_id = new_ar.check_id
    AND old_ar.run_number = new_ar.run_number
    AND old_ar.executed_at = new_ar.executed_at;

  -- Update screenshot analysis_run_id references (if any)
  UPDATE screenshots new_s
  SET analysis_run_id = arm.new_id
  FROM screenshot_id_map sm
  JOIN screenshots old_s ON sm.old_id = old_s.id
  JOIN analysis_run_id_map arm ON old_s.analysis_run_id = arm.old_id
  WHERE new_s.id = sm.new_id
  AND old_s.analysis_run_id IS NOT NULL;

  -- Print summary
  RAISE NOTICE '=== Duplication Summary ===';
  RAISE NOTICE 'New Project ID: %', v_new_project_id;
  RAISE NOTICE 'New Assessment ID: %', v_new_assessment_id;
  RAISE NOTICE 'Project Name: 255 California DUPLICATE DONOT USE';
  RAISE NOTICE 'Element instances duplicated: %', v_element_instances_count;
  RAISE NOTICE 'Checks duplicated: %', v_checks_count;
  RAISE NOTICE 'Screenshots duplicated: %', v_screenshots_count;
  RAISE NOTICE 'Analysis runs duplicated: %', v_analysis_runs_count;

  -- Clean up temp tables
  DROP TABLE IF EXISTS project_id_map;
  DROP TABLE IF EXISTS assessment_id_map;
  DROP TABLE IF EXISTS element_instance_id_map;
  DROP TABLE IF EXISTS check_id_map;
  DROP TABLE IF EXISTS screenshot_id_map;
  DROP TABLE IF EXISTS analysis_run_id_map;
END $$;
