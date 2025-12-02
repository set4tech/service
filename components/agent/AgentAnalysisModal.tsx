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

// Step descriptions for the pipeline - shown in the modal while running
const STEP_DESCRIPTIONS: Record<string, { title: string; description: string }> = {
  'Downloading PDF from S3...': {
    title: '📥 Downloading PDF',
    description: 'Fetching the architectural drawings from cloud storage.',
  },
  'Converting PDF to images...': {
    title: '🖼️ Converting to Images',
    description: 'Converting each page of the PDF to high-resolution PNG images for analysis.',
  },
  'Running YOLO': {
    title: '🔍 Object Detection (YOLO)',
    description:
      'Using a trained neural network to detect building elements like doors, windows, tables, and schedules.',
  },
  'Running analysis pipeline...': {
    title: '⚙️ Starting Analysis Pipeline',
    description: 'Initializing the multi-step analysis process.',
  },
  'Running filter_low_confidence...': {
    title: '🧹 Filtering Detections',
    description: 'Removing low-confidence detections to focus on reliable results.',
  },
  'Running group_by_class...': {
    title: '📊 Grouping Elements',
    description: 'Organizing detected elements by type (doors, windows, tables, etc.).',
  },
  'Running extract_text...': {
    title: '📝 Extracting Text',
    description:
      'Extracting text from each page and using AI to clean up messy CAD drawing labels and notes.',
  },
  'Running extract_tables...': {
    title: '📋 Extracting Tables',
    description:
      'Detecting and parsing schedules and tables (door schedules, room schedules, etc.) into structured data.',
  },
  'Running count_summary...': {
    title: '📈 Generating Summary',
    description: 'Counting and summarizing all detected elements and extracted data.',
  },
  'Saving results...': {
    title: '💾 Saving Results',
    description: 'Storing the analysis results in the database.',
  },
  Complete: {
    title: '✅ Complete',
    description: 'Analysis finished successfully!',
  },
};

function getStepInfo(message: string | undefined): { title: string; description: string } {
  if (!message) return { title: 'Processing...', description: 'Please wait...' };

  // Check for exact match first
  if (STEP_DESCRIPTIONS[message]) {
    return STEP_DESCRIPTIONS[message];
  }

  // Check for partial matches (e.g., "Running YOLO on 5 pages...")
  for (const [key, value] of Object.entries(STEP_DESCRIPTIONS)) {
    if (message.startsWith(key.replace('...', ''))) {
      return value;
    }
  }

  return { title: message, description: '' };
}

interface Props {
  assessmentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingRun?: AgentRun | null;
  onRunStatusChange?: (run: AgentRun | null) => void;
}

export function AgentAnalysisModal({
  assessmentId,
  open,
  onOpenChange,
  existingRun,
  onRunStatusChange,
}: Props) {
  const [status, setStatus] = useState<'idle' | 'confirming' | 'running' | 'completed' | 'failed'>(
    'confirming'
  );
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Handle modal open - check for existing run
  useEffect(() => {
    if (open) {
      if (existingRun && (existingRun.status === 'running' || existingRun.status === 'pending')) {
        // Resume monitoring an existing run
        console.log('[AgentModal] Resuming existing run:', existingRun.id);
        setStatus('running');
        setAgentRun(existingRun);
        setError(null);
      }
      // Don't reset if already completed/failed - let user see the result
    }
  }, [open, existingRun]);

  // Reset state when modal closes (so next open starts fresh)
  useEffect(() => {
    if (!open && (status === 'completed' || status === 'failed')) {
      // Delay reset slightly so user can see the final state before modal closes
      const timer = setTimeout(() => {
        setStatus('confirming');
        setAgentRun(null);
        setError(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open, status]);

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

        // Notify parent of progress updates
        onRunStatusChange?.(data);

        if (data.status === 'completed') {
          setStatus('completed');
          onRunStatusChange?.(null); // Clear running state in parent
          clearInterval(pollInterval);
        } else if (data.status === 'failed') {
          setStatus('failed');
          setError(data.error || 'Agent analysis failed');
          onRunStatusChange?.(null); // Clear running state in parent
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('[AgentModal] Poll error:', err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [status, agentRun?.id, assessmentId, onRunStatusChange]);

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
      console.log('[AgentModal] Agent started:', data.agentRun?.id);
      setAgentRun(data.agentRun);
      // Notify parent that a new run started
      onRunStatusChange?.(data.agentRun);
    } catch (err) {
      console.error('[AgentModal] Start error:', err);
      setStatus('failed');
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [assessmentId, onRunStatusChange]);

  const progressPercent = agentRun?.progress?.total_steps
    ? Math.round(((agentRun.progress.step || 0) / agentRun.progress.total_steps) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-white">
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
            <div className="space-y-4">
              {/* Step info */}
              {(() => {
                const stepInfo = getStepInfo(agentRun.progress?.message);
                return (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                    <div className="font-medium text-blue-900 text-base mb-1">{stepInfo.title}</div>
                    {stepInfo.description && (
                      <div className="text-sm text-blue-700">{stepInfo.description}</div>
                    )}
                  </div>
                );
              })()}

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 text-center">
                  Step {agentRun.progress?.step || 0} of {agentRun.progress?.total_steps || '?'}
                  {progressPercent > 0 && ` (${progressPercent}%)`}
                </div>
              </div>

              {/* Elapsed time */}
              {agentRun.started_at && (
                <div className="text-xs text-gray-400 text-center">
                  Started {new Date(agentRun.started_at).toLocaleTimeString()}
                </div>
              )}
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
