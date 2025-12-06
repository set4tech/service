'use client';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { CloneCheckModal } from './modals/CloneCheckModal';
import { BulkActionBar } from './BulkActionBar';
import { ComplianceOverrideStatus } from '@/types/database';

// Natural sort comparator for section numbers (handles numeric parts correctly)
function naturalCompare(a: string, b: string): number {
  const regex = /(\d+)|(\D+)/g;
  const aParts = a.match(regex) || [];
  const bParts = b.match(regex) || [];

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] || '';
    const bPart = bParts[i] || '';

    const aNum = parseInt(aPart, 10);
    const bNum = parseInt(bPart, 10);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      // Both are numbers, compare numerically
      if (aNum !== bNum) return aNum - bNum;
    } else {
      // At least one is not a number, compare as strings
      if (aPart !== bPart) return aPart.localeCompare(bPart);
    }
  }

  return 0;
}

interface CheckListProps {
  checks: any[];
  checkMode?: 'section' | 'element';
  activeCheckId: string | null;
  onSelect: (id: string) => void;
  assessmentId?: string;
  onCheckAdded?: (newCheck: any) => void;
  onInstanceDeleted?: (elementInstanceId: string) => void;
  refetchChecks?: (includeExcluded?: boolean) => Promise<void>;
}

