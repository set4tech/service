'use client';

import { useState, useCallback } from 'react';

interface AgentReasoningStep {
  iteration: number;
  type: 'thinking' | 'tool_use' | 'tool_result';
  content?: string;
  tool?: string;
  tool_use_id?: string;
  input?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  status: 'running' | 'complete';
  result?: Record<string, unknown>;
}

interface AgentResult {
  compliance_status: string;
  confidence: string;
  ai_reasoning: string;
  violations?: Array<{
    description: string;
    severity: string;
    location_in_evidence?: string;
  }>;
  recommendations?: string[];
  reasoning_trace?: AgentReasoningStep[];
  tools_used?: string[];
  iteration_count?: number;
}

interface UseAgentAssessmentReturn {
  assessing: boolean;
  reasoning: string[];
  toolCalls: ToolCall[];
  result: AgentResult | null;
  error: string | null;
  startAssessment: () => Promise<void>;
  reset: () => void;
}

export function useAgentAssessment(checkId: string | null): UseAgentAssessmentReturn {
  const [assessing, setAssessing] = useState(false);
  const [reasoning, setReasoning] = useState<string[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setAssessing(false);
    setReasoning([]);
    setToolCalls([]);
    setResult(null);
    setError(null);
  }, []);

  const startAssessment = useCallback(async () => {
    if (!checkId) return;

    setAssessing(true);
    setReasoning([]);
    setToolCalls([]);
    setResult(null);
    setError(null);

    try {
      const response = await fetch(`/api/checks/${checkId}/agent-assess`, {
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
                    setReasoning(prev => [...prev, data.content]);
                  }
                  break;

                case 'tool_use':
                  setToolCalls(prev => [
                    ...prev,
                    {
                      tool: data.tool,
                      input: data.input,
                      status: 'running',
                    },
                  ]);
                  break;

                case 'tool_result':
                  setToolCalls(prev =>
                    prev.map(tc =>
                      tc.tool === data.tool && tc.status === 'running'
                        ? { ...tc, result: data.result, status: 'complete' }
                        : tc
                    )
                  );
                  break;

                case 'done':
                  setResult(data.result);
                  setAssessing(false);
                  break;

                case 'error':
                  setError(data.message);
                  setAssessing(false);
                  break;
              }
            } catch {
              // Ignore non-JSON lines
            }
          }
        }
      }

      // If we exit the loop without a result, mark as complete
      setAssessing(false);
    } catch (err: any) {
      console.error('[useAgentAssessment] Error:', err);
      setError(err.message || 'Agent assessment failed');
      setAssessing(false);
    }
  }, [checkId]);

  return {
    assessing,
    reasoning,
    toolCalls,
    result,
    error,
    startAssessment,
    reset,
  };
}
