'use client';

interface TextHighlightProps {
  bounds: { x: number; y: number; width: number; height: number };
  isCurrent: boolean;
}

export function TextHighlight({ bounds, isCurrent }: TextHighlightProps) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        backgroundColor: isCurrent ? 'rgba(255, 235, 59, 0.4)' : 'rgba(255, 235, 59, 0.25)',
        border: isCurrent
          ? '2px solid rgba(255, 193, 7, 0.8)'
          : '1px dashed rgba(255, 193, 7, 0.5)',
        borderRadius: '2px',
        zIndex: 30,
        transition: 'all 0.2s ease-in-out',
        boxShadow: isCurrent ? '0 0 8px rgba(255, 193, 7, 0.6)' : 'none',
      }}
    />
  );
}

