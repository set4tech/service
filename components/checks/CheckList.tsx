'use client';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { CloneCheckModal } from './modals/CloneCheckModal';

interface CheckListProps {
  checks: any[];
  checkMode?: 'section' | 'element';
  activeCheckId: string | null;
  onSelect: (id: string) => void;
  assessmentId?: string;
  onCheckAdded?: (newCheck: any) => void;
  onCheckDeleted?: (checkId: string) => void;
}

export function CheckList({
  checks,
  checkMode = 'section',
  activeCheckId,
  onSelect,
  assessmentId,
  onCheckAdded,
  onCheckDeleted,
}: CheckListProps) {
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
  const [deletingCheckId, setDeletingCheckId] = useState<string | null>(null);
  const [editingCheckId, setEditingCheckId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [showUnassessedOnly, setShowUnassessedOnly] = useState(false);

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
    let result = sourceChecks.filter(c => {
      if (c.manual_override === 'not_applicable') return false;
      return true;
    });

    // Filter by unassessed status if enabled
    if (showUnassessedOnly) {
      result = result.filter(c => {
        // Check is assessed if it has manual_override or latest_status
        const isAssessed = c.manual_override || c.latest_status;

        // For element checks, also check if all sections have overrides
        if (c.check_type === 'element' && c.has_section_overrides) {
          return false; // Has section overrides, so it's assessed
        }

        return !isAssessed;
      });
    }

    return result;
  }, [searchResults, checks, checkMode, showUnassessedOnly]);

  // Group checks hierarchically
  const groupedChecks = useMemo(() => {
    const mainGroups = new Map<string, any[]>();

    if (checkMode === 'element') {
      // Group by element group name - treat all instances as peers (no parent/child)
      filtered.forEach(check => {
        // Skip templates (instance_number === 0)
        if (check.instance_number === 0) {
          return;
        }

        const groupName = check.element_group_name || 'Other';
        if (!mainGroups.has(groupName)) {
          mainGroups.set(groupName, []);
        }

        // Add the check itself (all element checks are peers now)
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

  const handleCloneSuccess = (newCheck: any) => {
    setCloneModalCheck(null);

    // If parent provides a callback, use it to add the check
    if (onCheckAdded) {
      onCheckAdded(newCheck);
      // Select the new check
      onSelect(newCheck.id);
    } else {
      // Fallback to full page reload if no callback provided
      window.location.reload();
    }
  };

  const handleDeleteInstance = async (instanceId: string, instanceLabel: string) => {
    if (!confirm(`Delete "${instanceLabel}"? This cannot be undone.`)) {
      return;
    }

    setDeletingCheckId(instanceId);

    try {
      const response = await fetch(`/api/checks/${instanceId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete instance');
      }

      // Call parent callback to update state
      if (onCheckDeleted) {
        onCheckDeleted(instanceId);
      } else {
        // Fallback to reload if no callback provided
        window.location.reload();
      }
    } catch (error: any) {
      console.error('Delete error:', error);
      alert(`Failed to delete: ${error.message}`);
    } finally {
      setDeletingCheckId(null);
    }
  };

  const handleStartEdit = (checkId: string, currentLabel: string) => {
    setEditingCheckId(checkId);
    setEditingLabel(currentLabel);
  };

  const handleCancelEdit = () => {
    setEditingCheckId(null);
    setEditingLabel('');
  };

  const handleSaveEdit = async (checkId: string) => {
    const newLabel = editingLabel.trim();
    if (!newLabel) {
      alert('Label cannot be empty');
      return;
    }

    try {
      const response = await fetch(`/api/checks/${checkId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_label: newLabel }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update label');
      }

      const { check } = await response.json();

      // Update the check in the parent state
      if (onCheckAdded) {
        onCheckAdded(check);
      } else {
        window.location.reload();
      }

      setEditingCheckId(null);
      setEditingLabel('');
    } catch (error: any) {
      console.error('Update error:', error);
      alert(`Failed to update: ${error.message}`);
    }
  };

  const getStatusIcon = (check: any) => {
    // Check if currently processing (analyzing)
    if (check.status === 'processing' || check.status === 'analyzing') {
      return (
        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
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
      );
    }
    // Prioritize manual override
    if (check.manual_override === 'compliant') return '✓';
    if (check.manual_override === 'non_compliant') return '✗';
    if (check.manual_override === 'insufficient_information') return '?';
    // Fall back to AI assessment
    if (check.latest_status === 'compliant') return '✓';
    if (check.latest_status === 'non_compliant') return '✗';
    return '○';
  };

  const getStatusColor = (check: any) => {
    // Check if currently processing (analyzing)
    if (check.status === 'processing' || check.status === 'analyzing') return 'text-blue-600';
    // Prioritize manual override
    if (check.manual_override === 'compliant') return 'text-green-600 font-bold';
    if (check.manual_override === 'non_compliant') return 'text-red-600 font-bold';
    if (check.manual_override === 'insufficient_information') return 'text-yellow-600 font-bold';
    // Fall back to AI assessment
    if (check.latest_status === 'compliant') return 'text-green-600';
    if (check.latest_status === 'non_compliant') return 'text-red-600';
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

        {/* Unassessed Only Filter */}
        <div className="mt-2">
          <label className="flex items-center text-sm text-gray-700 cursor-pointer hover:text-gray-900">
            <input
              type="checkbox"
              checked={showUnassessedOnly}
              onChange={e => setShowUnassessedOnly(e.target.checked)}
              className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Show unassessed only</span>
          </label>
        </div>
      </div>

      {/* Check List */}
      <div className="flex-1">
        {groupedChecks.map(([mainPrefix, groupChecks]) => {
          const isExpanded = expandedSections.has(mainPrefix);

          // Map element group names to slugs for API calls
          const elementGroupSlugMap: Record<string, string> = {
            Doors: 'doors',
            Bathrooms: 'bathrooms',
            Kitchens: 'kitchens',
            'Exit Signage': 'exit-signage',
            'Assisted Listening': 'assisted-listening',
            Elevators: 'elevators',
            'Elevator Signage': 'elevator-signage',
            'Parking Signage': 'parking-signage',
            Ramps: 'ramps',
            'Changes in Level': 'changes-in-level',
            'Turning Spaces': 'turning-spaces',
          };

          const elementGroupSlug = checkMode === 'element' ? elementGroupSlugMap[mainPrefix] : null;

          // All groupChecks are already instances (templates filtered out during grouping)
          const displayChecks = groupChecks;

          return (
            <div key={mainPrefix} className="border-b border-gray-200">
              {/* Main Section/Element Header */}
              <div className="w-full flex items-center hover:bg-gray-50 transition-colors">
                <button
                  onClick={() => toggleSection(mainPrefix)}
                  className="flex-1 px-3 py-2 flex items-center text-left"
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
                  <span className="ml-auto text-xs text-gray-500">({displayChecks.length})</span>
                </button>

                {/* Add Element Button (only in element mode) */}
                {checkMode === 'element' && elementGroupSlug && (
                  <button
                    onClick={async e => {
                      e.stopPropagation();

                      // Call create-element API directly (no template needed)
                      try {
                        const res = await fetch('/api/checks/create-element', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            assessmentId,
                            elementGroupSlug,
                          }),
                        });

                        if (res.ok) {
                          const { check } = await res.json();
                          onCheckAdded?.(check);
                        } else {
                          const data = await res.json();
                          alert(
                            `Failed to create element instance: ${data.error || 'Unknown error'}`
                          );
                        }
                      } catch (error) {
                        console.error('Error creating element instance:', error);
                        alert('Failed to create element instance');
                      }
                    }}
                    className="px-3 py-2 flex items-center hover:bg-blue-50 transition-colors text-blue-600 hover:text-blue-700"
                    title={`Add ${mainPrefix.toLowerCase().replace(/s$/, '')}`}
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

              {/* Individual Checks */}
              {isExpanded && (
                <div className="bg-gray-50">
                  {displayChecks.map(check => {
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
                            onDragOver={e => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'copy';
                            }}
                            onDrop={async e => {
                              e.preventDefault();
                              const screenshotId = e.dataTransfer.getData('screenshot-id');

                              if (!screenshotId) return;

                              try {
                                const res = await fetch(`/api/screenshots/${screenshotId}/assign`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ checkIds: [check.id] }),
                                });

                                if (res.ok) {
                                  console.log(
                                    'Screenshot assigned successfully to check:',
                                    check.id
                                  );
                                  // Could show a toast notification here
                                } else {
                                  console.error('Failed to assign screenshot');
                                }
                              } catch (error) {
                                console.error('Failed to assign screenshot:', error);
                              }
                            }}
                            className={clsx(
                              'flex-1 px-4 py-2 flex items-start text-left hover:bg-gray-100 cursor-pointer transition-colors',
                              activeCheckId === check.id &&
                                'bg-blue-100 border-l-4 border-blue-500 hover:bg-blue-200',
                              !hasInstances && 'pl-6'
                            )}
                          >
                            <span
                              className={clsx(
                                'mt-0.5 mr-2 text-sm',
                                getStatusColor(check),
                                check.status === 'analyzing' && 'animate-bounce'
                              )}
                              style={
                                check.status === 'analyzing'
                                  ? { animationDuration: '2s' }
                                  : undefined
                              }
                            >
                              {getStatusIcon(check)}
                            </span>
                            <div className="flex-1 min-w-0">
                              {checkMode === 'element' ? (
                                // Element mode: show instance label and screenshot count
                                <>
                                  <div className="flex items-start gap-1">
                                    {editingCheckId === check.id ? (
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={editingLabel}
                                          onChange={e => setEditingLabel(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              e.currentTarget.blur();
                                              handleSaveEdit(check.id);
                                            } else if (e.key === 'Escape') {
                                              e.preventDefault();
                                              handleCancelEdit();
                                            }
                                          }}
                                          autoFocus
                                          className="font-medium text-sm text-gray-900 border border-blue-500 rounded px-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        />
                                      </div>
                                    ) : (
                                      <span
                                        className="font-medium text-sm text-gray-900 cursor-pointer hover:text-blue-600"
                                        onClick={e => {
                                          e.stopPropagation();
                                          handleStartEdit(
                                            check.id,
                                            check.instance_label ||
                                              `Instance ${check.instance_number}`
                                          );
                                        }}
                                        title="Click to edit"
                                      >
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
                                    {check.element_sections && (
                                      <span className="text-xs text-gray-500">
                                        {check.element_sections.length} sections
                                      </span>
                                    )}
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

                          {/* Clone Button - only show in section mode */}
                          {checkMode === 'section' && (
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
                          )}

                          {/* Delete Button - show for instances in element mode */}
                          {checkMode === 'element' && check.instance_number > 0 && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                handleDeleteInstance(
                                  check.id,
                                  check.instance_label || `Instance ${check.instance_number}`
                                );
                              }}
                              disabled={deletingCheckId === check.id}
                              className="px-3 flex items-center hover:bg-red-50 transition-colors text-red-600 hover:text-red-700 disabled:opacity-50"
                              title="Delete instance"
                            >
                              {deletingCheckId === check.id ? (
                                <svg
                                  className="animate-spin h-4 w-4"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
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
                              ) : (
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
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Instance List */}
                        {hasInstances && isInstancesExpanded && (
                          <div className="bg-gray-100 border-t border-gray-200">
                            {check.instances.map((instance: any) => (
                              <div
                                key={instance.id}
                                className={clsx(
                                  'flex items-start hover:bg-gray-200 transition-colors border-b border-gray-200 last:border-b-0 group',
                                  activeCheckId === instance.id &&
                                    'bg-blue-50 border-l-4 border-blue-400'
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => onSelect(instance.id)}
                                  onDragOver={e => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'copy';
                                  }}
                                  onDrop={async e => {
                                    e.preventDefault();
                                    const screenshotId = e.dataTransfer.getData('screenshot-id');

                                    if (!screenshotId) return;

                                    try {
                                      const res = await fetch(
                                        `/api/screenshots/${screenshotId}/assign`,
                                        {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ checkIds: [instance.id] }),
                                        }
                                      );

                                      if (res.ok) {
                                        console.log(
                                          'Screenshot assigned successfully to instance:',
                                          instance.id
                                        );
                                        // Could show a toast notification here
                                      } else {
                                        console.error('Failed to assign screenshot');
                                      }
                                    } catch (error) {
                                      console.error('Failed to assign screenshot:', error);
                                    }
                                  }}
                                  className={clsx(
                                    'flex-1 pl-12 pr-4 py-2 flex items-start text-left cursor-pointer',
                                    activeCheckId === instance.id && 'hover:bg-blue-100'
                                  )}
                                >
                                  <span
                                    className={clsx(
                                      'mt-0.5 mr-2 text-sm',
                                      getStatusColor(instance),
                                      instance.status === 'analyzing' && 'animate-bounce'
                                    )}
                                    style={
                                      instance.status === 'analyzing'
                                        ? { animationDuration: '2s' }
                                        : undefined
                                    }
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

                                {/* Delete Button */}
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleDeleteInstance(
                                      instance.id,
                                      instance.instance_label ||
                                        `Instance ${instance.instance_number}`
                                    );
                                  }}
                                  disabled={deletingCheckId === instance.id}
                                  className="px-3 py-2 flex items-center hover:bg-red-50 transition-colors text-red-600 hover:text-red-700 opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                  title="Delete instance"
                                >
                                  {deletingCheckId === instance.id ? (
                                    <svg
                                      className="animate-spin h-4 w-4"
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                    >
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
                                  ) : (
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
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      />
                                    </svg>
                                  )}
                                </button>
                              </div>
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
