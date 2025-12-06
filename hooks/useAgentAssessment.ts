'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  status: 'running' | 'complete';
  result?: Record<string, unknown>;
}

interface ViolationBoundingBox {
  x: number; // Left edge (0-1)
  y: number; // Top edge (0-1)
  width: number; // Width (0-1)
  height: number; // Height (0-1)
  label?: string;
}

interface AgentResult {
  compliance_status: string;
  confidence: string;
  ai_reasoning: string;
  violations?: Array<{
    description: string;
    severity: string;
    location_in_evidence?: string;
    bounding_boxes?: ViolationBoundingBox[];
  }>;
  recommendations?: string[];
  reasoning_trace?: Array<{
    iteration: number;
    type: 'thinking' | 'tool_use' | 'tool_result';
    content?: string;
    tool?: string;
    tool_use_id?: string;
    input?: Record<string, unknown>;
    result?: Record<string, unknown>;
  }>;
  tools_used?: string[];
  iteration_count?: number;
}

interface AgentAssessmentState {
  assessing: boolean;
  reasoning: string[];
  toolCalls: ToolCall[];
  result: AgentResult | null;
  error: string | null;
}

interface UseAgentAssessmentReturn extends AgentAssessmentState {
  startAssessment: () => Promise<void>;
  reset: () => void;
}

const defaultState: AgentAssessmentState = {
  assessing: false,
  reasoning: [],
  toolCalls: [],
  result: null,
  error: null,
};

// Cache state per checkId so switching back shows ongoing assessment
const stateCache = new Map<string, AgentAssessmentState>();

// Export for testing
export function clearStateCacheForTesting() {
  stateCache.clear();
}

export function useAgentAssessment(checkId: string | null): UseAgentAssessmentReturn {
  // Initialize from cache if available
  const [state, setState] = useState<AgentAssessmentState>(() => {
    if (checkId && stateCache.has(checkId)) {
      return stateCache.get(checkId)!;
    }
    return defaultState;
  });

  // Track current checkId so stream updates can check if still relevant
  const currentCheckIdRef = useRef(checkId);
  currentCheckIdRef.current = checkId;

  // Restore from cache or reset when checkId changes
  useEffect(() => {
    if (checkId) {
      if (stateCache.has(checkId)) {
        setState(stateCache.get(checkId)!);
      } else {
        setState(defaultState);
      }
    } else {
      setState(defaultState);
    }
  }, [checkId]);

  const reset = useCallback(() => {
    setState(defaultState);
    if (checkId) {
      stateCache.delete(checkId);
    }
  }, [checkId]);

  const startAssessment = useCallback(async () => {
    if (!checkId) return;

    // Capture checkId for this assessment (user might switch away)
    const assessingCheckId = checkId;

    // Helper to update both cache and component state (if still viewing this check)
    const updateState = (updater: (prev: AgentAssessmentState) => AgentAssessmentState) => {
      const cached = stateCache.get(assessingCheckId) || defaultState;
      const updated = updater(cached);
      stateCache.set(assessingCheckId, updated);

      // Only update component state if still viewing this check
      if (currentCheckIdRef.current === assessingCheckId) {
        setState(updated);
      }
    };

    // Start assessment
    updateState(() => ({
      assessing: true,
      reasoning: [],
      toolCalls: [],
      result: null,
      error: null,
    }));

    try {
      const response = await fetch(`/api/checks/${assessingCheckId}/agent-assess`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Agent assessment failed');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        buffer += text;

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'thinking':
                  if (data.content) {
                    updateState(prev => ({
                      ...prev,
                      reasoning: [...prev.reasoning, data.content],
                    }));
                  }
                  break;

                case 'tool_use':
                  updateState(prev => ({
                    ...prev,
                    toolCalls: [
                      ...prev.toolCalls,
                      {
                        tool: data.tool,
                        input: data.input,
                        status: 'running' as const,
                      },
                    ],
                  }));
                  break;

                case 'tool_result':
                  updateState(prev => ({
                    ...prev,
                    toolCalls: prev.toolCalls.map(tc =>
                      tc.tool === data.tool && tc.status === 'running'
                        ? { ...tc, result: data.result, status: 'complete' as const }
                        : tc
                    ),
                  }));
                  break;

                case 'done':
                  updateState(prev => ({
                    ...prev,
                    result: data.result,
                    assessing: false,
                  }));
                  break;

                case 'error':
                  updateState(prev => ({
                    ...prev,
                    error: data.message,
                    assessing: false,
                  }));
                  break;
              }
            } catch {
              // Ignore non-JSON lines
            }
          }
        }
      }

      // If we exit the loop without a done/error event, mark as complete
      updateState(prev => ({ ...prev, assessing: false }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Agent assessment failed';
      console.error('[useAgentAssessment] Error:', err);
      updateState(prev => ({
        ...prev,
        error: message,
        assessing: false,
      }));
    }
  }, [checkId]);

  return {
    ...state,
    startAssessment,
    reset,
  };
}
