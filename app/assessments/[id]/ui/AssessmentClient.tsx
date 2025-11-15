'use client';

import { useEffect, useMemo, useState, useRef, useReducer } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import clsx from 'clsx';
import { CheckList } from '@/components/checks/CheckList';
import { CodeDetailPanel } from '@/components/checks/CodeDetailPanel';
import { ViolationsSummary } from '@/components/checks/ViolationsSummary';
import { ViolationDetailPanel } from '@/components/checks/ViolationDetailPanel';
import { AssessmentScreenshotGallery } from '@/components/screenshots/AssessmentScreenshotGallery';
import { ImportCSVDoorsModal } from '@/components/assessments/ImportCSVDoorsModal';
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

interface AssessmentData {
  id: string;
  project_id: string;
  pdf_url?: string | null;
  projects?: {
    name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
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
  switch (action.type) {
    case 'CLOSE_PANEL':
      return { mode: 'closed' };

    case 'SELECT_CHECK':
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

  // Debug: Log screenshots on initial load
  useEffect(() => {
    const checksWithScreenshots = initialChecks.filter(
      c => c.screenshots?.length && c.screenshots.length > 0
    );
    const instancesWithScreenshots = initialChecks
      .flatMap(c => c.instances || [])
      .filter(i => i.screenshots?.length && i.screenshots.length > 0);

    // eslint-disable-next-line no-console -- Logging is allowed for internal debugging
    console.log(
      '[AssessmentClient] Initial checks with screenshots:',
      checksWithScreenshots.length
    );
    // eslint-disable-next-line no-console -- Logging is allowed for internal debugging
    console.log(
      '[AssessmentClient] Initial INSTANCES with screenshots:',
      instancesWithScreenshots.length
    );

    instancesWithScreenshots.slice(0, 5).forEach(i => {
      // eslint-disable-next-line no-console -- Logging is allowed for internal debugging
      console.log(`  - ${i.instance_label}: ${i.screenshots?.length ?? 0} screenshots`);
    });
  }, [initialChecks]);
  const [checkMode, setCheckMode] = useState<'section' | 'element' | 'summary' | 'gallery'>(
    'section'
  );

  // Restore saved mode after hydration to avoid mismatch
  useEffect(() => {
    const saved = localStorage.getItem(`checkMode-${assessment.id}`);
    if (saved) {
      setCheckMode(saved as 'section' | 'element' | 'summary' | 'gallery');
    }

    // Also restore active check ID from URL hash if present
    if (typeof window !== 'undefined' && window.location.hash) {
      const hashCheckId = window.location.hash.substring(1); // Remove the '#'
      if (hashCheckId) {
        dispatchDetailPanel({
          type: 'SELECT_CHECK',
          checkId: hashCheckId,
          filterToSectionKey: null,
        });
      }
    }
  }, [assessment.id]);

  // Filter checks by mode (skip filtering for summary/gallery modes)
  const displayedChecks = useMemo(() => {
    if (checkMode === 'summary' || checkMode === 'gallery') return checks;

    // Element mode: show checks with element_group_id
    // Section mode: show checks without element_group_id (standalone sections)
    if (checkMode === 'element') {
      return checks.filter(c => c.element_group_id != null);
    } else {
      return checks.filter(c => c.element_group_id == null);
    }
  }, [checks, checkMode]);

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

  const handleCheckSelect = (checkId: string, sectionKey?: string) => {
    console.log('[handleCheckSelect] Called with:', {
      checkId,
      sectionKey,
      checksCount: checks.length,
      checkExists: checks.some(c => c.id === checkId),
    });

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
  };

  const handleEditCheck = (violation: ViolationMarker) => {
    // eslint-disable-next-line no-console -- Logging is allowed for internal debugging
    console.log('[handleEditCheck] Called with violation:', {
      codeSectionKey: violation.codeSectionKey,
      checkType: violation.checkType,
    });

    // Find the actual check to determine its type reliably
    let actualCheck: CheckData | null = null;

    // Search in all checks
    actualCheck = checks.find(c => c.id === violation.checkId) || null;

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

    // eslint-disable-next-line no-console -- Logging is allowed for internal debugging
    console.log('[handleEditCheck] Found check:', {
      found: !!actualCheck,
      checkId: actualCheck?.id,
      elementGroupId: actualCheck?.element_group_id,
      totalChecksSearched: checks.length,
    });

    if (!actualCheck) {
      console.error(
        '[handleEditCheck] Check not found in checks array. CheckId:',
        violation.checkId
      );
      // eslint-disable-next-line no-console -- Logging is allowed for internal debugging
      console.log(
        '[handleEditCheck] Available check IDs:',
        checks.map(c => c.id)
      );
      console.log(
        '[handleEditCheck] Available instance IDs:',
        checks.flatMap(c => (c.instances || []).map(i => i.id))
      );
      return; // Don't proceed if check not found
    }

    // Determine mode from actual check data
    const hasElementGroup = actualCheck?.element_group_id != null;
    const targetMode = hasElementGroup ? 'element' : 'section';

    // eslint-disable-next-line no-console -- Logging is allowed for internal debugging
    console.log('[handleEditCheck] Switching to mode:', targetMode);

    // Switch mode and select check in one go
    setCheckMode(targetMode);
    localStorage.setItem(`checkMode-${assessment.id}`, targetMode);

    dispatchDetailPanel({
      type: 'SELECT_CHECK',
      checkId: violation.checkId,
      filterToSectionKey: violation.codeSectionKey || null,
    });
  };

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
        const allIds = getAllCheckIds(
          displayedChecks,
          checkMode === 'element' ? 'element' : 'section'
        );
        const currentIdx = allIds.indexOf(checkId);
        if (currentIdx < allIds.length - 1) {
          navigateToCheck(allIds[currentIdx + 1]);
        }
      }
    } catch (error) {
      console.error('[Keyboard Nav] Error marking as compliant:', error);
    }
  };

  const handleMoveToNextCheck = () => {
    const allIds = getAllCheckIds(checks, checkMode === 'element' ? 'element' : 'section');
    const currentIdx = allIds.indexOf(activeCheckId || '');

    if (currentIdx === -1 || currentIdx === allIds.length - 1) {
      navigateToCheck(null);
    } else {
      navigateToCheck(allIds[currentIdx + 1]);
    }
  };

  const handleCheckAdded = (newCheck: CheckData) => {
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
  };

  const refetchChecks = async () => {
    console.log('[AssessmentClient] refetchChecks called, current checks count:', checks.length);
    const checksRes = await fetch(
      `/api/assessments/${assessment.id}/checks?mode=${checkMode === 'element' ? 'element' : 'section'}`
    );
    if (checksRes.ok) {
      const updatedChecks = await checksRes.json();
      console.log('[AssessmentClient] Fetched updated checks:', {
        previousCount: checks.length,
        newCount: updatedChecks.length,
        diff: updatedChecks.length - checks.length,
      });
      setChecks(updatedChecks);
      console.log('[AssessmentClient] Checks state updated');
    } else {
      console.error(
        '[AssessmentClient] Failed to fetch checks:',
        checksRes.status,
        checksRes.statusText
      );
    }
  };

  const refetchViolations = async () => {
    console.log('[AssessmentClient] refetchViolations called');
    setRefreshingViolations(true);

    try {
      const res = await fetch(`/api/assessments/${assessment.id}/violations`);
      if (res.ok) {
        const data = await res.json();
        console.log('[AssessmentClient] Fetched updated violations:', {
          count: data.count,
          timestamp: data.timestamp,
        });
        setRpcViolations(data.violations || []);
      } else {
        console.error('[AssessmentClient] Failed to fetch violations:', res.status, res.statusText);
      }
    } catch (error) {
      console.error('[AssessmentClient] Error fetching violations:', error);
    } finally {
      setRefreshingViolations(false);
    }
  };

  const handleModeChange = async (newMode: 'section' | 'element' | 'summary' | 'gallery') => {
    setCheckMode(newMode);
    localStorage.setItem(`checkMode-${assessment.id}`, newMode);

    // Close detail panel when switching to summary or gallery
    if (newMode === 'summary' || newMode === 'gallery') {
      closeDetailPanel();
      return;
    }

    // Fetch data when switching between section and element modes
    try {
      const checksRes = await fetch(`/api/assessments/${assessment.id}/checks?mode=${newMode}`);
      if (checksRes.ok) {
        const updatedChecks = await checksRes.json();
        console.log('[AssessmentClient] Fetched checks for mode:', newMode, updatedChecks.length);
        setChecks(updatedChecks);

        // Try to restore last selection for this mode (better UX)
        const lastSelection = lastSelectionPerMode.current[newMode];
        if (lastSelection && updatedChecks.some((c: any) => c.id === lastSelection.checkId)) {
          // Restore the previous selection
          dispatchDetailPanel({
            type: 'SELECT_CHECK',
            checkId: lastSelection.checkId,
            filterToSectionKey: lastSelection.filterToSectionKey,
          });
        } else {
          // No saved selection or it doesn't exist anymore - close panel
          closeDetailPanel();
        }
      } else {
        console.error('[AssessmentClient] Failed to fetch checks for mode:', newMode);
      }
    } catch (error) {
      console.error('[AssessmentClient] Error fetching checks for mode:', newMode, error);
    }
  };

  const handleInstanceDeleted = (elementInstanceId: string) => {
    console.log('[AssessmentClient] handleInstanceDeleted called:', { elementInstanceId });

    // Remove all checks for this element instance
    setChecks(prevChecks => {
      const filtered = prevChecks.filter(c => c.element_instance_id !== elementInstanceId);
      console.log('[AssessmentClient] Removed checks for instance:', {
        elementInstanceId,
        before: prevChecks.length,
        after: filtered.length,
        removed: prevChecks.length - filtered.length,
      });
      return filtered;
    });

    // Clear active check if it was in the deleted instance
    if (activeCheck?.element_instance_id === elementInstanceId) {
      console.log('[AssessmentClient] Clearing active check (was in deleted instance)');
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

  // Auto-seed checks if empty (only try once)
  const [hasSeedAttempted, setHasSeedAttempted] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(`seed-attempted-${assessment.id}`) === 'true';
  });

  useEffect(() => {
    // eslint-disable-next-line no-console -- Logging is allowed for internal debugging
    console.log('[AssessmentClient] Effect triggered', {
      checksLength: checks.length,
      isSeeding,
      hasSeedAttempted,
    });

    if (checks.length === 0 && !isSeeding && !hasSeedAttempted) {
      console.log('[AssessmentClient] Starting seed process for assessment:', assessment.id);
      setIsSeeding(true);
      setHasSeedAttempted(true);
      localStorage.setItem(`seed-attempted-${assessment.id}`, 'true');

      // Call seed endpoint once
      fetch(`/api/assessments/${assessment.id}/seed`, { method: 'POST' })
        .then(async response => {
          console.log('[AssessmentClient] Seed response received:', response.status, response.ok);

          if (!response.ok) {
            const errorText = await response.text();
            console.error('[AssessmentClient] Seed failed:', response.status, errorText);
            throw new Error(`Seed failed: ${response.status} - ${errorText}`);
          }

          const data = await response.json();
          console.log('[AssessmentClient] Seed data:', data);

          // Reload to show the checks
          if (data.checks_created > 0) {
            console.log(`[AssessmentClient] Created ${data.checks_created} checks, reloading...`);
            setTimeout(() => window.location.reload(), 500);
          } else {
            console.warn('[AssessmentClient] No checks created, not reloading');
            setIsSeeding(false);
          }
        })
        .catch(error => {
          console.error('[AssessmentClient] Failed to seed assessment:', error);
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
  const refetchCheckScreenshots = async (checkId: string) => {
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
    } catch (error) {
      console.error('[refetchCheckScreenshots] Error:', error);
    }
  };

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
    // Skip in summary/gallery modes
    if (checkMode === 'summary' || checkMode === 'gallery') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const mode = checkMode === 'element' ? 'element' : 'section';
      const allIds = getAllCheckIds(displayedChecks, mode);
      const currentIdx = allIds.indexOf(activeCheckId || '');

      // Arrow Up/Down: Navigate between checks
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        let nextIdx = currentIdx;

        if (e.key === 'ArrowUp' && currentIdx > 0) {
          nextIdx = currentIdx - 1;
        } else if (e.key === 'ArrowDown' && currentIdx < allIds.length - 1) {
          nextIdx = currentIdx + 1;
        }

        if (nextIdx !== currentIdx) {
          navigateToCheck(allIds[nextIdx]);
          console.log(`[Keyboard] Navigated to check ${nextIdx + 1}/${allIds.length}`);
        }
      }

      // Enter: Mark as compliant and advance
      if (e.key === 'Enter' && activeCheckId) {
        e.preventDefault();
        console.log(`[Keyboard] Marking check as compliant: ${activeCheckId}`);
        markCheckCompliant(activeCheckId, true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeCheckId, displayedChecks, checkMode]);

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
        className="flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-screen overflow-hidden relative z-10"
        style={{ width: `${checksSidebarWidth}px` }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">
              {assessment.projects?.name || 'Compliance Checks'}
            </h2>
            <div className="flex items-center gap-2">
              <Link
                href={`/projects/${assessment.project_id}/report`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-accent-600 hover:text-accent-500 bg-white border border-line rounded-lg hover:border-accent-400 transition-colors"
                title="View Compliance Report (opens in new tab)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M14 3h7v7M21 3l-9 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <path d="M21 14v7H3V3h7" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
                Report
              </Link>
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
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="mb-3 flex items-center gap-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => handleModeChange('section')}
              className={clsx(
                'flex-1 px-3 py-2 text-sm font-medium rounded transition-colors',
                checkMode === 'section'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              By Section
            </button>
            <button
              onClick={() => handleModeChange('element')}
              className={clsx(
                'flex-1 px-3 py-2 text-sm font-medium rounded transition-colors',
                checkMode === 'element'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              By Element
            </button>
            <button
              onClick={() => handleModeChange('summary')}
              className={clsx(
                'flex-1 px-3 py-2 text-sm font-medium rounded transition-colors',
                checkMode === 'summary'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              Summary
            </button>
            <button
              onClick={() => handleModeChange('gallery')}
              className={clsx(
                'flex-1 px-3 py-2 text-sm font-medium rounded transition-colors',
                checkMode === 'gallery'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              Gallery
            </button>
          </div>

          {/* CSV Import Button (only show in Element mode) */}
          {checkMode === 'element' && (
            <div className="mb-3">
              <ImportCSVDoorsModal assessmentId={assessment.id} onSuccess={refetchChecks} />
            </div>
          )}

          {/* Progress Bar */}
          <div className="mb-3">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Progress</span>
              <span>{Math.round(progress.pct)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {progress.completed} of {progress.totalChecks} checks completed
            </div>
          </div>
        </div>

        {/* Checks List */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {checkMode === 'summary' ? (
            (() => {
              console.log('[AssessmentClient] About to render ViolationsSummary with:', {
                hasRefetchViolations: typeof refetchViolations === 'function',
                refreshingViolations,
                rpcViolationsCount: rpcViolations?.length || 0,
              });
              return (
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
              );
            })()
          ) : checkMode === 'gallery' ? (
            <AssessmentScreenshotGallery assessmentId={assessment.id} />
          ) : (
            <CheckList
              checks={displayedChecks}
              checkMode={checkMode === 'section' ? 'section' : 'element'}
              activeCheckId={activeCheckId}
              onSelect={handleCheckSelect}
              assessmentId={assessment.id}
              onCheckAdded={handleCheckAdded}
              onInstanceDeleted={handleInstanceDeleted}
              refetchChecks={refetchChecks}
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
            {/* Show ViolationDetailPanel in summary mode with selected violation */}
            {checkMode === 'summary' && detailPanel.mode === 'violation-detail' ? (
              <ViolationDetailPanel
                violation={detailPanel.violation}
                onClose={closeDetailPanel}
                onCheckUpdate={async () => {
                  // Refetch all checks to refresh violations list
                  // In summary mode, determine the mode from the selected violation's check
                  try {
                    let mode: 'section' | 'element' = 'section';
                    if (detailPanel.mode === 'violation-detail') {
                      // Check if this violation is from an element check
                      const check = checks.find(c => c.id === detailPanel.violation.checkId);
                      mode = check?.element_group_id ? 'element' : 'section';
                    }

                    const res = await fetch(
                      `/api/assessments/${assessment.id}/checks?mode=${mode}`
                    );
                    if (res.ok) {
                      const updatedChecks = await res.json();
                      setChecks(updatedChecks);
                    }
                  } catch (error) {
                    console.error('Failed to refetch checks:', error);
                  }
                }}
              />
            ) : (
              /* Show CodeDetailPanel in section/element modes */
              (() => {
                return (
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
                              prev.map(c =>
                                c.id === updatedCheck.id
                                  ? { ...c, ...updatedCheck } // ← Just update if ID matches
                                  : c
                              )
                            );
                          }
                        } catch (error) {
                          console.error('Failed to refetch check:', error);
                        }
                      }
                    }}
                    onChecksRefresh={async () => {
                      // Refetch all checks (used after exclusion)
                      try {
                        const res = await fetch(
                          `/api/assessments/${assessment.id}/checks?mode=${checkMode === 'element' ? 'element' : 'section'}`
                        );
                        if (res.ok) {
                          const updatedChecks = (await res.json()) as CheckData[];
                          setChecks(updatedChecks);
                          // Close the detail panel if the active check was deleted
                          if (!updatedChecks.find(c => c.id === activeCheck?.id)) {
                            closeDetailPanel();
                          }
                        }
                      } catch (error) {
                        console.error('Failed to refetch checks:', error);
                      }
                    }}
                    onScreenshotAssigned={() => {
                      // Refetch screenshots for the active check
                      if (activeCheck?.id) {
                        refetchCheckScreenshots(activeCheck.id);
                      }
                    }}
                    onScreenshotDeleted={async () => {
                      console.log('[AssessmentClient] onScreenshotDeleted called');
                      // Refresh PDF viewer screenshot indicators
                      if (refreshScreenshotsRef.current) {
                        console.log('[AssessmentClient] Calling refreshScreenshotsRef.current');
                        await refreshScreenshotsRef.current();
                        console.log('[AssessmentClient] refreshScreenshotsRef.current completed');
                      } else {
                        console.warn('[AssessmentClient] refreshScreenshotsRef.current is null!');
                      }
                      // Also refetch screenshots for the active check
                      if (activeCheck?.id) {
                        console.log(
                          '[AssessmentClient] Refetching check screenshots for:',
                          activeCheck.id
                        );
                        await refetchCheckScreenshots(activeCheck.id);
                      }
                    }}
                  />
                );
              })()
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
      <div className="flex-1 bg-gray-50 overflow-hidden h-screen">
        {pdfUrl ? (
          <PDFViewer
            pdfUrl={pdfUrl}
            projectId={assessment.project_id}
            assessmentId={assessment.id}
            activeCheck={activeCheck || undefined}
            onScreenshotSaved={refetchCheckScreenshots}
            onCheckAdded={handleCheckAdded}
            onCheckSelect={handleCheckSelect}
            refetchChecks={refetchChecks}
            onRefreshScreenshotsReady={refresh => {
              console.log('[AssessmentClient] PDFViewer refreshScreenshots function received');
              refreshScreenshotsRef.current = refresh;
            }}
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
    </div>
  );
}
