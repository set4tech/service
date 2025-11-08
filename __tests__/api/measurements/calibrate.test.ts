import { describe, it, expect, vi } from 'vitest';
import { GET, POST } from '@/app/api/measurements/calibrate/route';
import { NextRequest } from 'next/server';

// Mock Supabase
vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      })),
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({
              data: {
                id: 'test-id',
                project_id: 'test-project',
                page_number: 1,
                pixels_per_inch: 72,
              },
              error: null,
            })
          ),
        })),
      })),
    })),
  })),
}));

describe('GET /api/measurements/calibrate', () => {
  it('should return 400 if projectId is missing', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/measurements/calibrate?pageNumber=1'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('projectId and pageNumber are required');
  });

  it('should return 400 if pageNumber is missing', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/measurements/calibrate?projectId=test-project'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('projectId and pageNumber are required');
  });

  it('should return calibration data when found', async () => {
    const mockCalibration = {
      id: 'test-id',
      project_id: 'test-project',
      page_number: 1,
      scale_notation: '1/8"=1\'-0"',
      print_width_inches: 24,
      print_height_inches: 36,
      pixels_per_inch: 72,
    };

    const { supabaseAdmin } = await import('@/lib/supabase-server');
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: mockCalibration, error: null })),
            })),
          })),
        })),
      })),

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest(
      'http://localhost:3000/api/measurements/calibrate?projectId=test-project&pageNumber=1'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.calibration).toEqual(mockCalibration);
  });

  it('should return null calibration when not found', async () => {
    const { supabaseAdmin } = await import('@/lib/supabase-server');
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        })),
      })),

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest(
      'http://localhost:3000/api/measurements/calibrate?projectId=test-project&pageNumber=1'
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.calibration).toBeNull();
  });
});

describe('POST /api/measurements/calibrate - Page Size Method', () => {
  it('should create calibration with page-size method', async () => {
    const requestBody = {
      project_id: 'test-project',
      page_number: 1,
      method: 'page-size',
      scale_notation: '1/8"=1\'-0"',
      print_width_inches: 24,
      print_height_inches: 36,
      pdf_width_points: 1728, // 24 * 72
      pdf_height_points: 2592, // 36 * 72
    };

    const mockCalibration = {
      id: 'test-id',
      ...requestBody,
      pixels_per_inch: 72,
      calibration_line_start: null,
      calibration_line_end: null,
      known_distance_inches: null,
    };

    const { supabaseAdmin } = await import('@/lib/supabase-server');
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn(() => ({
        upsert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: mockCalibration, error: null })),
          })),
        })),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest('http://localhost:3000/api/measurements/calibrate', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.calibration).toBeDefined();
    expect(data.calibration.scale_notation).toBe('1/8"=1\'-0"');
  });

  it('should return 400 if scale_notation is missing', async () => {
    const requestBody = {
      project_id: 'test-project',
      page_number: 1,
      method: 'page-size',
      print_width_inches: 24,
      print_height_inches: 36,
      pdf_width_points: 1728,
      pdf_height_points: 2592,
    };

    const request = new NextRequest('http://localhost:3000/api/measurements/calibrate', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Page size method requires');
  });

  it('should return 400 for invalid scale notation', async () => {
    const requestBody = {
      project_id: 'test-project',
      page_number: 1,
      method: 'page-size',
      scale_notation: 'invalid',
      print_width_inches: 24,
      print_height_inches: 36,
      pdf_width_points: 1728,
      pdf_height_points: 2592,
    };

    const request = new NextRequest('http://localhost:3000/api/measurements/calibrate', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Invalid scale notation');
  });

  it('should return 400 for invalid print dimensions', async () => {
    const requestBody = {
      project_id: 'test-project',
      page_number: 1,
      method: 'page-size',
      scale_notation: '1/8"=1\'-0"',
      print_width_inches: -5, // Negative value
      print_height_inches: 36,
      pdf_width_points: 1728,
      pdf_height_points: 2592,
    };

    const request = new NextRequest('http://localhost:3000/api/measurements/calibrate', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Invalid print dimensions');
  });
});

describe('POST /api/measurements/calibrate - Known Length Method', () => {
  it('should create calibration with known-length method', async () => {
    const requestBody = {
      project_id: 'test-project',
      page_number: 1,
      method: 'known-length',
      calibration_line_start: { x: 100, y: 100 },
      calibration_line_end: { x: 820, y: 100 },
      known_distance_inches: 10,
    };

    const mockCalibration = {
      id: 'test-id',
      project_id: 'test-project',
      page_number: 1,
      method: 'known-length',
      scale_notation: null,
      print_width_inches: null,
      print_height_inches: null,
      pixels_per_inch: 72, // 720 pixels / 10 inches
      calibration_line_start: { x: 100, y: 100 },
      calibration_line_end: { x: 820, y: 100 },
      known_distance_inches: 10,
    };

    const { supabaseAdmin } = await import('@/lib/supabase-server');
    vi.mocked(supabaseAdmin).mockReturnValue({
      from: vi.fn(() => ({
        upsert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: mockCalibration, error: null })),
          })),
        })),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = new NextRequest('http://localhost:3000/api/measurements/calibrate', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.calibration).toBeDefined();
    expect(data.calibration.known_distance_inches).toBe(10);
  });

  it('should return 400 if calibration_line_start is missing', async () => {
    const requestBody = {
      project_id: 'test-project',
      page_number: 1,
      method: 'known-length',
      calibration_line_end: { x: 820, y: 100 },
      known_distance_inches: 10,
    };

    const request = new NextRequest('http://localhost:3000/api/measurements/calibrate', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Known length method requires');
  });

  it('should return 400 for invalid line coordinates', async () => {
    const requestBody = {
      project_id: 'test-project',
      page_number: 1,
      method: 'known-length',
      calibration_line_start: { x: 'invalid', y: 100 },
      calibration_line_end: { x: 820, y: 100 },
      known_distance_inches: 10,
    };

    const request = new NextRequest('http://localhost:3000/api/measurements/calibrate', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Invalid line coordinates');
  });

  it('should return 400 for zero length line', async () => {
    const requestBody = {
      project_id: 'test-project',
      page_number: 1,
      method: 'known-length',
      calibration_line_start: { x: 100, y: 100 },
      calibration_line_end: { x: 100, y: 100 },
      known_distance_inches: 10,
    };

    const request = new NextRequest('http://localhost:3000/api/measurements/calibrate', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('zero length');
  });

  it('should return 400 for invalid known distance', async () => {
    const requestBody = {
      project_id: 'test-project',
      page_number: 1,
      method: 'known-length',
      calibration_line_start: { x: 100, y: 100 },
      calibration_line_end: { x: 820, y: 100 },
      known_distance_inches: -5, // Negative value
    };

    const request = new NextRequest('http://localhost:3000/api/measurements/calibrate', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Invalid known distance');
  });
});

describe('POST /api/measurements/calibrate - General validation', () => {
  it('should return 400 if project_id is missing', async () => {
    const requestBody = {
      page_number: 1,
      method: 'page-size',
    };

    const request = new NextRequest('http://localhost:3000/api/measurements/calibrate', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Missing required fields');
  });

  it('should return 400 if method is invalid', async () => {
    const requestBody = {
      project_id: 'test-project',
      page_number: 1,
      method: 'invalid-method',
    };

    const request = new NextRequest('http://localhost:3000/api/measurements/calibrate', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Invalid method');
  });
});
