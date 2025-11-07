import { useState, useEffect, useCallback } from 'react';
import type { CodeSection, AnalysisRun } from '@/types/analysis';

interface Check {
  id: string;
  element_instance_id?: string;
  section_id?: string;
  code_section_number?: string;
  code_section_title?: string;
  manual_status?: string | null;
  manual_status_note?: string;
  sections?: {
    key: string;
    [key: string]: any;
  };
}

export function useCheckData(checkId: string | null, _filterToSectionKey: string | null) {
  const [check, setCheck] = useState<Check | null>(null);
  const [sections, setSections] = useState<CodeSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([]);
  const [assessing, setAssessing] = useState(false);

  // Refresh trigger for manual refetch
  const [refreshCounter, setRefreshCounter] = useState(0);

  // For element instances: all checks for that instance
  const [childChecks, setChildChecks] = useState<Check[]>([]);
  const [activeChildCheckId, setActiveChildCheckId] = useState<string | null>(null);

  // Store the currently active check's fresh data (separate from childChecks array)
  const [activeChildCheckData, setActiveChildCheckData] = useState<Check | null>(null);

  // Expose refresh function to trigger refetch
  const refresh = useCallback(() => {
    setRefreshCounter(prev => prev + 1);
  }, []);

  // Load ALL data in a single optimized request
  useEffect(() => {
    if (!checkId) {
      setCheck(null);
      setChildChecks([]);
      setActiveChildCheckId(null);
      setSections([]);
      setAnalysisRuns([]);
      setAssessing(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/checks/${checkId}/complete`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
          setLoading(false);
          return;
        }

        // console.log('useCheckData: Loaded complete data', {
        //   check: data.check?.id,
        //   siblingChecks: data.siblingChecks?.length,
        //   hasCodeSection: !!data.codeSection,
        //   analysisRuns: data.analysisRuns?.length,
        // });

        // Set check data
        setCheck(data.check);

        // Set sibling checks (if element instance)
        setChildChecks(data.siblingChecks || []);
        setActiveChildCheckId(data.check.id);
        setActiveChildCheckData(data.check); // Initialize active child check data

        // Set code section
        if (data.codeSection) {
          setSections([data.codeSection]);
        } else {
          setSections([]);
        }

        // Set analysis runs
        setAnalysisRuns(data.analysisRuns || []);
        setAssessing(data.check?.status === 'processing' || data.check?.status === 'analyzing');

        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load check data:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [checkId, refreshCounter]);

  // When active child check changes, fetch section + analysis for that check
  useEffect(() => {
    if (!activeChildCheckId || !childChecks.length) return;

    const activeCheck = childChecks.find(c => c.id === activeChildCheckId);
    if (!activeCheck) return;

    // If we're switching to a different check, load its section + analysis
    if (activeCheck.id !== check?.id) {
      const sectionKey = activeCheck.sections?.key;

      // Load section and analysis in parallel
      const promises: Promise<any>[] = [];

      if (sectionKey) {
        promises.push(
          fetch(`/api/code-sections/${sectionKey}`)
            .then(res => res.json())
            .then(data => {
              if (data.error) {
                setSections([]);
              } else {
                setSections([data]);
              }
            })
        );
      } else {
        setSections([]);
      }

      promises.push(
        fetch(`/api/checks/${activeCheck.id}/full`)
          .then(res => res.json())
          .then(data => {
            setAnalysisRuns(data.analysisRuns || []);
            setAssessing(data.check?.status === 'processing' || data.check?.status === 'analyzing');
            // Store the fresh check data for the active child
            if (data.check) {
              setActiveChildCheckData(data.check);
            }
          })
      );

      Promise.all(promises).catch(err => {
        console.error('Failed to load child check data:', err);
      });
    }
  }, [activeChildCheckId, childChecks, check]);

  // Get manual override from the active check
  // Use activeChildCheckData if we have it (fresh data), otherwise fall back to childChecks array
  const activeCheck = activeChildCheckId
    ? (activeChildCheckData?.id === activeChildCheckId
        ? activeChildCheckData
        : childChecks.find(c => c.id === activeChildCheckId)) || check
    : check;

  // console.log('[useCheckData] 📊 Returning manual override:', {
  //   activeChildCheckId,
  //   activeCheckId: activeCheck?.id,
  //   manual_status: activeCheck?.manual_status,
  //   manual_status_note: activeCheck?.manual_status_note,
  //   usingFreshData: activeChildCheckData?.id === activeChildCheckId,
  // });

  return {
    loading,
    error,
    check,
    childChecks,
    activeChildCheckId,
    activeCheck,
    sections,
    analysisRuns,
    assessing,
    manualOverride: activeCheck?.manual_status || null,
    manualOverrideNote: activeCheck?.manual_status_note || '',
    showSingleSectionOnly: false,
    setActiveChildCheckId,
    refresh,
  };
}
