-- CBC 11A/11B Section Applicability Schema
-- Implements deterministic, conservative filtering with full audit trail

-- ============================================================================
-- 1) Applicability metadata at the leaf section level
-- ============================================================================
ALTER TABLE sections
  ADD COLUMN IF NOT EXISTS chapter TEXT,                                -- '11A' | '11B' (denormalized for speed)
  ADD COLUMN IF NOT EXISTS always_include BOOLEAN DEFAULT FALSE,        -- scoping/definitions/etc.
  ADD COLUMN IF NOT EXISTS applicable_occupancies TEXT[],               -- ['A','B','E',...]; NULL => no restriction
  ADD COLUMN IF NOT EXISTS requires_parking BOOLEAN,                    -- TRUE => only if site has parking
  ADD COLUMN IF NOT EXISTS requires_elevator BOOLEAN,                   -- TRUE => only if elevator is required/present
  ADD COLUMN IF NOT EXISTS min_building_size INTEGER,                   -- per-story gross sf threshold
  ADD COLUMN IF NOT EXISTS max_building_size INTEGER,
  ADD COLUMN IF NOT EXISTS applicable_work_types TEXT[],                -- canonical strings
  ADD COLUMN IF NOT EXISTS applicable_facility_categories TEXT[],       -- optional, keep flexible
  ADD COLUMN IF NOT EXISTS applicability_notes TEXT;                    -- freeform doc note for maintainers

-- Helpful denormalization for 'chapter' when missing
UPDATE sections
SET chapter = CASE
  WHEN number LIKE '11A-%' THEN '11A'
  WHEN number LIKE '11B-%' THEN '11B'
  ELSE chapter
END
WHERE chapter IS NULL;

-- ============================================================================
-- 2) Indices for filters
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_sections_chapter ON sections(chapter);
CREATE INDEX IF NOT EXISTS idx_sections_parking ON sections(requires_parking);
CREATE INDEX IF NOT EXISTS idx_sections_elevator ON sections(requires_elevator);
CREATE INDEX IF NOT EXISTS idx_sections_min_size ON sections(min_building_size);
CREATE INDEX IF NOT EXISTS idx_sections_max_size ON sections(max_building_size);
CREATE INDEX IF NOT EXISTS idx_sections_app_occ     ON sections USING GIN (applicable_occupancies);
CREATE INDEX IF NOT EXISTS idx_sections_app_work    ON sections USING GIN (applicable_work_types);
CREATE INDEX IF NOT EXISTS idx_sections_app_fac     ON sections USING GIN (applicable_facility_categories);

-- ============================================================================
-- 3) Audit log for explainability (captures both included and excluded)
-- ============================================================================
CREATE TABLE IF NOT EXISTS section_applicability_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL REFERENCES sections(key) ON DELETE CASCADE,
  decision BOOLEAN NOT NULL,                            -- TRUE included / FALSE excluded (rule pass)
  decision_source TEXT NOT NULL DEFAULT 'rule',         -- 'rule' | 'ai'
  decision_confidence TEXT,                             -- 'high'|'medium'|'low' (optional, used by AI)
  reasons TEXT[] NOT NULL,                              -- human-readable bullets
  details JSONB,                                        -- dimension-by-dimension booleans/values
  building_params_hash TEXT NOT NULL,                   -- stable hash over normalized variables
  variables_snapshot JSONB NOT NULL,                    -- normalized snapshot used for decision
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, section_key, decision_source, building_params_hash)
);

CREATE INDEX IF NOT EXISTS idx_applicability_log_assessment ON section_applicability_log(assessment_id);
CREATE INDEX IF NOT EXISTS idx_applicability_log_section ON section_applicability_log(section_key);
CREATE INDEX IF NOT EXISTS idx_applicability_log_decision ON section_applicability_log(decision);

-- ============================================================================
-- 4) Optional review flag on checks
-- ============================================================================
ALTER TABLE checks
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- 5) Validation function for work types (replaces CHECK constraint with subquery)
-- Work types derived from variable_checklist
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_work_types(work_types TEXT[])
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  valid_types TEXT[] := ARRAY[
    'New Construction','Addition','Alteration/Renovation',
    'Change of Occupancy','Site/Civil Work','Maintenance Only'
  ];
  wt TEXT;
BEGIN
  IF work_types IS NULL THEN
    RETURN TRUE;
  END IF;

  FOREACH wt IN ARRAY work_types
  LOOP
    IF NOT (wt = ANY(valid_types)) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$;

ALTER TABLE sections
  ADD CONSTRAINT chk_sections_work_types_values CHECK (validate_work_types(applicable_work_types));

