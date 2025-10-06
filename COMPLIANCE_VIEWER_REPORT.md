# Compliance Viewer Technical Report

## Overview

The compliance viewer is a client-facing interface located at `/app/compliance/[projectId]/page.tsx`. It is a separate system from the main assessments application.

**Access URL Pattern:**

```
http://localhost:3000/compliance/{projectId}
```

Example:

```
http://localhost:3000/compliance/1ae95ee4-dc31-401a-8bb0-8778aa5cd7be
```

## File Locations

### Frontend

- **Main Component:** `/app/compliance/[projectId]/page.tsx` (368 lines)

### API Routes

- **Initialize Session:** `/app/api/compliance/initialize/route.ts`
- **Get Sections List:** `/app/api/compliance/sections/route.ts`
- **Get Section Detail:** `/app/api/compliance/sections/route.ts` (POST method)
- **Batch Fetch Sections:** `/app/api/compliance/sections-batch/route.ts`
- **Test Route:** `/app/api/compliance/sections/test-route.ts`

## Database Schema

### Table: `compliance_sessions`

Created: 2025-10-06

```sql
CREATE TABLE compliance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_compliance_sessions_project_id ON compliance_sessions(project_id);
```

**Foreign Keys:**

- `project_id` references `projects(id)` with CASCADE delete

### Table: `section_checks`

Created: 2025-10-06

```sql
CREATE TABLE section_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES compliance_sessions(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  section_number TEXT NOT NULL,
  section_title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  is_cloneable BOOLEAN DEFAULT false,
  screenshots TEXT[] DEFAULT '{}',
  analysis_result JSONB,
  instances JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_section_checks_session_id ON section_checks(session_id);
CREATE INDEX idx_section_checks_section_key ON section_checks(section_key);
```

**Foreign Keys:**

- `session_id` references `compliance_sessions(id)` with CASCADE delete

**Status Values Used in Frontend:**

- `'pending'`
- `'screenshots_captured'`
- `'analyzing'`
- `'complete'`
- `'skipped'`

**JSONB Columns:**

`analysis_result`:

```typescript
{
  compliance: 'pass' | 'fail' | 'review_needed',
  reasoning: string,
  suggestions?: string[]
}
```

`instances`:

```typescript
Array<{
  id: string;
  name: string;
  screenshot?: string;
  analysisResult?: {
    compliance: 'pass' | 'fail' | 'review_needed';
    reasoning: string;
  };
}>;
```

## Frontend Component Structure

### Main Component: `ComplianceChecker`

**File:** `/app/compliance/[projectId]/page.tsx`

**Client Component:** Uses `'use client'` directive

**State Management:**

```typescript
const [loading, setLoading] = useState(true);
const [sections, setSections] = useState<Section[]>([]);
const [currentIndex, setCurrentIndex] = useState(0);
const [sectionChecks, setSectionChecks] = useState<Map<string, SectionCheck>>(new Map());
const [_sessionId, setSessionId] = useState<string | null>(null);
```

**TypeScript Interfaces:**

```typescript
interface Section {
  key: string;
  number: string;
  title: string;
  type: string;
  requirements: string[];
  references: Array<{
    number: string;
    title: string;
    requirements: string[];
    key: string;
  }>;
  hasContent: boolean;
}

interface SectionCheck {
  sectionKey: string;
  status: 'pending' | 'screenshots_captured' | 'analyzing' | 'complete' | 'skipped';
  screenshots: string[];
  isCloneable: boolean;
  instances?: Array<{
    id: string;
    name: string;
    screenshot?: string;
    analysisResult?: {
      compliance: 'pass' | 'fail' | 'review_needed';
      reasoning: string;
    };
  }>;
  analysisResult?: {
    compliance: 'pass' | 'fail' | 'review_needed';
    reasoning: string;
    suggestions?: string[];
  };
}
```

**Initialization Flow (useEffect):**

1. Fetches `POST /api/compliance/initialize` with `{ projectId, codeId: 'ICC+CBC_Chapter11A_11B+2025+CA' }`
2. Response contains: `{ session: { id }, sections: [], totalSections: number }`
3. Sets session ID
4. Sets sections array
5. Creates `sectionChecks` Map with initial status 'pending'

**UI Layout:**

- Header with title and progress indicator
- Left sidebar: Section list with status icons
- Main content: Section details, requirements, references
- Right panel: Action buttons and results

**Features:**

