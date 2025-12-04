import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from '@/components/chat/ChatPanel';

// Mock ReadableStream for SSE
function createMockSSEStream(events: string[]) {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(encoder.encode(events[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

describe('ChatPanel', () => {
  const assessmentId = 'test-assessment-123';

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage to isolate tests - the component persists chat state
    localStorage.clear();
  });

  describe('Rendering', () => {
    it('renders the chat header', () => {
      render(<ChatPanel assessmentId={assessmentId} />);
      expect(screen.getByText('Chat with Drawings')).toBeInTheDocument();
    });

    it('renders example questions when empty', () => {
      render(<ChatPanel assessmentId={assessmentId} />);
      expect(screen.getByText(/What doors are in this project/)).toBeInTheDocument();
      expect(screen.getByText(/Show me the room list/)).toBeInTheDocument();
    });

    it('renders input field and send button', () => {
      render(<ChatPanel assessmentId={assessmentId} />);
      expect(screen.getByPlaceholderText('Ask a question...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    });

    it('send button is disabled when input is empty', () => {
      render(<ChatPanel assessmentId={assessmentId} />);
      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).toBeDisabled();
    });
  });

  describe('User Input', () => {
    it('enables send button when user types', async () => {
      const user = userEvent.setup();
      render(<ChatPanel assessmentId={assessmentId} />);

      const input = screen.getByPlaceholderText('Ask a question...');
      await user.type(input, 'Hello');

      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).not.toBeDisabled();
    });

    it('clears input after sending', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockSSEStream([
          'data: {"type": "text", "content": "Response"}\n\n',
          'data: {"type": "done", "conversation_id": "conv-1"}\n\n',
        ]),
      });
      global.fetch = mockFetch;

      const user = userEvent.setup();
      render(<ChatPanel assessmentId={assessmentId} />);

      const input = screen.getByPlaceholderText('Ask a question...') as HTMLTextAreaElement;
      await user.type(input, 'Hello');
      await user.click(screen.getByRole('button', { name: /send/i }));

      expect(input.value).toBe('');
    });

    it('sends message on Enter key', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockSSEStream([
          'data: {"type": "text", "content": "Response"}\n\n',
          'data: {"type": "done", "conversation_id": "conv-1"}\n\n',
        ]),
      });
      global.fetch = mockFetch;

      const user = userEvent.setup();
      render(<ChatPanel assessmentId={assessmentId} />);

      const input = screen.getByPlaceholderText('Ask a question...');
      await user.type(input, 'Hello{enter}');

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/assessments/${assessmentId}/chat`,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Hello'),
        })
      );
    });

    it('does not send on Shift+Enter (allows multiline)', async () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      const user = userEvent.setup();
      render(<ChatPanel assessmentId={assessmentId} />);

      const input = screen.getByPlaceholderText('Ask a question...');
      await user.type(input, 'Line 1{shift>}{enter}{/shift}Line 2');

      // Should not have sent yet
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('API Interaction', () => {
    it('sends correct request to API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockSSEStream([
          'data: {"type": "text", "content": "Response"}\n\n',
          'data: {"type": "done", "conversation_id": "conv-1"}\n\n',
        ]),
      });
      global.fetch = mockFetch;

      const user = userEvent.setup();
      render(<ChatPanel assessmentId={assessmentId} />);

      const input = screen.getByPlaceholderText('Ask a question...');
      await user.type(input, 'What doors are there?');
      await user.click(screen.getByRole('button', { name: /send/i }));

      expect(mockFetch).toHaveBeenCalledWith(`/api/assessments/${assessmentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'What doors are there?',
          conversation_id: null,
        }),
      });
    });

    it('includes conversation_id in subsequent requests', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockSSEStream([
          'data: {"type": "text", "content": "Response"}\n\n',
          'data: {"type": "done", "conversation_id": "conv-123"}\n\n',
        ]),
      });
      global.fetch = mockFetch;

      const user = userEvent.setup();
      render(<ChatPanel assessmentId={assessmentId} />);

      // Send first message
      const input = screen.getByPlaceholderText('Ask a question...');
      await user.type(input, 'First message');
      await user.click(screen.getByRole('button', { name: /send/i }));

      // Wait for response
      await waitFor(() => {
        expect(screen.getByText('Response')).toBeInTheDocument();
      });

      // Send second message
      await user.type(input, 'Second message');
      await user.click(screen.getByRole('button', { name: /send/i }));

      // Second call should include conversation_id
      expect(mockFetch).toHaveBeenLastCalledWith(
        `/api/assessments/${assessmentId}/chat`,
        expect.objectContaining({
          body: expect.stringContaining('conv-123'),
        })
      );
    });
  });

  describe('Message Display', () => {
    it('displays user message after sending', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockSSEStream([
          'data: {"type": "text", "content": "Agent response"}\n\n',
          'data: {"type": "done", "conversation_id": "conv-1"}\n\n',
        ]),
      });
      global.fetch = mockFetch;

      const user = userEvent.setup();
      render(<ChatPanel assessmentId={assessmentId} />);

      const input = screen.getByPlaceholderText('Ask a question...');
      await user.type(input, 'My question');
      await user.click(screen.getByRole('button', { name: /send/i }));

      expect(screen.getByText('My question')).toBeInTheDocument();
    });

    it('displays assistant response from stream', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockSSEStream([
          'data: {"type": "text", "content": "Here are the doors: "}\n\n',
          'data: {"type": "text", "content": "D-01, D-02"}\n\n',
          'data: {"type": "done", "conversation_id": "conv-1"}\n\n',
        ]),
      });
      global.fetch = mockFetch;

      const user = userEvent.setup();
      render(<ChatPanel assessmentId={assessmentId} />);

      const input = screen.getByPlaceholderText('Ask a question...');
      await user.type(input, 'List doors');
      await user.click(screen.getByRole('button', { name: /send/i }));

      await waitFor(() => {
        expect(screen.getByText(/Here are the doors.*D-01, D-02/)).toBeInTheDocument();
      });
    });

    it('displays tool use indicator', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockSSEStream([
          'data: {"type": "tool_use", "tool": "find_schedules", "tool_use_id": "t1", "input": {}}\n\n',
          'data: {"type": "tool_result", "tool": "find_schedules", "tool_use_id": "t1", "result": {"schedules": []}}\n\n',
          'data: {"type": "text", "content": "Found schedules"}\n\n',
          'data: {"type": "done", "conversation_id": "conv-1"}\n\n',
        ]),
      });
      global.fetch = mockFetch;

      const user = userEvent.setup();
      render(<ChatPanel assessmentId={assessmentId} />);

      const input = screen.getByPlaceholderText('Ask a question...');
      await user.type(input, 'Find schedules');
      await user.click(screen.getByRole('button', { name: /send/i }));

      await waitFor(() => {
        expect(screen.getByText('find_schedules')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error on API failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });
      global.fetch = mockFetch;

      const user = userEvent.setup();
      render(<ChatPanel assessmentId={assessmentId} />);

      const input = screen.getByPlaceholderText('Ask a question...');
      await user.type(input, 'Test');
      await user.click(screen.getByRole('button', { name: /send/i }));

      await waitFor(() => {
        expect(screen.getByText(/Server error/)).toBeInTheDocument();
      });
    });

    it('displays error from SSE stream', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockSSEStream(['data: {"type": "error", "message": "Processing failed"}\n\n']),
      });
      global.fetch = mockFetch;

      const user = userEvent.setup();
      render(<ChatPanel assessmentId={assessmentId} />);

      const input = screen.getByPlaceholderText('Ask a question...');
      await user.type(input, 'Test');
      await user.click(screen.getByRole('button', { name: /send/i }));

      await waitFor(() => {
        expect(screen.getByText('Processing failed')).toBeInTheDocument();
      });
    });
  });

  describe('Clear Conversation', () => {
    it('shows clear button when messages exist', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockSSEStream([
          'data: {"type": "text", "content": "Response"}\n\n',
          'data: {"type": "done", "conversation_id": "conv-1"}\n\n',
        ]),
      });
      global.fetch = mockFetch;

      const user = userEvent.setup();
      render(<ChatPanel assessmentId={assessmentId} />);

      // Initially no clear button
      expect(screen.queryByText('Clear')).not.toBeInTheDocument();

      // Send a message
      const input = screen.getByPlaceholderText('Ask a question...');
      await user.type(input, 'Hello');
      await user.click(screen.getByRole('button', { name: /send/i }));

      // Wait for response
      await waitFor(() => {
        expect(screen.getByText('Response')).toBeInTheDocument();
      });

      // Clear button should now be visible
      expect(screen.getByText('Clear')).toBeInTheDocument();
    });

    it('clears messages when clear is clicked', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: createMockSSEStream([
          'data: {"type": "text", "content": "Response"}\n\n',
          'data: {"type": "done", "conversation_id": "conv-1"}\n\n',
        ]),
      });
      global.fetch = mockFetch;

      const user = userEvent.setup();
      render(<ChatPanel assessmentId={assessmentId} />);

      // Send a message
      const input = screen.getByPlaceholderText('Ask a question...');
      await user.type(input, 'Hello');
      await user.click(screen.getByRole('button', { name: /send/i }));

      await waitFor(() => {
        expect(screen.getByText('Response')).toBeInTheDocument();
      });

      // Click clear
      await user.click(screen.getByText('Clear'));

      // Messages should be cleared
      expect(screen.queryByText('Hello')).not.toBeInTheDocument();
      expect(screen.queryByText('Response')).not.toBeInTheDocument();

      // Example questions should be back
      expect(screen.getByText(/What doors are in this project/)).toBeInTheDocument();
    });
  });
});
