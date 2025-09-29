'use client';
import { useEffect, useState } from 'react';
import type { Check, Screenshot } from '@/types/database';
import Modal from '@/components/ui/Modal';

export function ScreenshotGallery({ check, refreshKey }: { check: Check; refreshKey: number }) {
  const [shots, setShots] = useState<Screenshot[]>([]);
  const [preview, setPreview] = useState<Screenshot | null>(null);
  const [presignedUrls, setPresignedUrls] = useState<
    Record<string, { screenshot: string; thumbnail: string }>
  >({});

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/screenshots?check_id=${check.id}`);
      const { screenshots } = await res.json();
      setShots(screenshots || []);
    })();
  }, [check.id, refreshKey]);

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
          return (
            <figure key={s.id} className="w-40">
              <button
                className="w-40 h-28 bg-gray-100 border rounded overflow-hidden flex items-center justify-center"
                onClick={() => setPreview(s)}
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
              </button>
              <figcaption className="mt-1 text-xs text-gray-700 flex items-center justify-between">
                <span className="truncate">{s.caption || 'No caption'}</span>
                <button
                  className="text-xs text-red-600 hover:text-red-900"
                  onClick={() => {
                    if (confirm('Delete screenshot?')) handleDelete(s.id);
                  }}
                >
                  Delete
                </button>
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
    </div>
  );
}
