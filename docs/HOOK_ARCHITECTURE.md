# PDF Viewer Hook Architecture

## Overview

The PDF viewer has been refactored from a 2000+ line monolithic component into a composable architecture using specialized React hooks. This document describes the architecture, patterns, and guidelines for working with these hooks.

## Architecture Goals

1. **Single Responsibility**: Each hook manages one concern
2. **Composability**: Hooks can be composed to build complex features
3. **Testability**: Each hook is independently testable
4. **Reusability**: Hooks can be used across different components
5. **Type Safety**: Leveraging TypeScript and discriminated unions
6. **Performance**: Optimized with proper memoization and dependencies

## Hook Categories

### Base Hooks (`lib/hooks/`)

Generic, reusable hooks that aren't domain-specific.

#### `useFetch<T>`

Generic data fetching with loading states, error handling, and retries.

```typescript
const { data, loading, error, refetch } = useFetch<UserData>('/api/user', {
  method: 'GET',
  retry: 3,
  onSuccess: data => console.log('Loaded:', data),
  onError: error => console.error('Failed:', error),
});
```

**Features:**

- Automatic loading/error state management
- Configurable retry logic with exponential backoff
- Success/error callbacks
- Manual refetch capability
- Null URL support for conditional fetching

#### `usePersisted<T>`

LocalStorage persistence with debouncing and validation.

```typescript
const [value, setValue] = usePersisted('storageKey', defaultValue, {
  debounce: 500,
  validate: val => validateAndSanitize(val),
  serialize: val => JSON.stringify(val),
  deserialize: str => JSON.parse(str),
});
```

**Features:**

- Automatic localStorage sync
- Debounced writes to prevent excessive I/O
- Custom validation/sanitization
- Custom serialization (defaults to JSON)
- SSR-safe (no-op during server rendering)

#### `usePolling`

Interval-based polling with automatic stop conditions.

```typescript
usePolling(
  async () => {
    const status = await checkStatus();
    return status === 'complete';
  },
  {
    interval: 2000,
    maxAttempts: 30,
    onStop: reason => console.log('Stopped:', reason),
    enabled: isProcessing,
  }
);
```

**Features:**

- Configurable interval and max attempts
- Automatic cleanup on unmount
- Conditional enabling/disabling
- Stop callbacks
- Promise-based predicates

### PDF Domain Hooks (`hooks/`)

PDF-specific hooks for the viewer component.

#### `usePresignedUrl`

Fetches and caches S3 presigned URLs for PDF access.

```typescript
const { url: presignedUrl, loading, error } = usePresignedUrl(pdfUrl);
```

**Features:**

- Automatic URL fetching
- In-memory caching
- Error handling
- Loading states

#### `usePdfDocument`

Manages PDF.js document and page loading.

```typescript
const { doc, page, numPages, loading } = usePdfDocument(presignedUrl, pageNumber);
```

**Features:**

- PDF.js integration
- Document lifecycle management
- Page loading with caching
- Automatic cleanup

#### `usePdfLayers`

Manages PDF optional content (layers).

```typescript
const layers = usePdfLayers(page);

// Usage
layers.actions.toggleLayer(layerName);
layers.actions.setLayerVisibility(layerName, true);
```

**State:**

- `state.layers`: Array of available layers
- `state.loading`: Loading state

**Actions:**

- `toggleLayer(name)`: Toggle layer visibility
- `setLayerVisibility(name, visible)`: Set specific visibility

#### `usePdfPersistence`

Consolidated localStorage persistence for page, transform, and UI state.

```typescript
const { pageNumber, transform, showIndicators, actions } = usePdfPersistence(projectId, numPages);

// Usage
actions.setPage(5);
actions.setTransform({ scale: 1.5, tx: 100, ty: 50 });
actions.toggleIndicators();
```

**State:**

- `pageNumber`: Current page
- `transform`: Pan/zoom transform
- `showIndicators`: Screenshot indicators visibility

**Actions:**

- `setPage(num)`: Change page
- `setTransform(transform)`: Update transform
- `toggleIndicators()`: Toggle indicator visibility

#### `useViewTransform`

Pan and zoom transform management with pivot-point zooming.

```typescript
const viewTransform = useViewTransform(transform, setTransform, viewportRef);

// Usage
viewTransform.zoom('in', { clientX: 500, clientY: 300 }); // Zoom to point
viewTransform.zoom('out');
viewTransform.reset();
viewTransform.pan(deltaX, deltaY);
```

**Features:**

- Pivot-point zooming (zoom to cursor/touch)
- Min/max scale limits
- Smooth panning
- Reset to default state

