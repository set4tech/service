'use client';

import React from 'react';

interface PDFPageControlsProps {
  pageNumber: number;
  numPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  showSearch?: boolean;
}

export function PDFPageControls({
  pageNumber,
  numPages,
  onPrevPage,
  onNextPage,
  showSearch = false,
}: PDFPageControlsProps) {
  return (
    <div className="absolute bottom-3 left-3 z-50 flex items-center gap-3 bg-white rounded px-3 py-2 border shadow-md pointer-events-auto">
      <button className="btn-icon bg-white" onClick={onPrevPage} aria-label="Previous page">
        ◀
      </button>
      <div className="text-sm font-medium">
        Page {pageNumber} / {numPages || '…'}
      </div>
      <button className="btn-icon bg-white" onClick={onNextPage} aria-label="Next page">
        ▶
      </button>
      <span className="text-xs text-gray-600 ml-2 hidden sm:inline">
        Shortcuts: ←/→, -/+, 0, S, M, L, Esc{showSearch && ', F'}
      </span>
    </div>
  );
}