-- ============================================================================
-- 6) RPC: filter with explainability. Returns sections plus decision and reasons.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.filter_sections_explain(
  p_code_ids TEXT[],
  p_variables JSONB,
  p_include_11a BOOLEAN,
  p_include_11b BOOLEAN
)
RETURNS TABLE (
  key TEXT,
  number TEXT,
  title TEXT,
  chapter TEXT,
  include BOOLEAN,
  reasons TEXT[],
  explain JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_occ_full TEXT := NULLIF(p_variables #>> '{building_characteristics,occupancy_classification,value}', '');
  v_work_type TEXT := NULLIF(p_variables #>> '{project_scope,work_type,value}', '');
  v_fac_cat  TEXT := NULLIF(p_variables #>> '{facility_type,category,value}', '');
  v_has_parking BOOLEAN := (p_variables #>> '{building_characteristics,has_parking,value}')::BOOLEAN;
  v_bldg_size INTEGER := NULLIF(p_variables #>> '{building_characteristics,building_size_sf,value}', '')::INTEGER;      -- per-story gross sf
  v_num_stories INTEGER := NULLIF(p_variables #>> '{building_characteristics,number_of_stories,value}', '')::INTEGER;
  v_elev_exempt_var BOOLEAN := (p_variables #>> '{building_characteristics,elevator_exemption_applies,value}')::BOOLEAN;
  v_elev_exempt_derived BOOLEAN;
  v_occ_letter TEXT;
  v_occ_is_mixed BOOLEAN := FALSE;
BEGIN
  -- Normalize occupancy
  IF v_occ_full IS NOT NULL THEN
    IF v_occ_full ILIKE 'Mixed Use%' OR v_occ_full = 'Mixed Use' THEN
      v_occ_is_mixed := TRUE;
      v_occ_letter := NULL;
    ELSE
      -- expected format "B - Business" -> take first token before space or ' - '
      v_occ_letter := split_part(v_occ_full, ' - ', 1);
      IF v_occ_letter = '' THEN
        v_occ_letter := split_part(v_occ_full, ' ', 1);
      END IF;
    END IF;
  END IF;

  -- Derive elevator exemption if not explicitly provided: (≤3 stories OR ≤3000 sf/story)
  IF v_elev_exempt_var IS NULL THEN
    IF v_num_stories IS NOT NULL AND v_num_stories <= 3 THEN
      v_elev_exempt_derived := TRUE;
    ELSIF v_bldg_size IS NOT NULL AND v_bldg_size <= 3000 THEN
      v_elev_exempt_derived := TRUE;
    ELSE
      v_elev_exempt_derived := NULL;
    END IF;
  ELSE
    v_elev_exempt_derived := v_elev_exempt_var;
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT s.*
    FROM sections s
    WHERE
      s.code_id = ANY(p_code_ids)
      AND (
        (p_include_11a AND s.chapter = '11A')
        OR
        (p_include_11b AND s.chapter = '11B')
      )
  ),
  eval AS (
    SELECT
      c.key, c.number, c.title, c.chapter,

      -- Dimension evaluations (NULL => unknown => conservative include)
      CASE
        WHEN c.applicable_occupancies IS NULL THEN NULL      -- no restriction
        WHEN v_occ_is_mixed THEN TRUE                        -- union: treat as match
        WHEN v_occ_letter IS NULL THEN NULL                  -- unknown occupancy
        ELSE c.applicable_occupancies @> ARRAY[v_occ_letter]
      END AS occ_ok,

      CASE
        WHEN c.requires_parking IS NULL THEN NULL
        WHEN c.requires_parking = FALSE THEN TRUE
        WHEN v_has_parking IS NULL THEN NULL
        ELSE (v_has_parking = TRUE)
      END AS parking_ok,

      CASE
        WHEN c.min_building_size IS NULL THEN NULL
        WHEN v_bldg_size IS NULL THEN NULL
        ELSE (c.min_building_size <= v_bldg_size)
      END AS min_size_ok,

      CASE
        WHEN c.max_building_size IS NULL THEN NULL
        WHEN v_bldg_size IS NULL THEN NULL
        ELSE (c.max_building_size >= v_bldg_size)
      END AS max_size_ok,

      CASE
        WHEN c.applicable_work_types IS NULL THEN NULL
        WHEN v_work_type IS NULL THEN NULL
        ELSE c.applicable_work_types @> ARRAY[v_work_type]
      END AS work_type_ok,

      CASE
        WHEN c.applicable_facility_categories IS NULL THEN NULL
        WHEN v_fac_cat IS NULL THEN NULL
        ELSE c.applicable_facility_categories @> ARRAY[v_fac_cat]
      END AS facility_ok,

      CASE
        WHEN c.requires_elevator IS NULL THEN NULL
        WHEN c.requires_elevator = FALSE THEN TRUE
        WHEN v_elev_exempt_derived IS NULL THEN NULL         -- unknown => include
        ELSE (v_elev_exempt_derived = FALSE)                 -- include only if not exempt
      END AS elevator_ok,

      c.always_include

    FROM candidate c
  ),
  decision AS (
    SELECT
      e.*,
      (
        e.always_include
        OR (
          COALESCE(e.occ_ok, TRUE)
          AND COALESCE(e.parking_ok, TRUE)
          AND COALESCE(e.min_size_ok, TRUE)
          AND COALESCE(e.max_size_ok, TRUE)
          AND COALESCE(e.work_type_ok, TRUE)
          AND COALESCE(e.facility_ok, TRUE)
          AND COALESCE(e.elevator_ok, TRUE)
        )
      ) AS include_flag
    FROM eval e
  )
  SELECT
    d.key, d.number, d.title, d.chapter,
    d.include_flag AS include,

    -- reasons as text[]
    ARRAY_REMOVE(ARRAY[
      CASE WHEN d.always_include                      THEN 'always_include' END,
      CASE WHEN d.occ_ok        IS NULL               THEN 'occupancy: unknown or unrestricted -> include' END,
      CASE WHEN d.occ_ok        = TRUE                THEN 'occupancy: match' END,
      CASE WHEN d.parking_ok    IS NULL               THEN 'parking: unknown or unrestricted -> include' END,
      CASE WHEN d.parking_ok    = TRUE                THEN 'parking: match' END,
      CASE WHEN d.min_size_ok   IS NULL               THEN 'min_size: unknown -> include' END,
      CASE WHEN d.min_size_ok   = TRUE                THEN 'min_size: threshold satisfied' END,
      CASE WHEN d.max_size_ok   IS NULL               THEN 'max_size: unknown -> include' END,
      CASE WHEN d.max_size_ok   = TRUE                THEN 'max_size: threshold satisfied' END,
      CASE WHEN d.work_type_ok  IS NULL               THEN 'work_type: unknown or unrestricted -> include' END,
      CASE WHEN d.work_type_ok  = TRUE                THEN 'work_type: match' END,
      CASE WHEN d.facility_ok   IS NULL               THEN 'facility: unknown or unrestricted -> include' END,
      CASE WHEN d.facility_ok   = TRUE                THEN 'facility: match' END,
      CASE WHEN d.elevator_ok   IS NULL               THEN 'elevator: unknown -> include' END,
      CASE WHEN d.elevator_ok   = TRUE                THEN 'elevator: required or not applicable' END,
      CASE WHEN d.include_flag  = FALSE               THEN 'one or more dimensions failed -> exclude' END
    ], NULL) AS reasons,

    jsonb_build_object(
      'always_include', d.always_include,
      'dimensions', jsonb_build_object(
        'occupancy_ok', d.occ_ok,
        'parking_ok', d.parking_ok,
        'min_size_ok', d.min_size_ok,
        'max_size_ok', d.max_size_ok,
        'work_type_ok', d.work_type_ok,
        'facility_ok', d.facility_ok,
        'elevator_ok', d.elevator_ok
      )
    ) AS explain
  FROM decision d;

END;
$$;

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON COLUMN sections.chapter IS '11A or 11B for CBC sections; denormalized from number';
COMMENT ON COLUMN sections.always_include IS 'TRUE for scoping/definitions/administrative sections';
COMMENT ON COLUMN sections.applicable_occupancies IS 'Occupancy letters [A,B,E,...]; NULL means no restriction';
COMMENT ON COLUMN sections.requires_parking IS 'TRUE if section only applies when site has parking';
COMMENT ON COLUMN sections.requires_elevator IS 'TRUE if section only applies when elevator required';
COMMENT ON COLUMN sections.min_building_size IS 'Minimum per-story gross floor area (sf) threshold';
COMMENT ON COLUMN sections.max_building_size IS 'Maximum per-story gross floor area (sf) threshold';
COMMENT ON COLUMN sections.applicable_work_types IS 'Work type strings matching project variables';
COMMENT ON COLUMN sections.applicable_facility_categories IS 'Facility category strings';
COMMENT ON COLUMN sections.applicability_notes IS 'Maintainer notes about applicability logic';

COMMENT ON TABLE section_applicability_log IS 'Audit trail of all applicability decisions (included and excluded)';
COMMENT ON COLUMN section_applicability_log.decision IS 'TRUE=included, FALSE=excluded';
COMMENT ON COLUMN section_applicability_log.decision_source IS 'rule=deterministic, ai=llm-based';
COMMENT ON COLUMN section_applicability_log.reasons IS 'Human-readable explanation bullets';
COMMENT ON COLUMN section_applicability_log.details IS 'Structured dimension-by-dimension evaluation';
COMMENT ON COLUMN section_applicability_log.building_params_hash IS 'SHA256 of normalized variables';
COMMENT ON COLUMN section_applicability_log.variables_snapshot IS 'Full normalized variables used';

COMMENT ON FUNCTION filter_sections_explain IS 'Conservative filter for CBC 11A/11B with full explainability. Unknown variables default to inclusion.';
