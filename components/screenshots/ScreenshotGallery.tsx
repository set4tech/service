'use client';
import { useEffect, useState } from 'react';
import type { Check, Screenshot } from '@/types/database';

export function ScreenshotGallery({ check, refreshKey }: { check: Check; refreshKey: number }) {
  const [shots, setShots] = useState<Screenshot[]>([]);
  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/screenshots?check_id=${check.id}`);
      const { screenshots } = await res.json();
      setShots(screenshots || []);
    })();
  }, [check.id, refreshKey]);

  return (
    <div>
      <div className="text-sm font-medium mb-2">Screenshots</div>
      <div className="flex gap-2 flex-wrap">
        {shots.map(s => (
          <figure key={s.id} className="w-40">
            <div className="w-40 h-28 bg-gray-100 border rounded overflow-hidden flex items-center justify-center text-xs">
              <span className="p-2 break-all">{s.thumbnail_url || s.screenshot_url}</span>
            </div>
            <figcaption className="mt-1 text-xs text-gray-700">
              {s.caption || 'No caption'}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
