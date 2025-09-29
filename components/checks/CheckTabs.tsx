'use client';
import { useMemo, useState } from 'react';
import clsx from 'clsx';

export function CheckTabs({
  checks,
  activeCheckId,
  onSelect,
}: {
  checks: any[];
  activeCheckId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return checks;
    return checks.filter(c => c.check_name?.toLowerCase().includes(q));
  }, [query, checks]);

  return (
    <div className="stack-sm">
      <input
        className="input"
        placeholder="Filter checks…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {filtered.map(c => {
          const symbol =
            c.latest_status === 'compliant'
              ? '✓'
              : c.latest_status === 'non_compliant'
                ? '❌'
                : c.status === 'analyzing'
                  ? '⚡'
                  : '○';
          const active = activeCheckId === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={clsx(
                'px-2 py-1 text-xs rounded border',
                active
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-800 border-gray-300'
              )}
              title={c.check_location || ''}
              aria-pressed={active}
            >
              {c.check_name} {symbol}
            </button>
          );
        })}
      </div>
      <div className="text-xs text-gray-600">
        {filtered.length} / {checks.length} checks
      </div>
    </div>
  );
}
