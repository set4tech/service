'use client';

import { useEffect, useMemo, useState, useRef, useReducer, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import clsx from 'clsx';
import { CheckList } from '@/components/checks/CheckList';
import { CodeDetailPanel } from '@/components/checks/CodeDetailPanel';
import { ViolationsSummary } from '@/components/checks/ViolationsSummary';
import { ViolationDetailPanel } from '@/components/checks/ViolationDetailPanel';
import { AssessmentScreenshotGallery } from '@/components/screenshots/AssessmentScreenshotGallery';
import { ImportCSVDoorsModal } from '@/components/assessments/ImportCSVDoorsModal';
import { AgentAnalysisModal } from '@/components/agent/AgentAnalysisModal';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ProjectPanel } from '@/components/project/ProjectPanel';
import type { ViolationMarker } from '@/lib/reports/get-violations';

// Load PDF viewer only on client side - removes need for wrapper component
const PDFViewer = dynamic(
  () => import('@/components/pdf/PDFViewer').then(mod => ({ default: mod.PDFViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading PDF viewer...</div>
      </div>
    ),
  }
);

interface BuildingInfo {
  occupancy: string;
  size_sf: number | null;
  stories: number | null;
  work_type: string;
  has_parking: boolean | null;
  facility_category: string;
}

interface Codebook {
  id: string;
  name: string;
}

interface ScreenshotData {
  id: string;
  screenshot_url: string;
  thumbnail_url?: string;
  caption?: string;
  page_number?: number;
  [key: string]: unknown;
}

interface CheckInstance {
  id: string;
  instance_label: string;
  instance_number: number;
  screenshots?: ScreenshotData[];
  [key: string]: unknown;
}

interface CheckData {
  id: string;
  sections?: { key: string; [key: string]: unknown };
  element_group_id?: string | null;
  latest_status?: string | null;
  status?: string;
  manual_status?: string | null;
  screenshots?: ScreenshotData[];
  instances?: CheckInstance[];
  instance_count?: number;
  parent_check_id?: string | null;
  [key: string]: unknown;
}

interface ExtractedVariables {
  [category: string]: {
    [variable: string]:
      | {
          value: unknown;
          confidence?: string;
        }
      | unknown;
  };
}

interface PipelineOutput {
  metadata?: {
    project_info?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface AssessmentData {
  id: string;
  project_id: string;
  pdf_url?: string | null;
  extracted_variables?: ExtractedVariables | null;
  pipeline_output?: PipelineOutput | null;
  projects?: {
    name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Agent run status tracking
interface AgentRun {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: {
    step?: number;
    total_steps?: number;
    message?: string;
  };
  started_at?: string;
  completed_at?: string;
  error?: string;
  results?: Record<string, unknown>;
}

interface Props {
  assessment: AssessmentData;
  checks: CheckData[];
  rpcViolations?: ViolationMarker[]; // RPC data already filtered to violations
  progress: { totalChecks: number; completed: number; pct: number };
  buildingInfo: BuildingInfo;
  codebooks: Codebook[];
}

// Detail Panel State Machine
type DetailPanelState =
  | {
      mode: 'closed';
    }
  | {
      mode: 'check-detail';
      checkId: string;
      filterToSectionKey: string | null;
    }
  | {
      mode: 'violation-detail';
      violation: ViolationMarker;
    };

type DetailPanelAction =
  | { type: 'CLOSE_PANEL' }
  | {
      type: 'SELECT_CHECK';
      checkId: string;
      filterToSectionKey?: string | null;
    }
  | {
      type: 'SELECT_VIOLATION';
      violation: ViolationMarker;
    };

function detailPanelReducer(state: DetailPanelState, action: DetailPanelAction): DetailPanelState {
  // DEBUG: Log all state changes to identify glitching source
  console.log('[DetailPanel] Action:', action.type, 'payload:', action, 'prev state:', state);

  switch (action.type) {
    case 'CLOSE_PANEL':
      return { mode: 'closed' };

    case 'SELECT_CHECK':
      console.log('[DetailPanel] Selecting check:', action.checkId);
      return {
        mode: 'check-detail',
        checkId: action.checkId,
        filterToSectionKey: action.filterToSectionKey ?? null,
      };

    case 'SELECT_VIOLATION':
      return {
        mode: 'violation-detail',
        violation: action.violation,
      };

    default:
      return state;
  }
}

export default function AssessmentClient({
  assessment,
  checks: initialChecks,
  rpcViolations: _rpcViolations,
  progress: _initialProgress,
  buildingInfo,
  codebooks,
}: Props) {
  const [checks, setChecks] = useState(initialChecks);
  const [rpcViolations, setRpcViolations] = useState(_rpcViolations || []);
  const [refreshingViolations, setRefreshingViolations] = useState(false);
  const [isPdfSearchOpen, setIsPdfSearchOpen] = useState(false);
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [existingAgentRun, setExistingAgentRun] = useState<AgentRun | null>(null);

  // Check for running agent on mount
  useEffect(() => {
    async function checkAgentStatus() {
      try {
        console.log('[AssessmentClient] Checking agent status on mount...');
        const res = await fetch(`/api/assessments/${assessment.id}/agent/status`);
        if (res.ok) {
          const data: AgentRun = await res.json();
          console.log('[AssessmentClient] Agent status response:', data.id, data.status);
          if (data.status === 'running' || data.status === 'pending') {
            console.log('[AssessmentClient] Setting existingAgentRun:', data.id);
            setExistingAgentRun(data);
          } else {
            console.log('[AssessmentClient] Agent run not active, status:', data.status);
          }
        } else {
          console.log('[AssessmentClient] Agent status not found (404)');
        }
      } catch (err) {
        console.log('[AssessmentClient] Error checking agent status:', err);
      }
    }
    checkAgentStatus();
  }, [assessment.id]);

  // Poll for updates while agent is running
  useEffect(() => {
    if (
      !existingAgentRun ||
      (existingAgentRun.status !== 'running' && existingAgentRun.status !== 'pending')
    ) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/assessments/${assessment.id}/agent/status?runId=${existingAgentRun.id}`
        );
        if (res.ok) {
          const data: AgentRun = await res.json();
          if (data.status === 'running' || data.status === 'pending') {
            setExistingAgentRun(data);
          } else {
            setExistingAgentRun(null);
          }
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [assessment.id, existingAgentRun?.id, existingAgentRun?.status]);

  // Two-level navigation: main tab and checks sub-tab
  const [mainTab, setMainTab] = useState<'checks' | 'violations' | 'chat' | 'project'>('checks');
  const [checksSubTab, setChecksSubTab] = useState<'elements' | 'sections' | 'gallery'>('sections');

  // Derived checkMode for compatibility with existing code
  const checkMode =
    mainTab === 'checks'
      ? checksSubTab === 'elements'
        ? 'element'
        : checksSubTab === 'sections'
          ? 'section'
          : 'gallery'
      : mainTab === 'violations'
        ? 'summary'
        : mainTab;

  // Restore saved mode after hydration to avoid mismatch
  useEffect(() => {
    const savedMainTab = localStorage.getItem(`mainTab-${assessment.id}`);
    const savedSubTab = localStorage.getItem(`checksSubTab-${assessment.id}`);
    if (savedMainTab) {
      setMainTab(savedMainTab as 'checks' | 'violations' | 'chat' | 'project');
    }
    if (savedSubTab) {
      setChecksSubTab(savedSubTab as 'elements' | 'sections' | 'gallery');
    }

    // Also restore active check ID from URL hash if present
    if (typeof window !== 'undefined' && window.location.hash) {
      const hashCheckId = window.location.hash.substring(1); // Remove the '#'
      if (hashCheckId) {
        console.log('[DEBUG] URL hash restoration triggered for:', hashCheckId);
        dispatchDetailPanel({
          type: 'SELECT_CHECK',
          checkId: hashCheckId,
          filterToSectionKey: null,
        });
      }
    }
  }, [assessment.id]);

  // Filter checks by mode (skip filtering for summary/gallery/chat modes)
  const displayedChecks = useMemo(() => {
    if (checkMode === 'summary' || checkMode === 'gallery' || checkMode === 'chat') return checks;

    // Element mode: show checks with element_group_id
    // Section mode: show checks without element_group_id (standalone sections)
    if (checkMode === 'element') {
      return checks.filter(c => c.element_group_id != null);
    } else {
      return checks.filter(c => c.element_group_id == null);
    }
  }, [checks, checkMode]);

  // Natural sort comparator (matches CheckList logic)
  const naturalCompare = (a: string, b: string): number => {
    const regex = /(\d+)|(\D+)/g;
    const aParts = a.match(regex) || [];
    const bParts = b.match(regex) || [];

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || '';
      const bPart = bParts[i] || '';
      const aNum = parseInt(aPart, 10);
      const bNum = parseInt(bPart, 10);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        if (aNum !== bNum) return aNum - bNum;
      } else {
        if (aPart !== bPart) return aPart.localeCompare(bPart);
      }
    }
    return 0;
  };

  // Helper: Get all navigable check IDs in the SAME ORDER as displayed in CheckList
  const getAllCheckIds = (checksList: CheckData[], mode: 'section' | 'element') => {
    const ids: string[] = [];
    const mainGroups = new Map<string, CheckData[]>();

    // Group checks exactly like CheckList does
    if (mode === 'element') {
      checksList.forEach(check => {
        if (!check.element_group_id || !(check as any).instance_label) return;
        const groupName = (check as any).element_group_name || 'Other';
        if (!mainGroups.has(groupName)) {
          mainGroups.set(groupName, []);
        }
        mainGroups.get(groupName)!.push(check);
      });
      // Sort each group by creation date (oldest first)
      mainGroups.forEach(group => {
        group.sort((a, b) => {
          const aTime = new Date((a as any).created_at || 0).getTime();
          const bTime = new Date((b as any).created_at || 0).getTime();
          return aTime - bTime; // Oldest first
        });
      });
    } else {
      // Section mode: group by section prefix
      checksList.forEach(check => {
        const sectionNumber = (check as any).code_section_number || '';
        const mainPrefix = sectionNumber.split('-')[0] || 'Other';
        if (!mainGroups.has(mainPrefix)) {
          mainGroups.set(mainPrefix, []);
        }
        mainGroups.get(mainPrefix)!.push(check);
      });
      // Sort each group by section number using natural sort
      mainGroups.forEach(group => {
        group.sort((a, b) =>
          naturalCompare((a as any).code_section_number || '', (b as any).code_section_number || '')
        );
      });
    }

    // Sort groups by name/prefix
    const sortedGroups = Array.from(mainGroups.entries()).sort(([a], [b]) => naturalCompare(a, b));

    // Flatten into ID list, including instances
    sortedGroups.forEach(([_, checks]) => {
      checks.forEach(check => {
        ids.push(check.id);
        if (check.instances?.length) {
          // Sort instances by creation date (oldest first)
          const sortedInstances = [...check.instances].sort((a, b) => {
            const aTime = new Date((a as any).created_at || 0).getTime();
            const bTime = new Date((b as any).created_at || 0).getTime();
            return aTime - bTime; // Oldest first
          });
          sortedInstances.forEach(instance => ids.push(instance.id));
        }
      });
    });

    return ids;
  };

  // Pre-compute sorted check IDs for keyboard navigation (expensive sort, only recompute when checks change)
  const sortedCheckIds = useMemo(() => {
    if (checkMode === 'summary' || checkMode === 'gallery' || checkMode === 'chat') return [];
    return getAllCheckIds(displayedChecks, checkMode === 'element' ? 'element' : 'section');
  }, [displayedChecks, checkMode]);

  // Calculate progress dynamically from checks state (all checks, not filtered)
  const progress = useMemo(() => {
    // Exclude checks marked as not_applicable from total count
    const applicableChecks = checks.filter(c => c.manual_status !== 'not_applicable');
    const totalChecks = applicableChecks.length;
    // Count checks with AI assessment OR manual override
    const completed = applicableChecks.filter(
      c =>
        c.latest_status ||
        c.status === 'completed' ||
        (c.manual_status && c.manual_status !== 'not_applicable')
    ).length;
    const pct = totalChecks ? Math.round((completed / totalChecks) * 100) : 0;
    return { totalChecks, completed, pct };
  }, [checks]);
  const [isSeeding, setIsSeeding] = useState(false);

  // Detail Panel State (replaces 4 separate useState calls)
  const [detailPanel, dispatchDetailPanel] = useReducer(detailPanelReducer, { mode: 'closed' });

  // Derived values from reducer state
  const activeCheckId = detailPanel.mode === 'check-detail' ? detailPanel.checkId : null;
  const showDetailPanel = detailPanel.mode !== 'closed';

  // Sync URL hash with detail panel state (side effect in useEffect, not reducer)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (detailPanel.mode === 'check-detail') {
      window.history.replaceState(null, '', `#${detailPanel.checkId}`);
    } else if (detailPanel.mode === 'closed') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    // Violation detail mode doesn't update URL
  }, [detailPanel]);

  // Remember last selection per mode for state preservation when switching
  const lastSelectionPerMode = useRef<{
    section: { checkId: string; filterToSectionKey: string | null } | null;
    element: { checkId: string; filterToSectionKey: string | null } | null;
  }>({ section: null, element: null });

  const [checksSidebarWidth, setChecksSidebarWidth] = useState(384); // 96 * 4 = 384px (w-96)
  const [detailPanelWidth, setDetailPanelWidth] = useState(400);

  const checksSidebarRef = useRef<HTMLDivElement>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const checksResizerRef = useRef<{ isDragging: boolean; startX: number; startWidth: number }>({
    isDragging: false,
    startX: 0,
    startWidth: 0,
  });
  const detailResizerRef = useRef<{ isDragging: boolean; startX: number; startWidth: number }>({
    isDragging: false,
    startX: 0,
    startWidth: 0,
  });

  // Helper: Close detail panel and clear URL hash
  const closeDetailPanel = () => {
    dispatchDetailPanel({ type: 'CLOSE_PANEL' });
  };

  const handleCheckSelect = useCallback(
    (checkId: string, sectionKey?: string) => {
      // Save selection for current mode
      const mode = checkMode === 'element' ? 'element' : 'section';
      lastSelectionPerMode.current[mode] = {
        checkId,
        filterToSectionKey: sectionKey ?? null,
      };

      dispatchDetailPanel({
        type: 'SELECT_CHECK',
        checkId,
        filterToSectionKey: sectionKey,
      });
    },
    [checkMode]
  );

  const handleEditCheck = (violation: ViolationMarker) => {
    // Find the actual check to determine its type reliably
    let actualCheck: CheckData | null = checks.find(c => c.id === violation.checkId) || null;

    // If not found directly, search in instances
    if (!actualCheck) {
      for (const check of checks) {
        if (check.instances?.length) {
          const instance = check.instances.find(i => i.id === violation.checkId);
          if (instance) {
            actualCheck = instance as CheckData;
            break;
          }
        }
      }
    }

    if (!actualCheck) return;

    // Switch to checks tab with appropriate sub-tab
    setMainTab('checks');
    localStorage.setItem(`mainTab-${assessment.id}`, 'checks');

    const targetSubTab = actualCheck.element_group_id != null ? 'elements' : 'sections';
    setChecksSubTab(targetSubTab);
    localStorage.setItem(`checksSubTab-${assessment.id}`, targetSubTab);

    dispatchDetailPanel({
      type: 'SELECT_CHECK',
      checkId: violation.checkId,
      filterToSectionKey: violation.codeSectionKey || null,
    });
  };

  // Helper: Navigate to a check by ID
  const navigateToCheck = (checkId: string | null) => {
    if (checkId) {
      dispatchDetailPanel({ type: 'SELECT_CHECK', checkId, filterToSectionKey: null });
    } else {
      closeDetailPanel();
    }
  };

  // Helper: Mark current check as compliant and optionally advance
  const markCheckCompliant = async (checkId: string, autoAdvance = false) => {
    try {
      const res = await fetch(`/api/checks/${checkId}/manual-override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ override: 'compliant', note: 'Marked via keyboard shortcut' }),
      });

      if (!res.ok) throw new Error('Failed to mark as compliant');

      const { check: updatedCheck } = await res.json();

      // Update local state
      setChecks(prev =>
        prev.map(c => {
          if (c.id === updatedCheck.id) {
            return { ...c, ...updatedCheck, instances: c.instances };
          }
          if (c.instances?.length) {
            const updatedInstances = c.instances.map(inst =>
              inst.id === updatedCheck.id ? { ...inst, ...updatedCheck } : inst
            );
            if (updatedInstances !== c.instances) {
              return { ...c, instances: updatedInstances };
            }
          }
          return c;
        })
      );

      // Auto-advance to next check if requested
      if (autoAdvance) {
        const currentIdx = sortedCheckIds.indexOf(checkId);
        if (currentIdx < sortedCheckIds.length - 1) {
          navigateToCheck(sortedCheckIds[currentIdx + 1]);
        }
      }
    } catch {
      // Silently ignore - UI will show stale state
    }
  };

  const handleMoveToNextCheck = () => {
    const currentIdx = sortedCheckIds.indexOf(activeCheckId || '');
    if (currentIdx === -1 || currentIdx === sortedCheckIds.length - 1) {
      navigateToCheck(null);
    } else {
      navigateToCheck(sortedCheckIds[currentIdx + 1]);
    }
  };

  const handleCheckAdded = useCallback((newCheck: CheckData) => {
    // Add the new check to the state
    setChecks(prevChecks => {
      // Find the parent check
      const parentCheck = prevChecks.find(c => c.id === newCheck.parent_check_id);

      if (parentCheck) {
        // Only add to parent's instances array, NOT as a top-level item
        return prevChecks.map(c => {
          if (c.id === newCheck.parent_check_id) {
            return {
              ...c,
              instances: [...(c.instances || []), newCheck as CheckInstance],
              instance_count: (c.instance_count || 0) + 1,
            };
          }
          return c;
        });
      }

      // If no parent, add as new check
      return [...prevChecks, { ...newCheck, instances: [], instance_count: 0 }];
    });
  }, []);

  const refetchChecks = useCallback(
    async (includeExcluded?: boolean): Promise<CheckData[]> => {
      // Fetch both section and element checks (mirrors page.tsx server component)
      const excludedParam = includeExcluded ? '&include_excluded=true' : '';
      const [sectionRes, elementRes] = await Promise.all([
        fetch(`/api/assessments/${assessment.id}/checks?mode=section${excludedParam}`),
        fetch(`/api/assessments/${assessment.id}/checks?mode=element${excludedParam}`),
      ]);
      if (sectionRes.ok && elementRes.ok) {
        const [sectionChecks, elementChecks] = await Promise.all([
          sectionRes.json(),
          elementRes.json(),
        ]);
        const combined = [...sectionChecks, ...elementChecks];
        setChecks(combined);
        return combined;
      }
      return []; // Return empty if fetch failed
    },
    [assessment.id]
  );

  const refetchViolations = useCallback(async () => {
    setRefreshingViolations(true);
    try {
      const res = await fetch(`/api/assessments/${assessment.id}/violations`);
      if (res.ok) {
        const data = await res.json();
        setRpcViolations(data.violations || []);
      }
    } finally {
      setRefreshingViolations(false);
    }
  }, [assessment.id]);

  const handleMainTabChange = (newTab: 'checks' | 'violations' | 'chat' | 'project') => {
    setMainTab(newTab);
    localStorage.setItem(`mainTab-${assessment.id}`, newTab);

    // Close detail panel when switching to violations, chat, or project
    if (newTab !== 'checks') {
      closeDetailPanel();
    } else {
      // Try to restore last selection when switching back to checks
      const mode = checksSubTab === 'elements' ? 'element' : 'section';
      const lastSelection = lastSelectionPerMode.current[mode];
      if (lastSelection && checks.some(c => c.id === lastSelection.checkId)) {
        dispatchDetailPanel({
          type: 'SELECT_CHECK',
          checkId: lastSelection.checkId,
          filterToSectionKey: lastSelection.filterToSectionKey,
        });
      }
    }
  };

  const handleChecksSubTabChange = (newSubTab: 'elements' | 'sections' | 'gallery') => {
    setChecksSubTab(newSubTab);
    localStorage.setItem(`checksSubTab-${assessment.id}`, newSubTab);

    // Close detail panel for gallery
    if (newSubTab === 'gallery') {
      closeDetailPanel();
      return;
    }

    // Try to restore last selection for this mode
    const mode = newSubTab === 'elements' ? 'element' : 'section';
    const lastSelection = lastSelectionPerMode.current[mode];
    if (lastSelection && checks.some(c => c.id === lastSelection.checkId)) {
      dispatchDetailPanel({
        type: 'SELECT_CHECK',
        checkId: lastSelection.checkId,
        filterToSectionKey: lastSelection.filterToSectionKey,
      });
    } else {
      closeDetailPanel();
    }
  };

  const activeCheck = useMemo(() => {
    if (detailPanel.mode !== 'check-detail') return null;

    // First try to find the check directly
    const directMatch = checks.find(c => c.id === detailPanel.checkId);
    if (directMatch) return directMatch;

    return null;
  }, [checks, detailPanel]);

  const handleInstanceDeleted = useCallback(
    (elementInstanceId: string) => {
      // Remove all checks for this element instance
      setChecks(prevChecks => prevChecks.filter(c => c.element_instance_id !== elementInstanceId));

      // Clear active check if it was in the deleted instance
      if (activeCheck?.element_instance_id === elementInstanceId) {
        closeDetailPanel();
      }
    },
    [activeCheck?.element_instance_id]
  );

  // Auto-seed checks if empty (only try once)
  const [hasSeedAttempted, setHasSeedAttempted] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(`seed-attempted-${assessment.id}`) === 'true';
  });

  useEffect(() => {
    if (checks.length === 0 && !isSeeding && !hasSeedAttempted) {
      setIsSeeding(true);
      setHasSeedAttempted(true);
      localStorage.setItem(`seed-attempted-${assessment.id}`, 'true');

      fetch(`/api/assessments/${assessment.id}/seed`, { method: 'POST' })
        .then(async response => {
          if (!response.ok) throw new Error('Seed failed');
          const data = await response.json();
          if (data.checks_created > 0) {
            setTimeout(() => window.location.reload(), 500);
          } else {
            setIsSeeding(false);
          }
        })
        .catch(() => {
          setIsSeeding(false);
        });
    }
  }, [assessment.id, checks.length, isSeeding, hasSeedAttempted]);

  const [pdfUrl, _setPdfUrl] = useState<string | null>(assessment?.pdf_url || null);

  // Track screenshot refresh trigger to notify CodeDetailPanel
  const screenshotRefreshTriggerRef = useRef(0);

  // Store the refreshScreenshots function from PDFViewer
  const refreshScreenshotsRef = useRef<(() => Promise<void>) | null>(null);

  // Refetch screenshots for a specific check
  const refetchCheckScreenshots = useCallback(async (checkId: string) => {
    try {
      const res = await fetch(`/api/checks/${checkId}/screenshots`);
      if (res.ok) {
        const screenshots = await res.json();

        setChecks(prev =>
          prev.map(check => {
            // Update top-level check if it matches
            if (check.id === checkId) {
              return { ...check, screenshots };
            }
            // Update instance within check if it matches
            if (check.instances?.length && check.instances.length > 0) {
              const updatedInstances = check.instances.map(instance =>
                instance.id === checkId ? { ...instance, screenshots } : instance
              );
              if (updatedInstances !== check.instances) {
                return { ...check, instances: updatedInstances };
              }
            }
            return check;
          })
        );

        // Increment trigger to notify CodeDetailPanel immediately
        screenshotRefreshTriggerRef.current += 1;

        // Also refresh PDF viewer screenshot indicators
        await refreshScreenshotsRef.current?.();
      }
    } catch {
      // Silently ignore
    }
  }, []);

  // Memoized callback to prevent infinite render loop in PDFViewer
  const handleRefreshScreenshotsReady = useCallback((refresh: () => Promise<void>) => {
    refreshScreenshotsRef.current = refresh;
  }, []);

  // Resize handlers for checks sidebar
  const handleChecksResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    checksResizerRef.current = {
      isDragging: true,
      startX: e.clientX,
      startWidth: checksSidebarWidth,
    };
  };

  // Resize handlers for detail panel
  const handleDetailResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    detailResizerRef.current = {
      isDragging: true,
      startX: e.clientX,
      startWidth: detailPanelWidth,
    };
  };

  // Mouse move handler for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (checksResizerRef.current.isDragging) {
        const deltaX = e.clientX - checksResizerRef.current.startX;
        const newWidth = Math.max(280, Math.min(600, checksResizerRef.current.startWidth + deltaX));
        setChecksSidebarWidth(newWidth);
      }

      if (detailResizerRef.current.isDragging) {
        const deltaX = e.clientX - detailResizerRef.current.startX;
        const newWidth = Math.max(300, Math.min(700, detailResizerRef.current.startWidth + deltaX));
        setDetailPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      checksResizerRef.current.isDragging = false;
      detailResizerRef.current.isDragging = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    // Skip in summary/gallery/chat modes
    if (checkMode === 'summary' || checkMode === 'gallery' || checkMode === 'chat') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const currentIdx = sortedCheckIds.indexOf(activeCheckId || '');

      // Arrow Up/Down: Navigate between checks
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        let nextIdx = currentIdx;

        if (e.key === 'ArrowUp' && currentIdx > 0) {
          nextIdx = currentIdx - 1;
        } else if (e.key === 'ArrowDown' && currentIdx < sortedCheckIds.length - 1) {
          nextIdx = currentIdx + 1;
        }

        if (nextIdx !== currentIdx) {
          navigateToCheck(sortedCheckIds[nextIdx]);
        }
      }

      // Enter: Mark as compliant and advance (but not when PDF search is open)
      if (e.key === 'Enter' && activeCheckId && !isPdfSearchOpen) {
        e.preventDefault();
        markCheckCompliant(activeCheckId, true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeCheckId, sortedCheckIds, isPdfSearchOpen]);

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      {/* Loading Modal */}
      {isSeeding && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <h3 className="text-lg font-semibold">Loading Code Sections</h3>
            </div>

            <p className="text-sm text-gray-500 mt-4">Creating checks for selected chapters...</p>
          </div>
        </div>
      )}
      {/* Left Sidebar with Checks */}
      <div
        ref={checksSidebarRef}
        className="flex-shrink-0 bg-[#e8eeea] border-r border-[#d0d9d3] flex flex-col h-screen overflow-hidden relative z-10"
        style={{ width: `${checksSidebarWidth}px` }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#d0d9d3] bg-[#dce5df]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
              </Link>
              <h2 className="text-base font-semibold text-gray-900 truncate max-w-[180px]">
                {assessment.projects?.name || 'Compliance Checks'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAgentModalOpen(true)}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-lg border transition-colors',
                  existingAgentRun
                    ? 'text-amber-600 bg-amber-50 border-amber-200 hover:border-amber-400'
                    : 'text-purple-600 hover:text-purple-500 bg-purple-50 border-purple-200 hover:border-purple-400'
                )}
                title={existingAgentRun ? 'View Agent Progress' : 'Run AI Agent Analysis (Beta)'}
              >
                {existingAgentRun ? (
                  <svg
                    className="animate-spin"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                    <circle cx="8" cy="14" r="2" />
                    <circle cx="16" cy="14" r="2" />
                  </svg>
                )}
              </button>
              <Link
                href={`/projects/${assessment.project_id}/report`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-accent-600 hover:text-accent-500 bg-white border border-line rounded-lg hover:border-accent-400 transition-colors"
                title="View Compliance Report (opens in new tab)"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M14 3h7v7M21 3l-9 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <path d="M21 14v7H3V3h7" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Main Tab Navigation */}
          <div className="mb-2 flex items-center gap-1 bg-[#c8d4cc] rounded-lg p-1">
            <button
              onClick={() => handleMainTabChange('checks')}
              className={clsx(
                'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                mainTab === 'checks'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              Checks
            </button>
            <button
              onClick={() => handleMainTabChange('violations')}
              className={clsx(
                'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                mainTab === 'violations'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              Violations
            </button>
            <button
              onClick={() => handleMainTabChange('chat')}
              className={clsx(
                'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                mainTab === 'chat'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              Chat
            </button>
            <button
              onClick={() => handleMainTabChange('project')}
              className={clsx(
                'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                mainTab === 'project'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              Project
            </button>
          </div>

          {/* Sub-tab for Checks mode */}
          {mainTab === 'checks' && (
            <div className="mb-3 flex items-center gap-1 bg-[#d5dfd8] border border-[#c0ccc4] rounded-lg p-0.5">
              <button
                onClick={() => handleChecksSubTabChange('elements')}
                className={clsx(
                  'flex-1 px-2 py-1 text-xs font-medium rounded transition-colors',
                  checksSubTab === 'elements'
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                Elements
              </button>
              <button
                onClick={() => handleChecksSubTabChange('sections')}
                className={clsx(
                  'flex-1 px-2 py-1 text-xs font-medium rounded transition-colors',
                  checksSubTab === 'sections'
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                Sections
              </button>
              <button
                onClick={() => handleChecksSubTabChange('gallery')}
                className={clsx(
                  'flex-1 px-2 py-1 text-xs font-medium rounded transition-colors',
                  checksSubTab === 'gallery'
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                Gallery
              </button>
            </div>
          )}

          {/* CSV Import Button (only show in Elements mode) */}
          {mainTab === 'checks' && checksSubTab === 'elements' && (
            <div className="mb-3">
              <ImportCSVDoorsModal assessmentId={assessment.id} onSuccess={() => refetchChecks()} />
            </div>
          )}

          {/* Progress Bar (show only in checks mode) */}
          {mainTab === 'checks' && checksSubTab !== 'gallery' && (
            <div className="mb-3">
              <div className="relative w-full bg-gray-200 rounded h-6 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-sage-500 to-sage-600 transition-all duration-300"
                  style={{ width: `${progress.pct}%` }}
                />
                <div className="absolute inset-0 flex items-center px-3">
                  <span className="text-xs font-medium text-gray-800 drop-shadow-sm">
                    {progress.completed} / {progress.totalChecks}
                  </span>
                  <span className="ml-auto text-xs font-medium text-gray-600">
                    {Math.round(progress.pct)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {mainTab === 'violations' ? (
            <ViolationsSummary
              checks={checks}
              rpcViolations={rpcViolations}
              onCheckSelect={handleCheckSelect}
              onViolationSelect={violation => {
                if (violation) {
                  dispatchDetailPanel({ type: 'SELECT_VIOLATION', violation });
                } else {
                  closeDetailPanel();
                }
              }}
              onEditCheck={handleEditCheck}
              buildingInfo={buildingInfo}
              codebooks={codebooks}
              pdfUrl={assessment.pdf_url ?? undefined}
              projectName={assessment.projects?.name}
              assessmentId={assessment.id}
              embedded={true}
              onRefresh={refetchViolations}
              refreshing={refreshingViolations}
            />
          ) : mainTab === 'chat' ? (
            <ChatPanel assessmentId={assessment.id} />
          ) : mainTab === 'project' ? (
            <ProjectPanel
              projectId={assessment.project_id}
              projectName={assessment.projects?.name || 'Project'}
              initialVariables={assessment.extracted_variables}
              pipelineOutput={assessment.pipeline_output}
              assessmentId={assessment.id}
              onChecksFiltered={refetchChecks}
            />
          ) : checksSubTab === 'gallery' ? (
            <AssessmentScreenshotGallery assessmentId={assessment.id} />
          ) : (
            <CheckList
              checks={displayedChecks}
              checkMode={checksSubTab === 'sections' ? 'section' : 'element'}
              activeCheckId={activeCheckId}
              onSelect={handleCheckSelect}
              assessmentId={assessment.id}
              onCheckAdded={handleCheckAdded}
              onInstanceDeleted={handleInstanceDeleted}
              refetchChecks={async () => {
                await refetchChecks();
              }}
            />
          )}
        </div>
      </div>

      {/* Resize Handle for Checks Sidebar */}
      <div
        onMouseDown={handleChecksResizeStart}
        className="w-1 bg-gray-200 hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors relative z-20"
        style={{ touchAction: 'none' }}
      />

      {/* Detail Panel (Violation or Code) */}
      <div
        ref={detailPanelRef}
        className="flex-shrink-0 h-screen overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          width: showDetailPanel ? `${detailPanelWidth}px` : '0px',
          opacity: showDetailPanel ? 1 : 0,
        }}
      >
        {showDetailPanel && (
          <>
            {/* Show ViolationDetailPanel in violations mode with selected violation */}
            {mainTab === 'violations' && detailPanel.mode === 'violation-detail' ? (
              <ViolationDetailPanel
                violation={detailPanel.violation}
                onClose={closeDetailPanel}
                onCheckUpdate={async () => {
                  await refetchChecks();
                }}
              />
            ) : (
              <CodeDetailPanel
                checkId={activeCheck?.id || null}
                sectionKey={activeCheck?.sections?.key || null}
                filterToSectionKey={
                  detailPanel.mode === 'check-detail' ? detailPanel.filterToSectionKey : null
                }
                activeCheck={activeCheck}
                screenshotRefreshTrigger={screenshotRefreshTriggerRef.current}
                onClose={closeDetailPanel}
                onMoveToNextCheck={handleMoveToNextCheck}
                onCheckUpdate={async () => {
                  if (activeCheck?.id) {
                    try {
                      const res = await fetch(`/api/checks/${activeCheck.id}`);
                      if (res.ok) {
                        const { check: updatedCheck } = await res.json();
                        setChecks(prev =>
                          prev.map(c => (c.id === updatedCheck.id ? { ...c, ...updatedCheck } : c))
                        );
                      }
                    } catch {
                      // Silently ignore
                    }
                  }
                }}
                onChecksRefresh={async () => {
                  const updatedChecks = await refetchChecks();
                  // Close panel if the active check was deleted
                  if (activeCheck?.id && !updatedChecks.find(c => c.id === activeCheck.id)) {
                    closeDetailPanel();
                  }
                }}
                onScreenshotAssigned={() => {
                  if (activeCheck?.id) {
                    refetchCheckScreenshots(activeCheck.id);
                  }
                }}
                onScreenshotDeleted={async () => {
                  await refreshScreenshotsRef.current?.();
                  if (activeCheck?.id) {
                    await refetchCheckScreenshots(activeCheck.id);
                  }
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Resize Handle for Detail Panel */}
      {showDetailPanel && (
        <div
          onMouseDown={handleDetailResizeStart}
          className="w-1 bg-gray-200 hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors relative z-20"
          style={{ touchAction: 'none' }}
        />
      )}

      {/* Main Content Area with PDF Viewer */}
      <div className="flex-1 bg-white overflow-hidden h-screen border-l border-gray-300">
        {pdfUrl ? (
          <PDFViewer
            pdfUrl={pdfUrl}
            projectId={assessment.project_id}
            assessmentId={assessment.id}
            activeCheck={activeCheck || undefined}
            onScreenshotSaved={refetchCheckScreenshots}
            onCheckAdded={handleCheckAdded}
            onCheckSelect={handleCheckSelect}
            refetchChecks={async () => {
              await refetchChecks();
            }}
            onRefreshScreenshotsReady={handleRefreshScreenshotsReady}
            onSearchStateChange={setIsPdfSearchOpen}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No document</h3>
              <p className="mt-1 text-sm text-gray-500">Upload a PDF to begin the assessment.</p>
            </div>
          </div>
        )}
      </div>

      {/* Agent Analysis Modal */}
      <AgentAnalysisModal
        assessmentId={assessment.id}
        open={isAgentModalOpen}
        onOpenChange={setIsAgentModalOpen}
        existingRun={existingAgentRun}
        onRunStatusChange={setExistingAgentRun}
      />
    </div>
  );
}
