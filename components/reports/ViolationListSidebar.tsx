'use client';

import { useMemo, useState, useEffect } from 'react';
import { ViolationMarker } from '@/lib/reports/get-violations';
import clsx from 'clsx';

interface Props {
  violations: ViolationMarker[];
  selectedViolation: ViolationMarker | null;
  onViolationClick: (violation: ViolationMarker) => void;
  onViolationDetailsClick?: (violation: ViolationMarker) => void;
  onEditCheck?: (violation: ViolationMarker) => void; // New: Navigate to edit check in CodeDetailPanel
  currentPage: number;
  assessmentId?: string;
  onSeverityFilterChange?: (severities: Set<string>) => void;
}

type GroupBy = 'page' | 'severity' | 'section';

export function ViolationListSidebar({
  violations,
  selectedViolation,
  onViolationClick,
  onViolationDetailsClick,
  onEditCheck,
  currentPage: _currentPage,
  assessmentId,
  onSeverityFilterChange,
}: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>('page');
  const [searchQuery, setSearchQuery] = useState('');

  // Format violation description - prioritize human-readable title
  const formatViolationDescription = (violation: ViolationMarker): string => {
    // Use AI-generated human-readable title if available
    if (violation.humanReadableTitle && violation.humanReadableTitle.trim()) {
      return violation.humanReadableTitle;
    }

    // Fallback: use reasoning with section number
    const maxLength = 80;
    if (violation.reasoning && violation.reasoning.trim()) {
      const reasoning = violation.reasoning.trim();
      if (reasoning.length > maxLength) {
        return `${violation.codeSectionNumber} - ${reasoning.slice(0, maxLength)}[...]`;
      }
      return `${violation.codeSectionNumber} - ${reasoning}`;
    }

    // Last resort: use description
    return violation.description;
  };

  // Severity filter state with localStorage persistence
  const [severityFilter, setSeverityFilter] = useState<Set<string>>(() => {
    if (typeof window === 'undefined' || !assessmentId) {
      return new Set(['major', 'moderate', 'minor', 'needs_more_info']);
    }
    try {
      const saved = localStorage.getItem(`violation-severity-filter-${assessmentId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return new Set(parsed);
      }
    } catch {
      // ignore
    }
    return new Set(['major', 'moderate', 'minor', 'needs_more_info']);
  });

  // Persist severity filter changes
  useEffect(() => {
    if (assessmentId && typeof window !== 'undefined') {
      localStorage.setItem(
        `violation-severity-filter-${assessmentId}`,
        JSON.stringify(Array.from(severityFilter))
      );
    }
    onSeverityFilterChange?.(severityFilter);
  }, [severityFilter, assessmentId, onSeverityFilterChange]);

  const toggleSeverityFilter = (severity: string) => {
    setSeverityFilter(prev => {
      const next = new Set(prev);
      if (next.has(severity)) {
        next.delete(severity);
      } else {
        next.add(severity);
      }
      return next;
    });
  };

  // Filter violations by search query and severity
  const filteredViolations = useMemo(() => {
    let filtered = violations;

    // Filter by severity
    filtered = filtered.filter(v => severityFilter.has(v.severity));

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        v =>
          v.description.toLowerCase().includes(query) ||
          v.codeSectionNumber.toLowerCase().includes(query) ||
          v.checkName.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [violations, searchQuery, severityFilter]);

  // Count violations by severity
  const severityCounts = useMemo(() => {
    const counts = { major: 0, moderate: 0, minor: 0, needs_more_info: 0 };
    violations.forEach(v => {
      if (v.severity in counts) {
        counts[v.severity as keyof typeof counts]++;
      }
    });
    return counts;
  }, [violations]);

  // Group violations based on selected grouping
  const groupedViolations = useMemo(() => {
    const groups: Record<string, ViolationMarker[]> = {};

    filteredViolations.forEach(v => {
      let key: string;
      if (groupBy === 'page') {
        key = `Page ${v.pageNumber}`;
      } else if (groupBy === 'severity') {
        key = v.severity.charAt(0).toUpperCase() + v.severity.slice(1);
      } else {
        key = v.codeSectionNumber;
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(v);
    });

    // Sort groups
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (groupBy === 'page') {
        const pageA = parseInt(a.replace('Page ', ''));
        const pageB = parseInt(b.replace('Page ', ''));
        return pageA - pageB;
      } else if (groupBy === 'severity') {
        const order = { Major: 0, Moderate: 1, Minor: 2, Needs_more_info: 3 };
        return order[a as keyof typeof order] - order[b as keyof typeof order];
      }
      return a.localeCompare(b);
    });

    return sortedKeys.map(key => ({ key, violations: groups[key] }));
  }, [filteredViolations, groupBy]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'major':
        return 'text-red-300 bg-red-900/30 border-red-700/50';
      case 'moderate':
        return 'text-yellow-300 bg-yellow-900/30 border-yellow-700/50';
      case 'minor':
        return 'text-accent-400 bg-accent-900/30 border-accent-700/50';
      case 'needs_more_info':
        return 'text-blue-300 bg-blue-900/30 border-blue-700/50';
      default:
        return 'text-slate-300 bg-[#4d5a5a] border-[#2d3838]';
    }
  };

  const getSeverityDot = (severity: string) => {
    switch (severity) {
      case 'major':
        return 'bg-danger-600';
      case 'moderate':
        return 'bg-yellow-600';
      case 'minor':
        return 'bg-accent-600';
      case 'needs_more_info':
        return 'bg-blue-600';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Search and Group Controls */}
      <div className="px-4 py-3 border-b border-[#2d3838] bg-[#3d4a4a]">
        <input
          type="text"
          placeholder="Search violations..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-[#2d3838] rounded-lg bg-[#4d5a5a] text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
        />

        {/* Severity Filter Pills */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => toggleSeverityFilter('major')}
            className={clsx(
              'px-3 py-2 text-xs font-medium rounded-lg border-2 transition-all',
              severityFilter.has('major')
                ? 'bg-red-900/40 border-red-600 text-red-300'
                : 'bg-[#4d5a5a] border-[#2d3838] text-slate-400 opacity-50 hover:opacity-100'
            )}
          >
            Major
            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#2d3838] font-mono text-[10px]">
              {severityCounts.major}
            </span>
          </button>
          <button
            onClick={() => toggleSeverityFilter('moderate')}
            className={clsx(
              'px-3 py-2 text-xs font-medium rounded-lg border-2 transition-all',
              severityFilter.has('moderate')
                ? 'bg-yellow-900/40 border-yellow-600 text-yellow-300'
                : 'bg-[#4d5a5a] border-[#2d3838] text-slate-400 opacity-50 hover:opacity-100'
            )}
          >
            Moderate
            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#2d3838] font-mono text-[10px]">
              {severityCounts.moderate}
            </span>
          </button>
          <button
            onClick={() => toggleSeverityFilter('minor')}
            className={clsx(
              'px-3 py-2 text-xs font-medium rounded-lg border-2 transition-all',
              severityFilter.has('minor')
                ? 'bg-accent-900/40 border-accent-600 text-accent-400'
                : 'bg-[#4d5a5a] border-[#2d3838] text-slate-400 opacity-50 hover:opacity-100'
            )}
          >
            Minor
            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#2d3838] font-mono text-[10px]">
              {severityCounts.minor}
            </span>
          </button>
          <button
            onClick={() => toggleSeverityFilter('needs_more_info')}
            className={clsx(
              'px-3 py-2 text-xs font-medium rounded-lg border-2 transition-all',
              severityFilter.has('needs_more_info')
                ? 'bg-blue-900/40 border-blue-600 text-blue-300'
                : 'bg-[#4d5a5a] border-[#2d3838] text-slate-400 opacity-50 hover:opacity-100'
            )}
          >
            Needs Info
            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#2d3838] font-mono text-[10px]">
              {severityCounts.needs_more_info}
            </span>
          </button>
        </div>

        <div className="mt-3 flex gap-1 bg-[#2d3838] rounded-lg p-1">
          <button
            onClick={() => setGroupBy('page')}
            className={clsx(
              'flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors',
              groupBy === 'page'
                ? 'bg-[#4d5a5a] shadow-sm text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            By Page
          </button>
          <button
            onClick={() => setGroupBy('severity')}
            className={clsx(
              'flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors',
              groupBy === 'severity'
                ? 'bg-[#4d5a5a] shadow-sm text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            By Severity
          </button>
          <button
            onClick={() => setGroupBy('section')}
            className={clsx(
              'flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors',
              groupBy === 'section'
                ? 'bg-[#4d5a5a] shadow-sm text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            )}
          >
            By Section
          </button>
        </div>
      </div>

      {/* Violations List */}
      <div className="flex-1 overflow-y-auto">
        {violations.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <h3 className="text-lg font-medium text-slate-100 mb-2">No Violations Found</h3>
            <p className="text-sm text-slate-400">
              This project is currently compliant with all assessed code sections.
            </p>
          </div>
        ) : groupedViolations.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-400 text-sm">
            No violations found matching your search.
          </div>
        ) : (
          groupedViolations.map(group => (
            <div key={group.key} className="border-b border-[#2d3838]">
              {/* Group Header */}
              <div className="sticky top-0 bg-[#3d4a4a] px-4 py-2 border-b border-[#2d3838]">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                  {group.key}
                  <span className="ml-2 text-slate-400 font-mono">({group.violations.length})</span>
                </h3>
              </div>

              {/* Group Items */}
              <div className="divide-y divide-[#2d3838]">
                {group.violations.map(violation => (
                  <div
                    key={`${violation.checkId}-${violation.screenshotId}`}
                    className={clsx(
                      'relative px-4 py-3 hover:bg-[#4d5a5a] transition-colors cursor-pointer',
                      selectedViolation?.checkId === violation.checkId &&
                        selectedViolation?.screenshotId === violation.screenshotId
                        ? 'bg-[#4d5a5a] border-l-4 border-accent-600'
                        : 'border-l-4 border-transparent'
                    )}
                    onClick={() => onViolationClick(violation)}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={clsx(
                          'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                          getSeverityDot(violation.severity)
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-100 line-clamp-2">
                          {formatViolationDescription(violation)}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                          <span className="font-mono">Page {violation.pageNumber}</span>
                          <span>•</span>
                          <span
                            className={clsx(
                              'px-2 py-0.5 rounded-full border capitalize font-medium',
                              getSeverityColor(violation.severity)
                            )}
                          >
                            {violation.severity}
                          </span>
                          {violation.checkType === 'element' && violation.elementGroupName && (
                            <>
                              <span>•</span>
                              <span className="font-medium text-accent-400">
                                {violation.elementGroupName}
                                {violation.instanceLabel && ` - ${violation.instanceLabel}`}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        {/* Edit Check button */}
                        {onEditCheck && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onEditCheck(violation);
                            }}
                            className="flex-shrink-0 p-2 rounded-lg hover:bg-[#5d6a6a] hover:text-accent-400 transition-colors group"
                            title="Edit check details, screenshots, and prompt"
                          >
                            <svg
                              className="w-4 h-4 text-slate-400 group-hover:text-accent-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                        )}
                        {/* Details button */}
                        {onViolationDetailsClick && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onViolationDetailsClick(violation);
                            }}
                            className="flex-shrink-0 p-2 rounded-lg hover:bg-[#5d6a6a] transition-colors"
                            title="View details"
                          >
                            <svg
                              className="w-4 h-4 text-slate-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer with total count */}
      <div className="px-4 py-3 border-t border-[#2d3838] bg-[#3d4a4a]">
        <div className="text-xs text-slate-400 text-center font-mono">
          Showing {filteredViolations.length} of {violations.length} violations
        </div>
      </div>
    </div>
  );
}