1. Section navigation (previous/next buttons)
2. Toggle "Multiple Items Check" mode (enables cloning)
3. Add instances when in clone mode
4. Screenshot capture button
5. Analyze compliance button
6. Skip/Not Applicable buttons

**Status Icons:**

- `'○'` - pending
- `'📷'` - screenshots_captured
- `'⏳'` - analyzing
- `'✓'` - complete with pass
- `'✗'` - complete with fail
- `'⌀'` - skipped

## PDF Viewer Integration

### Overview

The compliance viewer should integrate the existing `PDFViewer` component from `/components/pdf/PDFViewer.tsx`. This is a production-ready, feature-rich PDF viewer already used in the main assessment application.

**File:** `/components/pdf/PDFViewer.tsx` (1129 lines)

**Key Technologies:**

- PDF.js (via `react-pdf`) for PDF rendering
- Canvas API for high-resolution rendering
- S3 presigned URLs for PDF access
- LocalStorage for state persistence

### Core Features

1. **PDF Rendering**
   - PDF.js-based canvas rendering
   - DPR (Device Pixel Ratio) aware for retina displays
   - Configurable quality multiplier (2-8x)
   - Canvas size limits (8192px side, 140M pixels total)
   - Optional Content Groups (OCG) support for PDF layers

2. **Pan & Zoom**
   - Mouse wheel zoom (centered at cursor)
   - Pan via click-and-drag
   - Keyboard shortcuts (`-`/`+` for zoom, `0` to reset)
   - Transform state persisted to localStorage
   - Min scale: 0.1x, Max scale: 10x

3. **Screenshot Capture**
   - Click-and-drag rectangle selection
   - High-resolution offscreen rendering
   - Automatic thumbnail generation (240px max)
   - S3 upload with presigned URLs
   - Keyboard shortcuts for quick capture:
     - `C` - Save to current check
     - `B` - Create new bathroom instance
     - `D` - Create new door instance
     - `K` - Create new kitchen instance

4. **PDF Layer Management**
   - Toggle PDF layers (Optional Content Groups)
   - Layer visibility persisted to localStorage
   - Real-time layer on/off rendering

5. **Page Navigation**
   - Previous/Next page buttons
   - Keyboard shortcuts (arrow keys)
   - Page number persisted to localStorage
   - External page control support

### Component Props

```typescript
interface PDFViewerProps {
  pdfUrl: string; // S3 URL to PDF
  assessmentId?: string; // For state persistence
  activeCheck?: any; // Currently selected check
  onScreenshotSaved?: () => void; // Callback after screenshot upload
  onCheckAdded?: (check: any) => void; // Callback when new check created
  onCheckSelect?: (checkId: string) => void; // Callback to switch active check
  readOnly?: boolean; // Disable screenshot mode
  violationMarkers?: ViolationMarkerType[]; // For read-only violation display
  onMarkerClick?: (marker: ViolationMarkerType) => void;
  currentPage?: number; // External page control
  onPageChange?: (page: number) => void; // Notify parent of page changes
}
```

### State Management (useReducer)

The component uses `useReducer` for consolidated state management:

```typescript
interface ViewerState {
  transform: { tx: number; ty: number; scale: number }; // Pan/zoom transform
  pageNumber: number; // Current page
  numPages: number; // Total pages
  isDragging: boolean; // Pan drag state
  screenshotMode: boolean; // Screenshot mode active
  isSelecting: boolean; // Currently selecting area
  selection: { startX; startY; endX; endY } | null; // Selection rectangle
}

type ViewerAction =
  | { type: 'SET_TRANSFORM'; payload: ViewerState['transform'] }
  | { type: 'SET_PAGE'; payload: number }
  | { type: 'SET_NUM_PAGES'; payload: number }
  | { type: 'START_DRAG' }
  | { type: 'END_DRAG' }
  | { type: 'TOGGLE_SCREENSHOT_MODE' }
  | { type: 'START_SELECTION'; payload: { x; y } }
  | { type: 'UPDATE_SELECTION'; payload: { x; y } }
  | { type: 'END_SELECTION' }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'RESET_ZOOM' };
```

### Screenshot Capture Flow

**Compliance Viewer Integration Pattern:**

