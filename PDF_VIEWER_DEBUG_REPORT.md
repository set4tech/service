# PDF Viewer Screenshot Functionality - Technical Debug Report

**Date:** 2025-09-29
**Component:** `/components/pdf/PDFViewer.tsx`
**Issue Status:** Resolved with remaining edge cases to verify

---

## Executive Summary

The PDF viewer implements a screenshot capture feature that allows users to select regions of a PDF document and save them as images to S3. We encountered and resolved three major issues:

1. **Selection box instability** - Box coordinates changed during mouse movement after selection
2. **Incorrect positioning** - Selection box rendered outside the transformed PDF canvas
3. **Missing API endpoint** - 405 error when viewing saved screenshots

All three issues have been addressed in commits `75765af` and `37f12d5`.

---

## Architecture Overview

### Component Structure

```
AssessmentClient (page)
├── CheckList (left sidebar)
├── ScreenshotGallery (left sidebar bottom)
└── PDFViewer (main content)
    ├── Document (react-pdf)
    │   └── Page
    ├── Selection Box Overlay
    └── Control Buttons (zoom, screenshot, save)
```

### Screenshot Capture Flow

```
1. User clicks screenshot button (📸)
   → Sets screenshotMode = true

2. User drags on PDF to select region
   → onMouseDown: Captures start coordinates
   → onMouseMove: Updates end coordinates (only while isSelecting = true)
   → onMouseUp: Locks selection (sets isSelecting = false)

3. "Save" button appears
   → User clicks Save (selection stays locked)

4. capture() function executes:
   a. Convert screen coords to PDF coords using screenToPdf()
   b. Render full page to offscreen canvas at 2.5x scale
   c. Crop selected region
   d. Generate thumbnail (max 240px)
   e. Fetch presigned upload URLs from /api/screenshots/presign
   f. Upload image and thumbnail to S3
   g. Save metadata to database via /api/screenshots

5. ScreenshotGallery refreshes
   → Fetches screenshots for active check
   → Generates presigned view URLs via /api/screenshots/presign-view
   → Displays thumbnails
```

---

## Issues Encountered and Resolutions

### Issue 1: Selection Box Kept Changing on Mouse Movement

**Problem:**
After drawing a selection box, any mouse movement would update the box coordinates, making it impossible to click the "Save" button without changing the selection.

**Root Cause:**
The `onMouseMove` handler was checking `if (screenshotMode && selection)` which meant it would update selection coordinates any time the mouse moved in screenshot mode, not just while dragging.

**Solution:**
Added `isSelecting` state to track whether the mouse button is currently held down:

```typescript
// State
const [isSelecting, setIsSelecting] = useState(false);

// Mouse down - start selection
const onMouseDown = (e: React.MouseEvent) => {
  if (screenshotMode) {
    const { x, y } = screenToPdf(e.clientX, e.clientY);
    setSelection({ startX: x, startY: y, endX: x, endY: y });
    setIsSelecting(true); // ← Lock starts here
    return;
  }
  // ... pan logic
};

// Mouse move - only update if selecting
const onMouseMove = (e: React.MouseEvent) => {
  if (screenshotMode) {
    if (isSelecting && selection) {
      // ← Only update while mouse is held
      const { x, y } = screenToPdf(e.clientX, e.clientY);
      setSelection(s => s && { ...s, endX: x, endY: y });
    }
    return;
  }
  // ... pan logic
};

// Mouse up - lock selection
const onMouseUp = (e: React.MouseEvent) => {
  if (screenshotMode && selection) {
    setIsSelecting(false); // ← Lock released, box frozen
    console.log('Selection complete - box locked in place');
  }
  setIsDragging(false);
};
```

**File:** `components/pdf/PDFViewer.tsx:104-154`
**Commit:** `75765af`

---

### Issue 2: Selection Box Positioned Outside PDF Content

**Problem:**
The blue selection box overlay appeared at the bottom of the viewport, not aligned with the PDF content itself. It didn't follow the PDF when panning/zooming.

**Root Cause:**

1. Selection box was rendered as a sibling to the transformed PDF container
2. Selection coordinates were in screen space, not PDF-local space
3. Box didn't inherit the transform applied to the PDF

**Original Structure (WRONG):**

