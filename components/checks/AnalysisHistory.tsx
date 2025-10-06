'use client';

import type { AnalysisRun, SectionResult } from '@/types/analysis';
import { getComplianceStatusColor, getConfidenceBadge, getComplianceStatusBadgeColor } from '@/lib/utils/status-badges';

interface AnalysisHistoryProps {
  runs: AnalysisRun[];
  loading: boolean;
  expandedRuns: Set<string>;
  onToggleRun: (runId: string) => void;
}

export function AnalysisHistory({ runs, loading, expandedRuns, onToggleRun }: AnalysisHistoryProps) {
  if (loading) {
    return <div className="text-sm text-gray-500">Loading history...</div>;
  }

  if (runs.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic">
        No assessments yet. Click &ldquo;Assess Compliance&rdquo; to run your first analysis.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {runs.map(run => {
        const isExpanded = expandedRuns.has(run.id);
        const statusColors = getComplianceStatusColor(run.compliance_status);
        const isBatchedRun = run.batch_group_id && (run.total_batches ?? 0) > 1;

        return (
          <div key={run.id} className="border border-gray-200 rounded overflow-hidden">
            {/* Run Header */}
            <button
              onClick={() => onToggleRun(run.id)}
              className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs font-mono text-gray-500">
                  #{run.run_number}
                  {isBatchedRun && (
                    <span className="ml-1 text-blue-600">
                      (Batch {run.batch_number}/{run.total_batches})
                    </span>
                  )}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded border font-medium ${statusColors}`}>
                  {run.compliance_status.replace('_', ' ')}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${getConfidenceBadge(run.confidence)}`}>
                  {run.confidence}
                </span>
                <span className="text-xs text-gray-500 truncate">{run.ai_model}</span>
              </div>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Run Details */}
            {isExpanded && (
              <div className="px-3 py-3 space-y-3 bg-white">
                {/* Timestamp */}
                <div className="text-xs text-gray-500">
                  {new Date(run.executed_at).toLocaleString()}
                  {run.execution_time_ms && (
                    <span className="ml-2">({(run.execution_time_ms / 1000).toFixed(1)}s)</span>
                  )}
                </div>

                {/* Reasoning */}
                {run.ai_reasoning && (
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-1">
                      {run.section_results ? 'Summary' : 'Reasoning'}
                    </div>
                    <div className="text-sm text-gray-800 leading-relaxed bg-gray-50 p-2 rounded border border-gray-200">
                      {run.ai_reasoning}
                    </div>
                  </div>
                )}

                {/* Section-Level Results */}
                {run.section_results && run.section_results.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-2">
                      Section Results ({run.section_results.length})
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {run.section_results.map((sectionResult: SectionResult, idx: number) => (
                        <div
                          key={idx}
                          className={`p-2 rounded border ${
                            sectionResult.compliance_status === 'violation'
                              ? 'bg-red-50 border-red-200'
                              : sectionResult.compliance_status === 'needs_more_info'
                                ? 'bg-yellow-50 border-yellow-200'
                                : sectionResult.compliance_status === 'not_applicable'
                                  ? 'bg-gray-50 border-gray-200'
                                  : 'bg-green-50 border-green-200'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-mono font-semibold text-gray-700 flex-shrink-0">
                              {sectionResult.section_number}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-1">
                                <span
                                  className={`text-xs px-1.5 py-0.5 rounded font-medium ${getComplianceStatusBadgeColor(sectionResult.compliance_status)}`}
                                >
                                  {sectionResult.compliance_status.replace('_', ' ')}
                                </span>
                                {sectionResult.confidence !== 'n/a' && (
                                  <span
                                    className={`text-xs px-1.5 py-0.5 rounded font-medium ${getConfidenceBadge(sectionResult.confidence)}`}
                                  >
                                    {sectionResult.confidence}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-700 leading-relaxed">
                                {sectionResult.reasoning}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Violations */}
                {run.violations && run.violations.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-red-700 mb-1">Violations</div>
                    <ul className="space-y-1">
                      {run.violations.map((v: any, idx: number) => (
                        <li key={idx} className="text-sm text-gray-800 pl-3 border-l-2 border-red-300">
                          <span className="font-medium text-red-700">[{v.severity}]</span> {v.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendations */}
                {run.recommendations && run.recommendations.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-blue-700 mb-1">Recommendations</div>
                    <ul className="space-y-1">
                      {run.recommendations.map((rec: string, idx: number) => (
                        <li key={idx} className="text-sm text-gray-800 pl-3 border-l-2 border-blue-300">
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
