'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import clsx from 'clsx';
import { CheckList } from '@/components/checks/CheckList';
import { CodeDetailPanel } from '@/components/checks/CodeDetailPanel';
import { ViolationsSummary } from '@/components/checks/ViolationsSummary';
import { ViolationDetailPanel } from '@/components/checks/ViolationDetailPanel';
import { AssessmentScreenshotGallery } from '@/components/screenshots/AssessmentScreenshotGallery';
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
  code_section_key?: string;
  element_group_id?: string | null;
  latest_status?: string | null;
  status?: string;
  manual_status?: string | null;
  has_section_overrides?: boolean;
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

export default function AssessmentClient({
  assessment,
  checks: initialChecks,
  rpcViolations: _rpcViolations,
  progress: _initialProgress,
  buildingInfo,
  codebooks,
}: Props) {
  const [checks, setChecks] = useState(initialChecks);

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
        setActiveCheckId(hashCheckId);
        setShowDetailPanel(true);
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
    // Count checks with AI assessment OR manual override OR section overrides (but not not_applicable)
    const completed = applicableChecks.filter(
      c =>
        c.latest_status ||
        c.status === 'completed' ||
        (c.manual_status && c.manual_status !== 'not_applicable') ||
        c.has_section_overrides
    ).length;
    const pct = totalChecks ? Math.round((completed / totalChecks) * 100) : 0;
    return { totalChecks, completed, pct };
  }, [checks]);
  const [isSeeding, setIsSeeding] = useState(false);
  const [activeCheckId, setActiveCheckId] = useState<string | null>(checks[0]?.id || null);
  const [filterToSectionKey, setFilterToSectionKey] = useState<string | null>(null);
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const [selectedViolation, setSelectedViolation] = useState<ViolationMarker | null>(null);
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

  const handleCheckSelect = (checkId: string, sectionKey?: string) => {
    setActiveCheckId(checkId);
    setShowDetailPanel(true);
    // Store sectionKey if provided (for filtering in CodeDetailPanel)
    if (sectionKey) {
      setFilterToSectionKey(sectionKey);
    } else {
      setFilterToSectionKey(null);
    }
    // Update URL hash to preserve selection across refreshes
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${checkId}`);
    }
  };

  const handleEditCheck = (violation: ViolationMarker) => {
    // eslint-disable-next-line no-console -- Logging is allowed for internal debugging
    console.log('[handleEditCheck] Called with violation:', {
      checkId: violation.checkId,
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
    setActiveCheckId(violation.checkId);
    setShowDetailPanel(true);
    setFilterToSectionKey(violation.codeSectionKey || null);

    // Update URL hash
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${violation.checkId}`);
    }
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
      // Sort each group by instance label
      mainGroups.forEach(group => {
        group.sort((a, b) =>
          ((a as any).instance_label || '').localeCompare((b as any).instance_label || '')
        );
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
          // Sort instances if they exist
          const sortedInstances = [...check.instances].sort((a, b) =>
            ((a as any).instance_label || '').localeCompare((b as any).instance_label || '')
          );
          sortedInstances.forEach(instance => ids.push(instance.id));
        }
      });
    });

    return ids;
  };

  // Helper: Navigate to a check by ID
  const navigateToCheck = (checkId: string | null) => {
    setActiveCheckId(checkId);
    setShowDetailPanel(!!checkId);
    if (typeof window !== 'undefined') {
      const url = checkId ? `#${checkId}` : window.location.pathname + window.location.search;
      window.history.replaceState(null, '', url);
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
    const checksRes = await fetch(`/api/assessments/${assessment.id}/checks`);
    if (checksRes.ok) {
      const updatedChecks = await checksRes.json();
      setChecks(updatedChecks);
    }
  };

  const handleInstanceDeleted = (elementGroupId: string, instanceLabel: string) => {
    // Remove all checks for this element instance with a single filter operation
    setChecks(prevChecks =>
      prevChecks.filter(
        c => !(c.element_group_id === elementGroupId && c.instance_label === instanceLabel)
      )
    );

    // Clear active check if it was in the deleted instance
    if (
      activeCheck?.element_group_id === elementGroupId &&
      activeCheck?.instance_label === instanceLabel
    ) {
      setActiveCheckId(null);
      setShowDetailPanel(false);
      // Clear URL hash
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  };

  const activeCheck = useMemo(() => {
    // First try to find the check directly
    const directMatch = checks.find(c => c.id === activeCheckId);
    if (directMatch) return directMatch;

    // If not found, search within instances
    for (const check of checks) {
      if (check.instances?.length && check.instances.length > 0) {
        const instance = check.instances.find(i => i.id === activeCheckId);
        if (instance) return instance as CheckData;
      }
    }

    return null;
  }, [checks, activeCheckId]);

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
  const [screenshotsChanged, setScreenshotsChanged] = useState(0);

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

  // Refetch active check's screenshots when a new one is saved
  useEffect(() => {
    if (screenshotsChanged === 0 || !activeCheckId) return;

    const refetchScreenshots = async () => {
      try {
        const res = await fetch(`/api/checks/${activeCheckId}/screenshots`);
        if (res.ok) {
          const screenshots = await res.json();
          setChecks(prev =>
            prev.map(check => {
              // Update top-level check if it matches
              if (check.id === activeCheckId) {
                return { ...check, screenshots };
              }
              // Update instance within check if it matches
              if (check.instances?.length && check.instances.length > 0) {
                const updatedInstances = check.instances.map(instance =>
                  instance.id === activeCheckId ? { ...instance, screenshots } : instance
                );
                if (updatedInstances !== check.instances) {
                  return { ...check, instances: updatedInstances };
                }
              }
              return check;
            })
          );
        }
      } catch (error) {
        console.error('Failed to refetch screenshots:', error);
      }
    };

    refetchScreenshots();
  }, [screenshotsChanged, activeCheckId]);

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
              onClick={() => {
                setCheckMode('section');
                localStorage.setItem(`checkMode-${assessment.id}`, 'section');
              }}
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
              onClick={() => {
                setCheckMode('element');
                localStorage.setItem(`checkMode-${assessment.id}`, 'element');
              }}
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
              onClick={() => {
                setCheckMode('summary');
                localStorage.setItem(`checkMode-${assessment.id}`, 'summary');
              }}
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
              onClick={() => {
                setCheckMode('gallery');
                localStorage.setItem(`checkMode-${assessment.id}`, 'gallery');
              }}
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
            <ViolationsSummary
              checks={checks}
              rpcViolations={_rpcViolations}
              onCheckSelect={handleCheckSelect}
              onViolationSelect={violation => {
                setSelectedViolation(violation);
                setShowDetailPanel(!!violation);
              }}
              onEditCheck={handleEditCheck}
              buildingInfo={buildingInfo}
              codebooks={codebooks}
              pdfUrl={assessment.pdf_url ?? undefined}
              projectName={assessment.projects?.name}
              assessmentId={assessment.id}
              embedded={true}
            />
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
            {checkMode === 'summary' && selectedViolation ? (
              <ViolationDetailPanel
                violation={selectedViolation}
                onClose={() => {
                  setShowDetailPanel(false);
                  setSelectedViolation(null);
                }}
                onCheckUpdate={async () => {
                  // Refetch all checks to refresh violations list
                  try {
                    const res = await fetch(`/api/assessments/${assessment.id}/checks`);
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
              <CodeDetailPanel
                checkId={activeCheck?.id || null}
                sectionKey={activeCheck?.code_section_key || null}
                filterToSectionKey={filterToSectionKey}
                activeCheck={activeCheck}
                screenshotsRefreshKey={screenshotsChanged}
                onClose={() => {
                  setShowDetailPanel(false);
                  // Clear URL hash when panel is closed
                  if (typeof window !== 'undefined') {
                    window.history.replaceState(
                      null,
                      '',
                      window.location.pathname + window.location.search
                    );
                  }
                }}
                onMoveToNextCheck={handleMoveToNextCheck}
                onCheckUpdate={async () => {
                  if (activeCheck?.id) {
                    try {
                      // Fetch section overrides for this check
                      const overridesRes = await fetch(
                        `/api/checks/${activeCheck.id}/section-overrides`
                      );
                      const sectionOverrides = overridesRes.ok ? await overridesRes.json() : [];

                      // Fetch check data
                      const res = await fetch(`/api/checks/${activeCheck.id}`);
                      if (res.ok) {
                        const { check: updatedCheck } = await res.json();
                        const checkWithOverrides = {
                          ...updatedCheck,
                          section_overrides: sectionOverrides,
                          has_section_overrides: sectionOverrides.length > 0,
                        };

                        setChecks(prev =>
                          prev.map(c => {
                            // Update top-level check if it matches
                            if (c.id === checkWithOverrides.id) {
                              return { ...c, ...checkWithOverrides, instances: c.instances };
                            }
                            // Update instance within check if it matches
                            if (c.instances?.length && c.instances.length > 0) {
                              const updatedInstances = c.instances.map(instance =>
                                instance.id === checkWithOverrides.id
                                  ? { ...instance, ...checkWithOverrides }
                                  : instance
                              );
                              if (updatedInstances !== c.instances) {
                                return { ...c, instances: updatedInstances };
                              }
                            }
                            return c;
                          })
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
                    const res = await fetch(`/api/assessments/${assessment.id}/checks`);
                    if (res.ok) {
                      const updatedChecks = (await res.json()) as CheckData[];
                      setChecks(updatedChecks);
                      // Close the detail panel if the active check was deleted
                      if (!updatedChecks.find(c => c.id === activeCheck?.id)) {
                        setShowDetailPanel(false);
                        setActiveCheckId(null);
                      }
                    }
                  } catch (error) {
                    console.error('Failed to refetch checks:', error);
                  }
                }}
                onScreenshotAssigned={() => {
                  // Increment refresh key to trigger ScreenshotGallery re-fetch
                  setScreenshotsChanged(prev => prev + 1);
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
      <div className="flex-1 bg-gray-50 overflow-hidden h-screen">
        {pdfUrl ? (
          <PDFViewer
            pdfUrl={pdfUrl}
            assessmentId={assessment.id}
            activeCheck={activeCheck || undefined}
            onScreenshotSaved={() => setScreenshotsChanged(x => x + 1)}
            onCheckAdded={handleCheckAdded}
            onCheckSelect={handleCheckSelect}
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
