import type { CodeSection } from '@/types/analysis';

type OverrideStatus = 'compliant' | 'non_compliant' | 'not_applicable' | null;

interface ManualJudgmentPanelProps {
  effectiveCheckId: string | null;
  sectionKey: string | null;
  section: CodeSection | null;
  manualOverride: OverrideStatus;
  setManualOverride: (override: OverrideStatus) => void;
  manualOverrideNote: string;
  setManualOverrideNote: (note: string) => void;
  showOverrideNote: boolean;
  setShowOverrideNote: (show: boolean) => void;
  savingOverride: boolean;
  overrideError: string | null;
  handleSaveOverride: () => void;
  handleClearOverride: () => void;
  setShowFloorplanRelevantDialog: (show: boolean) => void;
  setShowNeverRelevantDialog: (show: boolean) => void;
  setShowExcludeDialog: (show: boolean) => void;
  markingFloorplanRelevant: boolean;
  markingNeverRelevant: boolean;
  excludingSection: boolean;
}

export function ManualJudgmentPanel({
  effectiveCheckId,
  sectionKey,
  section,
  manualOverride,
  setManualOverride,
  manualOverrideNote,
  setManualOverrideNote,
  showOverrideNote,
  setShowOverrideNote,
  savingOverride,
  overrideError,
  handleSaveOverride,
  handleClearOverride,
  setShowFloorplanRelevantDialog,
  setShowNeverRelevantDialog,
  setShowExcludeDialog,
  markingFloorplanRelevant,
  markingNeverRelevant,
  excludingSection,
}: ManualJudgmentPanelProps) {
  if (!effectiveCheckId) return null;

  return (
    <div className="border-b bg-gray-50 p-4 flex-shrink-0">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Manual Compliance Judgment
      </div>

      <div className="space-y-3">
        {/* Override Status Banner */}
        {manualOverride && (
          <div
            className={`px-3 py-2 rounded border ${
              manualOverride === 'compliant'
                ? 'bg-green-50 border-green-200 text-green-800'
                : manualOverride === 'non_compliant'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-gray-50 border-gray-200 text-gray-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">
                ✓ Manual Override:{' '}
                {manualOverride === 'compliant'
                  ? 'COMPLIANT'
                  : manualOverride === 'non_compliant'
                    ? 'NON-COMPLIANT'
                    : 'NOT APPLICABLE'}
              </span>
              <button
                onClick={handleClearOverride}
                disabled={savingOverride}
                className="text-xs underline hover:no-underline disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Five-button toggle - all in one row */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">
            Set Compliance Status
          </label>
          <div className="flex gap-1">
            <button
              onClick={() => setManualOverride('compliant')}
              disabled={savingOverride}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded border transition-colors disabled:opacity-50 ${
                manualOverride === 'compliant'
                  ? 'bg-green-100 border-green-400 text-green-800'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Compliant
            </button>
            <button
              onClick={() => setManualOverride('non_compliant')}
              disabled={savingOverride}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded border transition-colors disabled:opacity-50 ${
                manualOverride === 'non_compliant'
                  ? 'bg-red-100 border-red-400 text-red-800'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Non-Compliant
            </button>
            <button
              onClick={() => setManualOverride('not_applicable')}
              disabled={savingOverride}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded border transition-colors disabled:opacity-50 ${
                manualOverride === 'not_applicable'
                  ? 'bg-gray-100 border-gray-400 text-gray-800'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Not Applicable
            </button>
            <button
              onClick={() => setShowFloorplanRelevantDialog(true)}
              disabled={savingOverride || markingFloorplanRelevant || !sectionKey}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded border transition-colors disabled:opacity-50 ${
                section?.floorplan_relevant
                  ? 'bg-blue-100 border-blue-400 text-blue-800'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
              title="Flag this section as specifically relevant to floorplan analysis - it will be prioritized when displaying sections"
            >
              Floorplan Specific
            </button>
            <button
              onClick={() => setShowNeverRelevantDialog(true)}
              disabled={savingOverride || markingNeverRelevant || !sectionKey}
              className="flex-1 px-2 py-1.5 text-xs font-medium rounded border border-red-300 bg-white text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
              title="Mark as never relevant (permanent)"
            >
              Never Relevant
            </button>
          </div>
        </div>

        {/* Optional note toggle */}
        {manualOverride && (
          <div>
            <button
              onClick={() => setShowOverrideNote(!showOverrideNote)}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              {showOverrideNote ? '− Hide' : '+ Add'} Note
            </button>
          </div>
        )}

        {/* Note textarea */}
        {showOverrideNote && manualOverride && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Reasoning (Optional)
            </label>
            <textarea
              value={manualOverrideNote}
              onChange={e => setManualOverrideNote(e.target.value)}
              disabled={savingOverride}
              placeholder="Explain why this check is compliant or non-compliant..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>
        )}

        {/* Exclude from project button */}
        <div className="pt-2 border-t border-gray-200">
          <button
            onClick={() => setShowExcludeDialog(true)}
            disabled={excludingSection || !sectionKey}
            className="w-full px-3 py-2 text-sm text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-300 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Exclude this section from the current project (all instances)"
          >
            🚫 Exclude Section from Project
          </button>
        </div>

        {/* Save button */}
        {manualOverride && (
          <button
            onClick={handleSaveOverride}
            disabled={savingOverride}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
          >
            {savingOverride ? 'Saving...' : 'Save Manual Override'}
          </button>
        )}

        {/* Error message */}
        {overrideError && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {overrideError}
          </div>
        )}
      </div>
    </div>
  );
}
