'use client';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { CloneCheckModal } from './modals/CloneCheckModal';

export function CheckList({
  checks,
  checkMode = 'section',
  activeCheckId,
  onSelect,
  assessmentId,
}: {
  checks: any[];
  checkMode?: 'section' | 'element';
  activeCheckId: string | null;
  onSelect: (id: string) => void;
  assessmentId?: string;
}) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
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

  // Debounced search effect
  useEffect(() => {
    const q = query.trim();

    // If no query, clear search results
    if (!q) {
      setSearchResults(null);
      return;
    }

    // Only do server-side search if assessmentId is provided
    if (!assessmentId) {
      return;
    }

    // Debounce search
    setSearching(true);
    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/assessments/${assessmentId}/checks?search=${encodeURIComponent(q)}`
        );
        if (response.ok) {
          const results = await response.json();
          setSearchResults(results);
        }
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, assessmentId]);

  const filtered = useMemo(() => {
    // Use search results if available, otherwise use passed checks
    const sourceChecks = searchResults !== null ? searchResults : checks;

    // Filter out checks marked as not_applicable
    // In element mode, also filter out child instances (show only templates and parents)
    return sourceChecks.filter(c => {
      if (c.manual_override === 'not_applicable') return false;

      // In element mode, only show parent checks (template or instances without parent)
      if (checkMode === 'element' && c.parent_check_id) return false;

      return true;
    });
  }, [searchResults, checks, checkMode]);

  // Group checks hierarchically
  const groupedChecks = useMemo(() => {
    const mainGroups = new Map<string, any[]>();

    if (checkMode === 'element') {
      // Group by element group name
      filtered.forEach(check => {
        const groupName = check.element_group_name || 'Other';
        if (!mainGroups.has(groupName)) {
          mainGroups.set(groupName, []);
        }
        mainGroups.get(groupName)!.push(check);
      });

      // Sort each group by instance number
      mainGroups.forEach(group => {
        group.sort((a, b) => a.instance_number - b.instance_number);
      });
    } else {
      // Group by section prefix (original logic)
      filtered.forEach(check => {
        const sectionNumber = check.code_section_number || '';
        const mainPrefix = sectionNumber.split('-')[0] || 'Other';

        if (!mainGroups.has(mainPrefix)) {
          mainGroups.set(mainPrefix, []);
        }
        mainGroups.get(mainPrefix)!.push(check);
      });

      // Sort each group by section number
      mainGroups.forEach(group => {
        group.sort((a, b) =>
          (a.code_section_number || '').localeCompare(b.code_section_number || '')
        );
      });
    }

    return Array.from(mainGroups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, checkMode]);

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
    // Prioritize manual override
    if (check.manual_override === 'compliant') return '✓';
    if (check.manual_override === 'non_compliant') return '✗';
    // Fall back to AI assessment
    if (check.latest_status === 'compliant') return '✓';
    if (check.latest_status === 'non_compliant') return '✗';
    if (check.status === 'analyzing') return '⚡';
    return '○';
  };

  const getStatusColor = (check: any) => {
    // Prioritize manual override
    if (check.manual_override === 'compliant') return 'text-green-600 font-bold';
    if (check.manual_override === 'non_compliant') return 'text-red-600 font-bold';
    // Fall back to AI assessment
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
        <div className="relative">
          <input
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Search checks and section content..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {searching && (
            <div className="absolute right-3 top-2.5 text-gray-400">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Check List */}
      <div className="flex-1">
        {groupedChecks.map(([mainPrefix, groupChecks]) => {
          const isExpanded = expandedSections.has(mainPrefix);

          return (
            <div key={mainPrefix} className="border-b border-gray-200">
              {/* Main Section/Element Header */}
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
                <span className="text-sm font-semibold text-gray-900">
                  {checkMode === 'element' ? mainPrefix : `Section ${mainPrefix}`}
                </span>
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
                              {checkMode === 'element' ? (
                                // Element mode: show instance label and screenshot count
                                <>
                                  <div className="flex items-start gap-1">
                                    {check.instance_number === 0 ? (
                                      <>
                                        <span className="text-sm text-blue-600 font-medium">
                                          Click + to add your first{' '}
                                          {check.element_group_name?.toLowerCase() || 'item'}
                                        </span>
                                        <button
                                          onClick={e => {
                                            e.stopPropagation();
                                          }}
                                          className="group relative"
                                          title="Element-based checking"
                                        >
                                          <svg
                                            width="14"
                                            height="14"
                                            className="text-gray-400 hover:text-gray-600"
                                            fill="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                                          </svg>
                                          <div className="hidden group-hover:block absolute left-0 top-6 w-64 bg-gray-900 text-white text-xs rounded p-2 shadow-lg z-50">
                                            Each {check.element_group_name?.toLowerCase()} you add
                                            will be assessed against all{' '}
                                            {check.element_sections?.length || 0} related code
                                            sections in one check.
                                          </div>
                                        </button>
                                      </>
                                    ) : (
                                      <span className="font-medium text-sm text-gray-900">
                                        {check.instance_label ||
                                          `Instance ${check.instance_number}`}
                                      </span>
                                    )}
                                    {check.screenshots?.length > 0 && (
                                      <span className="text-xs text-gray-500">
                                        ({check.screenshots.length}{' '}
                                        {check.screenshots.length === 1
                                          ? 'screenshot'
                                          : 'screenshots'}
                                        )
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {check.manual_override && (
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">
                                        Manual
                                      </span>
                                    )}
                                    {check.element_sections && check.instance_number === 0 ? (
                                      <span className="text-xs text-gray-500 italic">
                                        Covers {check.element_sections.length} code sections
                                      </span>
                                    ) : check.element_sections ? (
                                      <span className="text-xs text-gray-500">
                                        {check.element_sections.length} sections
                                      </span>
                                    ) : null}
                                    {hasInstances && (
                                      <span className="text-xs text-blue-600 font-medium">
                                        {check.instances.length}{' '}
                                        {check.instances.length === 1 ? 'added' : 'added'}
                                      </span>
                                    )}
                                  </div>
                                </>
                              ) : (
                                // Section mode: show section number and title (original)
                                <>
                                  <div className="flex items-start">
                                    <span className="font-medium text-sm text-gray-900 mr-2">
                                      {check.code_section_number}
                                    </span>
                                    <span className="text-sm text-gray-700 truncate">
                                      {check.code_section_title}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {check.manual_override && (
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">
                                        Manual
                                      </span>
                                    )}
                                    {hasInstances && (
                                      <span className="text-xs text-blue-600 font-medium">
                                        {check.instances.length}{' '}
                                        {check.instances.length === 1 ? 'instance' : 'instances'}
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </button>

                          {/* Clone Button - only show for non-template checks in section mode, or for any check in element mode */}
                          {(checkMode === 'section' || checkMode === 'element') && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setCloneModalCheck(check);
                              }}
                              className="px-3 flex items-center hover:bg-blue-50 transition-colors text-blue-600 hover:text-blue-700"
                              title={
                                checkMode === 'element' && check.instance_number === 0
                                  ? 'Create instance'
                                  : 'Add instance'
                              }
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
                          )}
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
                                  <div className="flex items-center gap-2">
                                    <div className="text-sm text-gray-700 font-medium">
                                      {instance.instance_label ||
                                        `Instance ${instance.instance_number}`}
                                    </div>
                                    {instance.manual_override && (
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">
                                        Manual
                                      </span>
                                    )}
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
