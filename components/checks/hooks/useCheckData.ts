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

export function useCheckData(
  checkId: string | null,
  activeChildCheckId: string | null,
  _filterToSectionKey: string | null
) {
  const [check, setCheck] = useState<Check | null>(null);
  const [sections, setSections] = useState<CodeSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([]);

  // Refresh trigger for manual refetch
  const [refreshCounter, setRefreshCounter] = useState(0);

  // For element instances: all checks for that instance
  const [childChecks, setChildChecks] = useState<Check[]>([]);

  // Expose refresh function to trigger refetch
  // silent = don't show loading skeleton, for background updates
  const refresh = useCallback((silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setRefreshCounter(prev => prev + 1);
  }, []);

  // Load parent check data
  useEffect(() => {
    if (!checkId) {
      setCheck(null);
      setChildChecks([]);
      setSections([]);
      setAnalysisRuns([]);
      return;
    }

    setError(null);

    fetch(`/api/checks/${checkId}/complete`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
          setLoading(false);
          return;
        }

        setCheck(data.check);
        setChildChecks(data.siblingChecks || []);

        // Set initial section (will be overridden if viewing child)
        if (data.codeSection) {
          setSections([data.codeSection]);
        } else {
          setSections([]);
        }

        setAnalysisRuns(data.analysisRuns || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load check data:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [checkId, refreshCounter]);

  // When viewing a child check, fetch its section + analysis
  useEffect(() => {
    if (!activeChildCheckId || !childChecks.length) return;
    if (activeChildCheckId === check?.id) return; // Already loaded parent

    const activeChild = childChecks.find(c => c.id === activeChildCheckId);
    if (!activeChild) return;

    const sectionKey = activeChild.sections?.key;

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
      fetch(`/api/checks/${activeChild.id}/full`)
        .then(res => res.json())
        .then(data => {
          setAnalysisRuns(data.analysisRuns || []);
        })
    );

    Promise.all(promises).catch(err => {
      console.error('Failed to load child check data:', err);
    });
  }, [activeChildCheckId, childChecks, check?.id]);

  // Derive active check from current selection
  const activeCheck = activeChildCheckId
    ? childChecks.find(c => c.id === activeChildCheckId) || check
    : check;

  return {
    loading,
    error,
    check,
    childChecks,
    activeCheck,
    sections,
    analysisRuns,
    manualOverride: activeCheck?.manual_status || null,
    manualOverrideNote: activeCheck?.manual_status_note || '',
    showSingleSectionOnly: false,
    refresh,
  };
}
