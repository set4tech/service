# PDF Viewer Technical Report

**Date:** 2025-09-29
**Purpose:** Comprehensive analysis of PDF viewer implementation, architecture, and current issues

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Component Hierarchy](#component-hierarchy)
4. [Dependencies](#dependencies)
5. [HTML/CSS Structure](#htmlcss-structure)
6. [JavaScript/React Implementation](#javascriptreact-implementation)
7. [Screenshot Capture System](#screenshot-capture-system)
8. [Current Issues](#current-issues)
9. [Root Cause Analysis](#root-cause-analysis)
10. [Recommended Solutions](#recommended-solutions)

---

## 1. Executive Summary

The PDF viewer is a React-based component that displays PDF documents with pan/zoom capabilities and screenshot functionality. It uses **react-pdf v10.1.0** (Mozilla PDF.js wrapper) and implements custom transform logic for interactive viewing.

### Critical Issues Identified:

1. **Scroll conflict**: PDF viewer's wheel events propagate to parent, causing unwanted page scrolling
2. **Layout misalignment**: PDF viewer not positioned correctly on right side of screen
3. **Cramped UI**: Left sidebar elements lack proper spacing and visual hierarchy

---

## 2. Architecture Overview

### 2.1 Technology Stack

- **Framework**: Next.js 15.5.3 (React 19, App Router)
- **PDF Library**: react-pdf v10.1.0 (wrapper around PDF.js)
- **PDF Worker**: Loaded from unpkg CDN (`pdfjs-dist@${version}/build/pdf.worker.min.mjs`)
- **Styling**: Tailwind CSS 4.1 with custom component classes
- **State Management**: React hooks (useState, useEffect, useRef, useMemo)

### 2.2 Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Server Component: app/assessments/[id]/page.tsx            │
│  - Fetches assessment + checks from Supabase                │
│  - Extracts PDF URL from projects table                     │
│  - Calculates progress metrics                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Client Component: AssessmentClient.tsx                     │
│  - Manages active check state                               │
│  - Coordinates left panel (checks) + right panel (PDF)      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ├──────────────┬──────────────┐
                       ▼              ▼              ▼
            ┌──────────────┐  ┌─────────────┐  ┌──────────────┐
            │ Left Sidebar │  │  CheckTabs  │  │ PDFWrapper   │
            │   (aside)    │  │PromptEditor │  │   (section)  │
            │              │  │AnalysisPanel│  │              │
            │              │  │ScreenshotGal│  │              │
            └──────────────┘  └─────────────┘  └──────┬───────┘
                                                       │
                                                       ▼
                                        ┌──────────────────────┐
                                        │  PDFViewer.tsx       │
                                        │  - Fetch presigned   │
                                        │  - Render PDF pages  │
                                        │  - Handle pan/zoom   │
                                        │  - Screenshot mode   │
                                        └──────────────────────┘
```

---

## 3. Component Hierarchy

### 3.1 File Structure

```
app/assessments/[id]/
├── page.tsx                    # Server component (data fetching)
├── ui/
│   └── AssessmentClient.tsx   # Client component (main layout)
├── loading.tsx                # Loading boundary
└── error.tsx                  # Error boundary

components/
├── pdf/
│   ├── PDFViewerWrapper.tsx   # Dynamic import wrapper (SSR safety)
│   └── PDFViewer.tsx          # Main PDF viewer logic
├── checks/
│   └── CheckTabs.tsx          # Check filter/selection
├── prompts/
│   └── PromptEditor.tsx       # Prompt editing UI
├── analysis/
│   └── AnalysisPanel.tsx      # AI analysis display
└── screenshots/
    └── ScreenshotGallery.tsx  # Screenshot thumbnails + modal
```

### 3.2 Component Responsibilities

#### **page.tsx** (Server Component)

- **Purpose**: Data fetching layer
- **Operations**:
  - Queries Supabase for assessment + checks
  - Joins with projects table to get PDF URL
  - Calculates progress (completed/total checks)
- **Output**: Passes props to AssessmentClient

#### **AssessmentClient.tsx** (Client Component)

- **Purpose**: Layout coordinator and state manager
- **State**:
  - `activeCheckId`: Currently selected check
  - `pdfUrl`: S3 URL of PDF document
  - `screenshotsChanged`: Refresh trigger for gallery
- **Layout**: 2-column grid (`grid-cols-1 lg:grid-cols-2 h-screen`)
  - Left: `<aside>` with checks, prompts, analysis, screenshots
  - Right: `<section>` with PDF viewer

#### **PDFViewerWrapper.tsx**

- **Purpose**: SSR safety + dynamic loading
- **Why needed**: PDF.js requires browser APIs (Canvas, Worker)
- **Implementation**:
  ```tsx
  const PDFViewerComponent = dynamic(
    () => import('./PDFViewer').then(mod => ({ default: mod.PDFViewer })),
    { ssr: false }
  );
  ```
- **Issue**: Wrapper adds extra `<div className="h-full w-full">` but may not propagate height correctly

#### **PDFViewer.tsx**

- **Purpose**: Core PDF rendering + interaction logic
- **Features**:
  1. PDF loading via presigned S3 URLs
  2. Mouse-based pan/zoom
  3. Keyboard shortcuts
  4. Screenshot capture with region selection
  5. Page navigation

---

## 4. Dependencies

### 4.1 react-pdf Library

**Package**: `react-pdf@10.1.0`
**Exports Used**:

- `Document`: Container component that loads PDF file
- `Page`: Renders individual PDF pages to canvas
- `pdfjs`: Core PDF.js library access

**Worker Configuration**:

```typescript
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
```

- PDF.js requires a web worker for parsing PDF files
- Worker loaded from CDN to avoid bundling issues
- Worker handles: decompression, rendering, text extraction

### 4.2 S3 Presigned URL Flow

**Problem**: PDF files stored in private S3 bucket
**Solution**: Generate temporary signed URLs

```
┌─────────────┐       ┌───────────────────┐       ┌──────────┐
│ PDFViewer   │──POST─▶│ /api/pdf/presign │──AWS──▶│ S3 Bucket│
│  component  │       │   (route handler) │       │          │
└─────────────┘       └───────────────────┘       └──────────┘
       │                      │                         │
       │    { url: https://  │                         │
       │    bucket.s3...?    │                         │
       │    Signature=... }  │                         │
       ◀──────JSON───────────┘                         │
       │                                                │
       │──────────GET presigned URL────────────────────▶│
       ◀──────────PDF file bytes─────────────────────── │
```

**API Route**: `app/api/pdf/presign/route.ts`

- Accepts: `{ pdfUrl: "s3://bucket/key" | "https://..." }`
- Extracts S3 key from URL
- Calls `presignGet(key, 3600)` (1 hour expiry)
- Returns: `{ url: "https://bucket.s3.region.amazonaws.com/key?..." }`

---

## 5. HTML/CSS Structure

### 5.1 Current DOM Structure

```html
<div class="grid grid-cols-1 lg:grid-cols-2 h-screen">
  <!-- LEFT SIDEBAR -->
  <aside class="border-r flex flex-col overflow-hidden bg-white">
    <!-- HEADER -->
    <div class="p-3 border-b">
      <div class="flex items-center justify-between mb-3">
        <div class="text-sm font-medium">Progress</div>
        <a href="/" class="btn-secondary">
          <svg width="16" height="16">...</svg>
          <span>My Projects</span>
        </a>
      </div>

      <!-- Progress bar -->
      <div class="progress mt-2" style="--value: 0%">
        <div class="bar"></div>
      </div>

      <!-- Check filter + tabs -->
      <div class="mt-2 text-sm">Active Checks:</div>
      <CheckTabs>
        <input class="input" placeholder="Filter checks…" />
        <div class="flex flex-wrap gap-2">
          <!-- Check buttons -->
        </div>
        <div class="text-xs text-gray-600">0 / 0 checks</div>
      </CheckTabs>
    </div>

    <!-- SCROLLABLE CONTENT -->
    <div class="p-3 overflow-auto stack-md">
      <!-- PromptEditor, AnalysisPanel, ScreenshotGallery -->
    </div>
  </aside>

  <!-- RIGHT PDF VIEWER -->
  <section class="relative overflow-hidden bg-gray-50 border border-gray-300">
    <div class="h-full w-full">
      <!-- PDFViewerWrapper -->
      <div class="relative h-full w-full outline-none" tabindex="0">
        <!-- PDFViewer -->

        <!-- Zoom controls (absolute top-right) -->
        <div class="absolute top-3 right-3 z-10">...</div>

        <!-- PDF canvas (absolute inset-0) -->
        <div class="absolute inset-0 overflow-hidden cursor-grab">
          <div
            class="absolute inset-0 flex items-center justify-center"
            style="transform: translate(0px, 0px) scale(1)"
          >
            <!-- react-pdf Document/Page -->
            <canvas>...</canvas>
          </div>
        </div>

        <!-- Page navigation (absolute bottom-left) -->
        <div class="absolute bottom-3 left-3 z-10">...</div>
      </div>
    </div>
  </section>
</div>
```

### 5.2 CSS Analysis

#### **Grid Layout**

```css
.grid {
  display: grid;
}
.grid-cols-1 {
  grid-template-columns: repeat(1, minmax(0, 1fr));
}
@media (min-width: 1024px) {
  .lg\:grid-cols-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.h-screen {
  height: 100vh;
}
```

- **Desktop**: 50/50 split (two equal columns)
- **Mobile**: Stacked (single column)
- **Height**: Fixed to viewport height

#### **Positioning Issues**

1. **PDF Viewer Container**:

   ```css
   .relative {
     position: relative;
   }
   .overflow-hidden {
     overflow: hidden;
   }
   ```

   - Container is `relative` but inner PDFViewer expects parent to define height
   - `h-full` on wrapper div should inherit from parent, but grid item height calculation may fail

2. **PDF Canvas Positioning**:

   ```css
   .absolute {
     position: absolute;
   }
   .inset-0 {
     top: 0;
     right: 0;
     bottom: 0;
     left: 0;
   }
   ```

   - Canvas layer correctly fills container
   - Transform applied to inner div for pan/zoom

3. **Flexbox in Sidebar**:
   ```css
   .flex {
     display: flex;
   }
   .flex-col {
     flex-direction: column;
   }
   .overflow-auto {
     overflow: auto;
   }
   ```

   - Sidebar is flex column
   - Content area has `overflow-auto` for scrolling
   - **CORRECT**: This prevents sidebar scroll from affecting main page

---

## 6. JavaScript/React Implementation

### 6.1 State Management

#### **PDFViewer State**

```typescript
const [numPages, setNumPages] = useState<number>(0);        // Total pages
const [pageNumber, setPageNumber] = useState<number>(1);    // Current page
const [transform, setTransform] = useState<Transform>({     // Pan/zoom
  x: 0,    // Horizontal pan (pixels)
  y: 0,    // Vertical pan (pixels)
  scale: 1 // Zoom level (1 = 100%)
});
const [isDragging, setIsDragging] = useState(false);        // Mouse drag state
const [screenshotMode, setScreenshotMode] = useState(false);// Screenshot active
const [selection, setSelection] = useState<{...} | null>(); // Screenshot region
const [presignedUrl, setPresignedUrl] = useState<string>(); // Loaded PDF URL
const [pdfInstance, setPdfInstance] = useState<any>();      // PDF.js instance
const [pageInstance, setPageInstance] = useState<any>();    // Current page obj
```

### 6.2 Event Handling

#### **Wheel Event (Zoom)**

```typescript
const handleWheel = useCallback((e: React.WheelEvent) => {
  e.preventDefault(); // ⚠️ CRITICAL: Prevents default scroll

  const scaleSpeed = 0.007;
  const scaleDelta = -e.deltaY * scaleSpeed;

  setTransform(prev => {
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * (1 + scaleDelta)));

    // Zoom towards mouse position
    const ratio = newScale / prev.scale;
    const rect = containerRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    const nx = cx - (cx - prev.x) * ratio;
    const ny = cy - (cy - prev.y) * ratio;

    return { x: nx, y: ny, scale: newScale };
  });
}, []);
```

**How it works**:

1. `e.preventDefault()` blocks default scroll behavior
2. Calculate scale change from wheel deltaY
3. Adjust pan (x, y) to zoom towards cursor position
4. Apply transform: `translate(x, y) scale(s)`

**Problem**: Event handler attached to inner div, but scroll may still propagate if event doesn't reach handler

#### **Mouse Events (Pan)**

```typescript
onMouseDown={(e) => {
  if (e.button !== 0) return;  // Left button only
  setIsDragging(true);
  dragStart.current = {
    x: e.clientX,
    y: e.clientY,
    tx: transform.x,
    ty: transform.y
  };
}}

onMouseMove={(e) => {
  if (!isDragging) return;
  const dx = e.clientX - dragStart.current.x;
  const dy = e.clientY - dragStart.current.y;
  setTransform(prev => ({
    ...prev,
    x: dragStart.current.tx + dx,
    y: dragStart.current.ty + dy
  }));
}}

onMouseUp={() => setIsDragging(false)}
```

**Cursor states**:

- Default: `cursor-grab`
- Dragging: `cursor-grabbing`

#### **Keyboard Shortcuts**

```typescript
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setPageNumber(p => Math.max(1, p - 1));
    if (e.key === 'ArrowRight') setPageNumber(p => Math.min(numPages, p + 1));
    if (e.key === '-') zoom('out');
    if (e.key === '+') zoom('in');
    if (e.key === '0') setTransform({ x: 0, y: 0, scale: 1 });
    if (e.key === 's') setScreenshotMode(v => !v);
    if (e.key === 'Escape') setScreenshotMode(false);
  };

  el.addEventListener('keydown', onKey);
  return () => el.removeEventListener('keydown', onKey);
}, [screenshotMode, numPages]);
```

**Issue**: Container must be focused (`tabIndex={0}`) for keyboard events to work

---

## 7. Screenshot Capture System

### 7.1 Overview

The screenshot system captures regions of the PDF by:

1. Letting user select a rectangular area
2. Rendering the full page to an offscreen canvas at high DPI
3. Cropping the selected region
4. Generating full + thumbnail images
5. Uploading to S3
6. Saving metadata to Supabase

### 7.2 Selection Process

**User Interaction**:

1. Click screenshot button (camera icon) → `screenshotMode = true`
2. Click and drag on PDF → `selection` state updated with screen coordinates
3. Selection overlay rendered as blue rectangle
4. Click "Save" → `capture()` function executes

**Coordinate Transformation**:

```typescript
const screenToPdf = (sx: number, sy: number) => {
  const rect = containerRef.current!.getBoundingClientRect();
  const cx = sx - rect.width / 2;
  const cy = sy - rect.height / 2;
  const x = (cx - transform.x) / transform.scale;
  const y = (cy - transform.y) / transform.scale;
  return { x, y };
};
```

**Why needed**: Selection coordinates are in screen pixels, but PDF coordinates are in "page space" (independent of zoom/pan)

### 7.3 Capture Process

```typescript
const capture = async () => {
  // 1. Convert screen selection to PDF coordinates
  const { x: ax, y: ay } = screenToPdf(startX, startY);
  const { x: bx, y: by } = screenToPdf(endX, endY);
  const pdfRect = { x: ax, y: ay, w: bx - ax, h: by - ay };

  // 2. Render full page to offscreen canvas at 2.5x scale
  const renderScale = 2.5;
  const viewport = pageInstance.getViewport({ scale: renderScale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await pageInstance.render({
    canvasContext: canvas.getContext('2d'),
    viewport,
  }).promise;

  // 3. Crop to selected region
  const crop = {
    x: Math.round(pdfRect.x * renderScale + viewport.width / 2),
    y: Math.round(pdfRect.y * renderScale + viewport.height / 2),
    w: Math.round(pdfRect.w * renderScale),
    h: Math.round(pdfRect.h * renderScale),
  };
  const croppedCanvas = cropCanvas(canvas, crop);

  // 4. Generate thumbnail (max 240px)
  const thumbnail = resizeCanvas(croppedCanvas, 240);

  // 5. Convert to blobs
  const [blob, thumbBlob] = await Promise.all([
    canvasToBlob(croppedCanvas),
    canvasToBlob(thumbnail),
  ]);

  // 6. Get presigned upload URLs
  const { uploadUrl, key, thumbUploadUrl, thumbKey } = await fetch('/api/screenshots/presign', {
    method: 'POST',
    body: JSON.stringify({ projectId, checkId }),
  }).then(r => r.json());

  // 7. Upload to S3
  await Promise.all([
    fetch(uploadUrl, { method: 'PUT', body: blob }),
    fetch(thumbUploadUrl, { method: 'PUT', body: thumbBlob }),
  ]);

  // 8. Save metadata to Supabase
  await fetch('/api/screenshots', {
    method: 'POST',
    body: JSON.stringify({
      check_id: checkId,
      page_number: pageNumber,
      crop_coordinates: pdfRect,
      screenshot_url: `s3://bucket/${key}`,
      thumbnail_url: `s3://bucket/${thumbKey}`,
    }),
  });
};
```

### 7.4 Screenshot Gallery

**Component**: `components/screenshots/ScreenshotGallery.tsx`

**Features**:

1. Fetches screenshots for current check
2. Gets presigned URLs for thumbnails/full images
3. Displays grid of thumbnails
4. Clicking thumbnail opens modal with full image
5. Delete button per screenshot

**Data Flow**:

```
Check ID → API → Supabase → Screenshots
  ↓
S3 URLs → API → Presigned URLs
  ↓
<img src={presignedUrl} />
```

---

## 8. Current Issues

### Issue #1: Scroll Propagation

**Symptom**: Scrolling wheel over PDF viewer also scrolls main page

**Expected**: PDF viewer should consume wheel events for zooming only

**Root Cause**:

1. PDF viewer's `handleWheel` calls `e.preventDefault()`
2. However, `overflow-hidden` on container may not be sufficient
3. React synthetic events may not prevent propagation correctly
4. Parent `<section>` or `<body>` still receiving scroll events

**Evidence**:

```typescript
// PDFViewer.tsx line 338
<div
  className={`absolute inset-0 overflow-hidden ...`}
  onWheel={handleWheel}  // ← Handler attached here
>
```

But parent containers:

```tsx
// AssessmentClient.tsx line 88
<section className="relative overflow-hidden bg-gray-50 border">
  // ← If wheel event bubbles past inner div, this catches it
```

### Issue #2: PDF Viewer Position

**Symptom**: PDF viewer "stuck at the bottom of the page"

**Expected**: PDF viewer should fill right half of screen (50% width, 100vh height)

**Root Cause Options**:

1. Grid item not receiving correct height
2. Wrapper div `h-full` not inheriting parent height
3. PDF canvas positioning incorrect

**CSS Debugging**:

```css
/* Expected computed styles */
section (grid item)          → height: calc(100vh - 0px)
div.h-full (wrapper)         → height: 100% (inherits from section)
div.relative (PDF container) → height: 100% (inherits from wrapper)
div.absolute.inset-0 (canvas)→ top:0; bottom:0; (fills container)
```

**Potential Issue**: If any parent has `height: auto`, the chain breaks

### Issue #3: Cramped Left Sidebar

**Symptom**: Elements "scrunched together" in left panel

**Expected**: Clear visual hierarchy with consistent spacing

**Current Spacing**:

- `p-3` (12px padding) on header and content
- `mb-3` (12px) between header elements
- `mt-2` (8px) for small gaps
- `.stack-md` (16px) between major sections

**Problems**:

1. Inconsistent spacing (mix of mb-3, mt-2, mt-3)
2. No visual separation between sections
3. Text sizes too similar (all 12-14px)
4. No use of whitespace for breathing room

---

## 9. Root Cause Analysis

### 9.1 Scroll Issue Deep Dive

**Problem**: `e.preventDefault()` in `onWheel` handler not preventing parent scroll

**Why this happens**:

1. **React Event Delegation**:
   - React attaches one listener to root
   - Synthetic events dispatched from there
   - `preventDefault()` only prevents default browser action, not propagation

2. **CSS `overflow-hidden`**:

   ```css
   .overflow-hidden {
     overflow: hidden;
   }
   ```

   - Hides scrollbars and clips content
   - **Does NOT prevent wheel events from bubbling**

3. **Event Bubbling**:
   ```
   User scrolls wheel on PDF canvas
     ↓
   <div onWheel={handleWheel}>          ← preventDefault() here
     ↓ (event bubbles)
   <section>                             ← No handler, event continues
     ↓ (event bubbles)
   <div class="grid h-screen">           ← Still bubbles
     ↓ (event bubbles)
   <body>                                 ← Browser default: scroll page
   ```

**Solution**: Add `e.stopPropagation()` to prevent bubbling, or use `onWheelCapture` for capture phase

### 9.2 Layout Issue Deep Dive

**Grid Behavior**:

```css
.h-screen {
  height: 100vh;
}
```

- Parent grid has explicit height
- Grid items should divide this height equally

**Potential Problems**:

1. **Content Overflow**:
   - If grid items have content exceeding 100vh
   - Browser may expand grid
   - Solution: Ensure `overflow-hidden` on grid items

2. **Height Inheritance Chain**:

   ```html
   <section class="...">
     ← height from grid item
     <div class="h-full w-full">
       ← 100% of parent (OK)
       <div class="relative h-full">
         ← 100% of parent (OK)
         <div class="absolute inset-0">← position: absolute (OK)</div>
       </div>
     </div>
   </section>
   ```

   - Chain looks correct
   - Possible issue: If `section` doesn't have explicit height from grid

3. **Grid Auto-Flow**:
   - By default, grid items have `min-height: auto`
   - Content can force expansion
   - Fix: Add `min-h-0` to grid items

### 9.3 Spacing Issue Deep Dive

**Current State**:

```tsx
<div className="p-3 border-b">          {/* 12px padding */}
  <div className="flex items-center justify-between mb-3"> {/* 12px bottom */}
    ...
  </div>
  <div className="progress mt-2">       {/* 8px top */}
  <div className="text-xs mt-1">        {/* 4px top */}
  <div className="mt-2 text-sm">        {/* 8px top */}
  <CheckTabs />
</div>

<div className="p-3 overflow-auto stack-md">  {/* .stack-md adds 16px between children */}
```

**Problems**:

1. Mixture of `mt-1`, `mt-2`, `mb-3` creates inconsistent rhythm
2. No clear section separation (all white background)
3. Padding too tight (`p-3` = 12px)

---

## 10. Recommended Solutions

### 10.1 Fix Scroll Propagation

**Option A: Stop Propagation**

```typescript
const handleWheel = useCallback((e: React.WheelEvent) => {
  e.preventDefault();
  e.stopPropagation(); // ← Add this
  // ... rest of zoom logic
}, []);
```

**Option B: Capture Phase**

```tsx
<div
  onWheelCapture={(e) => {  // ← Capture before bubbling
    e.preventDefault();
    handleWheel(e);
  }}
>
```

**Option C: CSS `overscroll-behavior`**

```css
.pdf-viewer-container {
  overscroll-behavior: contain;
  /* Prevents scroll chaining to parent */
}
```

**Recommended**: Combine A + C for maximum safety

### 10.2 Fix PDF Viewer Position

**Solution 1: Explicit Height on Grid Items**

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 h-screen">
  <aside className="h-screen border-r ...">  {/* ← Add explicit height */}
  <section className="h-screen relative ...">  {/* ← Add explicit height */}
```

**Solution 2: Fix Min-Height**

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 h-screen">
  <aside className="min-h-0 border-r ...">  {/* ← Allow shrinking */}
  <section className="min-h-0 relative ...">  {/* ← Allow shrinking */}
```

**Solution 3: Use Flexbox Instead**

```tsx
<div className="flex flex-col lg:flex-row h-screen">
  <aside className="lg:w-1/2 ...">
  <section className="lg:w-1/2 ...">
```

**Recommended**: Solution 1 (simplest, most explicit)

### 10.3 Improve Left Sidebar Layout

**Spacing Adjustments**:

```tsx
<aside className="border-r flex flex-col overflow-hidden bg-white">

  {/* Header with more padding */}
  <div className="p-4 border-b bg-gray-50">  {/* ← 16px padding, gray background */}
    <div className="flex items-center justify-between mb-4">  {/* ← 16px gap */}
      <h2 className="text-base font-semibold">Progress</h2>  {/* ← Larger, bolder */}
      <Link href="/" className="btn-secondary">...</Link>
    </div>

    <div className="space-y-3">  {/* ← Consistent 12px gaps */}
      <div>
        <div className="progress"></div>
        <div className="text-xs text-gray-600 mt-1.5">
          {progress.completed} of {progress.totalChecks} checks
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Active Checks</h3>
        <CheckTabs ... />
      </div>
    </div>
  </div>

  {/* Content with more padding */}
  <div className="p-4 overflow-auto space-y-6">  {/* ← 24px gaps */}
    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">
        Check Details
      </h3>
      <div className="space-y-2">...</div>
    </section>

    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">
        Prompt
      </h3>
      <PromptEditor ... />
    </section>

    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">
        Analysis
      </h3>
      <AnalysisPanel ... />
    </section>

    <section>
      <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">
        Screenshots
      </h3>
      <ScreenshotGallery ... />
    </section>
  </div>

</aside>
```

**Key Changes**:

1. Increase padding from `p-3` (12px) to `p-4` (16px)
2. Use `space-y-3` and `space-y-6` for consistent gaps
3. Add section headings with uppercase labels
4. Use gray background on header for visual separation
5. Larger text for hierarchy (`text-base` for main title)

### 10.4 Additional Improvements

**1. Add Loading States**:

```tsx
{
  loading && (
    <div className="absolute inset-0 bg-white/90 flex items-center justify-center z-20">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
        <p className="text-sm text-gray-600">Loading PDF...</p>
      </div>
    </div>
  );
}
```

**2. Error Handling**:

```tsx
{
  error && (
    <div className="p-6 text-center">
      <div className="text-red-600 mb-2">Failed to load PDF</div>
      <button className="btn-secondary" onClick={retry}>
        Retry
      </button>
    </div>
  );
}
```

**3. Responsive Behavior**:

```tsx
{
  /* Mobile: Stack vertically with tabs */
}
<div className="flex flex-col lg:grid lg:grid-cols-2 h-screen">
  <aside className="lg:border-r">
    <div className="lg:hidden">
      <button onClick={toggleMobileView}>{showPDF ? 'Show Checks' : 'Show PDF'}</button>
    </div>
    <div className={`${showPDF ? 'hidden lg:block' : ''}`}>{/* Sidebar content */}</div>
  </aside>
  <section className={`${!showPDF ? 'hidden lg:block' : ''}`}>{/* PDF viewer */}</section>
</div>;
```

**4. Performance Optimization**:

```tsx
// Only render current page
<Page
  pageNumber={pageNumber}
  renderTextLayer={false} // Already disabled
  renderAnnotationLayer={false} // Already disabled
  loading={<Spinner />}
  error={<ErrorMessage />}
/>;

// Preload adjacent pages
useEffect(() => {
  if (pdfInstance && pageNumber < numPages) {
    pdfInstance.getPage(pageNumber + 1); // Cache next page
  }
}, [pdfInstance, pageNumber, numPages]);
```

---

## Conclusion

The PDF viewer implementation is well-structured but has three critical issues:

1. **Scroll conflict**: Fixed by adding `e.stopPropagation()` and CSS `overscroll-behavior`
2. **Layout positioning**: Fixed by explicit `h-screen` on grid items
3. **Cramped UI**: Fixed by increasing padding, adding section headings, and consistent spacing

All issues are fixable with CSS/JSX changes—no major refactoring required.

---

## Implementation Checklist

- [ ] Add `e.stopPropagation()` to handleWheel
- [ ] Add `overscroll-behavior: contain` CSS class
- [ ] Set explicit `h-screen` on both grid items
- [ ] Increase sidebar padding to `p-4`
- [ ] Add section headings with uppercase labels
- [ ] Use `space-y-*` for consistent vertical spacing
- [ ] Add gray background to header section
- [ ] Test on mobile (responsive behavior)
- [ ] Verify keyboard shortcuts work
- [ ] Test screenshot capture flow
- [ ] Check S3 upload success
- [ ] Verify presigned URL expiry handling

---

**End of Report**
