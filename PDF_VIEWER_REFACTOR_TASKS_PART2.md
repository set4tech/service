# PDF Viewer & Hooks Refactoring - Task List (Part 2)

> **Continuation from:** `PDF_VIEWER_REFACTOR_TASKS.md`  
> **Tasks 3.2.2 through 6.4.2**

---

## Phase 3: Extract PDF Domain Logic (Continued)

### Task 3.2.2: Extract calibration calculation logic to pure functions

**File:** `lib/pdf/calibration-utils.ts` (new file)

**Complete Implementation:**
```typescript
import type { Calibration } from '@/hooks/useCalibration';

/**
 * Calculate real-world distance from pixel distance using page-size calibration.
 * 
 * This method uses architectural scale notation (e.g., "1/4" = 1'-0") combined
 * with the known print dimensions of the PDF.
 * 
 * @param pixelsDistance - Distance in CSS pixels
 * @param calibration - Calibration data with scale_notation and print dimensions
 * @param cssWidth - CSS width of the canvas (for pixel-to-print-inch conversion)
 * @returns Distance in inches, or null if calculation fails
 */
export function calculateRealDistancePageSize(
  pixelsDistance: number,
  calibration: {
    scale_notation: string;
    print_width_inches: number;
    print_height_inches: number;
    pdf_width_points: number;
  },
  cssWidth: number
): number | null {
  try {
    // Parse scale notation (e.g., "1/4" = 1'-0")
    const match = calibration.scale_notation.match(
      /^(\d+(?:\/\d+)?)"?\s*=\s*(\d+)'(?:-(\d+)"?)?$/
    );
    if (!match) return null;

    const [, paperInchStr, realFeetStr, realInchesStr] = match;

    // Parse paper inches (could be fraction like 1/8)
    let paperInches: number;
    if (paperInchStr.includes('/')) {
      const [num, denom] = paperInchStr.split('/').map(Number);
      paperInches = num / denom;
    } else {
      paperInches = parseFloat(paperInchStr);
    }

    // Parse real world measurement
    const realFeet = parseFloat(realFeetStr);
    const realInches = realInchesStr ? parseFloat(realInchesStr) : 0;
    const realTotalInches = realFeet * 12 + realInches;

    // Calculate conversion
    // CSS pixels to print inches (uses the fact that CSS width = print width)
    const pixelsPerPrintInch = cssWidth / calibration.print_width_inches;

    // Convert pixel distance to paper inches
    const paperInchesDistance = pixelsDistance / pixelsPerPrintInch;

    // Convert paper inches to real inches using architectural scale
    const scaleRatio = paperInches / realTotalInches; // paper inches per real inch
    const realInchesDistance = paperInchesDistance / scaleRatio;

    return realInchesDistance;
  } catch (error) {
    console.error('[calibration-utils] Page size calculation error:', error);
    return null;
  }
}

/**
 * Calculate real-world distance from pixel distance using known-length calibration.
 * 
 * This method uses a user-drawn line with a known real-world distance.
 * More intuitive than page-size method, works even if scale notation is unclear.
 * 
 * @param pixelsDistance - Distance in CSS pixels to convert
 * @param calibration - Calibration data with line endpoints and known distance
 * @returns Distance in inches, or null if calculation fails
 */
export function calculateRealDistanceKnownLength(
  pixelsDistance: number,
  calibration: {
    calibration_line_start: { x: number; y: number };
    calibration_line_end: { x: number; y: number };
    known_distance_inches: number;
  }
): number | null {
  try {
    // Calculate the calibration line length in pixels
    const dx = calibration.calibration_line_end.x - calibration.calibration_line_start.x;
    const dy = calibration.calibration_line_end.y - calibration.calibration_line_start.y;
    const calibrationLineLengthPixels = Math.sqrt(dx * dx + dy * dy);

    if (calibrationLineLengthPixels === 0) {
      console.warn('[calibration-utils] Calibration line has zero length');
      return null;
    }

    // pixels_per_inch = calibration line pixels / known distance inches
    const pixelsPerInch = calibrationLineLengthPixels / calibration.known_distance_inches;

    // Convert measurement pixels to real inches
    return pixelsDistance / pixelsPerInch;
  } catch (error) {
    console.error('[calibration-utils] Known length calculation error:', error);
    return null;
  }
}

/**
 * Calculate real-world distance using appropriate method based on calibration type.
 * 
 * @param pixelsDistance - Distance in CSS pixels
 * @param calibration - Calibration data (can be null)
 * @param cssWidth - CSS width of canvas (only needed for page-size method)
 * @returns Distance in inches, or null if no calibration or calculation fails
 */
export function calculateRealDistance(
  pixelsDistance: number,
  calibration: Calibration | null,
  cssWidth?: number
): number | null {
  if (!calibration) return null;

  // Try known-length method first (simpler, more direct)
  if (
    calibration.calibration_line_start &&
    calibration.calibration_line_end &&
    calibration.known_distance_inches
  ) {
    return calculateRealDistanceKnownLength(pixelsDistance, {
      calibration_line_start: calibration.calibration_line_start,
      calibration_line_end: calibration.calibration_line_end,
      known_distance_inches: calibration.known_distance_inches,
    });
  }

  // Fall back to page-size method
  if (
    calibration.scale_notation &&
    calibration.print_width_inches &&
    calibration.print_height_inches &&
    calibration.pdf_width_points &&
    cssWidth
  ) {
    return calculateRealDistancePageSize(
      pixelsDistance,
      {
        scale_notation: calibration.scale_notation,
        print_width_inches: calibration.print_width_inches,
        print_height_inches: calibration.print_height_inches,
        pdf_width_points: calibration.pdf_width_points,
      },
      cssWidth
    );
  }

  return null;
}

/**
 * Parse architectural scale notation into its components.
 * 
 * Supports formats like:
 * - "1/4" = 1'-0"
 * - "1/8" = 1'-0"
 * - "1" = 10'-0"
 * - "3/4" = 1'-6"
 * 
 * @param notation - Scale notation string
 * @returns Parsed components or null if invalid
 */
export function parseScaleNotation(notation: string): {
  paperInches: number;
  realInches: number;
} | null {
  const match = notation.match(/^(\d+(?:\/\d+)?)"?\s*=\s*(\d+)'(?:-(\d+)"?)?$/);
  if (!match) return null;

  const [, paperInchStr, realFeetStr, realInchesStr] = match;

  // Parse paper inches (could be fraction)
  let paperInches: number;
  if (paperInchStr.includes('/')) {
    const [num, denom] = paperInchStr.split('/').map(Number);
    paperInches = num / denom;
  } else {
    paperInches = parseFloat(paperInchStr);
  }

  // Parse real world measurement
  const realFeet = parseFloat(realFeetStr);
  const realInchesExtra = realInchesStr ? parseFloat(realInchesStr) : 0;
  const realInches = realFeet * 12 + realInchesExtra;

  return { paperInches, realInches };
}

/**
 * Format distance in inches to a human-readable string.
 * 
 * @param inches - Distance in inches
 * @param precision - Number of decimal places (default: 2)
 * @returns Formatted string like "5' 6.25"" or "14.5""
 */
export function formatDistance(inches: number, precision: number = 2): string {
  const feet = Math.floor(inches / 12);
  const remainingInches = inches % 12;

  if (feet > 0) {
    return `${feet}' ${remainingInches.toFixed(precision)}"`;
  }
  
  return `${inches.toFixed(precision)}"`;
}
```

---

### Task 3.2.3: Add tests for calibration utilities

**File:** `__tests__/lib/calibration-utils.test.ts` (new file)

**Complete Implementation:**
```typescript
import {
  calculateRealDistancePageSize,
  calculateRealDistanceKnownLength,
  calculateRealDistance,
  parseScaleNotation,
  formatDistance,
} from '@/lib/pdf/calibration-utils';

