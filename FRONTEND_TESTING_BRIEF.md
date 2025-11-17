# Frontend Architecture & Testing Strategy Brief

## Executive Summary

**Set 4 Service** is an AI-powered building code compliance assessment platform that analyzes architectural PDF drawings against accessibility codes (California Building Code Chapter 11B). The application provides an end-to-end workflow for uploading drawings, filtering applicable code sections via AI, capturing evidence screenshots from PDFs, running multi-provider AI analysis, and generating compliance reports.

This document provides a comprehensive overview of the frontend architecture, rendering strategy, state management patterns, and current testing approach to guide the development of a cutting-edge frontend testing strategy.

---

## Application Overview

### What It Does

1. **Project Setup**: Upload architectural PDF drawings and select applicable building codes
2. **Assessment Creation**: AI automatically filters applicable code sections from thousands of requirements
3. **Interactive Review**: Users review code sections in a split-panel interface:
   - Left: Scrollable list of code sections (checks)
   - Center: PDF viewer with screenshot capture, measurements, and annotations
   - Right: Code detail panel with requirements, AI analysis, and evidence
4. **Evidence Capture**: Screenshot capture tool with crop areas, bounding boxes, and automatic assignment
5. **AI Analysis**: Multi-provider AI (Gemini 2.5 Pro, GPT-4o, Claude Opus 4) analyzes screenshots against code requirements
6. **Manual Review**: Assessors can override AI decisions with manual judgments
7. **Compliance Reporting**: Generate PDF reports with violations, evidence, and recommendations

### Key User Workflows

**Primary Workflow (Section-Based):**

- Navigate code sections → capture screenshots → run AI analysis → review/override → mark complete

**Alternative Workflow (Element-Based):**

- Create element instances (e.g., "Door 1", "Door 2") → each instance links to multiple code sections → bulk capture → analyze all requirements at once

**Client Review Workflow:**

- Read-only compliance viewer at `/compliance/[projectId]`
- Navigate violations with bounding boxes on PDF
- Review AI reasoning and evidence

---

## Technology Stack

### Core Framework

- **Next.js 15.5.3** with App Router (React Server Components)
- **React 19.1.1** (latest stable)
- **TypeScript 5.9.2** (strict mode enabled)
- **Node.js 18+** runtime

### Frontend Dependencies

#### UI & Styling

- **Tailwind CSS 3.4.17** (utility-first CSS)
- **clsx** - Conditional className composition
- **lucide-react** - Icon library
- Custom design system with CSS variables for colors

#### PDF Rendering

- **pdfjs-dist 5.3.93** (Mozilla PDF.js)
- **react-pdf 10.1.0** - React wrapper for PDF.js
- Canvas-based rendering with high DPI support (2x-8x render scale)
- OCG (Optional Content Groups) support for layer toggling
- Text extraction for search functionality

#### State Management

- **React hooks** (useState, useReducer, useEffect, useCallback, useMemo)
- **Custom hooks** for feature isolation (20+ hooks)
- **localStorage** for persistence (view state, preferences)
- **URL hash** for deep linking to checks

#### Data Fetching

- **Fetch API** with custom `useFetch` hook
- **Polling** with custom `usePolling` hook
- Server-side data fetching in RSC pages
- Client-side mutations via API routes

#### Testing

- **Vitest 2.1.8** - Unit/integration testing (Vite-based, fast)
- **@testing-library/react 16.3.0** - Component testing
- **Playwright 1.55.1** - E2E testing
- **jsdom** - Browser environment simulation

#### Additional Libraries

- **date-fns** - Date formatting
- **react-markdown** - Markdown rendering (AI responses)
- **remark-gfm** - GitHub Flavored Markdown
- **zod** - Runtime type validation

### Backend Integration

- **Supabase (PostgreSQL)** - Primary database
- **AWS S3** - PDF and screenshot storage
- **Vercel KV (Redis)** - Caching/queue management
- **Vercel Serverless Functions** - API routes

### AI Providers

- **Google Gemini 2.5 Pro** (primary)
- **OpenAI GPT-4o** (alternative)
- **Anthropic Claude Opus 4** (alternative)

---

## Frontend Architecture

### Directory Structure

