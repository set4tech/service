'use client';

import { useMemo, useState } from 'react';
import { ViolationMarker } from '@/lib/reports/get-violations';
import clsx from 'clsx';

interface Props {
  violations: ViolationMarker[];
  selectedViolation: ViolationMarker | null;
  onViolationClick: (violation: ViolationMarker) => void;
  currentPage: number;
}

type GroupBy = 'page' | 'severity' | 'section';

export function ViolationListSidebar({
  violations,
  selectedViolation,
  onViolationClick,
  currentPage: _currentPage,
}: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>('page');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter violations by search query
  const filteredViolations = useMemo(() => {
    if (!searchQuery) return violations;
    const query = searchQuery.toLowerCase();
    return violations.filter(
      v =>
        v.description.toLowerCase().includes(query) ||
        v.codeSectionNumber.toLowerCase().includes(query) ||
        v.checkName.toLowerCase().includes(query)
    );
  }, [violations, searchQuery]);

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
        const order = { Major: 0, Moderate: 1, Minor: 2 };
        return order[a as keyof typeof order] - order[b as keyof typeof order];
      }
      return a.localeCompare(b);
    });

    return sortedKeys.map(key => ({ key, violations: groups[key] }));
  }, [filteredViolations, groupBy]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'major':
        return 'text-danger-600 bg-white border-line';
      case 'moderate':
        return 'text-yellow-700 bg-white border-line';
      case 'minor':
        return 'text-accent-600 bg-white border-line';
      default:
        return 'text-ink-700 bg-white border-line';
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
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Search and Group Controls */}
      <div className="px-4 py-3 border-b border-line bg-white">
        <input
          type="text"
          placeholder="Search violations..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
        />

        <div className="mt-3 flex gap-1 bg-paper rounded-lg p-1">
          <button
            onClick={() => setGroupBy('page')}
            className={clsx(
              'flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors',
              groupBy === 'page'
                ? 'bg-white shadow-sm text-ink-900'
                : 'text-ink-500 hover:text-ink-900'
            )}
          >
            By Page
          </button>
          <button
            onClick={() => setGroupBy('severity')}
            className={clsx(
              'flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors',
              groupBy === 'severity'
                ? 'bg-white shadow-sm text-ink-900'
                : 'text-ink-500 hover:text-ink-900'
            )}
          >
            By Severity
          </button>
          <button
            onClick={() => setGroupBy('section')}
            className={clsx(
              'flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors',
              groupBy === 'section'
                ? 'bg-white shadow-sm text-ink-900'
                : 'text-ink-500 hover:text-ink-900'
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
            <div className="text-4xl mb-3 text-accent-600">✓</div>
            <h3 className="text-lg font-medium text-ink-900 mb-2">No Violations Found</h3>
            <p className="text-sm text-ink-500">
              This project is currently compliant with all assessed code sections.
            </p>
          </div>
        ) : groupedViolations.length === 0 ? (
          <div className="px-4 py-8 text-center text-ink-500 text-sm">
            No violations found matching your search.
          </div>
        ) : (
          groupedViolations.map(group => (
            <div key={group.key} className="border-b border-line">
              {/* Group Header */}
              <div className="sticky top-0 bg-paper px-4 py-2 border-b border-line">
                <h3 className="text-xs font-semibold text-ink-700 uppercase tracking-wide">
                  {group.key}
                  <span className="ml-2 text-ink-500 font-mono">({group.violations.length})</span>
                </h3>
              </div>

              {/* Group Items */}
              <div className="divide-y divide-line">
                {group.violations.map(violation => (
                  <button
                    key={`${violation.checkId}-${violation.screenshotId}`}
                    onClick={() => onViolationClick(violation)}
                    className={clsx(
                      'w-full px-4 py-3 text-left hover:bg-paper transition-colors',
                      selectedViolation?.checkId === violation.checkId &&
                        selectedViolation?.screenshotId === violation.screenshotId
                        ? 'bg-paper border-l-4 border-accent-600'
                        : 'border-l-4 border-transparent'
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={clsx(
                          'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                          getSeverityDot(violation.severity)
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono text-ink-500 mb-1">
                          {violation.codeSectionNumber}
                        </div>
                        <div className="text-sm font-medium text-ink-900 line-clamp-2">
                          {violation.description}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-500">
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
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer with total count */}
      <div className="px-4 py-3 border-t border-line bg-white">
        <div className="text-xs text-ink-500 text-center font-mono">
          Showing {filteredViolations.length} of {violations.length} violations
        </div>
      </div>
    </div>
  );
}