describe('calibration-utils', () => {
  describe('calculateRealDistanceKnownLength', () => {
    it('should calculate distance correctly', () => {
      const result = calculateRealDistanceKnownLength(200, {
        calibration_line_start: { x: 0, y: 0 },
        calibration_line_end: { x: 100, y: 0 },
        known_distance_inches: 48, // 4 feet
      });

      // 200 pixels, calibration is 100px = 48", so 200px = 96"
      expect(result).toBeCloseTo(96, 1);
    });

    it('should handle diagonal lines', () => {
      const result = calculateRealDistanceKnownLength(
        Math.sqrt(200), // ~14.14 pixels
        {
          calibration_line_start: { x: 0, y: 0 },
          calibration_line_end: { x: 10, y: 10 }, // Length = sqrt(200)
          known_distance_inches: 12, // 1 foot
        }
      );

      expect(result).toBeCloseTo(12, 1);
    });

    it('should return null for zero-length calibration line', () => {
      const result = calculateRealDistanceKnownLength(100, {
        calibration_line_start: { x: 0, y: 0 },
        calibration_line_end: { x: 0, y: 0 },
        known_distance_inches: 48,
      });

      expect(result).toBeNull();
    });
  });

  describe('calculateRealDistancePageSize', () => {
    it('should calculate 1/4" scale correctly', () => {
      // 1/4" = 1'-0" means 0.25" on paper = 12" in real life
      // Scale ratio: 0.25 / 12 = 0.0208333
      
      const result = calculateRealDistancePageSize(
        400, // pixels
        {
          scale_notation: '1/4" = 1\'-0"',
          print_width_inches: 11,
          print_height_inches: 8.5,
          pdf_width_points: 792,
        },
        792 // CSS width matches PDF points
      );

      // 400px / (792px / 11") = 5.55" on paper
      // 5.55" / 0.0208333 = 266.4" real = 22.2 feet
      expect(result).toBeCloseTo(266.4, 0);
    });

    it('should handle 1/8" scale', () => {
      const result = calculateRealDistancePageSize(
        200,
        {
          scale_notation: '1/8" = 1\'-0"',
          print_width_inches: 11,
          print_height_inches: 8.5,
          pdf_width_points: 792,
        },
        792
      );

      // 1/8" = 1'-0" means 0.125" on paper = 12" in real life
      // 200px / (792/11) = 2.78" on paper
      // 2.78" / (0.125/12) = 266.4" real
      expect(result).toBeCloseTo(266.4, 0);
    });

    it('should return null for invalid scale notation', () => {
      const result = calculateRealDistancePageSize(
        100,
        {
          scale_notation: 'invalid',
          print_width_inches: 11,
          print_height_inches: 8.5,
          pdf_width_points: 792,
        },
        792
      );

      expect(result).toBeNull();
    });
  });

  describe('calculateRealDistance', () => {
    it('should prefer known-length method', () => {
      const calibration = {
        id: '1',
        project_id: 'p1',
        page_number: 1,
        method: 'known-length' as const,
        calibration_line_start: { x: 0, y: 0 },
        calibration_line_end: { x: 100, y: 0 },
        known_distance_inches: 48,
        scale_notation: '1/4" = 1\'-0"',
        print_width_inches: 11,
        print_height_inches: 8.5,
        pdf_width_points: 792,
        created_at: new Date().toISOString(),
      };

      const result = calculateRealDistance(200, calibration, 792);

      // Should use known-length: 200px with 100px = 48" → 96"
      expect(result).toBeCloseTo(96, 1);
    });

    it('should fall back to page-size method', () => {
      const calibration = {
        id: '1',
        project_id: 'p1',
        page_number: 1,
        method: 'page-size' as const,
        scale_notation: '1/4" = 1\'-0"',
        print_width_inches: 11,
        print_height_inches: 8.5,
        pdf_width_points: 792,
        created_at: new Date().toISOString(),
      };

      const result = calculateRealDistance(400, calibration, 792);

      // Should use page-size method
      expect(result).toBeCloseTo(266.4, 0);
    });

    it('should return null with no calibration', () => {
      expect(calculateRealDistance(100, null)).toBeNull();
    });
  });

  describe('parseScaleNotation', () => {
    it('should parse 1/4" scale', () => {
      const result = parseScaleNotation('1/4" = 1\'-0"');
      expect(result).toEqual({
        paperInches: 0.25,
        realInches: 12,
      });
    });

    it('should parse 1/8" scale', () => {
      const result = parseScaleNotation('1/8" = 1\'-0"');
      expect(result).toEqual({
        paperInches: 0.125,
        realInches: 12,
      });
    });

    it('should parse scale with inches', () => {
      const result = parseScaleNotation('1/4" = 1\'-6"');
      expect(result).toEqual({
        paperInches: 0.25,
        realInches: 18,
      });
    });

    it('should handle whole numbers', () => {
      const result = parseScaleNotation('1" = 10\'-0"');
      expect(result).toEqual({
        paperInches: 1,
        realInches: 120,
      });
    });

    it('should return null for invalid format', () => {
      expect(parseScaleNotation('invalid')).toBeNull();
      expect(parseScaleNotation('1/4')).toBeNull();
      expect(parseScaleNotation('')).toBeNull();
    });
  });

  describe('formatDistance', () => {
    it('should format feet and inches', () => {
      expect(formatDistance(66)).toBe('5\' 6.00"');
      expect(formatDistance(18.5)).toBe('1\' 6.50"');
    });

    it('should format inches only', () => {
      expect(formatDistance(11.75)).toBe('11.75"');
      expect(formatDistance(3.5)).toBe('3.50"');
    });

    it('should respect precision', () => {
      expect(formatDistance(66, 1)).toBe('5\' 6.0"');
      expect(formatDistance(66, 3)).toBe('5\' 6.000"');
    });

    it('should handle zero', () => {
      expect(formatDistance(0)).toBe('0.00"');
    });
  });
});
```

---

### Task 3.2.4: Update `useCalibration` to use pure functions

**File:** `hooks/useCalibration.ts`

**FIND the `calculateRealDistance` callback (inside the hook):**
```typescript
const calculateRealDistance = useCallback(
  (pixelsDistance: number): number | null => {
    if (!calibration) return null;
    // ... 80 lines of calculation logic
  },
  [calibration]
);
```

**REPLACE with:**
```typescript
import { calculateRealDistance as calcDistance } from '@/lib/pdf/calibration-utils';

const calculateRealDistance = useCallback(
  (pixelsDistance: number, cssWidth?: number): number | null => {
    return calcDistance(pixelsDistance, calibration, cssWidth);
  },
  [calibration]
);
```

**Lines removed:** ~75

---

### Task 3.3.1: Create `hooks/usePdfDocument.ts`

**File:** `hooks/usePdfDocument.ts` (new file)

**Complete Implementation:**
```typescript
import { useState, useEffect } from 'react';
import { pdfjs } from 'react-pdf';
import type { HookReturn } from '@/lib/hooks/types';

interface PdfDocumentState {
  doc: any | null;
  page: any | null;
  numPages: number;
  loading: boolean;
  error: string | null;
}

interface PdfDocumentActions {
  setPage: (pageNumber: number) => void;
}

/**
 * Hook for loading and managing PDF.js document and page instances.
 * 
 * Features:
 * - Loads PDF document from presigned URL
 * - Loads specific page on demand
 * - Handles loading states and errors
 * - Automatic cleanup on unmount
 * 
 * @example
 * ```typescript
 * const pdf = usePdfDocument(presignedUrl, pageNumber);
 * 
 * if (pdf.state.loading) return <Spinner />;
 * if (pdf.state.error) return <Error message={pdf.state.error} />;
 * if (!pdf.state.page) return null;
 * 
 * // Render page
 * await page.render({ canvasContext: ctx, viewport });
 * ```
 */
