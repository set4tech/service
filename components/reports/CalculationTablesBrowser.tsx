'use client';

import React, { useEffect, useState } from 'react';
import { CalculationTable } from '@/lib/reports/get-violations';

interface CheckWithTable {
  check_id: string;
  code_section_number: string;
  code_section_title: string;
  check_name: string;
  human_readable_title: string;
  calculation_table: CalculationTable;
  manual_status: string;
}

interface Props {
  assessmentId: string;
}

export function CalculationTablesBrowser({ assessmentId }: Props) {
  const [tables, setTables] = useState<CheckWithTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTableId, setExpandedTableId] = useState<string | null>(null);
  const [modalTable, setModalTable] = useState<CheckWithTable | null>(null);

  // Handle Esc key to close modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalTable) {
        setModalTable(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [modalTable]);

  useEffect(() => {
    const fetchTables = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/assessments/${assessmentId}/calculation-tables`);

        if (!response.ok) {
          throw new Error('Failed to fetch calculation tables');
        }

        const data = await response.json();
        setTables(data.tables || []);

        // Auto-expand first table if available
        if (data.tables && data.tables.length > 0) {
          setExpandedTableId(data.tables[0].check_id);
        }
      } catch (err) {
        console.error('Error fetching calculation tables:', err);
        setError(err instanceof Error ? err.message : 'Failed to load calculation tables');
      } finally {
        setLoading(false);
      }
    };

    fetchTables();
  }, [assessmentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Loading calculation tables...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="p-4">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No calculation tables</h3>
          <p className="mt-1 text-sm text-gray-500">
            No calculation tables have been added to this assessment yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Calculation Tables</h2>
        <p className="text-sm text-gray-600 mt-1">
          {tables.length} {tables.length === 1 ? 'table' : 'tables'} available
        </p>
      </div>

      <div className="space-y-3">
        {tables.map(check => {
          const isExpanded = expandedTableId === check.check_id;
          const table = check.calculation_table;

          return (
            <div
              key={check.check_id}
              className="border border-gray-200 rounded-lg overflow-hidden bg-white hover:shadow-md transition-shadow"
            >
              {/* Header - Clickable to expand/collapse */}
              <button
                onClick={() => setExpandedTableId(isExpanded ? null : check.check_id)}
                className="w-full px-4 py-3 flex items-start justify-between hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-semibold text-blue-600">
                      {check.code_section_number}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        check.manual_status === 'non_compliant'
                          ? 'bg-red-100 text-red-800'
                          : check.manual_status === 'compliant'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {check.manual_status?.replace('_', ' ')}
                    </span>
                  </div>
                  <h3 className="text-sm font-medium text-gray-900 truncate">
                    {table.title || check.code_section_title}
                  </h3>
                  {check.human_readable_title && (
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                      {check.human_readable_title}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 ml-3">
                  <svg
                    className={`h-5 w-5 text-gray-400 transition-transform ${
                      isExpanded ? 'transform rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </button>

              {/* Expanded Table Content */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-2 mt-3">
                    <span className="text-xs text-gray-600">
                      {table.rows.length} {table.rows.length === 1 ? 'row' : 'rows'}
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setModalTable(check);
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                      title="Open in fullscreen"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                        />
                      </svg>
                      Fullscreen
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {table.headers.map((header, idx) => (
                            <th
                              key={idx}
                              scope="col"
                              className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {table.rows.map((row, rowIdx) => (
                          <tr key={rowIdx} className="hover:bg-gray-50">
                            {row.map((cell, cellIdx) => (
                              <td
                                key={cellIdx}
                                className="px-3 py-2 whitespace-nowrap text-sm text-gray-900"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Fullscreen Modal */}
      {modalTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono font-semibold text-blue-600">
                    {modalTable.code_section_number}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      modalTable.manual_status === 'non_compliant'
                        ? 'bg-red-100 text-red-800'
                        : modalTable.manual_status === 'compliant'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {modalTable.manual_status?.replace('_', ' ')}
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {modalTable.calculation_table.title || modalTable.code_section_title}
                </h2>
                {modalTable.human_readable_title && (
                  <p className="text-sm text-gray-600 mt-1">{modalTable.human_readable_title}</p>
                )}
              </div>
              <button
                onClick={() => setModalTable(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                aria-label="Close"
              >
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-auto px-6 py-4">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {modalTable.calculation_table.headers.map((header, idx) => (
                      <th
                        key={idx}
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {modalTable.calculation_table.rows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-gray-50">
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx} className="px-4 py-3 text-sm text-gray-900">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between text-xs text-gray-600">
              <span>
                {modalTable.calculation_table.rows.length}{' '}
                {modalTable.calculation_table.rows.length === 1 ? 'row' : 'rows'}
              </span>
              <span className="text-gray-500">Press Esc to close</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
