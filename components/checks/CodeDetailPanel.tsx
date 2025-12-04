'use client';

import { useEffect, useState, useCallback } from 'react';
import { ScreenshotGallery } from '@/components/screenshots/ScreenshotGallery';
import { SearchElevationsModal } from '@/components/screenshots/SearchElevationsModal';
import { TableRenderer } from '@/components/ui/TableRenderer';
import { AnalysisHistory } from './AnalysisHistory';
import { DoorParametersForm } from './DoorParametersForm';
import { useManualOverride } from '@/hooks/useManualOverride';
import { useAssessmentPolling } from '@/hooks/useAssessmentPolling';
import { useAgentAssessment } from '@/hooks/useAgentAssessment';
import { useCheckData } from './hooks/useCheckData';
import type { DoorParameters } from '@/types/compliance';

interface CodeDetailPanelProps {
  checkId: string | null;
  sectionKey: string | null;
  filterToSectionKey?: string | null;
  onClose: () => void;
  onMoveToNextCheck?: () => void;
  onCheckUpdate?: () => void;
  onChecksRefresh?: () => void;
  activeCheck?: any;
  onScreenshotAssigned?: () => void;
  onScreenshotDeleted?: () => void;
  screenshotRefreshTrigger?: number;
}

export function CodeDetailPanel({
  checkId,
  sectionKey,
  filterToSectionKey,
  onClose,
  onMoveToNextCheck,
  onCheckUpdate,
  onChecksRefresh,
  activeCheck,
  onScreenshotAssigned,
  onScreenshotDeleted,
  screenshotRefreshTrigger,
}: CodeDetailPanelProps) {
  // Local state to track screenshot changes for ScreenshotGallery
  const [screenshotsRefreshKey, setScreenshotsRefreshKey] = useState(0);

  // Sync with external screenshot refresh trigger (e.g., when 'C' key saves a screenshot)
  useEffect(() => {
    if (screenshotRefreshTrigger !== undefined && screenshotRefreshTrigger > 0) {
      setScreenshotsRefreshKey(screenshotRefreshTrigger);
    }
  }, [screenshotRefreshTrigger]);

  // UI state: which child check the user is viewing
  const [activeChildCheckId, setActiveChildCheckId] = useState<string | null>(null);

  // Coordinated data loading
  const {
    loading: panelLoading,
    error: panelError,
    childChecks,
    activeCheck: activeCheckFromHook,
    sections,
    analysisRuns,
    manualOverride: initialManualOverride,
    manualOverrideNote: initialManualOverrideNote,
    showSingleSectionOnly,
    refresh,
  } = useCheckData(checkId, activeChildCheckId, filterToSectionKey || null, screenshotsRefreshKey);

  // Reset activeChildCheckId when checkId changes (for section navigation)
  useEffect(() => {
    if (checkId) {
      setActiveChildCheckId(checkId);
    }
  }, [checkId]);

  // Use the check from the hook (has element_instances data) or fall back to the prop
  const activeCheckWithData = activeCheckFromHook || activeCheck;

  // Calculate effective check ID early (needed for manual override hook)
  const effectiveCheckId = activeChildCheckId || checkId;

  // Debug log to verify element instance data
  // console.log('[CodeDetailPanel] 🏷️ Active check data:', {
  //   hasActiveCheckWithData: !!activeCheckWithData,
  //   hasElementInstances: !!activeCheckWithData?.element_instances,
  //   hasElementGroups: !!activeCheckWithData?.element_instances?.element_groups,
  //   elementGroupName: activeCheckWithData?.element_instances?.element_groups?.name,
  //   instanceLabel: activeCheckWithData?.element_instances?.label,
  // });

  // Manual override hook
  const manualOverrideHook = useManualOverride({
    checkId: effectiveCheckId,
    initialOverride: initialManualOverride,
    initialNote: initialManualOverrideNote,
    onSaveSuccess: () => {
      if (onCheckUpdate) onCheckUpdate();
    },
    onCheckDeleted: () => {
      if (onCheckUpdate) onCheckUpdate();
    },
  });

  const {
    state: {
      override: manualOverride,
      note: manualOverrideNote,
      saving: savingOverride,
      error: overrideError,
      showNoteInput: showOverrideNote,
    },
    actions: {
      setOverride: setManualOverride,
      setNote: setManualOverrideNote,
      setShowNoteInput: setShowOverrideNote,
      saveOverride,
    },
  } = manualOverrideHook;

  // Polling hook - API is the ONLY source of truth
  const handleAssessmentComplete = useCallback(() => {
    // Trigger hook to refetch analysis runs (silent = no loading skeleton)
    refresh(true);

    if (onCheckUpdate) onCheckUpdate();
  }, [refresh, onCheckUpdate]);

  const {
    assessing,
    progress: assessmentProgress,
    message: assessmentMessage,
  } = useAssessmentPolling({
    checkId,
    onComplete: handleAssessmentComplete,
  });

  // Agent assessment hook
  const {
    assessing: agentAssessing,
    reasoning: agentReasoning,
    toolCalls: agentToolCalls,
    result: agentResult,
    error: agentError,
    startAssessment: startAgentAssessment,
  } = useAgentAssessment(checkId);

  // Handler for agent assessment completion
  useEffect(() => {
    if (agentResult) {
      // Refresh analysis runs to show agent result
      refresh(true);
      if (onCheckUpdate) onCheckUpdate();
    }
  }, [agentResult, refresh, onCheckUpdate]);

  // Other UI state
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-pro');
  const [extraContext, setExtraContext] = useState('');
  const [showExtraContext, setShowExtraContext] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);

  const [showPrompt, setShowPrompt] = useState(false);
  const [defaultPrompt, setDefaultPrompt] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isPromptEditing, setIsPromptEditing] = useState(false);
  const [loadingPrompt, setLoadingPrompt] = useState(false);

  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  const [showExcludeDialog, setShowExcludeDialog] = useState(false);
  const [excludingSection, setExcludingSection] = useState(false);
  const [excludeReason, setExcludeReason] = useState('');

  const [showExcludeGroupDialog, setShowExcludeGroupDialog] = useState(false);
  const [excludingGroup, setExcludingGroup] = useState(false);
  const [groupSections, setGroupSections] = useState<any[]>([]);
  const [selectedSectionKeys, setSelectedSectionKeys] = useState<Set<string>>(new Set());

  const [showSectionTabs, setShowSectionTabs] = useState(false);
  const [showParametersForm, setShowParametersForm] = useState(false);
  const [elementParameters, setElementParameters] = useState<DoorParameters | null>(null);
  const [showScreenshots, setShowScreenshots] = useState(true);
  const [showElevationSearch, setShowElevationSearch] = useState(false);
  const [sectionContentHeight, setSectionContentHeight] = useState(40);

  const section = sections[0] || null;

  // Load last selected model from localStorage
  useEffect(() => {
    const lastModel = localStorage.getItem('lastSelectedAIModel');
    if (lastModel) setSelectedModel(lastModel);
  }, []);

  // Auto-expand section tabs for element checks
  useEffect(() => {
    if (childChecks.length > 1) setShowSectionTabs(true);
  }, [childChecks.length]);

  // Auto-expand first analysis run when assessment completes
  useEffect(() => {
    if (!assessing && analysisRuns.length > 0 && expandedRuns.size === 0) {
      setExpandedRuns(new Set([analysisRuns[0].id]));
    }
  }, [assessing, analysisRuns, expandedRuns.size]);

  // Handlers
  const handleViewPrompt = async () => {
    if (!checkId || defaultPrompt) return;
    setShowPrompt(true);
    setLoadingPrompt(true);
    try {
      const response = await fetch(`/api/checks/${checkId}/prompt`);
      const data = await response.json();
      if (response.ok && data.prompt) setDefaultPrompt(data.prompt);
    } catch (err) {
      console.error('Failed to load prompt:', err);
    } finally {
      setLoadingPrompt(false);
    }
  };

  const handleSaveOverride = async () => {
    if (!effectiveCheckId) return;

    try {
      // Save using the hook
      await saveOverride(effectiveCheckId);

      // Navigate to next check if marking as not_applicable
      if (manualOverride === 'not_applicable') {
        if (activeChildCheckId && childChecks.length > 1) {
          const currentIndex = childChecks.findIndex(c => c.id === activeChildCheckId);
          if (currentIndex < childChecks.length - 1) {
            setActiveChildCheckId(childChecks[currentIndex + 1].id);
          } else if (onMoveToNextCheck) {
            onMoveToNextCheck();
          }
        } else if (onMoveToNextCheck) {
          onMoveToNextCheck();
        }
      }
    } catch {
      // Error is already set by the hook
    }
  };

  const handleAssess = async () => {
    if (!checkId) return;

    // Prevent double-clicks
    if (assessing) {
      return;
    }

    setAssessmentError(null);
    localStorage.setItem('lastSelectedAIModel', selectedModel);

    try {
      const response = await fetch(`/api/checks/${checkId}/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiProvider: selectedModel,
          customPrompt: customPrompt.trim() || undefined,
          extraContext: extraContext.trim() || undefined,
        }),
      });

      const contentType = response.headers.get('content-type');
      let data;
      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`Server error (${response.status}): ${text.substring(0, 200)}`);
      }

      if (!response.ok) {
        throw new Error(data.error || 'Assessment failed');
      }

      // Polling will automatically pick up the status change from DB
      // No need for optimistic updates - API is the source of truth
    } catch (err: any) {
      console.error('[CodeDetailPanel] Assessment error:', err);
      setAssessmentError(err.message);
    }
  };

  // Fetch element parameters if this is a door element
  useEffect(() => {
    if (activeCheckWithData?.element_instances?.id) {
      fetchElementParameters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCheckWithData?.element_instances?.id]);

  const fetchElementParameters = async () => {
    if (!activeCheckWithData?.element_instances?.id) return;

    try {
      const response = await fetch(
        `/api/element-instances/${activeCheckWithData.element_instances.id}/parameters`
      );
      if (response.ok) {
        const data = await response.json();
        setElementParameters(data.parameters?.parameters || null);
      }
    } catch (error) {
      console.error('Failed to fetch element parameters:', error);
    }
  };

  const handleSaveParameters = async (parameters: DoorParameters) => {
    if (!activeCheckWithData?.element_instances?.id) return;

    const response = await fetch(
      `/api/element-instances/${activeCheckWithData.element_instances.id}/parameters`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to save parameters');
    }

    const data = await response.json();
    setElementParameters(data.parameters);
    setShowParametersForm(false);

    // Refresh checks to show updated compliance status
    if (onChecksRefresh) {
      await onChecksRefresh();
    }
  };

  const handleExcludeSection = async () => {
    if (!effectiveCheckId || !excludeReason.trim() || !activeCheckWithData?.assessment_id) return;

    const isViewingChildSection = !!activeChildCheckId && checkId !== effectiveCheckId;
    const activeChild = childChecks.find(c => c.id === activeChildCheckId);
    const sectionKeyToExclude = isViewingChildSection ? activeChild?.sections?.key : sectionKey;

    if (!sectionKeyToExclude) return;

    setExcludingSection(true);
    try {
      const response = await fetch(
        `/api/assessments/${activeCheckWithData.assessment_id}/exclude-section`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sectionKey: sectionKeyToExclude,
            reason: excludeReason.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to exclude section');
      }

      if (onCheckUpdate) onCheckUpdate();
      if (onChecksRefresh) onChecksRefresh();

      if (isViewingChildSection && childChecks.length > 1) {
        const currentIndex = childChecks.findIndex(c => c.id === activeChildCheckId);
        if (currentIndex < childChecks.length - 1) {
          setActiveChildCheckId(childChecks[currentIndex + 1].id);
        } else if (onMoveToNextCheck) {
          onMoveToNextCheck();
        }
      } else if (onMoveToNextCheck) {
        onMoveToNextCheck();
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setExcludingSection(false);
      setShowExcludeDialog(false);
      setExcludeReason('');
    }
  };

  const handleOpenExcludeGroup = async () => {
    if (!activeCheckWithData?.assessment_id || !section?.parent_key) return;

    try {
      const response = await fetch(
        `/api/assessments/${activeCheckWithData.assessment_id}/exclude-section-group?sectionKey=${encodeURIComponent(section.parent_key)}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to preview section group');
      }

      const sectionsData = data.sections || [];
      setGroupSections(sectionsData);

      const defaultSelected = new Set<string>(
        sectionsData.filter((s: any) => !s.alreadyExcluded).map((s: any) => s.key as string)
      );
      setSelectedSectionKeys(defaultSelected);
      setShowExcludeGroupDialog(true);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleExcludeGroup = async () => {
    if (
      !activeCheckWithData?.assessment_id ||
      selectedSectionKeys.size === 0 ||
      !excludeReason.trim()
    )
      return;

    setExcludingGroup(true);
    try {
      const response = await fetch(
        `/api/assessments/${activeCheckWithData.assessment_id}/exclude-section-group`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sectionKeys: Array.from(selectedSectionKeys),
            reason: excludeReason.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to exclude sections');
      }

      if (onCheckUpdate) onCheckUpdate();
      if (onChecksRefresh) onChecksRefresh();
      if (onMoveToNextCheck) onMoveToNextCheck();

      setShowExcludeGroupDialog(false);
      setExcludeReason('');
      setSelectedSectionKeys(new Set());
    } catch (err: any) {
      alert(err.message);
    } finally {
      setExcludingGroup(false);
    }
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

  // Simple loading indicator instead of full skeleton
  if (panelLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-white border-r border-gray-200">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <div className="text-sm text-gray-500">Loading check...</div>
        </div>
      </div>
    );
  }

  if (panelError) {
    return (
      <div className="h-full flex flex-col bg-white border-r border-gray-200">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Error</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
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
        <div className="p-4">
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
            {panelError}
          </div>
        </div>
      </div>
    );
  }

  // Allow rendering if we have either a sectionKey or loaded child checks (element instances)
  if (!sectionKey && childChecks.length === 0) return null;

  const isElementCheck = childChecks.length > 0;

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* Rest of JSX remains identical to original - just with new loading logic */}
      {/* ... (continuing with the exact same JSX from original component) */}
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900">
            {isElementCheck && activeCheckWithData?.element_instances?.element_groups?.name
              ? `${activeCheckWithData.element_instances.element_groups.name}: ${activeCheckWithData.element_instances.label}`
              : isElementCheck
                ? 'Element Instance Details'
                : 'Code Section Details'}
          </h3>
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
      {childChecks.length > 0 && !showSingleSectionOnly && (
        <div className="border-b bg-gray-50 flex-shrink-0">
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

      {/* Parameters Section for Door Elements */}
      {isElementCheck &&
        activeCheckWithData?.element_instances?.element_groups?.slug === 'doors' && (
          <div className="border-b bg-gray-50 flex-shrink-0 px-4 py-3">
            {!showParametersForm ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Door Parameters</span>
                  {elementParameters && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                      Configured ✓
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowParametersForm(true)}
                  className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
                >
                  {elementParameters ? 'Edit Parameters' : 'Add Parameters'}
                </button>
              </div>
            ) : (
              <div className="bg-white rounded p-4 max-h-[600px] overflow-y-auto">
                <DoorParametersForm
                  instanceId={activeCheckWithData.element_instances.id}
                  currentParameters={elementParameters || undefined}
                  onSave={handleSaveParameters}
                  onCancel={() => setShowParametersForm(false)}
                />
              </div>
            )}
          </div>
        )}

      {/* Manual Override Section - preserving exact JSX from original lines 1185-1373 */}
      {(effectiveCheckId || (checkId && sectionKey)) && (
        <div className="border-b bg-gray-50 p-4 flex-shrink-0">
          <div className="text-xs font-medium tracking-wide text-ink-500 uppercase mb-3">
            Manual Compliance Judgment
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Set Compliance Status
              </label>
              <div className="flex gap-1.5">
                {[
                  {
                    value: 'compliant',
                    label: 'Compliant',
                    icon: (
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ),
                    base: 'bg-green-50 border-green-200 text-green-700',
                    selected: 'bg-green-100 border-green-400 text-green-800 ring-2 ring-green-400',
                  },
                  {
                    value: 'non_compliant',
                    label: 'Non-Compliant',
                    icon: (
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    ),
                    base: 'bg-red-50 border-red-200 text-red-700',
                    selected: 'bg-red-100 border-red-400 text-red-800 ring-2 ring-red-400',
                  },
                  {
                    value: 'not_applicable',
                    label: 'N/A',
                    icon: (
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M20 12H4"
                        />
                      </svg>
                    ),
                    base: 'bg-gray-100 border-gray-200 text-gray-600',
                    selected: 'bg-gray-200 border-gray-400 text-gray-800 ring-2 ring-gray-400',
                  },
                  {
                    value: 'insufficient_information',
                    label: 'Not in Plan',
                    icon: (
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    ),
                    base: 'bg-amber-50 border-amber-200 text-amber-700',
                    selected: 'bg-amber-100 border-amber-400 text-amber-800 ring-2 ring-amber-400',
                  },
                ].map(option => (
                  <button
                    key={option.value}
                    onClick={() => setManualOverride(option.value)}
                    disabled={savingOverride}
                    className={`flex-1 px-2 py-2 text-xs font-medium rounded border transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                      manualOverride === option.value ? option.selected : option.base
                    }`}
                  >
                    {option.icon}
                    <span className="hidden sm:inline">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {manualOverride && (
              <>
                <div>
                  <button
                    onClick={() => setShowOverrideNote(!showOverrideNote)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {showOverrideNote ? '− Hide' : '+ Add'} Note
                  </button>
                </div>

                {showOverrideNote && (
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

                <div className="pt-2 border-t border-gray-200 space-y-2">
                  <button
                    onClick={() => setShowExcludeDialog(true)}
                    disabled={excludingSection}
                    className="w-full px-3 py-2 text-sm text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-300 rounded transition-colors disabled:opacity-50"
                  >
                    🚫 Exclude Section from Project
                  </button>

                  {section?.parent_section && (
                    <button
                      onClick={handleOpenExcludeGroup}
                      disabled={excludingGroup}
                      className="w-full px-3 py-2 text-sm text-red-700 bg-red-50 hover:bg-red-100 border border-red-300 rounded transition-colors disabled:opacity-50"
                    >
                      🚫 Exclude Section Group ({section.parent_section.number})
                    </button>
                  )}
                </div>

                <button
                  onClick={handleSaveOverride}
                  disabled={savingOverride}
                  className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
                >
                  {savingOverride ? 'Saving...' : 'Save Manual Override'}
                </button>

                {overrideError && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                    {overrideError}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Section Content - preserving exact structure from lines 1376-1544 */}
      <div className="overflow-y-auto p-4" style={{ height: `${sectionContentHeight}%` }}>
        {!section && !panelLoading && (
          <div className="text-sm text-gray-500 text-center py-8">
            No section data available. Check console for details.
          </div>
        )}
        {section && (
          <div className="space-y-6">
            {/* Section Header */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium tracking-wide text-ink-500 uppercase">
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
              <div className="text-2xl font-mono font-semibold text-gray-900">{section.number}</div>
              <div className="text-lg font-normal text-ink-700 mt-1">{section.title}</div>
            </div>

            {/* Section Text */}
            {section.text && (
              <div>
                <div className="text-xs font-medium tracking-wide text-ink-500 uppercase mb-2">
                  Section Summary
                </div>
                <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200">
                  {/* First sentence emphasized */}
                  {(() => {
                    const firstSentenceMatch = section.text.match(/^[^.!?]+[.!?]/);
                    if (firstSentenceMatch) {
                      const firstSentence = firstSentenceMatch[0];
                      const rest = section.text.slice(firstSentence.length);
                      return (
                        <>
                          <span className="font-medium text-gray-900">{firstSentence}</span>
                          {rest}
                        </>
                      );
                    }
                    return section.text;
                  })()}
                </div>
              </div>
            )}

            {/* Requirements/Paragraphs */}
            {section.requirements && section.requirements.length > 0 && (
              <div>
                <div className="text-xs font-medium tracking-wide text-ink-500 uppercase mb-2">
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
                <div className="text-xs font-medium tracking-wide text-ink-500 uppercase mb-2">
                  Tables
                </div>
                <TableRenderer tables={section.tables} />
              </div>
            )}

            {/* Referenced Sections */}
            {section.references && section.references.length > 0 && (
              <div>
                <div className="text-xs font-medium tracking-wide text-ink-500 uppercase mb-2">
                  Referenced Sections ({section.references.length})
                </div>
                <div className="space-y-4">
                  {section.references.map((ref, idx) => (
                    <div
                      key={ref.key || idx}
                      className="bg-blue-50 border-l-4 border-blue-500 rounded p-4"
                    >
                      <div className="mb-3">
                        <div className="font-mono text-sm font-bold text-blue-900">
                          {ref.number}
                        </div>
                        <div className="text-sm font-medium text-gray-900 mt-1">{ref.title}</div>
                      </div>

                      {/* Referenced Section Text/Summary */}
                      {ref.text && (
                        <div className="mb-3">
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                            Section Summary
                          </div>
                          <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap bg-white p-2 rounded border border-blue-200">
                            {ref.text}
                          </div>
                        </div>
                      )}

                      {/* Referenced Section Requirements/Paragraphs */}
                      {ref.requirements && ref.requirements.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                            Explanation
                          </div>
                          <div className="space-y-2">
                            {ref.requirements.map((req, reqIdx) => {
                              const text = typeof req === 'string' ? req : req.text || '';
                              return (
                                <div key={reqIdx} className="text-sm text-gray-800 leading-relaxed">
                                  <div className="text-xs text-gray-500 font-mono mb-1">
                                    Paragraph {reqIdx + 1}
                                  </div>
                                  <div className="pl-3 border-l-2 border-blue-300 bg-white p-2 rounded">
                                    {text}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Parent Section Context */}
            {section.parent_section && (
              <div className="bg-gray-50 border border-gray-200 border-l-4 border-l-sage-500 rounded p-3">
                <div className="text-xs font-medium tracking-wide text-ink-500 uppercase mb-2">
                  Parent Section Context
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-sm font-mono font-medium text-gray-900">
                    {section.parent_section.number}
                  </span>
                  <span className="text-sm text-gray-700">{section.parent_section.title}</span>
                </div>
                {section.parent_section.text && (
                  <div className="text-sm text-gray-700 leading-relaxed mt-2 pl-3 border-l-2 border-gray-300">
                    {section.parent_section.text}
                  </div>
                )}
                {section.parent_section.paragraphs &&
                  section.parent_section.paragraphs.length > 0 && (
                    <div className="text-sm text-gray-700 leading-relaxed mt-2 pl-3 border-l-2 border-gray-300">
                      {typeof section.parent_section.paragraphs === 'string'
                        ? section.parent_section.paragraphs
                        : Array.isArray(section.parent_section.paragraphs)
                          ? section.parent_section.paragraphs.join('\n\n')
                          : ''}
                    </div>
                  )}
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

      {/* Assessment Controls - preserving exact structure from lines 1553-1888 */}
      {checkId && (
        <div
          className="border-t bg-gray-50 overflow-y-auto"
          style={{ height: `${100 - sectionContentHeight}%` }}
        >
          <div className="p-4 space-y-6">
            {/* Screenshots Section */}
            {activeCheckWithData && (
              <div className="border-t pt-6">
                <div className="mb-3">
                  <button
                    onClick={() => setShowScreenshots(!showScreenshots)}
                    className="w-full flex items-center justify-between hover:bg-gray-100 transition-colors px-2 py-1 rounded"
                  >
                    <div className="text-xs font-medium tracking-wide text-ink-500 uppercase">
                      Screenshots & Elevations
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
                  <div className="pb-4 space-y-2">
                    {activeCheckWithData?.element_group_id && (
                      <button
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        onClick={() => setShowElevationSearch(true)}
                      >
                        + Manage Elevations
                      </button>
                    )}
                    <ScreenshotGallery
                      check={activeCheckWithData}
                      refreshKey={screenshotsRefreshKey}
                      onScreenshotAssigned={() => {
                        setScreenshotsRefreshKey(prev => prev + 1);
                        onScreenshotAssigned?.();
                      }}
                      onScreenshotDeleted={onScreenshotDeleted}
                    />
                  </div>
                )}
              </div>
            )}

            {/* AI Assessment Section */}
            <div className="border-t pt-6">
              <div className="text-xs font-medium tracking-wide text-ink-500 uppercase mb-3">
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
                                onClick={() => {
                                  setIsPromptEditing(true);
                                  setCustomPrompt(defaultPrompt);
                                }}
                                disabled={assessing}
                                className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400"
                              >
                                ✏️ Edit
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setCustomPrompt('');
                                  setIsPromptEditing(false);
                                }}
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
                  disabled={assessing || agentAssessing}
                  className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
                >
                  {assessing
                    ? 'Analyzing...'
                    : isElementCheck
                      ? `Assess All ${childChecks.length} Sections`
                      : 'Assess Compliance'}
                </button>

                {/* Agent Analysis Button - secondary style */}
                <button
                  onClick={startAgentAssessment}
                  disabled={agentAssessing || assessing}
                  className="w-full px-4 py-2.5 bg-blue-100 text-blue-700 border border-blue-300 text-sm font-medium rounded hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-50 disabled:text-blue-400 disabled:cursor-not-allowed"
                >
                  {agentAssessing ? 'Agent Analyzing...' : 'Agent Analysis'}
                </button>

                {/* Agent Reasoning Stream */}
                {agentAssessing && (
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded">
                    <div className="text-xs font-semibold text-purple-700 mb-2">
                      Agent Reasoning
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {agentReasoning.map((text, i) => (
                        <div key={i} className="text-xs text-gray-700 bg-white p-2 rounded">
                          {text.length > 200 ? text.substring(0, 200) + '...' : text}
                        </div>
                      ))}
                      {agentToolCalls.map((tc, i) => (
                        <div
                          key={i}
                          className="text-xs bg-gray-100 p-2 rounded flex items-center gap-2"
                        >
                          <span className="text-purple-600 font-mono">{tc.tool}</span>
                          {tc.status === 'running' && (
                            <span className="animate-pulse text-gray-500">...</span>
                          )}
                          {tc.status === 'complete' && <span className="text-green-600">done</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assessment Error */}
                {assessmentError && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                    {assessmentError}
                  </div>
                )}

                {/* Agent Error */}
                {agentError && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                    {agentError}
                  </div>
                )}
              </div>
            </div>

            {/* Assessment History */}
            <div className="border-t pt-6">
              <div className="text-xs font-medium tracking-wide text-ink-500 uppercase mb-3">
                Assessment History
              </div>

              <AnalysisHistory
                runs={analysisRuns}
                loading={false}
                expandedRuns={expandedRuns}
                onToggleRun={runId => {
                  setExpandedRuns(prev => {
                    const next = new Set(prev);
                    if (next.has(runId)) {
                      next.delete(runId);
                    } else {
                      next.add(runId);
                    }
                    return next;
                  });
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modals - preserving exact structure from lines 1890-2246 */}
      {showExcludeDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-3">Exclude Section from Project?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will exclude section <strong>{section?.number}</strong> from this project only.
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
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowExcludeDialog(false);
                  setExcludeReason('');
                }}
                disabled={excludingSection}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleExcludeSection}
                disabled={excludingSection}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
              >
                {excludingSection ? 'Excluding...' : 'Exclude from Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExcludeGroupDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <h3 className="text-lg font-semibold mb-3">Exclude Section Group from Project?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will exclude <strong>{section?.parent_section?.number}</strong> and all its
              subsections from this project.
            </p>

            <div className="mb-4 flex-1 overflow-y-auto border border-gray-300 rounded max-h-96">
              <ul className="divide-y divide-gray-200">
                {groupSections.map(s => (
                  <li key={s.key}>
                    <div className="flex items-start px-3 py-2 gap-2">
                      <input
                        type="checkbox"
                        checked={selectedSectionKeys.has(s.key)}
                        disabled={s.alreadyExcluded}
                        onChange={() => {
                          setSelectedSectionKeys(prev => {
                            const next = new Set(prev);
                            if (next.has(s.key)) {
                              next.delete(s.key);
                            } else {
                              next.add(s.key);
                            }
                            return next;
                          });
                        }}
                        className="mt-1 h-4 w-4"
                      />
                      <div className="flex-1">
                        <span className="font-mono text-sm font-semibold">{s.number}</span>
                        <span className="text-sm text-gray-700 ml-2">{s.title}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (optional)
              </label>
              <input
                type="text"
                value={excludeReason}
                onChange={e => setExcludeReason(e.target.value)}
                placeholder="e.g., entire play area section not applicable"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowExcludeGroupDialog(false);
                  setExcludeReason('');
                  setSelectedSectionKeys(new Set());
                }}
                disabled={excludingGroup}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleExcludeGroup}
                disabled={excludingGroup || selectedSectionKeys.size === 0}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {excludingGroup
                  ? 'Excluding...'
                  : selectedSectionKeys.size === 0
                    ? 'Select sections to exclude'
                    : `Exclude ${selectedSectionKeys.size} Section${selectedSectionKeys.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showElevationSearch && activeCheckWithData && (
        <SearchElevationsModal
          open={showElevationSearch}
          onClose={() => setShowElevationSearch(false)}
          assessmentId={activeCheckWithData.assessment_id}
          currentCheckId={activeCheckWithData.id}
          onAssign={async screenshotIds => {
            for (const screenshotId of screenshotIds) {
              await fetch(`/api/screenshots/${screenshotId}/assign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ checkIds: [activeCheckWithData.id] }),
              });
            }

            setScreenshotsRefreshKey(prev => prev + 1);
            if (onScreenshotAssigned) onScreenshotAssigned();
          }}
        />
      )}
    </div>
  );
}
