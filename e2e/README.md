# E2E Tests for PDF Viewer

Comprehensive end-to-end tests using Playwright to prevent regressions in the PDF viewer component.

## Setup

Tests are already configured in `playwright.config.ts`. Chromium browser is installed.

### Environment Setup

To run tests against a real assessment, you need to set up test data:

```bash
# Set the assessment ID to test against
export TEST_ASSESSMENT_ID="your-assessment-id-here"
```

**Without `TEST_ASSESSMENT_ID`**, tests will be skipped with a helpful message.

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run tests in UI mode (interactive)
npm run test:e2e:ui

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Run specific test file
npx playwright test e2e/pdf-viewer-navigation.spec.ts

# Run tests with debugging
npx playwright test --debug

# Generate HTML report
npx playwright show-report
```

## Test Coverage

### 1. Navigation Tests (`pdf-viewer-navigation.spec.ts`)

- ✅ Canvas loading and rendering
- ✅ Page navigation (buttons and keyboard)
- ✅ Zoom in/out (buttons, keyboard, wheel)
- ✅ Pan by dragging
- ✅ Zoom persistence across page changes
- ✅ Keyboard shortcuts display

**Key tests:**

- `should load PDF viewer with canvas` - Verifies basic rendering
- `should navigate pages with arrow keys` - Tests keyboard controls
- `should zoom in with button` - Tests zoom functionality
- `should pan the PDF by dragging` - Tests interaction

### 2. Screenshot Capture Tests (`pdf-viewer-screenshot.spec.ts`)

- ✅ Toggle screenshot mode (button and keyboard)
- ✅ Exit with Escape key
- ✅ Draw selection rectangle
- ✅ Keyboard shortcuts display (C, B, D, K)
- ✅ Cursor change (crosshair in screenshot mode)
- ✅ Selection cleared on mode exit
- ✅ Panning disabled in screenshot mode
- ✅ Render scale controls (min: 2.0, max: 8.0)

**Key tests:**

- `should toggle screenshot mode with S key` - Tests mode activation
- `should draw selection rectangle` - Tests selection creation
- `should disable panning in screenshot mode` - Tests mode isolation
- `should respect min/max render scale limits` - Tests safety bounds

### 3. Layer Management Tests (`pdf-viewer-layers.spec.ts`)

- ✅ Layer panel visibility (only if PDF has layers)
- ✅ Toggle layer panel
- ✅ List layers with checkboxes
- ✅ Toggle layer visibility
- ✅ Persist layer state across pages

**Key tests:**

- `should toggle layer visibility` - Tests OCG rendering
- `should persist layer visibility across page changes` - Tests state management

### 4. Canvas Rendering Tests (`pdf-viewer-canvas.spec.ts`)

- ✅ Canvas dimensions and backing store
- ✅ Maximum canvas size limits (16384px, 268M pixels)
- ✅ Render scale changes update canvas
- ✅ Different content on different pages
- ✅ Visual quality at zoom levels
- ✅ Rapid zoom/pan stability
- ✅ In-flight render cancellation
- ✅ White background rendering

**Key tests:**

- `should respect maximum canvas size limits` - Tests safety constraints
- `should not crash with rapid page changes` - Tests stability
- `should properly cancel in-flight renders` - Tests async handling

## Test Data Requirements

Tests require:

1. A valid assessment ID in the database
2. Assessment must have a PDF uploaded
3. PDF should have multiple pages (for navigation tests)
4. Ideally, PDF has layers/OCG for layer tests

### Creating Test Data

You can create test data via the UI or API:

```bash
# Create a customer, project, assessment, and upload a PDF
# Then get the assessment ID
export TEST_ASSESSMENT_ID="<assessment-id>"
```

Or skip tests that require specific setup:

```typescript
test.skip(!process.env.TEST_ASSESSMENT_ID, 'Set TEST_ASSESSMENT_ID to run these tests');
```

## Visual Regression Testing

For true visual regression testing (pixel-perfect comparisons), consider integrating:

- **Chromatic** - Component-level visual testing with Storybook
- **Percy** - Full-page visual testing with AI-powered diffing
- **Playwright Visual Comparisons** - Built-in screenshot comparison

### Example Visual Regression (Built-in)

```typescript
test('PDF renders correctly', async ({ page }) => {
  await page.goto('/assessments/123');
  await expect(page).toHaveScreenshot('pdf-viewer.png', {
    maxDiffPixels: 100,
  });
});
```

## Debugging Tips

### 1. Run in Headed Mode

```bash
npx playwright test --headed
```

### 2. Use Debug Mode

```bash
npx playwright test --debug
```

### 3. Inspect Element States

```typescript
await page.pause(); // Pauses test for manual inspection
```

### 4. Console Logs

```typescript
page.on('console', msg => console.log('Browser:', msg.text()));
```

### 5. Screenshots on Failure

Automatically captured in `test-results/` directory.

### 6. Video Recording

Videos saved in `test-results/` for failed tests.

## CI/CD Integration

Tests run automatically in GitHub Actions (if configured):

```yaml
# .github/workflows/playwright.yml
name: Playwright Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
        env:
          TEST_ASSESSMENT_ID: ${{ secrets.TEST_ASSESSMENT_ID }}
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Performance Benchmarks

Tests include performance checks:

- Canvas render time < 2s
- Page navigation < 1s
- Zoom operations < 300ms
- Screenshot capture < 2s

## Known Limitations

1. **Database Dependency** - Tests require a real database with test data
2. **PDF Dependency** - Tests need actual PDF files
3. **Network Calls** - Tests make real S3 presigning calls
4. **Timing Sensitivity** - Some tests use timeouts for rendering

## Future Enhancements

- [ ] Add mock mode for running without database
- [ ] Add screenshot capture full flow test (requires check selection)
- [ ] Add violation marker rendering tests
- [ ] Add read-only mode tests (report viewer)
- [ ] Add mobile viewport tests
- [ ] Add accessibility tests (keyboard navigation, screen readers)
- [ ] Add performance profiling tests
- [ ] Integration with Chromatic/Percy for visual regression

## Troubleshooting

### Tests timing out

- Increase timeout in individual tests: `test.setTimeout(60000)`
- Check dev server is running: `npm run dev`
- Verify `baseURL` in `playwright.config.ts`

### Canvas not rendering

- Check PDF.js worker URL is accessible
- Verify S3 presigning works
- Check browser console for errors: `npx playwright test --headed`

### Flaky tests

- Add explicit waits: `await page.waitForTimeout(500)`
- Use `waitForPDF()` fixture for PDF-specific waiting
- Increase retry count in `playwright.config.ts`

### No test data

- Set `TEST_ASSESSMENT_ID` environment variable
- Or skip tests: tests will skip with helpful message

## Contributing

When adding new PDF viewer features:

1. Add corresponding E2E tests
2. Follow existing test patterns
3. Use fixtures for common operations
4. Add descriptive test names
5. Include comments for complex interactions
6. Test both happy path and edge cases

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Visual Testing Guide](https://playwright.dev/docs/test-snapshots)