export function usePdfDocument(
  presignedUrl: string | null,
  pageNumber: number
): HookReturn<PdfDocumentState, PdfDocumentActions> {
  const [doc, setDoc] = useState<any>(null);
  const [page, setPage] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load PDF document
  useEffect(() => {
    if (!presignedUrl) {
      setDoc(null);
      setNumPages(0);
      setPage(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const loadingTask = pdfjs.getDocument({
      url: presignedUrl,
      disableAutoFetch: false,
      disableStream: false,
      disableRange: false,
    });

    loadingTask.promise
      .then((document) => {
        if (cancelled) return;
        setDoc(document);
        setNumPages(document.numPages);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[usePdfDocument] Failed to load PDF:', err);
        setError(err.message || 'Failed to load PDF');
        setDoc(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      try {
        loadingTask.destroy();
      } catch (err) {
        // Ignore cleanup errors
      }
    };
  }, [presignedUrl]);

  // Track current page to avoid redundant loads
  const [currentPageNumber, setCurrentPageNumber] = useState<number | null>(null);

  // Load specific page
  useEffect(() => {
    if (!doc || !pageNumber) {
      setPage(null);
      return;
    }

    // Skip if we're already on this page
    if (currentPageNumber === pageNumber) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    doc
      .getPage(pageNumber)
      .then((p: any) => {
        if (cancelled) return;
        setPage(p);
        setCurrentPageNumber(pageNumber);
        setLoading(false);
      })
      .catch((err: any) => {
        if (cancelled) return;
        console.error('[usePdfDocument] Failed to load page:', err);
        setError(err.message || `Failed to load page ${pageNumber}`);
        setPage(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [doc, pageNumber, currentPageNumber]);

  // Reset page tracking when document changes
  useEffect(() => {
    setCurrentPageNumber(null);
  }, [doc]);

  return {
    state: {
      doc,
      page,
      numPages,
      loading,
      error,
    },
    actions: {
      setPage: setCurrentPageNumber,
    },
  };
}
```

**Lines extracted from PDFViewer:** ~80

---

### Task 3.3.2: Add tests for `usePdfDocument`

**File:** `__tests__/hooks/usePdfDocument.test.tsx` (new file)

**Complete Implementation:**
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { usePdfDocument } from '@/hooks/usePdfDocument';
import { pdfjs } from 'react-pdf';

// Mock PDF.js
jest.mock('react-pdf', () => ({
  pdfjs: {
    getDocument: jest.fn(),
  },
}));

describe('usePdfDocument', () => {
  const mockDocument = {
    numPages: 10,
    getPage: jest.fn(),
  };

  const mockPage = {
    pageNumber: 1,
    getViewport: jest.fn(),
    render: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load document successfully', async () => {
    const loadingTask = {
      promise: Promise.resolve(mockDocument),
      destroy: jest.fn(),
    };

    (pdfjs.getDocument as jest.Mock).mockReturnValue(loadingTask);
    mockDocument.getPage.mockResolvedValue(mockPage);

    const { result } = renderHook(() => usePdfDocument('https://example.com/test.pdf', 1));

    expect(result.current.state.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });

    expect(result.current.state.doc).toBe(mockDocument);
    expect(result.current.state.numPages).toBe(10);
    expect(result.current.state.page).toBe(mockPage);
  });

  it('should handle document load error', async () => {
    const loadingTask = {
      promise: Promise.reject(new Error('Load failed')),
      destroy: jest.fn(),
    };

    (pdfjs.getDocument as jest.Mock).mockReturnValue(loadingTask);

    const { result } = renderHook(() => usePdfDocument('https://example.com/test.pdf', 1));

    await waitFor(() => {
      expect(result.current.state.error).toBe('Load failed');
    });

    expect(result.current.state.doc).toBeNull();
  });

  it('should load different pages', async () => {
    const loadingTask = {
      promise: Promise.resolve(mockDocument),
      destroy: jest.fn(),
    };

    (pdfjs.getDocument as jest.Mock).mockReturnValue(loadingTask);
    
    const page1 = { ...mockPage, pageNumber: 1 };
    const page2 = { ...mockPage, pageNumber: 2 };
    
    mockDocument.getPage
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const { result, rerender } = renderHook(
      ({ pageNumber }) => usePdfDocument('https://example.com/test.pdf', pageNumber),
      { initialProps: { pageNumber: 1 } }
    );

    await waitFor(() => {
      expect(result.current.state.page).toBe(page1);
    });

    rerender({ pageNumber: 2 });

    await waitFor(() => {
      expect(result.current.state.page).toBe(page2);
    });

    expect(mockDocument.getPage).toHaveBeenCalledWith(1);
    expect(mockDocument.getPage).toHaveBeenCalledWith(2);
  });

  it('should cleanup on unmount', () => {
    const loadingTask = {
      promise: Promise.resolve(mockDocument),
      destroy: jest.fn(),
    };

    (pdfjs.getDocument as jest.Mock).mockReturnValue(loadingTask);

    const { unmount } = renderHook(() => usePdfDocument('https://example.com/test.pdf', 1));

    unmount();

    expect(loadingTask.destroy).toHaveBeenCalled();
  });

  it('should not load page for invalid page number', () => {
    const loadingTask = {
      promise: Promise.resolve(mockDocument),
      destroy: jest.fn(),
    };

    (pdfjs.getDocument as jest.Mock).mockReturnValue(loadingTask);

    const { result } = renderHook(() => usePdfDocument('https://example.com/test.pdf', 0));

    expect(mockDocument.getPage).not.toHaveBeenCalled();
  });
});
```

---

### Task 3.4.1: Create `hooks/usePdfLayers.ts`

**File:** `hooks/usePdfLayers.ts` (new file)

**Complete Implementation:**
```typescript
import { useState, useEffect, useCallback } from 'react';
import { usePersisted } from '@/lib/hooks/usePersisted';
import type { HookReturn } from '@/lib/hooks/types';

export interface PdfLayer {
  id: string;
  name: string;
  visible: boolean;
}

interface LayersState {
  layers: PdfLayer[];
  ocConfig: any | null;
  loading: boolean;
}

interface LayersActions {
  toggleLayer: (layerId: string) => void;
  setAllVisible: (visible: boolean) => void;
}

/**
 * Hook for managing PDF optional content layers (OCG).
 * 
 * Features:
 * - Loads layers from PDF document
 * - Persists layer visibility to localStorage
 * - Provides toggle functionality
 * - Can disable layers entirely
 * 
 * @example
 * ```typescript
 * const layers = usePdfLayers(pdfDoc, assessmentId, false);
 * 
 * // Toggle a layer
 * layers.actions.toggleLayer('layer-id-1');
 * 
 * // Hide all layers
 * layers.actions.setAllVisible(false);
 * 
 * // Render with layer config
 * await page.render({
 *   canvasContext: ctx,
 *   viewport,
 *   optionalContentConfigPromise: Promise.resolve(layers.state.ocConfig)
 * });
 * ```
 */
export function usePdfLayers(
  doc: any | null,
  assessmentId: string | undefined,
  disabled: boolean = false
): HookReturn<LayersState, LayersActions> {
  const [ocConfig, setOcConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Persist layer visibility (stored as Record<layerId, visible>)
  const [persistedVisibility, setPersistedVisibility] = usePersisted<Record<string, boolean>>(
    assessmentId ? `pdf-layers-${assessmentId}` : undefined,
    {}
  );

  const [layers, setLayers] = useState<PdfLayer[]>([]);

  // Load layers from document
  useEffect(() => {
    if (!doc || disabled) {
      setOcConfig(null);
      setLayers([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const cfg = await doc.getOptionalContentConfig();
        if (cancelled) return;

        if (!cfg) {
          setOcConfig(null);
          setLayers([]);
          setLoading(false);
          return;
        }

        // Build layer list
        const order = cfg.getOrder?.() || [];
        const initialLayers: PdfLayer[] = [];

        for (const id of order) {
          const group = cfg.getGroup?.(id);
          const layerId = String(id);
          
          // Check if we have saved visibility for this layer
          const savedVisibility = persistedVisibility[layerId];
          const visible = savedVisibility !== undefined ? savedVisibility : cfg.isVisible?.(id);

          // Apply saved visibility to config
          if (savedVisibility !== undefined) {
            try {
              cfg.setVisibility?.(id, visible);
            } catch (err) {
              console.warn('[usePdfLayers] Error setting layer visibility:', err);
            }
          }

          initialLayers.push({
            id: layerId,
            name: group?.name || `Layer ${id}`,
            visible,
          });
        }

        setOcConfig(cfg);
        setLayers(initialLayers);
        setLoading(false);
      } catch (err) {
        console.error('[usePdfLayers] Error loading layers:', err);
        if (!cancelled) {
          setOcConfig(null);
          setLayers([]);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, disabled, persistedVisibility]);

  const toggleLayer = useCallback(
    (layerId: string) => {
      setLayers((current) => {
        const updated = current.map((layer) =>
          layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
        );

        // Update OC config
        const layer = updated.find((l) => l.id === layerId);
        if (layer && ocConfig) {
          try {
            ocConfig.setVisibility?.(layerId, layer.visible);
          } catch (err) {
            console.warn('[usePdfLayers] Error toggling layer:', err);
          }
        }

        // Persist visibility
        const visibility: Record<string, boolean> = {};
        for (const l of updated) {
          visibility[l.id] = l.visible;
        }
        setPersistedVisibility(visibility);

        return updated;
      });
    },
    [ocConfig, setPersistedVisibility]
  );

  const setAllVisible = useCallback(
    (visible: boolean) => {
      setLayers((current) => {
        const updated = current.map((layer) => ({ ...layer, visible }));

        // Update all layers in OC config
        if (ocConfig) {
          for (const layer of updated) {
            try {
              ocConfig.setVisibility?.(layer.id, visible);
            } catch (err) {
              console.warn('[usePdfLayers] Error setting layer visibility:', err);
            }
          }
        }

        // Persist visibility
        const visibility: Record<string, boolean> = {};
        for (const l of updated) {
          visibility[l.id] = visible;
        }
        setPersistedVisibility(visibility);

        return updated;
      });
    },
    [ocConfig, setPersistedVisibility]
  );

  return {
    state: {
      layers,
      ocConfig,
      loading,
    },
    actions: {
      toggleLayer,
      setAllVisible,
    },
  };
}
```

**Lines extracted from PDFViewer:** ~80

---

### Task 3.5.1: Create `hooks/usePdfPersistence.ts`

**File:** `hooks/usePdfPersistence.ts` (new file)

**Complete Implementation:**
```typescript
import { usePersisted } from '@/lib/hooks/usePersisted';

export interface Transform {
  tx: number;
  ty: number;
  scale: number;
}

interface PdfPersistenceState {
  page: number;
  transform: Transform;
  showIndicators: boolean;
}

interface PdfPersistenceActions {
  setPage: (page: number) => void;
  setTransform: (transform: Transform) => void;
  setShowIndicators: (show: boolean) => void;
}

/**
 * Validate transform to ensure reasonable values.
 * Resets to default if scale is out of reasonable bounds (viewport changed).
 */
function validateTransform(t: Transform): Transform {
  // Valid scale should be 0.5-2.0 for reasonable zoom levels
  // Old saved transforms from when viewport scaled to 6-10x are invalid
  if (t.scale < 0.5 || t.scale > 2.0) {
    return { tx: 0, ty: 0, scale: 1 };
  }
  return t;
}

/**
 * Hook that consolidates all PDF viewer persistence.
 * 
 * Persists:
 * - Current page number
 * - View transform (pan/zoom)
 * - Screenshot indicators visibility
 * 
 * All values are stored in localStorage with debouncing.
 * 
 * @example
 * ```typescript
 * const persistence = usePdfPersistence(assessmentId);
 * 
 * // Read state
 * const { page, transform, showIndicators } = persistence.state;
 * 
 * // Update state (automatically persisted)
 * persistence.actions.setPage(2);
 * persistence.actions.setTransform({ tx: 100, ty: 50, scale: 1.5 });
 * ```
 */
export function usePdfPersistence(
  assessmentId: string | undefined
): {
  state: PdfPersistenceState;
  actions: PdfPersistenceActions;
} {
  const [page, setPage] = usePersisted<number>(
    assessmentId ? `pdf-page-${assessmentId}` : undefined,
    1
  );

  const [transform, setTransform] = usePersisted<Transform>(
    assessmentId ? `pdf-transform-${assessmentId}` : undefined,
    { tx: 0, ty: 0, scale: 1 },
    {
      validate: validateTransform,
      debounce: 500, // Debounce transform saves
    }
  );

  const [showIndicators, setShowIndicators] = usePersisted<boolean>(
    assessmentId ? `pdf-show-indicators-${assessmentId}` : undefined,
    true
  );

  return {
    state: {
      page,
      transform,
      showIndicators,
    },
    actions: {
      setPage,
      setTransform,
      setShowIndicators,
    },
  };
}
```

**Lines simplified:** ~50

---

### Task 3.6.1: Create `hooks/useViewTransform.ts`

**File:** `hooks/useViewTransform.ts` (new file)

**Complete Implementation:**
```typescript
import { useCallback, useEffect, RefObject } from 'react';
import type { Transform } from '@/hooks/usePdfPersistence';

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

interface ViewTransformActions {
  zoom: (direction: 'in' | 'out', pivot?: { x: number; y: number }) => void;
  reset: () => void;
  centerOn: (bounds: { x: number; y: number; width: number; height: number }) => void;
  attachWheelZoom: () => () => void;
}

/**
 * Hook for managing view transform (pan/zoom) on a PDF canvas.
 * 
 * Features:
 * - Zoom in/out with optional pivot point
 * - Wheel-based zoom centered at cursor
 * - Reset zoom
 * - Center view on specific bounds
 * 
 * @example
 * ```typescript
 * const transform = useViewTransform(
 *   viewportRef,
 *   persistence.state.transform,
 *   persistence.actions.setTransform
 * );
 * 
 * // Zoom centered at viewport center
 * transform.zoom('in');
 * 
 * // Center on violation bounds
 * transform.centerOn({ x: 100, y: 200, width: 50, height: 50 });
 * 
 * // Attach wheel zoom listener
 * useEffect(() => transform.attachWheelZoom(), []);
 * ```
 */
export function useViewTransform(
  containerRef: RefObject<HTMLElement>,
  transform: Transform,
  setTransform: (t: Transform) => void
): ViewTransformActions {
  const zoom = useCallback(
    (direction: 'in' | 'out', pivot?: { x: number; y: number }) => {
      const factor = direction === 'in' ? 1.2 : 1 / 1.2;
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, transform.scale * factor));

      const container = containerRef.current;
      if (!container || !pivot) {
        // No pivot or container, just change scale
        setTransform({ ...transform, scale: nextScale });
        return;
      }

      // Zoom with pivot point
      const rect = container.getBoundingClientRect();
      const sx = pivot.x - rect.left;
      const sy = pivot.y - rect.top;

      // Point in content coordinates
      const cx = (sx - transform.tx) / transform.scale;
      const cy = (sy - transform.ty) / transform.scale;

      // New transform to keep point under cursor
      setTransform({
        tx: sx - cx * nextScale,
        ty: sy - cy * nextScale,
        scale: nextScale,
      });
    },
    [containerRef, transform, setTransform]
  );

  const reset = useCallback(() => {
    setTransform({ tx: 0, ty: 0, scale: 1 });
  }, [setTransform]);

  const centerOn = useCallback(
    (bounds: { x: number; y: number; width: number; height: number }) => {
      const container = containerRef.current;
      if (!container) return;

      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;

      const viewportCenterX = container.clientWidth / 2;
      const viewportCenterY = container.clientHeight / 2;

      setTransform({
        ...transform,
        tx: viewportCenterX - centerX * transform.scale,
        ty: viewportCenterY - centerY * transform.scale,
      });
    },
    [containerRef, transform, setTransform]
  );

  const attachWheelZoom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return () => {};

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const prevScale = transform.scale;
      const nextScale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, prevScale * (1 - e.deltaY * 0.003))
      );

      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // Point in content coordinates
      const cx = (sx - transform.tx) / prevScale;
      const cy = (sy - transform.ty) / prevScale;

      setTransform({
        tx: sx - cx * nextScale,
        ty: sy - cy * nextScale,
        scale: nextScale,
      });
    };

    el.addEventListener('wheel', onWheel as EventListener, { passive: false });

    // Prevent pinch-to-zoom gestures
    const cancelGesture = (ev: Event) => ev.preventDefault();
    el.addEventListener('gesturestart', cancelGesture as EventListener, { passive: false });
    el.addEventListener('gesturechange', cancelGesture as EventListener, { passive: false });
    el.addEventListener('gestureend', cancelGesture as EventListener, { passive: false });

    return () => {
      el.removeEventListener('wheel', onWheel as EventListener);
      el.removeEventListener('gesturestart', cancelGesture as EventListener);
      el.removeEventListener('gesturechange', cancelGesture as EventListener);
      el.removeEventListener('gestureend', cancelGesture as EventListener);
    };
  }, [containerRef, transform, setTransform]);

  return {
    zoom,
    reset,
    centerOn,
    attachWheelZoom,
  };
}

/**
 * Convert screen coordinates to content coordinates.
 * 
 * @param transform - Current view transform
 * @param containerEl - Container element for coordinate calculation
 * @param clientX - Mouse/touch X coordinate
 * @param clientY - Mouse/touch Y coordinate
 * @returns Content coordinates
 */
export function screenToContent(
  transform: Transform,
  containerEl: HTMLElement | null,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  if (!containerEl) return { x: 0, y: 0 };

  const rect = containerEl.getBoundingClientRect();
  const x = (clientX - rect.left - transform.tx) / transform.scale;
  const y = (clientY - rect.top - transform.ty) / transform.scale;

  return { x, y };
}
```

**Lines extracted from PDFViewer:** ~150

---

### Task 3.6.2: Create transform utility functions

**File:** `lib/pdf/transform-utils.ts` (new file)

**Complete Implementation:**
```typescript
import type { Transform } from '@/hooks/usePdfPersistence';

/**
 * Calculate zoom factor from wheel delta.
 * Uses logarithmic scaling for smooth zooming.
 */
export function calculateZoomFactor(wheelDelta: number): number {
  return 1 - wheelDelta * 0.003;
}

/**
 * Clamp scale value to reasonable bounds.
 */
export function clampScale(scale: number, min: number = 0.1, max: number = 10): number {
  return Math.max(min, Math.min(max, scale));
}

/**
 * Calculate transform to zoom at a specific pivot point.
 * 
 * @param currentTransform - Current transform state
 * @param pivotScreen - Pivot point in screen coordinates (relative to container)
 * @param newScale - Target scale
 * @returns New transform with adjusted translation
 */
export function zoomAtPoint(
  currentTransform: Transform,
  pivotScreen: { x: number; y: number },
  newScale: number
): Transform {
  // Point in content coordinates (before zoom)
  const contentX = (pivotScreen.x - currentTransform.tx) / currentTransform.scale;
  const contentY = (pivotScreen.y - currentTransform.ty) / currentTransform.scale;

  // After zoom, we want the same content point to be under the cursor
  // screen = content * scale + tx
  // tx = screen - content * scale
  return {
    tx: pivotScreen.x - contentX * newScale,
    ty: pivotScreen.y - contentY * newScale,
    scale: newScale,
  };
}

/**
 * Calculate transform to center specific bounds in container.
 * 
 * @param containerSize - Container dimensions
 * @param bounds - Content bounds to center
 * @param currentScale - Current scale (preserved)
 * @returns Transform that centers the bounds
 */
export function centerBounds(
  containerSize: { width: number; height: number },
  bounds: { x: number; y: number; width: number; height: number },
  currentScale: number
): Transform {
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  const viewportCenterX = containerSize.width / 2;
  const viewportCenterY = containerSize.height / 2;

  return {
    tx: viewportCenterX - centerX * currentScale,
    ty: viewportCenterY - centerY * currentScale,
    scale: currentScale,
  };
}

/**
 * Calculate transform to fit content in container.
 * 
 * @param containerSize - Container dimensions
 * @param contentSize - Content dimensions
 * @param padding - Optional padding in pixels
 * @returns Transform that fits content
 */
export function fitContent(
  containerSize: { width: number; height: number },
  contentSize: { width: number; height: number },
  padding: number = 20
): Transform {
  const availableWidth = containerSize.width - padding * 2;
  const availableHeight = containerSize.height - padding * 2;

  const scaleX = availableWidth / contentSize.width;
  const scaleY = availableHeight / contentSize.height;
  const scale = Math.min(scaleX, scaleY, 1); // Don't zoom in, only fit

  const scaledWidth = contentSize.width * scale;
  const scaledHeight = contentSize.height * scale;

  return {
    tx: (containerSize.width - scaledWidth) / 2,
    ty: (containerSize.height - scaledHeight) / 2,
    scale,
  };
}
```

---

### Task 3.7.1: Create `hooks/useScreenshotCapture.ts`

**File:** `hooks/useScreenshotCapture.ts` (new file)

**Complete Implementation:**
```typescript
import { useCallback, useRef } from 'react';
import { captureCanvasRegion } from '@/lib/pdf/canvas-utils';
import { createElementInstance } from '@/lib/pdf/element-instance';
import { uploadScreenshot } from '@/lib/pdf/screenshot-upload';
import { extractTextFromRegion } from '@/lib/pdf-text-extraction';

export interface Selection {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export type CaptureTarget = 'current' | 'bathroom' | 'door' | 'kitchen';
export type ScreenshotType = 'plan' | 'elevation';

interface CaptureOptions {
  target: CaptureTarget;
  type: ScreenshotType;
  selection: Selection;
  elementGroupId?: string;
  caption?: string;
  pageNumber: number;
  zoomLevel: number;
}

interface ScreenshotCaptureParams {
  page: any;
  canvas: HTMLCanvasElement | null;
  ocConfig: any;
  renderScale: number;
  assessmentId?: string;
  activeCheck?: any;
  onCheckAdded?: (check: any) => void;
  onCheckSelect?: (id: string) => void;
  onScreenshotSaved?: (checkId: string) => void;
  refreshScreenshots: () => void;
}

/**
 * Hook for capturing screenshots from PDF canvas.
 * 
 * Orchestrates the full screenshot workflow:
 * 1. Create element instance (if needed)
 * 2. Render high-res region from PDF
 * 3. Upload to S3
 * 4. Save metadata to database
 * 5. Extract text (for elevations)
 * 6. Trigger refresh
 * 
 * @example
 * ```typescript
 * const { capture, capturing } = useScreenshotCapture({
 *   page,
 *   canvas: canvasRef.current,
 *   ocConfig,
 *   renderScale: 4,
 *   assessmentId,
 *   activeCheck,
 *   onScreenshotSaved: (id) => console.log('Saved:', id),
 *   refreshScreenshots
 * });
 * 
 * // Capture selection to current check
 * await capture({
 *   target: 'current',
 *   type: 'plan',
 *   selection: { startX: 100, startY: 200, endX: 300, endY: 400 },
 *   pageNumber: 1,
 *   zoomLevel: 1.5
 * });
 * ```
 */
export function useScreenshotCapture(params: ScreenshotCaptureParams) {
  const {
    page,
    canvas,
    ocConfig,
    renderScale,
    assessmentId,
    activeCheck,
    onCheckAdded,
    onCheckSelect,
    onScreenshotSaved,
    refreshScreenshots,
  } = params;

  const capturingRef = useRef(false);

  const capture = useCallback(
    async (options: CaptureOptions) => {
      const { target, type, selection, elementGroupId, caption, pageNumber, zoomLevel } = options;

      if (!page || !canvas) {
        throw new Error('Page or canvas not ready');
      }

      if (capturingRef.current) {
        console.warn('[useScreenshotCapture] Already capturing, skipping');
        return;
      }

      capturingRef.current = true;

      try {
        // Step 1: Determine target check ID
        let targetCheckId = activeCheck?.id;

        if (target !== 'current') {
          const newCheck = await createElementInstance(target, assessmentId);
          if (!newCheck) {
            throw new Error(`Failed to create ${target} instance`);
          }
          targetCheckId = newCheck.id;
          onCheckAdded?.(newCheck);
          onCheckSelect?.(newCheck.id);
        }

        if (!targetCheckId && type === 'plan') {
          throw new Error('No check selected');
        }

        // Step 2: Normalize selection bounds
        const sx = Math.min(selection.startX, selection.endX);
        const sy = Math.min(selection.startY, selection.endY);
        const sw = Math.abs(selection.endX - selection.startX);
        const sh = Math.abs(selection.endY - selection.startY);

        // Step 3: Capture high-res region from canvas
        const { full, thumbnail } = await captureCanvasRegion(
          page,
          canvas,
          { x: sx, y: sy, width: sw, height: sh },
          renderScale,
          ocConfig
        );

        // Step 4: Upload to S3
        const { screenshotUrl, thumbnailUrl } = await uploadScreenshot(
          full,
          thumbnail,
          activeCheck?.project_id || assessmentId,
          targetCheckId
        );

        // Step 5: Extract text for elevations
        let extractedText = '';
        if (type === 'elevation' && page) {
          extractedText = await extractTextFromRegion(page, {
            x: sx,
            y: sy,
            width: sw,
            height: sh,
          });
        }

        // Step 6: Save metadata
        await fetch('/api/screenshots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            check_id: type === 'plan' ? targetCheckId : null,
            page_number: pageNumber,
            crop_coordinates: {
              x: sx,
              y: sy,
              width: sw,
              height: sh,
              zoom_level: zoomLevel,
            },
            screenshot_url: screenshotUrl,
            thumbnail_url: thumbnailUrl,
            caption: caption || '',
            screenshot_type: type,
            element_group_id: elementGroupId || null,
            extracted_text: extractedText || null,
          }),
        });

        // Step 7: Notify and refresh
        onScreenshotSaved?.(targetCheckId!);
        refreshScreenshots();
      } finally {
        capturingRef.current = false;
      }
    },
    [
      page,
      canvas,
      ocConfig,
      renderScale,
      assessmentId,
      activeCheck,
      onCheckAdded,
      onCheckSelect,
      onScreenshotSaved,
      refreshScreenshots,
    ]
  );

  return {
    capture,
    capturing: capturingRef.current,
  };
}
```

**Lines extracted from PDFViewer:** ~180

---

### Task 3.7.2: Create element instance helper

**File:** `lib/pdf/element-instance.ts` (new file)

**Complete Implementation:**
```typescript
type ElementType = 'bathroom' | 'door' | 'kitchen';

const ELEMENT_GROUP_SLUGS: Record<ElementType, string> = {
  bathroom: 'bathrooms',
  door: 'doors',
  kitchen: 'kitchens',
};

/**
 * Create a new element instance check.
 * 
 * @param elementType - Type of element to create
 * @param assessmentId - Assessment ID to attach to
 * @returns Created check object or null if failed
 */
export async function createElementInstance(
  elementType: ElementType,
  assessmentId?: string
): Promise<any | null> {
  const slug = ELEMENT_GROUP_SLUGS[elementType];
  if (!slug || !assessmentId) {
    console.error('[createElementInstance] Missing slug or assessment ID');
    return null;
  }

  try {
    const response = await fetch(`/api/checks/create-element`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assessmentId,
        elementGroupSlug: slug,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[createElementInstance] API error:', error);
      return null;
    }

    const { check } = await response.json();
    return check;
  } catch (error) {
    console.error('[createElementInstance] Request failed:', error);
    return null;
  }
}
```

---

### Task 3.7.3: Create canvas utilities

**File:** `lib/pdf/canvas-utils.ts` (new file)

**Complete Implementation:**
```typescript
const MAX_CANVAS_SIDE = 16384;
const MAX_CANVAS_PIXELS = 268_000_000; // 16384^2

/**
 * Calculate safe rendering multiplier that respects canvas limits.
 * 
 * Canvas has hard limits:
 * - Max side: 16384px
 * - Max pixels: 268 million (16384²)
 * 
 * @param baseWidth - Base viewport width
 * @param baseHeight - Base viewport height
 * @param desiredMultiplier - Desired scale multiplier
 * @returns Safe multiplier that won't exceed limits
 */
export function getSafeRenderMultiplier(
  baseWidth: number,
  baseHeight: number,
  desiredMultiplier: number
): number {
  const maxBySide = Math.min(
    MAX_CANVAS_SIDE / baseWidth,
    MAX_CANVAS_SIDE / baseHeight
  );
  
  const maxByPixels = Math.sqrt(MAX_CANVAS_PIXELS / (baseWidth * baseHeight));
  
  const cap = Math.min(maxBySide, maxByPixels);
  
  return Math.max(1, Math.min(desiredMultiplier, cap));
}

/**
 * Render PDF page to canvas with specified scale.
 * 
 * @param page - PDF.js page object
 * @param canvas - Target canvas element
 * @param options - Rendering options
 * @returns Viewport information
 */
export async function renderPdfPage(
  page: any,
  canvas: HTMLCanvasElement,
  options: {
    scaleMultiplier: number;
    optionalContentConfig?: any;
  }
): Promise<{
  baseViewport: any;
  viewport: any;
  multiplier: number;
}> {
  const { scaleMultiplier, optionalContentConfig } = options;

  // Get base viewport
  const baseViewport = page.getViewport({ scale: 1 });

  // Calculate safe multiplier
  const safeMultiplier = getSafeRenderMultiplier(
    baseViewport.width,
    baseViewport.height,
    scaleMultiplier
  );

  // Create viewport at safe scale
  const viewport = page.getViewport({ scale: safeMultiplier });

  // Set canvas size (CSS = base, backing store = high-res)
  canvas.style.width = `${Math.ceil(baseViewport.width)}px`;
  canvas.style.height = `${Math.ceil(baseViewport.height)}px`;
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  // Get context and clear
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D context');

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // Render
  const renderParams: any = {
    canvasContext: ctx,
    viewport,
  };

  if (optionalContentConfig) {
    renderParams.optionalContentConfigPromise = Promise.resolve(optionalContentConfig);
  }

  await page.render(renderParams).promise;

  return { baseViewport, viewport, multiplier: safeMultiplier };
}

/**
 * Capture a region from a PDF page to blob.
 * 
 * @param page - PDF.js page object
 * @param sourceCanvas - Canvas with rendered page
 * @param region - Region to capture (in CSS pixels)
 * @param renderScale - Quality multiplier
 * @param ocConfig - Optional content config
 * @returns Full-size and thumbnail blobs
 */
export async function captureCanvasRegion(
  page: any,
  sourceCanvas: HTMLCanvasElement,
  region: { x: number; y: number; width: number; height: number },
  renderScale: number,
  ocConfig?: any
): Promise<{ full: Blob; thumbnail: Blob }> {
  // Calculate CSS-to-canvas ratio from source canvas
  const baseViewport = page.getViewport({ scale: 1 });
  const cssToCanvas = sourceCanvas.width / Math.ceil(baseViewport.width);

  // Convert region from CSS pixels to source canvas pixels
  const canvasSx = Math.floor(region.x * cssToCanvas);
  const canvasSy = Math.floor(region.y * cssToCanvas);
  const canvasSw = Math.max(1, Math.ceil(region.width * cssToCanvas));
  const canvasSh = Math.max(1, Math.ceil(region.height * cssToCanvas));

  // Render full page at high resolution
  const safeMultiplier = getSafeRenderMultiplier(
    baseViewport.width,
    baseViewport.height,
    renderScale
  );

  const viewport = page.getViewport({ scale: safeMultiplier });
  const offscreen = document.createElement('canvas');
  offscreen.width = Math.ceil(viewport.width);
  offscreen.height = Math.ceil(viewport.height);

  const ctx = offscreen.getContext('2d')!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, offscreen.width, offscreen.height);

  await page.render({
    canvasContext: ctx,
    viewport,
    ...(ocConfig && { optionalContentConfigPromise: Promise.resolve(ocConfig) }),
  }).promise;

  // Map source canvas coords to offscreen canvas coords
  const ratio = viewport.width / sourceCanvas.width;
  const rx = Math.max(0, Math.floor(canvasSx * ratio));
  const ry = Math.max(0, Math.floor(canvasSy * ratio));
  const rw = Math.max(1, Math.ceil(canvasSw * ratio));
  const rh = Math.max(1, Math.ceil(canvasSh * ratio));

  // Clamp to canvas bounds
  const cx = Math.min(rx, offscreen.width - 1);
  const cy = Math.min(ry, offscreen.height - 1);
  const cw = Math.min(rw, offscreen.width - cx);
  const ch = Math.min(rh, offscreen.height - cy);

  // Extract region
  const output = document.createElement('canvas');
  output.width = cw;
  output.height = ch;
  output.getContext('2d')!.drawImage(offscreen, cx, cy, cw, ch, 0, 0, cw, ch);

  // Create thumbnail (max 240px)
  const thumbMax = 240;
  const thumbRatio = Math.min(1, thumbMax / Math.max(cw, ch));
  const thumbWidth = Math.max(1, Math.round(cw * thumbRatio));
  const thumbHeight = Math.max(1, Math.round(ch * thumbRatio));

  const thumbnail = document.createElement('canvas');
  thumbnail.width = thumbWidth;
  thumbnail.height = thumbHeight;
  thumbnail.getContext('2d')!.drawImage(output, 0, 0, thumbWidth, thumbHeight);

  // Convert to blobs
  const [full, thumb] = await Promise.all([
    new Promise<Blob>((resolve) => output.toBlob((b) => resolve(b!), 'image/png')),
    new Promise<Blob>((resolve) => thumbnail.toBlob((b) => resolve(b!), 'image/png')),
  ]);

  return { full, thumb };
}
```

---

### Task 3.7.4: Create S3 upload helper

**File:** `lib/pdf/screenshot-upload.ts` (new file)

**Complete Implementation:**
```typescript
/**
 * Upload screenshot and thumbnail to S3.
 * 
 * @param fullImage - Full-size screenshot blob
 * @param thumbnail - Thumbnail blob
 * @param projectId - Project ID
 * @param checkId - Check ID
 * @returns S3 URLs for both images
 */
export async function uploadScreenshot(
  fullImage: Blob,
  thumbnail: Blob,
  projectId?: string,
  checkId?: string
): Promise<{
  screenshotUrl: string;
  thumbnailUrl: string;
}> {
  // Get presigned URLs
  const presignResponse = await fetch('/api/screenshots/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, checkId }),
  });

  if (!presignResponse.ok) {
    const error = await presignResponse.json();
    throw new Error(error.error || 'Failed to get presigned URLs');
  }

  const { uploadUrl, key, thumbUploadUrl, thumbKey } = await presignResponse.json();

  // Upload both images in parallel
  const [fullResponse, thumbResponse] = await Promise.all([
    fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: fullImage,
    }),
    fetch(thumbUploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: thumbnail,
    }),
  ]);

  if (!fullResponse.ok) {
    throw new Error(`Failed to upload screenshot: ${fullResponse.status}`);
  }

  if (!thumbResponse.ok) {
    throw new Error(`Failed to upload thumbnail: ${thumbResponse.status}`);
  }

  const bucketName = process.env.NEXT_PUBLIC_S3_BUCKET_NAME || 'bucket';

  return {
    screenshotUrl: `s3://${bucketName}/${key}`,
    thumbnailUrl: `s3://${bucketName}/${thumbKey}`,
  };
}
```

---

### Task 3.8.1: Create `hooks/usePresignedUrl.ts`

**File:** `hooks/usePresignedUrl.ts` (new file)

**Complete Implementation:**
```typescript
import { useState, useEffect } from 'react';

interface CacheEntry {
  url: string;
  expiresAt: number;
}

// Module-level cache (persists across component mounts)
const CACHE = new Map<string, CacheEntry>();
const INFLIGHT = new Map<string, Promise<string>>();
const CACHE_DURATION_MS = 50 * 60 * 1000; // 50 minutes

/**
 * Hook for fetching and caching presigned URLs for S3 objects.
 * 
 * Features:
 * - In-memory cache with expiration
 * - Request deduplication (multiple components requesting same URL)
 * - Automatic refresh before expiration
 * 
 * @example
 * ```typescript
 * const { url, loading, error } = usePresignedUrl('s3://bucket/file.pdf');
 * 
 * if (loading) return <Spinner />;
 * if (error) return <Error />;
 * if (!url) return null;
 * 
 * return <PDFViewer pdfUrl={url} />;
 * ```
 */
export function usePresignedUrl(originalUrl: string | null): {
  url: string | null;
  loading: boolean;
  error: string | null;
} {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!originalUrl);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!originalUrl) {
      setUrl(null);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);

      try {
        // Check cache first
        const cached = CACHE.get(originalUrl);
        if (cached && cached.expiresAt > Date.now()) {
          if (!cancelled) {
            setUrl(cached.url);
            setLoading(false);
          }
          return;
        }

        // Check if request is already in-flight
        let inflightPromise = INFLIGHT.get(originalUrl);
        
        if (!inflightPromise) {
          // Start new request
          inflightPromise = (async () => {
            const response = await fetch('/api/pdf/presign', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pdfUrl: originalUrl }),
            });

            if (!response.ok) {
              throw new Error(`Presign failed: ${response.status}`);
            }

            const data = await response.json();
            
            // Cache the result
            CACHE.set(originalUrl, {
              url: data.url,
              expiresAt: Date.now() + CACHE_DURATION_MS,
            });

            // Clear in-flight marker
            INFLIGHT.delete(originalUrl);

            return data.url;
          })();

          INFLIGHT.set(originalUrl, inflightPromise);
        }

        // Wait for promise (whether new or existing)
        const presignedUrl = await inflightPromise;
        
        if (!cancelled) {
          setUrl(presignedUrl);
          setLoading(false);
        }
      } catch (err) {
        console.error('[usePresignedUrl] Error:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load URL');
          setUrl(null);
          setLoading(false);
        }
        // Clean up in-flight on error
        INFLIGHT.delete(originalUrl);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [originalUrl]);

  return { url, loading, error };
}

