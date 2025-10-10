'use client';

import { useState, useEffect } from 'react';
import type { ViolationMarker } from '@/lib/reports/get-violations';
import type { ComplianceOverrideStatus } from '@/types/database';
import Modal from '@/components/ui/Modal';

interface Props {
  violation: ViolationMarker;
  onClose: () => void;
  onCheckUpdate: () => void; // Refresh violations list after manual override
}

export function ViolationDetailPanel({ violation, onClose, onCheckUpdate }: Props) {
  const [manualOverride, setManualOverride] = useState<ComplianceOverrideStatus | null>(null);
  const [manualOverrideNote, setManualOverrideNote] = useState('');
  const [showOverrideNote, setShowOverrideNote] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [presignedUrls, setPresignedUrls] = useState<
    Record<string, { screenshot: string; thumbnail: string }>
  >({});
  const [previewScreenshot, setPreviewScreenshot] = useState<string | null>(null);

  // Load check data to get current manual override
  useEffect(() => {
    if (!violation.checkId) return;

    fetch(`/api/checks/${violation.checkId}`)
      .then(res => res.json())
      .then(data => {
        if (data.check) {
          setManualOverride(data.check.manual_override || null);
          setManualOverrideNote(data.check.manual_override_note || '');
          setShowOverrideNote(!!data.check.manual_override_note);
        }
      })
      .catch(err => console.error('Failed to load check data:', err));
  }, [violation.checkId]);

  // Fetch presigned URLs for screenshots
  useEffect(() => {
    if (!violation.screenshotUrl) return;

    (async () => {
      try {
        const res = await fetch('/api/screenshots/presign-view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            screenshotUrl: violation.screenshotUrl,
            thumbnailUrl: violation.thumbnailUrl,
          }),
        });
        const data = await res.json();
        setPresignedUrls({ [violation.screenshotId]: data });
      } catch (err) {
        console.error('Failed to get presigned URL:', err);
      }
    })();
  }, [violation.screenshotUrl, violation.thumbnailUrl, violation.screenshotId]);

  const handleSaveOverride = async () => {
    if (!violation.checkId || !manualOverride) return;

    setSavingOverride(true);
    setOverrideError(null);

    try {
      const response = await fetch(`/api/checks/${violation.checkId}/manual-override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          override: manualOverride,
          note: manualOverrideNote.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save override');
      }

      // Notify parent to refresh violations list
      onCheckUpdate();

      // Close panel after successful save
      onClose();
    } catch (err: any) {
      console.error('Override save error:', err);
      setOverrideError(err.message);
    } finally {
      setSavingOverride(false);
    }
  };

  const handleClearOverride = async () => {
    setManualOverride(null);
    setManualOverrideNote('');
    setShowOverrideNote(false);

    if (!violation.checkId) return;

    setSavingOverride(true);
    setOverrideError(null);

    try {
      const response = await fetch(`/api/checks/${violation.checkId}/manual-override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ override: null }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to clear override');
      }

      onCheckUpdate();
    } catch (err: any) {
      console.error('Override clear error:', err);
      setOverrideError(err.message);
    } finally {
      setSavingOverride(false);
    }
  };

  const getSeverityBadgeClass = () => {
    switch (violation.severity) {
      case 'major':
        return 'bg-red-100 border-red-400 text-red-800';
      case 'moderate':
        return 'bg-yellow-100 border-yellow-400 text-yellow-800';
      case 'minor':
        return 'bg-blue-100 border-blue-400 text-blue-800';
      case 'needs_more_info':
        return 'bg-orange-100 border-orange-400 text-orange-800';
      default:
        return 'bg-gray-100 border-gray-400 text-gray-800';
    }
  };

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900">Violation Details</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {violation.checkType === 'element' && violation.elementGroupName
              ? `${violation.elementGroupName}${violation.instanceLabel ? ` - ${violation.instanceLabel}` : ''}`
              : 'Section Check'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors ml-2 flex-shrink-0"
          aria-label="Close panel"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Check Info */}
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Code Section
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-lg font-mono font-bold text-gray-900">
              {violation.codeSectionNumber}
            </span>
          </div>
          {violation.checkName && (
            <div className="text-sm text-gray-700 mt-1">{violation.checkName}</div>
          )}
          {violation.sourceUrl && (
            <a
              href={violation.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              See Original Code
              <svg
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                className="flex-shrink-0"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          )}
        </div>

        {/* Analysis Results */}
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            AI Analysis
          </div>

          {/* Status Badge */}
          <div
            className={`inline-flex px-3 py-1.5 rounded-full border-2 text-sm font-semibold mb-3 ${getSeverityBadgeClass()}`}
          >
            {violation.severity === 'needs_more_info'
              ? 'Needs More Information'
              : `Non-Compliant (${violation.severity})`}
          </div>

          {/* Description */}
          {violation.description && (
            <div className="mb-4">
              <div className="text-xs font-medium text-gray-700 mb-1">Violation</div>
              <div className="text-sm text-gray-800 bg-red-50 border border-red-200 rounded p-3">
                {violation.description}
              </div>
            </div>
          )}

          {/* Reasoning */}
          {violation.reasoning && (
            <div className="mb-4">
              <div className="text-xs font-medium text-gray-700 mb-1">Reasoning</div>
              <div className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded p-3 whitespace-pre-wrap">
                {violation.reasoning}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {violation.recommendations && violation.recommendations.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-700 mb-1">Recommendations</div>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-800 bg-blue-50 border border-blue-200 rounded p-3">
                {violation.recommendations.map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Confidence */}
          {violation.confidence && (
            <div className="mt-3 text-xs text-gray-600">
              Confidence: <span className="font-medium">{violation.confidence}</span>
            </div>
          )}
        </div>

        {/* Screenshots */}
        {violation.screenshotUrl && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Screenshot
            </div>
            <div className="border rounded-lg overflow-hidden bg-gray-50">
              {presignedUrls[violation.screenshotId]?.thumbnail ? (
                <button
                  onClick={() =>
                    setPreviewScreenshot(presignedUrls[violation.screenshotId]?.screenshot)
                  }
                  className="w-full hover:opacity-90 transition-opacity"
                >
                  <img
                    src={presignedUrls[violation.screenshotId].thumbnail}
                    alt="Violation screenshot"
                    className="w-full h-auto"
                  />
                </button>
              ) : (
                <div className="w-full h-40 flex items-center justify-center text-sm text-gray-500">
                  Loading screenshot...
                </div>
              )}
              <div className="px-3 py-2 bg-white border-t text-xs text-gray-600">
                Page {violation.pageNumber}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manual Override Controls */}
      <div className="border-t bg-gray-50 p-4 flex-shrink-0">
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
                    : manualOverride === 'insufficient_information'
                      ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
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
                      : manualOverride === 'insufficient_information'
                        ? 'NEEDS MORE INFO'
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

          {/* Status Buttons */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Set Compliance Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setManualOverride('compliant')}
                disabled={savingOverride}
                className={`px-3 py-2 text-xs font-medium rounded border transition-colors disabled:opacity-50 ${
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
                className={`px-3 py-2 text-xs font-medium rounded border transition-colors disabled:opacity-50 ${
                  manualOverride === 'non_compliant'
                    ? 'bg-red-100 border-red-400 text-red-800'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Non-Compliant
              </button>
              <button
                onClick={() => setManualOverride('insufficient_information')}
                disabled={savingOverride}
                className={`px-3 py-2 text-xs font-medium rounded border transition-colors disabled:opacity-50 ${
                  manualOverride === 'insufficient_information'
                    ? 'bg-yellow-100 border-yellow-400 text-yellow-800'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Needs More Info
              </button>
              <button
                onClick={() => setManualOverride('not_applicable')}
                disabled={savingOverride}
                className={`px-3 py-2 text-xs font-medium rounded border transition-colors disabled:opacity-50 ${
                  manualOverride === 'not_applicable'
                    ? 'bg-gray-100 border-gray-400 text-gray-800'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
                title="This code section is not relevant to this design"
              >
                Not Applicable
              </button>
            </div>
          </div>

          {/* Note Toggle */}
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

          {/* Note Textarea */}
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

          {/* Save Button */}
          {manualOverride && (
            <button
              onClick={handleSaveOverride}
              disabled={savingOverride}
              className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
            >
              {savingOverride ? 'Saving...' : 'Save Manual Override'}
            </button>
          )}

          {/* Error Message */}
          {overrideError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {overrideError}
            </div>
          )}
        </div>
      </div>

      {/* Screenshot Preview Modal */}
      <Modal
        open={!!previewScreenshot}
        onClose={() => setPreviewScreenshot(null)}
        title="Screenshot Preview"
      >
        {previewScreenshot && (
          <img src={previewScreenshot} alt="Screenshot preview" className="max-h-[70vh] rounded" />
        )}
      </Modal>
    </div>
  );
}
