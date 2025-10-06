'use client';
import { useEffect, useState } from 'react';
import type { Check, Screenshot } from '@/types/database';
import Modal from '@/components/ui/Modal';
import { AssignScreenshotModal } from './AssignScreenshotModal';

export function ScreenshotGallery({
  check,
  refreshKey,
  onScreenshotAssigned,
}: {
  check: Check;
  refreshKey: number;
  onScreenshotAssigned?: () => void;
}) {
  const [shots, setShots] = useState<Screenshot[]>((check as any).screenshots || []);
  const [preview, setPreview] = useState<Screenshot | null>(null);
  const [assigningScreenshot, setAssigningScreenshot] = useState<Screenshot | null>(null);
  const [presignedUrls, setPresignedUrls] = useState<
    Record<string, { screenshot: string; thumbnail: string }>
  >({});

  useEffect(() => {
    console.log('[ScreenshotGallery] 🔍 Check object:', {
      checkId: check.id,
      instanceLabel: (check as any).instance_label || '(parent)',
      parentCheckId: (check as any).parent_check_id || null,
      hasScreenshots: !!(check as any).screenshots,
      screenshotsCount: (check as any).screenshots?.length || 0,
      refreshKey,
    });

    // Only fetch if screenshots not already in check object
    if ((check as any).screenshots?.length > 0) {
      console.log(
        '[ScreenshotGallery] ✅ Using screenshots from check prop:',
        (check as any).screenshots.length,
        'screenshots'
      );
      console.log(
        '[ScreenshotGallery] Screenshot details:',
        (check as any).screenshots.map((s: any) => ({
          id: s.id,
          caption: s.caption,
          isOriginal: s.is_original,
        }))
      );
      setShots((check as any).screenshots);
      return;
    }

    console.log(
      '[ScreenshotGallery] ⚠️ No screenshots in prop, fetching from API for check:',
      check.id
    );
    (async () => {
      const res = await fetch(`/api/screenshots?check_id=${check.id}`);
      const { screenshots } = await res.json();
      console.log(
        '[ScreenshotGallery] ✅ Fetched screenshots from API:',
        screenshots?.length,
        'for check:',
        check.id
      );
      setShots(screenshots || []);
    })();
  }, [check.id, refreshKey, (check as any).screenshots]);

  // Fetch presigned URLs for screenshots
  useEffect(() => {
    (async () => {
      const urls: Record<string, { screenshot: string; thumbnail: string }> = {};
      for (const shot of shots) {
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
  }, [shots]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/screenshots/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setShots(prev => prev.filter(s => s.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete screenshot:', err);
    }
  };

  return (
    <div className="stack-sm">
      <div className="text-sm font-medium">Screenshots</div>
      <div className="flex gap-2 flex-wrap">
        {shots.map(s => {
          const urls = presignedUrls[s.id];
          const isOriginal = (s as any).is_original !== false; // Default to true if not set
          return (
            <figure key={s.id} className="w-40">
              <button
                className="w-40 h-28 bg-gray-100 border rounded overflow-hidden flex items-center justify-center relative group"
                onClick={() => setPreview(s)}
                draggable={true}
                onDragStart={e => {
                  e.dataTransfer.setData('screenshot-id', s.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                aria-label="Open screenshot"
              >
                {urls?.thumbnail ? (
                  <img
                    src={urls.thumbnail}
                    alt={s.caption || 'Screenshot'}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-gray-400">Loading...</span>
                )}

                {/* Badge for assigned screenshots */}
                {!isOriginal && (
                  <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs px-1 rounded">
                    Assigned
                  </div>
                )}
              </button>
              <figcaption className="mt-1 text-xs text-gray-700">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate flex-1">{s.caption || 'No caption'}</span>
                  <button
                    className="text-blue-600 hover:text-blue-900"
                    onClick={() => setAssigningScreenshot(s)}
                    title="Assign to other checks"
                  >
                    📋
                  </button>
                  <button
                    className="text-red-600 hover:text-red-900"
                    onClick={() => {
                      if (confirm('Delete screenshot?')) handleDelete(s.id);
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

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.caption || 'Screenshot'}
      >
        {preview && presignedUrls[preview.id]?.screenshot && (
          <img
            src={presignedUrls[preview.id].screenshot}
            alt={preview.caption || 'Screenshot'}
            className="max-h-[70vh] rounded"
          />
        )}
      </Modal>

      {/* Assignment Modal */}
      {assigningScreenshot && (
        <AssignScreenshotModal
          open={!!assigningScreenshot}
          onClose={() => setAssigningScreenshot(null)}
          screenshotId={assigningScreenshot.id}
          currentCheckId={check.id}
          assessmentId={check.assessment_id}
          onAssigned={() => {
            setAssigningScreenshot(null);
            // Refresh screenshots without reloading the page
            if (onScreenshotAssigned) {
              onScreenshotAssigned();
            }
          }}
        />
      )}
    </div>
  );
}
