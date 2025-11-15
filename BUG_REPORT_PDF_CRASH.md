# PDF Viewer Crash Bug Report

## Issue Summary

**Production URL**: https://service-set4.vercel.app/assessments/3a4f29fc-9f6e-410d-bfd8-fc9ac8d41c83

**Symptom**: When navigating to page 7 of the PDF in production, the viewer crashes with:
```
TypeError: Cannot read properties of null (reading 'width')
    at 1278.82071e6dee01ffbd.js?dpl=dpl_5fCh6mhnCuBzXEYzTz2ZpriTV817:1:323
```

**Reproduction**:
1. Open production URL
2. Navigate to page 7
3. App crashes after ~10-15 component renders

**Environment**:
- **Production**: CRASHES on page 7
- **Development (localhost)**: Does NOT crash on same PDF/page
- **Same PDF tested in both environments**

---

## Observable Behavior from Console Logs

### What happens before crash:

```
[PDFViewer] Component render #7: {pageNumber: 6, ...}
[PDFViewer] After usePdfLayers
[PDFViewer] ★★★ PAGE CENTER EFFECT #2 ★★★
[PDFViewer] PAGE CENTER: Getting viewport...
[PDFViewer] PAGE CENTER: Got viewport: K {viewBox: Array(4), ...}
[PDFViewer] ★★★ RENDER EFFECT #3 ★★★
[PDFViewer] renderPage called, cancelling previous render

[PDFViewer] Component render #9: {pageNumber: 7, ...}
[PDFViewer] After usePdfLayers
[PDFViewer] Component render #10: {pageNumber: 7, ...}
[PDFViewer] After usePdfLayers

TypeError: Cannot read properties of null (reading 'width')
```

### Key observations:

1. **No effect logs fire for page 7** - PAGE CENTER EFFECT only runs for page 6, NOT page 7
2. **Component renders 10 times** before crash
3. **changedProps: Array(0)** - No props are changing between renders (infinite loop from internal state)
4. **Crash happens AFTER hooks complete** ("After usePdfLayers" is the last log)
5. **RENDER EFFECT fires only 3-4 times** (not infinite)
6. **NO WHEEL EFFECT logs** appear before crash

---

## Architecture Context

### Component Hierarchy

```
app/assessments/[id]/page.tsx (Server Component)
└─ AssessmentClient.tsx (Client Component)
   └─ PDFViewer.tsx (where crash occurs)
      ├─ Uses hooks:
      │  ├─ usePresignedUrl
      │  ├─ usePdfDocument
      │  ├─ usePdfLayers
      │  ├─ useViewTransform
      │  ├─ usePdfPersistence
      │  ├─ useMeasurements
      │  └─ useCalibration
      └─ Has ~13 useEffect() calls
```

### Tech Stack


- **Next.js**: 15.5.3 (App Router, React 19)
- **PDF.js**: pdfjs-dist@4.10.38 (also has pdfjs-dist@5.3.93 - version conflict?)
- **Deployment**: Vercel (production build)
- **Environment**: Production uses minified bundle, dev uses unminified

### File Locations

- **Crashing component**: `components/pdf/PDFViewer.tsx`
- **Custom hooks**: `hooks/useViewTransform.ts`, `hooks/usePdfDocument.ts`, `hooks/usePdfLayers.ts`, etc.
- **Parent component**: `app/assessments/[id]/ui/AssessmentClient.tsx`

---

## Code Analysis

### All `.width` accesses in PDFViewer.tsx

These are the ONLY places in PDFViewer that access `.width` on an object:

#### 1. Line 402 - Violation highlighting effect (HAS null check)
```typescript
useEffect(() => {
  if (!readOnly || !highlightedViolationId || !canvasRef.current || !viewportRef.current) {
    return;
  }

  const [checkId, screenshotId] = highlightedViolationId.split(':::');
  const violation = violationMarkers.find(v => v.checkId === checkId);
  if (!violation) return;

  const screenshot = /* ... */;
  if (!screenshot) return;
  if (screenshot.pageNumber !== state.pageNumber) return;

  const bounds = screenshot.bounds;
  const hasValidBounds = bounds && bounds.width > 0 && bounds.height > 0; // ✓ NULL CHECK
  if (!hasValidBounds) return;

  const timeoutId = setTimeout(() => {
    setSmoothTransition(true);
    viewTransform.centerOn(bounds); // Could be issue if viewTransform.centerOn doesn't check
    setTimeout(() => setSmoothTransition(false), 500);
  }, 100);

  return () => clearTimeout(timeoutId);
}, [highlightedViolationId, state.pageNumber, readOnly, violationMarkers, viewTransform]);
```

