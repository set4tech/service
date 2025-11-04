# PDF Viewer & Hooks Refactoring - Task List (Part 3)

> **Continuation from:** `PDF_VIEWER_REFACTOR_TASKS_PART2.md`  
> **Tasks 4.2.1 through 6.4.2**

---

## Phase 4: Refactor PDFViewer Component (Continued)

### Task 4.2.1: Replace presigned URL logic with `usePresignedUrl`

**File:** `components/pdf/PDFViewer.tsx`

**FIND and DELETE (lines 31-36, 511-580):**
```typescript
// In-memory cache for presigned URLs (valid for 50 minutes to be safe)
const PRESIGN_CACHE = new Map<string, { url: string; expiresAt: number }>();
const CACHE_DURATION_MS = 50 * 60 * 1000; // 50 minutes

// In-flight request deduplication
const PRESIGN_INFLIGHT = new Map<string, Promise<string>>();

// ... later in component:

const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
const [loadingUrl, setLoadingUrl] = useState(true);

// Fetch presigned URL and saved render scale
useEffect(() => {
  let cancelled = false;
  (async () => {
    setLoadingUrl(true);
    try {
      // Check cache first
      const cached = PRESIGN_CACHE.get(pdfUrl);
      if (cached && cached.expiresAt > Date.now()) {
        if (!cancelled) setPresignedUrl(cached.url);
        if (!cancelled) setLoadingUrl(false);
        return;
      }

      // Check if request is already in-flight
      let inflightPromise = PRESIGN_INFLIGHT.get(pdfUrl);
      if (!inflightPromise) {
        inflightPromise = (async () => {
          const presign = await fetch('/api/pdf/presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pdfUrl }),
          });
          if (!presign.ok) throw new Error(`presign ${presign.status}`);
          const { url } = await presign.json();

          // Cache the result
          PRESIGN_CACHE.set(pdfUrl, {
            url,
            expiresAt: Date.now() + CACHE_DURATION_MS,
          });

          // Clear in-flight marker
          PRESIGN_INFLIGHT.delete(pdfUrl);

          return url;
        })();

        PRESIGN_INFLIGHT.set(pdfUrl, inflightPromise);
      }

      const url = await inflightPromise;
      if (!cancelled) setPresignedUrl(url);
    } catch {
      if (!cancelled) setPresignedUrl(null);
      PRESIGN_INFLIGHT.delete(pdfUrl);
    } finally {
      if (!cancelled) setLoadingUrl(false);
    }

    // ... render scale loading continues below
  })();
  return () => {
    cancelled = true;
  };
}, [pdfUrl, assessmentId, readOnly]);
```

**REPLACE with:**
```typescript
import { usePresignedUrl } from '@/hooks/usePresignedUrl';

// Inside component:
const { url: presignedUrl, loading: loadingUrl, error: presignError } = usePresignedUrl(pdfUrl);
```

**Lines removed:** ~70

---

### Task 4.2.2: Replace PDF document logic with `usePdfDocument`

**File:** `components/pdf/PDFViewer.tsx`

**FIND and DELETE (lines 238-243, 583-644):**
```typescript
// Core PDF state
const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
const [loadingUrl, setLoadingUrl] = useState(true);
const [pdfDoc, setPdfDoc] = useState<any>(null);
const [page, setPage] = useState<any>(null);
const [ocConfig, setOcConfig] = useState<any>(null);

// ... later:

// Load PDF document via pdfjs directly
useEffect(() => {
  if (!presignedUrl) return;
  let cancelled = false;
  (async () => {
    const loadingTask = pdfjs.getDocument({
      url: presignedUrl,
      disableAutoFetch: false,
      disableStream: false,
      disableRange: false,
    });

    try {
      const doc = await loadingTask.promise;
      if (cancelled) return;
      setPdfDoc(doc);
      setPage(null);
      setOcConfig(null);
      setLayers([]);
      dispatch({ type: 'SET_NUM_PAGES', payload: doc.numPages });
    } catch (error) {
      console.error('[PDFViewer] Failed to load PDF:', error);
      if (!cancelled) setPdfDoc(null);
    }
  })();
  return () => {
    cancelled = true;
  };
}, [presignedUrl]);

// Track current page number to avoid redundant loads
const currentPageNumRef = useRef<number | null>(null);

// Reset page tracking when PDF document changes
useEffect(() => {
  currentPageNumRef.current = null;
}, [pdfDoc]);

// Load current page proxy
useEffect(() => {
  if (!pdfDoc) return;

  // Skip if we're already on this page
  if (currentPageNumRef.current === state.pageNumber) {
    return;
  }

  let cancelled = false;
  (async () => {
    try {
      const p = await pdfDoc.getPage(state.pageNumber);
      if (cancelled) return;
      currentPageNumRef.current = state.pageNumber;
      setPage(p);
    } catch {
      if (!cancelled) setPage(null);
    }
  })();
  return () => {
    cancelled = true;
  };
}, [pdfDoc, state.pageNumber]);
```

**REPLACE with:**
```typescript
import { usePdfDocument } from '@/hooks/usePdfDocument';

// Inside component:
const pdf = usePdfDocument(presignedUrl, state.pageNumber);
const { doc: pdfDoc, page, numPages, loading: loadingPdf } = pdf.state;

// Update numPages in state when it changes
useEffect(() => {
  if (numPages > 0) {
    dispatch({ type: 'SET_NUM_PAGES', payload: numPages });
  }
}, [numPages]);
```

**Lines removed:** ~60

---

### Task 4.2.3: Replace layer logic with `usePdfLayers`

**File:** `components/pdf/PDFViewer.tsx`

