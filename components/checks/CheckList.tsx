'use client';
import { useMemo, useState } from 'react';
import clsx from 'clsx';

export function CheckList({
  checks,
  activeCheckId,
  onSelect,
}: {
  checks: any[];
  activeCheckId: string | null;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return checks;
    return checks.filter(
      c =>
        c.check_name?.toLowerCase().includes(q) ||
        c.code_section_number?.toLowerCase().includes(q) ||
        c.code_section_title?.toLowerCase().includes(q)
    );
  }, [query, checks]);

  // Group checks hierarchically
  const groupedChecks = useMemo(() => {
    const mainGroups = new Map<string, any[]>();

    filtered.forEach(check => {
      const sectionNumber = check.code_section_number || '';
      // Group by main prefix (e.g., "11B")
      const mainPrefix = sectionNumber.split('-')[0] || 'Other';

      if (!mainGroups.has(mainPrefix)) {
        mainGroups.set(mainPrefix, []);
      }
      mainGroups.get(mainPrefix)!.push(check);
    });

    // Sort each group
    mainGroups.forEach(group => {
      group.sort((a, b) =>
        (a.code_section_number || '').localeCompare(b.code_section_number || '')
      );
    });

    return Array.from(mainGroups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const getStatusIcon = (check: any) => {
    if (check.latest_status === 'compliant') return '✓';
    if (check.latest_status === 'non_compliant') return '✗';
    if (check.status === 'analyzing') return '⚡';
    return '○';
  };

  const getStatusColor = (check: any) => {
    if (check.latest_status === 'compliant') return 'text-green-600';
    if (check.latest_status === 'non_compliant') return 'text-red-600';
    if (check.status === 'analyzing') return 'text-yellow-600';
    return 'text-gray-400';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-2 border-b">
        <input
          className="w-full px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Search checks..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {/* Check List */}
      <div className="flex-1 overflow-y-auto text-xs">
        {groupedChecks.map(([mainPrefix, groupChecks]) => {
          const isExpanded = expandedSections.has(mainPrefix);

          return (
            <div key={mainPrefix} className="border-b">
              {/* Main Section Header */}
              <button
                onClick={() => toggleSection(mainPrefix)}
                className="w-full px-2 py-1.5 flex items-center text-left hover:bg-gray-50"
              >
                <svg
                  width="8"
                  height="8"
                  className={clsx('mr-1 transition-transform', isExpanded && 'rotate-90')}
                  fill="currentColor"
                  viewBox="0 0 8 8"
                >
                  <path d="M2 1l4 3-4 3z" />
                </svg>
                <span className="font-medium">Section {mainPrefix}</span>
                <span className="ml-auto text-gray-500">({groupChecks.length})</span>
              </button>

              {/* Individual Checks */}
              {isExpanded && (
                <div className="bg-gray-50">
                  {groupChecks.map(check => (
                    <button
                      key={check.id}
                      onClick={() => onSelect(check.id)}
                      className={clsx(
                        'w-full px-4 py-1 flex items-center text-left hover:bg-gray-100',
                        activeCheckId === check.id && 'bg-blue-100'
                      )}
                    >
                      <span className={clsx('mr-2', getStatusColor(check))}>
                        {getStatusIcon(check)}
                      </span>
                      <span className="font-medium">{check.code_section_number}</span>
                      <span className="ml-1 text-gray-600 truncate">
                        {check.code_section_title}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="p-2 border-t bg-gray-50 text-xs text-gray-600">
        {filtered.length} of {checks.length} checks
      </div>
    </div>
  );
}
