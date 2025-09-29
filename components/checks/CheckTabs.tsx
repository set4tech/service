'use client';
import clsx from 'clsx';

export function CheckTabs({ checks, activeCheckId, onSelect }: { checks: any[]; activeCheckId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {checks.map(c => {
        const symbol =
          c.latest_status === 'compliant' ? '✓' :
          c.latest_status === 'non_compliant' ? '❌' :
          c.status === 'analyzing' ? '⚡' :
          '○';
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={clsx(
              'px-2 py-1 text-xs rounded border',
              activeCheckId === c.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-800'
            )}
            title={c.check_location || ''}
          >
            {c.check_name} {symbol}
          </button>
        );
      })}
    </div>
  );
}