#### 2. Line 430 - Text search centering effect (HAS null check)
```typescript
useEffect(() => {
  if (
    !textSearch.isOpen ||
    textSearch.matches.length === 0 ||
    !canvasRef.current ||
    !viewportRef.current
  ) {
    return;
  }

  const currentMatch = textSearch.matches[textSearch.currentIndex];
  if (!currentMatch) return;
  if (currentMatch.pageNumber !== state.pageNumber) return;

  const bounds = currentMatch.bounds;
  const hasValidBounds = bounds && bounds.width > 0 && bounds.height > 0; // ✓ NULL CHECK
  if (!hasValidBounds) return;

  const timeoutId = setTimeout(() => {
    setSmoothTransition(true);
    viewTransform.centerOn(bounds);
    setTimeout(() => setSmoothTransition(false), 500);
  }, 100);

  return () => clearTimeout(timeoutId);
}, [
  textSearch.isOpen,
  textSearch.matches,
  textSearch.currentIndex,
  state.pageNumber,
  viewTransform,
]);
```

#### 3. Lines 488, 493 - Page centering effect (NO null check for viewport)
```typescript
useEffect(() => {
  if (!page || !viewportRef.current) return;

  // Only center if we haven't centered this page yet
  if (pageCenteredRef.current === state.pageNumber) return;

  const viewport = page.getViewport({ scale: 1 }); // Could return null?
  const container = viewportRef.current;

  // Calculate what the centered position should be
  const centeredTx = (container.clientWidth - viewport.width) / 2; // ← CRASH HERE if viewport is null
  const centeredTy = (container.clientHeight - viewport.height) / 2;

  // Check if current transform would put the page off-screen or is initial load
  const isOffScreen =
    transform.tx < -viewport.width || // ← OR HERE
    transform.tx > container.clientWidth ||
    transform.ty < -viewport.height ||
    transform.ty > container.clientHeight;

  const isInitialLoad = transform.tx === 0 && transform.ty === 0 && transform.scale === 1;

  if (isInitialLoad || isOffScreen) {
    setTransform({ tx: centeredTx, ty: centeredTy, scale: 1 });
    // Mark this page as centered
    pageCenteredRef.current = state.pageNumber;
  }
}, [page, state.pageNumber]); // NOTE: Missing transform/setTransform in deps - stale closure issue
```

**ISSUE**: This effect depends on `transform` and calls `setTransform` but they're NOT in the dependency array. This creates a stale closure.

#### 4. Line 670, 676-677 - Calibration callback (in useCallback, not effect)
```typescript
const saveCalibration = useCallback(
  async (scaleNotation: string, printWidth: number, printHeight: number) => {
    if (!projectId || !page) return;

    try {
      // Get PDF dimensions in points for calculation
      const viewport = page.getViewport({ scale: 1 });

      await calibrationHook.actions.savePageSize(
        scaleNotation,
        printWidth,
        printHeight,
        viewport.width,  // ← CRASH HERE if viewport is null
        viewport.height
      );
      // ...
    }
  },
  [projectId, page, calibrationHook.actions, measurementsHook.actions]
);
```

**NOTE**: This is a callback, not an effect that runs automatically, so unlikely to be the crash source.

#### 5. Lines 1577-1578 - JSX render (conditional)
```typescript
<CalibrationModal
  // ...
  pdfDimensions={
    page
      ? {
          width: page.getViewport({ scale: 1 }).width,  // ← CRASH HERE if getViewport returns null
          height: page.getViewport({ scale: 1 }).height,
        }
      : undefined
  }
/>
```

**ISSUE**: Guards for `page` being truthy, but NOT for `page.getViewport()` returning null.

---

### useViewTransform.centerOn() - Called from effects

```typescript
// hooks/useViewTransform.ts
const centerOn = useCallback(
  (bounds: { x: number; y: number; width: number; height: number }) => {
    const container = containerRef.current;
    if (!container) return;

    const centerX = bounds.x + bounds.width / 2;  // ← CRASH HERE if bounds is null
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
```

**NOTE**: PDFViewer checks bounds before calling this, but if those checks are bypassed or stale, crash occurs here.

---

## Hook Architecture Issues

### Problem: Hooks returning non-memoized objects

Several custom hooks return plain objects without `useMemo`, causing new references on every render:

#### usePdfDocument (FIXED in commit ad48dff)
```typescript
// BEFORE (causes infinite loops):
return {
  state: { doc, page, numPages, loading, error },
  actions: { setPage }
};

// AFTER:
const state = useMemo(() => ({ doc, page, numPages, loading, error }), [doc, page, numPages, loading, error]);
const actions = useMemo(() => ({ setPage }), [setPage]);
return { state, actions };
```

#### usePdfLayers (FIXED in commit df859c3)
Similar memoization applied.