```typescript
// 1. User enters screenshot mode (press 'S' or click camera button)
dispatch({ type: 'TOGGLE_SCREENSHOT_MODE' });

// 2. User drags selection rectangle on PDF
// Component handles: START_SELECTION → UPDATE_SELECTION → END_SELECTION

// 3. User presses capture key or clicks "Save" button
const capture = async (target: 'current' | 'bathroom' | 'door' | 'kitchen') => {
  // Step 1: Determine target check ID
  let targetCheckId = activeCheck?.id;
  if (target !== 'current') {
    // Clone element template for new instance
    const templateId = await findElementTemplate(target);
    const cloneRes = await fetch(`/api/checks/${templateId}/clone`, {
      method: 'POST',
      body: JSON.stringify({ copyScreenshots: false }),
    });
    const { check: newCheck } = await cloneRes.json();
    targetCheckId = newCheck.id;
    onCheckAdded?.(newCheck); // Notify parent
    onCheckSelect?.(newCheck.id); // Switch to new check
  }

  // Step 2: Render high-res offscreen canvas with same quality settings
  const baseViewport = page.getViewport({ scale: 1 });
  const safeMultiplier = getSafeRenderMultiplier(baseViewport, renderScale * dpr);
  const viewport = page.getViewport({ scale: safeMultiplier });
  const offscreen = document.createElement('canvas');
  offscreen.width = Math.ceil(viewport.width);
  offscreen.height = Math.ceil(viewport.height);
  await page.render({
    canvasContext: offscreen.getContext('2d'),
    viewport,
    optionalContentConfigPromise: Promise.resolve(ocConfig || undefined),
  }).promise;

  // Step 3: Crop selection from offscreen canvas
  const cropped = cropCanvas(offscreen, selection);
  const thumbnail = generateThumbnail(cropped, 240);

  // Step 4: Get presigned S3 URLs
  const { uploadUrl, key, thumbUploadUrl, thumbKey } = await fetch('/api/screenshots/presign', {
    method: 'POST',
    body: JSON.stringify({ projectId, checkId: targetCheckId }),
  }).then(r => r.json());

  // Step 5: Upload to S3
  await Promise.all([
    fetch(uploadUrl, { method: 'PUT', body: blob }),
    fetch(thumbUploadUrl, { method: 'PUT', body: thumbBlob }),
  ]);

  // Step 6: Save screenshot record to database
  await fetch('/api/screenshots', {
    method: 'POST',
    body: JSON.stringify({
      check_id: targetCheckId,
      page_number: pageNumber,
      crop_coordinates: { x, y, width, height, zoom_level },
      screenshot_url: `s3://bucket/${key}`,
      thumbnail_url: `s3://bucket/${thumbKey}`,
      caption: '',
    }),
  });

  onScreenshotSaved?.(); // Notify parent to refresh
};
```

### LocalStorage Persistence

The PDFViewer automatically persists state when `assessmentId` is provided:

```typescript
// Keys used (replace {assessmentId} with actual ID):
localStorage.setItem(`pdf-page-${assessmentId}`, String(pageNumber));
localStorage.setItem(`pdf-transform-${assessmentId}`, JSON.stringify(transform));
localStorage.setItem(`pdf-layers-${assessmentId}`, JSON.stringify(layerVisibility));
```

**For Compliance Viewer:** Use `sessionId` instead of `assessmentId` for persistence keys.

### PDF Loading Flow

```typescript
// 1. Get presigned URL for S3 access
const { url } = await fetch('/api/pdf/presign', {
  method: 'POST',
  body: JSON.stringify({ pdfUrl }), // Original S3 URL
}).then(r => r.json());

// 2. Load PDF document via PDF.js
const loadingTask = pdfjs.getDocument(presignedUrl);
const pdfDoc = await loadingTask.promise;

// 3. Load specific page
const page = await pdfDoc.getPage(pageNumber);

// 4. Extract optional content config (for layers)
const ocConfig = await pdfDoc.getOptionalContentConfig();
const layerIds = ocConfig.getOrder?.() || [];

// 5. Render to canvas
const baseViewport = page.getViewport({ scale: 1 });
const safeMultiplier = getSafeRenderMultiplier(baseViewport, renderScale * dpr);
const viewport = page.getViewport({ scale: safeMultiplier });

canvas.width = Math.ceil(viewport.width);
canvas.height = Math.ceil(viewport.height);
canvas.style.width = `${Math.ceil(baseViewport.width)}px`;
canvas.style.height = `${Math.ceil(baseViewport.height)}px`;