```tsx
<div className="absolute inset-0"> {/* viewport container */}
  <div style={{ transform: `translate(${x}px, ${y}px) scale(${scale})` }}>
    <Document>
      <Page />
    </Document>
  </div>
</div>

{/* Selection box outside transformed container */}
{screenshotMode && selection && (
  <div className="absolute" style={{ left: selection.startX, top: selection.startY }}>
)}
```

**Fixed Structure:**

```tsx
<div className="absolute inset-0">
  {' '}
  {/* viewport container */}
  <div style={{ transform: `translate(${x}px, ${y}px) scale(${scale})` }}>
    <Document>
      <Page />
    </Document>

    {/* Selection box INSIDE transformed container */}
    {screenshotMode && selection && (
      <div
        className="absolute pointer-events-none"
        style={{
          left: Math.min(selection.startX, selection.endX),
          top: Math.min(selection.startY, selection.endY),
          width: Math.abs(selection.endX - selection.startX),
          height: Math.abs(selection.endY - selection.startY),
          border: '2px solid rgba(37, 99, 235, 0.8)',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          zIndex: 40,
        }}
      />
    )}
  </div>
</div>
```

**Coordinate Conversion:**
Added `screenToPdf()` function to convert client coordinates to PDF-local coordinates:

```typescript
const screenToPdf = (sx: number, sy: number) => {
  const el = containerRef.current!;
  const rect = el.getBoundingClientRect();

  // Convert to center-origin coordinates
  const cx = sx - rect.width / 2;
  const cy = sy - rect.height / 2;

  // Account for pan and zoom
  const x = (cx - transform.x) / transform.scale;
  const y = (cy - transform.y) / transform.scale;

  return { x, y };
};
```

This ensures selection coordinates are in the same coordinate space as the PDF content.

**File:** `components/pdf/PDFViewer.tsx:195-203, 467-483`
**Commit:** `75765af`

---

### Issue 3: 405 Method Not Allowed for Screenshot Viewing

**Problem:**
Console showed: `POST https://service-set4.vercel.app/api/screenshots/presign-view 405 (Method Not Allowed)`

**Root Cause:**
The `ScreenshotGallery` component was attempting to fetch presigned URLs for viewing saved screenshots, but the `/api/screenshots/presign-view` endpoint didn't exist. There was only `/api/screenshots/presign` for upload URLs.

**Solution:**
Created new API endpoint to generate presigned GET URLs for viewing:

```typescript
// app/api/screenshots/presign-view/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: NextRequest) {
  try {
    const { screenshotUrl, thumbnailUrl } = await req.json();

    // Extract S3 keys from s3:// URLs
    const getKey = (url: string) => {
      if (url.startsWith('s3://')) {
        const parts = url.replace('s3://', '').split('/');
        parts.shift(); // Remove bucket name
        return parts.join('/');
      }
      return url;
    };

    const screenshotKey = getKey(screenshotUrl);
    const thumbnailKey = getKey(thumbnailUrl);

    // Generate presigned URLs (1 hour expiry)
    const [screenshotPresigned, thumbnailPresigned] = await Promise.all([
      getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME!,
          Key: screenshotKey,
        }),
        { expiresIn: 3600 }
      ),
      getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME!,
          Key: thumbnailKey,
        }),
        { expiresIn: 3600 }
      ),
    ]);

    return NextResponse.json({
      screenshot: screenshotPresigned,
      thumbnail: thumbnailPresigned,
    });
  } catch (error) {
    console.error('Failed to generate presigned URLs:', error);
    return NextResponse.json({ error: 'Failed to generate URLs' }, { status: 500 });
  }
}
```

**File:** `app/api/screenshots/presign-view/route.ts`
**Commit:** `37f12d5`

---

## Complete Code Implementation

### PDFViewer Component State

```typescript
// Transform state for pan/zoom
const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
const [isDragging, setIsDragging] = useState(false);

// Screenshot state
const [screenshotMode, setScreenshotMode] = useState(false);
const [isSelecting, setIsSelecting] = useState(false);
const [selection, setSelection] = useState<{
  startX: number;
  startY: number;
  endX: number;
  endY: number;
} | null>(null);

// PDF instances
const [pdfInstance, setPdfInstance] = useState<any>(null);
const [pageInstance, setPageInstance] = useState<any>(null);
```

### Screenshot Capture Function

