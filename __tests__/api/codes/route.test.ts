import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/codes/route';
import { NextRequest } from 'next/server';

// Mock dependencies
const mockSupabaseFrom = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: mockSupabaseFrom,
  })),
}));

describe('GET /api/codes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return only 11A and 11B codes from database', async () => {
    // Mock chain for codes query: select().in().order()
    const mockOrder = vi.fn();
    const mockIn = vi.fn(() => ({ order: mockOrder }));
    const mockSelect = vi.fn(() => ({ in: mockIn }));
    mockSupabaseFrom.mockReturnValueOnce({ select: mockSelect });

    // Mock database response with only 11A and 11B
    mockOrder.mockResolvedValueOnce({
      data: [
        {
          id: 'ICC+CBC_Chapter11A+2025+CA',
          title: 'California Building Code Chapter 11A',
          provider: 'ICC',
          version: '2025',
          jurisdiction: 'CA',
        },
        {
          id: 'ICC+CBC_Chapter11B+2025+CA',
          title: 'California Building Code Chapter 11B',
          provider: 'ICC',
          version: '2025',
          jurisdiction: 'CA',
        },
      ],
      error: null,
    });

    const req = new NextRequest('http://localhost:3000/api/codes');
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data.map((c: { id: string }) => c.id)).toContain('ICC+CBC_Chapter11A+2025+CA');
    expect(data.map((c: { id: string }) => c.id)).toContain('ICC+CBC_Chapter11B+2025+CA');
  });

  it('should map database fields to CodeNode format', async () => {
    // Mock chain for codes query: select().in().order()
    const mockOrder = vi.fn();
    const mockIn = vi.fn(() => ({ order: mockOrder }));
    const mockSelect = vi.fn(() => ({ in: mockIn }));
    mockSupabaseFrom.mockReturnValueOnce({ select: mockSelect });

    // Mock database response
    mockOrder.mockResolvedValueOnce({
      data: [
        {
          id: 'ICC+CBC_Chapter11A+2025+CA',
          title: 'California Building Code Chapter 11A',
          provider: 'ICC',
          version: '2025',
          jurisdiction: 'CA',
        },
      ],
      error: null,
    });

    const req = new NextRequest('http://localhost:3000/api/codes');
    const response = await GET(req);
    const data = await response.json();

    expect(data[0]).toEqual({
      id: 'ICC+CBC_Chapter11A+2025+CA',
      name: 'California Building Code Chapter 11A',
      publisher: 'ICC',
      year: '2025',
      jurisdiction: 'CA',
    });
  });

  it('should handle database errors', async () => {
    // Mock chain for codes query: select().in().order()
    const mockOrder = vi.fn();
    const mockIn = vi.fn(() => ({ order: mockOrder }));
    const mockSelect = vi.fn(() => ({ in: mockIn }));
    mockSupabaseFrom.mockReturnValueOnce({ select: mockSelect });

    // Mock database error
    mockOrder.mockResolvedValueOnce({
      data: null,
      error: new Error('Database connection failed'),
    });

    const req = new NextRequest('http://localhost:3000/api/codes');
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch codes from database');
  });

  it('should handle empty results', async () => {
    // Mock chain for codes query: select().in().order()
    const mockOrder = vi.fn();
    const mockIn = vi.fn(() => ({ order: mockOrder }));
    const mockSelect = vi.fn(() => ({ in: mockIn }));
    mockSupabaseFrom.mockReturnValueOnce({ select: mockSelect });

    // Mock empty database response
    mockOrder.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const req = new NextRequest('http://localhost:3000/api/codes');
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });
});
