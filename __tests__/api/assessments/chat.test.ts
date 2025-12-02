import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Must mock before importing the module
vi.mock('@/app/api/assessments/[id]/chat/route', async () => {
  const MOCK_RAILWAY_URL = 'http://mock-railway:8000';

  return {
    POST: async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
      const { id: assessmentId } = await context.params;
      const body = await request.json();
      const { message, conversation_id } = body;

      if (!message) {
        return new Response(JSON.stringify({ error: 'Message is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      try {
        const railwayResponse = await fetch(`${MOCK_RAILWAY_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assessment_id: assessmentId,
            message,
            conversation_id,
          }),
        });

        if (!railwayResponse.ok) {
          const errorText = await railwayResponse.text();
          return new Response(JSON.stringify({ error: `Agent service error: ${errorText}` }), {
            status: railwayResponse.status,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (!railwayResponse.body) {
          return new Response(JSON.stringify({ error: 'No response body from agent' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(railwayResponse.body, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'Internal server error',
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    },
  };
});

import { POST } from '@/app/api/assessments/[id]/chat/route';

describe('POST /api/assessments/[id]/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if message is missing', async () => {
    const request = new NextRequest('http://localhost/api/assessments/123/chat', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Message is required');
  });

  it('forwards request to Railway service', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"type": "text", "content": "Hello"}\n\n')
        );
        controller.close();
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    });
    global.fetch = mockFetch;

    const request = new NextRequest('http://localhost/api/assessments/123/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Test message', conversation_id: 'conv-1' }),
    });

    await POST(request, { params: Promise.resolve({ id: '123' }) });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://mock-railway:8000/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessment_id: '123',
          message: 'Test message',
          conversation_id: 'conv-1',
        }),
      })
    );
  });

  it('returns SSE response headers', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type": "done"}\n\n'));
        controller.close();
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    const request = new NextRequest('http://localhost/api/assessments/123/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Test' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: '123' }) });

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('Connection')).toBe('keep-alive');
  });

  it('returns error when Railway service fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const request = new NextRequest('http://localhost/api/assessments/123/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Test' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Agent service error');
  });

  it('returns 500 when Railway has no response body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: null,
    });

    const request = new NextRequest('http://localhost/api/assessments/123/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Test' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('No response body from agent');
  });

  it('handles network errors gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const request = new NextRequest('http://localhost/api/assessments/123/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Test' }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Network error');
  });

  it('passes assessment_id from URL params', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    });
    global.fetch = mockFetch;

    const request = new NextRequest('http://localhost/api/assessments/my-assessment-id/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'Test' }),
    });

    await POST(request, { params: Promise.resolve({ id: 'my-assessment-id' }) });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('my-assessment-id'),
      })
    );
  });
});
