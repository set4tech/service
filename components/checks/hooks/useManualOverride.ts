import { useState, useEffect } from 'react';

type OverrideStatus =
  | 'compliant'
  | 'non_compliant'
  | 'not_applicable'
  | 'insufficient_information'
  | null;

export function useManualOverride(
  effectiveCheckId: string | null,
  onCheckUpdate?: () => void,
  onAssessmentStop?: () => void
) {
  const [manualOverride, setManualOverride] = useState<OverrideStatus>(null);
  const [manualOverrideNote, setManualOverrideNote] = useState('');
  const [showOverrideNote, setShowOverrideNote] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  // Load manual override when effectiveCheckId changes
  useEffect(() => {
    if (!effectiveCheckId) {
      setManualOverride(null);
      setManualOverrideNote('');
      return;
    }

    fetch(`/api/checks/${effectiveCheckId}`)
      .then(res => res.json())
      .then(checkData => {
        if (checkData.check) {
          setManualOverride(checkData.check.manual_status || null);
          setManualOverrideNote(checkData.check.manual_status_note || '');
          setShowOverrideNote(!!checkData.check.manual_status_note);
        }
      })
      .catch(err => {
        console.error('Failed to load check data:', err);
      });
  }, [effectiveCheckId]);

  const handleSaveOverride = async () => {
    if (!effectiveCheckId) return;

    setSavingOverride(true);
    setOverrideError(null);

    try {
      const response = await fetch(`/api/checks/${effectiveCheckId}/manual-override`, {
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

      // Stop any ongoing analysis
      if (onAssessmentStop) {
        onAssessmentStop();
      }

      // Notify parent component
      if (onCheckUpdate) {
        onCheckUpdate();
      }
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

    // Auto-save when clearing
    if (!effectiveCheckId) return;

    setSavingOverride(true);
    setOverrideError(null);

    try {
      const response = await fetch(`/api/checks/${effectiveCheckId}/manual-override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ override: null }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to clear override');
      }

      // Notify parent component
      if (onCheckUpdate) {
        onCheckUpdate();
      }
    } catch (err: any) {
      console.error('Override clear error:', err);
      setOverrideError(err.message);
    } finally {
      setSavingOverride(false);
    }
  };

  return {
    manualOverride,
    setManualOverride,
    manualOverrideNote,
    setManualOverrideNote,
    showOverrideNote,
    setShowOverrideNote,
    savingOverride,
    overrideError,
    setOverrideError,
    handleSaveOverride,
    handleClearOverride,
  };
}