export function CheckList({
  checks,
  checkMode = 'section',
  activeCheckId,
  onSelect,
  assessmentId,
  onCheckAdded,
  onInstanceDeleted,
  refetchChecks,
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
  const [showExcluded, setShowExcluded] = useState(false);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);

  // Bulk selection state
  const [selectedCheckIds, setSelectedCheckIds] = useState<Set<string>>(new Set());
  const [bulkOperationLoading, setBulkOperationLoading] = useState(false);
  const [lastClickedCheckId, setLastClickedCheckId] = useState<string | null>(null);

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
        const includeExcludedParam = showExcluded ? '&include_excluded=true' : '';
        const response = await fetch(
          `/api/assessments/${assessmentId}/checks?mode=${checkMode}&search=${encodeURIComponent(q)}${includeExcludedParam}`
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
  }, [query, assessmentId, checkMode, showExcluded]);

  // Refetch checks when showExcluded changes (only when no search query)
  useEffect(() => {
    if (refetchChecks && !query.trim()) {
      refetchChecks(showExcluded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showExcluded]);

  // Extract chapter from section number
  // Examples: "11B-403.5" -> "11B", "803.2" -> "8", "1022.3.4" -> "10", "900" -> "9"
  const extractChapter = (sectionNumber: string): string | null => {
    if (!sectionNumber) return null;

    // Handle hyphenated format: "11B-403.5" -> "11B" (everything before hyphen)
    if (sectionNumber.includes('-')) {
      return sectionNumber.split('-')[0];
    }

    // Handle non-hyphenated format: extract chapter from section number
    // "803.2" -> "8", "1022.3.4" -> "10", "900" -> "9"
    const sectionMatch = sectionNumber.match(/^(\d+)/);
    if (!sectionMatch) return null;

    const sectionNum = sectionMatch[1];

    // Chapter is first 1 or 2 digits (depending on if >= 1000)
    if (parseInt(sectionNum) >= 1000) {
      return sectionNum.substring(0, 2); // "1022" -> "10"
    } else {
      return sectionNum.substring(0, 1); // "803" -> "8", "900" -> "9"
    }
  };

  // Get available chapters from checks, grouped by code
  const availableChapters = useMemo(() => {
    const chaptersByCode = new Map<string, Set<string>>();

    checks.forEach(check => {
      const chapter = extractChapter(check.code_section_number);
      if (!chapter) return;

      // Get code title from check (if available from join)
      const codeTitle = check.code_title || 'Unknown Code';

      if (!chaptersByCode.has(codeTitle)) {
        chaptersByCode.set(codeTitle, new Set());
      }
      chaptersByCode.get(codeTitle)!.add(chapter);
    });

    // Convert to array and sort chapters within each code
    const result = Array.from(chaptersByCode.entries()).map(([codeTitle, chapters]) => ({
      codeTitle,
      chapters: Array.from(chapters).sort((a, b) => naturalCompare(a, b)),
    }));

    // Sort codes alphabetically
    return result.sort((a, b) => a.codeTitle.localeCompare(b.codeTitle));
  }, [checks]);

  const filtered = useMemo(() => {
    // Use search results if available, otherwise use passed checks
    const sourceChecks = searchResults !== null ? searchResults : checks;

    // Filter out checks marked as not_applicable
    let result = sourceChecks.filter(c => {
      if (c.manual_status === 'not_applicable') return false;
      return true;
    });

    // Filter by chapter if selected (only in section mode)
    if (selectedChapter && checkMode === 'section') {
      result = result.filter(c => {
        const chapter = extractChapter(c.code_section_number);
        return chapter === selectedChapter;
      });
    }

    // Filter by unassessed status if enabled
    if (showUnassessedOnly) {
      result = result.filter(c => {
        // Check is assessed if it has manual_status or latest_status
        const isAssessed = c.manual_status || c.latest_status;
        return !isAssessed;
      });
    }

    return result;
  }, [searchResults, checks, checkMode, showUnassessedOnly, selectedChapter]);

  // Group checks hierarchically
  const groupedChecks = useMemo(() => {
    const mainGroups = new Map<string, any[]>();

    if (checkMode === 'element') {
      // Group by element group name, then by element_instance_id
      filtered.forEach(check => {
        // Only show checks that belong to an element instance
        if (!check.element_instance_id || !check.element_instance_label) {
          return;
        }
        const groupName = check.element_group_name || 'Other';

        if (!mainGroups.has(groupName)) {
          mainGroups.set(groupName, []);
        }

        // Find or create instance group
        const group = mainGroups.get(groupName)!;
        let instanceGroup = group.find(
          (g: any) => g.element_instance_id === check.element_instance_id
        );

        if (!instanceGroup) {
          // Create new instance group with first check as representative
          instanceGroup = {
            ...check,
            sections: [check], // Store all sections for this instance
          };
          group.push(instanceGroup);
        } else {
          // Add section to existing instance group
          instanceGroup.sections.push(check);
        }
      });

      // Sort each group by creation date (newest first)
      mainGroups.forEach(group => {
        group.sort((a, b) => {
          const aTime = new Date(a.created_at || 0).getTime();
          const bTime = new Date(b.created_at || 0).getTime();
          return aTime - bTime; // Oldest first
        });
      });

      console.log('[CheckList] Element mode groups:', {
        groupCount: mainGroups.size,
        groups: Array.from(mainGroups.entries()).map(([name, instances]) => ({
          name,
          instanceCount: instances.length,
          instances: instances.map((i: any) => i.element_instance_label),
        })),
      });
    } else {
      // Section mode: flat list, no grouping
      // Sort all checks by section number using natural sort
      const sortedChecks = [...filtered].sort((a, b) =>
        naturalCompare(a.code_section_number || '', b.code_section_number || '')
      );

      // Return as single group with empty key for flat rendering
      mainGroups.set('', sortedChecks);
    }

    return Array.from(mainGroups.entries()).sort(([a], [b]) => naturalCompare(a, b));
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

  const handleDeleteInstance = async (check: any, instanceLabel: string) => {
    if (!confirm(`Delete "${instanceLabel}"?`)) {
      return;
    }

    setDeletingCheckId(check.id);

    try {
      // Single DELETE request
      const response = await fetch(
        `/api/assessments/${assessmentId}/element-instances/${check.element_instance_id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Delete failed');
      }
      const result = await response.json();
      console.log(`[CheckList] Deleted ${result.deleted_count} checks for "${instanceLabel}"`);

      // Instant UI update - no refetch needed!
      if (onInstanceDeleted) {
        onInstanceDeleted(check.element_instance_id);
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

    // Find the check to get element_group_id and current instance_label
    const check = filtered.find(c => c.id === checkId);
    if (!check) {
      alert('Check not found');
      return;
    }

    try {
      let response;

      // If this is an element check, update ALL checks for this instance
      if (check.element_instance_id && assessmentId) {
        console.log('[CheckList] Bulk updating instance label:', {
          checkId,
          element_instance_id: check.element_instance_id,
          old_label: check.element_instance_label,
          new_label: newLabel,
        });

        response = await fetch(
          `/api/assessments/${assessmentId}/element-instances/${check.element_instance_id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newInstanceLabel: newLabel }),
          }
        );
      } else {
        // Fall back to single check update for non-element checks
        console.log('[CheckList] Single check update:', { checkId, newLabel });
        response = await fetch(`/api/checks/${checkId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instance_label: newLabel }),
        });
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update label');
      }

      const result = await response.json();
      console.log('Label updated successfully:', result);

      // Refetch checks to get updated data first, then clear editing state
      if (refetchChecks) {
        await refetchChecks();
      }

      setEditingCheckId(null);
      setEditingLabel('');
    } catch (error: any) {
      console.error('Update error:', error);
      alert(`Failed to update: ${error.message}`);
    }
  };

  // Bulk selection handlers
  const toggleSelection = (checkId: string, isShiftClick: boolean = false) => {
    setSelectedCheckIds(prev => {
      const next = new Set(prev);

      // Handle shift-click range selection
      if (isShiftClick && lastClickedCheckId) {
        // Get all check IDs in DISPLAY order (as they appear in the UI)
        const allCheckIds: string[] = [];

        // Build list in the same order as groupedChecks displays them
        groupedChecks.forEach(([_mainPrefix, groupChecks]) => {
          groupChecks.forEach(check => {
            allCheckIds.push(check.id);
          });
        });

        // Find indices of last clicked and current
        const lastIndex = allCheckIds.indexOf(lastClickedCheckId);
        const currentIndex = allCheckIds.indexOf(checkId);

        if (lastIndex !== -1 && currentIndex !== -1) {
          // Select all checks in the range
          const start = Math.min(lastIndex, currentIndex);
          const end = Math.max(lastIndex, currentIndex);

          for (let i = start; i <= end; i++) {
            next.add(allCheckIds[i]);
          }
        }
      } else {
        // Normal toggle
        if (next.has(checkId)) {
          next.delete(checkId);
        } else {
          next.add(checkId);
        }
      }

      return next;
    });

    // Update last clicked (unless unchecking)
    if (!isShiftClick || !lastClickedCheckId) {
      setLastClickedCheckId(checkId);
    }
  };

  const clearSelection = () => {
    setSelectedCheckIds(new Set());
    setLastClickedCheckId(null);
  };

  const handleBulkAnalyze = async () => {
    setBulkOperationLoading(true);
    try {
      const checkIdsArray = Array.from(selectedCheckIds);

      // Call existing assess endpoint for each check in parallel
      // This automatically handles rules-based door checks!
      const promises = checkIdsArray.map(checkId =>
        fetch(`/api/checks/${checkId}/assess`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aiProvider: 'gemini',
            customPrompt: undefined,
            extraContext: undefined,
          }),
        })
      );

      await Promise.all(promises);
      clearSelection();
      await refetchChecks?.();
    } catch (error) {
      console.error('Bulk analyze failed:', error);
      alert('Failed to queue analyses');
    } finally {
      setBulkOperationLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedCheckIds.size} checks? This cannot be undone.`)) {
      return;
    }

    setBulkOperationLoading(true);
    try {
      const response = await fetch('/api/checks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkIds: Array.from(selectedCheckIds) }),
      });

      if (!response.ok) throw new Error('Delete failed');

      clearSelection();
      await refetchChecks?.();
    } catch (error) {
      console.error('Bulk delete failed:', error);
      alert('Failed to delete checks');
    } finally {
      setBulkOperationLoading(false);
    }
  };

  const handleBulkSetStatus = async (status: ComplianceOverrideStatus) => {
    setBulkOperationLoading(true);
    try {
      const response = await fetch('/api/checks/manual-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkIds: Array.from(selectedCheckIds),
          manual_status: status,
          manual_status_note: `Bulk updated to ${status}`,
        }),
      });

      if (!response.ok) throw new Error('Status update failed');

      clearSelection();
      await refetchChecks?.();
    } catch (error) {
      console.error('Bulk status update failed:', error);
      alert('Failed to update status');
    } finally {
      setBulkOperationLoading(false);
    }
  };

  const isActivelyProcessing = (check: any) => {
    if (check.status === 'processing' || check.status === 'analyzing') {
      // Check if updated within last 5 minutes
      if (check.updated_at) {
        const updatedAt = new Date(check.updated_at);
        const minutesAgo = (Date.now() - updatedAt.getTime()) / 1000 / 60;
        return minutesAgo < 5;
      }
      return true; // If no updated_at, assume it's recent
    }
    return false;
  };

  const getStatusIcon = (check: any) => {
    // Check if currently processing (analyzing)
    if (isActivelyProcessing(check)) {
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
    if (check.manual_status === 'compliant') return '✓';
    if (check.manual_status === 'non_compliant') return '✗';
    if (check.manual_status === 'insufficient_information') return '?';
    // Fall back to AI assessment
    if (check.latest_status === 'compliant') return '✓';
    if (check.latest_status === 'non_compliant') return '✗';
    return '○';
  };

  const getStatusColor = (check: any) => {
    // Check if currently processing (analyzing)
    if (isActivelyProcessing(check)) return 'text-blue-600';
    // Prioritize manual override
    if (check.manual_status === 'compliant') return 'text-green-600 font-bold';
    if (check.manual_status === 'non_compliant') return 'text-red-600 font-bold';
    if (check.manual_status === 'insufficient_information') return 'text-yellow-600 font-bold';
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
      <div className="p-3 border-b border-sage-200 bg-sage-50">
        <div className="relative">
          <input
            className="w-full px-3 py-2 text-sm border border-sage-300 bg-paper text-ink-900 placeholder-sage-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            placeholder="Search checks and section content..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {searching && (
            <div className="absolute right-3 top-2.5 text-sage-400">
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

        {/* Chapter Filter (only in section mode) */}
        {checkMode === 'section' && availableChapters.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium text-sage-700 mb-2">Filter by Chapter</div>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setSelectedChapter(null)}
                className={clsx(
                  'px-3 py-1 text-xs font-medium transition-colors border',
                  !selectedChapter
                    ? 'bg-sage-700 text-white border-sage-700'
                    : 'bg-paper text-sage-700 border-sage-300 hover:bg-sage-100'
                )}
              >
                All
              </button>
              {availableChapters.map(({ codeTitle, chapters }) => (
                <div key={codeTitle} className="flex flex-wrap gap-1 items-center">
                  {/* Code label */}
                  <span className="text-xs font-semibold text-sage-600 px-2">
                    {codeTitle.replace(/California|Code|Building|Plumbing|20\d{2}/g, '').trim() ||
                      codeTitle}
                  </span>
                  {/* Chapter pills for this code */}
                  {chapters.map(chapter => (
                    <button
                      key={`${codeTitle}-${chapter}`}
                      onClick={() => setSelectedChapter(chapter)}
                      className={clsx(
                        'px-3 py-1 text-xs font-medium transition-colors border',
                        selectedChapter === chapter
                          ? 'bg-sage-700 text-white border-sage-700'
                          : 'bg-paper text-sage-700 border-sage-300 hover:bg-sage-100'
                      )}
                    >
                      {chapter.match(/^\d+$/) ? `Ch ${chapter}` : chapter}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mt-2 space-y-1">
          <label className="flex items-center text-sm text-sage-700 cursor-pointer hover:text-sage-900">
            <input
              type="checkbox"
              checked={showUnassessedOnly}
              onChange={e => setShowUnassessedOnly(e.target.checked)}
              className="mr-2 border-sage-300 text-sage-600 focus:ring-sage-500"
            />
            <span>Show unassessed only</span>
          </label>
          <label className="flex items-center text-sm text-sage-700 cursor-pointer hover:text-sage-900">
            <input
              type="checkbox"
              checked={showExcluded}
              onChange={e => setShowExcluded(e.target.checked)}
              className="mr-2 border-sage-300 text-sage-600 focus:ring-sage-500"
            />
            <span>Show excluded checks</span>
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
            <div key={mainPrefix} className="border-b border-sage-200">
              {/* Main Section/Element Header - only show in element mode */}
              {checkMode === 'element' && (
                <div className="w-full flex items-center hover:bg-sage-100 transition-colors bg-sage-50">
                  <button
                    onClick={() => toggleSection(mainPrefix)}
                    className="flex-1 px-3 py-2 flex items-center text-left"
                  >
                    <svg
                      width="10"
                      height="10"
                      className={clsx(
                        'mr-2 transition-transform text-sage-500',
                        isExpanded && 'rotate-90'
                      )}
                      fill="currentColor"
                      viewBox="0 0 10 10"
                    >
                      <path d="M2 2l5 3-5 3z" />
                    </svg>
                    <span className="text-sm font-semibold text-ink-900">{mainPrefix}</span>
                    <span className="ml-auto text-xs text-sage-500">({displayChecks.length})</span>
                  </button>

                  {/* Add Element Button */}
                  {elementGroupSlug && (
                    <button
                      onClick={async e => {
                        e.stopPropagation();

                        // Call create-element API directly (no template needed)
                        try {
                          console.log('[CheckList] Creating element instance:', {
                            assessmentId,
                            elementGroupSlug,
                          });

                          const res = await fetch('/api/checks/create-element', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              assessmentId,
                              elementGroupSlug,
                            }),
                          });

                          if (res.ok) {
                            const data = await res.json();
                            console.log('[CheckList] Element instance created:', {
                              instance_id: data.instance.id,
                              label: data.instance.label,
                              checks_created: data.checks_created,
                              first_check_id: data.first_check_id,
                            });

                            setSearchResults(null);
                            await refetchChecks?.();
                          } else {
                            const data = await res.json();
                            console.error('[CheckList] Failed to create element instance:', data);
                            alert(
                              `Failed to create element instance: ${data.error || 'Unknown error'}`
                            );
                          }
                        } catch (error) {
                          console.error('[CheckList] Error creating element instance:', error);
                          alert('Failed to create element instance');
                        }
                      }}
                      className="px-3 py-2 flex items-center hover:bg-accent-500/10 transition-colors text-accent-600 hover:text-accent-500"
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
              )}

              {/* Individual Checks */}
              {(checkMode === 'section' || isExpanded) && (
                <div className="bg-paper">
                  {displayChecks.map(check => {
                    const hasInstances = check.instances && check.instances.length > 0;
                    const isInstancesExpanded = expandedInstances.has(check.id);

                    return (
                      <div key={check.id} className="border-b border-sage-100 last:border-b-0">
                        {/* Parent Check */}
                        <div className="flex items-stretch">
                          {/* Expand/Collapse button (only if has instances) */}
                          {hasInstances && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                toggleInstances(check.id);
                              }}
                              className="px-2 flex items-center hover:bg-sage-100 transition-colors"
                            >
                              <svg
                                width="8"
                                height="8"
                                className={clsx(
                                  'transition-transform text-sage-500',
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
                              'flex-1 py-2 flex items-start text-left cursor-pointer transition-colors group/check',
                              activeCheckId === check.id
                                ? 'bg-sage-200 border-l-4 border-sage-600'
                                : 'hover:bg-sage-50 pl-1',
                              !hasInstances && !activeCheckId !== check.id && 'pl-5'
                            )}
                          >
                            <span
                              className={clsx(
                                'mt-0.5 mr-2 text-sm flex-shrink-0',
                                getStatusColor(check)
                              )}
                            >
                              {getStatusIcon(check)}
                            </span>
                            <div className="flex-1 min-w-0 pr-2">
                              {checkMode === 'element' ? (
                                // Element mode: show instance label and section count
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
                                          className="font-medium text-sm text-ink-900 border border-accent-500 px-1 focus:outline-none focus:ring-1 focus:ring-accent-500"
                                        />
                                      </div>
                                    ) : (
                                      <span
                                        className="font-medium text-sm text-ink-900 cursor-pointer hover:text-accent-600"
                                        onClick={e => {
                                          e.stopPropagation();
                                          handleStartEdit(
                                            check.id,
                                            check.element_instance_label ||
                                              `Instance ${check.instance_number}`
                                          );
                                        }}
                                        title="Click to edit"
                                      >
                                        {check.element_instance_label ||
                                          `Instance ${check.instance_number}`}
                                      </span>
                                    )}
                                    {(() => {
                                      // Count screenshots from both possible data structures:
                                      // - check.instances (from server-side grouping in page.tsx)
                                      // - check.sections (from client-side grouping in this component)
                                      const sections = check.instances || check.sections || [];
                                      const totalScreenshots = sections.reduce(
                                        (sum: number, s: any) => sum + (s.screenshots?.length || 0),
                                        0
                                      );
                                      return totalScreenshots > 0 ? (
                                        <span className="text-xs text-sage-500 ml-2">
                                          {totalScreenshots}
                                        </span>
                                      ) : null;
                                    })()}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {check.manual_status && (
                                      <span className="text-xs px-1.5 py-0.5 bg-sage-200 text-sage-700 font-medium">
                                        Manual
                                      </span>
                                    )}
                                  </div>
                                </>
                              ) : (
                                // Section mode: show section number and title split
                                <>
                                  <div className="flex flex-col">
                                    <span className="font-mono font-semibold text-sm text-ink-900">
                                      {check.code_section_number}
                                    </span>
                                    <span className="text-sm font-normal text-sage-600 line-clamp-2">
                                      {check.code_section_title}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    {check.manual_status && (
                                      <span className="text-xs px-1.5 py-0.5 bg-sage-200 text-sage-700 font-medium">
                                        Manual
                                      </span>
                                    )}
                                    {hasInstances && (
                                      <span className="text-xs text-accent-600 font-medium">
                                        {check.instances.length}{' '}
                                        {check.instances.length === 1 ? 'instance' : 'instances'}
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                            {/* Checkbox on right, appears on hover */}
                            <div
                              className={clsx(
                                'flex-shrink-0 pr-2 transition-opacity',
                                selectedCheckIds.has(check.id)
                                  ? 'opacity-100'
                                  : 'opacity-0 group-hover/check:opacity-100'
                              )}
                              onClick={e => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={selectedCheckIds.has(check.id)}
                                onChange={e => {
                                  e.stopPropagation();
                                  const isShiftClick = (e.nativeEvent as MouseEvent).shiftKey;
                                  toggleSelection(check.id, isShiftClick);
                                }}
                                className="w-4 h-4 border-sage-300 text-sage-600 focus:ring-sage-500 cursor-pointer"
                              />
                            </div>
                          </button>

                          {/* Clone Button - show for all checks in section mode */}
                          {checkMode === 'section' && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setCloneModalCheck(check);
                              }}
                              className="px-3 flex items-center hover:bg-accent-500/10 transition-colors text-accent-600 hover:text-accent-500"
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

                          {/* Delete Button - show for element checks in element mode */}
                          {checkMode === 'element' && check.element_group_id && (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                handleDeleteInstance(
                                  check,
                                  check.element_instance_label ||
                                    `Instance ${check.instance_number}`
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
                          <div className="bg-sage-50 border-t border-sage-200">
                            {check.instances.map((instance: any) => (
                              <div
                                key={instance.id}
                                className={clsx(
                                  'flex items-start hover:bg-sage-100 transition-colors border-b border-sage-200 last:border-b-0 group',
                                  activeCheckId === instance.id &&
                                    'bg-sage-200 border-l-4 border-sage-500'
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
                                    activeCheckId === instance.id && 'hover:bg-sage-200'
                                  )}
                                >
                                  <span
                                    className={clsx(
                                      'mt-0.5 mr-2 text-sm',
                                      getStatusColor(instance)
                                    )}
                                  >
                                    {getStatusIcon(instance)}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <div className="text-sm text-ink-700 font-medium">
                                        {instance.element_instance_label ||
                                          `Instance ${instance.instance_number}`}
                                      </div>
                                      {instance.manual_status && (
                                        <span className="text-xs px-1.5 py-0.5 bg-sage-200 text-sage-700 font-medium">
                                          Manual
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-sage-500 mt-0.5">
                                      {instance.code_section_number}
                                    </div>
                                  </div>
                                </button>

                                {/* Delete Button */}
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    handleDeleteInstance(
                                      instance,
                                      instance.element_instance_label ||
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
      <div className="p-3 border-t border-sage-200 bg-sage-50">
        <div className="text-xs text-sage-600">
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

      {/* Bulk Action Bar */}
      {selectedCheckIds.size > 0 && (
        <BulkActionBar
          selectedCount={selectedCheckIds.size}
          onAnalyze={handleBulkAnalyze}
          onDelete={handleBulkDelete}
          onSetStatus={handleBulkSetStatus}
          onClear={clearSelection}
          loading={bulkOperationLoading}
        />
      )}
    </div>
  );
}
