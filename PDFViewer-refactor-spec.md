# PDFViewer Component Refactoring Specification

**Date:** 2025-10-06
**Component:** `components/pdf/PDFViewer.tsx`
**Status:** Needs Refactoring
**Lines of Code:** ~1350

## Executive Summary

The PDFViewer component is a complex React component that displays PDF documents with advanced features including layer toggling, screenshot capture, pan/zoom, and viewport persistence. The component has grown to over 1300 lines and suffers from a dual-rendering architecture that creates synchronization issues, particularly when toggling PDF layers and changing render resolution.

**Critical Bug:** When a user toggles PDF layers, then zooms, then changes the render resolution, the new resolution only becomes visible after a page refresh. Additionally, when refreshing the page with saved layer visibility settings, the layers revert to their default visibility state instead of respecting the saved settings.

## Component Purpose

This component is part of a building code compliance assessment application. Users view architectural drawings (PDFs) and capture screenshots of specific areas to check against building codes. The viewer must support:

1. **PDF Rendering** - Display multi-page PDFs with high resolution
2. **Pan/Zoom** - Navigate large documents with mouse/wheel controls
3. **Layer Control** - Toggle PDF layers (architectural drawings often have layers for different systems)
4. **Screenshot Capture** - Select and crop regions for compliance checks
5. **State Persistence** - Save viewport position, zoom level, page number, layer visibility across sessions
6. **Violation Markers** - Display markers on the PDF for identified violations (read-only mode)

## Current Architecture

### Rendering System (The Problem)

The component uses **two separate rendering paths**, which is the root cause of most complexity:

#### Path 1: react-pdf `<Page>` Component (Default)

- **When:** Always rendered
- **Layer Control:** Uses default PDF layer visibility (all layers on)
- **Location:** Lines 1252-1275
- **Key:** `page-${pageNumber}-layers-${layerVersion}-scale-${cappedRenderScale}`

#### Path 2: Manual Canvas Overlay

- **When:** Only when `layerVersion > 0` (i.e., after user manually toggles a layer)
- **Layer Control:** Respects custom layer visibility via `optionalContentConfig.setVisibility()`
- **Location:** Lines 1278-1287
- **Visibility:** Controlled by `display: layerVersion > 0 ? 'block' : 'none'`

### The Synchronization Problem

```
Initial Load (layerVersion = 0):
  ├─ react-pdf <Page> renders (all layers visible) ✓
  └─ layer canvas hidden (display: none) ✓

User toggles layer (layerVersion = 1):
  ├─ react-pdf <Page> still renders (all layers visible) ✗
  ├─ layer canvas renders with custom visibility ✓
  └─ layer canvas shows (display: block), overlays <Page> ✓

User changes resolution:
  ├─ renderScale changes, cappedRenderScale updates
  ├─ react-pdf <Page> key changes, re-renders at new scale
  ├─ layer canvas ALSO needs to re-render at new scale
  └─ BUT: race condition / timing issues cause desync

User refreshes page with saved layer settings:
  ├─ Saved visibility restored from localStorage
  ├─ layerVersion still = 0 (reset on mount)
  ├─ react-pdf <Page> renders with all layers visible ✗
  └─ layer canvas hidden (display: none) because layerVersion = 0 ✗
  RESULT: User sees all layers visible, checkboxes show only some selected
```

## Desired Behavior

### Layer Rendering

- **If PDF has no layers:** Render normally with react-pdf
- **If PDF has layers:**
  - Always use the layer canvas for rendering (even if all layers are on)
  - Never show the default `<Page>` component canvas when layers are present
  - Apply saved layer visibility immediately on mount
  - Ensure layer visibility persists across page changes, zooms, resolution changes, and refreshes

### Resolution Changes

- When user changes render resolution:
  - Immediately re-render the PDF at the new resolution
  - Maintain current layer visibility settings
  - No refresh required
  - No visual artifacts or old resolution visible

### State Persistence

- Save to localStorage per assessment:
  - `pdf-page-${assessmentId}` → current page number
  - `pdf-transform-${assessmentId}` → viewport transform (pan/zoom)
  - `pdf-layers-${assessmentId}` → layer visibility map
- Restore all settings on mount
- Changes should be immediately visible

### Performance

- Cancel any in-progress render when starting a new render (already implemented via `renderTaskRef`)
- Debounce transform saves to localStorage (currently saves on every pan/zoom frame)

## State Management

### Current State Variables (16 total)

#### useReducer State (ViewerState)

```typescript
{
  transform: { tx: number; ty: number; scale: number };  // Pan/zoom
  pageNumber: number;
  numPages: number;
  isDragging: boolean;
  screenshotMode: boolean;
  isSelecting: boolean;
  selection: { startX, startY, endX, endY } | null;
}
```

#### useState Variables

```typescript
pdfInstance: any;                      // Raw PDF.js document
pageInstance: any;                     // Current page from PDF.js
presignedUrl: string | null;           // S3 presigned URL
loadingUrl: boolean;                   // Fetching presigned URL
renderScale: number;                   // User-requested resolution (1.0-10.0)
savingScale: boolean;                  // Saving scale to DB
cappedRenderScale: number;             // Safe scale (capped to canvas limits)
layers: PDFLayer[];                    // Array of {id, name, visible}
showLayerPanel: boolean;               // Layer panel UI toggle
optionalContentConfig: any;            // PDF.js optional content config
layerVersion: number;                  // Increment to trigger layer canvas render
```

#### useRef Variables

```typescript
viewportRef; // Main viewport container
pageContainerRef; // Page content container
dragStart; // Pan gesture tracking
capturingRef; // Prevent concurrent screenshots
layerCanvasRef; // Manual layer canvas element
renderTaskRef; // Active PDF.js render task
```

### Proposed Simplification

Consolidate layer rendering state:

```typescript
// Instead of layerVersion + conditional display, use:
hasCustomLayers: boolean; // True if PDF has layers
useLayerCanvas: boolean; // True if we should use custom canvas
```

## Component Structure

```
PDFViewer (1350 lines)
├─ State Initialization (118-247)
│  ├─ Load saved page/transform/scale from localStorage
│  ├─ Initialize reducer state
│  └─ Fetch presigned URL + saved scale from API
│
├─ Effects (165-574)
│  ├─ Sync external page number
│  ├─ Save state to localStorage
│  ├─ Wheel event handler (zoom)
│  ├─ Load PDF instance
│  ├─ Extract layers from PDF
│  └─ Load page instance + render layer canvas
│
├─ Event Handlers (313-470)
│  ├─ screenToContent() - coordinate conversion
│  ├─ onMouseDown/Move/Up - pan and selection
│  ├─ zoom() - button zoom
│  └─ Keyboard shortcuts
│
├─ Layer Management (621-740)
│  ├─ renderLayerCanvas() - manual canvas rendering
│  ├─ pickRenderScale() - compute safe scale
│  ├─ updateRenderScale() - user changes resolution
│  └─ toggleLayer() - toggle layer visibility
│
├─ Screenshot Capture (742-1063)
│  ├─ findElementTemplate() - find check to save to
│  └─ capture() - crop, render, upload screenshot
│
└─ Render (1065-1350)
   ├─ Loading/error states
   ├─ Screenshot mode UI
   ├─ Toolbar (zoom, resolution, layers, screenshot)
   ├─ Layer panel
   ├─ PDF Document + Page
   ├─ Layer canvas overlay
   ├─ Selection rectangle
   ├─ Violation markers
   └─ Page navigation
```

