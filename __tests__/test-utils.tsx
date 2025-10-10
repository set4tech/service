import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';

// Add custom render function if needed (e.g., with providers)
const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) => {
  return render(ui, { ...options });
};

export * from '@testing-library/react';
export { customRender as render };

// Mock data factories
export const createMockCheck = (overrides: any = {}) => ({
  id: 'test-check-id',
  check_type: 'section',
  code_section_key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-404',
  code_section_number: '11B-404',
  code_section_title: 'Doors',
  assessment_id: 'test-assessment-id',
  manual_override: null,
  manual_override_note: null,
  ...overrides,
});

export const createMockGroupedChecks = (count: number = 3) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `check-${i}`,
    check_type: 'section',
    code_section_key: `ICC:CBC_Chapter11A_11B:2025:CA:11B-404.${i}`,
    code_section_number: `11B-404.${i}`,
    code_section_title: `Door requirement ${i}`,
    element_group_id: 'element-group-1',
    instance_label: 'Doors 12',
    assessment_id: 'test-assessment-id',
    manual_override: null,
    manual_override_note: null,
  }));
};

export const createMockCodeSection = (overrides: any = {}) => ({
  key: 'ICC:CBC_Chapter11A_11B:2025:CA:11B-404',
  number: '11B-404',
  title: 'Doors',
  text: 'Doors shall comply with Section 11B-404.',
  ...overrides,
});

export const createMockAnalysisRun = (overrides: any = {}) => ({
  id: 'analysis-run-1',
  check_id: 'test-check-id',
  compliance_status: 'compliant',
  confidence_score: 0.85,
  executed_at: new Date().toISOString(),
  ...overrides,
});

// Mock fetch response helper
export const mockFetchResponse = (data: any, ok: boolean = true) => {
  return {
    ok,
    json: async () => data,
    status: ok ? 200 : 400,
  } as Response;
};

// Mock fetch helper
export const setupFetchMock = (responses: { [url: string]: any }) => {
  (global.fetch as any).mockImplementation((url: string) => {
    for (const [pattern, response] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return Promise.resolve(mockFetchResponse(response));
      }
    }
    return Promise.resolve(mockFetchResponse({ error: 'Not found' }, false));
  });
};
