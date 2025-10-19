import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';

// Add custom render function if needed (e.g., with providers)
const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) => {
  return render(ui, { ...options });
};

export * from '@testing-library/react';
export { customRender as render };

// Mock data factories
export const createMockCheck = (overrides: Record<string, unknown> = {}) => ({
  id: 'test-check-id',
  check_type: 'section' as const,
  code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-404',
  code_section_number: '11B-404',
  code_section_title: 'Doors',
  assessment_id: 'test-assessment-id',
  element_group_id: null as string | null,
  instance_label: null as string | null,
  manual_status: null as string | null,
  manual_status_note: null as string | null,
  is_excluded: false,
  ...overrides,
});

export const createMockGroupedChecks = (count: number = 3) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `check-${i}`,
    check_type: 'section' as const,
    code_section_key: `ICC:CBC_Chapter11A_11B:2025:CA:11B-404.${i}`,
    code_section_number: `11B-404.${i}`,
    code_section_title: `Door requirement ${i}`,
    element_group_id: 'element-group-1',
    instance_label: 'Doors 12',
    assessment_id: 'test-assessment-id',
    manual_status: null as string | null,
    manual_status_note: null as string | null,
    is_excluded: false,
  }));
};

export const createMockCodeSection = (overrides: Record<string, unknown> = {}) => ({
  key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-404',
  number: '11B-404',
  title: 'Doors',
  text: 'Doors shall comply with Section 11B-404.',
  ...overrides,
});

export const createMockAnalysisRun = (overrides: Record<string, unknown> = {}) => ({
  id: 'analysis-run-1',
  check_id: 'test-check-id',
  compliance_status: 'compliant',
  confidence_score: 0.85,
  executed_at: new Date().toISOString(),
  ...overrides,
});

// Mock fetch response helper
export const mockFetchResponse = (data: unknown, ok: boolean = true) => {
  return {
    ok,
    json: async () => data,
    status: ok ? 200 : 400,
  } as Response;
};

// Mock fetch helper
export const setupFetchMock = (responses: Record<string, unknown>) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global.fetch as any).mockImplementation((url: string) => {
    for (const [pattern, response] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return Promise.resolve(mockFetchResponse(response));
      }
    }
    return Promise.resolve(mockFetchResponse({ error: 'Not found' }, false));
  });
};