await page.render({
  canvasContext: ctx,
  viewport,
  optionalContentConfigPromise: Promise.resolve(ocConfig || undefined),
}).promise;
```

### Integration Pattern for Compliance Viewer

**Recommended Usage:**

```typescript
'use client';
import { PDFViewer } from '@/components/pdf/PDFViewer';

export default function ComplianceChecker({ params }: { params: { projectId: string } }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentCheck, setCurrentCheck] = useState(null);
  const [pdfUrl, setPdfUrl] = useState<string>('');

  // Initialize session and load project PDF URL
  useEffect(() => {
    fetch('/api/compliance/initialize', {
      method: 'POST',
      body: JSON.stringify({ projectId, codeId }),
    })
      .then(r => r.json())
      .then(data => {
        setSessionId(data.session.id);
        // Load project to get PDF URL
        return fetch(`/api/projects/${projectId}`);
      })
      .then(r => r.json())
      .then(project => setPdfUrl(project.pdf_url));
  }, [projectId]);

  const handleScreenshotSaved = () => {
    // Refresh check screenshots
    // Update section_checks.screenshots array in database
    // Update local state
  };

  return (
    <div className="flex h-screen">
      {/* Left sidebar: Section list */}
      <aside className="w-80">
        {/* Section list component */}
      </aside>

      {/* Center: PDF viewer */}
      <main className="flex-1">
        {pdfUrl && (
          <PDFViewer
            pdfUrl={pdfUrl}
            assessmentId={sessionId}  // Use sessionId for persistence
            activeCheck={currentCheck}
            onScreenshotSaved={handleScreenshotSaved}
            readOnly={false}
          />
        )}
      </main>

      {/* Right sidebar: Section details, analysis */}
      <aside className="w-96">
        {/* Section detail panel */}
      </aside>
    </div>
  );
}
```

### Canvas Size Limits

The component enforces browser canvas limits:

```typescript
const MAX_CANVAS_SIDE = 8192; // Max width or height (browser limit)
const MAX_CANVAS_PIXELS = 140_000_000; // Max total pixels (browser limit)

function getSafeRenderMultiplier(baseViewport: any, desiredMultiplier: number) {
  const maxBySide = Math.min(
    MAX_CANVAS_SIDE / baseViewport.width,
    MAX_CANVAS_SIDE / baseViewport.height
  );
  const maxByPixels = Math.sqrt(MAX_CANVAS_PIXELS / (baseViewport.width * baseViewport.height));
  return Math.max(1, Math.min(desiredMultiplier, Math.min(maxBySide, maxByPixels)));
}
```

**Impact:** Large PDFs at high quality settings are automatically capped to safe values.

### Required API Endpoints

The PDFViewer depends on these API routes:

**PDF Presigning:**

```typescript
POST / api / pdf / presign;
Request: {
  pdfUrl: string;
}
Response: {
  url: string;
} // Presigned S3 URL with read access
```

**Screenshot Presigning:**

```typescript
POST /api/screenshots/presign
Request: { projectId: string, checkId: string }
Response: {
  screenshotId: string,
  uploadUrl: string,      // Presigned S3 PUT URL for full image
  key: string,            // S3 key for full image
  thumbUploadUrl: string, // Presigned S3 PUT URL for thumbnail
  thumbKey: string        // S3 key for thumbnail
}
```

**Screenshot Save:**

```typescript
POST /api/screenshots
Request: {
  check_id: string,
  page_number: number,
  crop_coordinates: { x, y, width, height, zoom_level },
  screenshot_url: string,   // s3://bucket/key
  thumbnail_url: string,    // s3://bucket/thumb_key
  caption: string
}
Response: { screenshot: ScreenshotRecord }
```

**Check Cloning (for element instances):**

```typescript
POST /api/checks/{templateId}/clone
Request: { instanceLabel?: string, copyScreenshots: boolean }
Response: { check: CheckRecord }
```

### Keyboard Shortcuts Reference

| Key     | Action                                           |
| ------- | ------------------------------------------------ |
| `S`     | Toggle screenshot mode                           |
| `Esc`   | Exit screenshot mode                             |
| `←`/`→` | Previous/Next page                               |
| `-`/`+` | Zoom out/in                                      |
| `0`     | Reset zoom to 100%                               |
| `C`     | Capture to current check (when selection active) |
| `B`     | Capture to new bathroom instance                 |
| `D`     | Capture to new door instance                     |
| `K`     | Capture to new kitchen instance                  |

### Element Template IDs

Hardcoded in `findElementTemplate()`:

```typescript
const elementGroupIds = {
  bathroom: 'f9557ba0-1cf6-41b2-a030-984cfe0c8c15',
  door: '3cf23143-d9cc-436c-885e-fa6391c20caf',
  kitchen: '709e704b-35d8-47f1-8ba0-92c22fdf3008',
};
```

**Note:** For compliance viewer, you'll need different element mappings or remove element-specific shortcuts.

### Styling Requirements

The component expects these Tailwind classes to be available:

```css
.btn-icon {
  @apply px-2 py-2 border rounded hover:bg-gray-100 disabled:opacity-50;
}

