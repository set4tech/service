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

  // Group checks by section number prefix (e.g., "11B-1001" -> "11B-1001")
  const groupedChecks = useMemo(() => {
    const groups = new Map<string, any[]>();

    filtered.forEach(check => {
      // Get the main section number (before the first dot if it exists)
      const sectionNumber = check.code_section_number || '';
      const mainSection = sectionNumber.split('.')[0] || sectionNumber;

      if (!groups.has(mainSection)) {
        groups.set(mainSection, []);
      }
      groups.get(mainSection)!.push(check);
    });

    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
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
      <div className="p-3 border-b bg-gray-50">
        <input
          className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Search checks..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {/* Check List */}
      <div className="flex-1 overflow-y-auto">
        {groupedChecks.map(([section, sectionChecks]) => {
          const isExpanded = expandedSections.has(section) || sectionChecks.length === 1;
          const mainCheck =
            sectionChecks.find(c => c.code_section_number === section) || sectionChecks[0];

          return (
            <div key={section} className="border-b">
              {/* Section Header */}
              <button
                onClick={() => {
                  if (sectionChecks.length > 1) {
                    toggleSection(section);
                  } else {
                    onSelect(sectionChecks[0].id);
                  }
                }}
                className={clsx(
                  'w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors',
                  activeCheckId === mainCheck.id && 'bg-blue-50'
                )}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {sectionChecks.length > 1 && (
                    <svg
                      className={clsx(
                        'w-4 h-4 flex-shrink-0 transition-transform',
                        isExpanded && 'rotate-90'
                      )}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  )}
                  <span className={clsx('text-lg flex-shrink-0', getStatusColor(mainCheck))}>
                    {getStatusIcon(mainCheck)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {section} - {mainCheck.code_section_title}
                    </div>
                    {sectionChecks.length > 1 && (
                      <div className="text-xs text-gray-500">
                        {sectionChecks.length} subsections
                      </div>
                    )}
                  </div>
                </div>
              </button>

              {/* Subsection Items */}
              {isExpanded && sectionChecks.length > 1 && (
                <div className="bg-gray-50">
                  {sectionChecks.map(check => (
                    <button
                      key={check.id}
                      onClick={() => onSelect(check.id)}
                      className={clsx(
                        'w-full px-4 py-2 pl-12 flex items-center gap-2 text-left hover:bg-gray-100 transition-colors',
                        activeCheckId === check.id && 'bg-blue-100'
                      )}
                    >
                      <span className={clsx('text-sm', getStatusColor(check))}>
                        {getStatusIcon(check)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-700 truncate">
                          {check.code_section_number} - {check.code_section_title}
                        </div>
                        {check.check_location && (
                          <div className="text-xs text-gray-500 truncate">
                            {check.check_location}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="p-3 border-t bg-gray-50 text-xs text-gray-600">
        {filtered.length} of {checks.length} checks
      </div>
    </div>
  );
}
