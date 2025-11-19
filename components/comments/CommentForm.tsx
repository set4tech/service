'use client';

import { useState } from 'react';
import { CommentMarker } from '@/lib/reports/get-violations';

interface CommentFormProps {
  assessmentId: string;
  pageNumber: number;
  onSuccess?: (comment: CommentMarker) => void;
  onCancel?: () => void;
  existingComment?: CommentMarker; // For editing
  screenshotIds?: string[]; // Pre-assigned screenshots
  cropCoordinates?: { x: number; y: number; width: number; height: number; zoom_level: number };
}

export function CommentForm({
  assessmentId,
  pageNumber,
  onSuccess,
  onCancel,
  existingComment,
  screenshotIds = [],
  cropCoordinates,
}: CommentFormProps) {
  const [title, setTitle] = useState(existingComment?.title || '');
  const [description, setDescription] = useState(existingComment?.description || '');
  const [commentType, setCommentType] = useState<
    'coordination' | 'qc' | 'constructability' | 'general'
  >(existingComment?.commentType || 'coordination');
  const [severity, setSeverity] = useState<'info' | 'minor' | 'moderate' | 'major'>(
    existingComment?.severity || 'info'
  );
  const [sheetName, setSheetName] = useState(existingComment?.sheetName || '');
  const [discipline, setDiscipline] = useState(existingComment?.discipline || '');
  const [tags, setTags] = useState(existingComment?.tags?.join(', ') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        assessment_id: assessmentId,
        page_number: pageNumber,
        crop_coordinates: cropCoordinates,
        title: title.trim(),
        description: description.trim(),
        comment_type: commentType,
        severity,
        sheet_name: sheetName.trim() || undefined,
        discipline: discipline.trim() || undefined,
        tags: tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean),
        screenshot_ids: screenshotIds,
      };

      console.log('[CommentForm] Submitting:', payload);

      const url = existingComment ? `/api/comments/${existingComment.commentId}` : '/api/comments';
      const method = existingComment ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save comment');
      }

      const data = await response.json();
      console.log('[CommentForm] Success:', data);

      if (onSuccess) {
        onSuccess(data.comment);
      }
    } catch (err) {
      console.error('[CommentForm] Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Title */}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
          Title *
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Brief summary of the issue"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
          Description *
        </label>
        <textarea
          id="description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          required
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Detailed description of the coordination issue..."
        />
      </div>

      {/* Comment Type and Severity */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="commentType" className="block text-sm font-medium text-gray-700 mb-1">
            Type
          </label>
          <select
            id="commentType"
            value={commentType}
            onChange={e => setCommentType(e.target.value as any)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="coordination">Coordination</option>
            <option value="qc">QC/Quality Control</option>
            <option value="constructability">Constructability</option>
            <option value="general">General</option>
          </select>
        </div>

        <div>
          <label htmlFor="severity" className="block text-sm font-medium text-gray-700 mb-1">
            Severity
          </label>
          <select
            id="severity"
            value={severity}
            onChange={e => setSeverity(e.target.value as any)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="info">Info</option>
            <option value="minor">Minor</option>
            <option value="moderate">Moderate</option>
            <option value="major">Major</option>
          </select>
        </div>
      </div>

      {/* Sheet Name and Discipline */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="sheetName" className="block text-sm font-medium text-gray-700 mb-1">
            Sheet Name
          </label>
          <input
            id="sheetName"
            type="text"
            value={sheetName}
            onChange={e => setSheetName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., E-0.1"
          />
        </div>

        <div>
          <label htmlFor="discipline" className="block text-sm font-medium text-gray-700 mb-1">
            Discipline
          </label>
          <input
            id="discipline"
            type="text"
            value={discipline}
            onChange={e => setDiscipline(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., electrical, mechanical"
          />
        </div>
      </div>

      {/* Tags */}
      <div>
        <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">
          Tags
        </label>
        <input
          id="tags"
          type="text"
          value={tags}
          onChange={e => setTags(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Comma-separated tags"
        />
        <p className="text-xs text-gray-500 mt-1">Separate multiple tags with commas</p>
      </div>

      {/* Info about page and screenshots */}
      <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600 space-y-1">
        <div>📄 Page: {pageNumber}</div>
        {screenshotIds.length > 0 && <div>📸 Screenshots: {screenshotIds.length} attached</div>}
        {cropCoordinates && <div>📍 Location: Specific area selected</div>}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading || !title.trim() || !description.trim()}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
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
              Saving...
            </>
          ) : (
            <>{existingComment ? 'Update Comment' : 'Create Comment'}</>
          )}
        </button>
      </div>
    </form>
  );
}