**FIND and DELETE (lines 246-248, 731-803, 1431-1442):**
```typescript
// UI state
const [layers, setLayers] = useState<PDFLayer[]>([]);
const [layersVersion, setLayersVersion] = useState(0);
const [showLayerPanel, setShowLayerPanel] = useState(false);

// ... later:

// Extract optional content config and layers, restore visibility before first paint
useEffect(() => {
  if (!pdfDoc) return;

  // Skip loading layers entirely if disabled
  if (disableLayers) {
    setOcConfig(null);
    setLayers([]);
    setLayersVersion(v => v + 1);
    return;
  }

  let cancelled = false;
  (async () => {
    try {
      const cfg = await pdfDoc.getOptionalContentConfig();
      if (cancelled) return;

      // No OCGs: still render through our canvas path
      if (!cfg) {
        setOcConfig(null);
        setLayers([]);
        return;
      }

      // Build layer list
      const order = cfg.getOrder?.() || [];
      const initialLayers: PDFLayer[] = [];
      for (const id of order) {
        const group = cfg.getGroup?.(id);
        initialLayers.push({
          id: String(id),
          name: group?.name || `Layer ${id}`,
          visible: cfg.isVisible?.(id),
        });
      }

      // Restore saved visibility (if any)
      if (assessmentId && typeof window !== 'undefined') {
        const raw = localStorage.getItem(`pdf-layers-${assessmentId}`);
        if (raw) {
          try {
            const saved = JSON.parse(raw) as Record<string, boolean>;
            for (const layer of initialLayers) {
              if (Object.prototype.hasOwnProperty.call(saved, layer.id)) {
                layer.visible = !!saved[layer.id];
                try {
                  cfg.setVisibility?.(layer.id, layer.visible);
                } catch {
                  // ignore per-id errors
                }
              }
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      setOcConfig(cfg);
      setLayers(initialLayers);
      setLayersVersion(v => v + 1);
    } catch {
      // No layers or error: fall back to default render via our canvas
      setOcConfig(null);
      setLayers([]);
      setLayersVersion(v => v + 1);
    }
  })();
  return () => {
    cancelled = true;
  };
}, [pdfDoc, assessmentId, disableLayers]);

// ... and later:

const toggleLayer = useCallback(
  async (layerId: string) => {
    if (!page) return;
    setLayers(prev => {
      const next = prev.map(l => (l.id === layerId ? { ...l, visible: !l.visible } : l));
      return next;
    });
    setLayersVersion(v => v + 1);
    // renderPage will be called automatically by the useEffect when layersVersion changes
  },
  [page]
);
```

**REPLACE with:**
```typescript
import { usePdfLayers } from '@/hooks/usePdfLayers';

// Inside component:
const layers = usePdfLayers(pdfDoc, assessmentId, disableLayers);
const { layers: layerList, ocConfig } = layers.state;
const { toggleLayer } = layers.actions;

const [showLayerPanel, setShowLayerPanel] = useState(false);
```

**Lines removed:** ~80

---

### Task 4.2.4: Replace persistence logic with `usePdfPersistence`

**File:** `components/pdf/PDFViewer.tsx`

**FIND and DELETE (lines 194-509):**
```typescript
const getSaved = useCallback(
  <T,>(key: string, fallback: T, parser: (s: string) => T) => {
    if (typeof window === 'undefined' || !assessmentId) return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
      return parser(raw);
    } catch {
      return fallback;
    }
  },
  [assessmentId]
);

// Initial state from storage with validation
const savedTransform = getSaved(`pdf-transform-${assessmentId}`, { tx: 0, ty: 0, scale: 1 }, s =>
  JSON.parse(s)
);

// Viewport is now always at 1x (renderScale only affects canvas quality)
// Old saved transforms from when viewport scaled to 6-10x are invalid
// Valid scale should be 0.5-2.0 for reasonable zoom levels
const validatedTransform =
  savedTransform.scale < 0.5 || savedTransform.scale > 2.0
    ? { tx: 0, ty: 0, scale: 1 }
    : savedTransform;

const [state, dispatch] = useReducer(viewerReducer, {
  transform: validatedTransform,
  pageNumber: getSaved(`pdf-page-${assessmentId}`, 1, s => parseInt(s, 10) || 1),
  numPages: 0,
  isDragging: false,
  screenshotMode: false,
  measurementMode: false,
  calibrationMode: false,
  isSelecting: false,
  selection: null,
});

// ... later:

// Notify parent + persist page number
useEffect(() => {
  onPageChangeRef.current?.(state.pageNumber);
  if (assessmentId && typeof window !== 'undefined') {
    localStorage.setItem(`pdf-page-${assessmentId}`, String(state.pageNumber));
  }
}, [state.pageNumber, assessmentId]);

// Debounced transform persistence
useEffect(() => {
  if (!assessmentId || typeof window === 'undefined') return;
  if (transformSaveTimer.current) {
    window.clearTimeout(transformSaveTimer.current);
  }
  transformSaveTimer.current = window.setTimeout(() => {
    localStorage.setItem(`pdf-transform-${assessmentId}`, JSON.stringify(state.transform));
    transformSaveTimer.current = null;
  }, TRANSFORM_SAVE_DEBOUNCE_MS);
  return () => {
    if (transformSaveTimer.current) {
      window.clearTimeout(transformSaveTimer.current);
      transformSaveTimer.current = null;
    }
  };
}, [state.transform, assessmentId]);

// Persist layer visibility
useEffect(() => {
  if (!assessmentId || typeof window === 'undefined' || layers.length === 0) return;
  const map: Record<string, boolean> = {};
  for (const l of layers) map[l.id] = l.visible;
  localStorage.setItem(`pdf-layers-${assessmentId}`, JSON.stringify(map));
}, [layers, assessmentId]);

// Persist screenshot indicators toggle
useEffect(() => {
  if (!assessmentId || typeof window === 'undefined' || readOnly) return;
  localStorage.setItem(`pdf-show-indicators-${assessmentId}`, String(showScreenshotIndicators));
}, [showScreenshotIndicators, assessmentId, readOnly]);

// Screenshot indicators state
const [showScreenshotIndicators, setShowScreenshotIndicators] = useState(() => {
  if (typeof window === 'undefined' || !assessmentId || readOnly) return false;
  const saved = localStorage.getItem(`pdf-show-indicators-${assessmentId}`);
  return saved === null ? true : saved === 'true'; // Default to true
});
```

**REPLACE with:**
```typescript
import { usePdfPersistence } from '@/hooks/usePdfPersistence';

// Inside component:
const persistence = usePdfPersistence(assessmentId);

// Initialize reducer with persisted page
const [state, dispatch] = useReducer(viewerReducer, {
  pageNumber: persistence.state.page,
  numPages: 0,
  isDragging: false,
  mode: { type: 'idle' },
});

// Sync page changes with persistence
useEffect(() => {
  if (state.pageNumber !== persistence.state.page) {
    persistence.actions.setPage(state.pageNumber);
  }
}, [state.pageNumber, persistence.state.page, persistence.actions]);

// Notify parent of page changes
useEffect(() => {
  onPageChangeRef.current?.(state.pageNumber);
}, [state.pageNumber]);

// Transform is now managed separately
const transform = persistence.state.transform;
const setTransform = persistence.actions.setTransform;

// Screenshot indicators
const showScreenshotIndicators = persistence.state.showIndicators;
const setShowScreenshotIndicators = persistence.actions.setShowIndicators;
```

**Lines removed:** ~80

---

### Task 4.2.5: Replace transform logic with `useViewTransform`

**File:** `components/pdf/PDFViewer.tsx`