/**
 * Clear the presigned URL cache.
 * Useful for testing or forcing refresh.
 */
export function clearPresignCache(): void {
  CACHE.clear();
  INFLIGHT.clear();
}

/**
 * Get cache statistics for debugging.
 */
export function getPresignCacheStats() {
  return {
    cached: CACHE.size,
    inflight: INFLIGHT.size,
    entries: Array.from(CACHE.entries()).map(([url, entry]) => ({
      url,
      expiresIn: Math.max(0, entry.expiresAt - Date.now()),
    })),
  };
}
```

**Lines extracted from PDFViewer:** ~90

---

## Phase 4: Refactor PDFViewer Component

### Task 4.1.1: Create PDF viewer types file

**File:** `components/pdf/types.ts` (new file)

**Complete Implementation:**
```typescript
/**
 * Selection bounds for screenshot/measurement drawing.
 */
export interface Selection {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/**
 * Discriminated union for viewer mode.
 * 
 * Using a discriminated union prevents impossible states like:
 * - Being in idle mode with an active selection
 * - Being in multiple modes at once
 * 
 * Each mode can have its own associated data.
 */
export type ViewerMode =
  | { type: 'idle' }
  | { type: 'screenshot'; selection: Selection | null }
  | { type: 'measure'; selection: Selection | null }
  | { type: 'calibrate'; selection: Selection | null };

/**
 * Helper type guards for mode checking.
 */
export function isScreenshotMode(mode: ViewerMode): mode is { type: 'screenshot'; selection: Selection | null } {
  return mode.type === 'screenshot';
}

export function isMeasureMode(mode: ViewerMode): mode is { type: 'measure'; selection: Selection | null } {
  return mode.type === 'measure';
}

export function isCalibrateMode(mode: ViewerMode): mode is { type: 'calibrate'; selection: Selection | null } {
  return mode.type === 'calibrate';
}

export function isInteractiveMode(mode: ViewerMode): boolean {
  return mode.type !== 'idle';
}

/**
 * Mode transitions.
 */
export function enterMode(type: 'screenshot' | 'measure' | 'calibrate'): ViewerMode {
  return { type, selection: null };
}

export function exitMode(): ViewerMode {
  return { type: 'idle' };
}

export function startSelection(mode: ViewerMode, x: number, y: number): ViewerMode {
  if (mode.type === 'idle') return mode;
  return { ...mode, selection: { startX: x, startY: y, endX: x, endY: y } };
}

export function updateSelection(mode: ViewerMode, x: number, y: number): ViewerMode {
  if (mode.type === 'idle' || !mode.selection) return mode;
  return { ...mode, selection: { ...mode.selection, endX: x, endY: y } };
}

export function clearSelection(mode: ViewerMode): ViewerMode {
  if (mode.type === 'idle') return mode;
  return { ...mode, selection: null };
}
```

---

### Task 4.1.2: Update PDFViewer reducer to use Mode union

**File:** `components/pdf/PDFViewer.tsx`

**FIND (lines 38-48, 56-141):**
```typescript
interface ViewerState {
  transform: { tx: number; ty: number; scale: number };
  pageNumber: number;
  numPages: number;
  isDragging: boolean;
  screenshotMode: boolean;
  measurementMode: boolean;
  calibrationMode: boolean;
  isSelecting: boolean;
  selection: { startX: number; startY: number; endX: number; endY: number } | null;
}

type ViewerAction =
  | { type: 'SET_TRANSFORM'; payload: ViewerState['transform'] }
  | { type: 'SET_PAGE'; payload: number }
  | { type: 'SET_NUM_PAGES'; payload: number }
  | { type: 'START_DRAG' }
  | { type: 'END_DRAG' }
  | { type: 'TOGGLE_SCREENSHOT_MODE' }
  | { type: 'TOGGLE_MEASUREMENT_MODE' }
  | { type: 'TOGGLE_CALIBRATION_MODE' }
  | { type: 'START_SELECTION'; payload: { x: number; y: number } }
  | { type: 'UPDATE_SELECTION'; payload: { x: number; y: number } }
  | { type: 'END_SELECTION' }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'RESET_ZOOM' };