## Key Technical Details

### Coordinate Systems

The component deals with 4 coordinate systems:

1. **Screen/Client coordinates** - Mouse position in browser viewport
2. **Content coordinates** - Position in transformed content (accounting for pan/zoom)
3. **Canvas pixels** - Internal canvas resolution (canvas.width != canvas.clientWidth)
4. **Render pixels** - Offscreen render resolution for screenshots

### PDF.js Integration

- Uses `react-pdf` wrapper library
- BUT also uses raw `pdfjs.getDocument()` for layer control
- **Why?** react-pdf's optionalContentConfig is immutable, raw pdfjs allows `setVisibility()`

### Canvas Size Limits

- Max canvas dimension: 8192px per side
- Max canvas pixels: 140M total pixels
- Component calculates `cappedRenderScale` to stay within limits
- See `pickRenderScale()` at line 669

### Layer Visibility Control

- PDF Optional Content (layers) is a PDF.js feature
- Must use raw `OptionalContentConfig` object
- Call `ocConfig.setVisibility(layerId, boolean)` to toggle
- Must pass `optionalContentConfigPromise` to `page.render()` options

## Current Bugs & Issues

### 1. Layer Visibility Lost on Resolution Change ⚠️

**Steps to reproduce:**

1. Open PDF with layers
2. Toggle layer off (e.g., "Doors" layer)
3. Zoom in/out with mouse wheel
4. Change resolution with Detail +/- buttons
5. **Bug:** Old resolution still visible, new resolution only shows after refresh

**Root cause:**

- `<Page key={...}>` changes trigger re-render
- Layer canvas needs to re-render too
- Timing issues between the two renders
- Layer canvas doesn't always update at same time

### 2. Layer Visibility Lost on Refresh ⚠️

**Steps to reproduce:**

1. Open PDF with layers
2. Toggle layers (e.g., only "Doors" checked)
3. Refresh page (Cmd+R)
4. **Bug:** All layers visible, but checkboxes show "Doors" checked

**Root cause:**

- `layerVersion` starts at 0 on mount
- Saved visibility is restored to `layers` state array
- `optionalContentConfig.setVisibility()` is called
- BUT layer canvas is `display: none` because `layerVersion = 0`
- Default `<Page>` component shows all layers

**Attempted fix (line 565-568):**

```typescript
if (hasRestoredVisibility) {
  setLayerVersion(1); // Trigger layer canvas
}
```

This sets `layerVersion = 1`, but there may still be timing issues.

### 3. Excessive localStorage Writes

**Issue:** Transform is saved on every pan/zoom mouse move event (line 189-194)

**Impact:**

- Hundreds of localStorage writes per second during pan
- Could hit storage quota limits
- Performance impact on slower devices

**Fix needed:** Debounce transform saves (e.g., 500ms after last change)

### 4. Component Too Large

**Issue:** 1350 lines in a single component

**Impact:**

- Hard to reason about
- Multiple concerns mixed together
- Difficult to test
- Easy to introduce bugs

## Refactoring Recommendations

### Option A: Simplify Dual Rendering (Quick Fix)

**Goal:** Always use layer canvas when layers exist, remove conditional logic

**Changes:**

1. When layers are detected, set `useLayerCanvas = true`
2. Hide `<Page>` component when `useLayerCanvas === true`
3. Always render layer canvas when `useLayerCanvas === true`
4. Remove `layerVersion` state entirely

**Code sketch:**

```typescript
// When layers extracted:
if (layerList.length > 0) {
  setUseLayerCanvas(true);
}

// In render:
{layers.length > 0 ? (
  <canvas ref={layerCanvasRef} />  // Always visible
) : (
  <Page ... />  // Only when no layers
)}
```

**Pros:**

- Simpler logic
- Fixes both bugs
- Small change

**Cons:**

- Still using dual rendering (just simplified)
- Layer canvas always active even if all layers are on

### Option B: Extract Sub-Components (Medium Refactor)

**Goal:** Split into focused, testable components

**Proposed structure:**

```
PDFViewer (200 lines) - Main coordinator
├─ usePDFState() - State management hook (150 lines)
├─ usePDFPersistence() - localStorage sync (50 lines)
├─ PDFRenderer (300 lines) - Canvas rendering logic
│  ├─ useLayerRendering() - Layer canvas management
│  └─ LayerPanel component
├─ PDFControls (100 lines) - Toolbar UI
├─ ScreenshotCapture (300 lines) - Screenshot logic
│  └─ useScreenshotCapture() - Capture workflow
└─ PDFViewport (200 lines) - Pan/zoom/gestures
   └─ usePanZoom() - Transform management
```

**Pros:**

- Each component has single responsibility
- Easier to test
- Easier to understand
- Can fix rendering issues in PDFRenderer

**Cons:**

- Larger refactor
- Need to carefully manage prop drilling
- Risk of introducing new bugs

### Option C: Complete Rewrite (Large Refactor)

**Goal:** Modern architecture with proven patterns

**Use:**

- Zustand or Jotai for state management
- Separate rendering engine class
- React Query for API calls
- Custom canvas renderer (ditch react-pdf for display)

**Pros:**

- Clean slate
- Best practices
- Eliminates technical debt

**Cons:**

- Time intensive
- High risk
- Need comprehensive tests first

## Recommended Approach

### Phase 1: Quick Fix (1-2 hours)

1. Implement Option A (simplify dual rendering)
2. Add debounce to transform persistence
3. Add comprehensive logging
4. **Verify bugs are fixed**

### Phase 2: Extract Components (4-6 hours)

1. Extract `ScreenshotCapture` logic
2. Extract `LayerRendering` logic
3. Extract `PDFControls` UI
4. Move state to custom hooks
5. Add unit tests for extracted components

### Phase 3: Performance (2-3 hours)

1. Memoize expensive computations
2. Optimize re-renders
3. Add performance monitoring
4. Profile with React DevTools

## Testing Requirements

Before any refactor:

- [ ] Document current behavior with screenshots
- [ ] Create test cases for layer toggling
- [ ] Create test cases for resolution changes
- [ ] Create test cases for persistence
- [ ] Test on different PDF types (with/without layers)

After refactor:

- [ ] All existing features work
- [ ] No visual regressions
- [ ] Layer bug is fixed
- [ ] Resolution bug is fixed
- [ ] Persistence works correctly
- [ ] Performance is same or better

## Dependencies

```json
{
  "react-pdf": "^8.x",
  "pdfjs-dist": "^4.x"
}
```

**Important:** The component uses both `react-pdf` wrapper AND raw `pdfjs` APIs. The raw APIs are required for layer control via `optionalContentConfig.setVisibility()`.

## Environment Notes

