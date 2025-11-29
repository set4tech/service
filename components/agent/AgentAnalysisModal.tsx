'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
  assessmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentAnalysisModal({ assessmentId, open, onOpenChange }: Props) {
  const [status, setStatus] = useState<'idle' | 'confirming' | 'running' | 'completed' | 'failed'>(
    'confirming'
  );
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStatus('confirming');
      setAgentRun(null);
      setError(null);
    }
  }, [open]);

  // Poll for status updates when running
  useEffect(() => {
    if (status !== 'running' || !agentRun?.id) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/assessments/${assessmentId}/agent/status?runId=${agentRun.id}`
        );
        if (!res.ok) throw new Error('Failed to fetch status');

        const data = await res.json();
        console.log('[AgentModal] Poll status:', data);
        setAgentRun(data);

        if (data.status === 'completed') {
          setStatus('completed');
          clearInterval(pollInterval);
        } else if (data.status === 'failed') {
          setStatus('failed');
          setError(data.error || 'Agent analysis failed');
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('[AgentModal] Poll error:', err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [status, agentRun?.id, assessmentId]);

  const handleStart = useCallback(async () => {
    setStatus('running');
    setError(null);

    try {
      console.log('[AgentModal] Starting agent analysis for assessment:', assessmentId);

      const res = await fetch(`/api/assessments/${assessmentId}/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start agent');
      }

      const data = await res.json();
      console.log('[AgentModal] Agent started:', data);
      setAgentRun(data.agentRun);
    } catch (err) {
      console.error('[AgentModal] Start error:', err);
      setStatus('failed');
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [assessmentId]);

  const progressPercent = agentRun?.progress?.total_steps
    ? Math.round(((agentRun.progress.step || 0) / agentRun.progress.total_steps) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white">
        <DialogHeader>
          <DialogTitle>Agent Analysis (Beta)</DialogTitle>
          <DialogDescription>
            {status === 'confirming' &&
              'Run an AI agent to automatically analyze the PDF and identify potential compliance issues.'}
            {status === 'running' && 'Agent analysis is running...'}
            {status === 'completed' && 'Agent analysis completed!'}
            {status === 'failed' && 'Agent analysis failed.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {status === 'confirming' && (
            <div className="text-sm text-gray-600 space-y-2">
              <p>This will start a long-running analysis that:</p>
              <ul className="list-disc list-inside ml-2 space-y-1">
                <li>Analyzes the PDF document structure</li>
                <li>Identifies relevant building elements</li>
                <li>Checks against applicable code sections</li>
              </ul>
              <p className="text-amber-600 mt-3">
                Note: This feature is in beta and may take several minutes to complete.
              </p>
            </div>
          )}

          {status === 'running' && agentRun && (
            <div className="space-y-3">
              <div className="text-sm text-gray-700">
                {agentRun.progress?.message || 'Processing...'}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 text-center">
                Step {agentRun.progress?.step || 0} of {agentRun.progress?.total_steps || '?'}
              </div>
            </div>
          )}

          {status === 'completed' && (
            <div className="text-sm text-green-700 bg-green-50 p-3 rounded-lg">
              Analysis completed successfully. Results have been saved.
            </div>
          )}

          {status === 'failed' && error && (
            <div className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">{error}</div>
          )}
        </div>

        <DialogFooter>
          {status === 'confirming' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleStart}>Start Analysis</Button>
            </>
          )}

          {status === 'running' && (
            <Button variant="outline" disabled>
              Running...
            </Button>
          )}

          {(status === 'completed' || status === 'failed') && (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
