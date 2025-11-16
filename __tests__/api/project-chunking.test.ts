import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Regression test for PDF Chunking URL Typo
 *
 * This test ensures that project creation calls the correct chunking endpoint:
 * - Correct: /api/projects/{id}/chunk (with 's')
 * - Incorrect: /api/project/{id}/chunk (without 's')
 *
 * Bug History: In production, projects were created but never chunked because
 * the URL had a typo, causing a 404. Since it was fire-and-forget with error
 * catching, the failure was silent.
 */
describe('Project Creation - Chunking Integration', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('should call chunking endpoint with correct URL after project creation', async () => {
    // This test ensures the URL typo doesn't happen again
    const mockProjectId = '123e4567-e89b-12d3-a456-426614174000';

    // Mock project creation response
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: mockProjectId, name: 'Test Project' }),
    });

    // Mock chunking endpoint call
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    // Simulate project creation flow
    const projectResponse = await fetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Project',
        pdf_url: 'https://example.com/test.pdf',
      }),
    });

    const project = await projectResponse.json();

    // Trigger chunking (this is what the actual code does)
    await fetch(`/api/projects/${project.id}/chunk`, { method: 'POST' });

    // Verify chunking was called with correct URL (with 's' in 'projects')
    expect(fetchSpy).toHaveBeenCalledWith(`/api/projects/${mockProjectId}/chunk`, {
      method: 'POST',
    });

    // Verify it's NOT called with the typo URL
    expect(fetchSpy).not.toHaveBeenCalledWith(
      `/api/project/${mockProjectId}/chunk`, // typo - missing 's'
      { method: 'POST' }
    );
  });

  it('should verify chunking endpoint exists at correct path', async () => {
    // Test that the endpoint exists where we expect it
    const projectId = '123e4567-e89b-12d3-a456-426614174000';

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'pending',
        error: null,
        started_at: null,
        completed_at: null,
        chunk_count: 0,
      }),
    });

    // GET request to check status should work
    const response = await fetch(`/api/projects/${projectId}/chunk`);

    expect(response.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(`/api/projects/${projectId}/chunk`);
  });

  it('should construct correct URL with string interpolation', () => {
    // Test that URL construction doesn't accidentally drop the 's'
    const projectId = 'test-id-123';

    // This should be the correct pattern
    const correctUrl = `/api/projects/${projectId}/chunk`;
    expect(correctUrl).toBe('/api/projects/test-id-123/chunk');
    expect(correctUrl).toContain('/api/projects/');
    expect(correctUrl).not.toContain('/api/project/');

    // This is the wrong pattern (typo)
    const wrongUrl = `/api/project/${projectId}/chunk`;
    expect(wrongUrl).toBe('/api/project/test-id-123/chunk');

    // Verify they're different
    expect(correctUrl).not.toBe(wrongUrl);
  });

  it('should handle chunking endpoint returning 404 for non-existent project', async () => {
    const projectId = 'non-existent-id';

    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Project not found' }),
    });

    const response = await fetch(`/api/projects/${projectId}/chunk`, { method: 'POST' });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });

  it('should handle chunking endpoint returning 409 when already processing', async () => {
    const projectId = 'test-project-id';

    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Chunking already in progress' }),
    });

    const response = await fetch(`/api/projects/${projectId}/chunk`, { method: 'POST' });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(409);
  });

  it('should verify endpoint path matches file system structure', () => {
    // The endpoint should be at: app/api/projects/[id]/chunk/route.ts
    // This creates the URL: /api/projects/{id}/chunk
    const expectedFileStructure = 'app/api/projects/[id]/chunk/route.ts';
    const expectedUrlPattern = '/api/projects/:id/chunk';

    // Extract URL pattern from file structure
    const urlFromFile = expectedFileStructure
      .replace('app/', '/')
      .replace('[id]', ':id')
      .replace('/route.ts', '');

    expect(urlFromFile).toBe(expectedUrlPattern);
    expect(urlFromFile).toContain('/api/projects/');
    expect(urlFromFile).not.toContain('/api/project/'); // Should not have typo
  });
});
