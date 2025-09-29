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

  // Group checks by main section category
  const groupedChecks = useMemo(() => {
    const groups = new Map<string, Map<string, any[]>>();

    filtered.forEach(check => {
      const sectionNumber = check.code_section_number || '';
      // Get main category (e.g., "11B-1001" -> "11B-10")
      const mainCategory = sectionNumber.substring(0, 7); // "11B-10"
      const subSection = sectionNumber.split('.')[0]; // "11B-1001"

      if (!groups.has(mainCategory)) {
        groups.set(mainCategory, new Map());
      }

      const categoryGroups = groups.get(mainCategory)!;
      if (!categoryGroups.has(subSection)) {
        categoryGroups.set(subSection, []);
      }
      categoryGroups.get(subSection)!.push(check);
    });

    return groups;
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

  const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
    <svg
      className={clsx('w-3 h-3 text-gray-400 transition-transform', expanded && 'rotate-90')}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        fillRule="evenodd"
        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b bg-gray-50">
        <input
          className="w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Search checks..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {/* Check List */}
      <div className="flex-1 overflow-y-auto">
        {Array.from(groupedChecks.entries()).map(([mainCategory, subGroups]) => {
          const isCategoryExpanded = expandedSections.has(mainCategory);
          const categoryTitle = mainCategory.substring(0, 7) + 'XX';

          return (
            <div key={mainCategory} className="border-b">
              {/* Main Category Header */}
              <button
                onClick={() => toggleSection(mainCategory)}
                className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-gray-50 bg-white"
              >
                <ChevronIcon expanded={isCategoryExpanded} />
                <span className="text-sm font-medium text-gray-700">Section {categoryTitle}</span>
                <span className="text-xs text-gray-500 ml-auto">
                  {Array.from(subGroups.values()).reduce((acc, arr) => acc + arr.length, 0)} items
                </span>
              </button>

              {/* Sub-sections */}
              {isCategoryExpanded && (
                <div className="bg-gray-50">
                  {Array.from(subGroups.entries()).map(([subSection, sectionChecks]) => {
                    const isSubExpanded = expandedSections.has(subSection);
                    const mainCheck = sectionChecks[0];

                    return (
                      <div key={subSection} className="border-t border-gray-200">
                        {/* Sub-section Header */}
                        <button
                          onClick={() => {
                            if (sectionChecks.length > 1) {
                              toggleSection(subSection);
                            } else {
                              onSelect(sectionChecks[0].id);
                            }
                          }}
                          className={clsx(
                            'w-full px-6 py-2 flex items-center gap-2 text-left hover:bg-gray-100',
                            activeCheckId === mainCheck.id && 'bg-blue-50'
                          )}
                        >
                          {sectionChecks.length > 1 && <ChevronIcon expanded={isSubExpanded} />}
                          {sectionChecks.length === 1 && <div className="w-3" />}
                          <span className={clsx('text-sm', getStatusColor(mainCheck))}>
                            {getStatusIcon(mainCheck)}
                          </span>
                          <span className="text-sm text-gray-700">{subSection}</span>
                          <span className="text-sm text-gray-600 truncate flex-1">
                            {mainCheck.code_section_title}
                          </span>
                          {sectionChecks.length > 1 && (
                            <span className="text-xs text-gray-500">{sectionChecks.length}</span>
                          )}
                        </button>

                        {/* Individual Checks */}
                        {isSubExpanded && sectionChecks.length > 1 && (
                          <div className="bg-white">
                            {sectionChecks.map(check => (
                              <button
                                key={check.id}
                                onClick={() => onSelect(check.id)}
                                className={clsx(
                                  'w-full px-9 py-1.5 flex items-center gap-2 text-left hover:bg-gray-50',
                                  activeCheckId === check.id && 'bg-blue-50'
                                )}
                              >
                                <span className={clsx('text-xs', getStatusColor(check))}>
                                  {getStatusIcon(check)}
                                </span>
                                <span className="text-xs text-gray-600">
                                  {check.code_section_number}
                                </span>
                                <span className="text-xs text-gray-700 truncate flex-1">
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
