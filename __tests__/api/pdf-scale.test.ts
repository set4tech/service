import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PUT } from '@/app/api/assessments/[id]/pdf-scale/route';
import { NextRequest } from 'next/server';

// Mock Supabase
vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: vi.fn(),
}));

describe('GET /api/assessments/[id]/pdf-scale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return pdf_scale for an assessment', async () => {
    const assessmentId = 'test-assessment-id';

    const { supabaseAdmin } = await import('@/lib/supabase-server');
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { pdf_scale: 4.5 },
                error: null,
              })
            ),
          })),
        })),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest(
      `http://localhost:3000/api/assessments/${assessmentId}/pdf-scale`
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: assessmentId }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.pdf_scale).toBe(4.5);
  });

  it('should return default pdf_scale of 2.0 if not set', async () => {
    const assessmentId = 'test-assessment-id';

    const { supabaseAdmin } = await import('@/lib/supabase-server');
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { pdf_scale: null },
                error: null,
              })
            ),
          })),
        })),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest(
      `http://localhost:3000/api/assessments/${assessmentId}/pdf-scale`
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: assessmentId }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.pdf_scale).toBe(2.0);
  });
});

describe('PUT /api/assessments/[id]/pdf-scale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update pdf_scale for an assessment', async () => {
    const assessmentId = 'test-assessment-id';

    const { supabaseAdmin } = await import('@/lib/supabase-server');
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest(
      `http://localhost:3000/api/assessments/${assessmentId}/pdf-scale`,
      {
        method: 'PUT',
        body: JSON.stringify({ pdf_scale: 5.5 }),
      }
    );

    const response = await PUT(request, {
      params: Promise.resolve({ id: assessmentId }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.pdf_scale).toBe(5.5);
  });

  it('should reject pdf_scale below 1', async () => {
    const assessmentId = 'test-assessment-id';

    const request = new NextRequest(
      `http://localhost:3000/api/assessments/${assessmentId}/pdf-scale`,
      {
        method: 'PUT',
        body: JSON.stringify({ pdf_scale: 0.5 }),
      }
    );

    const response = await PUT(request, {
      params: Promise.resolve({ id: assessmentId }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('between 1 and 8');
  });

  it('should reject pdf_scale above 8', async () => {
    const assessmentId = 'test-assessment-id';

    const request = new NextRequest(
      `http://localhost:3000/api/assessments/${assessmentId}/pdf-scale`,
      {
        method: 'PUT',
        body: JSON.stringify({ pdf_scale: 10 }),
      }
    );

    const response = await PUT(request, {
      params: Promise.resolve({ id: assessmentId }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('between 1 and 8');
  });
});
