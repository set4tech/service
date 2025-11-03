'use client';

import { useEffect, useRef } from 'react';

interface PDFSearchOverlayProps {
  isOpen: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  currentIndex: number;
  totalMatches: number;
  isSearching: boolean;
  searchMethod: 'fulltext' | 'fuzzy' | null;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function PDFSearchOverlay({
  isOpen,
  query,
  onQueryChange,
  currentIndex,
  totalMatches,
  isSearching,
  searchMethod,
  onNext,
  onPrev,
  onClose,
}: PDFSearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere if user is typing in input
      if (e.target === inputRef.current) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) {
            onPrev();
          } else {
            onNext();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
        return;
      }

      // Global shortcuts when search is open
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          onPrev();
        } else {
          onNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onNext, onPrev, onClose]);

  if (!isOpen) return null;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[60] w-full max-w-xl px-4 pointer-events-auto">
      <div className="bg-white border-2 border-blue-500 rounded-lg shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2 p-3 border-b border-gray-200">
          <svg
            className="w-5 h-5 text-gray-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder="Search in PDF..."
            className="flex-1 outline-none text-sm"
          />
          {isSearching && (
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Searching...
            </div>
          )}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
            title="Close (Esc)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Results info and navigation */}
        {query.trim() && !isSearching && (
          <div className="flex items-center justify-between p-2 bg-gray-50">
            <div className="flex items-center gap-2">
              {totalMatches > 0 ? (
                <>
                  <span className="text-sm font-medium text-gray-700">
                    {currentIndex + 1} / {totalMatches}
                  </span>
                  {searchMethod && (
                    <span className="text-xs text-gray-500 px-2 py-0.5 bg-white rounded border border-gray-200">
                      {searchMethod === 'fulltext' ? 'Exact' : 'Fuzzy'}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-sm text-gray-500">No matches found</span>
              )}
            </div>

            {totalMatches > 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={onPrev}
                  disabled={totalMatches === 0}
                  className="p-1 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  title="Previous (Shift+Enter)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <button
                  onClick={onNext}
                  disabled={totalMatches === 0}
                  className="p-1 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  title="Next (Enter)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Keyboard shortcuts hint */}
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-mono">
                Enter
              </kbd>{' '}
              Next
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-mono">
                Shift+Enter
              </kbd>{' '}
              Prev
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-mono">
                Esc
              </kbd>{' '}
              Close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