**FIND and DELETE (lines 927-983, 1339-1348):**
```typescript
// Wheel zoom centred at pointer
useEffect(() => {
  const el = viewportRef.current;
  if (!el) return;
  const onWheel = (e: WheelEvent) => {
    if (state.screenshotMode) return;
    e.preventDefault();
    const prev = state.transform;
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * (1 - e.deltaY * 0.003)));

    const rect = el.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const cx = (sx - prev.tx) / prev.scale;
    const cy = (sy - prev.ty) / prev.scale;

    const tx = sx - cx * next;
    const ty = sy - cy * next;
    dispatch({ type: 'SET_TRANSFORM', payload: { tx, ty, scale: next } });
  };
  el.addEventListener('wheel', onWheel, { passive: false });

  const cancel = (ev: Event) => ev.preventDefault();
  el.addEventListener('gesturestart', cancel as EventListener, { passive: false });
  el.addEventListener('gesturechange', cancel as EventListener, { passive: false });
  el.addEventListener('gestureend', cancel as EventListener, { passive: false });

  return () => {
    el.removeEventListener('wheel', onWheel as EventListener);
    el.removeEventListener('gesturestart', cancel as EventListener);
    el.removeEventListener('gesturechange', cancel as EventListener);
    el.removeEventListener('gestureend', cancel as EventListener);
  };
}, [state.screenshotMode, state.transform]);

// Toolbar zoom buttons
const zoom = useCallback(
  (dir: 'in' | 'out') => {
    const factor = dir === 'in' ? 1.2 : 1 / 1.2;
    const prev = state.transform;
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor));
    const el = viewportRef.current;
    if (!el) {
      dispatch({ type: 'SET_TRANSFORM', payload: { ...prev, scale: next } });
      return;
    }
    const rect = el.getBoundingClientRect();
    const sx = rect.width / 2;
    const sy = rect.height / 2;
    const cx = (sx - prev.tx) / prev.scale;
    const cy = (sy - prev.ty) / prev.scale;
    const tx = sx - cx * next;
    const ty = sy - cy * next;
    dispatch({ type: 'SET_TRANSFORM', payload: { tx, ty, scale: next } });
  },
  [state.transform]
);

// ... and later:

const screenToContent = useCallback(
  (clientX: number, clientY: number) => {
    if (!viewportRef.current) return { x: 0, y: 0 };
    const r = viewportRef.current.getBoundingClientRect();
    const x = (clientX - r.left - state.transform.tx) / state.transform.scale;
    const y = (clientY - r.top - state.transform.ty) / state.transform.scale;
    return { x, y };
  },
  [state.transform]
);
```

**REPLACE with:**
```typescript
import { useViewTransform, screenToContent } from '@/hooks/useViewTransform';

// Inside component:
const viewTransform = useViewTransform(
  viewportRef,
  transform,
  setTransform
);

// Attach wheel zoom
useEffect(() => {
  if (state.mode.type === 'screenshot') return () => {};
  return viewTransform.attachWheelZoom();
}, [state.mode.type, viewTransform]);

// Use actions
const zoom = (dir: 'in' | 'out') => viewTransform.zoom(dir);

// screenToContent is now imported, call it with transform
const toContent = (clientX: number, clientY: number) =>
  screenToContent(transform, viewportRef.current, clientX, clientY);
```

**Lines removed:** ~100

---

### Task 4.2.6: Replace measurements logic with `useMeasurements`

**File:** `components/pdf/PDFViewer.tsx`

**FIND and DELETE (lines 255-257, 647-692, 1066-1118):**
```typescript
// Measurement state
const [measurements, setMeasurements] = useState<Measurement[]>([]);
const [calibration, setCalibration] = useState<any | null>(null);
const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);

// ... later:

// Load measurements for current page
useEffect(() => {
  if (!projectId || readOnly) return;

  let cancelled = false;
  (async () => {
    try {
      const res = await fetch(
        `/api/measurements?projectId=${projectId}&pageNumber=${state.pageNumber}`
      );
      if (!res.ok) throw new Error('Failed to fetch measurements');
      const data = await res.json();
      if (!cancelled) setMeasurements(data.measurements || []);
    } catch (error) {
      console.error('[PDFViewer] Error loading measurements:', error);
      if (!cancelled) setMeasurements([]);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [projectId, state.pageNumber, readOnly]);

// ... and later:

// Measurement handlers
const saveMeasurement = useCallback(
  async (selection: any) => {
    if (!projectId || !selection) return;

    const dx = selection.endX - selection.startX;
    const dy = selection.endY - selection.startY;
    const pixelsDistance = Math.sqrt(dx * dx + dy * dy);

    // Calculate real distance using scale notation and PDF dimensions
    const realDistanceInches = calculateRealDistance(pixelsDistance);

    try {
      const res = await fetch('/api/measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          page_number: state.pageNumber,
          start_point: { x: selection.startX, y: selection.startY },
          end_point: { x: selection.endX, y: selection.endY },
          pixels_distance: pixelsDistance,
          real_distance_inches: realDistanceInches,
        }),
      });

      if (!res.ok) throw new Error('Failed to save measurement');

      const data = await res.json();
      setMeasurements(prev => [...prev, data.measurement]);
      dispatch({ type: 'CLEAR_SELECTION' });
    } catch (error) {
      console.error('[PDFViewer] Error saving measurement:', error);
      alert('Failed to save measurement');
    }
  },
  [projectId, state.pageNumber, calculateRealDistance]
);

const deleteMeasurement = useCallback(async (measurementId: string) => {
  try {
    const res = await fetch(`/api/measurements?id=${measurementId}`, {
      method: 'DELETE',
    });

    if (!res.ok) throw new Error('Failed to delete measurement');

    setMeasurements(prev => prev.filter(m => m.id !== measurementId));
    setSelectedMeasurementId(null);
  } catch (error) {
    console.error('[PDFViewer] Error deleting measurement:', error);
    alert('Failed to delete measurement');
  }
}, []);
```

**REPLACE with:**
```typescript
import { useMeasurements } from '@/hooks/useMeasurements';

// Inside component:
const measurements = useMeasurements(readOnly ? undefined : projectId, state.pageNumber);
```

**Lines removed:** ~90

---

### Task 4.2.7: Replace calibration logic with `useCalibration`

**File:** `components/pdf/PDFViewer.tsx`

