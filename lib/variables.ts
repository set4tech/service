/**
 * Variable normalization and chapter resolution for CBC 11A/11B applicability filtering
 *
 * Handles extraction of building characteristics, occupancy, work type, etc. from
 * project variables and determines which CBC chapters (11A/11B) apply to the project.
 */

import crypto from 'crypto';

export type NormalizedVars = {
  occupancy_letter: string | null; // 'A','B',... or null if mixed/unknown
  occupancy_is_mixed: boolean;
  work_type: string | null; // canonical string
  facility_category: string | null; // as stored
  has_parking: boolean | null;
  building_area: number | null; // total building area in sq ft
  num_stories: number | null;
  elevator_exemption_applies: boolean | null; // derived if possible
  raw: any; // the original extracted variables
};

/**
 * Normalize extracted project variables into a consistent structure
 * for applicability filtering. Handles missing/malformed data gracefully.
 */
export function normalizeVariables(extracted: any): NormalizedVars {
  const get = (path: string[]) =>
    path.reduce<any>(
      (acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined),
      extracted
    );

  const val = (path: string[]) => {
    const node = get(path);
    if (!node) return null;
    return node.value ?? null;
  };

  const occFull = val(['building_characteristics', 'occupancy_classification']);
  let occupancy_letter: string | null = null;
  let occupancy_is_mixed = false;
  if (typeof occFull === 'string') {
    if (occFull.toLowerCase().startsWith('mixed use')) {
      occupancy_is_mixed = true;
    } else {
      const byDash = occFull.split(' - ')[0]?.trim();
      occupancy_letter = byDash || occFull.split(' ')[0]?.trim() || null;
    }
  }

  const building_area = toInt(val(['building_characteristics', 'building_area']));
  const num_stories = toInt(val(['building_characteristics', 'num_stories']));
  const explicitElevExempt = toBool(
    val(['building_characteristics', 'elevator_exemption_applies'])
  );
  const elevator_exemption_applies =
    explicitElevExempt ??
    (num_stories != null && num_stories <= 3
      ? true
      : building_area != null && building_area <= 3000
        ? true
        : null);

  return {
    occupancy_letter,
    occupancy_is_mixed,
    work_type: toStr(val(['project_scope', 'work_type'])),
    facility_category: toStr(val(['facility_type', 'facility_category'])),
    has_parking: toBool(val(['building_characteristics', 'has_parking'])),
    building_area,
    num_stories,
    elevator_exemption_applies,
    raw: extracted,
  };
}

function toInt(x: any): number | null {
  if (x == null) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function toBool(x: any): boolean | null {
  if (x == null) return null;
  if (typeof x === 'boolean') return x;
  if (x === 'true' || x === 'TRUE' || x === '1') return true;
  if (x === 'false' || x === 'FALSE' || x === '0') return false;
  return null;
}

function toStr(x: any): string | null {
  return typeof x === 'string' && x.trim() !== '' ? x : null;
}

/**
 * Generate a stable hash of normalized variables for caching/deduplication
 */
export function variablesHash(norm: NormalizedVars): string {
  const stable = JSON.stringify({
    occupancy_letter: norm.occupancy_letter ?? null,
    occupancy_is_mixed: norm.occupancy_is_mixed,
    work_type: norm.work_type ?? null,
    facility_category: norm.facility_category ?? null,
    has_parking: norm.has_parking,
    building_area: norm.building_area,
    num_stories: norm.num_stories,
    elevator_exemption_applies: norm.elevator_exemption_applies,
  });
  return crypto.createHash('sha256').update(stable).digest('hex');
}

/**
 * Decide whether to include 11A and/or 11B based on project characteristics.
 *
 * Rules:
 * - 11A when facility_category suggests multifamily housing (FHA) OR occupancy says Residential (R) OR mixed use.
 * - 11B when facility_category suggests Title II/III OR occupancy is not strictly residential OR mixed use.
 * - Conservative union if unknown (include both chapters when in doubt)
 */
export function resolveChapters(norm: NormalizedVars): {
  include11A: boolean;
  include11B: boolean;
} {
  const fc = norm.facility_category?.toLowerCase() ?? '';
  const occ = norm.occupancy_letter;

  const isResOcc = occ === 'R'; // coarse, conservative
  const isMixed = norm.occupancy_is_mixed;

  const is11AByFacility = fc.includes('multifamily housing') || fc.includes('fha');
  const is11BByFacility =
    fc.includes('title ii') || fc.includes('title iii') || fc.includes('state/local');

  // Unknowns => conservative union
  const hasUnknowns = !is11AByFacility && !is11BByFacility && occ == null;
  const include11A = is11AByFacility || isResOcc || isMixed || hasUnknowns;
  const include11B = is11BByFacility || !isResOcc || isMixed || hasUnknowns;

  return { include11A, include11B };
}
