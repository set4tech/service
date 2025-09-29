'use client';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type Toast = { id: number; text: string };
const Ctx = createContext<{ push: (text: string) => void } | null>(null);
let idSeq = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string) => {
    const id = idSeq++;
    setItems(prev => [...prev, { id, text }]);
    setTimeout(() => setItems(prev => prev.filter(i => i.id !== id)), 2500);
  }, []);
  const value = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {createPortal(
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {items.map(i => (
            <div
              key={i.id}
              className="bg-gray-900 text-white text-sm px-3 py-2 rounded shadow-card"
            >
              {i.text}
            </div>
          ))}
        </div>,
        document.body
      )}
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