```
app/
├── api/                      # Next.js API routes (serverless functions)
│   ├── assessments/          # Assessment CRUD, seeding, progress
│   ├── checks/               # Check operations, AI analysis
│   ├── screenshots/          # Upload, presigning, assignments
│   └── projects/             # Project management
├── assessments/[id]/         # Main assessment UI
│   ├── page.tsx             # Server component (data fetching)
│   └── ui/
│       └── AssessmentClient.tsx  # Main client component
├── compliance/[projectId]/   # Client-facing report viewer
└── projects/                 # Project creation flow

components/
├── checks/                   # Check list, code detail panel
├── pdf/                      # PDF viewer, screenshot tools
├── screenshots/              # Screenshot galleries, modals
├── analysis/                 # AI analysis results display
└── ui/                       # Base components (modals, inputs)

hooks/                        # Custom React hooks (20+)
├── useAssessmentData.ts      # Consolidated data fetch
├── usePdfDocument.ts         # PDF.js document management
├── useScreenshotCapture.ts   # Screenshot capture logic
├── useMeasurements.ts        # Measurement tool state
├── useCalibration.ts         # Drawing scale calibration
├── useTextSearch.ts          # PDF text search
└── ...

lib/
├── supabase-server.ts        # Database client
├── s3.ts                     # S3 upload/presign
├── ai/                       # AI provider integrations
└── hooks/                    # Shared hooks (useFetch, usePolling)
```

### Component Hierarchy

**Main Assessment Page:**

```
AssessmentPage (RSC)
└── AssessmentClient (Client Component)
    ├── CheckList (Left Sidebar)
    │   ├── CheckTabs (section/element/summary/gallery)
    │   ├── BulkActionBar
    │   └── StatusBadge
    ├── PDFViewer (Center Canvas)
    │   ├── Canvas (PDF.js rendering)
    │   ├── ScreenshotIndicatorOverlay
    │   ├── MeasurementOverlay
    │   ├── TextHighlight (search)
    │   ├── ViolationBoundingBox (report mode)
    │   └── CalibrationModal
    └── CodeDetailPanel (Right Sidebar)
        ├── SectionContentDisplay
        ├── ScreenshotGallery
        ├── AnalysisHistory
        └── ManualJudgmentPanel
```

### Data Flow Architecture

#### Server-Side Rendering (Initial Load)

```typescript
// app/assessments/[id]/page.tsx
export default async function AssessmentPage({ params }) {
  // 1. Fetch assessment
  const { data: assessment } = await supabase
    .from('assessments')
    .select('*, projects(*)')
    .eq('id', id)
    .single();

  // 2. Fetch checks (parallel)
  const [sectionChecks, elementChecks] = await Promise.all([
    getAssessmentChecks(id, { mode: 'section' }),
    getAssessmentChecks(id, { mode: 'element' }),
  ]);

  // 3. Fetch progress via RPC
  const { data: progress } = await supabase.rpc('get_assessment_progress', {
    assessment_uuid: id,
  });

  // 4. Pass to client component
  return <AssessmentClient
    assessment={assessment}
    checks={[...sectionChecks, ...elementChecks]}
    progress={progress}
  />;
}
```

#### Client-Side State Management

```typescript
// AssessmentClient.tsx
export default function AssessmentClient({ assessment, checks: initialChecks }) {
  // Local state
  const [checks, setChecks] = useState(initialChecks);
  const [checkMode, setCheckMode] = useState<'section' | 'element' | 'summary'>('section');

  // Reducer for detail panel (state machine)
  const [detailPanel, dispatchDetailPanel] = useReducer(detailPanelReducer, { mode: 'closed' });

  // Derived state (useMemo)
  const displayedChecks = useMemo(() =>
    checkMode === 'element'
      ? checks.filter(c => c.element_group_id != null)
      : checks.filter(c => c.element_group_id == null)
  , [checks, checkMode]);

  const progress = useMemo(() => {
    const totalChecks = checks.filter(c => c.manual_status !== 'not_applicable').length;
    const completed = checks.filter(c => c.latest_status || c.manual_status).length;
    return { totalChecks, completed, pct: Math.round((completed / totalChecks) * 100) };
  }, [checks]);

  // Event handlers
  const handleCheckSelect = useCallback((checkId: string) => {
    dispatchDetailPanel({ type: 'SELECT_CHECK', checkId });
  }, []);

  // API mutations
  const refetchChecks = useCallback(async () => {
    const res = await fetch(`/api/assessments/${assessment.id}/checks?mode=${checkMode}`);
    const updated = await res.json();
    setChecks(updated);
  }, [assessment.id, checkMode]);

  return (/* JSX */)
}
```

