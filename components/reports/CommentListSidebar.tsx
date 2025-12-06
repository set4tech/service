'use client';

import { CommentMarker } from '@/lib/reports/get-violations';

interface Props {
  comments: CommentMarker[];
  selectedComment: CommentMarker | null;
  onCommentClick: (comment: CommentMarker) => void;
  onCommentDetailsClick: (comment: CommentMarker) => void;
  currentPage?: number;
}

const commentTypeLabels: Record<string, string> = {
  coordination: 'Coordination',
  qc: 'QC',
  constructability: 'Constructability',
  general: 'General',
};

const commentTypeColors: Record<string, string> = {
  coordination: 'bg-blue-50 text-blue-700 border-blue-200',
  qc: 'bg-purple-50 text-purple-700 border-purple-200',
  constructability: 'bg-orange-50 text-orange-700 border-orange-200',
  general: 'bg-gray-50 text-gray-700 border-gray-200',
};

const severityColors: Record<string, string> = {
  info: 'bg-gray-100 text-gray-700',
  minor: 'bg-blue-100 text-blue-700',
  moderate: 'bg-yellow-100 text-yellow-800',
  major: 'bg-red-100 text-red-700',
};

export function CommentListSidebar({
  comments,
  selectedComment,
  onCommentClick,
  onCommentDetailsClick,
  currentPage,
}: Props) {
  console.log('[CommentListSidebar] Rendering with:', {
    totalComments: comments.length,
    selectedCommentId: selectedComment?.commentId,
  });

  // Group comments by status
  const openComments = comments.filter(c => c.status === 'open');
  const resolvedComments = comments.filter(c => c.status === 'resolved');
  const acknowledgedComments = comments.filter(c => c.status === 'acknowledged');

  // Comments on current page (if page is specified)
  const commentsOnPage = currentPage
    ? comments.filter(c => c.pageNumber === currentPage)
    : undefined;

  const renderComment = (comment: CommentMarker) => {
    const isSelected = selectedComment?.commentId === comment.commentId;
    const isOnCurrentPage = currentPage === comment.pageNumber;

    return (
      <div
        key={comment.commentId}
        className={`border rounded-lg p-3 mb-3 cursor-pointer transition-all ${
          isSelected
            ? 'border-accent-500 bg-accent-50 shadow-md'
            : isOnCurrentPage
              ? 'border-accent-200 bg-accent-25 hover:border-accent-400'
              : 'border-line bg-white hover:border-accent-300'
        }`}
        onClick={() => onCommentClick(comment)}
      >
        {/* Header: Type badge + severity */}
        <div className="flex items-center justify-between mb-2">
          <span
            className={`text-xs px-2 py-1 rounded-md border ${commentTypeColors[comment.commentType] || commentTypeColors.general}`}
          >
            {commentTypeLabels[comment.commentType] || comment.commentType}
          </span>
          <span
            className={`text-xs px-2 py-1 rounded-md font-medium ${severityColors[comment.severity]}`}
          >
            {comment.severity}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-sm text-ink-900 mb-1">{comment.title}</h3>

        {/* Meta info */}
        <div className="flex items-center gap-2 text-xs text-ink-500 mb-2">
          {comment.sheetName && (
            <span className="bg-gray-100 px-2 py-0.5 rounded">{comment.sheetName}</span>
          )}
          {comment.discipline && (
            <span className="bg-gray-100 px-2 py-0.5 rounded">{comment.discipline}</span>
          )}
          <span>Page {comment.pageNumber}</span>
        </div>

        {/* Description preview */}
        <p className="text-xs text-ink-600 line-clamp-2 mb-2">{comment.description}</p>

        {/* Tags */}
        {comment.tags && comment.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {comment.tags.map((tag, idx) => (
              <span
                key={idx}
                className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Screenshot count */}
        {comment.screenshots.length > 0 && (
          <div className="text-xs text-ink-500 mb-2">
            {comment.screenshots.length} screenshot{comment.screenshots.length > 1 ? 's' : ''}
          </div>
        )}

        {/* Status badge */}
        {comment.status === 'resolved' && (
          <div className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded inline-block">
            Resolved
          </div>
        )}
        {comment.status === 'acknowledged' && (
          <div className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded inline-block">
            Acknowledged
          </div>
        )}

        {/* Details button */}
        <button
          onClick={e => {
            e.stopPropagation();
            onCommentDetailsClick(comment);
          }}
          className="mt-2 w-full text-xs text-accent-600 hover:text-accent-700 font-medium py-1 border border-accent-200 rounded hover:bg-accent-50 transition-colors"
        >
          View Details
        </button>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      {comments.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-ink-500 text-sm">No comments found</p>
        </div>
      ) : (
        <>
          {/* Comments on current page (if applicable) */}
          {commentsOnPage && commentsOnPage.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-ink-700 uppercase tracking-wide mb-3">
                On This Page ({commentsOnPage.length})
              </h3>
              {commentsOnPage.map(renderComment)}
            </div>
          )}

          {/* Open comments */}
          {openComments.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-ink-700 uppercase tracking-wide mb-3">
                Open ({openComments.length})
              </h3>
              {openComments.map(renderComment)}
            </div>
          )}

          {/* Acknowledged comments */}
          {acknowledgedComments.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-ink-700 uppercase tracking-wide mb-3">
                Acknowledged ({acknowledgedComments.length})
              </h3>
              {acknowledgedComments.map(renderComment)}
            </div>
          )}

          {/* Resolved comments */}
          {resolvedComments.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-ink-700 uppercase tracking-wide mb-3">
                ✅ Resolved ({resolvedComments.length})
              </h3>
              {resolvedComments.map(renderComment)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