**FIND and DELETE (lines 671-692, 989-1063, 1120-1210):**
```typescript
// Load calibration for current page
useEffect(() => {
  if (!projectId || readOnly) return;

  let cancelled = false;
  (async () => {
    try {
      const res = await fetch(
        `/api/measurements/calibrate?projectId=${projectId}&pageNumber=${state.pageNumber}`
      );
      if (!res.ok) throw new Error('Failed to fetch calibration');
      const data = await res.json();
      if (!cancelled) setCalibration(data.calibration || null);
    } catch (error) {
      console.error('[PDFViewer] Error loading calibration:', error);
      if (!cancelled) setCalibration(null);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [projectId, state.pageNumber, readOnly]);

// ... and later:

// Helper to calculate real distance from pixels using calibration
const calculateRealDistance = useCallback(
  (pixelsDistance: number): number | null => {
    if (!calibration) return null;
    // ... 80 lines of calculation logic
  },
  [calibration]
);

// ... and later:

const saveCalibration = useCallback(
  async (scaleNotation: string, printWidth: number, printHeight: number) => {
    if (!projectId || !page) return;

    try {
      const viewport = page.getViewport({ scale: 1 });

      const res = await fetch('/api/measurements/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          page_number: state.pageNumber,
          method: 'page-size',
          scale_notation: scaleNotation,
          print_width_inches: printWidth,
          print_height_inches: printHeight,
          pdf_width_points: viewport.width,
          pdf_height_points: viewport.height,
        }),
      });

      if (!res.ok) throw new Error('Failed to save calibration');

      const data = await res.json();
      setCalibration(data.calibration);
      setShowCalibrationModal(false);
      setCalibrationLine(null);

      // Reload measurements to get updated real distances
      const measurementsRes = await fetch(
        `/api/measurements?projectId=${projectId}&pageNumber=${state.pageNumber}`
      );
      if (measurementsRes.ok) {
        const measurementsData = await measurementsRes.json();
        setMeasurements(measurementsData.measurements || []);
      }
    } catch (error) {
      console.error('[PDFViewer] Error saving calibration:', error);
      alert('Failed to save calibration');
    }
  },
  [projectId, state.pageNumber, page]
);

const saveCalibrationKnownLength = useCallback(
  async (
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number },
    knownDistanceInches: number
  ) => {
    if (!projectId) return;

    try {
      const res = await fetch('/api/measurements/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          page_number: state.pageNumber,
          method: 'known-length',
          calibration_line_start: lineStart,
          calibration_line_end: lineEnd,
          known_distance_inches: knownDistanceInches,
        }),
      });

      if (!res.ok) throw new Error('Failed to save calibration');

      const data = await res.json();
      setCalibration(data.calibration);
      setShowCalibrationModal(false);
      setCalibrationLine(null);
      setIsDrawingCalibrationLine(false);

      // Reload measurements to get updated real distances
      const measurementsRes = await fetch(
        `/api/measurements?projectId=${projectId}&pageNumber=${state.pageNumber}`
      );
      if (measurementsRes.ok) {
        const measurementsData = await measurementsRes.json();
        setMeasurements(measurementsData.measurements || []);
      }
    } catch (error) {
      console.error('[PDFViewer] Error saving calibration:', error);
      alert('Failed to save calibration');
    }
  },
  [projectId, state.pageNumber]
);
```

**REPLACE with:**
```typescript
import { useCalibration } from '@/hooks/useCalibration';

// Inside component:
const calibration = useCalibration(readOnly ? undefined : projectId, state.pageNumber);

// Save handlers need viewport from page
const handleSaveCalibration = async (scaleNotation: string, printWidth: number, printHeight: number) => {
  if (!page) return;
  const viewport = page.getViewport({ scale: 1 });
  
  await calibration.actions.savePageSize(
    scaleNotation,
    printWidth,
    printHeight,
    viewport.width,
    viewport.height
  );
  
  setShowCalibrationModal(false);
  setCalibrationLine(null);
  
  // Refresh measurements to get updated distances
  await measurements.actions.refresh();
};

const handleSaveCalibrationKnownLength = async (
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number },
  knownDistanceInches: number
) => {
  await calibration.actions.saveKnownLength(lineStart, lineEnd, knownDistanceInches);
  
  setShowCalibrationModal(false);
  setCalibrationLine(null);
  setIsDrawingCalibrationLine(false);
  
  // Refresh measurements
  await measurements.actions.refresh();
};
```

**Lines removed:** ~150

---

### Task 4.2.8: Replace screenshot capture with `useScreenshotCapture`

**File:** `components/pdf/PDFViewer.tsx`

**FIND and DELETE (lines 1444-1652):**
```typescript
const createElementInstance = async (
  elementSlug: 'bathroom' | 'door' | 'kitchen'
): Promise<any | null> => {
  const elementGroupSlugs: Record<string, string> = {
    bathroom: 'bathrooms',
    door: 'doors',
    kitchen: 'kitchens',
  };
  const slug = elementGroupSlugs[elementSlug];
  if (!slug || !assessmentId) return null;
  try {
    const res = await fetch(`/api/checks/create-element`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assessmentId, elementGroupSlug: slug }),
    });
    if (!res.ok) return null;
    const { check } = await res.json();
    return check;
  } catch {
    return null;
  }
};

const capture = useCallback(
  async (
    target: 'current' | 'bathroom' | 'door' | 'kitchen' = 'current',
    screenshotType: 'plan' | 'elevation' = 'plan',
    elementGroupId?: string,
    caption?: string
  ) => {
    try {
      // ... 180 lines of capture logic
    } catch (err) {
      alert('Failed to save screenshot.');
      console.error('[PDFViewer] capture failed:', err);
    } finally {
      capturingRef.current = false;
    }
  },
  [/* many deps */]
);
```

**REPLACE with:**
```typescript
import { useScreenshotCapture } from '@/hooks/useScreenshotCapture';

// Inside component:
const screenshotCapture = useScreenshotCapture({
  page,
  canvas: canvasRef.current,
  ocConfig,
  renderScale,
  assessmentId,
  activeCheck,
  onCheckAdded,
  onCheckSelect,
  onScreenshotSaved,
  refreshScreenshots: screenshotsHook.actions.refresh,
});

// Use it
const handleCapture = async (
  target: 'current' | 'bathroom' | 'door' | 'kitchen',
  type: 'plan' | 'elevation',
  elementGroupId?: string,
  caption?: string
) => {
  if (!state.mode.selection) return;
  
  try {
    await screenshotCapture.capture({
      target,
      type,
      selection: state.mode.selection,
      elementGroupId,
      caption,
      pageNumber: state.pageNumber,
      zoomLevel: transform.scale,
    });
    
    // Clear selection after plan screenshot
    if (type === 'plan') {
      dispatch({ type: 'CLEAR_SELECTION' });
    }
  } catch (err) {
    alert('Failed to save screenshot.');
    console.error('[PDFViewer] capture failed:', err);
  }
};
```

**Lines removed:** ~180

---

### Task 4.3.1: Extract keyboard shortcuts to dedicated hook

**File:** `hooks/useKeyboardShortcuts.ts` (new file)

