'use client';

import { useEffect, useState, useRef } from 'react';
import { ViolationMarker } from '@/lib/reports/get-violations';
import { CodeSection } from '@/types/analysis';
import { SectionContentDisplay } from '@/components/checks/panels/SectionContentDisplay';
import clsx from 'clsx';

interface Props {
  violation: ViolationMarker;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  totalViolations: number;
  currentIndex: number;
}

// Cache for section data and screenshot URLs
const sectionCache = new Map<string, CodeSection>();
const screenshotUrlCache = new Map<string, string>();

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
  const [section, setSection] = useState<CodeSection | null>(null);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageLoadedRef = useRef<Set<string>>(new Set());

  // Reset state when violation changes
  useEffect(() => {
    // Check if image was already loaded before
    const imageKey = violation.screenshotUrl || 'no-image';
    if (imageLoadedRef.current.has(imageKey)) {
      setImageLoaded(true);
    } else {
      setImageLoaded(false);
    }

    setSectionLoading(true);
    setLoading(true);
  }, [violation.checkId, violation.screenshotUrl]);

  // Fetch section content
  useEffect(() => {
    if (!violation.codeSectionKey) {
      setSectionLoading(false);
      return;
    }

    // Check cache first
    const cached = sectionCache.get(violation.codeSectionKey);
    if (cached) {
      setSection(cached);
      setSectionLoading(false);
      return;
    }

    const fetchSection = async () => {
      setSectionLoading(true);
      setSectionError(null);
      try {
        const res = await fetch('/api/compliance/sections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sectionKey: violation.codeSectionKey }),
        });

        if (res.ok) {
          const data = await res.json();
          setSection(data);
          // Cache the result
          sectionCache.set(violation.codeSectionKey, data);
        } else {
          setSectionError('Failed to load section details');
        }
      } catch (err) {
        console.error('Failed to fetch section:', err);
        setSectionError('Failed to load section details');
      } finally {
        setSectionLoading(false);
      }
    };

    fetchSection();
  }, [violation.codeSectionKey]);

  // Fetch presigned URL for screenshot
  useEffect(() => {
    if (!violation.screenshotUrl) {
      setImageLoaded(true); // No image to load
      setLoading(false);
      imageLoadedRef.current.add('no-image');
      return;
    }

    // Check cache first
    const cachedUrl = screenshotUrlCache.get(violation.screenshotUrl);
    if (cachedUrl) {
      setScreenshotUrl(cachedUrl);
      setLoading(false);
      return;
    }

    const fetchScreenshot = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/screenshots/presign-view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ screenshotUrl: violation.screenshotUrl }),
        });

        if (res.ok) {
          const data = await res.json();
          setScreenshotUrl(data.screenshot);
          // Cache the presigned URL
          screenshotUrlCache.set(violation.screenshotUrl, data.screenshot);
        } else {
          setImageLoaded(true); // Don't block on error
        }
      } catch (err) {
        console.error('Failed to fetch screenshot:', err);
        setImageLoaded(true); // Don't block on error
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
      case 'needs_more_info':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  // Check if everything is loaded (including image)
  const isFullyLoaded = !sectionLoading && !loading && imageLoaded;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
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
          {/* Loading spinner overlay */}
          {!isFullyLoaded && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
                <p className="text-sm text-gray-600">Loading violation details...</p>
              </div>
            </div>
          )}

          {/* Content (rendered but hidden until loaded) */}
          <div className={isFullyLoaded ? 'animate-fadeIn' : 'hidden'}>
            <style jsx>{`
              @keyframes fadeIn {
                from {
                  opacity: 0;
                  transform: translateY(4px);
                }
                to {
                  opacity: 1;
                  transform: translateY(0);
                }
              }
              .animate-fadeIn {
                animation: fadeIn 0.3s ease-out;
              }
            `}</style>
            {/* Code Section */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-ink-700">Code Section</h3>
                {violation.sourceUrl && (
                  <a
                    href={violation.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
                  >
                    See Original Code
                    <svg
                      width="12"
                      height="12"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      className="flex-shrink-0"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                )}
              </div>
              <div className="text-lg font-mono text-ink-900">{violation.codeSectionNumber}</div>
              {violation.checkName && (
                <div className="text-sm text-ink-500 mt-1">{violation.checkName}</div>
              )}
            </div>

            {/* Code Section Content */}
            <div className="mb-6 pb-6 border-b border-gray-200">
              <SectionContentDisplay
                section={section}
                loading={false}
                error={sectionError}
                isElementCheck={false}
                sections={section ? [section] : []}
                check={null}
              />
            </div>

            {/* Screenshot */}
            {violation.screenshotUrl && screenshotUrl && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Evidence</h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshotUrl}
                    alt="Violation evidence"
                    className="w-full h-auto"
                    loading="eager"
                    onLoad={() => {
                      setImageLoaded(true);
                      if (violation.screenshotUrl) {
                        imageLoadedRef.current.add(violation.screenshotUrl);
                      }
                    }}
                    onError={() => setImageLoaded(true)}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">Page {violation.pageNumber}</div>
              </div>
            )}

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
