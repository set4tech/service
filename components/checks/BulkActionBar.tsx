import { ComplianceOverrideStatus } from '@/types/database';

interface BulkActionBarProps {
  selectedCount: number;
  onAnalyze: () => void;
  onDelete: () => void;
  onSetStatus: (status: ComplianceOverrideStatus) => void;
  onClear: () => void;
  loading?: boolean;
}

export function BulkActionBar({
  selectedCount,
  onAnalyze,
  onDelete,
  onSetStatus,
  onClear,
  loading,
}: BulkActionBarProps) {
  return (
    <div className="fixed bottom-4 left-4 bg-white border border-gray-300 rounded-lg shadow-lg px-4 py-3 flex items-center gap-4 z-50 transition-all">
      <span className="text-sm font-medium text-gray-700">{selectedCount} selected</span>

      <button
        onClick={onAnalyze}
        disabled={loading}
        className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
      >
        Analyze
      </button>

      <button
        onClick={onDelete}
        disabled={loading}
        className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
      >
        Delete
      </button>

      <select
        onChange={e => e.target.value && onSetStatus(e.target.value as ComplianceOverrideStatus)}
        disabled={loading}
        className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
        defaultValue=""
      >
        <option value="">Mark as...</option>
        <option value="compliant">Compliant</option>
        <option value="non_compliant">Non-Compliant</option>
        <option value="not_applicable">Not Applicable</option>
        <option value="insufficient_information">Insufficient Info</option>
      </select>

      <button
        onClick={onClear}
        disabled={loading}
        className="text-sm text-gray-500 hover:text-gray-700 ml-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Clear
      </button>
    </div>
  );
}
