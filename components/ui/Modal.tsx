'use client';
import { PropsWithChildren, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({
  open,
  onClose,
  title,
  children,
}: PropsWithChildren<{ open: boolean; onClose: () => void; title?: string }>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-cardMd w-full max-w-3xl p-4">
          {title && <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>}
          <div>{children}</div>
          <div className="mt-4 flex justify-end">
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