**Complete Implementation:**
```typescript
import { useEffect } from 'react';
import type { ViewerMode } from '@/components/pdf/types';

interface ShortcutHandlers {
  onPrevPage: () => void;
  onNextPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onToggleScreenshot: () => void;
  onToggleMeasure: () => void;
  onOpenCalibration: () => void;
  onOpenSearch?: () => void;
  onExit: () => void;
  onDeleteMeasurement?: () => void;
  
  // Screenshot mode shortcuts
  onCaptureCurrent?: () => void;
  onCaptureElevation?: () => void;
  onCaptureBathroom?: () => void;
  onCaptureDoor?: () => void;
  onCaptureKitchen?: () => void;
}

interface ShortcutOptions {
  mode: ViewerMode;
  readOnly: boolean;
  hasSelection: boolean;
  disabled: boolean; // When modals are open
}

/**
 * Hook for managing PDF viewer keyboard shortcuts.
 * 
 * Supports:
 * - Navigation: Arrow keys
 * - Zoom: -/+/0
 * - Modes: S (screenshot), M (measure), L (calibration)
 * - Screenshot: C/E/B/D/K when selection exists
 * - Escape: Exit modes
 * - Delete: Remove selected measurement
 * - F: Open search
 */
export function useKeyboardShortcuts(
  containerRef: React.RefObject<HTMLElement>,
  options: ShortcutOptions,
  handlers: ShortcutHandlers
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when disabled (modals open, etc.)
      if (options.disabled) return;

      const key = e.key.toLowerCase();

      // Navigation
      if (key === 'arrowleft') {
        e.preventDefault();
        handlers.onPrevPage();
        return;
      }
      if (key === 'arrowright') {
        e.preventDefault();
        handlers.onNextPage();
        return;
      }

      // Zoom
      if (key === '-' || key === '_') {
        e.preventDefault();
        handlers.onZoomOut();
        return;
      }
      if (key === '=' || key === '+') {
        e.preventDefault();
        handlers.onZoomIn();
        return;
      }
      if (key === '0') {
        e.preventDefault();
        handlers.onResetZoom();
        return;
      }

      // Search
      if (key === 'f' && !e.ctrlKey && !e.metaKey && handlers.onOpenSearch) {
        e.preventDefault();
        handlers.onOpenSearch();
        return;
      }

      // Exit modes
      if (key === 'escape') {
        e.preventDefault();
        handlers.onExit();
        return;
      }

      // Delete measurement
      if (key === 'delete' && handlers.onDeleteMeasurement) {
        e.preventDefault();
        handlers.onDeleteMeasurement();
        return;
      }

      // Don't allow mode changes in readonly
      if (options.readOnly) return;

      // Toggle modes
      if (key === 's' && !e.repeat) {
        e.preventDefault();
        handlers.onToggleScreenshot();
        return;
      }
      if (key === 'm' && !e.repeat) {
        e.preventDefault();
        handlers.onToggleMeasure();
        return;
      }
      if (key === 'l' && !e.repeat) {
        e.preventDefault();
        handlers.onOpenCalibration();
        return;
      }

      // Screenshot mode shortcuts (require selection)
      if (options.mode.type === 'screenshot' && options.hasSelection && !e.repeat) {
        if (key === 'c' && handlers.onCaptureCurrent) {
          e.preventDefault();
          handlers.onCaptureCurrent();
          return;
        }
        if (key === 'e' && handlers.onCaptureElevation) {
          e.preventDefault();
          handlers.onCaptureElevation();
          return;
        }
        if (key === 'b' && handlers.onCaptureBathroom) {
          e.preventDefault();
          handlers.onCaptureBathroom();
          return;
        }
        if (key === 'd' && handlers.onCaptureDoor) {
          e.preventDefault();
          handlers.onCaptureDoor();
          return;
        }
        if (key === 'k' && handlers.onCaptureKitchen) {
          e.preventDefault();
          handlers.onCaptureKitchen();
          return;
        }
      }
    };

    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [containerRef, options, handlers]);
}
```

---

### Task 4.3.2: Use keyboard shortcuts hook in PDFViewer

**File:** `components/pdf/PDFViewer.tsx`

**FIND and DELETE (lines 1219-1336):**
```typescript
// Keyboard shortcuts
useEffect(() => {
  const el = viewportRef.current;
  if (!el) return;

  const onKey = (e: KeyboardEvent) => {
    // ... 120 lines of keyboard handling
  };
  el.addEventListener('keydown', onKey);
  return () => {
    el.removeEventListener('keydown', onKey);
  };
}, [/* many deps */]);
```

**REPLACE with:**
```typescript
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

// Inside component:
useKeyboardShortcuts(
  viewportRef,
  {
    mode: state.mode,
    readOnly,
    hasSelection: state.mode.type !== 'idle' && state.mode.selection !== null,
    disabled: showElevationPrompt || showCalibrationModal || textSearch.isOpen,
  },
  {
    onPrevPage: () => dispatch({ type: 'SET_PAGE', payload: Math.max(1, state.pageNumber - 1) }),
    onNextPage: () => dispatch({ type: 'SET_PAGE', payload: Math.min(state.numPages, state.pageNumber + 1) }),
    onZoomIn: () => zoom('in'),
    onZoomOut: () => zoom('out'),
    onResetZoom: () => viewTransform.reset(),
    onToggleScreenshot: () => dispatch({
      type: 'SET_MODE',
      payload: state.mode.type === 'screenshot' ? 'idle' : 'screenshot',
    }),
    onToggleMeasure: () => dispatch({
      type: 'SET_MODE',
      payload: state.mode.type === 'measure' ? 'idle' : 'measure',
    }),
    onOpenCalibration: () => setShowCalibrationModal(true),
    onOpenSearch: projectId ? textSearch.open : undefined,
    onExit: () => {
      if (isDrawingCalibrationLine) {
        setIsDrawingCalibrationLine(false);
        setCalibrationLine(null);
      }
      dispatch({ type: 'SET_MODE', payload: 'idle' });
    },
    onDeleteMeasurement: measurements.state.selectedId
      ? () => measurements.actions.remove(measurements.state.selectedId!)
      : undefined,
    onCaptureCurrent: () => handleCapture('current', 'plan'),
    onCaptureElevation: () => setShowElevationPrompt(true),
    onCaptureBathroom: () => handleCapture('bathroom', 'plan'),
    onCaptureDoor: () => handleCapture('door', 'plan'),
    onCaptureKitchen: () => handleCapture('kitchen', 'plan'),
  }
);
```

**Lines removed:** ~120

---

### Task 4.4.1: Extract mouse handlers to dedicated hook

**File:** `hooks/usePdfMouseHandlers.ts` (new file)

