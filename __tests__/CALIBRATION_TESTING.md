# Calibration and Measurement Testing Guide

This document describes the comprehensive test suite for the PDF calibration and measurement system.

## Overview

The test suite covers all aspects of the calibration and measurement system, from low-level calculation logic to end-to-end user workflows. Tests are organized in four layers:

1. **Unit Tests** - Pure calculation logic
2. **API Integration Tests** - Endpoint behavior and validation
3. **E2E Tests** - Full user workflows with Playwright
4. **Accuracy Tests** - End-to-end measurement accuracy verification

## Test Files

### Unit Tests (Vitest)

#### `__tests__/lib/calibration-calculations.test.ts`
Tests for core calculation functions extracted into `lib/calibration-calculations.ts`:

- Scale notation parsing (1/8"=1'-0", etc.)
- Pixel-to-inch conversion (both methods)
- Coordinate transformations
- Distance calculations
- Aspect ratio validation
- Format helpers (architectural notation, metric conversion)

**Run with:**
```bash
npm run test -- calibration-calculations
```

### API Integration Tests (Vitest)

#### `__tests__/api/measurements/calibrate.test.ts`
Tests for the calibration API endpoint (`/api/measurements/calibrate`):

- GET: Fetch calibration data for a project page
- POST: Create/update calibration with Page Size Method
- POST: Create/update calibration with Known Length Method
- Validation errors for both methods
- Upsert behavior

**Run with:**
```bash
npm run test -- api/measurements/calibrate
```

#### `__tests__/api/measurements/measurements.test.ts`
Tests for the measurements CRUD API (`/api/measurements`):

- GET: Fetch measurements for a project page
- POST: Create new measurements
- DELETE: Remove measurements
- Validation (required fields, point structure)
- Measurements with/without calibration

**Run with:**
```bash
npm run test -- api/measurements/measurements
```

### E2E Tests (Playwright)

#### `e2e/pdf-calibration.spec.ts`
End-to-end tests for calibration workflows:

- Opening calibration modal (L key, toolbar button)
- Page Size Method flow
  - Scale notation input and validation
  - Print size input and validation
  - Quick scale/size buttons
  - PDF dimension detection
- Known Length Method flow
  - Drawing calibration line
  - Entering known distance
  - Redrawing line
- Calibration persistence across pages
- Modal interactions (Escape, Cancel, Enter)

**Run with:**
```bash
npm run test:e2e -- pdf-calibration
```

#### `e2e/pdf-measurements.spec.ts`
End-to-end tests for measurement workflows:

- Entering measurement mode (M key, toolbar button)
- Drawing measurements (horizontal, vertical, diagonal)
- Real-time preview while drawing
- Measurement calculations with/without calibration
- Selecting and deleting measurements
- Multiple measurements on same page
- Measurements on different pages
- Interaction with screenshot mode
- Calibration line display

**Run with:**
```bash
npm run test:e2e -- pdf-measurements
```

### Accuracy Tests (Vitest)

#### `__tests__/lib/measurement-accuracy.test.ts`
End-to-end accuracy verification using programmatically generated PDFs:

- Page Size Method accuracy at various scales (1/8", 1/4", 1/2")
- Known Length Method accuracy
- Diagonal line measurements
- Scale parsing accuracy for all common scales
- Orientation handling (landscape/portrait)
- Edge cases (small sheets, very small/large measurements)
- Consistency between calibration methods

**Accuracy Threshold:** ±0.1 inches

**Run with:**
```bash
npm run test -- measurement-accuracy
```

### Mock PDF Generator

#### `__tests__/fixtures/generate-mock-pdfs.ts`
Utility to generate test PDFs with known dimensions:

- 24×36 Arch D at 1/8" scale
- 11×17 Tabloid at 1/4" scale
- Letter size with 1" ruler
- Portrait orientation test
- Small 6×9 sheet

Each PDF includes:
- Known page dimensions
- Grid patterns for visual verification
- Reference lines with documented real-world lengths
- Labels showing expected measurements

**Generate PDFs:**
```bash
npx tsx __tests__/fixtures/generate-mock-pdfs.ts
```

PDFs will be saved to `__tests__/fixtures/mock-pdfs/`

## Running Tests

### Run All Tests
```bash
# Unit + API integration tests
npm run test

# E2E tests
npm run test:e2e

# Everything
npm run test && npm run test:e2e
```

### Run Specific Test Suites
```bash
# Unit tests only
npm run test -- __tests__/lib

# API tests only
npm run test -- __tests__/api

# Calibration E2E only
npm run test:e2e -- pdf-calibration

# Measurements E2E only
npm run test:e2e -- pdf-measurements

# Accuracy tests only
npm run test -- measurement-accuracy
```

### Run in Watch Mode
```bash
# Unit tests
npm run test -- --watch

# E2E tests
npm run test:e2e -- --ui
```

## Test Coverage

### What's Tested

✅ **Scale Notation Parsing**
- All common architectural scales (1/8", 1/4", 3/16", 1/2", 3/4", 1")
- Various formats and whitespace handling
- Invalid format rejection
- Edge cases (division by zero, invalid characters)

✅ **Pixel-to-Inch Conversion**
- Page Size Method calculations
- Known Length Method calculations
- Coordinate transformations
- Distance formulas (horizontal, vertical, diagonal)

✅ **Validation Logic**
- Scale notation format validation
- Print size dimension validation
- Aspect ratio checking
- Point structure validation
- Known distance validation

✅ **API Endpoints**
- GET/POST calibration data
- GET/POST/DELETE measurements
- Error handling and validation
- Upsert behavior

✅ **User Workflows**
- Opening/closing calibration modal
- Both calibration methods
- Drawing measurements
- Selecting/deleting measurements
- Keyboard shortcuts
- Persistence across navigation

✅ **Measurement Accuracy**
- ±0.1 inch accuracy verification
- Multiple scales and sheet sizes
- Both calibration methods
- Edge cases (small/large measurements)
- Orientation handling

### What's Not Tested

❌ **Component Rendering** - CalibrationModal and MeasurementOverlay UI (would require React Testing Library)

❌ **PDF Rendering** - PDF.js canvas rendering (covered by existing `e2e/pdf-viewer-*.spec.ts` tests)

❌ **Database Integration** - Real Supabase operations (API tests use mocks)

❌ **S3 Operations** - File uploads/downloads (not relevant to calculations)

## Success Criteria

Tests verify that:

1. ✅ Calculations are accurate within ±0.1 inches for all test PDFs
2. ✅ Scale parsing correctly handles all common architectural notations
3. ✅ Coordinate transformations preserve precision
4. ✅ Measurements update correctly when calibration changes
5. ✅ Both calibration methods produce consistent results
6. ✅ User workflows complete successfully without errors
7. ✅ Validation provides clear, helpful feedback
8. ✅ Keyboard shortcuts work reliably
9. ✅ Measurements persist across page navigation
10. ✅ API endpoints handle errors gracefully

## Performance Expectations

- Calibration calculations: < 50ms
- Measurement overlay rendering: No lag with 50+ measurements
- PDF generation for tests: < 2 seconds for all PDFs
- Unit test suite: < 5 seconds
- API test suite: < 10 seconds
- E2E test suite: < 2 minutes

## Known Limitations

1. **E2E Tests Require TEST_ASSESSMENT_ID** - E2E tests need a real assessment with PDF uploaded. Set `TEST_ASSESSMENT_ID` environment variable to run them.

2. **Mock PDFs in Memory** - Accuracy tests generate PDFs in memory rather than from fixtures to ensure fresh, consistent data.

3. **Floating Point Precision** - Tests use `toBeCloseTo()` with appropriate precision (1-2 decimal places) to account for floating point arithmetic.

4. **Browser-Specific Rendering** - E2E tests may have slight variations across browsers due to PDF rendering differences.

## Troubleshooting

### Unit Tests Failing

Check that calculation functions in `lib/calibration-calculations.ts` haven't been modified in a way that breaks the expected API.

### API Tests Failing

Ensure Supabase mocks are properly configured. Check that the actual API route signatures match the test expectations.

### E2E Tests Failing

1. Verify `TEST_ASSESSMENT_ID` is set to a valid assessment
2. Check that the PDF has loaded before interactions
3. Ensure browser viewport is large enough (default 1280x720)
4. Look for timing issues - add `waitForTimeout()` if needed

### Accuracy Tests Failing

1. Verify mock PDFs are generating correctly
2. Check that pdf-lib version matches expectations
3. Ensure calculation functions haven't changed
4. Look for floating point precision issues

## Adding New Tests

### New Calculation Function

1. Add function to `lib/calibration-calculations.ts`
2. Export function
3. Add unit tests to `__tests__/lib/calibration-calculations.test.ts`
4. Test with various inputs, edge cases, and invalid inputs

### New API Endpoint

1. Create endpoint in `app/api/...`
2. Add test file in `__tests__/api/...`
3. Mock Supabase client
4. Test success, validation, and error cases

### New User Workflow

1. Add E2E test to appropriate spec file
2. Use Page Object Model pattern if complex
3. Test happy path and error handling
4. Verify persistence if applicable

### New Mock PDF

1. Add spec to `TEST_PDF_SPECS` in `generate-mock-pdfs.ts`
2. Define page size, scale, and reference lines
3. Run generator to create PDF
4. Add accuracy test in `measurement-accuracy.test.ts`

## CI/CD Integration

### Recommended CI Pipeline

```yaml
test:
  steps:
    - name: Install dependencies
      run: npm ci
      
    - name: Run unit tests
      run: npm run test
      
    - name: Run E2E tests (if TEST_ASSESSMENT_ID available)
      run: npm run test:e2e
      env:
        TEST_ASSESSMENT_ID: ${{ secrets.TEST_ASSESSMENT_ID }}
        
    - name: Generate coverage report
      run: npm run test -- --coverage
```

### Pre-commit Hook

```bash
# .husky/pre-commit
npm run test -- --run
```

## Future Improvements

1. **Component Tests** - Add React Testing Library tests for CalibrationModal
2. **Visual Regression** - Add Percy/Chromatic for measurement overlay rendering
3. **Load Tests** - Test performance with 100+ measurements
4. **Database Integration Tests** - Test with real Supabase instance
5. **Cross-browser E2E** - Run Playwright tests on Firefox and WebKit
6. **Mutation Testing** - Use Stryker to verify test quality

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [pdf-lib Documentation](https://pdf-lib.js.org/)
- [Architectural Scale Reference](https://www.archtoolbox.com/materials-systems/architectural-concepts/architectural-scales.html)



