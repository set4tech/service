'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { ViolationMarker } from '@/lib/reports/get-violations';
import { CodeSection } from '@/types/analysis';
import { SectionContentDisplay } from '@/components/checks/panels/SectionContentDisplay';
import { CalculationTableDisplay } from './CalculationTableDisplay';
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
  const [currentScreenshotIndex, setCurrentScreenshotIndex] = useState(0);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState<CodeSection | null>(null);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const imageLoadedRef = useRef<Set<string>>(new Set());

  // Get current screenshot from allScreenshots array
  const currentScreenshot = violation.allScreenshots[currentScreenshotIndex];
  const totalScreenshots = violation.allScreenshots.length;

  // Reset state when violation changes
  useEffect(() => {
    // Reset screenshot index when switching violations
    setCurrentScreenshotIndex(0);
    setSectionLoading(true);
  }, [violation.checkId]);

  // Reset image loaded state when screenshot changes
  useEffect(() => {
    const imageKey = currentScreenshot?.url || violation.screenshotUrl || 'no-image';
    if (imageLoadedRef.current.has(imageKey)) {
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, [currentScreenshotIndex, currentScreenshot?.url, violation.screenshotUrl]);

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
        const res = await fetch(`/api/code-sections/${violation.codeSectionKey}`);

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

  // Fetch presigned URL for current screenshot
  useEffect(() => {
    const screenshotUrlToFetch = currentScreenshot?.url || violation.screenshotUrl;

    if (!screenshotUrlToFetch) {
      setLoading(false);
      imageLoadedRef.current.add('no-image');
      return;
    }

    // Check cache first
    const cachedUrl = screenshotUrlCache.get(screenshotUrlToFetch);
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
          body: JSON.stringify({ screenshotUrl: screenshotUrlToFetch }),
        });

        if (res.ok) {
          const data = await res.json();
          setScreenshotUrl(data.screenshot);
          // Cache the presigned URL
          screenshotUrlCache.set(screenshotUrlToFetch, data.screenshot);
        }
      } catch (err) {
        console.error('Failed to fetch screenshot:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchScreenshot();
  }, [currentScreenshotIndex, currentScreenshot?.url, violation.screenshotUrl]);

  // Screenshot navigation handlers
  const handleNextScreenshot = useCallback(() => {
    if (currentScreenshotIndex < totalScreenshots - 1) {
      setCurrentScreenshotIndex(currentScreenshotIndex + 1);
    }
  }, [currentScreenshotIndex, totalScreenshots]);

  const handlePrevScreenshot = useCallback(() => {
    if (currentScreenshotIndex > 0) {
      setCurrentScreenshotIndex(currentScreenshotIndex - 1);
    }
  }, [currentScreenshotIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Ctrl/Cmd + Arrow keys for screenshot navigation (within current violation)
      if ((e.ctrlKey || e.metaKey) && totalScreenshots > 1) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleNextScreenshot();
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handlePrevScreenshot();
          return;
        }
      }

      // Arrow keys alone for violation navigation
      if (!e.ctrlKey && !e.metaKey) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          onNext();
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onPrev();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onClose,
    onNext,
    onPrev,
    currentScreenshotIndex,
    totalScreenshots,
    handleNextScreenshot,
    handlePrevScreenshot,
  ]);

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

  // Only show loading for section content initially
  const isSectionReady = !sectionLoading;

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
          {/* Show section loading spinner initially, then show content */}
          {!isSectionReady ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
                <p className="text-sm text-gray-600">Loading violation details...</p>
              </div>
            </div>
          ) : (
            <div>
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

                {/* Calculation Table */}
                {violation.calculationTable && (
                  <CalculationTableDisplay table={violation.calculationTable} />
                )}
              </div>

              {/* Screenshot */}
              {totalScreenshots > 0 && screenshotUrl && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-700">Evidence</h3>
                    {totalScreenshots > 1 && (
                      <div className="text-xs text-gray-600 font-medium">
                        Screenshot {currentScreenshotIndex + 1} of {totalScreenshots}
                      </div>
                    )}
                  </div>

                  {/* Screenshot navigation controls (only show if multiple screenshots) */}
                  {totalScreenshots > 1 && (
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        onClick={handlePrevScreenshot}
                        disabled={currentScreenshotIndex === 0}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Previous screenshot (Ctrl+Left)"
                      >
                        <svg
                          width="14"
                          height="14"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 19l-7-7 7-7"
                          />
                        </svg>
                        Prev
                      </button>
                      <button
                        onClick={handleNextScreenshot}
                        disabled={currentScreenshotIndex === totalScreenshots - 1}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Next screenshot (Ctrl+Right)"
                      >
                        Next
                        <svg
                          width="14"
                          height="14"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
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

                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50 relative">
                    {/* Loading spinner overlay for image */}
                    {loading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-90 z-10">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2" />
                          <p className="text-xs text-gray-600">Loading screenshot...</p>
                        </div>
                      </div>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={screenshotUrl}
                      alt="Violation evidence"
                      className={`w-full h-auto transition-opacity duration-200 ${loading ? 'opacity-0' : 'opacity-100'}`}
                      loading="eager"
                      onLoad={() => {
                        setLoading(false);
                        const urlToCache = currentScreenshot?.url || violation.screenshotUrl;
                        if (urlToCache) {
                          imageLoadedRef.current.add(urlToCache);
                        }
                      }}
                      onError={() => {
                        setLoading(false);
                      }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Page {currentScreenshot?.pageNumber || violation.pageNumber}
                  </div>

                  {/* Thumbnail strip (only show if multiple screenshots) */}
                  {totalScreenshots > 1 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {violation.allScreenshots.map((screenshot, index) => {
                          // Need to get presigned URL for each thumbnail
                          // For now, we'll use the thumbnail URL directly since it's an S3 path
                          // In a real implementation, you might want to presign these too
                          return (
                            <button
                              key={screenshot.id}
                              onClick={() => setCurrentScreenshotIndex(index)}
                              className={clsx(
                                'flex-shrink-0 relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-all hover:scale-105',
                                currentScreenshotIndex === index
                                  ? 'border-blue-500 shadow-lg'
                                  : 'border-gray-300 opacity-70 hover:opacity-100'
                              )}
                              title={`Screenshot ${index + 1} (Page ${screenshot.pageNumber})`}
                            >
                              {/* Placeholder for thumbnail - in production, you'd want to presign these too */}
                              <div className="w-full h-full bg-gray-200 flex items-center justify-center text-xs text-gray-600">
                                <div className="text-center">
                                  <div className="font-semibold">#{index + 1}</div>
                                  <div className="text-[10px]">Pg {screenshot.pageNumber}</div>
                                </div>
                              </div>
                              {currentScreenshotIndex === index && (
                                <div className="absolute inset-0 bg-blue-500 bg-opacity-10 pointer-events-none" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Reasoning - Prioritize manual reasoning over AI reasoning */}
              {(violation.manualReasoning || violation.reasoning) && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-sm font-medium text-gray-700">
                      {violation.manualReasoning ? 'Manual Assessment' : 'AI Analysis'}
                    </h3>
                    {violation.manualReasoning && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                        Human Reviewed
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap">
                    {violation.manualReasoning || violation.reasoning}
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
            {totalScreenshots > 1 ? (
              <>Arrows: violations • Ctrl+Arrows: screenshots • Esc: close</>
            ) : (
              <>Use arrow keys to navigate • Press Esc to close</>
            )}
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
