'use client';

import { useEffect, useState } from 'react';
import type { Screenshot } from '@/types/database';
import Modal from '@/components/ui/Modal';
import { AssignScreenshotModal } from './AssignScreenshotModal';

interface AssessmentScreenshot extends Screenshot {
  check_id?: string;
  check_section_number?: string;
  check_section_title?: string;
  is_original?: boolean;
}

export function AssessmentScreenshotGallery({
  assessmentId,
  refreshKey,
}: {
  assessmentId: string;
  refreshKey?: number;
}) {
  const [screenshots, setScreenshots] = useState<AssessmentScreenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<AssessmentScreenshot | null>(null);
  const [assigningScreenshot, setAssigningScreenshot] = useState<AssessmentScreenshot | null>(null);
  const [presignedUrls, setPresignedUrls] = useState<
    Record<string, { screenshot: string; thumbnail: string }>
  >({});

  // Fetch all screenshots for this assessment
  useEffect(() => {
    setLoading(true);
    fetch(`/api/screenshots?assessment_id=${assessmentId}`)
      .then(res => res.json())
      .then(data => {
        console.log('[AssessmentGallery] Loaded screenshots:', data.screenshots?.length);
        setScreenshots(data.screenshots || []);
      })
      .catch(err => {
        console.error('[AssessmentGallery] Failed to load screenshots:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [assessmentId, refreshKey]);

  // Fetch presigned URLs for screenshots
  useEffect(() => {
    (async () => {
      const urls: Record<string, { screenshot: string; thumbnail: string }> = {};
      for (const shot of screenshots) {
        try {
          const res = await fetch('/api/screenshots/presign-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              screenshotUrl: shot.screenshot_url,
              thumbnailUrl: shot.thumbnail_url,
            }),
          });
          const data = await res.json();
          urls[shot.id] = data;
        } catch (err) {
          console.error('Failed to get presigned URL:', err);
        }
      }
      setPresignedUrls(urls);
    })();
  }, [screenshots]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/screenshots/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setScreenshots(prev => prev.filter(s => s.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete screenshot:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-gray-500">Loading screenshots...</div>
      </div>
    );
  }

  if (screenshots.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-sm text-gray-500">No screenshots yet</div>
          <div className="text-xs text-gray-400 mt-1">
            Capture screenshots from the PDF viewer in Section or Element mode
          </div>
        </div>
      </div>
    );
  }

  // Filter screenshots by search query
  const filteredScreenshots = screenshots.filter(shot => {
    const searchLower = search.toLowerCase();
    const caption = (shot.caption || '').toLowerCase();
    const sectionNumber = (shot.check_section_number || '').toLowerCase();
    const sectionTitle = (shot.check_section_title || '').toLowerCase();

    return (
      caption.includes(searchLower) ||
      sectionNumber.includes(searchLower) ||
      sectionTitle.includes(searchLower)
    );
  });

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-medium">All Screenshots</h2>
        <p className="text-sm text-gray-600">
          {filteredScreenshots.length} of {screenshots.length} screenshots
        </p>
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by caption or section..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {filteredScreenshots.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No screenshots match your search
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
        >
          {filteredScreenshots.map(shot => {
            const urls = presignedUrls[shot.id];
            return (
              <figure key={shot.id} className="group flex flex-col">
                <button
                  className="w-full aspect-video bg-gray-100 border rounded overflow-hidden flex items-center justify-center relative hover:ring-2 ring-blue-500 transition-all"
                  onClick={() => setPreview(shot)}
                  aria-label="Open screenshot"
                >
                  {urls?.thumbnail ? (
                    <img
                      src={urls.thumbnail}
                      alt={shot.caption || 'Screenshot'}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-gray-400">Loading...</span>
                  )}

                  {/* Badge for assigned screenshots */}
                  {shot.is_original === false && (
                    <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs px-1 rounded">
                      Assigned
                    </div>
                  )}
                </button>

                <figcaption className="mt-2 flex flex-col gap-1 min-w-0">
                  <div
                    className="text-xs font-medium text-gray-900 truncate"
                    title={shot.caption || 'No caption'}
                  >
                    {shot.caption || 'No caption'}
                  </div>
                  {shot.check_section_number && (
                    <div
                      className="text-xs text-gray-600 truncate"
                      title={shot.check_section_number}
                    >
                      {shot.check_section_number}
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      className="text-xs text-blue-600 hover:text-blue-900 whitespace-nowrap"
                      onClick={() => setAssigningScreenshot(shot)}
                      title="Reassign to different checks"
                    >
                      📋
                    </button>
                    <button
                      className="text-xs text-red-600 hover:text-red-900 whitespace-nowrap"
                      onClick={() => {
                        if (confirm('Delete screenshot?')) handleDelete(shot.id);
                      }}
                      title="Delete screenshot"
                    >
                      🗑
                    </button>
                  </div>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.caption || 'Screenshot'}
      >
        {preview && presignedUrls[preview.id]?.screenshot && (
          <div className="space-y-2">
            <img
              src={presignedUrls[preview.id].screenshot}
              alt={preview.caption || 'Screenshot'}
              className="max-h-[70vh] rounded"
            />
            {preview.check_section_number && (
              <div className="text-sm text-gray-600">
                Assigned to: {preview.check_section_number}
                {preview.check_section_title && ` - ${preview.check_section_title}`}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Assignment Modal */}
      {assigningScreenshot && (
        <AssignScreenshotModal
          open={!!assigningScreenshot}
          onClose={() => setAssigningScreenshot(null)}
          screenshotId={assigningScreenshot.id}
          currentCheckId={assigningScreenshot.check_id || ''}
          assessmentId={assessmentId}
          onAssigned={() => {
            setAssigningScreenshot(null);
            // Refresh screenshots
            fetch(`/api/screenshots?assessment_id=${assessmentId}`)
              .then(res => res.json())
              .then(data => {
                setScreenshots(data.screenshots || []);
              });
          }}
        />
      )}
    </div>
  );
}
