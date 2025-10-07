import { ViolationMarker } from './get-violations';

interface ViolationGroup {
  key: string;
  violations: ViolationMarker[];
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Groups overlapping violations on a page into clusters
 * @param violations All violation markers
 * @param pageNumber Current page number to filter by
 * @returns Array of violation groups with their combined bounds
 */
export function groupOverlappingViolations(
  violations: ViolationMarker[],
  pageNumber: number
): ViolationGroup[] {
  // Filter violations for current page
  const pageViolations = violations.filter(v => v.pageNumber === pageNumber);

  if (pageViolations.length === 0) {
    return [];
  }

  // Check if two bounding boxes overlap
  const doBoxesOverlap = (
    a: ViolationMarker['bounds'],
    b: ViolationMarker['bounds'],
    threshold = 20 // pixels of overlap tolerance
  ): boolean => {
    return !(
      a.x + a.width + threshold < b.x ||
      b.x + b.width + threshold < a.x ||
      a.y + a.height + threshold < b.y ||
      b.y + b.height + threshold < a.y
    );
  };

  // Union-find data structure for grouping
  const parent: number[] = pageViolations.map((_, i) => i);

  const find = (i: number): number => {
    if (parent[i] !== i) {
      parent[i] = find(parent[i]);
    }
    return parent[i];
  };

  const union = (i: number, j: number) => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      parent[rootJ] = rootI;
    }
  };

  // Group overlapping violations
  for (let i = 0; i < pageViolations.length; i++) {
    for (let j = i + 1; j < pageViolations.length; j++) {
      if (doBoxesOverlap(pageViolations[i].bounds, pageViolations[j].bounds)) {
        union(i, j);
      }
    }
  }

  // Collect groups
  const groupsMap = new Map<number, ViolationMarker[]>();
  pageViolations.forEach((violation, idx) => {
    const root = find(idx);
    if (!groupsMap.has(root)) {
      groupsMap.set(root, []);
    }
    groupsMap.get(root)!.push(violation);
  });

  // Convert to ViolationGroup array with combined bounds
  const groups: ViolationGroup[] = [];
  groupsMap.forEach((violations, root) => {
    // Calculate combined bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    violations.forEach(v => {
      minX = Math.min(minX, v.bounds.x);
      minY = Math.min(minY, v.bounds.y);
      maxX = Math.max(maxX, v.bounds.x + v.bounds.width);
      maxY = Math.max(maxY, v.bounds.y + v.bounds.height);
    });

    groups.push({
      key: `group-${root}-${violations.map(v => v.checkId).join('-')}`,
      violations,
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
    });
  });

  return groups;
}
