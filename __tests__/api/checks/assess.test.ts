import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/checks/[id]/assess/route';
import { NextRequest } from 'next/server';

// Create mock functions
const mockSupabaseFrom = vi.fn();
const mockSupabaseAdmin = vi.fn(() => ({
  from: mockSupabaseFrom,
}));

const mockGetCodeAssembly = vi.fn();
const mockRunAI = vi.fn();

// Mock dependencies
vi.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: mockSupabaseAdmin,
}));

vi.mock('@/lib/neo4j', () => ({
  getCodeAssembly: mockGetCodeAssembly,
}));

vi.mock('@/lib/ai/analysis', () => ({
  runAI: mockRunAI,
}));

// Mock AWS S3 presigned URL generation
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({})),
  GetObjectCommand: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(() => Promise.resolve('https://mock-url.com/screenshot.png')),
}));

describe('POST /api/checks/[id]/assess', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mocks
    mockGetCodeAssembly.mockResolvedValue({
      sections: [
        {
          key: 'test-section-1',
          number: '11B-101.1',
          title: 'Test Section 1',
          fullText: 'This is test section 1 content',
        },
      ],
    });

    mockRunAI.mockResolvedValue({
      model: 'gemini-2.5-pro',
      raw: '{"compliance_status":"compliant","confidence":"high","reasoning":"Test reasoning"}',
      parsed: {
        compliance_status: 'compliant',
        confidence: 'high',
        reasoning: 'Test reasoning',
        violations: [],
        recommendations: [],
      },
    });
  });

  it('should return error if aiProvider is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/checks/123/assess', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(req, { params: Promise.resolve({ id: '123' }) });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('aiProvider required');
  });

  it('should process first batch and return immediately', async () => {
    // Mock chain for check query
    const mockSingle = vi.fn();
    const mockEq = vi.fn(() => ({ single: mockSingle }));
    const mockSelect = vi.fn(() => ({ eq: mockEq }));
    mockSupabaseFrom.mockReturnValueOnce({ select: mockSelect });

    // Mock check data
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'check-123',
        code_section_key: 'test-section-1',
        code_section_number: '11B-101.1',
        code_section_title: 'Test Section',
        check_location: 'Main entrance',
        check_name: 'Door width compliance',
        assessments: {
          projects: {
            extracted_variables: { occupancy: 'E - Educational' },
            code_assembly_id: 'assembly-1',
          },
        },
      },
      error: null,
    });

    // Mock screenshots
    const mockOrder = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const mockEqScreenshots = vi.fn(() => ({ order: mockOrder }));
    const mockSelectScreenshots = vi.fn(() => ({ eq: mockEqScreenshots }));
    mockSupabaseFrom.mockReturnValueOnce({ select: mockSelectScreenshots });

    // Mock run number count
    const mockEqCount = vi.fn(() => Promise.resolve({ count: 0 }));
    const mockSelectCount = vi.fn(() => ({ eq: mockEqCount }));
    mockSupabaseFrom.mockReturnValueOnce({ select: mockSelectCount });

    // Mock insert
    const mockSingleInsert = vi.fn(() => Promise.resolve({
      data: {
        id: 'run-1',
        run_number: 1,
        compliance_status: 'compliant',
        confidence: 'high',
      },
      error: null,
    }));
    const mockSelectInsert = vi.fn(() => ({ single: mockSingleInsert }));
    const mockInsert = vi.fn(() => ({ select: mockSelectInsert }));
    mockSupabaseFrom.mockReturnValueOnce({ insert: mockInsert });

    const req = new NextRequest('http://localhost:3000/api/checks/123/assess', {
      method: 'POST',
      body: JSON.stringify({
        aiProvider: 'gemini-2.5-pro',
      }),
    });

    const response = await POST(req, { params: Promise.resolve({ id: 'check-123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.batchGroupId).toBeDefined();
    expect(data.totalBatches).toBe(1);
    expect(data.firstBatchResult).toBeDefined();
  });

  it('should handle element checks with multiple sections', async () => {
    // Mock check with element_sections
    const mockSingleCheck = vi.fn(() => Promise.resolve({
      data: {
        id: 'check-123',
        element_sections: ['section-1', 'section-2'],
        assessments: {
          projects: {
            extracted_variables: {},
            code_assembly_id: 'assembly-1',
          },
        },
      },
      error: null,
    }));
    const mockEqCheck = vi.fn(() => ({ single: mockSingleCheck }));
    const mockSelectCheck = vi.fn(() => ({ eq: mockEqCheck }));
    mockSupabaseFrom.mockReturnValueOnce({ select: mockSelectCheck });

    // Mock Neo4j returning multiple sections
    mockGetCodeAssembly.mockResolvedValueOnce({
      sections: [
        { key: 'section-1', number: '11B-101', title: 'Section 1', fullText: 'Content 1' },
        { key: 'section-2', number: '11B-102', title: 'Section 2', fullText: 'Content 2' },
      ],
    });

    // Mock screenshots
    const mockOrderScreenshots2 = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const mockEqScreenshots2 = vi.fn(() => ({ order: mockOrderScreenshots2 }));
    const mockSelectScreenshots2 = vi.fn(() => ({ eq: mockEqScreenshots2 }));
    mockSupabaseFrom.mockReturnValueOnce({ select: mockSelectScreenshots2 });

    // Mock run count
    const mockEqCount2 = vi.fn(() => Promise.resolve({ count: 0 }));
    const mockSelectCount2 = vi.fn(() => ({ eq: mockEqCount2 }));
    mockSupabaseFrom.mockReturnValueOnce({ select: mockSelectCount2 });

    // Mock insert
    const mockSingleInsert2 = vi.fn(() => Promise.resolve({
      data: { id: 'run-1', batch_number: 1 },
      error: null,
    }));
    const mockSelectInsert2 = vi.fn(() => ({ single: mockSingleInsert2 }));
    const mockInsert2 = vi.fn(() => ({ select: mockSelectInsert2 }));
    mockSupabaseFrom.mockReturnValueOnce({ insert: mockInsert2 });

    const req = new NextRequest('http://localhost:3000/api/checks/123/assess', {
      method: 'POST',
      body: JSON.stringify({ aiProvider: 'gemini-2.5-pro' }),
    });

    const response = await POST(req, { params: Promise.resolve({ id: 'check-123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.totalBatches).toBe(1); // 2 sections = 1 batch (under 30)
  });

  it('should create multiple batches for large section counts', async () => {
    // Create 90 sections (should be 3 batches)
    const sections = Array.from({ length: 90 }, (_, i) => ({
      key: `section-${i}`,
      number: `11B-${i}`,
      title: `Section ${i}`,
      fullText: `Content ${i}`,
    }));

    // Mock check query
    const mockSingleCheck3 = vi.fn(() => Promise.resolve({
      data: {
        id: 'check-123',
        element_sections: sections.map(s => s.key),
        assessments: {
          projects: {
            extracted_variables: {},
            code_assembly_id: 'assembly-1',
          },
        },
      },
      error: null,
    }));
    const mockEqCheck3 = vi.fn(() => ({ single: mockSingleCheck3 }));
    const mockSelectCheck3 = vi.fn(() => ({ eq: mockEqCheck3 }));
    mockSupabaseFrom.mockReturnValueOnce({ select: mockSelectCheck3 });

    mockGetCodeAssembly.mockResolvedValueOnce({ sections });

    // Mock screenshots
    const mockOrderScreenshots3 = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const mockEqScreenshots3 = vi.fn(() => ({ order: mockOrderScreenshots3 }));
    const mockSelectScreenshots3 = vi.fn(() => ({ eq: mockEqScreenshots3 }));
    mockSupabaseFrom.mockReturnValueOnce({ select: mockSelectScreenshots3 });

    // Mock run count
    const mockEqCount3 = vi.fn(() => Promise.resolve({ count: 0 }));
    const mockSelectCount3 = vi.fn(() => ({ eq: mockEqCount3 }));
    mockSupabaseFrom.mockReturnValueOnce({ select: mockSelectCount3 });

    // Mock insert
    const mockSingleInsert3 = vi.fn(() => Promise.resolve({
      data: {
        id: 'run-1',
        batch_number: 1,
        total_batches: 3,
        section_keys_in_batch: sections.slice(0, 30).map(s => s.key),
      },
      error: null,
    }));
    const mockSelectInsert3 = vi.fn(() => ({ single: mockSingleInsert3 }));
    const mockInsert3 = vi.fn(() => ({ select: mockSelectInsert3 }));
    mockSupabaseFrom.mockReturnValueOnce({ insert: mockInsert3 });

    const req = new NextRequest('http://localhost:3000/api/checks/123/assess', {
      method: 'POST',
      body: JSON.stringify({ aiProvider: 'gemini-2.5-pro' }),
    });

    const response = await POST(req, { params: Promise.resolve({ id: 'check-123' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalBatches).toBe(3);
    expect(data.message).toContain('Processing 2 more batches in background');
  });

  it('should handle AI provider errors gracefully', async () => {
    // Mock check query
    const mockSingleCheck4 = vi.fn(() => Promise.resolve({
      data: {
        id: 'check-123',
        code_section_key: 'test-section',
        assessments: { projects: { extracted_variables: {}, code_assembly_id: 'assembly-1' } },
      },
      error: null,
    }));
    const mockEqCheck4 = vi.fn(() => ({ single: mockSingleCheck4 }));
    const mockSelectCheck4 = vi.fn(() => ({ eq: mockEqCheck4 }));
    mockSupabaseFrom.mockReturnValueOnce({ select: mockSelectCheck4 });

    // Mock screenshots
    const mockOrderScreenshots4 = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const mockEqScreenshots4 = vi.fn(() => ({ order: mockOrderScreenshots4 }));
    const mockSelectScreenshots4 = vi.fn(() => ({ eq: mockEqScreenshots4 }));
    mockSupabaseFrom.mockReturnValueOnce({ select: mockSelectScreenshots4 });

    // Mock run count
    const mockEqCount4 = vi.fn(() => Promise.resolve({ count: 0 }));
    const mockSelectCount4 = vi.fn(() => ({ eq: mockEqCount4 }));
    mockSupabaseFrom.mockReturnValueOnce({ select: mockSelectCount4 });

    // Mock AI failure
    mockRunAI.mockRejectedValueOnce(new Error('AI service unavailable'));

    const req = new NextRequest('http://localhost:3000/api/checks/123/assess', {
      method: 'POST',
      body: JSON.stringify({ aiProvider: 'gemini-2.5-pro' }),
    });

    const response = await POST(req, { params: Promise.resolve({ id: 'check-123' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('AI service unavailable');
  });
});
