import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/assessments/[id]/route';
import { NextRequest } from 'next/server';

// Mock Supabase
vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: vi.fn(),
}));

describe('GET /api/assessments/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch all data types in parallel', async () => {
    const assessmentId = 'test-assessment-id';
    const projectId = 'test-project-id';
    const pageNumber = '1';

    const { supabaseAdmin } = await import('@/lib/supabase-server');

    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'pdf_measurements') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() =>
                    Promise.resolve({
                      data: [{ id: 'measurement-1', project_id: projectId, page_number: 1 }],
                      error: null,
                    })
                  ),
                })),
              })),
            })),
          };
        }
        if (table === 'pdf_scale_calibrations') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(() =>
                    Promise.resolve({
                      data: { id: 'calibration-1', project_id: projectId, page_number: 1 },
                      error: null,
                    })
                  ),
                })),
              })),
            })),
          };
        }
        if (table === 'screenshots') {
          // First call for assigned screenshots
          const callCount = vi.fn();
          if (callCount.mock.calls.length === 0) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() =>
                    Promise.resolve({
                      data: [{ id: 'screenshot-1', screenshot_check_assignments: [] }],
                      error: null,
                    })
                  ),
                })),
              })),
            };
          }
          // Second call for all screenshots
          return {
            select: vi.fn(() => ({
              like: vi.fn(() => ({
                order: vi.fn(() =>
                  Promise.resolve({
                    data: [{ id: 'screenshot-1' }, { id: 'screenshot-2' }],
                    error: null,
                  })
                ),
              })),
            })),
          };
        }
        if (table === 'assessments') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { pdf_scale: 4.0 },
                    error: null,
                  })
                ),
              })),
            })),
          };
        }
        return {};
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest(
      `http://localhost:3000/api/assessments/${assessmentId}?projectId=${projectId}&pageNumber=${pageNumber}`
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: assessmentId }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.measurements).toBeDefined();
    expect(data.data.calibration).toBeDefined();
    expect(data.data.screenshots).toBeDefined();
    expect(data.data.pdf_scale).toBe(4.0);
  });

  it('should handle missing projectId gracefully', async () => {
    const assessmentId = 'test-assessment-id';
    const pageNumber = '1';

    const request = new NextRequest(
      `http://localhost:3000/api/assessments/${assessmentId}?pageNumber=${pageNumber}`
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: assessmentId }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