- **Browser Canvas Limits:** 8192px per side, 140M pixels total
- **localStorage Limits:** ~5-10MB per origin
- **S3 Presigned URLs:** 7-day expiration
- **PDF Sources:** Private S3 bucket, requires presigned URLs

---

## Full Component Code

Below is the complete current implementation (1350 lines):

```tsx
'use client';

import { Document, Page, pdfjs } from 'react-pdf';
import { useCallback, useEffect, useRef, useReducer, useState } from 'react';
import { ViolationMarker as ViolationMarkerType } from '@/lib/reports/get-violations';
import { ViolationMarker } from '../reports/ViolationMarker';

// Use the unpkg CDN which is more reliable for Vercel deployments
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;

// Consolidated viewer state
interface ViewerState {
  transform: { tx: number; ty: number; scale: number };
  pageNumber: number;
  numPages: number;
  isDragging: boolean;
  screenshotMode: boolean;
  isSelecting: boolean;
  selection: { startX: number; startY: number; endX: number; endY: number } | null;
}

interface PDFLayer {
  id: string;
  name: string;
  visible: boolean;
}

type ViewerAction =
  | { type: 'SET_TRANSFORM'; payload: ViewerState['transform'] }
  | { type: 'SET_PAGE'; payload: number }
  | { type: 'SET_NUM_PAGES'; payload: number }
  | { type: 'START_DRAG'; payload: { x: number; y: number } }
  | { type: 'END_DRAG' }
  | { type: 'TOGGLE_SCREENSHOT_MODE' }
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
      return { ...state, pageNumber: action.payload, selection: null, screenshotMode: false };
    case 'SET_NUM_PAGES':
      return { ...state, numPages: action.payload };
    case 'START_DRAG':
      return { ...state, isDragging: true };
    case 'END_DRAG':
      return { ...state, isDragging: false };
    case 'TOGGLE_SCREENSHOT_MODE':
      return { ...state, screenshotMode: !state.screenshotMode, selection: null };
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
      return { ...state, selection: null, screenshotMode: false };
    case 'RESET_ZOOM':
      return { ...state, transform: { tx: 0, ty: 0, scale: 1 } };
    default:
      return state;
  }
}

export function PDFViewer({
  pdfUrl,
  assessmentId: propAssessmentId,
  activeCheck,
  onScreenshotSaved,
  onCheckAdded,
  onCheckSelect,
  readOnly = false,
  violationMarkers = [],
  onMarkerClick,
  currentPage: externalCurrentPage,
  onPageChange,
}: {
  pdfUrl: string;
  assessmentId?: string;
  activeCheck?: any;
  onScreenshotSaved?: () => void;
  onCheckAdded?: (check: any) => void;
  onCheckSelect?: (checkId: string) => void;
  readOnly?: boolean;
  violationMarkers?: ViolationMarkerType[];
  onMarkerClick?: (marker: ViolationMarkerType) => void;
  currentPage?: number;
  onPageChange?: (page: number) => void;
}) {
  const assessmentId = propAssessmentId || activeCheck?.assessment_id;
  const viewportRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // Load saved page number from localStorage
  const getSavedPageNumber = useCallback(() => {
    if (typeof window === 'undefined' || !assessmentId) return 1;
    const saved = localStorage.getItem(`pdf-page-${assessmentId}`);
    return saved ? parseInt(saved, 10) : 1;
  }, [assessmentId]);

  // Load saved transform from localStorage
  const getSavedTransform = useCallback(() => {
    if (typeof window === 'undefined' || !assessmentId) return { tx: 0, ty: 0, scale: 1 };
    const saved = localStorage.getItem(`pdf-transform-${assessmentId}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved transform:', e);
      }
    }
    return { tx: 0, ty: 0, scale: 1 };
  }, [assessmentId]);

  // Consolidated state management
  const [state, dispatch] = useReducer(viewerReducer, {
    transform: getSavedTransform(),
    pageNumber: getSavedPageNumber(),
    numPages: 0,
    isDragging: false,
    screenshotMode: false,
    isSelecting: false,
    selection: null,
  });

  const [pdfInstance, setPdfInstance] = useState<any>(null);
  const [pageInstance, setPageInstance] = useState<any>(null);
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [renderScale, setRenderScale] = useState(2.0); // Safe default that won't exceed canvas limits
  const [savingScale, setSavingScale] = useState(false);
  const [cappedRenderScale, setCappedRenderScale] = useState(2.0); // Actually safe scale to use
  const [layers, setLayers] = useState<PDFLayer[]>([]);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [optionalContentConfig, setOptionalContentConfig] = useState<any>(null);
  const [layerVersion, setLayerVersion] = useState(0);
  const capturingRef = useRef(false); // Prevent concurrent captures
  const layerCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null); // Track active render task

  // Log render scale changes
  useEffect(() => {
    console.log('PDFViewer: Render scale changed to', renderScale);
  }, [renderScale]);

  // Sync external page number with internal state
  useEffect(() => {
    if (externalCurrentPage && externalCurrentPage !== state.pageNumber) {
      dispatch({ type: 'SET_PAGE', payload: externalCurrentPage });
    }
  }, [externalCurrentPage]);

  // Notify parent of page changes and save to localStorage
  useEffect(() => {
    if (onPageChange) {
      onPageChange(state.pageNumber);
    }
    // Save current page to localStorage
    if (assessmentId && typeof window !== 'undefined') {
      localStorage.setItem(`pdf-page-${assessmentId}`, state.pageNumber.toString());
      console.log('PDFViewer: Saved page number to localStorage:', state.pageNumber);
    }
  }, [state.pageNumber, onPageChange, assessmentId]);

  // Save transform to localStorage when it changes
  useEffect(() => {
    if (assessmentId && typeof window !== 'undefined') {
      localStorage.setItem(`pdf-transform-${assessmentId}`, JSON.stringify(state.transform));
      console.log('PDFViewer: Saved transform to localStorage:', state.transform);
    }
  }, [state.transform, assessmentId]);

  // Save layer visibility to localStorage when it changes
  useEffect(() => {
    if (assessmentId && typeof window !== 'undefined' && layers.length > 0) {
      const visibilityMap: Record<string, boolean> = {};
      layers.forEach(layer => {
        visibilityMap[layer.id] = layer.visible;
      });
      localStorage.setItem(`pdf-layers-${assessmentId}`, JSON.stringify(visibilityMap));
      console.log('PDFViewer: Saved layer visibility to localStorage:', visibilityMap);
    }
  }, [layers, assessmentId]);

  // Fetch presigned URL for private S3 PDFs and load saved scale preference
  useEffect(() => {
    async function fetchPresignedUrl() {
      console.log('PDFViewer: Fetching presigned URL for', pdfUrl);
      setLoadingUrl(true);
      const res = await fetch('/api/pdf/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfUrl }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log('PDFViewer: Presigned URL obtained');
        setPresignedUrl(data.url);
      } else {
        console.error('PDFViewer: Failed to get presigned URL', res.status);
        setPresignedUrl(null);
      }
      setLoadingUrl(false);
    }

    async function loadSavedScale() {
      if (!assessmentId || readOnly) return;
      try {
        const res = await fetch(`/api/assessments/${assessmentId}/pdf-scale`);
        if (res.ok) {
          const data = await res.json();
          if (data.pdf_scale) {
            console.log('PDFViewer: Loading saved scale', data.pdf_scale);
            setRenderScale(data.pdf_scale);
          } else {
            console.log('PDFViewer: No saved scale, using default', 2.0);
          }
        }
      } catch (err) {
        console.error('Failed to load saved PDF scale:', err);
      }
    }

    fetchPresignedUrl();
    loadSavedScale();
  }, [pdfUrl, assessmentId, readOnly]);

  const onDocLoad = async (pdfProxy: any) => {
    console.log('[PDFViewer] Document loaded successfully', {
      numPages: pdfProxy.numPages,
      renderScale,
    });
    dispatch({ type: 'SET_NUM_PAGES', payload: pdfProxy.numPages });

    // NOTE: We don't extract layers from pdfProxy because its optionalContentConfig
    // doesn't support setVisibility() mutations. We'll extract from pdfInstance instead.
  };

  const onDocError = (error: Error) => {
    console.error('PDFViewer: Document loading error:', error);
  };

  // Native wheel handler for reliable zoom (prevents page scroll)
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const onWheel = (e: WheelEvent) => {
      if (state.screenshotMode) return;

      e.preventDefault();
      e.stopPropagation();

      const scaleSpeed = 0.003;
      const scaleDelta = -e.deltaY * scaleSpeed;
      const prev = state.transform;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * (1 + scaleDelta)));

      const rect = vp.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const cx = (sx - prev.tx) / prev.scale;
      const cy = (sy - prev.ty) / prev.scale;

      const tx = sx - cx * newScale;
      const ty = sy - cy * newScale;

      dispatch({ type: 'SET_TRANSFORM', payload: { tx, ty, scale: newScale } });
    };

    // Non-passive is the whole point
    vp.addEventListener('wheel', onWheel, { passive: false });

    // Safari pinch zoom emits gesture*; cancel it so it doesn't zoom the page
    const cancel = (e: Event) => e.preventDefault();
    vp.addEventListener('gesturestart', cancel as EventListener, { passive: false });
    vp.addEventListener('gesturechange', cancel as EventListener, { passive: false });
    vp.addEventListener('gestureend', cancel as EventListener, { passive: false });

    return () => {
      vp.removeEventListener('wheel', onWheel as EventListener);
      vp.removeEventListener('gesturestart', cancel as EventListener);
      vp.removeEventListener('gesturechange', cancel as EventListener);
      vp.removeEventListener('gestureend', cancel as EventListener);
    };
  }, [state.screenshotMode, state.transform]);

  const screenToContent = useCallback(
    (clientX: number, clientY: number) => {
      if (!pageContainerRef.current || !viewportRef.current) return { x: 0, y: 0 };

      const viewportRect = viewportRef.current.getBoundingClientRect();

      // Account for the transform's translation when converting to content coordinates
      const x = (clientX - viewportRect.left - state.transform.tx) / state.transform.scale;
      const y = (clientY - viewportRect.top - state.transform.ty) / state.transform.scale;

      console.log('screenToContent:', {
        clientX,
        clientY,
        viewportLeft: viewportRect.left,
        viewportTop: viewportRect.top,
        tx: state.transform.tx,
        ty: state.transform.ty,
        scale: state.transform.scale,
        contentX: x,
        contentY: y,
      });

      return { x, y };
    },
    [state.transform]
  );

  const onMouseDown = (e: React.MouseEvent) => {
    if (state.screenshotMode && !readOnly) {
      e.preventDefault();
      e.stopPropagation();
      const { x, y } = screenToContent(e.clientX, e.clientY);
      dispatch({ type: 'START_SELECTION', payload: { x, y } });
      return;
    }
    if (e.button !== 0) return;
    dispatch({ type: 'START_DRAG', payload: { x: e.clientX, y: e.clientY } });
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      tx: state.transform.tx,
      ty: state.transform.ty,
    };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (state.screenshotMode) {
      if (state.isSelecting && state.selection) {
        e.preventDefault();
        e.stopPropagation();
        const { x, y } = screenToContent(e.clientX, e.clientY);
        dispatch({ type: 'UPDATE_SELECTION', payload: { x, y } });
      }
      return;
    }
    if (!state.isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    dispatch({
      type: 'SET_TRANSFORM',
      payload: {
        ...state.transform,
        tx: dragStart.current.tx + dx,
        ty: dragStart.current.ty + dy,
      },
    });
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (state.screenshotMode && state.selection) {
      e.preventDefault();
      e.stopPropagation();
      dispatch({ type: 'END_SELECTION' });
    }
    dispatch({ type: 'END_DRAG' });
  };

  const zoom = (dir: 'in' | 'out') => {
    const factor = dir === 'in' ? 1.2 : 1 / 1.2;
    const prev = state.transform;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * factor));

    console.log('PDFViewer: Button zoom', {
      direction: dir,
      prevScale: prev.scale,
      newScale,
      factor,
    });

    // Zoom toward center
    const vp = viewportRef.current;
    if (!vp) {
      dispatch({ type: 'SET_TRANSFORM', payload: { ...prev, scale: newScale } });
      return;
    }

    const rect = vp.getBoundingClientRect();
    const sx = rect.width / 2;
    const sy = rect.height / 2;
    const cx = (sx - prev.tx) / prev.scale;
    const cy = (sy - prev.ty) / prev.scale;
    const tx = sx - cx * newScale;
    const ty = sy - cy * newScale;

    dispatch({ type: 'SET_TRANSFORM', payload: { tx, ty, scale: newScale } });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      // Screenshot mode shortcuts (when selection is active)
      if (state.screenshotMode && state.selection && !e.repeat) {
        const key = e.key.toLowerCase();
        if (key === 'c') {
          e.preventDefault();
          capture('current');
          return;
        }
        if (key === 'b') {
          e.preventDefault();
          console.log('[PDFViewer] b key pressed, calling capture(bathroom)');
          capture('bathroom');
          return;
        }
        if (key === 'd') {
          e.preventDefault();
          console.log('[PDFViewer] d key pressed, calling capture(door)');
          capture('door');
          return;
        }
        if (key === 'k') {
          e.preventDefault();
          console.log('[PDFViewer] k key pressed, calling capture(kitchen)');
          capture('kitchen');
          return;
        }
      }

      // Navigation shortcuts
      if (e.key === 'ArrowLeft')
        dispatch({ type: 'SET_PAGE', payload: Math.max(1, state.pageNumber - 1) });
      if (e.key === 'ArrowRight')
        dispatch({
          type: 'SET_PAGE',
          payload: Math.min(state.numPages || state.pageNumber, state.pageNumber + 1),
        });
      if (e.key === '-' || e.key === '_') zoom('out');
      if (e.key === '=' || e.key === '+') zoom('in');
      if (e.key === '0') dispatch({ type: 'RESET_ZOOM' });
      if (!readOnly && e.key.toLowerCase() === 's') dispatch({ type: 'TOGGLE_SCREENSHOT_MODE' });
      if (!readOnly && e.key === 'Escape' && state.screenshotMode)
        dispatch({ type: 'TOGGLE_SCREENSHOT_MODE' });
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [state.screenshotMode, state.selection, state.numPages, state.pageNumber, readOnly]);

  // Clear selection on page change happens in reducer via SET_PAGE action

  // Advanced: access raw pdf via pdfjs for cropping
  useEffect(() => {
    if (!presignedUrl) return;
    (async () => {
      console.log('[PDFViewer] Loading PDF instance from presigned URL...');
      const loadingTask = pdfjs.getDocument(presignedUrl);
      const pdf = await loadingTask.promise;
      console.log('[PDFViewer] PDF instance loaded, setting state');
      setPdfInstance(pdf);
    })();
  }, [presignedUrl]);

  // Extract PDF layers from pdfInstance (not pdfProxy)
  // pdfInstance uses raw pdfjs which has a mutable optionalContentConfig
  useEffect(() => {
    if (!pdfInstance) {
      console.log('[PDFViewer] No pdfInstance yet, skipping layer extraction');
      return;
    }
    (async () => {
      try {
        console.log('[PDFViewer] Extracting layers from pdfInstance...');
        const ocConfig = await pdfInstance.getOptionalContentConfig();
        console.log('[PDFViewer] Got optionalContentConfig from pdfInstance:', ocConfig);

        if (!ocConfig) {
          console.log('[PDFViewer] No optionalContentConfig found');
          setLayers([]);
          return;
        }

        setOptionalContentConfig(ocConfig);

        const order = ocConfig.getOrder();
        console.log('[PDFViewer] Layer order:', order);

        if (!order || order.length === 0) {
          setLayers([]);
          return;
        }

        const layerList: PDFLayer[] = [];
        for (const id of order) {
          try {
            const group = ocConfig.getGroup(id);
            console.log('[PDFViewer] Group', id, ':', group);
            layerList.push({
              id: id,
              name: group?.name || `Layer ${id}`,
              visible: ocConfig.isVisible(id),
            });
          } catch (err) {
            console.error('[PDFViewer] Error getting group', id, err);
          }
        }

        console.log('[PDFViewer] Extracted layers:', layerList);

        // Restore saved layer visibility from localStorage
        let hasRestoredVisibility = false;
        if (assessmentId && typeof window !== 'undefined') {
          const savedVisibility = localStorage.getItem(`pdf-layers-${assessmentId}`);
          if (savedVisibility) {
            try {
              const visibilityMap = JSON.parse(savedVisibility);
              console.log('[PDFViewer] Restoring saved layer visibility:', visibilityMap);

              // Apply saved visibility to layers and optionalContentConfig
              layerList.forEach(layer => {
                if (layer.id in visibilityMap) {
                  const savedVisible = visibilityMap[layer.id];
                  if (layer.visible !== savedVisible) {
                    hasRestoredVisibility = true;
                  }
                  layer.visible = savedVisible;
                  try {
                    ocConfig.setVisibility(layer.id, layer.visible);
                  } catch (err) {
                    console.error('[PDFViewer] Error setting layer visibility:', err);
                  }
                }
              });
            } catch (e) {
              console.error('[PDFViewer] Failed to parse saved layer visibility:', e);
            }
          }
        }

        setLayers(layerList);

        // If we restored non-default visibility, trigger layer canvas render
        if (hasRestoredVisibility) {
          console.log('[PDFViewer] Triggering layer canvas render due to restored visibility');
          setLayerVersion(1);
        }
      } catch (err) {
        console.error('[PDFViewer] Failed to extract PDF layers:', err);
        setLayers([]);
      }
    })();
  }, [pdfInstance]);

  useEffect(() => {
    // Cancel any active layer render when page changes
    if (renderTaskRef.current) {
      console.log('PDFViewer: Cancelling active render task due to page change');
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    (async () => {
      if (!pdfInstance) return;
      console.log('PDFViewer: Loading page', state.pageNumber);
      const p = await pdfInstance.getPage(state.pageNumber);
      console.log('PDFViewer: Page loaded', state.pageNumber);

      // Calculate safe render scale that won't exceed canvas limits
      const base = p.getViewport({ scale: 1 });
      const maxSide = 8192;
      const maxPixels = 140_000_000;

      const bySide = Math.min(maxSide / base.width, maxSide / base.height);
      const byPixels = Math.sqrt(maxPixels / (base.width * base.height));
      const cap = Math.max(1, Math.min(bySide, byPixels));
      const safeScale = Math.min(renderScale, cap);

      console.log('PDFViewer: Render dimensions check', {
        baseWidth: base.width,
        baseHeight: base.height,
        requestedScale: renderScale,
        cappedScale: safeScale,
        finalWidth: base.width * safeScale,
        finalHeight: base.height * safeScale,
        wasCapped: renderScale > cap,
      });

      setCappedRenderScale(safeScale);
      setPageInstance(p);

      // Re-render layer canvas if layers are toggled
      if (layerVersion > 0 && layerCanvasRef.current && optionalContentConfig) {
        console.log('PDFViewer: Re-rendering layer canvas for new page');
        renderLayerCanvas(p, safeScale, layers);
      }
    })();
  }, [pdfInstance, state.pageNumber, renderScale, layers, layerVersion, optionalContentConfig]);

  const renderLayerCanvas = async (page: any, scale: number, layerStates: PDFLayer[]) => {
    if (!layerCanvasRef.current || !optionalContentConfig) return;

    const canvas = layerCanvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    // Cancel any existing render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Set white background
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Set visibility for all layers based on provided layer states
    for (const layer of layerStates) {
      try {
        optionalContentConfig.setVisibility(layer.id, layer.visible);
      } catch (err) {
        console.error(`Failed to set layer ${layer.name}:`, err);
      }
    }

    // Render
    renderTaskRef.current = page.render({
      canvasContext: context,
      viewport: viewport,
      optionalContentConfigPromise: Promise.resolve(optionalContentConfig),
    });

    try {
      await renderTaskRef.current.promise;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Layer canvas render error:', err);
      }
    } finally {
      renderTaskRef.current = null;
    }
  };

  const pickRenderScale = (page: any, desired: number) => {
    const base = page.getViewport({ scale: 1 });
    const maxSide = 8192;
    const maxPixels = 140_000_000;

    const bySide = Math.min(maxSide / base.width, maxSide / base.height);
    const byPixels = Math.sqrt(maxPixels / (base.width * base.height));
    const cap = Math.max(1, Math.min(bySide, byPixels));

    const finalScale = Math.min(desired, cap);

    console.log('PDFViewer: pickRenderScale', {
      baseWidth: base.width,
      baseHeight: base.height,
      desired,
      cap,
      finalScale,
      wouldExceedLimit: desired > cap,
    });

    return finalScale;
  };

  const updateRenderScale = async (newScale: number) => {
    console.log('PDFViewer: Updating render scale', {
      oldScale: renderScale,
      newScale,
    });
    setRenderScale(newScale);
    if (!assessmentId) return;

    setSavingScale(true);
    try {
      await fetch(`/api/assessments/${assessmentId}/pdf-scale`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_scale: newScale }),
      });
    } catch (err) {
      console.error('Failed to save PDF scale:', err);
    } finally {
      setSavingScale(false);
    }
  };

  const toggleLayer = async (layerId: string) => {
    if (!optionalContentConfig || !pageInstance || !layerCanvasRef.current) return;

    console.log('[toggleLayer] Toggling layer', layerId);

    // Calculate updated layer states
    const updatedLayers = layers.map(layer =>
      layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
    );

    console.log('[toggleLayer] Updated layer states:');
    updatedLayers.forEach(layer => {
      console.log(`  ${layer.name}: ${layer.visible}`);
    });

    // Update React state
    setLayers(updatedLayers);

    // Re-render the layer canvas with updated visibility
    await renderLayerCanvas(pageInstance, cappedRenderScale, updatedLayers);

    // Increment version for React reconciliation (UI state only)
    setLayerVersion(prev => {
      console.log('[toggleLayer] Incrementing layer version from', prev, 'to', prev + 1);
      return prev + 1;
    });
  };

  const findElementTemplate = async (
    elementSlug: 'bathroom' | 'door' | 'kitchen'
  ): Promise<string | null> => {
    // Element groups mapped to their IDs from database
    const elementGroupIds: Record<string, string> = {
      bathroom: 'f9557ba0-1cf6-41b2-a030-984cfe0c8c15',
      door: '3cf23143-d9cc-436c-885e-fa6391c20caf',
      kitchen: '709e704b-35d8-47f1-8ba0-92c22fdf3008',
    };

    const elementGroupId = elementGroupIds[elementSlug];
    if (!elementGroupId) {
      console.error(`[findElementTemplate] No element group ID for ${elementSlug}`);
      return null;
    }
    if (!assessmentId) {
      console.error(`[findElementTemplate] No assessment ID available for ${elementSlug}`);
      return null;
    }

    try {
      // Find the template check (instance_number = 0) for this element group
      console.log(`[findElementTemplate] Fetching checks for assessment ${assessmentId}`);
      const res = await fetch(`/api/assessments/${assessmentId}/checks`);

      if (!res.ok) {
        console.error(`[findElementTemplate] API error: ${res.status} ${res.statusText}`);
        return null;
      }

      const checks = await res.json();
      console.log(
        `[findElementTemplate] Found ${checks.length} parent checks, searching for ${elementSlug} template`
      );

      // Find template check for this element group
      const template = checks.find(
        (c: any) => c.element_group_id === elementGroupId && c.instance_number === 0
      );

      if (template) {
        console.log(`[findElementTemplate] Found template for ${elementSlug}: ${template.id}`);
      } else {
        console.error(
          `[findElementTemplate] No template found for ${elementSlug} (element_group_id: ${elementGroupId})`
        );
      }

      return template?.id || null;
    } catch (error) {
      console.error(`[findElementTemplate] Error finding ${elementSlug} template:`, error);
      return null;
    }
  };

  const capture = async (target: 'current' | 'bathroom' | 'door' | 'kitchen' = 'current') => {
    try {
      if (readOnly || !state.selection || !pageInstance) return;

      // Prevent concurrent captures
      if (capturingRef.current) {
        console.log('[capture] Already capturing, ignoring duplicate call');
        return;
      }
      capturingRef.current = true;

      // Clear selection immediately for better UX (optimistic update)
      const savedSelection = { ...state.selection };
      dispatch({ type: 'CLEAR_SELECTION' });

      let targetCheckId = activeCheck?.id;

      // If saving to new element, create instance first
      if (target !== 'current') {
        console.log(`[capture] Creating new instance for target: ${target}`);
        const templateCheckId = await findElementTemplate(target);
        if (!templateCheckId) {
          alert(
            `Could not find ${target} template check. Please ensure ${target}s are enabled for this assessment.`
          );
          return;
        }

        console.log(`[capture] Cloning template ${templateCheckId} for ${target}`);
        // Clone the template to create new instance
        const cloneRes = await fetch(`/api/checks/${templateCheckId}/clone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instanceLabel: undefined, // Auto-generate
            copyScreenshots: false,
          }),
        });

        if (!cloneRes.ok) {
          const errorData = await cloneRes.json();
          alert(`Failed to create new ${target} instance: ${errorData.error || 'Unknown error'}`);
          return;
        }

        const { check: newCheck } = await cloneRes.json();
        targetCheckId = newCheck.id;

        // Add check to state and select it (reuse CheckList pattern)
        if (onCheckAdded) {
          onCheckAdded(newCheck);
        }

        // Select the new check
        if (onCheckSelect) {
          onCheckSelect(newCheck.id);
        }
      }

      if (!targetCheckId) {
        alert('No check selected. Please select a check first.');
        return;
      }

      // Get the actual canvas element to understand its coordinate system
      const canvas = pageContainerRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) {
        console.error('capture() cannot find canvas element');
        return;
      }

      console.log('capture() canvas info:', {
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        ratio: canvas.width / canvas.clientWidth,
      });

      // Selection coordinates are relative to the pageContainer (in CSS pixels)
      // Use savedSelection since we cleared state.selection early
      const sx = Math.min(savedSelection.startX, savedSelection.endX);
      const sy = Math.min(savedSelection.startY, savedSelection.endY);
      const sw = Math.abs(savedSelection.endX - savedSelection.startX);
      const sh = Math.abs(savedSelection.endY - savedSelection.startY);

      console.log('capture() selection in CSS pixels:', { sx, sy, sw, sh });

      // The canvas internal resolution is higher than CSS pixels
      // Convert CSS pixels to canvas pixels
      const canvasScale = canvas.width / canvas.clientWidth;
      const canvasSx = sx * canvasScale;
      const canvasSy = sy * canvasScale;
      const canvasSw = sw * canvasScale;
      const canvasSh = sh * canvasScale;

      console.log('capture() selection in canvas pixels:', {
        canvasSx,
        canvasSy,
        canvasSw,
        canvasSh,
        canvasScale,
      });

      // Render page offscreen at high resolution
      const screenshotRenderScale = pickRenderScale(pageInstance, renderScale);
      const viewport = pageInstance.getViewport({ scale: screenshotRenderScale });

      console.log('capture() render viewport:', {
        width: viewport.width,
        height: viewport.height,
        renderScale: screenshotRenderScale,
      });

      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = Math.ceil(viewport.width);
      offscreenCanvas.height = Math.ceil(viewport.height);
      const ctx = offscreenCanvas.getContext('2d')!;

      console.log('capture() rendering PDF page at high resolution...');
      const renderStart = performance.now();
      await pageInstance.render({ canvasContext: ctx, viewport }).promise;
      const renderEnd = performance.now();
      console.log('capture() PDF render complete in', (renderEnd - renderStart).toFixed(0), 'ms');

      // Map from canvas pixels to render pixels
      // Both the displayed canvas and the offscreen render are at different scales from the natural PDF
      // We need to find the ratio between them
      const renderToDisplayedRatio = viewport.width / canvas.width;

      const rx = Math.max(0, Math.floor(canvasSx * renderToDisplayedRatio));
      const ry = Math.max(0, Math.floor(canvasSy * renderToDisplayedRatio));
      const rw = Math.max(1, Math.ceil(canvasSw * renderToDisplayedRatio));
      const rh = Math.max(1, Math.ceil(canvasSh * renderToDisplayedRatio));

      console.log('capture() render coords:', {
        rx,
        ry,
        rw,
        rh,
        renderToDisplayedRatio,
      });

      // Clamp to page bounds
      const cx = Math.min(rx, offscreenCanvas.width - 1);
      const cy = Math.min(ry, offscreenCanvas.height - 1);
      const cw = Math.min(rw, offscreenCanvas.width - cx);
      const ch = Math.min(rh, offscreenCanvas.height - cy);

      console.log('capture() clamped coords:', {
        cx,
        cy,
        cw,
        ch,
        offscreenW: offscreenCanvas.width,
        offscreenH: offscreenCanvas.height,
      });

      if (cw < 5 || ch < 5) {
        console.warn('capture() WARNING: selection was clamped to tiny size:', { cw, ch });
        console.warn('This usually means coordinates are outside the page bounds');
      }

      const crop = { x: cx, y: cy, w: cw, h: ch };
      console.log('capture() final crop:', crop);
      const out = document.createElement('canvas');
      out.width = crop.w;
      out.height = crop.h;
      const octx = out.getContext('2d')!;
      octx.drawImage(offscreenCanvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

      // Thumbnail
      const thumbMax = 240;
      const ratio = Math.min(1, thumbMax / Math.max(crop.w, crop.h));
      const tw = Math.max(1, Math.round(crop.w * ratio));
      const th = Math.max(1, Math.round(crop.h * ratio));
      const tcanvas = document.createElement('canvas');
      tcanvas.width = tw;
      tcanvas.height = th;
      const tctx = tcanvas.getContext('2d')!;
      tctx.drawImage(out, 0, 0, tw, th);

      console.log('capture() converting canvases to PNG blobs...');
      const blobStart = performance.now();
      const [blob, thumb] = await Promise.all([
        new Promise<Blob>(resolve => out.toBlob(b => resolve(b!), 'image/png')),
        new Promise<Blob>(resolve => tcanvas.toBlob(b => resolve(b!), 'image/png')),
      ]);
      const blobEnd = performance.now();
      console.log('capture() blob conversion complete in', (blobEnd - blobStart).toFixed(0), 'ms');

      // Get presigned upload targets
      console.log('capture() fetching presigned URLs...');
      const presignStart = performance.now();
      const res = await fetch('/api/screenshots/presign', {
        method: 'POST',
        body: JSON.stringify({
          projectId: activeCheck?.project_id || assessmentId,
          checkId: targetCheckId,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        console.error('capture() presign failed:', res.status, await res.text());
        throw new Error('Failed to get presigned URLs');
      }
      const { _screenshotId, uploadUrl, key, thumbUploadUrl, thumbKey } = await res.json();
      const presignEnd = performance.now();
      console.log('capture() got presigned URLs in', (presignEnd - presignStart).toFixed(0), 'ms');

      console.log('capture() uploading to S3 in parallel...');
      const uploadStart = performance.now();
      await Promise.all([
        fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/png' },
          body: blob,
        }),
        fetch(thumbUploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/png' },
          body: thumb,
        }),
      ]);
      const uploadEnd = performance.now();
      console.log('capture() S3 upload complete in', (uploadEnd - uploadStart).toFixed(0), 'ms');

      // Persist metadata in DB
      console.log('capture() saving to database...');
      const dbStart = performance.now();
      const dbRes = await fetch('/api/screenshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          check_id: targetCheckId,
          page_number: state.pageNumber,
          crop_coordinates: {
            x: sx,
            y: sy,
            width: sw,
            height: sh,
            zoom_level: state.transform.scale,
          },
          screenshot_url: `s3://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME || 'bucket'}/${key}`,
          thumbnail_url: `s3://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME || 'bucket'}/${thumbKey}`,
          caption: '',
        }),
      });
      const dbEnd = performance.now();
      if (!dbRes.ok) {
        console.error('capture() database save failed:', dbRes.status, await dbRes.text());
        throw new Error('Failed to save screenshot to database');
      }
      console.log('capture() database save complete in', (dbEnd - dbStart).toFixed(0), 'ms');
      console.log('capture() complete!');

      // Selection already cleared at start for better UX
      if (onScreenshotSaved) onScreenshotSaved();
    } catch (error) {
      console.error('capture() failed with error:', error);
      alert(
        'Failed to save screenshot: ' + (error instanceof Error ? error.message : 'Unknown error')
      );
    } finally {
      capturingRef.current = false;
    }
  };

  if (loadingUrl) {
    return (
      <div className="p-6 text-center">
        <div>Loading PDF...</div>
        <div className="text-sm text-gray-500 mt-2">PDF URL: {pdfUrl}</div>
      </div>
    );
  }

  if (!presignedUrl) {
    return (
      <div className="p-6 text-center text-red-600">
        <div>Failed to load PDF</div>
        <div className="text-sm text-gray-500 mt-2">Original URL: {pdfUrl}</div>
        <div className="text-xs text-gray-400 mt-1">Check browser console for more details</div>
      </div>
    );
  }

  const zoomPct = Math.round(state.transform.scale * 100);

  return (
    <div
      ref={viewportRef}
      tabIndex={0}
      role="region"
      aria-label="PDF viewer"
      className="relative h-full w-full outline-none overscroll-contain"
      style={{ touchAction: 'none' }}
    >
      {state.screenshotMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-blue-600 text-white px-4 py-2 rounded shadow-lg text-sm font-medium">
            📸 Screenshot Mode: Click and drag to select area
          </div>
        </div>
      )}

      {state.screenshotMode && state.selection && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 flex gap-2 pointer-events-none">
          <kbd className="px-3 py-2 bg-white shadow-md rounded text-sm border-2 border-blue-500 font-mono">
            C - Current Check
          </kbd>
          <kbd className="px-3 py-2 bg-white shadow-md rounded text-sm border-2 border-gray-300 font-mono">
            B - Bathroom
          </kbd>
          <kbd className="px-3 py-2 bg-white shadow-md rounded text-sm border-2 border-gray-300 font-mono">
            D - Door
          </kbd>
          <kbd className="px-3 py-2 bg-white shadow-md rounded text-sm border-2 border-gray-300 font-mono">
            K - Kitchen
          </kbd>
        </div>
      )}

      <div className="absolute top-3 right-3 z-50 flex items-center gap-2 pointer-events-auto">
        <button
          aria-label="Zoom out"
          className="btn-icon bg-white shadow-md"
          onClick={() => zoom('out')}
        >
          −
        </button>
        <div className="px-2 py-2 text-sm bg-white border rounded shadow-md">{zoomPct}%</div>
        <button
          aria-label="Zoom in"
          className="btn-icon bg-white shadow-md"
          onClick={() => zoom('in')}
        >
          +
        </button>
        <div className="flex items-center gap-1 bg-white border rounded shadow-md px-2 py-1">
          <span className="text-xs text-gray-600 whitespace-nowrap">Detail:</span>
          <button
            aria-label="Decrease resolution"
            className="btn-icon bg-white text-xs px-1.5 py-0.5"
            onClick={() => updateRenderScale(Math.max(1, renderScale - 0.5))}
            disabled={savingScale || renderScale <= 1}
          >
            −
          </button>
          <span className="text-xs font-medium w-8 text-center">{renderScale.toFixed(1)}x</span>
          <button
            aria-label="Increase resolution"
            className="btn-icon bg-white text-xs px-1.5 py-0.5"
            onClick={() => updateRenderScale(Math.min(10, renderScale + 0.5))}
            disabled={savingScale || renderScale >= 10}
          >
            +
          </button>
        </div>
        {layers.length > 0 && (
          <button
            aria-pressed={showLayerPanel}
            aria-label="Toggle layers panel"
            className={`btn-icon shadow-md ${showLayerPanel ? 'bg-blue-600 text-white' : 'bg-white'}`}
            onClick={() => setShowLayerPanel(!showLayerPanel)}
            title="Layers"
          >
            ☰
          </button>
        )}
        {!readOnly && (
          <>
            <button
              aria-pressed={state.screenshotMode}
              aria-label="Toggle screenshot mode (S)"
              title="Capture a portion of the plan to be checked against a code section or saved as an instance of an element"
              className={`btn-icon shadow-md ${state.screenshotMode ? 'bg-blue-600 text-white' : 'bg-white'}`}
              onClick={() => dispatch({ type: 'TOGGLE_SCREENSHOT_MODE' })}
            >
              📸
            </button>
            {state.screenshotMode && state.selection && (
              <button className="btn-secondary shadow-md" onClick={() => capture('current')}>
                Save to Current
              </button>
            )}
          </>
        )}
      </div>

      {/* Layer Panel */}
      {showLayerPanel && layers.length > 0 && (
        <div className="absolute top-16 right-3 z-50 bg-white border rounded shadow-lg p-3 w-64 pointer-events-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">PDF Layers</h3>
            <button
              className="text-xs text-gray-500 hover:text-gray-700"
              onClick={() => setShowLayerPanel(false)}
            >
              ✕
            </button>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {layers.map(layer => (
              <label
                key={layer.id}
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
              >
                <input
                  type="checkbox"
                  checked={layer.visible}
                  onChange={() => toggleLayer(layer.id)}
                  className="w-4 h-4"
                />
                <span className="text-sm">{layer.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div
        className={`absolute inset-0 overflow-hidden ${
          state.screenshotMode
            ? 'cursor-crosshair'
            : state.isDragging
              ? 'cursor-grabbing'
              : 'cursor-grab'
        }`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          if (!state.screenshotMode) dispatch({ type: 'END_DRAG' });
        }}
        style={{ clipPath: 'inset(0)' }}
      >
        <div
          style={{
            transform: `translate(${state.transform.tx}px, ${state.transform.ty}px) scale(${state.transform.scale})`,
            transformOrigin: '0 0',
            willChange: 'transform',
            position: 'absolute',
            left: 0,
            top: 0,
          }}
        >
          <Document
            file={presignedUrl}
            onLoadSuccess={onDocLoad}
            onLoadError={onDocError}
            loading={<div className="text-sm text-gray-500">Loading PDF…</div>}
            error={<div className="text-sm text-red-500">Failed to load PDF document</div>}
          >
            <div ref={pageContainerRef} style={{ position: 'relative' }}>
              <Page
                key={`page-${state.pageNumber}-layers-${layerVersion}-scale-${cappedRenderScale}`}
                pageNumber={state.pageNumber}
                scale={cappedRenderScale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onRenderSuccess={() => {
                  console.log('PDFViewer: Page rendered successfully', {
                    pageNumber: state.pageNumber,
                    requestedScale: renderScale,
                    actualScale: cappedRenderScale,
                    viewportScale: state.transform.scale,
                    layerVersion,
                  });
                }}
                onRenderError={(error: Error) => {
                  console.error('PDFViewer: Page render error', {
                    pageNumber: state.pageNumber,
                    requestedScale: renderScale,
                    actualScale: cappedRenderScale,
                    error,
                  });
                }}
              />
              {/* Layer-controlled canvas overlay - only visible when layers are toggled */}
              {layers.length > 0 && (
                <canvas
                  ref={layerCanvasRef}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    pointerEvents: 'none',
                    display: layerVersion > 0 ? 'block' : 'none', // Only show after first layer toggle
                  }}
                />
              )}
              {state.screenshotMode && state.selection && (
                <div
                  className="pointer-events-none"
                  style={{
                    position: 'absolute',
                    left: Math.min(state.selection.startX, state.selection.endX),
                    top: Math.min(state.selection.startY, state.selection.endY),
                    width: Math.abs(state.selection.endX - state.selection.startX),
                    height: Math.abs(state.selection.endY - state.selection.startY),
                    border: '2px solid rgba(37, 99, 235, 0.8)',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    zIndex: 40,
                  }}
                />
              )}
              {/* Violation Markers */}
              {readOnly &&
                violationMarkers
                  .filter(marker => marker.pageNumber === state.pageNumber)
                  .map((marker, idx) => (
                    <ViolationMarker
                      key={`${marker.checkId}-${marker.screenshotId}-${idx}`}
                      marker={marker}
                      onClick={onMarkerClick || (() => {})}
                      isVisible={true}
                    />
                  ))}
            </div>
          </Document>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 z-50 flex items-center gap-3 bg-white rounded px-3 py-2 border shadow-md pointer-events-auto">
        <button
          className="btn-icon bg-white"
          onClick={() => dispatch({ type: 'SET_PAGE', payload: Math.max(1, state.pageNumber - 1) })}
          aria-label="Previous page"
        >
          ◀
        </button>
        <div className="text-sm font-medium">
          Page {state.pageNumber} / {state.numPages || '…'}
        </div>
        <button
          className="btn-icon bg-white"
          onClick={() =>
            dispatch({
              type: 'SET_PAGE',
              payload: Math.min(state.numPages || state.pageNumber, state.pageNumber + 1),
            })
          }
          aria-label="Next page"
        >
          ▶
        </button>
        <span className="text-xs text-gray-600 ml-2 hidden sm:inline">
          Shortcuts: ←/→, -/+, 0, S, Esc
        </span>
      </div>
    </div>
  );
}
```

---

## Summary

This component is a critical part of the application but has become unmaintainable due to:

1. **Dual rendering system** causing layer visibility bugs
2. **Excessive state variables** (16 total) with complex interdependencies
3. **1350 lines** mixing multiple concerns
4. **Synchronization issues** between react-pdf and manual canvas rendering

The recommended approach is to start with a quick fix (Option A) to resolve the immediate bugs, then gradually extract components (Option B) to improve maintainability. A complete rewrite (Option C) should only be considered if the component continues to accumulate complexity.
