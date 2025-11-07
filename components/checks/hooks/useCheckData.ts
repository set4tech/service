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

export function useCheckData(checkId: string | null, filterToSectionKey: string | null) {
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

  // Expose refresh function to trigger refetch
  const refresh = useCallback(() => {
    setRefreshCounter(prev => prev + 1);
  }, []);

  // Load check data
  useEffect(() => {
    if (!checkId) {
      setCheck(null);
      setChildChecks([]);
      setActiveChildCheckId(null);
      return;
    }

    fetch(`/api/checks/${checkId}`)
      .then(res => res.json())
      .then(data => {
        if (data.check) {
          console.log('useCheckData: Loaded check', {
            id: data.check.id,
            element_instance_id: data.check.element_instance_id,
            section_id: data.check.section_id,
            section_key: data.check.sections?.key,
            has_sections: !!data.check.sections,
          });
          setCheck(data.check);

          // If this check belongs to an element instance, fetch all checks for that instance
          if (data.check.element_instance_id) {
            console.log(
              'useCheckData: Fetching all checks for element instance:',
              data.check.element_instance_id
            );
            fetch(`/api/element-instances/${data.check.element_instance_id}/checks`)
              .then(res => res.json())
              .then(instanceData => {
                console.log('useCheckData: Loaded instance checks:', instanceData.checks?.length);
                console.log('useCheckData: First check section data:', {
                  has_sections: !!instanceData.checks?.[0]?.sections,
                  section_key: instanceData.checks?.[0]?.sections?.key,
                });
                setChildChecks(instanceData.checks || []);
                setActiveChildCheckId(data.check.id); // Set the clicked check as active
              })
              .catch(err => {
                console.error('Failed to load instance checks:', err);
                setChildChecks([]);
              });
          } else {
            // Standalone check - no children
            setChildChecks([]);
            setActiveChildCheckId(null);
          }
        }
        return null;
      })
      .catch(err => {
        console.error('Failed to load check:', err);
      });
  }, [checkId]);

  // Load code sections
  useEffect(() => {
    // Determine which check to load section for
    const checkToLoad = activeChildCheckId
      ? childChecks.find(c => c.id === activeChildCheckId) || check
      : check;

    console.log('useCheckData: Section loading effect triggered', {
      hasCheck: !!check,
      hasChildChecks: childChecks.length > 0,
      activeChildCheckId,
      checkToLoad: checkToLoad
        ? {
            id: checkToLoad.id,
            section_key: checkToLoad.sections?.key,
          }
        : null,
    });

    // Load section from the active check's sections.key (from JOIN)
    if (checkToLoad?.sections?.key) {
      console.log('useCheckData: Loading section:', checkToLoad.sections.key);
      setLoading(true);
      setError(null);

      fetch(`/api/code-sections/${checkToLoad.sections.key}`)
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            setError(data.error);
            setSections([]);
          } else {
            setSections([data]);
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

    // For standalone section checks with filterToSectionKey
    if (!checkToLoad && filterToSectionKey) {
      setLoading(true);
      setError(null);

      fetch(`/api/code-sections/${filterToSectionKey}`)
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            setError(data.error);
            setSections([]);
          } else {
            setSections([data]);
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

    // No section to load
    setSections([]);
  }, [filterToSectionKey, check, childChecks, activeChildCheckId]);

  // Load analysis runs for the active check
  useEffect(() => {
    const checkToLoad = activeChildCheckId
      ? childChecks.find(c => c.id === activeChildCheckId) || check
      : check;

    if (!checkToLoad?.id) {
      setAnalysisRuns([]);
      setAssessing(false);
      return;
    }

    console.log('useCheckData: Loading analysis runs for check:', checkToLoad.id);

    fetch(`/api/checks/${checkToLoad.id}/full`)
      .then(res => res.json())
      .then(data => {
        console.log('useCheckData: Loaded analysis runs:', data.analysisRuns?.length);
        setAnalysisRuns(data.analysisRuns || []);
        setAssessing(data.check?.status === 'processing' || data.check?.status === 'analyzing');
      })
      .catch(err => {
        console.error('Failed to load analysis runs:', err);
        setAnalysisRuns([]);
        setAssessing(false);
      });
  }, [check, childChecks, activeChildCheckId, refreshCounter]);

  // Get manual override from the active check
  const activeCheck = activeChildCheckId
    ? childChecks.find(c => c.id === activeChildCheckId) || check
    : check;

  return {
    loading,
    error,
    check,
    childChecks,
    activeChildCheckId,
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