**Complete Implementation:**
```typescript
import { useCallback, useRef } from 'react';
import type { ViewerMode, Selection } from '@/components/pdf/types';
import type { Transform } from '@/hooks/usePdfPersistence';

interface MouseHandlers {
  onStartDrag: () => void;
  onEndDrag: () => void;
  onUpdateDrag: (dx: number, dy: number) => void;
  onStartSelection: (x: number, y: number) => void;
  onUpdateSelection: (x: number, y: number) => void;
  onEndSelection: () => void;
}

/**
 * Hook for managing PDF viewer mouse interactions.
 * 
 * Handles:
 * - Pan (drag in idle mode)
 * - Selection (drag in screenshot/measure/calibrate modes)
 */
export function usePdfMouseHandlers(
  mode: ViewerMode,
  readOnly: boolean,
  handlers: MouseHandlers
) {
  const dragStartRef = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Interactive modes (screenshot/measure/calibrate)
      if (mode.type !== 'idle' && !readOnly) {
        e.preventDefault();
        e.stopPropagation();
        handlers.onStartSelection(e.clientX, e.clientY);
        return;
      }

      // Pan mode (idle, left button only)
      if (e.button !== 0) return;
      handlers.onStartDrag();
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    },
    [mode, readOnly, handlers]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Update selection
      if (mode.type !== 'idle' && mode.selection) {
        e.preventDefault();
        e.stopPropagation();
        handlers.onUpdateSelection(e.clientX, e.clientY);
        return;
      }

      // Update drag/pan
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      handlers.onUpdateDrag(dx, dy);
    },
    [mode, handlers]
  );

  const onMouseUp = useCallback(() => {
    // End selection
    if (mode.type !== 'idle' && mode.selection) {
      handlers.onEndSelection();
    }
    
    // End drag
    handlers.onEndDrag();
  }, [mode, handlers]);

  const onMouseLeave = useCallback(() => {
    // Don't end drag if we're selecting
    if (mode.type === 'idle') {
      handlers.onEndDrag();
    }
  }, [mode, handlers]);

  return {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
  };
}
```

---

### Task 4.4.2: Use mouse handlers hook in PDFViewer

**File:** `components/pdf/PDFViewer.tsx`

**FIND and DELETE (lines 1350-1405):**
```typescript
const onMouseDown = (e: React.MouseEvent) => {
  if ((state.screenshotMode || state.measurementMode || isDrawingCalibrationLine) && !readOnly) {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = screenToContent(e.clientX, e.clientY);
    dispatch({ type: 'START_SELECTION', payload: { x, y } });
    return;
  }
  if (e.button !== 0) return;
  dispatch({ type: 'START_DRAG' });
  dragRef.current = {
    x: e.clientX,
    y: e.clientY,
    tx: state.transform.tx,
    ty: state.transform.ty,
  };
};

const onMouseMove = (e: React.MouseEvent) => {
  if (state.screenshotMode || state.measurementMode || isDrawingCalibrationLine) {
    if (state.isSelecting && state.selection) {
      e.preventDefault();
      e.stopPropagation();
      const { x, y } = screenToContent(e.clientX, e.clientY);
      dispatch({ type: 'UPDATE_SELECTION', payload: { x, y } });
    }
    return;
  }
  if (!state.isDragging) return;
  const dx = e.clientX - dragRef.current.x;
  const dy = e.clientY - dragRef.current.y;
  dispatch({
    type: 'SET_TRANSFORM',
    payload: { ...state.transform, tx: dragRef.current.tx + dx, ty: dragRef.current.ty + dy },
  });
};

const onMouseUp = () => {
  if (state.screenshotMode && state.selection) {
    dispatch({ type: 'END_SELECTION' });
  } else if (state.measurementMode && state.selection) {
    dispatch({ type: 'END_SELECTION' });
    // Auto-save measurement when line is complete
    saveMeasurement(state.selection);
  } else if (isDrawingCalibrationLine && state.selection) {
    dispatch({ type: 'END_SELECTION' });
    // Save calibration line and show modal
    setCalibrationLine({
      start: { x: state.selection.startX, y: state.selection.startY },
      end: { x: state.selection.endX, y: state.selection.endY },
    });
    setIsDrawingCalibrationLine(false);
    setShowCalibrationModal(true);
  }
  dispatch({ type: 'END_DRAG' });
};
```

**REPLACE with:**
```typescript
import { usePdfMouseHandlers } from '@/hooks/usePdfMouseHandlers';

// Track drag start for transform updates
const dragStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

const mouseHandlers = usePdfMouseHandlers(
  state.mode,
  readOnly,
  {
    onStartDrag: () => {
      dispatch({ type: 'START_DRAG' });
      dragStartRef.current = { x: 0, y: 0, tx: transform.tx, ty: transform.ty };
    },
    onEndDrag: () => dispatch({ type: 'END_DRAG' }),
    onUpdateDrag: (dx, dy) => {
      if (!state.isDragging) return;
      setTransform({
        ...transform,
        tx: dragStartRef.current.tx + dx,
        ty: dragStartRef.current.ty + dy,
      });
    },
    onStartSelection: (clientX, clientY) => {
      const { x, y } = toContent(clientX, clientY);
      dispatch({ type: 'START_SELECTION', payload: { x, y } });
    },
    onUpdateSelection: (clientX, clientY) => {
      const { x, y } = toContent(clientX, clientY);
      dispatch({ type: 'UPDATE_SELECTION', payload: { x, y } });
    },
    onEndSelection: () => {
      dispatch({ type: 'END_SELECTION' });
      
      // Handle end-of-selection actions
      if (state.mode.type === 'measure' && state.mode.selection) {
        handleSaveMeasurement(state.mode.selection);
      } else if (state.mode.type === 'calibrate' && state.mode.selection) {
        setCalibrationLine({
          start: { x: state.mode.selection.startX, y: state.mode.selection.startY },
          end: { x: state.mode.selection.endX, y: state.mode.selection.endY },
        });
        setIsDrawingCalibrationLine(false);
        setShowCalibrationModal(true);
      }
    },
  }
);
```

**Lines removed:** ~60

---

### Task 4.6.1: Reorganize PDFViewer component structure

**File:** `components/pdf/PDFViewer.tsx`

**Add section comments to organize the ~800 line component:**

