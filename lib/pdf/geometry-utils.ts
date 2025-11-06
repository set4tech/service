/**
 * Geometry utilities for PDF viewer interactions
 */

/**
 * Check if a line segment intersects with or is contained by a rectangle.
 * @param lineStart - Start point of the line
 * @param lineEnd - End point of the line
 * @param rect - Rectangle bounds
 * @returns true if line intersects or is inside rectangle
 */
export function lineIntersectsRect(
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  const { x: minX, y: minY, width, height } = rect;
  const maxX = minX + width;
  const maxY = minY + height;

  // Quick check: if either endpoint is inside rectangle, we intersect
  const pointInRect = (p: { x: number; y: number }) =>
    p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;

  if (pointInRect(lineStart) || pointInRect(lineEnd)) return true;

  // Check if line intersects any of the 4 rectangle edges
  const lineIntersectsLine = (
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    p4: { x: number; y: number }
  ): boolean => {
    const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (denom === 0) return false; // Parallel lines

    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  };

  // Rectangle corners
  const topLeft = { x: minX, y: minY };
  const topRight = { x: maxX, y: minY };
  const bottomLeft = { x: minX, y: maxY };
  const bottomRight = { x: maxX, y: maxY };

  // Check all 4 edges
  return (
    lineIntersectsLine(lineStart, lineEnd, topLeft, topRight) ||
    lineIntersectsLine(lineStart, lineEnd, topRight, bottomRight) ||
    lineIntersectsLine(lineStart, lineEnd, bottomRight, bottomLeft) ||
    lineIntersectsLine(lineStart, lineEnd, bottomLeft, topLeft)
  );
}

