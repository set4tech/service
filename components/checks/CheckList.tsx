'use client';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { CloneCheckModal } from './modals/CloneCheckModal';

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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    // Auto-expand first section by default
    if (checks.length > 0) {
      const firstSection = checks[0]?.code_section_number?.split('-')[0] || '';
      return new Set(firstSection ? [firstSection] : []);
    }
    return new Set();
  });
  const [expandedInstances, setExpandedInstances] = useState<Set<string>>(new Set());
  const [cloneModalCheck, setCloneModalCheck] = useState<any | null>(null);

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

  const toggleInstances = (checkId: string) => {
    const newExpanded = new Set(expandedInstances);
    if (newExpanded.has(checkId)) {
      newExpanded.delete(checkId);
    } else {
      newExpanded.add(checkId);
    }
    setExpandedInstances(newExpanded);
  };

  const handleCloneSuccess = () => {
    // Reload the page to fetch updated checks
    window.location.reload();
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
      <div className="flex-1">
        {groupedChecks.map(([mainPrefix, groupChecks]) => {
          const isExpanded = expandedSections.has(mainPrefix);

          return (
            <div key={mainPrefix} className="border-b border-gray-200">
              {/* Main Section Header */}
              <button
                onClick={() => toggleSection(mainPrefix)}
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
                    const hasInstances = check.instances && check.instances.length > 0;
                    const isInstancesExpanded = expandedInstances.has(check.id);

                    return (
                      <div key={check.id} className="border-b border-gray-100 last:border-b-0">
                        {/* Parent Check */}
                        <div className="flex items-stretch">
                          {/* Expand/Collapse button (only if has instances) */}
                          {hasInstances && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                toggleInstances(check.id);
                              }}
                              className="px-2 flex items-center hover:bg-gray-200 transition-colors"
                            >
                              <svg
                                width="8"
                                height="8"
                                className={clsx(
                                  'transition-transform text-gray-500',
                                  isInstancesExpanded && 'rotate-90'
                                )}
                                fill="currentColor"
                                viewBox="0 0 10 10"
                              >
                                <path d="M2 2l5 3-5 3z" />
                              </svg>
                            </button>
                          )}

                          {/* Check Button */}
                          <button
                            type="button"
                            onClick={() => onSelect(check.id)}
                            className={clsx(
                              'flex-1 px-4 py-2 flex items-start text-left hover:bg-gray-100 cursor-pointer transition-colors',
                              activeCheckId === check.id &&
                                'bg-blue-100 border-l-4 border-blue-500 hover:bg-blue-200',
                              !hasInstances && 'pl-6'
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
                              {hasInstances && (
                                <span className="text-xs text-blue-600 font-medium mt-0.5">
                                  {check.instances.length}{' '}
                                  {check.instances.length === 1 ? 'instance' : 'instances'}
                                </span>
                              )}
                            </div>
                          </button>

                          {/* Clone Button */}
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setCloneModalCheck(check);
                            }}
                            className="px-3 flex items-center hover:bg-blue-50 transition-colors text-blue-600 hover:text-blue-700"
                            title="Add instance"
                          >
                            <svg
                              width="16"
                              height="16"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                          </button>
                        </div>

                        {/* Instance List */}
                        {hasInstances && isInstancesExpanded && (
                          <div className="bg-gray-100 border-t border-gray-200">
                            {check.instances.map((instance: any) => (
                              <button
                                key={instance.id}
                                type="button"
                                onClick={() => onSelect(instance.id)}
                                className={clsx(
                                  'w-full pl-12 pr-4 py-2 flex items-start text-left hover:bg-gray-200 cursor-pointer transition-colors border-b border-gray-200 last:border-b-0',
                                  activeCheckId === instance.id &&
                                    'bg-blue-50 border-l-4 border-blue-400 hover:bg-blue-100'
                                )}
                              >
                                <span
                                  className={clsx('mt-0.5 mr-2 text-sm', getStatusColor(instance))}
                                >
                                  {getStatusIcon(instance)}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-gray-700 font-medium">
                                    {instance.instance_label ||
                                      `Instance ${instance.instance_number}`}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-0.5">
                                    {instance.code_section_number}
                                  </div>
                                </div>
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
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-600">
          {filtered.length} of {checks.length} checks
        </div>
      </div>

      {/* Clone Modal */}
      {cloneModalCheck && (
        <CloneCheckModal
          checkId={cloneModalCheck.id}
          checkName={`${cloneModalCheck.code_section_number} - ${cloneModalCheck.code_section_title}`}
          onClose={() => setCloneModalCheck(null)}
          onSuccess={handleCloneSuccess}
        />
      )}
    </div>
  );
}
