'use client';

import { useEffect, useState } from 'react';
import { ViolationMarker } from '@/lib/reports/get-violations';
import clsx from 'clsx';

interface Props {
  violation: ViolationMarker;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  totalViolations: number;
  currentIndex: number;
}

export function ViolationDetailModal({
  violation,
  onClose,
  onNext,
  onPrev,
  totalViolations,
  currentIndex,
}: Props) {
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch presigned URL for screenshot
  useEffect(() => {
    if (!violation.screenshotUrl) return;

    const fetchScreenshot = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/screenshots/presign-view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ s3Key: violation.screenshotUrl }),
        });

        if (res.ok) {
          const data = await res.json();
          setScreenshotUrl(data.url);
        }
      } catch (err) {
        console.error('Failed to fetch screenshot:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchScreenshot();
  }, [violation.screenshotUrl]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, onNext, onPrev]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'major':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'moderate':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'minor':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Violation Details</h2>
            <span
              className={clsx(
                'px-3 py-1 rounded-full text-xs font-medium border capitalize',
                getSeverityColor(violation.severity)
              )}
            >
              {violation.severity}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              {currentIndex} of {totalViolations}
            </span>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              aria-label="Close"
            >
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Code Section */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-ink-700 mb-1">Code Section</h3>
            <div className="text-lg font-mono text-ink-900">{violation.codeSectionNumber}</div>
            {violation.checkName && (
              <div className="text-sm text-ink-500 mt-1">{violation.checkName}</div>
            )}
            {violation.sourceUrl && (
              <a
                href={violation.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 text-sm text-accent-600 hover:text-accent-500 underline transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M14 3h7v7M21 3l-9 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <path d="M21 14v7H3V3h7" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
                {violation.sourceLabel || 'View Code Reference'}
              </a>
            )}
          </div>

          {/* Screenshot */}
          {violation.screenshotUrl && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Evidence</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                {loading ? (
                  <div className="h-64 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  </div>
                ) : screenshotUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={screenshotUrl}
                    alt="Violation evidence"
                    className="w-full h-auto"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-64 flex items-center justify-center text-gray-400">
                    Failed to load screenshot
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-1">Page {violation.pageNumber}</div>
            </div>
          )}

          {/* Violation Description */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Violation</h3>
            <div className="text-sm text-gray-900 bg-red-50 border border-red-200 rounded-lg p-3">
              {violation.description}
            </div>
          </div>

          {/* Reasoning */}
          {violation.reasoning && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Analysis</h3>
              <div className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap">
                {violation.reasoning}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {violation.recommendations && violation.recommendations.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Recommendations</h3>
              <ul className="space-y-2">
                {violation.recommendations.map((rec, idx) => (
                  <li
                    key={idx}
                    className="text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2"
                  >
                    <span className="text-blue-600 font-bold mt-0.5">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Confidence */}
          {violation.confidence && (
            <div className="text-xs text-gray-500 mt-4 text-center">
              Analysis confidence: {violation.confidence}
            </div>
          )}
        </div>

        {/* Footer with Navigation */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
          <button
            onClick={onPrev}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Previous
          </button>

          <div className="text-sm text-gray-600">
            Use arrow keys to navigate • Press Esc to close
          </div>

          <button
            onClick={onNext}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            Next
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