.btn-secondary {
  @apply px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700;
}
```

### Performance Considerations

1. **Render Debouncing**: Layer toggle triggers immediate re-render (no debounce)
2. **Transform Persistence**: Debounced by 500ms to avoid excessive localStorage writes
3. **Canvas Memory**: Large PDFs with high quality settings use significant memory
4. **Cancellation**: Previous render tasks are cancelled when new renders start
5. **Offscreen Rendering**: Screenshot capture creates temporary full-page canvas

### Common Integration Issues

**Issue 1: PDF not loading**

- Check that `/api/pdf/presign` route exists and returns valid S3 presigned URL
- Verify S3 bucket CORS allows presigned URL access
- Check browser console for CORS errors

**Issue 2: Screenshot upload fails**

- Verify `/api/screenshots/presign` returns valid PUT URLs
- Check S3 bucket has write permissions for service role
- Ensure `NEXT_PUBLIC_S3_BUCKET_NAME` environment variable is set

**Issue 3: State not persisting**

- Ensure `assessmentId` or `sessionId` prop is provided
- Check browser localStorage quota hasn't been exceeded
- Verify prop value doesn't change between renders

**Issue 4: Blurry rendering**

- Increase `renderScale` prop (default: 2, max: 8)
- Check that `devicePixelRatio` is detected correctly
- Verify canvas dimensions match CSS dimensions

## API Endpoints

### POST `/api/compliance/initialize`

**Request Body:**

```json
{
  "projectId": "uuid",
  "codeId": "ICC+CBC_Chapter11A_11B+2025+CA"
}
```

**Response (Success 200):**

```json
{
  "session": {
    "id": "uuid",
    "project_id": "uuid",
    "code_id": "string",
    "status": "in_progress",
    "created_at": "timestamp",
    "updated_at": "timestamp"
  },
  "sections": [
    /* Section objects */
  ],
  "totalSections": 123
}
```

**Response (Error 500):**

```json
{
  "error": "Failed to initialize compliance session",
  "details": "error message"
}
```

**Implementation Details:**

- Creates new row in `compliance_sessions` table
- Fetches sections from `/api/compliance/sections?codeId={codeId}`
- Batch inserts section checks into `section_checks` table
- Environment variable used: `SUPABASE_SERVICE_ROLE_KEY`

**Current Error:**
The API was returning 500 with error "Cannot read properties of undefined (reading 'id')" because the database tables did not exist. Tables were created on 2025-10-06.

### GET `/api/compliance/sections?codeId={codeId}`

**Query Parameters:**

- `codeId` (required): e.g., `"ICC+CBC_Chapter11A_11B+2025+CA"`
- `include_non_assessable` (optional): `"true"` or `"false"`
- `search` (optional): search term for filtering sections

**Response (Success 200):**

```json
{
  "code_id": "string",
  "code_title": "string",
  "total_sections": 123,
  "sections": [
    {
      "key": "string",
      "number": "string",
      "title": "string",
      "type": "section",
      "requirements": ["string"],
      "text": "string",
      "references": [],
      "source_url": "string",
      "hasContent": true,
      "subsections": []
    }
  ]
}
```

**Implementation Details:**

- Uses in-memory cache (Map) for results
- Queries `codes` table for code info
- Queries `sections` table with filters:
  - `code_id` = queryCodeId
  - `never_relevant` = false
  - Excludes IDs in `DEFINITIONAL_SECTION_IDS` array (202 section IDs)
  - If `!include_non_assessable`: `drawing_assessable` = true
- Handles virtual codes: `11A` and `11B` map to combined code `11A_11B` with prefix filtering
- Excludes intro sections (ending in `.1`) from main list
- Orders by `number` field

**Hardcoded Section Exclusions:**
Array contains 202 section IDs for definitions, application, scope, and general sections.

### POST `/api/compliance/sections` (Get Single Section Detail)

**Request Body:**

```json
{
  "sectionKey": "string"
}
```

**Response (Success 200):**

```json
{
  "key": "string",
  "number": "string",
  "title": "string",
  "type": "section",
  "requirements": ["string"],
  "text": "string",
  "tables": [],
  "figures": [],
  "references": [
    {
      "key": "string",
      "number": "string",
      "title": "string",
      "text": "string",
      "citation_text": "string"
    }
  ],
  "source_url": "string",
  "hasContent": true,
  "intro_section": {
    "key": "string",
    "number": "string",
    "title": "string",
    "text": "string"
  },
  "parent_key": "string",
  "parent_section": {
    "key": "string",
    "number": "string",
    "title": "string"
  }
}
```

**Implementation Details:**

- Queries `sections` table for section by key
- Queries `section_references` table for references
- Finds parent section if `parent_key` exists
- Finds intro section (sibling ending in `.1`)
- Falls back to parent's `source_url` if section doesn't have one

### POST `/api/compliance/sections-batch`

**Request Body:**

```json
{
  "sectionKeys": ["string"]
}
```

**Response (Success 200):**

```json
[
  {
    "key": "string",
    "number": "string",
    "title": "string",
    "text": "string"
  }
]
```

**Implementation Details:**

- Queries `sections` table with `IN` filter on `number` field
- Note: Despite parameter name `sectionKeys`, it queries by `number` field not `key`
- Returns array of section objects

## Environment Variables

**Required:**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://grosxzvvmhakkxybeuwu.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

**Optional (for API base URL):**

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
PORT=3000
```

