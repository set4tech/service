# How to Verify What Tests Actually Do

## 🔍 Method 1: Read the Test Code

Each test has clear assertions. Look for `expect()` statements:

### Example: Zoom Test

```typescript
test('should zoom in with button', async ({ page }) => {
  // Get initial zoom level
  const zoomText = await page.locator('text=/\\d+%/').first().textContent();
  const initialZoom = parseInt(zoomText?.replace('%', '') || '100');

  // Click zoom in button
  await page.getByLabel('Zoom in').click();

  // Wait for zoom to apply
  await page.waitForTimeout(200);

  // ASSERTION: Verify zoom actually increased
  const newZoomText = await page.locator('text=/\\d+%/').first().textContent();
  const newZoom = parseInt(newZoomText?.replace('%', '') || '100');

  expect(newZoom).toBeGreaterThan(initialZoom); // ← This fails if zoom didn't work
});
```

**What it tests:**

1. ✅ Finds zoom percentage display
2. ✅ Clicks the zoom in button
3. ✅ Reads new zoom value
4. ✅ Verifies it increased (fails if it didn't)

### Example: Canvas Limits Test

```typescript
test('should respect maximum canvas size limits', async ({ page }) => {
  const canvas = await pdfCanvas();

  const canvasInfo = await canvas.evaluate(el => ({
    width: (el as HTMLCanvasElement).width,
    height: (el as HTMLCanvasElement).height,
  }));

  // ASSERTIONS: These fail if limits are exceeded
  expect(canvasInfo.width).toBeLessThanOrEqual(16384); // MAX_CANVAS_SIDE
  expect(canvasInfo.height).toBeLessThanOrEqual(16384);

  const totalPixels = canvasInfo.width * canvasInfo.height;
  expect(totalPixels).toBeLessThanOrEqual(268_000_000); // MAX_CANVAS_PIXELS
});
```

**What it tests:**

1. ✅ Gets actual canvas element from DOM
2. ✅ Reads internal width/height (backing store)
3. ✅ Verifies limits (test FAILS if exceeded)

## 🎥 Method 2: Watch Tests Execute (UI Mode)

**Best way to see what tests do:**

```bash
npm run test:e2e:ui
```

This opens Playwright's UI where you can:

- ✅ See the browser as tests run
- ✅ Step through each action
- ✅ See what elements are clicked
- ✅ View assertions pass/fail in real-time
- ✅ Time-travel through test execution

**Try it now:**

1. Run `npm run test:e2e:ui`
2. Click on `example.spec.ts`
3. Click a test name
4. Watch it execute step-by-step

You'll literally see:

- Browser opens
- Page loads
- Buttons get clicked
- Zoom changes
- Assertions pass ✅ or fail ❌

## 🎬 Method 3: Run in Headed Mode

See the actual browser execute tests:

```bash
npm run test:e2e:headed
```

This runs tests in a visible browser window so you can watch:

- Pages loading
- Buttons being clicked
- Canvas rendering
- Zoom changes happening

## 📊 Method 4: Check Test Output

Run a single test with verbose output:

```bash
npx playwright test pdf-viewer-navigation --grep "should zoom in" --reporter=list
```

Output shows:

```
✓ should zoom in with button (891ms)
```

If the zoom didn't work, you'd see:

```
✗ should zoom in with button (891ms)

  Error: expect(received).toBeGreaterThan(expected)
  Expected: > 100
  Received: 100
```

## 🔬 Method 5: Inspect Actual Test Code

Look at what each test actually does:

```bash
# See all assertions in navigation tests
grep -A 2 "expect(" e2e/pdf-viewer-navigation.spec.ts

# See what zoom test does
grep -A 15 "should zoom in" e2e/pdf-viewer-navigation.spec.ts

# See what canvas test checks
grep -A 20 "canvas size limits" e2e/pdf-viewer-canvas.spec.ts
```

## 🧪 Method 6: Run Tests and Check Screenshots

When tests fail, Playwright captures:

- Screenshots
- Videos
- Trace files

```bash
npm run test:e2e:headed

# After running, check:
ls test-results/
# You'll see screenshots/videos of any failures
```

## 📝 Method 7: Add Debug Logging

Temporarily add logging to see what's happening:

```typescript
test('should zoom in', async ({ page }) => {
  const before = await page.locator('text=/\\d+%/').textContent();
  console.log('Zoom before:', before); // ← Add this

  await page.getByLabel('Zoom in').click();

  const after = await page.locator('text=/\\d+%/').textContent();
  console.log('Zoom after:', after); // ← Add this

  // You'll see output in terminal
});
```

## 🎯 Verify Specific Tests

### Test: "should navigate pages with arrow keys"

**File**: `e2e/pdf-viewer-navigation.spec.ts:57`

**What it does:**

```typescript
// 1. Gets current page number from UI
const pageText = await page.locator('text=/Page \\d+ \\/ \\d+/').textContent();
const initialPage = parseInt(pageText!.match(/Page (\d+)/)?.[1] || '1');

// 2. Presses right arrow key
await page.keyboard.press('ArrowRight');

// 3. Verifies page increased
const newPage = parseInt(newPageText!.match(/Page (\d+)/)?.[1] || '1');
expect(newPage).toBe(initialPage + 1); // ← Fails if page didn't change
```

**Verify it:**

```bash
npx playwright test --grep "navigate pages with arrow keys" --headed
# Watch: Browser loads → Arrow pressed → Page changes → Test passes
```

### Test: "should disable panning in screenshot mode"

**File**: `e2e/pdf-viewer-screenshot.spec.ts:154`

**What it does:**

```typescript
// 1. Zoom in (to enable panning)
await page.getByLabel('Zoom in').click();

// 2. Enter screenshot mode
await page.keyboard.press('s');

// 3. Try to pan (drag mouse)
await page.mouse.down();
await page.mouse.move(x, y);
await page.mouse.up();

// 4. Verifies screenshot UI appears (not panning UI)
await expect(page.locator('button:has-text("Save to Current")')).toBeVisible();
```

**Verify it:**

```bash
npx playwright test --grep "disable panning in screenshot" --headed
# Watch: Zoom → Press S → Drag → Save button appears (not pan)
```

### Test: "should respect maximum canvas size limits"

**File**: `e2e/pdf-viewer-canvas.spec.ts:26`

**What it does:**

```typescript
// 1. Gets canvas element from DOM
const canvas = await pdfCanvas();

// 2. Reads actual canvas dimensions (internal resolution)
const canvasInfo = await canvas.evaluate(el => ({
  width: (el as HTMLCanvasElement).width,
  height: (el as HTMLCanvasElement).height,
}));

// 3. Checks against hard limits from PDFViewer.tsx:15-16
expect(canvasInfo.width).toBeLessThanOrEqual(16384);
expect(canvasInfo.height).toBeLessThanOrEqual(16384);
expect(totalPixels).toBeLessThanOrEqual(268_000_000);
```

**Matches PDFViewer code:**

```typescript
// components/pdf/PDFViewer.tsx:15-16
const MAX_CANVAS_SIDE = 16384;
const MAX_CANVAS_PIXELS = 268_000_000;
```

**Verify it:**

```bash
npx playwright test --grep "maximum canvas size" --headed
# Test reads actual canvas element and checks dimensions
```

## 🎪 Live Demo

**Right now, run this:**

```bash
npm run test:e2e:ui
```

1. Click `example.spec.ts`
2. Click "should load projects page"
3. Click the ▶️ play button
4. Watch it:
   - Open browser
   - Go to /projects
   - Check status code is 200
   - Pass ✅

That's exactly what the test does. No magic.

## 🚨 How Tests Fail

If something breaks, you'll see:

```bash
npm run test:e2e

✗ should zoom in with button (1.2s)

  Error: expect(received).toBeGreaterThan(expected)

  Expected: > 100
  Received: 100

  at pdf-viewer-navigation.spec.ts:93
```

Plus:

- Screenshot saved to `test-results/`
- Video of failure
- Full trace file

## 📚 Summary: What Each Test Suite Actually Tests

### Navigation (10 tests)

- **Canvas loading**: Reads canvas element, checks width > 0
- **Page buttons**: Clicks buttons, verifies page number changed
- **Arrow keys**: Sends keyboard events, checks page number
- **Zoom buttons**: Clicks zoom, reads zoom %, verifies changed
- **Pan**: Simulates mouse drag, takes before/after screenshots, compares

### Screenshot (13 tests)

- **Mode toggle**: Presses 'S', checks for banner text
- **Selection**: Simulates mouse drag, checks selection div appears
- **Keyboard shortcuts**: Checks for "C - Current" text after selection
- **Panning disabled**: Enters mode, drags, verifies screenshot UI (not pan)

### Canvas (12 tests)

- **Dimensions**: Reads canvas.width/height, checks > 0
- **Limits**: Reads actual values, compares to MAX constants
- **Rapid changes**: Fires events quickly, checks no crashes
- **Render cancel**: Changes pages rapidly, verifies no errors

### Layers (5 tests)

- **Panel toggle**: Clicks button, checks panel visibility
- **Visibility**: Toggles checkbox, takes screenshots, compares
- **Persistence**: Changes page, verifies checkbox state preserved

## ✅ Bottom Line

**Every test:**

1. Interacts with real DOM elements
2. Makes real assertions
3. Fails if behavior breaks
4. Captures evidence (screenshots/videos)

**To verify:**

- Run `npm run test:e2e:ui` and watch
- Read test code (clear assertions)
- Check test output for failures
- Look at captured screenshots

**No mocking, no faking** - tests run against actual Next.js app with real PDF.js rendering.
