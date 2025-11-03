import { useState, useCallback, useEffect, useRef } from 'react';

export interface TextMatch {
  pageNumber: number;
  bounds: { x: number; y: number; width: number; height: number };
  text: string;
}

interface SearchResult {
  page_number: number;
  rank: number;
}

interface UseTextSearchOptions {
  projectId: string;
  pdfDoc: any; // PDF.js document
  onPageChange?: (page: number) => void;
}

export function useTextSearch({ projectId, pdfDoc, onPageChange }: UseTextSearchOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<TextMatch[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMethod, setSearchMethod] = useState<'fulltext' | 'fuzzy' | null>(null);

  // Use ref to track current search to avoid race conditions
  const searchIdRef = useRef(0);

  /**
   * Extract text content from a PDF page and find matching positions
   */
  const findMatchesOnPage = useCallback(
    async (page: any, searchQuery: string): Promise<TextMatch[]> => {
      try {
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        const pageMatches: TextMatch[] = [];

        // Create a case-insensitive regex for the query
        // Escape special regex characters except spaces
        const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegex = new RegExp(escapedQuery, 'gi');

        // Build full text from items to find matches
        let fullText = '';
        const itemPositions: Array<{ start: number; end: number; item: any }> = [];

        for (const item of textContent.items) {
          if (!('str' in item) || !('transform' in item)) continue;

          const startPos = fullText.length;
          fullText += item.str + ' ';
          const endPos = fullText.length;

          itemPositions.push({
            start: startPos,
            end: endPos,
            item,
          });
        }

        // Find all matches in the full text
        let match: RegExpExecArray | null;
        while ((match = searchRegex.exec(fullText)) !== null) {
          const matchStart = match.index;
          const matchEnd = matchStart + match[0].length;

          // Find which text items contain this match
          const relevantItems = itemPositions.filter(
            pos => pos.start <= matchEnd && pos.end >= matchStart
          );

          if (relevantItems.length === 0) continue;

          // Calculate bounding box for the match
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          for (const { item } of relevantItems) {
            const transform = item.transform;

            // Let PDF.js do the transformation for us
            const [x, y] = viewport.convertToViewportPoint(transform[4], transform[5]);

            // Calculate dimensions using the vector magnitudes
            const fontHeight = Math.sqrt(transform[2] ** 2 + transform[3] ** 2);
            const textWidth = item.width;

            minX = Math.min(minX, x);
            minY = Math.min(minY, y - fontHeight * 0.8);
            maxX = Math.max(maxX, x + textWidth);
            maxY = Math.max(maxY, y + fontHeight * 0.4);
          }

          // Add some padding
          const padding = 2;
          pageMatches.push({
            pageNumber: page.pageNumber,
            bounds: {
              x: minX - padding,
              y: minY - padding,
              width: maxX - minX + padding * 2,
              height: maxY - minY + padding * 2,
            },
            text: match[0],
          });
        }

        return pageMatches;
      } catch (error) {
        console.error('[useTextSearch] Error finding matches on page:', error);
        return [];
      }
    },
    []
  );

  /**
   * Perform search across the PDF
   */
  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim() || !pdfDoc) {
        setMatches([]);
        setCurrentIndex(0);
        setSearchMethod(null);
        return;
      }

      setIsSearching(true);
      const searchId = ++searchIdRef.current;

      try {
        // Call backend API to get matching pages
        const response = await fetch(
          `/api/projects/${projectId}/search?q=${encodeURIComponent(searchQuery)}&limit=50`
        );

        // Check if this search is still current
        if (searchId !== searchIdRef.current) {
          return;
        }

        if (!response.ok) {
          console.error('[useTextSearch] Search API error:', response.statusText);
          setMatches([]);
          setCurrentIndex(0);
          setSearchMethod(null);
          return;
        }

        const data: {
          matches: SearchResult[];
          method: 'fulltext' | 'fuzzy';
          total: number;
        } = await response.json();

        setSearchMethod(data.method);

        if (data.matches.length === 0) {
          setMatches([]);
          setCurrentIndex(0);
          return;
        }

        // Load pages and find exact match positions
        const allMatches: TextMatch[] = [];

        for (const result of data.matches) {
          // Check if search is still current
          if (searchId !== searchIdRef.current) {
            return;
          }

          try {
            const page = await pdfDoc.getPage(result.page_number);
            const pageMatches = await findMatchesOnPage(page, searchQuery);
            allMatches.push(...pageMatches);
          } catch (error) {
            console.error(`[useTextSearch] Error loading page ${result.page_number}:`, error);
          }
        }

        // Check one final time if this search is still current
        if (searchId !== searchIdRef.current) {
          return;
        }

        // Sort matches by page number
        allMatches.sort((a, b) => a.pageNumber - b.pageNumber);

        setMatches(allMatches);
        setCurrentIndex(0);

        // Navigate to first match
        if (allMatches.length > 0 && onPageChange) {
          onPageChange(allMatches[0].pageNumber);
        }
      } catch (error) {
        console.error('[useTextSearch] Search error:', error);
        setMatches([]);
        setCurrentIndex(0);
        setSearchMethod(null);
      } finally {
        if (searchId === searchIdRef.current) {
          setIsSearching(false);
        }
      }
    },
    [projectId, pdfDoc, findMatchesOnPage, onPageChange]
  );

  // Debounced search effect
  useEffect(() => {
    if (!isOpen || !query.trim()) {
      return;
    }

    const timeoutId = setTimeout(() => {
      performSearch(query);
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [query, isOpen, performSearch]);

  /**
   * Navigate to next match
   */
  const goToNext = useCallback(() => {
    if (matches.length === 0) return;

    const nextIndex = (currentIndex + 1) % matches.length;
    setCurrentIndex(nextIndex);

    const nextMatch = matches[nextIndex];
    if (onPageChange && nextMatch) {
      onPageChange(nextMatch.pageNumber);
    }
  }, [matches, currentIndex, onPageChange]);

  /**
   * Navigate to previous match
   */
  const goToPrev = useCallback(() => {
    if (matches.length === 0) return;

    const prevIndex = (currentIndex - 1 + matches.length) % matches.length;
    setCurrentIndex(prevIndex);

    const prevMatch = matches[prevIndex];
    if (onPageChange && prevMatch) {
      onPageChange(prevMatch.pageNumber);
    }
  }, [matches, currentIndex, onPageChange]);

  /**
   * Open search
   */
  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  /**
   * Close search and clear state
   */
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setMatches([]);
    setCurrentIndex(0);
    setSearchMethod(null);
    searchIdRef.current++; // Cancel any in-flight searches
  }, []);

  return {
    isOpen,
    query,
    setQuery,
    matches,
    currentIndex,
    totalMatches: matches.length,
    isSearching,
    searchMethod,
    goToNext,
    goToPrev,
    open,
    close,
  };
}
