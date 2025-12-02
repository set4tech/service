'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import clsx from 'clsx';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolUses?: Array<{
    tool: string;
    input: Record<string, unknown>;
    result?: Record<string, unknown>;
  }>;
  isStreaming?: boolean;
}

interface ChatPanelProps {
  assessmentId: string;
}

export function ChatPanel({ assessmentId }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(async () => {
    const message = inputValue.trim();
    if (!message || isLoading) return;

    setInputValue('');
    setError(null);
    setIsLoading(true);

    // Add user message
    const userMessageId = `user-${Date.now()}`;
    setMessages(prev => [...prev, { id: userMessageId, role: 'user', content: message }]);

    // Create placeholder for assistant response
    const assistantMessageId = `assistant-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      { id: assistantMessageId, role: 'assistant', content: '', isStreaming: true, toolUses: [] },
    ]);

    try {
      const response = await fetch(`/api/assessments/${assessmentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          conversation_id: conversationId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          try {
            const data = JSON.parse(line.slice(6));
            console.log('[ChatPanel] Received:', data.type, data);

            if (data.type === 'text') {
              // Append text content
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMessageId ? { ...m, content: m.content + data.content } : m
                )
              );
            } else if (data.type === 'tool_use') {
              // Add tool use to message
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        toolUses: [...(m.toolUses || []), { tool: data.tool, input: data.input }],
                      }
                    : m
                )
              );
            } else if (data.type === 'tool_result') {
              // Update last tool use with result
              setMessages(prev =>
                prev.map(m => {
                  if (m.id !== assistantMessageId) return m;
                  const toolUses = [...(m.toolUses || [])];
                  const lastToolUse = toolUses[toolUses.length - 1];
                  if (lastToolUse && lastToolUse.tool === data.tool) {
                    lastToolUse.result = data.result;
                  }
                  return { ...m, toolUses };
                })
              );
            } else if (data.type === 'image') {
              // Update last tool use to note that an image was viewed
              setMessages(prev =>
                prev.map(m => {
                  if (m.id !== assistantMessageId) return m;
                  const toolUses = [...(m.toolUses || [])];
                  const lastToolUse = toolUses[toolUses.length - 1];
                  if (lastToolUse && lastToolUse.tool === data.tool) {
                    lastToolUse.result = {
                      viewed_sheet: data.metadata?.sheet || 'unknown',
                      page_index: data.metadata?.page_index,
                    };
                  }
                  return { ...m, toolUses };
                })
              );
            } else if (data.type === 'done') {
              // Mark message as complete and save conversation ID
              setMessages(prev =>
                prev.map(m => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m))
              );
              if (data.conversation_id) {
                setConversationId(data.conversation_id);
              }
            } else if (data.type === 'error') {
              setError(data.message);
              // Remove the empty assistant message
              setMessages(prev => prev.filter(m => m.id !== assistantMessageId));
            }
          } catch (parseError) {
            console.error('[ChatPanel] Failed to parse SSE data:', line, parseError);
          }
        }
      }
    } catch (err) {
      console.error('[ChatPanel] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Remove the streaming assistant message on error
      setMessages(prev => prev.filter(m => m.id !== assistantMessageId));
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, assessmentId, conversationId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setConversationId(null);
    setError(null);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div>
          <h3 className="font-medium text-gray-900">Chat with Drawings</h3>
          <p className="text-xs text-gray-500">Ask questions about the architectural drawings</p>
        </div>
        {messages.length > 0 && (
          <button onClick={clearConversation} className="text-xs text-gray-500 hover:text-gray-700">
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <p className="text-sm">Ask questions about the drawings, such as:</p>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li>&ldquo;What doors are in this project?&rdquo;</li>
              <li>&ldquo;Show me the room list with areas&rdquo;</li>
              <li>&ldquo;What is the construction type?&rdquo;</li>
              <li>&ldquo;Find references to fire sprinklers&rdquo;</li>
            </ul>
          </div>
        )}

        {messages.map(message => (
          <div
            key={message.id}
            className={clsx('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={clsx(
                'max-w-[85%] rounded-lg px-4 py-2',
                message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
              )}
            >
              {/* Message content */}
              {message.content && (
                <div className="whitespace-pre-wrap text-sm">{message.content}</div>
              )}

              {/* Tool uses */}
              {message.toolUses && message.toolUses.length > 0 && (
                <div className="mt-2 space-y-2">
                  {message.toolUses.map((toolUse, idx) => (
                    <div
                      key={idx}
                      className={clsx(
                        'text-xs rounded px-2 py-1',
                        message.role === 'user' ? 'bg-blue-500' : 'bg-gray-200'
                      )}
                    >
                      <div className="font-medium flex items-center gap-1">
                        <span>🔧</span>
                        <span>{toolUse.tool}</span>
                        {!toolUse.result && <span className="animate-pulse">...</span>}
                      </div>
                      {toolUse.result && (
                        <div className="mt-1 text-gray-600 truncate">
                          {toolUse.tool === 'view_sheet_image'
                            ? `Viewed sheet: ${(toolUse.result as any)?.viewed_sheet || 'unknown'}`
                            : JSON.stringify(toolUse.result).slice(0, 100)}
                          {JSON.stringify(toolUse.result).length > 100 && '...'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Streaming indicator */}
              {message.isStreaming && !message.content && (
                <div className="flex items-center gap-1 text-gray-500">
                  <span className="animate-pulse">●</span>
                  <span className="animate-pulse delay-100">●</span>
                  <span className="animate-pulse delay-200">●</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg px-4 py-2 text-sm">{error}</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            disabled={isLoading}
            className={clsx(
              'flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
              'disabled:bg-gray-50 disabled:text-gray-500'
            )}
            rows={1}
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!inputValue.trim() || isLoading}
            className={clsx(
              'px-4 py-2 rounded-lg font-medium text-sm transition-colors',
              'bg-blue-600 text-white hover:bg-blue-700',
              'disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed'
            )}
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