#### `useMeasurements`

CRUD operations for PDF measurements.

```typescript
const measurements = useMeasurements(projectId, pageNumber);

// Usage
await measurements.actions.save({
  x1,
  y1,
  x2,
  y2,
  realDistance: 10.5,
  unit: 'ft',
});
await measurements.actions.update(id, { realDistance: 12.0 });
await measurements.actions.remove(id);
measurements.actions.select(id);
```

**State:**

- `state.measurements`: Array of measurements
- `state.selectedId`: Currently selected measurement
- `state.loading`: Loading state

**Actions:**

- `save(data)`: Create new measurement
- `update(id, data)`: Update existing
- `remove(id)`: Delete measurement
- `select(id)`: Select for editing
- `refetch()`: Reload from server

#### `useCalibration`

Scale calibration using page size or known-length methods.

```typescript
const calibration = useCalibration(projectId, pageNumber);

// Page size method
await calibration.actions.savePageSize(8.5, 11, 'in');

// Known length method
await calibration.actions.saveKnownLength(pixelDistance, realDistance, 'ft');

// Use calibration
const realDist = calibration.computed.calculateRealDistance(pixelDist);
```

**State:**

- `state.calibration`: Current calibration data
- `state.loading`: Loading state

**Actions:**

- `savePageSize(width, height, unit)`: Set by page dimensions
- `saveKnownLength(pixelDist, realDist, unit)`: Set by known measurement
- `remove()`: Clear calibration

**Computed:**

- `calculateRealDistance(pixelDist)`: Convert pixels to real units
- `getDisplayUnit()`: Get current unit
- `isCalibrated`: Whether page is calibrated

#### `useScreenshotCapture`

Orchestrates the complete screenshot capture workflow.

```typescript
const screenshotCapture = useScreenshotCapture({
  projectId,
  assessmentId,
  pageNumber,
  page,
  canvasRef,
  transform,
  selection,
  onSuccess: () => console.log('Screenshot saved'),
  onError: err => console.error('Capture failed:', err),
});

// Usage
await screenshotCapture.capture('current', 'plan', {
  elementGroupId: 'bathroom-1',
  caption: 'Main bathroom',
});
```

**Features:**

- Complete capture workflow
- Element instance creation
- S3 upload
- Database persistence
- Error handling

#### `useKeyboardShortcuts`

Centralized keyboard event handling.

```typescript
useKeyboardShortcuts(
  containerRef,
  {
    mode: state.mode,
    readOnly: false,
    hasSelection: Boolean(selection),
    disabled: modalOpen,
  },
  {
    onPrevPage: () => goToPrevPage(),
    onNextPage: () => goToNextPage(),
    onZoomIn: () => zoomIn(),
    onZoomOut: () => zoomOut(),
    onResetZoom: () => resetZoom(),
    onToggleScreenshot: () => toggleScreenshotMode(),
    // ... more handlers
  }
);
```

**Shortcuts:**

- **Navigation:** Arrow Left/Right (page navigation)
- **Zoom:** -/+ (zoom out/in), 0 (reset)
- **Modes:** S (screenshot), M (measure), L (calibration)
- **Screenshot:** C/E/B/D/K (capture types)
- **Escape:** Exit current mode
- **Delete:** Remove selected measurement
- **F:** Open search

#### `usePdfMouseHandlers`

Mouse interaction handling for pan and selection.

```typescript
const mouseHandlers = usePdfMouseHandlers(
  mode,
  readOnly,
  {
    onStartDrag: () => setIsDragging(true),
    onEndDrag: () => setIsDragging(false),
    onUpdateDrag: (dx, dy) => updatePan(dx, dy),
    onStartSelection: (x, y) => startSelect(x, y),
    onUpdateSelection: (x, y) => updateSelect(x, y),
    onEndSelection: () => finishSelect()
  }
);

// Attach to canvas
<canvas
  onMouseDown={mouseHandlers.onMouseDown}
  onMouseMove={mouseHandlers.onMouseMove}
  onMouseUp={mouseHandlers.onMouseUp}
  onMouseLeave={mouseHandlers.onMouseLeave}
/>
```

**Features:**

- Mode-aware interaction (pan vs. selection)
- Drag state management
- Selection rectangle tracking
- Proper event propagation

## Type System

### `HookReturn<TState, TActions, TComputed>`

Standard pattern for hook return values:

```typescript
interface HookReturn<TState, TActions, TComputed = {}> {
  state: TState;
  actions: TActions;
  computed?: TComputed;
}
```

**Example:**

