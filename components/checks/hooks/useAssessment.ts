import { useState, useEffect } from 'react';
import { usePersisted } from '@/lib/hooks/usePersisted';
import { useFetch } from '@/lib/hooks/useFetch';
import { usePolling } from '@/lib/hooks/usePolling';
import type { AnalysisRun } from '@/types/analysis';

export function useAssessment(
  checkId: string | null,
  effectiveCheckId: string | null,
  onCheckUpdate?: () => void
) {
  // Assessment state - use persisted for model selection
  const [selectedModel, setSelectedModel] = usePersisted(
    'lastSelectedAIModel',
    'gemini-2.5-pro'
  );
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
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  // Check for in-progress analysis when checkId changes
  useEffect(() => {
    if (!checkId) return;

    fetch(`/api/checks/${checkId}/full`)
      .then(res => res.json())
      .then(fullData => {
        const data = fullData.progress;
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

  // Poll for progress whenever assessing is true - use usePolling
  usePolling(
    async () => {
      if (!checkId) return true;

      console.log('[Poll] Fetching progress...');
      const res = await fetch(`/api/checks/${checkId}/full`);
      const fullData = await res.json();
      const data = fullData.progress;

      if (data.inProgress) {
        setAssessmentProgress(Math.round((data.completed / data.total) * 100));
        setAssessmentMessage(`Analyzing... (${data.completed}/${data.total})`);

        // Trigger queue processing
        fetch('/api/queue/process').catch(err => console.error('Failed to trigger queue:', err));

        // Update runs (only add new ones)
        if (fullData.analysisRuns && fullData.analysisRuns.length > 0) {
          setAnalysisRuns(prev => {
            const existingIds = new Set(prev.map((r: any) => r.id));
            const newRuns = fullData.analysisRuns.filter((r: any) => !existingIds.has(r.id));
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
        
        return false; // Keep polling
      }

      // Assessment complete
      console.log('[Poll] Assessment complete detected');
      setAssessmentMessage('Assessment complete!');
      setExtraContext('');
      setShowExtraContext(false);

      // Fetch updated analysis runs
      if (checkId) {
        console.log('[Poll] Fetching updated analysis runs for check:', checkId);
        const runsRes = await fetch(`/api/checks/${checkId}/analysis-runs`);
        const runsData = await runsRes.json();
        
        if (runsData.runs) {
          console.log('[Poll] Setting analysis runs, count:', runsData.runs.length);
          setAnalysisRuns(runsData.runs);
          if (runsData.runs.length > 0) {
            setExpandedRuns(new Set([runsData.runs[0].id]));
          }
        }
      }

      if (onCheckUpdate) onCheckUpdate();
      
      return true; // Stop polling
    },
    {
      enabled: assessing && !!checkId,
      interval: 2000,
      onComplete: () => setAssessing(false),
      onError: (err) => {
        console.error('Poll error:', err);
        setAssessing(false);
      }
    }
  );

  // Load analysis runs when effectiveCheckId changes - use useFetch
  const { data: _runsData, loading: loadingRuns } = useFetch<{ runs: AnalysisRun[] }>(
    effectiveCheckId ? `/api/checks/${effectiveCheckId}/analysis-runs` : null,
    {
      onSuccess: (data) => {
        console.log('[InitialLoad] Received data:', data);
        if (data.runs) {
          console.log('[InitialLoad] Setting analysis runs, count:', data.runs.length);
          setAnalysisRuns(data.runs);
        }
      }
    }
  );

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

  const handleAssess = async () => {
    if (!checkId) return;

    console.log('[Assess] Starting assessment for checkId:', checkId);
    setAssessing(true);
    setAssessmentError(null);
    setAssessmentProgress(0);
    setAssessmentMessage('Starting assessment...');

    // Note: selectedModel is automatically persisted via usePersisted hook

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

  const stopAssessment = () => {
    setAssessing(false);
    setAssessmentMessage('');
    setAssessmentProgress(0);
  };

  return {
    selectedModel,
    setSelectedModel,
    extraContext,
    setExtraContext,
    showExtraContext,
    setShowExtraContext,
    assessing,
    assessmentError,
    assessmentProgress,
    assessmentMessage,
    showPrompt,
    setShowPrompt,
    defaultPrompt,
    customPrompt,
    setCustomPrompt,
    isPromptEditing,
    loadingPrompt,
    analysisRuns,
    setAnalysisRuns,
    loadingRuns,
    expandedRuns,
    setExpandedRuns,
    handleViewPrompt,
    handleEditPrompt,
    handleResetPrompt,
    handleAssess,
    toggleRunExpanded,
    stopAssessment,
  };
}