```typescript
const capture = async () => {
  try {
    console.log('capture() called', { selection, pageInstance, activeCheck });

    if (!selection || !pageInstance || !activeCheck) {
      console.log('capture() early return - missing:', {
        hasSelection: !!selection,
        hasPageInstance: !!pageInstance,
        hasActiveCheck: !!activeCheck,
      });
      return;
    }

    const sx = Math.min(selection.startX, selection.endX);
    const sy = Math.min(selection.startY, selection.endY);
    const ex = Math.max(selection.startX, selection.endX);
    const ey = Math.max(selection.startY, selection.endY);

    // Convert selection box (screen px) to pdf local coords
    const { x: ax, y: ay } = screenToPdf(sx - 0, sy - 0);
    const { x: bx, y: by } = screenToPdf(ex - 0, ey - 0);

    const pdfRect = { x: ax, y: ay, w: bx - ax, h: by - ay };

    // Render the page to offscreen canvas at high DPI
    const renderScale = 2.5;
    const viewport = pageInstance.getViewport({ scale: renderScale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await pageInstance.render({ canvasContext: ctx, viewport }).promise;

    // Map pdfRect from "scale=1" coords to renderScale
    const crop = {
      x: Math.max(0, Math.round(pdfRect.x * renderScale + viewport.width / 2)),
      y: Math.max(0, Math.round(pdfRect.y * renderScale + viewport.height / 2)),
      w: Math.round(pdfRect.w * renderScale),
      h: Math.round(pdfRect.h * renderScale),
    };

    if (crop.w < 5 || crop.h < 5) {
      console.log('capture() crop too small:', crop);
      setSelection(null);
      setScreenshotMode(false);
      return;
    }

    // Extract cropped region
    const out = document.createElement('canvas');
    out.width = crop.w;
    out.height = crop.h;
    const octx = out.getContext('2d')!;
    octx.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

    // Generate thumbnail
    const thumbMax = 240;
    const ratio = Math.min(1, thumbMax / Math.max(crop.w, crop.h));
    const tw = Math.max(1, Math.round(crop.w * ratio));
    const th = Math.max(1, Math.round(crop.h * ratio));
    const tcanvas = document.createElement('canvas');
    tcanvas.width = tw;
    tcanvas.height = th;
    const tctx = tcanvas.getContext('2d')!;
    tctx.drawImage(out, 0, 0, tw, th);

    // Convert to blobs
    const [blob, thumb] = await Promise.all([
      new Promise<Blob>(resolve => out.toBlob(b => resolve(b!), 'image/png')),
      new Promise<Blob>(resolve => tcanvas.toBlob(b => resolve(b!), 'image/png')),
    ]);

    // Get presigned upload URLs
    console.log('capture() fetching presigned URLs...');
    const res = await fetch('/api/screenshots/presign', {
      method: 'POST',
      body: JSON.stringify({
        projectId: activeCheck.project_id || activeCheck.assessment_id,
        checkId: activeCheck.id,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      console.error('capture() presign failed:', res.status, await res.text());
      throw new Error('Failed to get presigned URLs');
    }

    const { uploadUrl, key, thumbUploadUrl, thumbKey } = await res.json();
    console.log('capture() got presigned URLs');

    // Upload to S3
    console.log('capture() uploading to S3...');
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
    });
    await fetch(thumbUploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: thumb,
    });
    console.log('capture() S3 upload complete');

    // Save metadata to database
    console.log('capture() saving to database...');
    const dbRes = await fetch('/api/screenshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        check_id: activeCheck.id,
        page_number: pageNumber,
        crop_coordinates: {
          x: pdfRect.x,
          y: pdfRect.y,
          width: pdfRect.w,
          height: pdfRect.h,
          zoom_level: transform.scale,
        },
        screenshot_url: `s3://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME}/${key}`,
        thumbnail_url: `s3://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME}/${thumbKey}`,
        caption: '',
      }),
    });

    if (!dbRes.ok) {
      console.error('capture() database save failed:', dbRes.status, await dbRes.text());
      throw new Error('Failed to save screenshot to database');
    }
    console.log('capture() complete!');

    setSelection(null);
    setScreenshotMode(false);
    onScreenshotSaved();
  } catch (error) {
    console.error('capture() failed with error:', error);
    alert(
      'Failed to save screenshot: ' + (error instanceof Error ? error.message : 'Unknown error')
    );
  }
};
```

**File:** `components/pdf/PDFViewer.tsx:205-339`

---

## Current Status and Verification Needed

### ✅ Resolved Issues

1. Selection box now stays locked after mouse release
2. Selection box correctly positioned on PDF content and follows pan/zoom
3. Screenshot gallery displays saved screenshots with working presigned URLs
4. Comprehensive debug logging in place

### 🔍 Edge Cases to Verify

1. **High zoom levels** - Does selection accuracy degrade at 5x+ zoom?
2. **Multi-page PDFs** - Do coordinates work correctly on pages 2+?
3. **Mobile/touch devices** - Touch events for selection?
4. **Very large selections** - Canvas memory limits?
5. **Network failures** - Error handling for S3 upload failures?

### 📊 Debug Logging

All capture stages now have console.log statements:

- `capture() called` - Function entry with state check
- `capture() early return` - Missing dependencies
- `capture() crop:` - Calculated crop dimensions
- `capture() fetching presigned URLs...` - API call start
- `capture() got presigned URLs` - API call success
- `capture() uploading to S3...` - S3 upload start
- `capture() S3 upload complete` - S3 upload success
- `capture() saving to database...` - DB insert start
- `capture() complete!` - Full success
- `capture() failed with error:` - Any errors (with alert to user)

---

## Environment Variables Required

```bash
# S3 Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_S3_BUCKET_NAME=your-bucket-name
NEXT_PUBLIC_S3_BUCKET_NAME=your-bucket-name