### State Management Patterns

#### 1. Local State (useState)

Used for: UI toggles, input values, transient state

```typescript
const [showDetailPanel, setShowDetailPanel] = useState(false);
const [screenshotMode, setScreenshotMode] = useState<'idle' | 'screenshot'>('idle');
```

#### 2. Reducers (useReducer)

Used for: Complex state machines, coordinated updates

```typescript
// Detail panel state machine
type DetailPanelState =
  | { mode: 'closed' }
  | { mode: 'check-detail'; checkId: string; filterToSectionKey: string | null }
  | { mode: 'violation-detail'; violation: ViolationMarker };

function detailPanelReducer(state: DetailPanelState, action: DetailPanelAction) {
  switch (action.type) {
    case 'SELECT_CHECK': return { mode: 'check-detail', checkId: action.checkId, ... };
    case 'CLOSE_PANEL': return { mode: 'closed' };
    // ...
  }
}
```

#### 3. Custom Hooks (20+ hooks)

Used for: Feature isolation, reusability, testing

**Key Custom Hooks:**

**`useAssessmentData`** - Consolidated data fetch (optimization)

```typescript
// Fetches all data for an assessment in ONE request (parallel queries)
const { state, actions } = useAssessmentData(assessmentId, projectId, pageNumber);
// Returns: { measurements, calibration, screenshots, pdf_scale, loading }
```

**`usePdfDocument`** - PDF.js document management

```typescript
const { state, actions } = usePdfDocument(url, pageNumber);
// Handles: loading, error states, page navigation, caching
```

**`useScreenshotCapture`** - Screenshot capture logic

```typescript
const { capture } = useScreenshotCapture({
  page,
  canvas,
  projectId,
  activeCheck,
  onScreenshotSaved,
});
// Handles: canvas cropping, S3 upload, presigned URLs, database insert
```

**`useMeasurements`** - Measurement tool state

```typescript
const { state, actions } = useMeasurements(projectId, pageNumber, initialData);
// Handles: CRUD operations, selection, multi-select, delete
```

**`useFetch`** - Generic data fetching

```typescript
const { data, loading, error, refetch } = useFetch<T>(url, { onSuccess, onError });
```

**`usePolling`** - Generic polling with backoff

```typescript
usePolling(
  async () => {
    const res = await fetch(`/api/checks/${checkId}/status`);
    if (res.completed) return true; // stop polling
    return false; // continue
  },
  { interval: 2000, enabled: isRunning }
);
```

**`usePersisted`** - localStorage persistence

```typescript
const [value, setValue] = usePersisted('key', defaultValue);
// Syncs to localStorage automatically
```

#### 4. URL State

Used for: Deep linking, shareability

```typescript
// Hash-based routing for active check
useEffect(() => {
  if (activeCheckId) {
    window.history.replaceState(null, '', `#${activeCheckId}`);
  }
}, [activeCheckId]);

// Restore from URL on mount
useEffect(() => {
  const hashCheckId = window.location.hash.substring(1);
  if (hashCheckId) dispatchDetailPanel({ type: 'SELECT_CHECK', checkId: hashCheckId });
}, []);
```

#### 5. Refs (useRef)

Used for: DOM access, stable values, animation frames

```typescript
const canvasRef = useRef<HTMLCanvasElement>(null);
const renderTaskRef = useRef<any>(null); // Cancel in-flight renders
const stateRef = useRef(state); // Avoid stale closures
```

### Rendering Strategy

#### PDF.js Canvas Rendering

**High-Level Flow:**

1. Load PDF document via `usePdfDocument`
2. Extract page via `pdfDoc.getPage(pageNumber)`
3. Render to canvas with high DPI scaling (2x-8x)
4. Apply optional content config (layers)
5. Handle render cancellation for rapid page changes

**Key Implementation:**

```typescript
// PDFViewer.tsx
const renderPage = useCallback(async () => {
  const canvas = canvasRef.current;
  if (!canvas || !page) return;

  // Cancel in-flight render
  if (renderTaskRef.current) {
    renderTaskRef.current.cancel();
  }

  const result = renderPdfPage(page, canvas, {
    scaleMultiplier: renderScale, // 2.0 - 8.0
    optionalContentConfig: ocConfig, // Layer visibility
  });

  renderTaskRef.current = result.task;
  await result.task.promise;
}, [page, renderScale, ocConfig]);

