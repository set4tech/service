'use client';

interface Selection {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export function ScreenshotSelectionOverlay({ selection }: { selection: Selection }) {
  if (!selection) return null;
  const left = Math.min(selection.startX, selection.endX);
  const top = Math.min(selection.startY, selection.endY);
  const width = Math.abs(selection.endX - selection.startX);
  const height = Math.abs(selection.endY - selection.startY);

  return (
    <div
      className="pointer-events-none"
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        border: '2px solid rgba(37, 99, 235, 0.8)',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        zIndex: 40,
      }}
    />
  );
}

export function MeasurementSelectionPreview({ selection }: { selection: Selection }) {
  if (!selection) return null;
  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 40,
      }}
    >
      <defs>
        <marker
          id="drawing-arrow-start"
          markerWidth="8"
          markerHeight="8"
          refX="4"
          refY="4"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 4 L 8 0 L 8 8 Z" fill="#10B981" stroke="white" strokeWidth="0.5" />
        </marker>
        <marker
          id="drawing-arrow-end"
          markerWidth="8"
          markerHeight="8"
          refX="4"
          refY="4"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 8 4 L 0 0 L 0 8 Z" fill="#10B981" stroke="white" strokeWidth="0.5" />
        </marker>
      </defs>

      <line
        x1={selection.startX}
        y1={selection.startY}
        x2={selection.endX}
        y2={selection.endY}
        stroke="#10B981"
        strokeWidth="3"
        markerStart="url(#drawing-arrow-start)"
        markerEnd="url(#drawing-arrow-end)"
      />
    </svg>
  );
}