```typescript
export function PDFViewer(props: PDFViewerProps) {
  const {
    pdfUrl,
    projectId,
    assessmentId: propAssessmentId,
    // ... destructure all props
  } = props;

  const assessmentId = propAssessmentId || activeCheck?.assessment_id;

  // ============================================================================
  // SECTION 1: REFS
  // ============================================================================
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ============================================================================
  // SECTION 2: STATE & PERSISTENCE
  // ============================================================================
  const persistence = usePdfPersistence(assessmentId);
  const transform = persistence.state.transform;
  const setTransform = persistence.actions.setTransform;

  const [state, dispatch] = useReducer(viewerReducer, {
    pageNumber: persistence.state.page,
    numPages: 0,
    isDragging: false,
    mode: { type: 'idle' },
  });

  const [renderScale, setRenderScale] = useState(4);
  const [smoothTransition, setSmoothTransition] = useState(false);
  const [showElevationPrompt, setShowElevationPrompt] = useState(false);
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [calibrationLine, setCalibrationLine] = useState<any>(null);
  const [isDrawingCalibrationLine, setIsDrawingCalibrationLine] = useState(false);
  const [showLayerPanel, setShowLayerPanel] = useState(false);

  // ============================================================================
  // SECTION 3: DOCUMENT & LAYER HOOKS
  // ============================================================================
  const { url: presignedUrl, loading: loadingUrl } = usePresignedUrl(pdfUrl);
  const pdf = usePdfDocument(presignedUrl, state.pageNumber);
  const layers = usePdfLayers(pdf.state.doc, assessmentId, disableLayers);
  const { doc: pdfDoc, page, numPages } = pdf.state;
  const { ocConfig, layers: layerList } = layers.state;

  // ============================================================================
  // SECTION 4: FEATURE HOOKS
  // ============================================================================
  const measurements = useMeasurements(readOnly ? undefined : projectId, state.pageNumber);
  const calibration = useCalibration(readOnly ? undefined : projectId, state.pageNumber);
  const screenshots = useAssessmentScreenshots(readOnly ? undefined : assessmentId, state.pageNumber);
  const textSearch = useTextSearch({ projectId: projectId || '', pdfDoc, onPageChange: handleSearchPageChange });
  const viewTransform = useViewTransform(viewportRef, transform, setTransform);

  // ============================================================================
  // SECTION 5: COMPUTED VALUES & MEMOS
  // ============================================================================
  const violationGroups = useMemo(() => {
    // ... grouping logic
  }, [readOnly, violationMarkers, state.pageNumber]);

  const zoomPct = Math.round(transform.scale * 100);

  // ============================================================================
  // SECTION 6: EFFECTS & SYNC
  // ============================================================================
  
  // Sync page with persistence
  useEffect(() => {
    // ...
  }, []);

  // Sync numPages
  useEffect(() => {
    // ...
  }, []);

  // Center on highlighted violation
  useEffect(() => {
    // ...
  }, []);

  // Render canvas
  useEffect(() => {
    // ...
  }, []);

  // ============================================================================
  // SECTION 7: EVENT HANDLERS
  // ============================================================================
  
  const handleCapture = async (...) => { /* ... */ };
  const handleSaveMeasurement = async (...) => { /* ... */ };
  const handleSearchPageChange = (...) => { /* ... */ };

  // Keyboard shortcuts
  useKeyboardShortcuts(/* ... */);

  // Mouse handlers
  const mouseHandlers = usePdfMouseHandlers(/* ... */);

  // ============================================================================
  // SECTION 8: RENDER
  // ============================================================================
  
  if (loadingUrl) return <BlueprintLoader />;
  if (!presignedUrl) return <ErrorDisplay />;
  if (!pdfDoc || !page) return <BlueprintLoader />;

  return (
    <div ref={viewportRef} className="..." {...mouseHandlers}>
      {/* Mode indicators */}
      {/* Toolbar */}
      {/* Canvas */}
      {/* Overlays */}
      {/* Modals */}
    </div>
  );
}
```

---

### Task 4.6.3: Verify target component size

**Action:** After all refactoring, measure the component:

```bash
wc -l components/pdf/PDFViewer.tsx
```

**Target:** <1000 lines (from 2230)

**If over target:**
- Extract more UI components (toolbar, mode banners, etc.)
- Move rendering logic to utils
- Simplify effect dependencies

---

## Phase 5: Testing & Documentation

### Task 5.1.1: Run existing tests

**File:** Terminal

**Command:**
```bash
npm test -- hooks/
```

**Verify:** All refactored hooks pass existing tests

---

### Task 5.2.1: Update PDFViewer E2E tests

**File:** `e2e/pdf-viewer-screenshot.spec.ts`

**Update test to use new mode system:**

**BEFORE:**
```typescript
// Check screenshot mode is active
await expect(page.locator('[aria-pressed="true"]')).toContainText('📸');
```

**AFTER:**
```typescript
// Check screenshot mode is active
const screenshotButton = page.locator('button[aria-label*="screenshot"]');
await expect(screenshotButton).toHaveAttribute('aria-pressed', 'true');

// Verify mode indicator is shown
await expect(page.locator('text=Screenshot Mode')).toBeVisible();
```

---

### Task 5.3.1: Document hook architecture

**File:** `docs/HOOK_ARCHITECTURE.md` (new file)

**Create comprehensive documentation:**

```markdown
# PDF Viewer Hook Architecture

## Overview

The PDF viewer is built using a composable hook architecture. Each domain concern is extracted into a focused hook with a standard interface.

## Standard Hook Pattern

All hooks follow this structure:

\`\`\`typescript
export function useFeature(params): HookReturn<State, Actions, Computed> {
  return {
    state: {
      // Values that change
      data: T,
      loading: boolean,
      error: string | null,
    },
    actions: {
      // Functions that modify state
      save: (item) => Promise<void>,
      refresh: () => Promise<void>,
    },
    computed: {
      // Derived values (memoized)
      isEmpty: boolean,
    }
  };
}
\`\`\`

## Core Hooks

### `useFetch`
**Purpose:** Generic data fetching with loading/error states  
**Location:** `lib/hooks/useFetch.ts`  
**Used by:** Almost all domain hooks

### `usePersisted`
**Purpose:** LocalStorage persistence with debouncing  
**Location:** `lib/hooks/usePersisted.ts`  
**Used by:** usePdfPersistence, usePdfLayers, useAssessment

### `usePolling`
**Purpose:** Interval-based polling with stop condition  
**Location:** `lib/hooks/usePolling.ts`  
**Used by:** useAssessmentPolling, useAssessment

## Domain Hooks

### PDF Document

#### `usePresignedUrl`
Fetches and caches presigned S3 URLs.

#### `usePdfDocument`
Loads PDF.js document and specific page.

#### `usePdfLayers`
Manages optional content groups (layers).

### View State

#### `usePdfPersistence`
Consolidates all localStorage persistence (page, transform, indicators).

#### `useViewTransform`
Manages pan/zoom transform with pivot-point zoom.

### Features

#### `useMeasurements`
CRUD for measurements on PDF pages.

#### `useCalibration`
Manages scale calibration (page-size and known-length methods).

#### `useScreenshotCapture`
Orchestrates full screenshot workflow from canvas to S3 to DB.

## Composition in PDFViewer

The main component composes these hooks:

\`\`\`typescript
function PDFViewer() {
  // Document
  const { url } = usePresignedUrl(pdfUrl);
  const { doc, page } = usePdfDocument(url, pageNumber);
  const { layers, ocConfig } = usePdfLayers(doc, assessmentId);
  
  // State
  const persistence = usePdfPersistence(assessmentId);
  const viewTransform = useViewTransform(ref, persistence.state.transform);
  
  // Features
  const measurements = useMeasurements(projectId, pageNumber);
  const calibration = useCalibration(projectId, pageNumber);
  const capture = useScreenshotCapture({ page, canvas, ... });
  
  // Orchestrate...
}
\`\`\`

## Benefits

1. **Testability:** Each hook can be tested in isolation
2. **Reusability:** Hooks can be used in other components
3. **Clarity:** Each hook has single responsibility
4. **Maintainability:** Changes are localized
5. **Type Safety:** Full TypeScript support

## Testing Strategy

- Unit test each hook independently
- Mock dependencies (PDF.js, fetch)
- Integration test the composed component
- E2E test user workflows
```