// Trigger on page change or render scale update
useEffect(() => {
  if (page) renderPage();
}, [page, renderScale, layerList]);
```

**Render Scale:**

- User-adjustable: 2.0x to 8.0x (default 4.0x)
- Higher scales = sharper text/lines but larger canvas memory
- Persisted per-assessment in database
- Canvas dimensions = page width × scale

**Layer Management (OCG):**

```typescript
const layers = usePdfLayers(pdfDoc, assessmentId);
// Extracts optional content groups from PDF
// Renders layer panel with checkboxes
// Updates optionalContentConfig on toggle
// Persists visibility state in localStorage
```

**Performance Optimizations:**

1. **Render cancellation** - Cancel in-flight renders on rapid page changes
2. **Memoized viewport** - Cache viewport calculations
3. **Debounced rerender** - Avoid excessive canvas updates
4. **Worker thread** - PDF.js uses web workers for parsing
5. **Canvas size limits** - Max 16384px, 268M pixels

#### Transform & Zoom

**View Transform:**

```typescript
interface Transform {
  tx: number;     // X translation (pixels)
  ty: number;     // Y translation (pixels)
  scale: number;  // Zoom level (1.0 = 100%)
}

// Applied via CSS transform for GPU acceleration
<div style={{
  transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
  transformOrigin: '0 0',
  willChange: 'transform',
}} />
```

**Zoom Controls:**

- Buttons: +/- buttons
- Keyboard: `-` (zoom out), `+` (zoom in), `0` (reset)
- Mouse wheel: Ctrl+scroll (zoom at cursor)
- Min: 0.1x, Max: 5.0x

**Pan Controls:**

- Middle-click drag
- Right-click drag
- Touch drag (mobile)

**State Persistence:**

```typescript
const { state, actions } = usePdfPersistence(assessmentId);
// Persists: pageNumber, transform (tx, ty, scale), layer visibility
// Storage: localStorage, keyed by assessmentId
```

#### Overlay Rendering

**Multiple layers of overlays:**

1. **Canvas** (PDF content) - Bottom layer
2. **Screenshot indicators** - Rectangles showing captured areas
3. **Measurement lines** - SVG lines with arrows, labels
4. **Calibration line** - Purple line for scale setting
5. **Text highlights** - Yellow boxes for search results
6. **Violation markers** - Red bounding boxes (report mode)
7. **Selection box** - Blue rectangle (screenshot/measure mode)

**Coordinate Conversion:**

```typescript
// Screen coordinates → PDF content coordinates
function screenToContent(
  transform: Transform,
  container: HTMLElement,
  screenX: number,
  screenY: number
) {
  const rect = container.getBoundingClientRect();
  const contentX = (screenX - rect.left - transform.tx) / transform.scale;
  const contentY = (screenY - rect.top - transform.ty) / transform.scale;
  return { x: contentX, y: contentY };
}