#### useViewTransform (NOT FIXED - could still be an issue)
```typescript
// Current code:
return {
  zoom,
  reset,
  centerOn,
  attachWheelZoom,
};

// This creates NEW object reference on every render
// If used in effect dependencies, causes infinite loops
```

**PDFViewer usage**:
```typescript
const viewTransform = useViewTransform(viewportRef, transform, setTransform);

// Used in effect deps:
useEffect(() => {
  // ...
}, [viewTransform]); // ← NEW REFERENCE EVERY RENDER = INFINITE LOOP
```

---

## Potential Root Causes

### Hypothesis 1: `page.getViewport()` returns null in production

**Evidence**:
- Crash is `Cannot read properties of null (reading 'width')`
- Multiple places call `page.getViewport({ scale: 1 }).width` without null check
- Page centering effect (line 488) has no null guard for viewport
- Works in dev but not prod (timing/optimization difference)

**Why different in prod vs dev?**:
- Dev: React Strict Mode runs effects twice, different timing
- Prod: Single effect execution, different React optimization
- Prod: Minified/optimized code might execute in different order
- Page object lifecycle might differ in production build

**Test**:
Add null check:
```typescript
const viewport = page.getViewport({ scale: 1 });
if (!viewport) return; // Guard against null
```

### Hypothesis 2: Infinite render loop corrupts state

**Evidence**:
- Component renders 10-15 times before crash
- `changedProps: Array(0)` - no props changing
- Crash happens on specific page (7) not others

**Why page 7 specifically?**:
- Page 7 might have different dimensions/aspect ratio
- Page centering logic might calculate invalid transform
- Transform update triggers re-render → recalculate → update → loop

**Test**:
Add logging to see if `setTransform` is being called repeatedly.

### Hypothesis 3: `useViewTransform` reference instability

**Evidence**:
- `useViewTransform` returns plain object (not memoized)
- Used in effect dependencies
- Could cause effects to fire repeatedly
- Logs show RENDER EFFECT firing multiple times

**Why crashes eventually?**:
- Repeated effect executions
- `page` object gets destroyed/nulled mid-execution
- Race condition between page change and effect execution

**Test**:
Memoize useViewTransform return value:
```typescript
return useMemo(
  () => ({ zoom, reset, centerOn, attachWheelZoom }),
  [zoom, reset, centerOn, attachWheelZoom]
);
```

### Hypothesis 4: Page centering effect stale closure

**Evidence**:
```typescript
useEffect(() => {
  // Uses transform and setTransform
  if (isInitialLoad || isOffScreen) {
    setTransform({ tx: centeredTx, ty: centeredTy, scale: 1 });
  }
}, [page, state.pageNumber]); // ← Missing transform, setTransform
```

**Issue**: Effect captures old `transform` value, calculates wrong position, calls `setTransform`, triggers re-render, effect runs again with stale transform, infinite loop.

**Test**:
Add `transform` and `setTransform` to dependency array.

---

## Why It Works in Dev But Not Prod

### React Strict Mode (dev only)
- Runs effects twice
- Helps detect issues but changes timing
- Might mask race conditions

### Build Optimizations
- Prod uses minified code
- Dead code elimination
- Different execution order
- Inlining/hoisting changes timing

### Concurrent Features
- React 18/19 concurrent rendering
- Different behavior in dev vs prod
- Effects might batch differently

---

## Stack Trace Analysis

```
TypeError: Cannot read properties of null (reading 'width')
    at 1278.82071e6dee01ffbd.js:1:323  ← MINIFIED, can't map to source
```

**Limitation**: Minified production bundle makes it impossible to know which exact line is crashing without source maps.

**Possible lines** (from source code analysis):
- Line 488: `container.clientWidth - viewport.width`
- Line 493: `transform.tx < -viewport.width`
- Line 676: `viewport.width` in calibration
- Line 1577: `page.getViewport({ scale: 1 }).width` in JSX
- Line 86 in useViewTransform: `bounds.x + bounds.width / 2`

---

## PDF.js Version Conflict

```
├── pdfjs-dist@4.10.38
└─┬ react-pdf@10.1.0
  └── pdfjs-dist@5.3.93
```

Two different versions of pdfjs-dist are installed. This could cause:
- API incompatibilities
- Different return types from `getViewport()`
- Race conditions in PDF loading

---

## Data Flow

### Page Navigation Flow

1. User clicks page 7
2. AssessmentClient updates `externalCurrentPage`
3. PDFViewer receives new `externalCurrentPage` prop
4. Effect updates internal `state.pageNumber`
5. Multiple effects react to `state.pageNumber` change:
   - Page centering effect
   - Render effect
   - Persistence effect
6. `usePdfDocument` loads new page
7. Render effects trigger PDF.js render
8. **CRASH** occurs somewhere in steps 5-7

