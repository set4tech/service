'use client';
import { useEffect, useState } from 'react';
import type { Check, Screenshot } from '@/types/database';
import Modal from '@/components/ui/Modal';
import { AssignScreenshotModal } from './AssignScreenshotModal';

const ELEMENT_TYPE_COLORS: Record<string, string> = {
  doors: 'bg-blue-600',
  bathrooms: 'bg-purple-600',
  kitchens: 'bg-orange-600',
  'exit-signage': 'bg-red-600',
  'assisted-listening': 'bg-indigo-600',
  elevators: 'bg-cyan-600',
  'elevator-signage': 'bg-teal-600',
  'parking-signage': 'bg-yellow-600',
  ramps: 'bg-green-600',
  'changes-in-level': 'bg-pink-600',
  'turning-spaces': 'bg-violet-600',
};

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
  const [filter, setFilter] = useState<'all' | 'plan' | 'elevation'>('all');
  const [preview, setPreview] = useState<Screenshot | null>(null);
  const [assigningScreenshot, setAssigningScreenshot] = useState<Screenshot | null>(null);
  const [presignedUrls, setPresignedUrls] = useState<
    Record<string, { screenshot: string; thumbnail: string }>
  >({});

  // Initialize from check.screenshots if available
  useEffect(() => {
    if ((check as any).screenshots) {
      console.log(
        '[ScreenshotGallery] 📦 Using screenshots from check prop:',
        (check as any).screenshots.length
      );
      setShots((check as any).screenshots);
    }
  }, [check.id]);

  // Only refetch when refreshKey changes (i.e., when a screenshot is modified)
  useEffect(() => {
    if (refreshKey === 0) return; // Skip initial render

    console.log(
      '[ScreenshotGallery] 📡 Refetching screenshots due to refreshKey change:',
      refreshKey
    );
    (async () => {
      const res = await fetch(`/api/screenshots?check_id=${check.id}`);
      const { screenshots } = await res.json();
      console.log('[ScreenshotGallery] ✅ Fetched screenshots:', screenshots?.length);
      setShots(screenshots || []);
    })();
  }, [refreshKey, check.id]);

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

  const filteredShots = shots.filter(s => {
    if (filter === 'all') return true;
    return s.screenshot_type === filter;
  });

  return (
    <div className="stack-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Screenshots & Elevations</div>

        {/* Filter Toggle */}
        {shots.length > 0 && (
          <div className="flex gap-1 border rounded overflow-hidden">
            {(['all', 'plan', 'elevation'] as const).map(f => (
              <button
                key={f}
                className={`px-3 py-1 text-xs font-medium ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'plan' ? 'Plans' : 'Elevations'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">
        {filteredShots.map(s => {
          const urls = presignedUrls[s.id];
          const isOriginal = (s as any).is_original !== false; // Default to true if not set
          const elementGroup = (s as any).element_groups; // Now loaded with screenshot
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

                {/* Element Type Badge for elevations */}
                {s.screenshot_type === 'elevation' && elementGroup && (
                  <div
                    className={`absolute top-1 left-1 ${
                      ELEMENT_TYPE_COLORS[elementGroup.slug] || 'bg-gray-600'
                    } text-white text-xs px-2 py-0.5 rounded`}
                  >
                    {elementGroup.name}
                  </div>
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
