import { useState, useCallback, useEffect } from 'react';

export interface ManualOverrideState {
  override: string | null;
  note: string;
  saving: boolean;
  error: string | null;
  showNoteInput: boolean;
}

export interface ManualOverrideActions {
  setOverride: (override: string | null) => void;
  setNote: (note: string) => void;
  setShowNoteInput: (show: boolean) => void;
  saveOverride: (checkId: string) => Promise<void>;
  clearError: () => void;
}

export interface UseManualOverrideOptions {
  initialOverride?: string | null;
  initialNote?: string;
  checkId?: string | null; // Add checkId to detect when we switch checks
  onSaveSuccess?: () => void;
  onCheckDeleted?: () => void;
}

export interface UseManualOverrideReturn {
  state: ManualOverrideState;
  actions: ManualOverrideActions;
}

/**
 * Hook for managing manual override state and API interactions
 *
 * Handles:
 * - Override value and note state
 * - Save operation with error handling
 * - UI state (note input visibility, saving status)
 * - 404 handling for deleted checks
 */
export function useManualOverride(options: UseManualOverrideOptions = {}): UseManualOverrideReturn {
  const {
    initialOverride = null,
    initialNote = '',
    checkId = null,
    onSaveSuccess,
    onCheckDeleted,
  } = options;

  const [override, setOverride] = useState<string | null>(initialOverride);
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNoteInput, setShowNoteInput] = useState(false);

  // Sync internal state when check ID or initial values change (e.g., switching checks)
  useEffect(() => {
    // console.log('[useManualOverride] 🔄 Syncing state:', { checkId, initialOverride, initialNote });
    setOverride(initialOverride);
    setNote(initialNote);
    setShowNoteInput(false); // Reset UI state when switching checks
    setError(null); // Clear errors when switching checks
  }, [checkId, initialOverride, initialNote]);

  const saveOverride = useCallback(
    async (checkId: string) => {
      if (!checkId) {
        throw new Error('Check ID is required');
      }

      setSaving(true);
      setError(null);

      try {
        const response = await fetch(`/api/checks/${checkId}/manual-override`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            override,
            note: note.trim() || undefined,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          if (response.status === 404) {
            // Check was deleted or excluded
            if (onCheckDeleted) {
              onCheckDeleted();
            }
            throw new Error('This check has been deleted or excluded. The list will refresh.');
          }
          throw new Error(data.error || 'Failed to save override');
        }

        // Success - invoke callback
        if (onSaveSuccess) {
          onSaveSuccess();
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [override, note, onSaveSuccess, onCheckDeleted]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    state: {
      override,
      note,
      saving,
      error,
      showNoteInput,
    },
    actions: {
      setOverride,
      setNote,
      setShowNoteInput,
      saveOverride,
      clearError,
    },
  };
}
