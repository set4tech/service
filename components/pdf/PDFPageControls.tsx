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
    <div className="absolute bottom-0 left-0 right-0 z-50 flex items-center gap-3 bg-gray-100 border-t border-gray-300 px-4 py-2 pointer-events-auto">
      <button
        className="w-8 h-8 flex items-center justify-center rounded bg-white border border-gray-300 hover:bg-gray-50 transition-colors text-gray-700"
        onClick={onPrevPage}
        aria-label="Previous page"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div className="text-sm font-medium text-gray-700">
        Page {pageNumber} / {numPages || '…'}
      </div>
      <button
        className="w-8 h-8 flex items-center justify-center rounded bg-white border border-gray-300 hover:bg-gray-50 transition-colors text-gray-700"
        onClick={onNextPage}
        aria-label="Next page"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <span className="text-xs text-gray-500 ml-auto hidden sm:inline">
        ←/→ pages · -/+ zoom · 0 reset{showSearch && ' · F search'}
      </span>
    </div>
  );
}
