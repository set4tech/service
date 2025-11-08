import { describe, it, expect, vi } from 'vitest';
import { GET, POST, DELETE } from '@/app/api/measurements/route';
import { NextRequest } from 'next/server';

// Mock Supabase
vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({
              data: {
                id: 'test-measurement-id',
                project_id: 'test-project',
                page_number: 1,
                start_point: { x: 100, y: 100 },
                end_point: { x: 200, y: 100 },
                pixels_distance: 100,
                real_distance_inches: 10,
              },
              error: null,
            })
          ),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  })),
}));

describe('GET /api/measurements', () => {
  it('should return 400 if projectId is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/measurements?pageNumber=1');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('projectId and pageNumber are required');
  });

  it('should return 400 if pageNumber is missing', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/measurements?projectId=test-project'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('projectId and pageNumber are required');
  });

  it('should return measurements for a project page', async () => {
    const mockMeasurements = [
      {
        id: 'measurement-1',
        project_id: 'test-project',
        page_number: 1,
        start_point: { x: 100, y: 100 },
        end_point: { x: 200, y: 100 },
        pixels_distance: 100,
        real_distance_inches: 10,
        label: 'Test measurement',
        color: '#3B82F6',
      },
    ];

    const { supabaseAdmin } = await import('@/lib/supabase-server');
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: mockMeasurements, error: null })),
            })),
          })),
        })),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest(
      'http://localhost:3000/api/measurements?projectId=test-project&pageNumber=1'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.measurements).toHaveLength(1);
    expect(data.measurements[0].id).toBe('measurement-1');
  });

  it('should return empty array when no measurements found', async () => {
    const { supabaseAdmin } = await import('@/lib/supabase-server');
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest(
      'http://localhost:3000/api/measurements?projectId=test-project&pageNumber=1'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.measurements).toHaveLength(0);
  });
});

describe('POST /api/measurements', () => {
  it('should create a new measurement', async () => {
    const requestBody = {
      project_id: 'test-project',
      page_number: 1,
      start_point: { x: 100, y: 100 },
      end_point: { x: 200, y: 100 },
      pixels_distance: 100,
      real_distance_inches: 10,
      label: 'Test measurement',
      color: '#FF0000',
    };

    const mockMeasurement = {
      id: 'new-measurement-id',
      ...requestBody,
      created_at: new Date().toISOString(),
    };

    const { supabaseAdmin } = await import('@/lib/supabase-server');
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: mockMeasurement, error: null })),
          })),
        })),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest('http://localhost:3000/api/measurements', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.measurement).toBeDefined();
    expect(data.measurement.id).toBe('new-measurement-id');
    expect(data.measurement.label).toBe('Test measurement');
  });

  it('should create measurement without optional fields', async () => {
    const requestBody = {
      project_id: 'test-project',
      page_number: 1,
      start_point: { x: 100, y: 100 },
      end_point: { x: 200, y: 100 },
      pixels_distance: 100,
    };

    const mockMeasurement = {
      id: 'new-measurement-id',
      ...requestBody,
      real_distance_inches: null,
      label: null,
      color: '#3B82F6',
    };

    const { supabaseAdmin } = await import('@/lib/supabase-server');
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: mockMeasurement, error: null })),
          })),
        })),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest('http://localhost:3000/api/measurements', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.measurement.real_distance_inches).toBeNull();
    expect(data.measurement.color).toBe('#3B82F6'); // Default color
  });

  it('should return 400 if project_id is missing', async () => {
    const requestBody = {
      page_number: 1,
      start_point: { x: 100, y: 100 },
      end_point: { x: 200, y: 100 },
      pixels_distance: 100,
    };

    const request = new NextRequest('http://localhost:3000/api/measurements', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Missing required fields');
  });

  it('should return 400 if start_point is missing', async () => {
    const requestBody = {
      project_id: 'test-project',
      page_number: 1,
      end_point: { x: 200, y: 100 },
      pixels_distance: 100,
    };

    const request = new NextRequest('http://localhost:3000/api/measurements', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Missing required fields');
  });

  it('should return 400 if point coordinates are invalid', async () => {
    const requestBody = {
      project_id: 'test-project',
      page_number: 1,
      start_point: { x: 'invalid', y: 100 },
      end_point: { x: 200, y: 100 },
      pixels_distance: 100,
    };

    const request = new NextRequest('http://localhost:3000/api/measurements', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Invalid point structure');
  });
});

describe('DELETE /api/measurements', () => {
  it('should delete a measurement', async () => {
    const { supabaseAdmin } = await import('@/lib/supabase-server');
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest(
      'http://localhost:3000/api/measurements?id=test-measurement-id'
    );

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should return 400 if id is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/measurements');

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('id is required');
  });
});

describe('Measurement calculations', () => {
  it('should accept measurement with calculated real_distance_inches', async () => {
    // Simulate a measurement after calibration
    const requestBody = {
      project_id: 'test-project',
      page_number: 1,
      start_point: { x: 100, y: 100 },
      end_point: { x: 820, y: 100 }, // 720 pixels
      pixels_distance: 720,
      real_distance_inches: 120, // 10 feet (assuming 72 pixels per inch calibration)
    };

    const mockMeasurement = {
      id: 'new-measurement-id',
      ...requestBody,
    };

    const { supabaseAdmin } = await import('@/lib/supabase-server');
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: mockMeasurement, error: null })),
          })),
        })),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest('http://localhost:3000/api/measurements', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.measurement.pixels_distance).toBe(720);
    expect(data.measurement.real_distance_inches).toBe(120);
  });

  it('should handle measurements without calibration', async () => {
    // Measurement before calibration is set
    const requestBody = {
      project_id: 'test-project',
      page_number: 1,
      start_point: { x: 100, y: 100 },
      end_point: { x: 200, y: 100 },
      pixels_distance: 100,
      // real_distance_inches not provided (will be null)
    };

    const mockMeasurement = {
      id: 'new-measurement-id',
      ...requestBody,
      real_distance_inches: null,
    };

    const { supabaseAdmin } = await import('@/lib/supabase-server');
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: mockMeasurement, error: null })),
          })),
        })),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest('http://localhost:3000/api/measurements', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.measurement.real_distance_inches).toBeNull();
  });
});
