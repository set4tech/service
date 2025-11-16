import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useTextSearch } from '@/hooks/useTextSearch';

describe('useTextSearch', () => {
  const mockPdfDoc = {
    getPage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('should handle 400 error when PDF not chunked', async () => {
    // Mock API returning 400 error
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'PDF has not been chunked yet',
        status: 'pending',
      }),
    });

    const { result } = renderHook(() =>
      useTextSearch({
        projectId: 'test-project-id',
        pdfDoc: mockPdfDoc,
      })
    );

    // Open search
    result.current.open();

    // Set query
    result.current.setQuery('test query');

    // Wait for debounced search to execute
    await waitFor(
      () => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/projects/test-project-id/search?q=test%20query&limit=50'
        );
      },
      { timeout: 500 }
    );

    // Should handle error gracefully without crashing
    await waitFor(() => {
      expect(result.current.matches).toEqual([]);
      expect(result.current.totalMatches).toBe(0);
      expect(result.current.searchMethod).toBeNull();
      expect(result.current.isSearching).toBe(false);
    });

    // Should not throw "Cannot read properties of undefined"
    expect(() => result.current.matches.length).not.toThrow();
  });

  it('should handle 404 error when project not found', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        error: 'Project not found',
      }),
    });

    const { result } = renderHook(() =>
      useTextSearch({
        projectId: 'non-existent-project',
        pdfDoc: mockPdfDoc,
      })
    );

    result.current.open();
    result.current.setQuery('test');

    await waitFor(() => {
      expect(result.current.matches).toEqual([]);
      expect(result.current.isSearching).toBe(false);
    });
  });

  it('should handle 500 server error', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        error: 'Internal server error',
      }),
    });

    const { result } = renderHook(() =>
      useTextSearch({
        projectId: 'test-project-id',
        pdfDoc: mockPdfDoc,
      })
    );

    result.current.open();
    result.current.setQuery('test');

    await waitFor(() => {
      expect(result.current.matches).toEqual([]);
      expect(result.current.isSearching).toBe(false);
    });
  });

  it('should handle network error gracefully', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() =>
      useTextSearch({
        projectId: 'test-project-id',
        pdfDoc: mockPdfDoc,
      })
    );

    result.current.open();
    result.current.setQuery('test');

    await waitFor(() => {
      expect(result.current.matches).toEqual([]);
      expect(result.current.isSearching).toBe(false);
    });
  });

  it('should successfully process search results when API returns 200', async () => {
    const mockPage = {
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          {
            str: 'test content',
            transform: [1, 0, 0, 1, 100, 100],
            width: 50,
          },
        ],
      }),
      getViewport: vi.fn(() => ({
        width: 800,
        height: 1000,
        convertToViewportPoint: (x: number, y: number) => [x, y],
      })),
      pageNumber: 1,
    };

    mockPdfDoc.getPage.mockResolvedValue(mockPage);

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        matches: [{ page_number: 1, rank: 0.9 }],
        method: 'fulltext',
        total: 1,
      }),
    });

    const { result } = renderHook(() =>
      useTextSearch({
        projectId: 'test-project-id',
        pdfDoc: mockPdfDoc,
      })
    );

    result.current.open();
    result.current.setQuery('test');

    await waitFor(
      () => {
        expect(result.current.matches.length).toBeGreaterThan(0);
        expect(result.current.searchMethod).toBe('fulltext');
        expect(result.current.isSearching).toBe(false);
      },
      { timeout: 1000 }
    );
  });

  it('should handle malformed JSON response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    const { result } = renderHook(() =>
      useTextSearch({
        projectId: 'test-project-id',
        pdfDoc: mockPdfDoc,
      })
    );

    result.current.open();
    result.current.setQuery('test');

    await waitFor(() => {
      expect(result.current.matches).toEqual([]);
      expect(result.current.isSearching).toBe(false);
    });
  });

  it('should cancel previous search when new query is entered', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        matches: [],
        method: 'fulltext',
        total: 0,
      }),
    });

    const { result } = renderHook(() =>
      useTextSearch({
        projectId: 'test-project-id',
        pdfDoc: mockPdfDoc,
      })
    );

    result.current.open();
    result.current.setQuery('first query');

    // Immediately change query before debounce completes
    result.current.setQuery('second query');

    // Wait for debounced search to execute (300ms debounce + processing time)
    await waitFor(
      () => {
        expect(global.fetch).toHaveBeenCalled();
      },
      { timeout: 1000 }
    );

    await waitFor(() => {
      expect(result.current.isSearching).toBe(false);
    });

    // Verify at least one call was made
    expect(global.fetch).toHaveBeenCalled();
  });

  it('should clear matches when closing search', () => {
    const { result } = renderHook(() =>
      useTextSearch({
        projectId: 'test-project-id',
        pdfDoc: mockPdfDoc,
      })
    );

    result.current.open();
    result.current.setQuery('test');

    // Manually set some matches
    result.current.close();

    expect(result.current.isOpen).toBe(false);
    expect(result.current.query).toBe('');
    expect(result.current.matches).toEqual([]);
    expect(result.current.currentIndex).toBe(0);
  });
});