---

### Task 5.3.2: Update CLAUDE.md

**File:** `CLAUDE.md`

**Add section after existing content:**

```markdown
## Hook Architecture

The codebase uses a composable hook architecture for complex features. All hooks follow a standard pattern:

\`\`\`typescript
{
  state: { /* values */ },
  actions: { /* modifiers */ },
  computed: { /* derived */ }
}
\`\`\`

### Base Hooks

Located in `lib/hooks/`:
- **useFetch** - Generic API calls with loading/error
- **usePersisted** - localStorage with debouncing
- **usePolling** - Interval polling with stop condition

### Domain Hooks

Located in `hooks/`:
- **useMeasurements** - PDF measurement CRUD
- **useCalibration** - Scale calibration
- **useScreenshotCapture** - Screenshot workflow
- **usePdfDocument** - PDF.js document/page loading
- **usePdfLayers** - Optional content management

### Usage

Always destructure from state/actions:

\`\`\`typescript
const measurements = useMeasurements(projectId, page);
const { measurements, loading } = measurements.state;
const { save, remove } = measurements.actions;
\`\`\`

See `docs/HOOK_ARCHITECTURE.md` for full details.
```

---

## Phase 6: Cleanup & Polish

### Task 6.1.1: Remove unused constants

**File:** `components/pdf/PDFViewer.tsx`

**DELETE (no longer needed):**
```typescript
const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const MAX_CANVAS_SIDE = 16384;
const MAX_CANVAS_PIXELS = 268_000_000;
const TRANSFORM_SAVE_DEBOUNCE_MS = 500;
const NOOP = () => {};
```

These are now in the respective utility files or hooks.

---

### Task 6.1.2: Remove duplicate screenToContent

**File:** `components/pdf/PDFViewer.tsx`

**FIND and DELETE:**
```typescript
const screenToContent = useCallback(
  (clientX: number, clientY: number) => {
    // ... implementation
  },
  [state.transform]
);
```

**Already imported from `hooks/useViewTransform`**

---

### Task 6.2.1: Add memoization for expensive computations

**File:** `components/pdf/PDFViewer.tsx`

**FIND:**
```typescript
const violationGroups = useMemo(() => {
  if (!readOnly || violationMarkers.length === 0) return [];
  // ... grouping logic
}, [readOnly, violationMarkers, state.pageNumber]);
```

**VERIFY:** This is already memoized. Good!

**FIND:**
```typescript
const zoomPct = Math.round(transform.scale * 100);
```

**This is cheap, no need to memoize.**

---

### Task 6.2.2: Optimize callbacks with useCallback

**Review all event handlers in PDFViewer:**

```typescript
// These should all be wrapped in useCallback
const handleCapture = useCallback(async (...) => { /* ... */ }, [deps]);
const handleSaveMeasurement = useCallback(async (...) => { /* ... */ }, [deps]);
const handleSearchPageChange = useCallback((...) => { /* ... */ }, []);
```

**Verify all handlers passed to child components are memoized.**

---

### Task 6.3.1: Remove `any` types

**File:** Throughout codebase

**FIND:**
```typescript
const [pdfDoc, setPdfDoc] = useState<any>(null);
const [page, setPage] = useState<any>(null);
```

**REPLACE with proper types:**
```typescript
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
const [page, setPage] = useState<PDFPageProxy | null>(null);
```

**Do this for all PDF.js types used.**

---

### Task 6.4.1: Run linter

**File:** Terminal

**Command:**
```bash
npm run lint -- --fix
```

**Fix any remaining errors manually.**

---

### Task 6.4.2: Format all changed files

**File:** Terminal

**Command:**
```bash
npx prettier --write "lib/hooks/**/*.ts" "lib/pdf/**/*.ts" "hooks/**/*.ts" "components/pdf/**/*.tsx"
```

---

## Summary

**Total Tasks Completed:** 67

### Files Created (17):
1. `lib/hooks/useFetch.ts`
2. `lib/hooks/usePersisted.ts`
3. `lib/hooks/usePolling.ts`
4. `lib/hooks/types.ts`
5. `lib/hooks/index.ts`
6. `hooks/useMeasurements.ts`
7. `hooks/useCalibration.ts`
8. `hooks/usePdfDocument.ts`
9. `hooks/usePdfLayers.ts`
10. `hooks/usePdfPersistence.ts`
11. `hooks/useViewTransform.ts`
12. `hooks/useScreenshotCapture.ts`
13. `hooks/usePresignedUrl.ts`
14. `hooks/useKeyboardShortcuts.ts`
15. `hooks/usePdfMouseHandlers.ts`
16. `lib/pdf/calibration-utils.ts`
17. `lib/pdf/canvas-utils.ts`
18. `lib/pdf/transform-utils.ts`
19. `lib/pdf/element-instance.ts`
20. `lib/pdf/screenshot-upload.ts`
21. `components/pdf/types.ts`
22. `docs/HOOK_ARCHITECTURE.md`
23. Plus ~17 test files

### Files Modified:
- `components/pdf/PDFViewer.tsx` (2230 → ~800 lines, -64%)
- `hooks/useAssessmentScreenshots.ts`
- `hooks/useManualOverride.ts`
- `hooks/useCheckData.ts`
- `hooks/useAssessmentPolling.ts`
- `components/checks/hooks/useAssessment.ts`
- `CLAUDE.md`
- Multiple test files

### Impact:
- **Lines Saved:** 1000+
- **Complexity Reduced:** Massive (cyclomatic complexity way down)
- **Testability:** Much improved (each hook independently testable)
- **Maintainability:** Significantly better (clear separation of concerns)
- **Reusability:** High (hooks can be used in other components)

### Next Steps:
1. Review this plan with team
2. Create GitHub issues for each phase
3. Create feature branch
4. Execute Phase 1 (foundation hooks)
5. Test thoroughly
6. Continue with remaining phases

---

**End of Task List**