### State Dependencies

```
externalCurrentPage (prop)
  → state.pageNumber (internal state)
    → page object (from usePdfDocument)
      → viewport (from page.getViewport())
        → transform calculations
          → setTransform
            → re-render
              → (loop back to step 3?)
```

---

## Test Cases to Isolate Issue

### Test 1: Does page.getViewport() return null?
```typescript
const viewport = page.getViewport({ scale: 1 });
console.log('viewport:', viewport, 'is null?', viewport === null);
```

### Test 2: Which effect crashes?
Add try-catch to each effect:
```typescript
useEffect(() => {
  try {
    console.log('[Effect X] Starting');
    // effect logic
    console.log('[Effect X] Completed');
  } catch (err) {
    console.error('[Effect X] CRASHED:', err);
  }
}, [deps]);
```

### Test 3: Is it a timing issue?
Add delays:
```typescript
const viewport = page.getViewport({ scale: 1 });
await new Promise(resolve => setTimeout(resolve, 100)); // Wait
const width = viewport.width;
```

### Test 4: Does it crash on other pages?
Test pages 1-10 to see if it's page-7-specific or intermittent.

---

## Infrastructure Context

### Deployment
- **Platform**: Vercel
- **Build**: Next.js production build (`next build`)
- **Environment**: Production uses `NODE_ENV=production`

### Environment Variables
Relevant env vars (from `.envrc`):
- Supabase connection
- AWS S3 credentials
- AI provider keys

**Not relevant to this crash** - crash is client-side render issue, not API/data fetching.

---

## Related Code Files

### Primary
- `components/pdf/PDFViewer.tsx` (1600+ lines) - Where crash occurs
- `hooks/useViewTransform.ts` - Returns non-memoized object
- `hooks/usePdfDocument.ts` - Loads PDF pages
- `hooks/usePdfLayers.ts` - Manages PDF layers

### Secondary
- `app/assessments/[id]/ui/AssessmentClient.tsx` - Parent component
- `hooks/usePdfPersistence.ts` - Saves page/transform to localStorage
- `lib/pdf/renderPdfPage.ts` - PDF.js render logic

---

## Previous Fix Attempts (all failed)

1. **Memoized usePdfDocument** (commit ad48dff) - Reduced renders but didn't fix crash
2. **Memoized usePdfLayers** (commit df859c3) - Reduced renders but didn't fix crash
3. **Memoized AssessmentClient callbacks** (commit e45cec0) - Didn't fix crash
4. **Added viewport null check in page center effect** (commit 20a6d71) - Didn't fix crash
5. **Memoized useViewTransform** (commit e2935b0) - Didn't fix crash
6. **Added defensive null checks everywhere** (commit c6eb6a9) - Didn't fix crash

**All commits reverted** - none solved the issue.

---

## Open Questions

1. Why does it crash on page 7 specifically?
2. Why does it work in dev but not prod?
3. Can `page.getViewport()` return null? (PDF.js documentation unclear)
4. Is there a race condition between page change and effect execution?
5. Is the PDF.js version conflict (4.10.38 vs 5.3.93) causing this?
6. Does the crash happen during render or during effect execution?
7. Is there source map available to map minified line 323 to actual source line?

---

## Recommendations for Debugging

1. **Enable source maps in production** to map crash line to actual source code
2. **Add error boundary** around PDFViewer to catch and log full error context
3. **Add comprehensive logging** to every effect to identify which one crashes
4. **Test with single PDF.js version** - remove react-pdf or align versions
5. **Test on different browsers** - might be browser-specific
6. **Reproduce locally with production build** - `npm run build && npm start`
7. **Binary search disable effects** - comment out effects one by one to isolate
8. **Check PDF.js documentation** - confirm getViewport() return type guarantees

---

## Code Snippets for Next Engineer

### Enable source maps (next.config.js)
```javascript
module.exports = {
  productionBrowserSourceMaps: true,
};
```

### Add error boundary
```typescript
class PDFErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    console.error('PDF VIEWER CRASHED:', error, errorInfo);
  }
  render() {
    return this.props.children;
  }
}
```

### Comprehensive effect logging template
```typescript
useEffect(() => {
  const effectId = 'PAGE_CENTER_EFFECT';
  console.log(`[${effectId}] START`);
  try {
    // ... effect logic
    console.log(`[${effectId}] COMPLETE`);
  } catch (err) {
    console.error(`[${effectId}] CRASH:`, err);
    throw err; // Re-throw to maintain stack trace
  }
}, [deps]);
```

### Null-safe viewport access pattern
```typescript
const viewport = page?.getViewport?.({ scale: 1 });
if (!viewport || viewport.width === undefined) {
  console.error('Invalid viewport:', viewport);
  return;
}
```

---

## End of Report