// PDF coordinates → Screen coordinates
function contentToScreen(transform: Transform, contentX: number, contentY: number) {
  return {
    x: contentX * transform.scale + transform.tx,
    y: contentY * transform.scale + transform.ty,
  };
}
```

**Measurement Overlay:**

- Rendered as **SVG** (not canvas) for crisp lines at any zoom
- Lines, arrows, labels positioned via `contentToScreen`
- Hover detection via bounding box intersection
- Multi-select with Ctrl+click, box select with drag

#### Dynamic Loading

**Code splitting:**

```typescript
// PDFViewer loaded only on client (not SSR)
const PDFViewer = dynamic(
  () => import('@/components/pdf/PDFViewer').then(mod => ({ default: mod.PDFViewer })),
  { ssr: false, loading: () => <div>Loading PDF viewer...</div> }
);
```

**Lazy imports:**

- `react-pdf` loaded on demand
- PDF.js worker loaded from CDN
- AI provider SDKs lazy-loaded

**Image optimization:**

- Thumbnails generated on upload (256px wide)
- Presigned URLs with 1-hour expiration
- Progressive JPEG encoding

---

## Current Testing Strategy

### Overview

**Testing Pyramid:**

- **Unit Tests**: 25 files (Vitest + React Testing Library)
- **E2E Tests**: 17 files (Playwright)
- **Total Coverage**: ~40% (lib/ and hooks/ well-covered, components less so)

### Unit Tests (Vitest)

**Location:** `__tests__/`

**Configuration:**

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./__tests__/setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

**Test Categories:**

#### 1. Hook Tests (11 files)

- `useAssessmentData.test.tsx` - Consolidated fetch logic
- `useCheckData.test.tsx` - Check data loading
- `useManualOverride.test.tsx` - Override mutations
- `useScreenshotCapture.test.tsx` - Screenshot capture
- `useMeasurements.test.tsx` - Measurement CRUD
- `useCalibration.test.tsx` - Scale calibration
- `useFetch.test.tsx` - Generic fetch wrapper
- `usePolling.test.tsx` - Polling logic
- `usePersisted.test.tsx` - localStorage sync

**Example:**

```typescript
// __tests__/hooks/useCheckData.test.tsx
describe('useCheckData hook behavior', () => {
  it('should load check and siblings when element_group_id exists', async () => {
    const mainCheck = createMockCheck({ element_group_id: 'doors-group' });
    const siblings = createMockGroupedChecks(3);

    setupFetchMock({
      '/api/checks/check-1': { check: mainCheck },
      '/api/checks?assessment_id': siblings,
    });

    expect(mainCheck.element_group_id).toBe('doors-group');
    expect(siblings).toHaveLength(3);
  });
});
```

#### 2. API Tests (5 files)

- `assessment-data.test.ts` - Consolidated endpoint
- `checks/get-checks.test.ts` - Check filtering
- `checks/manual-override.test.ts` - Override API
- `measurements/measurements.test.ts` - Measurement CRUD
- `pdf-scale.test.ts` - Render scale persistence

**Approach:**

- Mock Next.js request/response
- Mock Supabase client
- Test validation, error handling, edge cases

#### 3. Library Tests (7 files)

- `calibration-calculations.test.ts` - Math validation
- `calibration-utils.test.ts` - Scale parsing
- `measurement-accuracy.test.ts` - Precision checks
- `process-rpc-violations.test.ts` - Data transformation

**Approach:**

- Pure function testing
- Property-based testing for calculations
- Edge case validation

#### 4. Component Tests (2 files)

- `AssessmentClient-refetch.test.tsx` - Data refresh logic
- `CodeDetailPanel-overrides.test.tsx` - Override UI

**Challenges:**

- Heavy mocking required (Supabase, fetch, PDF.js)
- Integration gaps (hard to test interactions)
- PDF rendering not testable in jsdom

### E2E Tests (Playwright)

**Location:** `e2e/`

**Configuration:**

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

**Test Categories:**

#### 1. PDF Viewer Core (4 files)

- **`pdf-viewer-navigation.spec.ts`** - Page nav, zoom, pan
- **`pdf-viewer-screenshot.spec.ts`** - Screenshot mode, selection
- **`pdf-viewer-canvas.spec.ts`** - Render limits, stability
- **`pdf-viewer-layers.spec.ts`** - OCG toggle, persistence

**Example:**

```typescript
// e2e/pdf-viewer-screenshot.spec.ts
test('should toggle screenshot mode with S key', async ({ page }) => {
  await page.locator('[role="region"][aria-label="PDF viewer"]').focus();
  await page.keyboard.press('s');
  await expect(page.locator('text=📸 Screenshot Mode')).toBeVisible();

  await page.keyboard.press('s');
  await expect(page.locator('text=📸 Screenshot Mode')).not.toBeVisible();
});
```

#### 2. Measurements (2 files)

- **`pdf-measurements.spec.ts`** - Draw, select, delete
- **`pdf-calibration.spec.ts`** - Scale setting, modal

#### 3. Check Management (5 files)

- **`check-list.spec.ts`** - Filtering, sorting, status badges
- **`code-detail-panel.spec.ts`** - Section display, screenshots
- **`manual-override.spec.ts`** - Override form, persistence
- **`clone-check.spec.ts`** - Duplication logic
- **`element-instances.spec.ts`** - Element creation

#### 4. Workflows (6 files)

- **`workflows/assessment-creation.spec.ts`** - Full flow
- **`assessment-progress.spec.ts`** - Progress calculation
- **`ai-analysis.spec.ts`** - AI submission, polling
- **`bulk-operations.spec.ts`** - Multi-select actions
- **`screenshot-gallery.spec.ts`** - Gallery view

**Custom Fixtures:**

```typescript
// e2e/fixtures/setup.ts
export const test = base.extend({
  assessmentPage: async ({ page }, use) => {
    await use({
      async goto(assessmentId: string) {
        await page.goto(`/assessments/${assessmentId}`);
        await page.waitForSelector('canvas', { timeout: 30000 });
      },
    });
  },
  pdfCanvas: async ({ page }, use) => {
    await use(async () => page.locator('canvas').first());
  },
  waitForPDF: async ({ page }, use) => {
    await use(async () => {
      await page.waitForFunction(() => {
        const canvas = document.querySelector('canvas');
        return canvas && canvas.width > 0 && canvas.height > 0;
      });
    });
  },
});
```

**Test Data:**

- Requires real database + assessment ID
- Set via `TEST_ASSESSMENT_ID` env var
- Tests skip if not provided

### Testing Challenges

#### Current Gaps

1. **Visual Regression**: No pixel-diff testing for PDF rendering
2. **Canvas Rendering**: Hard to validate rendered content
3. **AI Analysis**: Mocked in tests, not validated end-to-end
4. **Performance**: No rendering performance benchmarks
5. **Accessibility**: Limited a11y testing
6. **Mobile**: No responsive/touch testing
7. **Error States**: Limited error boundary testing
8. **Network Conditions**: No throttling/offline tests

#### Flakiness Issues

1. **Timing-dependent tests**: Canvas rendering, API polling
2. **Browser differences**: Chromium-only (no Firefox/Safari)
3. **Database state**: Tests modify shared database
4. **S3 dependencies**: Real S3 calls (slow, can fail)
5. **PDF.js worker**: CDN load can timeout

---

## Key Frontend Challenges

### 1. PDF Rendering Performance

**Challenge:** Large PDFs (100+ pages) at high render scales (8x) create massive canvases (32k×24k pixels = 768M pixels)

**Current Solutions:**

- Hard limits: 16384px max dimension, 268M pixel limit
- User-adjustable render scale (2x-8x)
- Render cancellation on rapid page changes
- Web worker offloading (PDF.js)

**Testing Needs:**

- Memory usage monitoring
- Render time benchmarks
- Canvas size validation
- Stability under load

### 2. State Synchronization

**Challenge:** Multiple sources of truth (server, localStorage, URL hash, local state)

**Current Solutions:**

- Server state = source of truth
- localStorage for preferences/UI state
- URL hash for deep linking
- Optimistic updates with rollback

**Testing Needs:**

- Stale state detection
- Sync conflict resolution
- Race condition testing
- Offline behavior

### 3. Screenshot Capture

**Challenge:** Capture high-res PDF regions, upload to S3, assign to checks, display thumbnails

**Current Solutions:**

- Canvas cropping with scaling
- Direct S3 upload via presigned URLs
- Many-to-many assignments (screenshot ↔ check)
- Thumbnail generation on server

**Testing Needs:**

- Crop accuracy validation
- Upload retry logic
- Assignment consistency
- Thumbnail quality

### 4. AI Analysis Polling

**Challenge:** Long-running AI analysis (30-120s), batch processing, progress updates

**Current Solutions:**

- Queue-based architecture (Vercel KV)
- Polling with exponential backoff
- Batch group IDs for coordination
- Progress tracking via RPC

**Testing Needs:**

- Polling reliability
- Timeout handling
- Progress accuracy
- Queue processing order

### 5. Measurement Tool Accuracy

**Challenge:** Precise measurements on scaled PDFs with calibration

**Current Solutions:**

- Known-length calibration
- Scale notation (e.g., "1/4\" = 1'")
- Sub-pixel accuracy calculations
- Real-time distance display

**Testing Needs:**

- Calibration accuracy (<1% error)
- Scale parsing validation
- Measurement precision
- Edge cases (rotated PDFs)

---

## Questions for the Senior Dev

### 1. Visual Regression Testing

**Context:** PDF rendering can subtly break with PDF.js updates, browser changes, or canvas refactors.

**Questions:**

- **How do companies like Figma/Miro do pixel-perfect visual regression testing for canvas-based UIs?**
  - Do they use tools like Percy, Chromatic, or Playwright's built-in screenshot comparison?
  - How do they handle minor rendering differences across browsers/OS?
  - Do they test at multiple zoom levels and render scales?

- **What's the state-of-the-art for testing WebGL/Canvas rendering?**
  - Are there specialized tools for validating canvas output?
  - How do you test dynamic overlays (measurements, bounding boxes)?

- **How do you handle flakiness from rendering timing issues?**
  - Wait strategies (network idle, canvas stability)
  - Retry policies
  - Deterministic rendering

### 2. Component Testing Strategy

**Context:** Heavy reliance on custom hooks makes component testing challenging (lots of mocking).

**Questions:**

- **What's the best balance between unit tests (isolated) and integration tests (real interactions)?**
  - Test hooks in isolation or through components?
  - Mock browser APIs (canvas, localStorage) or run in real browser?

- **How do big companies test complex state machines (like our `detailPanelReducer`)?**
  - Model-based testing? Property-based testing?
  - State transition diagrams?

- **What's the Figma/Miro approach to testing drag-and-drop, zoom/pan, and canvas interactions?**
  - Simulate mouse events or test at a higher abstraction level?
  - How do you test viewport transforms and coordinate conversions?

### 3. Performance & Stability Testing

**Context:** PDF rendering can be slow, memory-intensive, and crash on edge cases.

**Questions:**

- **What tools/techniques do you recommend for frontend performance testing?**
  - Lighthouse CI? WebPageTest? Custom metrics?
  - Memory leak detection (Chrome DevTools, Playwright?)
  - Canvas rendering benchmarks

- **How do you test stability under stress (rapid interactions, large files)?**
  - Chaos engineering for frontend?
  - Automated stress testing in CI?

- **What's the best way to test error boundaries and recovery flows?**
  - Simulate errors (network, API, canvas)
  - Validate user-facing error messages

### 4. AI Analysis Testing

**Context:** AI analysis is non-deterministic, slow, and expensive to run in tests.

**Questions:**

- **How do you test AI-powered features without running actual AI?**
  - Mock responses? Snapshot testing?
  - Contract testing with AI APIs?

- **How do you validate polling/long-running async operations?**
  - Mock timers? Real polling with short intervals?
  - Test cancellation/interruption flows?

### 5. Accessibility Testing

**Context:** Compliance app should be accessible, but testing is limited.

**Questions:**

- **What's the cutting-edge for automated a11y testing?**
  - axe-core? Lighthouse? Playwright accessibility checks?
  - How do you test keyboard navigation for complex UIs?

- **How do companies like Figma handle accessibility for canvas-based tools?**
  - Screen reader support for canvas content?
  - Keyboard-only workflows?

### 6. Mobile/Responsive Testing

**Context:** App is desktop-first, but should work on tablets.

**Questions:**

- **What's the best approach for testing touch interactions (pinch-zoom, drag)?**
  - Playwright touch events? Real device testing?
  - Cross-browser touch compatibility?

- **How do you test responsive layouts efficiently?**
  - Viewport matrix (desktop, tablet, mobile)?
  - Visual regression at multiple sizes?

### 7. Testing Strategy & CI/CD

**Context:** Currently ~40% coverage, tests run on push.

**Questions:**

- **What's the recommended test coverage target for a production app like this?**
  - 70%? 80%? Depends on criticality?
  - How do you measure "meaningful" coverage (not just line coverage)?

- **What's the optimal test distribution in the testing pyramid?**
  - 70% unit, 20% integration, 10% E2E?
  - Or more E2E for better confidence?

- **How do big companies structure their CI/CD testing?**
  - Parallel test execution? Flakiness detection?
  - Incremental testing (only changed components)?
  - Test result caching?

### 8. Tools & Best Practices

**Questions:**

- **What's your recommended testing stack for a Next.js 15 + React 19 app?**
  - Vitest vs Jest? Testing Library vs Enzyme?
  - Playwright vs Cypress?

- **How do you handle testing with third-party dependencies (PDF.js, AI SDKs, S3)?**
  - Mock at boundary? Use test doubles? Real integrations?

- **What's the Figma/Miro approach to testing real-time collaboration features?**
  - Multi-browser E2E tests? WebSocket mocking?
