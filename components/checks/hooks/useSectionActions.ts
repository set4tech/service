import { useState } from 'react';

interface Check {
  id: string;
  check_type?: string;
}

export function useSectionActions(
  sectionKey: string | null,
  check: Check | null,
  checkId: string | null,
  activeCheck: any,
  onClose: () => void,
  onCheckUpdate?: () => void,
  onRefreshChildChecks?: () => void,
  setOverrideError?: (error: string | null) => void
) {
  // Never relevant state
  const [showNeverRelevantDialog, setShowNeverRelevantDialog] = useState(false);
  const [markingNeverRelevant, setMarkingNeverRelevant] = useState(false);

  // Floorplan relevant state
  const [showFloorplanRelevantDialog, setShowFloorplanRelevantDialog] = useState(false);
  const [markingFloorplanRelevant, setMarkingFloorplanRelevant] = useState(false);

  // Project exclusion state
  const [showExcludeDialog, setShowExcludeDialog] = useState(false);
  const [excludingSection, setExcludingSection] = useState(false);
  const [excludeReason, setExcludeReason] = useState('');

  const handleMarkNeverRelevant = async () => {
    if (!sectionKey) return;

    setMarkingNeverRelevant(true);
    if (setOverrideError) setOverrideError(null);

    try {
      const response = await fetch(`/api/sections/${sectionKey}/mark-never-relevant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to mark section as never relevant');
      }

      // Close dialog
      setShowNeverRelevantDialog(false);

      // For element checks, refresh the child checks to remove the marked section
      if (check?.check_type === 'element' && onRefreshChildChecks) {
        console.log('Refreshing child checks after marking section never relevant');
        onRefreshChildChecks();
      } else {
        // For section checks, close the panel
        onClose();
      }

      // Notify parent to refresh
      if (onCheckUpdate) {
        onCheckUpdate();
      }
    } catch (err: any) {
      console.error('Mark never relevant error:', err);
      if (setOverrideError) setOverrideError(err.message);
    } finally {
      setMarkingNeverRelevant(false);
    }
  };

  const handleMarkFloorplanRelevant = async () => {
    if (!sectionKey) return;

    setMarkingFloorplanRelevant(true);
    if (setOverrideError) setOverrideError(null);

    try {
      const response = await fetch(`/api/sections/${sectionKey}/mark-floorplan-relevant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to mark section as floorplan relevant');
      }

      // Close dialog
      setShowFloorplanRelevantDialog(false);

      // Notify parent to refresh (section order may change)
      if (onCheckUpdate) {
        onCheckUpdate();
      }
    } catch (err: any) {
      console.error('Mark floorplan relevant error:', err);
      if (setOverrideError) setOverrideError(err.message);
    } finally {
      setMarkingFloorplanRelevant(false);
    }
  };

  const handleExcludeFromProject = async () => {
    if (!sectionKey) return;

    setExcludingSection(true);
    if (setOverrideError) setOverrideError(null);

    try {
      // Get assessment_id from activeCheck
      const assessmentId = activeCheck?.assessment_id;
      if (!assessmentId) {
        throw new Error('Assessment ID not found');
      }

      const response = await fetch(`/api/assessments/${assessmentId}/exclude-section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionKey,
          reason: excludeReason.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to exclude section from project');
      }

      // Close dialog
      setShowExcludeDialog(false);
      setExcludeReason('');

      // For element checks, refresh the child checks to remove the excluded section
      if (check?.check_type === 'element' && onRefreshChildChecks) {
        console.log('Refreshing child checks after excluding section');
        onRefreshChildChecks();
      } else {
        // For section checks, close the panel
        onClose();
      }

      // Notify parent to refresh
      if (onCheckUpdate) {
        onCheckUpdate();
      }
    } catch (err: any) {
      console.error('Exclude section error:', err);
      if (setOverrideError) setOverrideError(err.message);
    } finally {
      setExcludingSection(false);
    }
  };

  return {
    showNeverRelevantDialog,
    setShowNeverRelevantDialog,
    markingNeverRelevant,
    handleMarkNeverRelevant,
    showFloorplanRelevantDialog,
    setShowFloorplanRelevantDialog,
    markingFloorplanRelevant,
    handleMarkFloorplanRelevant,
    showExcludeDialog,
    setShowExcludeDialog,
    excludingSection,
    excludeReason,
    setExcludeReason,
    handleExcludeFromProject,
  };
}
