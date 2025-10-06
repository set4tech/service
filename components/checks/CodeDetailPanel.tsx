'use client';

import { useEffect, useState } from 'react';
import { ScreenshotGallery } from '@/components/screenshots/ScreenshotGallery';
import { TableRenderer } from '@/components/ui/TableRenderer';
import { TriageModal } from './TriageModal';
import { AnalysisHistory } from './AnalysisHistory';
import type { SectionResult, AnalysisRun, CodeSection } from '@/types/analysis';

interface Check {
  id: string;
  check_type?: string;
  element_sections?: string[];
  element_group_name?: string;
  instance_number?: number;
}

interface CodeDetailPanelProps {
  checkId: string | null;
  sectionKey: string | null;
  onClose: () => void;
  onCheckUpdate?: () => void; // Callback when check is updated
  activeCheck?: any; // Active check object (for screenshots)
  screenshotsRefreshKey?: number; // Key to trigger screenshot refresh
  onScreenshotAssigned?: () => void; // Callback when screenshot is assigned to other checks
}

export function CodeDetailPanel({
  checkId,
  sectionKey,
  onClose,
  onCheckUpdate,
  activeCheck,
  screenshotsRefreshKey,
  onScreenshotAssigned,
}: CodeDetailPanelProps) {
  const [check, setCheck] = useState<Check | null>(null);
  const [sections, setSections] = useState<CodeSection[]>([]);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For element checks: child section checks
  const [childChecks, setChildChecks] = useState<any[]>([]);
  const [activeChildCheckId, setActiveChildCheckId] = useState<string | null>(null);

  // Computed: current section to display
  const section = sections[activeSectionIndex] || null;

  // Computed: effective check ID (child check for elements, main check otherwise)
  const effectiveCheckId = activeChildCheckId || checkId;

  // Assessment state
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-pro');
  const [extraContext, setExtraContext] = useState('');
  const [showExtraContext, setShowExtraContext] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [assessmentProgress, setAssessmentProgress] = useState(0);
  const [assessmentMessage, setAssessmentMessage] = useState('');
  const [_currentBatchGroupId, setCurrentBatchGroupId] = useState<string | null>(null);

  // Prompt editing state
  const [showPrompt, setShowPrompt] = useState(false);
  const [defaultPrompt, setDefaultPrompt] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isPromptEditing, setIsPromptEditing] = useState(false);
  const [loadingPrompt, setLoadingPrompt] = useState(false);

  // Analysis history state
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  // Manual override state
  const [manualOverride, setManualOverride] = useState<
    'compliant' | 'non_compliant' | 'not_applicable' | null
  >(null);
  const [manualOverrideNote, setManualOverrideNote] = useState('');
  const [showOverrideNote, setShowOverrideNote] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

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

  // Section tabs toggle state
  const [showSectionTabs, setShowSectionTabs] = useState(false);

  // Triage modal state
  const [showTriageModal, setShowTriageModal] = useState(false);
  const [triageSections, setTriageSections] = useState<SectionResult[]>([]);

  // Screenshots section toggle state
  const [showScreenshots, setShowScreenshots] = useState(true);

  // Resizable section content height (percentage of available space)
  const [sectionContentHeight, setSectionContentHeight] = useState(40); // 40% default

  // Load last selected model from localStorage
  useEffect(() => {
    const lastModel = localStorage.getItem('lastSelectedAIModel');
    if (lastModel) {
      setSelectedModel(lastModel);
    }
  }, []);

  // Load check data and determine if it's an element check
  useEffect(() => {
    if (!checkId) {
      setCheck(null);
      setChildChecks([]);
      setActiveChildCheckId(null);
      return;
    }

    // Don't reset assessment state immediately - check if analysis is in progress first
    // We'll check progress status after loading check data

    fetch(`/api/checks/${checkId}`)
      .then(res => res.json())
      .then(data => {
        if (data.check) {
          console.log('CodeDetailPanel: Loaded check', {
            id: data.check.id,
            type: data.check.check_type,
            instance_number: data.check.instance_number,
            element_sections: data.check.element_sections,
          });
          setCheck(data.check);

          // If this is an element check, fetch child section checks
          if (data.check.check_type === 'element') {
            console.log('CodeDetailPanel: Fetching child checks for element check', checkId);
            return fetch(`/api/checks?parent_check_id=${checkId}`).then(res => res.json());
          }
        }
        return null;
      })
      .then(childData => {
        if (childData && Array.isArray(childData)) {
          console.log('CodeDetailPanel: Loaded child checks', {
            count: childData.length,
            sections: childData.map(c => c.code_section_number),
          });
          // Sort by section number
          const sorted = childData.sort((a, b) =>
            (a.code_section_number || '').localeCompare(b.code_section_number || '')
          );
          setChildChecks(sorted);
          // Set first child as active
          if (sorted.length > 0) {
            setActiveChildCheckId(sorted[0].id);
          }
        } else {
          console.log('CodeDetailPanel: No child checks found');
        }
      })
      .catch(err => {
        console.error('Failed to load check:', err);
      });
  }, [checkId]);

  // Check for in-progress analysis when checkId changes
  useEffect(() => {
    if (!checkId) return;

    fetch(`/api/checks/${checkId}/assessment-progress`)
      .then(res => res.json())
      .then(data => {
        if (data.inProgress) {
          setAssessing(true);
          setAssessmentProgress(Math.round((data.completed / data.total) * 100));
          setAssessmentMessage(`Analyzing... (${data.completed}/${data.total})`);
        } else {
          setAssessing(false);
        }
      })
      .catch(() => setAssessing(false));
  }, [checkId]);

  // Poll for progress whenever assessing is true
  useEffect(() => {
    if (!assessing || !checkId) return;

    console.log('[Poll] Starting polling for checkId:', checkId);
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/checks/${checkId}/assessment-progress`);
        const data = await res.json();

        if (data.inProgress) {
          setAssessmentProgress(Math.round((data.completed / data.total) * 100));
          setAssessmentMessage(`Analyzing... (${data.completed}/${data.total})`);

          // Trigger queue processing to ensure jobs are being processed
          fetch('/api/queue/process').catch(err => console.error('Failed to trigger queue:', err));

          // Update runs (only add new ones)
          if (data.runs && data.runs.length > 0) {
            setAnalysisRuns(prev => {
              const existingIds = new Set(prev.map((r: any) => r.id));
              const newRuns = data.runs.filter((r: any) => !existingIds.has(r.id));
              if (newRuns.length > 0) {
                setExpandedRuns(prevExpanded => {
                  const updated = new Set(prevExpanded);
                  newRuns.forEach((r: any) => updated.add(r.id));
                  return updated;
                });
                return [...newRuns, ...prev];
              }
              return prev;
            });
          }
        } else {
          console.log('[Poll] Assessment complete detected');
          setAssessing(false);
          setAssessmentMessage('Assessment complete!');
          setExtraContext('');
          setShowExtraContext(false);

          // Fetch updated analysis runs
          if (checkId) {
            console.log('[Poll] Fetching updated analysis runs for check:', checkId);
            fetch(`/api/checks/${checkId}/analysis-runs`)
              .then(res => {
                console.log('[Poll] Fetch response status:', res.status);
                return res.json();
              })
              .then(runsData => {
                console.log('[Poll] Received runs data:', runsData);
                if (runsData.runs) {
                  console.log('[Poll] Setting analysis runs, count:', runsData.runs.length);
                  setAnalysisRuns(runsData.runs);
                  // Expand the newest run
                  if (runsData.runs.length > 0) {
                    console.log('[Poll] Expanding newest run:', runsData.runs[0].id);
                    setExpandedRuns(new Set([runsData.runs[0].id]));
                  }
                } else {
                  console.log('[Poll] No runs in response');
                }
              })
              .catch(err => console.error('[Poll] Failed to load updated analysis:', err));
          } else {
            console.log('[Poll] No checkId available for fetching runs');
          }

          if (onCheckUpdate) onCheckUpdate();
        }
      } catch (err) {
        console.error('Poll error:', err);
        setAssessing(false);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [assessing, checkId, onCheckUpdate]);

  // Load code sections
  useEffect(() => {
    // For element checks with child checks, load section based on active child check
    if (childChecks.length > 0 && activeChildCheckId) {
      const activeChild = childChecks.find(c => c.id === activeChildCheckId);
      if (!activeChild?.code_section_key) {
        setSections([]);
        return;
      }

      setLoading(true);
      setError(null);

      fetch('/api/compliance/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionKey: activeChild.code_section_key }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            setError(data.error);
            setSections([]);
          } else {
            setSections([data]);
            setActiveSectionIndex(0);
          }
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to load section:', err);
          setError(err.message);
          setLoading(false);
        });

      return;
    }

    // Original logic for non-element checks
    if (!sectionKey && !check?.element_sections) {
      setSections([]);
      setActiveSectionIndex(0);
      return;
    }

    setLoading(true);
    setError(null);

    // Determine which sections to load
    const sectionKeys = check?.element_sections || (sectionKey ? [sectionKey] : []);

    if (sectionKeys.length === 0) {
      setSections([]);
      setLoading(false);
      return;
    }

    // Load all sections in parallel
    Promise.all(
      sectionKeys.map(key =>
        fetch('/api/compliance/sections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sectionKey: key }),
        }).then(res => res.json())
      )
    )
      .then(results => {
        const loadedSections = results.filter(data => !data.error);
        setSections(loadedSections);
        setActiveSectionIndex(0);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load sections:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [sectionKey, check, childChecks, activeChildCheckId]);

  // Load analysis runs and manual override
  useEffect(() => {
    console.log('[InitialLoad] effectiveCheckId changed:', effectiveCheckId);
    if (!effectiveCheckId) {
      setAnalysisRuns([]);
      setManualOverride(null);
      setManualOverrideNote('');
      return;
    }

    console.log('[InitialLoad] Fetching analysis runs for:', effectiveCheckId);
    setLoadingRuns(true);
    Promise.all([
      fetch(`/api/checks/${effectiveCheckId}/analysis-runs`).then(res => res.json()),
      fetch(`/api/checks/${effectiveCheckId}`).then(res => res.json()),
    ])
      .then(([runsData, checkData]) => {
        console.log('[InitialLoad] Received data:', { runsData, checkData });
        if (runsData.runs) {
          console.log('[InitialLoad] Setting analysis runs, count:', runsData.runs.length);
          setAnalysisRuns(runsData.runs);
        }
        if (checkData.check) {
          setManualOverride(checkData.check.manual_override || null);
          setManualOverrideNote(checkData.check.manual_override_note || '');
          setShowOverrideNote(!!checkData.check.manual_override_note);
        }
        setLoadingRuns(false);
      })
      .catch(err => {
        console.error('[InitialLoad] Failed to load check data:', err);
        setLoadingRuns(false);
      });
  }, [effectiveCheckId]);

  // Load prompt when user clicks to view it
  const handleViewPrompt = async () => {
    if (!checkId) return;

    setShowPrompt(true);

    // If we already loaded the prompt, don't fetch again
    if (defaultPrompt) return;

    setLoadingPrompt(true);
    try {
      const response = await fetch(`/api/checks/${checkId}/prompt`);
      const data = await response.json();

      if (response.ok && data.prompt) {
        setDefaultPrompt(data.prompt);
      }
    } catch (err) {
      console.error('Failed to load prompt:', err);
    } finally {
      setLoadingPrompt(false);
    }
  };

  const handleEditPrompt = () => {
    setIsPromptEditing(true);
    setCustomPrompt(defaultPrompt);
  };

  const handleResetPrompt = () => {
    setCustomPrompt('');
    setIsPromptEditing(false);
  };

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
      setAssessing(false);
      setAssessmentMessage('');
      setAssessmentProgress(0);

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

  const handleMarkNeverRelevant = async () => {
    if (!sectionKey) return;

    setMarkingNeverRelevant(true);
    setOverrideError(null);

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

      // Close the panel since this section is now hidden
      onClose();

      // Notify parent to refresh
      if (onCheckUpdate) {
        onCheckUpdate();
      }
    } catch (err: any) {
      console.error('Mark never relevant error:', err);
      setOverrideError(err.message);
    } finally {
      setMarkingNeverRelevant(false);
    }
  };

  const handleMarkFloorplanRelevant = async () => {
    if (!sectionKey) return;

    setMarkingFloorplanRelevant(true);
    setOverrideError(null);

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
      setOverrideError(err.message);
    } finally {
      setMarkingFloorplanRelevant(false);
    }
  };

  const handleExcludeFromProject = async () => {
    if (!sectionKey) return;

    setExcludingSection(true);
    setOverrideError(null);

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

      // Only close the panel if this is a section check (which gets deleted)
      // For element checks, keep the panel open since the instance is still valid
      if (check?.check_type !== 'element') {
        onClose();
      }

      // Notify parent to refresh
      if (onCheckUpdate) {
        onCheckUpdate();
      }
    } catch (err: any) {
      console.error('Exclude section error:', err);
      setOverrideError(err.message);
    } finally {
      setExcludingSection(false);
    }
  };

  const handleAssess = async () => {
    if (!checkId) return;

    console.log(
      '[Assess] Starting assessment for checkId:',
      checkId,
      'effectiveCheckId:',
      effectiveCheckId
    );
    setAssessing(true);
    setAssessmentError(null);
    setAssessmentProgress(0);
    setAssessmentMessage('Starting assessment...');

    // Save selected model to localStorage
    localStorage.setItem('lastSelectedAIModel', selectedModel);

    try {
      // 1. Start assessment (returns immediately with first batch)
      console.log('[Assess] Calling /api/checks/' + checkId + '/assess');
      const response = await fetch(`/api/checks/${checkId}/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiProvider: selectedModel,
          customPrompt: customPrompt.trim() || undefined,
          extraContext: extraContext.trim() || undefined,
        }),
      });

      // Handle non-JSON responses (like 504 gateway timeouts)
      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error('Non-JSON response from assess endpoint:', text);
        throw new Error(`Server error (${response.status}): ${text.substring(0, 200)}`);
      }

      if (!response.ok) {
        console.error('Assessment failed:', data);
        throw new Error(data.error || 'Assessment failed');
      }

      const { batchGroupId, totalBatches } = data;
      setCurrentBatchGroupId(batchGroupId);

      // Set assessing=true - the centralized polling useEffect will handle progress updates
      setAssessmentMessage(`Processing batch 0/${totalBatches}...`);
      setAssessmentProgress(0);
    } catch (err: any) {
      console.error('=== ASSESSMENT ERROR (Frontend) ===');
      console.error('Error type:', err?.constructor?.name);
      console.error('Error message:', err?.message);
      console.error('Error stack:', err?.stack);
      console.error('Full error:', err);
      console.error('===================================');
      setAssessmentError(err.message);
      setAssessing(false);
    }
  };

  const toggleRunExpanded = (runId: string) => {
    const newExpanded = new Set(expandedRuns);
    if (newExpanded.has(runId)) {
      newExpanded.delete(runId);
    } else {
      newExpanded.add(runId);
    }
    setExpandedRuns(newExpanded);
  };

  const handleSectionResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = sectionContentHeight;
    const panelElement = (e.target as HTMLElement).closest('.h-full') as HTMLElement;
    if (!panelElement) return;
    const panelHeight = panelElement.clientHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const deltaPercent = (deltaY / panelHeight) * 100;
      const newHeight = Math.max(20, Math.min(80, startHeight + deltaPercent));
      setSectionContentHeight(newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (!sectionKey && !check?.element_sections) return null;

  const isElementCheck = check?.check_type === 'element' && sections.length > 1;
  const isNewElementInstance = check?.check_type === 'element' && (check?.instance_number ?? 0) > 0;

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900">
            {isElementCheck || isNewElementInstance
              ? `${activeCheck?.element_group_name || check?.element_group_name || 'Element'} Instance Details`
              : 'Code Section Details'}
          </h3>
          {isElementCheck && (
            <div className="text-xs text-gray-500 mt-0.5">{sections.length} related sections</div>
          )}
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

      {/* Section Tabs for Element Checks */}
      {(() => {
        console.log('CodeDetailPanel: Rendering section tabs?', {
          childChecksLength: childChecks.length,
          willRender: childChecks.length > 0,
          childChecks: childChecks.map(c => ({ id: c.id, section: c.code_section_number })),
        });
        return null;
      })()}
      {childChecks.length > 0 && (
        <div className="border-b bg-gray-50 flex-shrink-0">
          {/* Toggle Button */}
          <button
            onClick={() => setShowSectionTabs(!showSectionTabs)}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-700">Code Sections</span>
              <span className="text-xs text-gray-500">({childChecks.length})</span>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${showSectionTabs ? 'rotate-180' : ''}`}
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
          </button>

          {/* Expandable Section List */}
          {showSectionTabs && (
            <div className="px-2 pb-2 max-h-48 overflow-y-auto">
              <div className="space-y-1">
                {childChecks.map(childCheck => (
                  <button
                    key={childCheck.id}
                    onClick={() => setActiveChildCheckId(childCheck.id)}
                    className={`w-full px-3 py-2 text-xs font-medium rounded transition-colors text-left ${
                      childCheck.id === activeChildCheckId
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    {childCheck.code_section_number}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Compliance Judgment */}
      {effectiveCheckId && (
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
      )}

      {/* Content - Resizable Section */}
      <div className="overflow-y-auto p-4" style={{ height: `${sectionContentHeight}%` }}>
        {loading && <div className="text-sm text-gray-500">Loading section details...</div>}

        {error && (
          <div className="text-sm text-red-600">
            <p className="font-medium">Error loading section</p>
            <p className="text-xs mt-1">{error}</p>
          </div>
        )}

        {/* Element Check Info Banner */}
        {isElementCheck && !loading && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <svg
                width="20"
                height="20"
                className="text-blue-600 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
              <div>
                <div className="text-sm font-semibold text-blue-900 mb-1">Element-Based Check</div>
                <div className="text-xs text-blue-800 leading-relaxed">
                  This {check?.element_group_name?.toLowerCase().replace(/s$/, '')} check evaluates{' '}
                  <span className="font-semibold">{sections.length} code sections</span> together in
                  a single assessment. All requirements from these sections apply to this specific{' '}
                  {check?.element_group_name?.toLowerCase().replace(/s$/, '')}.
                </div>
              </div>
            </div>
          </div>
        )}

        {section && !loading && (
          <div className="space-y-6">
            {/* Intro Section - Section Group Overview */}
            {section.intro_section && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
                  Section Group Overview
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-sm font-mono font-medium text-blue-900">
                    {section.intro_section.number}
                  </span>
                  <span className="text-sm text-blue-800">{section.intro_section.title}</span>
                </div>
                {section.intro_section.text && (
                  <div className="text-sm text-blue-900 leading-relaxed italic mt-2">
                    {section.intro_section.text}
                  </div>
                )}
              </div>
            )}

            {/* Section Header */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Section
                </div>
                {section.source_url && (
                  <a
                    href={section.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
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
              <div className="text-lg font-bold text-gray-900">{section.number}</div>
              <div className="text-base text-gray-700 mt-1">{section.title}</div>
            </div>

            {/* Section Text */}
            {section.text && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Section Summary
                </div>
                <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200">
                  {section.text}
                </div>
              </div>
            )}

            {/* Explanation (Paragraphs) */}
            {section.requirements && section.requirements.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Explanation
                </div>
                <div className="space-y-3">
                  {section.requirements.map((req, idx) => {
                    const text = typeof req === 'string' ? req : req.text || '';
                    return (
                      <div key={idx} className="text-sm text-gray-800 leading-relaxed">
                        <div className="text-xs text-gray-500 font-mono mb-1">
                          Paragraph {idx + 1}
                        </div>
                        <div className="pl-3 border-l-2 border-gray-300">{text}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tables */}
            {section.tables && section.tables.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Tables
                </div>
                <TableRenderer tables={section.tables} />
              </div>
            )}

            {/* References */}
            {section.references && section.references.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Referenced Sections
                </div>
                <div className="space-y-3">
                  {section.references.map(ref => (
                    <div key={ref.key} className="border border-gray-200 rounded p-3 bg-blue-50">
                      <div className="font-medium text-sm text-blue-900">{ref.number}</div>
                      <div className="text-sm text-gray-700 mt-1">{ref.title}</div>
                      {ref.text && (
                        <div className="text-xs text-gray-600 mt-2 leading-relaxed whitespace-pre-wrap">
                          {ref.text}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!section.text && (!section.requirements || section.requirements.length === 0) && (
              <div className="text-sm text-gray-500 italic">
                No detailed content available for this section.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resize Handle */}
      <div
        onMouseDown={handleSectionResizeStart}
        className="h-1 bg-gray-200 hover:bg-blue-500 cursor-row-resize flex-shrink-0 transition-colors"
        style={{ touchAction: 'none' }}
      />

      {/* Assessment Controls - Takes remaining space */}
      {checkId && (
        <div
          className="border-t bg-gray-50 overflow-y-auto"
          style={{ height: `${100 - sectionContentHeight}%` }}
        >
          <div className="p-4 space-y-6">
            {/* Screenshots Section */}
            {activeCheck && (
              <div className="border-t pt-6">
                <div className="mb-3">
                  <button
                    onClick={() => setShowScreenshots(!showScreenshots)}
                    className="w-full flex items-center justify-between hover:bg-gray-100 transition-colors px-2 py-1 rounded"
                  >
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Screenshots
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${showScreenshots ? 'rotate-180' : ''}`}
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
                  </button>
                </div>

                {showScreenshots && (
                  <div className="pb-4">
                    <ScreenshotGallery
                      check={activeCheck}
                      refreshKey={screenshotsRefreshKey || 0}
                      onScreenshotAssigned={onScreenshotAssigned}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Assessment Section */}
            <div className="border-t pt-6">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                AI Assessment
              </div>

              <div className="space-y-3">
                {/* Model Selector */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">AI Model</label>
                  <select
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    disabled={assessing}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  >
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="claude-opus-4">Claude Opus 4</option>
                    <option value="gpt-4o">GPT-4o</option>
                  </select>
                </div>

                {/* View/Edit Prompt Section */}
                <div>
                  <button
                    onClick={handleViewPrompt}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {showPrompt ? '− Hide' : '📝 View/Edit'} Prompt
                  </button>
                </div>

                {/* Prompt Display/Editor */}
                {showPrompt && (
                  <div className="space-y-2">
                    {loadingPrompt ? (
                      <div className="text-xs text-gray-500">Loading prompt...</div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-medium text-gray-700">
                            AI Prompt {customPrompt && '(Custom)'}
                          </label>
                          <div className="flex gap-2">
                            {!isPromptEditing ? (
                              <button
                                onClick={handleEditPrompt}
                                disabled={assessing}
                                className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400"
                              >
                                ✏️ Edit
                              </button>
                            ) : (
                              <button
                                onClick={handleResetPrompt}
                                disabled={assessing}
                                className="text-xs text-gray-600 hover:text-gray-700 font-medium disabled:text-gray-400"
                              >
                                ↺ Reset
                              </button>
                            )}
                          </div>
                        </div>
                        <textarea
                          value={isPromptEditing ? customPrompt : defaultPrompt}
                          onChange={e => isPromptEditing && setCustomPrompt(e.target.value)}
                          readOnly={!isPromptEditing}
                          disabled={assessing}
                          rows={12}
                          className={`w-full px-3 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 font-mono ${
                            isPromptEditing ? 'bg-yellow-50' : 'bg-gray-50'
                          }`}
                        />
                        {isPromptEditing && (
                          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                            ⚠️ Editing prompt - your changes will be used for the next assessment
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Extra Context Toggle */}
                <div>
                  <button
                    onClick={() => setShowExtraContext(!showExtraContext)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {showExtraContext ? '− Hide' : '+ Add'} Extra Context
                  </button>
                </div>

                {/* Extra Context Textarea */}
                {showExtraContext && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Additional Context (Optional)
                    </label>
                    <textarea
                      value={extraContext}
                      onChange={e => setExtraContext(e.target.value)}
                      disabled={assessing}
                      placeholder="Add any additional context or specific questions..."
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                  </div>
                )}

                {/* Progress Indicator */}
                {assessing && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">{assessmentMessage}</span>
                      <span className="text-gray-500 font-mono">
                        {Math.round(assessmentProgress)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-blue-600 h-full transition-all duration-300 ease-out"
                        style={{ width: `${assessmentProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Assess Button */}
                <button
                  onClick={handleAssess}
                  disabled={assessing}
                  className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
                >
                  {assessing
                    ? 'Analyzing...'
                    : isElementCheck
                      ? `Assess All ${sections.length} Sections`
                      : 'Assess Compliance'}
                </button>

                {/* Assessment Error */}
                {assessmentError && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                    {assessmentError}
                  </div>
                )}
              </div>
            </div>

            {/* Latest Analysis Summary */}
            {!loadingRuns && analysisRuns.length > 0 && analysisRuns[0].section_results && (
              <div className="border-t pt-6">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Latest Analysis Summary
                </div>
                {(() => {
                  const latestRun = analysisRuns[0];
                  const sectionResults = latestRun.section_results || [];
                  const violationCount = sectionResults.filter(
                    (s: SectionResult) => s.compliance_status === 'violation'
                  ).length;
                  const needsMoreInfoCount = sectionResults.filter(
                    (s: SectionResult) => s.compliance_status === 'needs_more_info'
                  ).length;
                  const notApplicableCount = sectionResults.filter(
                    (s: SectionResult) => s.compliance_status === 'not_applicable'
                  ).length;
                  const compliantCount = sectionResults.filter(
                    (s: SectionResult) => s.compliance_status === 'compliant'
                  ).length;

                  return (
                    <div className="space-y-3">
                      <div className="bg-gray-50 border border-gray-200 rounded p-3 space-y-2">
                        {violationCount > 0 && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-red-700">❌ Violations</span>
                            <span className="font-semibold text-red-800">{violationCount}</span>
                          </div>
                        )}
                        {needsMoreInfoCount > 0 && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-yellow-700">⚠️ Needs More Info</span>
                            <span className="font-semibold text-yellow-800">
                              {needsMoreInfoCount}
                            </span>
                          </div>
                        )}
                        {compliantCount > 0 && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-green-700">✅ Compliant</span>
                            <span className="font-semibold text-green-800">{compliantCount}</span>
                          </div>
                        )}
                        {notApplicableCount > 0 && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">⊘ Not Applicable</span>
                            <span className="font-semibold text-gray-700">
                              {notApplicableCount}
                            </span>
                          </div>
                        )}
                      </div>

                      {needsMoreInfoCount > 0 && (
                        <button
                          onClick={() => {
                            const needsInfo = sectionResults.filter(
                              (s: SectionResult) => s.compliance_status === 'needs_more_info'
                            );
                            setTriageSections(needsInfo);
                            setShowTriageModal(true);
                          }}
                          className="w-full px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        >
                          Review & Triage ({needsMoreInfoCount} sections)
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Assessment History */}
            <div className="border-t pt-6">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Assessment History
              </div>

              <AnalysisHistory
                runs={analysisRuns}
                loading={loadingRuns}
                expandedRuns={expandedRuns}
                onToggleRun={toggleRunExpanded}
              />
            </div>
          </div>
        </div>
      )}

      {/* Exclude from Project Confirmation Dialog */}
      {showExcludeDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-3">Exclude Section from Project?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will exclude section <strong>{section?.number}</strong> from this project only.
              All checks for this section (section-by-section AND element instances) will be
              removed.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (optional)
              </label>
              <input
                type="text"
                value={excludeReason}
                onChange={e => setExcludeReason(e.target.value)}
                placeholder="e.g., 20% construction cost rule applies"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            {overrideError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {overrideError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowExcludeDialog(false);
                  setExcludeReason('');
                }}
                disabled={excludingSection}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExcludeFromProject}
                disabled={excludingSection}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
              >
                {excludingSection ? 'Excluding...' : 'Exclude from Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Never Relevant Confirmation Dialog */}
      {showNeverRelevantDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Mark Section as Never Relevant?
              </h3>
              <p className="text-sm text-gray-700 mb-4">
                This will permanently mark section{' '}
                <span className="font-mono font-semibold">{section?.number}</span> as never
                relevant.
              </p>
              <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
                <p className="text-sm text-red-800 font-semibold">⚠️ Warning</p>
                <p className="text-sm text-red-700 mt-1">
                  This section will be excluded from <strong>ALL future projects</strong>. This
                  can&apos;t be reversed without a whole faff.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNeverRelevantDialog(false)}
                  disabled={markingNeverRelevant}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkNeverRelevant}
                  disabled={markingNeverRelevant}
                  className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-red-300 disabled:cursor-not-allowed"
                >
                  {markingNeverRelevant ? 'Marking...' : 'Yes, Mark as Never Relevant'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floorplan Relevant Confirmation Dialog */}
      {showFloorplanRelevantDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Mark Section as Floor-Plan Relevant?
              </h3>
              <p className="text-sm text-gray-700 mb-4">
                This will mark section{' '}
                <span className="font-mono font-semibold">{section?.number}</span> as specifically
                relevant to floorplan analysis.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
                <p className="text-sm text-blue-800 font-semibold">ℹ️ Info</p>
                <p className="text-sm text-blue-700 mt-1">
                  This section will be <strong>prioritized</strong> when displaying code sections in
                  all projects, making it easier to find sections specifically relevant to floorplan
                  analysis.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowFloorplanRelevantDialog(false)}
                  disabled={markingFloorplanRelevant}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMarkFloorplanRelevant}
                  disabled={markingFloorplanRelevant}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
                >
                  {markingFloorplanRelevant ? 'Marking...' : 'Yes, Mark as Floor-Plan Relevant'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Triage Modal */}
      {showTriageModal && triageSections.length > 0 && (
        <TriageModal
          sections={triageSections}
          onClose={() => setShowTriageModal(false)}
          onSave={async overrides => {
            if (!effectiveCheckId) return;

            try {
              const res = await fetch(`/api/checks/${effectiveCheckId}/section-overrides`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ overrides }),
              });

              if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to save overrides');
              }

              // Refresh analysis runs to show updated data
              const runsRes = await fetch(`/api/checks/${effectiveCheckId}/analysis-runs`);
              const runsData = await runsRes.json();
              setAnalysisRuns(runsData.runs || []);

              // Optionally trigger check update callback
              if (onCheckUpdate) {
                onCheckUpdate();
              }
            } catch (error: any) {
              console.error('Failed to save section overrides:', error);
              alert('Failed to save overrides: ' + error.message);
            }
          }}
        />
      )}
    </div>
  );
}