function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case 'SET_TRANSFORM':
      return { ...state, transform: action.payload };
    case 'SET_PAGE':
      return {
        ...state,
        pageNumber: action.payload,
        selection: null,
        screenshotMode: false,
        measurementMode: false,
        calibrationMode: false,
      };
    case 'SET_NUM_PAGES':
      return { ...state, numPages: action.payload };
    case 'START_DRAG':
      return { ...state, isDragging: true };
    case 'END_DRAG':
      return { ...state, isDragging: false };
    case 'TOGGLE_SCREENSHOT_MODE':
      return {
        ...state,
        screenshotMode: !state.screenshotMode,
        measurementMode: false,
        calibrationMode: false,
        selection: null,
      };
    case 'TOGGLE_MEASUREMENT_MODE':
      return {
        ...state,
        measurementMode: !state.measurementMode,
        screenshotMode: false,
        calibrationMode: false,
        selection: null,
      };
    case 'TOGGLE_CALIBRATION_MODE':
      // Don't toggle calibration mode - it's handled by modal now
      return state;
    case 'START_SELECTION':
      return {
        ...state,
        isSelecting: true,
        selection: {
          startX: action.payload.x,
          startY: action.payload.y,
          endX: action.payload.x,
          endY: action.payload.y,
        },
      };
    case 'UPDATE_SELECTION':
      return state.selection
        ? {
            ...state,
            selection: { ...state.selection, endX: action.payload.x, endY: action.payload.y },
          }
        : state;
    case 'END_SELECTION':
      return { ...state, isSelecting: false };
    case 'CLEAR_SELECTION':
      return {
        ...state,
        selection: null,
        screenshotMode: false,
        measurementMode: false,
        calibrationMode: false,
      };
    case 'RESET_ZOOM':
      return { ...state, transform: { tx: 0, ty: 0, scale: 1 } };
    default:
      return state;
  }
}
```

**REPLACE with:**
```typescript
import {
  ViewerMode,
  enterMode,
  exitMode,
  startSelection,
  updateSelection,
  clearSelection,
} from './types';

