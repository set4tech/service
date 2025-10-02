import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/checks/[id]/assessment-progress/route';
import { NextRequest } from 'next/server';

// Create mock functions
const mockSingle = vi.fn();
const mockLimit = vi.fn(() => ({ single: mockSingle }));
const mockOrder = vi.fn();
const mockEq = vi.fn(() => ({ order: mockOrder }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockSupabaseAdmin = vi.fn(() => ({ from: mockFrom }));

vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: mockSupabaseAdmin,
}));

describe('GET /api/checks/[id]/assessment-progress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return no progress if no runs exist', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'No runs found' },
    });

    const req = new NextRequest('http://localhost:3000/api/checks/123/assessment-progress', {
      method: 'GET',
    });

    const response = await GET(req, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.inProgress).toBe(false);
    expect(data.completed).toBe(0);
    expect(data.total).toBe(0);
  });

  it('should return progress for incomplete batch assessment', async () => {
    const batchGroupId = 'batch-group-123';

    // First query: .order().limit().single()
    mockOrder.mockReturnValueOnce({ limit: mockLimit });
    mockSingle.mockResolvedValueOnce({
      data: {
        batch_group_id: batchGroupId,
        total_batches: 3,
      },
      error: null,
    });

    // Second query: .order() returns promise directly
    mockOrder.mockResolvedValueOnce({
      data: [
        {
          id: 'run-1',
          batch_number: 1,
          total_batches: 3,
          batch_group_id: batchGroupId,
          compliance_status: 'compliant',
        },
        {
          id: 'run-2',
          batch_number: 2,
          total_batches: 3,
          batch_group_id: batchGroupId,
          compliance_status: 'compliant',
        },
      ],
      error: null,
    });

    const req = new NextRequest('http://localhost:3000/api/checks/123/assessment-progress', {
      method: 'GET',
    });

    const response = await GET(req, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.inProgress).toBe(true);
    expect(data.completed).toBe(2);
    expect(data.total).toBe(3);
    expect(data.batchGroupId).toBe(batchGroupId);
    expect(data.runs).toHaveLength(2);
  });

  it('should return progress for completed batch assessment', async () => {
    const batchGroupId = 'batch-group-123';

    mockOrder.mockReturnValueOnce({ limit: mockLimit });
    mockSingle.mockResolvedValueOnce({
      data: {
        batch_group_id: batchGroupId,
        total_batches: 3,
      },
      error: null,
    });

    // All 3 batches complete
    mockOrder.mockResolvedValueOnce({
      data: [
        { id: 'run-1', batch_number: 1, total_batches: 3 },
        { id: 'run-2', batch_number: 2, total_batches: 3 },
        { id: 'run-3', batch_number: 3, total_batches: 3 },
      ],
      error: null,
    });

    const req = new NextRequest('http://localhost:3000/api/checks/123/assessment-progress', {
      method: 'GET',
    });

    const response = await GET(req, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.inProgress).toBe(false);
    expect(data.completed).toBe(3);
    expect(data.total).toBe(3);
  });

  it('should handle single batch (non-batched) assessments', async () => {
    mockOrder.mockReturnValueOnce({ limit: mockLimit });
    mockSingle.mockResolvedValueOnce({
      data: {
        batch_group_id: 'batch-123',
        total_batches: 1,
      },
      error: null,
    });

    mockOrder.mockResolvedValueOnce({
      data: [{ id: 'run-1', batch_number: 1, total_batches: 1 }],
      error: null,
    });

    const req = new NextRequest('http://localhost:3000/api/checks/123/assessment-progress', {
      method: 'GET',
    });

    const response = await GET(req, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.inProgress).toBe(false);
    expect(data.completed).toBe(1);
    expect(data.total).toBe(1);
  });

  it('should handle database errors', async () => {
    mockSingle.mockRejectedValueOnce(new Error('Database connection failed'));

    const req = new NextRequest('http://localhost:3000/api/checks/123/assessment-progress', {
      method: 'GET',
    });

    const response = await GET(req, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Database connection failed');
  });
});
