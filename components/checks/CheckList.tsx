'use client';
import { useEffect, useMemo, useState } from 'react';
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
  console.log('CheckList rendered with', checks.length, 'checks, activeCheckId:', activeCheckId);
  const [query, setQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    // Auto-expand first section by default
    if (checks.length > 0) {
      const firstSection = checks[0]?.code_section_number?.split('-')[0] || '';
      return new Set(firstSection ? [firstSection] : []);
    }
    return new Set();
  });

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

  // Auto-expand first section when checks change
  useEffect(() => {
    if (checks.length > 0 && expandedSections.size === 0) {
      const firstSection = groupedChecks[0]?.[0];
      if (firstSection) {
        setExpandedSections(new Set([firstSection]));
      }
    }
  }, [checks.length, groupedChecks]);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-gray-200">
        <input
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Search checks..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {/* Check List */}
      <div className="flex-1 overflow-y-auto">
        {groupedChecks.map(([mainPrefix, groupChecks]) => {
          const isExpanded = expandedSections.has(mainPrefix);

          return (
            <div key={mainPrefix} className="border-b border-gray-200">
              {/* Main Section Header */}
              <button
                onClick={() => {
                  console.log('Section toggle clicked:', mainPrefix);
                  toggleSection(mainPrefix);
                }}
                className="w-full px-3 py-2 flex items-center text-left hover:bg-gray-50 transition-colors"
              >
                <svg
                  width="10"
                  height="10"
                  className={clsx(
                    'mr-2 transition-transform text-gray-500',
                    isExpanded && 'rotate-90'
                  )}
                  fill="currentColor"
                  viewBox="0 0 10 10"
                >
                  <path d="M2 2l5 3-5 3z" />
                </svg>
                <span className="text-sm font-semibold text-gray-900">Section {mainPrefix}</span>
                <span className="ml-auto text-xs text-gray-500">({groupChecks.length})</span>
              </button>

              {/* Individual Checks */}
              {isExpanded && (
                <div className="bg-gray-50">
                  {groupChecks.map(check => {
                    return (
                      <div key={check.id} className="border-b border-gray-100 last:border-b-0">
                        {/* Check Header */}
                        <button
                          type="button"
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('Check clicked:', check.id, check.code_section_number);
                            onSelect(check.id);
                          }}
                          className={clsx(
                            'w-full px-4 py-2 flex items-start text-left hover:bg-gray-100 cursor-pointer transition-colors',
                            activeCheckId === check.id && 'bg-blue-500 text-white hover:bg-blue-600'
                          )}
                        >
                          <span className={clsx('mt-0.5 mr-2 text-sm', getStatusColor(check))}>
                            {getStatusIcon(check)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start">
                              <span className="font-medium text-sm text-gray-900 mr-2">
                                {check.code_section_number}
                              </span>
                              <span className="text-sm text-gray-700 truncate">
                                {check.code_section_title}
                              </span>
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-600">
          {filtered.length} of {checks.length} checks
        </div>
      </div>
    </div>
  );
}
