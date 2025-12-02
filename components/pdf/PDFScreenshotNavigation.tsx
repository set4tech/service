'use client';

import React from 'react';

interface PDFScreenshotNavigationProps {
  current: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

export function PDFScreenshotNavigation({
  current,
  total,
  onNext,
  onPrev,
  canGoNext,
  canGoPrev,
}: PDFScreenshotNavigationProps) {
  return (
    <div className="absolute top-3 left-3 z-50 flex items-center gap-1.5 pointer-events-auto max-w-[500px]">
      <button
        onClick={onPrev}
        disabled={!canGoPrev}
        className="flex items-center justify-center p-1.5 text-gray-700 bg-white border-2 border-gray-300 rounded-md shadow-lg hover:bg-gray-50 hover:border-blue-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300"
        title="Show previous relevant area of drawing"
      >
        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>
      <div className="flex flex-col items-center px-4 py-2 text-xs bg-white border-2 border-blue-500 rounded-lg shadow-lg">
        <div className="font-semibold text-blue-600 mb-0.5">
          <span className="text-blue-600">{current}</span>
          <span className="text-gray-400 mx-1">/</span>
          <span className="text-gray-600">{total}</span>
        </div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">
          Relevant Drawings
        </div>
      </div>
      <button
        onClick={onNext}
        disabled={!canGoNext}
        className="flex items-center justify-center p-1.5 text-gray-700 bg-white border-2 border-gray-300 rounded-md shadow-lg hover:bg-gray-50 hover:border-blue-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-300"
        title="Show next relevant area of drawing"
      >
        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