**Note:** The initialize route uses `SUPABASE_SERVICE_ROLE_KEY`, not `SUPABASE_SERVICE_KEY` as used in other parts of the application.

## Database Dependencies

The compliance viewer queries these existing tables:

- `projects` - for project validation
- `codes` - for code information
- `sections` - for section content
- `section_references` - for section references

The compliance viewer writes to these new tables:

- `compliance_sessions` - session tracking
- `section_checks` - check status and results

## Supabase Client Configuration

**File:** `/lib/supabase-server.ts`

The API routes use `supabaseAdmin()` function which creates client with:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` (note: different from initialize route)

**Inconsistency:** The `/api/compliance/initialize/route.ts` creates its own Supabase client directly:

```typescript
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

This is the only route that uses `SUPABASE_SERVICE_ROLE_KEY` instead of importing `supabaseAdmin()`.

## Current Implementation Status

**Functional:**

- Database tables created
- API routes exist
- Frontend component renders
- Section list displays
- Navigation between sections works
- Clone mode toggle works
- Instance management works

**UI-Only (No Backend Implementation):**

- Screenshot capture button (no handler)
- Analyze compliance button (no handler)
- Skip section button (no handler)
- Not applicable button (no handler)

**Status Updates:**
All status changes in the frontend are local to component state. No API calls to persist status changes to `section_checks` table.

## Data Flow

**On Page Load:**

1. Component calls `POST /api/compliance/initialize`
2. API creates session in `compliance_sessions` table
3. API fetches sections from `GET /api/compliance/sections`
4. API batch inserts into `section_checks` table (all status = 'pending')
5. Component stores session ID and sections in state
6. Component creates local `sectionChecks` Map

**On User Interaction:**

- All interactions update local React state only
- No API calls to persist changes
- Page refresh loses all progress

## Testing

No test files exist for the compliance viewer.

Test route exists at `/app/api/compliance/sections/test-route.ts` but its contents were not examined.

## Browser Console Error (Pre-Fix)

Error occurred before tables were created:

```
Failed to load resource: the server responded with a status of 500 (Internal Server Error)
Failed to initialize session: TypeError: Cannot read properties of undefined (reading 'id')
    at ComplianceChecker.useEffect.init (page.tsx:66:35)
```

This was caused by line 66 attempting to access `data.session.id` when the response was an error object without a `session` property.

## Code ID

Hardcoded in component:

```typescript
codeId: 'ICC+CBC_Chapter11A_11B+2025+CA';
```

This code ID corresponds to California Building Code Chapter 11A and 11B (2025 edition).

## Related Documentation

- Main app documentation: `CLAUDE.md`
- Database schema: `DATABASE_SCHEMA.md`
- Main README: `README.md` (updated 2025-10-06 to include compliance viewer)