```typescript
const measurements = useMeasurements(projectId, pageNumber);

// Access state
console.log(measurements.state.measurements);

// Invoke actions
await measurements.actions.save(data);

// Use computed values
const realDist = calibration.computed.calculateRealDistance(100);
```

### `ViewerMode` Discriminated Union

Replaces boolean flags with type-safe mode state:

```typescript
type ViewerMode =
  | { type: 'idle' }
  | { type: 'screenshot'; selection: Selection | null }
  | { type: 'measure'; selection: Selection | null }
  | { type: 'calibrate'; selection: Selection | null };
```

**Benefits:**

- Impossible states are unrepresentable (e.g., idle with selection)
- Type narrowing works automatically
- Clear mode transitions

**Usage:**

```typescript
// Type-safe checking
if (mode.type === 'screenshot') {
  // TypeScript knows mode.selection exists
  if (mode.selection) {
    captureScreenshot(mode.selection);
  }
}

// Helper functions
const newMode = enterMode('measure'); // { type: 'measure', selection: null }
const updated = startSelection(newMode, x, y); // Adds selection
```

## Design Patterns

### 1. Separation of Concerns

Each hook has a single, well-defined purpose:

- ✅ `useMeasurements` - CRUD for measurements
- ✅ `useCalibration` - Scale calibration
- ❌ `useMeasurementsAndCalibration` - Too broad

### 2. Composition Over Inheritance

Build complex features by composing simple hooks:

```typescript
function PDFViewer() {
  const { url } = usePresignedUrl(pdfUrl);
  const { page } = usePdfDocument(url, pageNumber);
  const layers = usePdfLayers(page);
  const measurements = useMeasurements(projectId, pageNumber);

  // Compose behaviors
  return (
    <div>
      <LayerPanel layers={layers} />
      <MeasurementList measurements={measurements} />
    </div>
  );
}
```

### 3. Pure Utility Functions

Extract pure logic into utility files:

```typescript
// ✅ Good: Pure function in lib/pdf/calibration-utils.ts
export function calculatePixelsPerUnit(
  pageWidth: number,
  pageHeight: number,
  realWidth: number,
  realHeight: number
): number {
  return Math.sqrt(
    (pageWidth * pageWidth + pageHeight * pageHeight) /
      (realWidth * realWidth + realHeight * realHeight)
  );
}

// ❌ Bad: Impure logic mixed in hook
function useCalibration() {
  const calculate = () => {
    // Complex calculation + side effects
  };
}
```

### 4. Controlled Dependencies

Minimize `useEffect` dependencies to prevent unnecessary re-runs:

```typescript
// ✅ Good: Stable reference
const handleClick = useCallback(() => {
  doSomething(stableValue);
}, [stableValue]);

// ❌ Bad: New function every render
const handleClick = () => {
  doSomething(value);
};
```

### 5. Error Boundaries

Handle errors gracefully within hooks:

```typescript
const { data, error } = useFetch('/api/data');

if (error) {
  return <ErrorMessage error={error} />;
}

if (!data) {
  return <LoadingSpinner />;
}

return <DataDisplay data={data} />;
```

## Testing Strategy

### Unit Testing Hooks

Use `@testing-library/react-hooks` for isolated hook testing:

```typescript
import { renderHook, act } from '@testing-library/react';
import { useMeasurements } from '@/hooks/useMeasurements';

test('creates measurement', async () => {
  const { result } = renderHook(() => useMeasurements('project-1', 1));

  await act(async () => {
    await result.current.actions.save({
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 100,
      realDistance: 10,
      unit: 'ft',
    });
  });

  expect(result.current.state.measurements).toHaveLength(1);
});
```

### Integration Testing

Test hook composition in components:

```typescript
test('PDF viewer with measurements', async () => {
  render(<PDFViewer pdfUrl="/test.pdf" projectId="proj-1" />);

  // Interact with UI
  await userEvent.click(screen.getByText('Measure'));

  // Verify hook integration
  expect(screen.getByText('Measurement Mode')).toBeInTheDocument();
});
```

### E2E Testing

Test complete user workflows:

```typescript
test('user can create and save measurement', async ({ page }) => {
  await page.goto('/projects/test-project');
  await page.click('[data-testid="measure-button"]');

  // Draw measurement
  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.mouse.move(200, 200);
  await page.mouse.up();

  // Verify saved
  await expect(page.locator('[data-testid="measurement-item"]')).toBeVisible();
});
```

## Performance Considerations

### 1. Memoization

Use `useMemo` for expensive computations:

```typescript
const sortedMeasurements = useMemo(
  () => measurements.sort((a, b) => a.createdAt - b.createdAt),
  [measurements]
);
```