interface ViewerState {
  pageNumber: number;
  numPages: number;
  isDragging: boolean;
  mode: ViewerMode;
}

type ViewerAction =
  | { type: 'SET_PAGE'; payload: number }
  | { type: 'SET_NUM_PAGES'; payload: number }
  | { type: 'START_DRAG' }
  | { type: 'END_DRAG' }
  | { type: 'SET_MODE'; payload: 'idle' | 'screenshot' | 'measure' | 'calibrate' }
  | { type: 'START_SELECTION'; payload: { x: number; y: number } }
  | { type: 'UPDATE_SELECTION'; payload: { x: number; y: number } }
  | { type: 'CLEAR_SELECTION' };

function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case 'SET_PAGE':
      return {
        ...state,
        pageNumber: action.payload,
        mode: exitMode(), // Reset to idle when changing pages
      };
    case 'SET_NUM_PAGES':
      return { ...state, numPages: action.payload };
    case 'START_DRAG':
      return { ...state, isDragging: true };
    case 'END_DRAG':
      return { ...state, isDragging: false };
    case 'SET_MODE':
      return {
        ...state,
        mode: action.payload === 'idle' ? exitMode() : enterMode(action.payload),
      };
    case 'START_SELECTION':
      return {
        ...state,
        mode: startSelection(state.mode, action.payload.x, action.payload.y),
      };
    case 'UPDATE_SELECTION':
      return {
        ...state,
        mode: updateSelection(state.mode, action.payload.x, action.payload.y),
      };
    case 'CLEAR_SELECTION':
      return {
        ...state,
        mode: clearSelection(state.mode),
      };
    default:
      return state;
  }
}
```

**Lines simplified:** ~40 (reducer is much simpler!)

---

Due to character limits, this file now has Tasks 3.2.2 through 4.1.2. The remaining tasks would continue with the same level of detail. Would you like me to:

1. Create a **PART 3** file with the remaining Phase 4 tasks (4.2.1 through 4.6.3)?
2. Create separate files for **Phase 5** (Testing) and **Phase 6** (Cleanup)?
3. Or consolidate what's left into one final file?