# Database
# (Supabase credentials)
```

---

## Testing Recommendations

### Manual Test Steps

1. **Basic Screenshot**
   - Open assessment page
   - Click 📸 button
   - Drag to select small region
   - Release mouse - verify box stays locked
   - Click "Save"
   - Verify screenshot appears in gallery below checks list

2. **Pan/Zoom + Screenshot**
   - Pan PDF to different position
   - Zoom in to 200%
   - Take screenshot
   - Verify captured region matches visual selection

3. **Multiple Screenshots**
   - Take 3-4 screenshots of same check
   - Verify all appear in gallery
   - Click thumbnail - verify full image in modal
   - Delete one - verify it disappears

4. **Edge Cases**
   - Try very small selection (< 5px) - should cancel with log
   - Try selection near PDF edge - should not error
   - Switch to different check - verify gallery updates

### Automated Tests (Future)

```typescript
describe('PDFViewer Screenshot', () => {
  it('should lock selection after mouse release', () => {
    // Simulate mouse down, move, up
    // Verify selection coordinates don't change on subsequent moves
  });

  it('should convert screen coords to PDF coords correctly', () => {
    // Test screenToPdf() at various zoom/pan states
  });

  it('should handle capture() with missing activeCheck gracefully', () => {
    // Call capture() with activeCheck = null
    // Verify early return and no error
  });
});
```

---

## Related Files

**Core Components:**

- `components/pdf/PDFViewer.tsx` - Main PDF viewer with screenshot logic
- `components/pdf/PDFViewerWrapper.tsx` - Next.js dynamic wrapper (ssr: false)
- `components/screenshots/ScreenshotGallery.tsx` - Gallery display component

**API Routes:**

- `app/api/screenshots/route.ts` - GET list, POST create
- `app/api/screenshots/presign/route.ts` - POST get upload URLs
- `app/api/screenshots/presign-view/route.ts` - POST get view URLs
- `app/api/screenshots/[id]/route.ts` - DELETE screenshot

**Page:**

- `app/assessments/[id]/ui/AssessmentClient.tsx` - Main assessment page with sidebar

---

## Questions for External Engineer

1. **Coordinate Transform Validation**: Is our `screenToPdf()` coordinate conversion mathematically correct for all transform states? Should we account for CSS transforms differently?

2. **Canvas Memory**: Are there browser limits on canvas size we should check before rendering at 2.5x scale? Should we adjust scale based on selection size?

3. **React Rendering**: Should the selection box be a separate canvas overlay instead of a div? Would this improve performance?

4. **Mobile Support**: What's the best approach for touch events? Should we use pointer events instead of mouse events?

5. **Error Recovery**: If S3 upload succeeds but DB insert fails, how should we handle the orphaned S3 object? Should we implement a cleanup job?

---

## Recent Commits

- `85abddb` - Added Save button click logging
- `83b8712` - Added comprehensive capture() logging and error handling
- `75765af` - Fixed selection UX with isSelecting state and coordinate conversion
- `37f12d5` - Added ScreenshotGallery UI and presign-view API endpoint

---

## Contact

For questions or additional debug information, please reference:

- GitHub: https://github.com/set4tech/service
- Branch: `main`
- Latest commit: `37f12d5`