### 2. Callback Stability

Use `useCallback` for functions passed to child components:

```typescript
const handleSave = useCallback(
  data => {
    return measurements.actions.save(data);
  },
  [measurements.actions.save]
);
```

### 3. Debouncing

Use `usePersisted` debouncing for frequent updates:

```typescript
const [transform, setTransform] = usePersisted('transform', initialTransform, {
  debounce: 300, // Wait 300ms before saving
});
```

### 4. Lazy Loading

Load hooks conditionally:

```typescript
// Only load measurements when in measure mode
const measurements = mode.type === 'measure' ? useMeasurements(projectId, pageNumber) : null;
```

## Migration Guide

### From Old Pattern to New Pattern

#### Before: Direct State Management

```typescript
const [measurements, setMeasurements] = useState([]);
const [loading, setLoading] = useState(false);

useEffect(() => {
  setLoading(true);
  fetch(`/api/measurements`)
    .then(res => res.json())
    .then(data => setMeasurements(data))
    .finally(() => setLoading(false));
}, []);
```

#### After: Hook-Based

```typescript
const measurements = useMeasurements(projectId, pageNumber);

// State and actions are available
const { measurements, loading } = measurements.state;
const { save, update, remove } = measurements.actions;
```

### From Boolean Flags to Discriminated Union

#### Before: Boolean Flags

```typescript
const [screenshotMode, setScreenshotMode] = useState(false);
const [measurementMode, setMeasurementMode] = useState(false);
const [selection, setSelection] = useState(null);

// Problem: Can have both modes true, or selection without mode
```

#### After: Discriminated Union

```typescript
const [mode, setMode] = useState<ViewerMode>({ type: 'idle' });

// Enter screenshot mode
setMode({ type: 'screenshot', selection: null });

// Start selection
if (mode.type === 'screenshot') {
  setMode({ ...mode, selection: { x1, y1, x2, y2 } });
}
```

## Best Practices

### DO ✅

1. **Use the HookReturn pattern** for consistency
2. **Extract pure functions** to utility files
3. **Compose hooks** to build features
4. **Use discriminated unions** for complex state
5. **Write tests** for each hook
6. **Document hook APIs** with JSDoc
7. **Handle errors** within hooks
8. **Memoize expensive operations**
9. **Use TypeScript** for type safety
10. **Keep hooks focused** on single responsibility

### DON'T ❌

1. **Don't mix concerns** in a single hook
2. **Don't skip error handling**
3. **Don't ignore loading states**
4. **Don't use `any` types** (use `unknown` if needed)
5. **Don't create circular dependencies**
6. **Don't forget cleanup** in `useEffect`
7. **Don't mutate state directly**
8. **Don't over-optimize** prematurely
9. **Don't skip dependency arrays**
10. **Don't duplicate logic** across hooks

## Future Enhancements

### Planned Improvements

1. **Add `useAnnotations`** - For PDF annotation management
2. **Add `useTextSelection`** - For text selection and copying
3. **Add `useUndoRedo`** - For measurement/annotation history
4. **Add `useCollaboration`** - For real-time collaborative editing
5. **Improve error recovery** - Better error boundaries and retry logic
6. **Add offline support** - LocalStorage fallbacks for offline editing
7. **Add `useAccessibility`** - Keyboard navigation and screen reader support

### Extension Points

The architecture is designed for extension:

```typescript
// Create custom hook by composing existing ones
function useAdvancedMeasurements(projectId: string, pageNumber: number) {
  const measurements = useMeasurements(projectId, pageNumber);
  const calibration = useCalibration(projectId, pageNumber);

  const measurementsWithRealDistances = useMemo(() => {
    return measurements.state.measurements.map(m => ({
      ...m,
      realDistance: calibration.computed.calculateRealDistance(m.pixelDistance),
    }));
  }, [measurements.state.measurements, calibration.computed]);

  return {
    ...measurements,
    state: {
      ...measurements.state,
      measurements: measurementsWithRealDistances,
    },
  };
}
```

## Resources

- [React Hooks Documentation](https://react.dev/reference/react/hooks)
- [TypeScript Handbook - Discriminated Unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
- [PDF.js Documentation](https://mozilla.github.io/pdf.js/)
- [Testing Library - React Hooks](https://react-hooks-testing-library.com/)

## Support

For questions or issues with the hook architecture:

1. Review this document and the hook source code
2. Check existing tests for usage examples
3. Consult the team in #frontend-arch channel
4. Create a GitHub issue with the `architecture` label

---

**Last Updated:** November 4, 2025  
**Version:** 1.0.0  
**Maintained By:** Development Team
