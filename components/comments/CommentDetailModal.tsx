'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CommentMarker } from '@/lib/reports/get-violations';
import { CommentForm } from './CommentForm';

interface Props {
  comment: CommentMarker;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onUpdate?: (comment: CommentMarker) => void;
  onDelete?: () => void;
  totalComments?: number;
  currentIndex?: number;
  assessmentId: string;
}

// Cache for screenshot URLs
const screenshotUrlCache = new Map<string, string>();

export function CommentDetailModal({
  comment,
  onClose,
  onNext,
  onPrev,
  onUpdate,
  onDelete,
  totalComments = 1,
  currentIndex = 0,
  assessmentId,
}: Props) {
  const [currentScreenshotIndex, setCurrentScreenshotIndex] = useState(0);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const imageLoadedRef = useRef<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  // Ensure we're mounted (client-side) before using portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Get current screenshot
  const currentScreenshot = comment.screenshots[currentScreenshotIndex];
  const totalScreenshots = comment.screenshots.length;

  // Reset state when comment changes
  useEffect(() => {
    setCurrentScreenshotIndex(0);
    setIsEditing(false);
  }, [comment.commentId]);

  // Reset image loaded state when screenshot changes
  useEffect(() => {
    const imageKey = currentScreenshot?.url || 'no-image';
    if (imageLoadedRef.current.has(imageKey)) {
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, [currentScreenshotIndex, currentScreenshot?.url]);

  // Fetch presigned URL for current screenshot
  useEffect(() => {
    const screenshotUrlToFetch = currentScreenshot?.url;

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
          screenshotUrlCache.set(screenshotUrlToFetch, data.screenshot);
        }
      } catch (err) {
        console.error('Failed to fetch screenshot:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchScreenshot();
  }, [currentScreenshotIndex, currentScreenshot?.url]);

  // Screenshot navigation
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

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditing) {
          setIsEditing(false);
        } else {
          onClose();
        }
      } else if (!isEditing) {
        if (e.key === 'ArrowRight') {
          if (e.shiftKey && onNext) {
            onNext();
          } else if (currentScreenshotIndex < totalScreenshots - 1) {
            handleNextScreenshot();
          }
        } else if (e.key === 'ArrowLeft') {
          if (e.shiftKey && onPrev) {
            onPrev();
          } else if (currentScreenshotIndex > 0) {
            handlePrevScreenshot();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onClose,
    onNext,
    onPrev,
    isEditing,
    currentScreenshotIndex,
    totalScreenshots,
    handleNextScreenshot,
    handlePrevScreenshot,
  ]);

  const handleResolve = async () => {
    setResolving(true);
    try {
      const response = await fetch(`/api/comments/${comment.commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: comment.status === 'resolved' ? 'open' : 'resolved',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (onUpdate) {
          onUpdate(data.comment);
        }
      }
    } catch (error) {
      console.error('[CommentDetailModal] Error updating status:', error);
    } finally {
      setResolving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this comment?')) return;

    try {
      const response = await fetch(`/api/comments/${comment.commentId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        if (onDelete) {
          onDelete();
        }
        onClose();
      }
    } catch (error) {
      console.error('[CommentDetailModal] Error deleting comment:', error);
    }
  };

  const handleFormSuccess = (updatedComment: CommentMarker) => {
    setIsEditing(false);
    if (onUpdate) {
      onUpdate(updatedComment);
    }
  };

  // Don't render until mounted (avoid SSR issues)
  if (!mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Comment Detail</h2>
            <span
              className={`text-xs px-2 py-1 rounded ${
                comment.status === 'open'
                  ? 'bg-green-100 text-green-700'
                  : comment.status === 'resolved'
                    ? 'bg-gray-100 text-gray-600'
                    : 'bg-blue-100 text-blue-700'
              }`}
            >
              {comment.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {totalComments > 1 && (
              <span className="text-sm text-gray-500">
                {currentIndex + 1} / {totalComments}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {totalScreenshots > 0 ? (
            <div className="grid grid-cols-2 gap-4 p-4">
              {/* Left: Screenshot */}
              <div className="space-y-3">
                <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden relative">
                  {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-sm text-gray-500">Loading screenshot...</div>
                    </div>
                  ) : screenshotUrl ? (
                    <img
                      src={screenshotUrl}
                      alt="Comment screenshot"
                      className="w-full h-full object-contain"
                      onLoad={() => {
                        const key = currentScreenshot?.url || 'no-image';
                        imageLoadedRef.current.add(key);
                        setLoading(false);
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                      No screenshot
                    </div>
                  )}

                  {/* Screenshot navigation */}
                  {totalScreenshots > 1 && (
                    <>
                      <button
                        onClick={handlePrevScreenshot}
                        disabled={currentScreenshotIndex === 0}
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/90 rounded-full shadow-lg disabled:opacity-50 hover:bg-white"
                      >
                        <svg
                          className="w-5 h-5"
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
                      </button>
                      <button
                        onClick={handleNextScreenshot}
                        disabled={currentScreenshotIndex === totalScreenshots - 1}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/90 rounded-full shadow-lg disabled:opacity-50 hover:bg-white"
                      >
                        <svg
                          className="w-5 h-5"
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
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/70 text-white text-xs rounded-full">
                        {currentScreenshotIndex + 1} / {totalScreenshots}
                      </div>
                    </>
                  )}
                </div>

                {/* Screenshot info */}
                {currentScreenshot && (
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>📄 Page {currentScreenshot.pageNumber}</div>
                    {comment.sheetName && <div>📋 Sheet: {comment.sheetName}</div>}
                  </div>
                )}
              </div>

              {/* Right: Comment details (with screenshots) */}
              <div className="space-y-4">
                {isEditing ? (
                  <CommentForm
                    assessmentId={assessmentId}
                    pageNumber={comment.pageNumber}
                    existingComment={comment}
                    onSuccess={handleFormSuccess}
                    onCancel={() => setIsEditing(false)}
                  />
                ) : (
                  <>
                    {/* Title and metadata */}
                    <div>
                      <h3 className="text-xl font-semibold mb-2">{comment.title}</h3>
                      <div className="flex flex-wrap gap-2 text-sm">
                        <span
                          className={`px-2 py-1 rounded ${
                            comment.severity === 'major'
                              ? 'bg-red-100 text-red-700'
                              : comment.severity === 'moderate'
                                ? 'bg-orange-100 text-orange-700'
                                : comment.severity === 'minor'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {comment.severity}
                        </span>
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">
                          {comment.commentType}
                        </span>
                        {comment.discipline && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">
                            {comment.discipline}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <h4 className="font-medium text-sm text-gray-700 mb-1">Description</h4>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">
                        {comment.description}
                      </p>
                    </div>

                    {/* Tags */}
                    {comment.tags && comment.tags.length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm text-gray-700 mb-1">Tags</h4>
                        <div className="flex flex-wrap gap-2">
                          {comment.tags.map((tag, i) => (
                            <span
                              key={i}
                              className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Resolved info */}
                    {comment.status === 'resolved' && comment.resolvedAt && (
                      <div className="p-3 bg-gray-50 rounded-lg text-sm">
                        <div className="font-medium text-gray-700">Resolved</div>
                        <div className="text-gray-600">
                          {new Date(comment.resolvedAt).toLocaleString()}
                        </div>
                        {comment.resolvedNote && (
                          <div className="mt-2 text-gray-600">{comment.resolvedNote}</div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-4">
                      <button
                        onClick={handleResolve}
                        disabled={resolving}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium ${
                          comment.status === 'resolved'
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        } disabled:opacity-50`}
                      >
                        {resolving
                          ? 'Updating...'
                          : comment.status === 'resolved'
                            ? 'Reopen'
                            : 'Mark Resolved'}
                      </button>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={handleDelete}
                        className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            // No screenshots - full width layout
            <div className="p-6">
              <div className="max-w-3xl mx-auto space-y-4">
                {isEditing ? (
                  <CommentForm
                    assessmentId={assessmentId}
                    pageNumber={comment.pageNumber}
                    existingComment={comment}
                    onSuccess={handleFormSuccess}
                    onCancel={() => setIsEditing(false)}
                  />
                ) : (
                  <>
                    {/* Page and sheet info */}
                    <div className="flex items-center gap-3 text-sm text-gray-600 pb-3">
                      <span>📄 Page {comment.pageNumber}</span>
                      {comment.sheetName && (
                        <>
                          <span>•</span>
                          <span>📋 {comment.sheetName}</span>
                        </>
                      )}
                      {comment.discipline && (
                        <>
                          <span>•</span>
                          <span>🏗️ {comment.discipline}</span>
                        </>
                      )}
                    </div>

                    {/* Title and metadata */}
                    <div>
                      <h3 className="text-xl font-semibold mb-2">{comment.title}</h3>
                      <div className="flex flex-wrap gap-2 text-sm">
                        <span
                          className={`px-2 py-1 rounded ${
                            comment.severity === 'major'
                              ? 'bg-red-100 text-red-700'
                              : comment.severity === 'moderate'
                                ? 'bg-orange-100 text-orange-700'
                                : comment.severity === 'minor'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {comment.severity}
                        </span>
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">
                          {comment.commentType}
                        </span>
                        {comment.discipline && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">
                            {comment.discipline}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <h4 className="font-medium text-sm text-gray-700 mb-1">Description</h4>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">
                        {comment.description}
                      </p>
                    </div>

                    {/* Tags */}
                    {comment.tags && comment.tags.length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm text-gray-700 mb-1">Tags</h4>
                        <div className="flex flex-wrap gap-2">
                          {comment.tags.map((tag, i) => (
                            <span
                              key={i}
                              className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Resolved info */}
                    {comment.status === 'resolved' && comment.resolvedAt && (
                      <div className="p-3 bg-gray-50 rounded-lg text-sm">
                        <div className="font-medium text-gray-700">Resolved</div>
                        <div className="text-gray-600">
                          {new Date(comment.resolvedAt).toLocaleString()}
                        </div>
                        {comment.resolvedNote && (
                          <div className="mt-2 text-gray-600">{comment.resolvedNote}</div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-4">
                      <button
                        onClick={handleResolve}
                        disabled={resolving}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium ${
                          comment.status === 'resolved'
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        } disabled:opacity-50`}
                      >
                        {resolving
                          ? 'Updating...'
                          : comment.status === 'resolved'
                            ? 'Reopen'
                            : 'Mark Resolved'}
                      </button>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={handleDelete}
                        className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer - Navigation */}
        {totalComments > 1 && !isEditing && (
          <div className="flex items-center justify-between p-4 border-t">
            <button
              onClick={onPrev}
              disabled={!onPrev || currentIndex === 0}
              className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Previous
            </button>
            <div className="text-sm text-gray-500">
              Use ← → to navigate screenshots, Shift + ← → for comments
            </div>
            <button
              onClick={onNext}
              disabled={!onNext || currentIndex === totalComments - 1}
              className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Next
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
    </div>
  );

  return createPortal(modalContent, document.body);
}
