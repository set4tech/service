# Quick Start: Running E2E Tests

## ⚡ Fastest Way to Run Tests

```bash
# 1. Make sure dev server is running (in another terminal)
npm run dev

# 2. Set test assessment ID (optional - tests will skip if not set)
export TEST_ASSESSMENT_ID="your-assessment-id"

# 3. Run tests
npm run test:e2e
```

## 🎯 Running Without Test Data

If you don't set `TEST_ASSESSMENT_ID`, tests will gracefully skip:

```bash
npm run test:e2e
# Output: Tests will show "skipped" with message:
# "Set TEST_ASSESSMENT_ID to run these tests"
```

This is safe and won't fail your CI/CD pipeline.

## 🎨 Interactive Testing (Recommended for Development)

```bash
npm run test:e2e:ui
```

This opens Playwright's UI where you can:

- ✅ See tests running in real-time
- ✅ Time-travel through test steps
- ✅ Inspect DOM at each step
- ✅ Re-run failed tests
- ✅ Debug with browser DevTools

## 🐛 Debugging Failed Tests

```bash
npm run test:e2e:debug
```

This opens Playwright Inspector for step-by-step debugging.

## 📊 Viewing Test Results

After running tests, view the HTML report:

```bash
npm run test:e2e:report
```

## 🎬 Watching Tests Run (Headed Mode)

```bash
npm run test:e2e:headed
```

See the actual browser as tests execute.

## 📝 Creating Test Data

### Option 1: Use the UI

1. Go to http://localhost:3000
2. Create a customer
3. Create a project
4. Upload a PDF
5. Start an assessment
6. Copy the assessment ID from the URL
7. Set it: `export TEST_ASSESSMENT_ID="<id>"`

### Option 2: Use Existing Assessment

If you have existing assessments:

```bash
# Get assessment ID from your database
export TEST_ASSESSMENT_ID="d052bcc6-caea-430e-b5c4-6f42aabc638d"
```

### Option 3: Add to .envrc (direnv users)

```bash
echo 'export TEST_ASSESSMENT_ID="your-id"' >> .envrc
direnv allow
```

## 🏃 Running Specific Tests

```bash
# Run only navigation tests
npx playwright test pdf-viewer-navigation

# Run only screenshot tests
npx playwright test pdf-viewer-screenshot

# Run only canvas tests
npx playwright test pdf-viewer-canvas

# Run only layer tests
npx playwright test pdf-viewer-layers

# Run a single test by name
npx playwright test -g "should zoom in with button"
```

## 🔍 Common Issues

### "Tests timing out"

**Solution**: Increase dev server startup time in `playwright.config.ts`:

```typescript
webServer: {
  timeout: 180 * 1000, // 3 minutes
}
```

### "Canvas not rendering"

**Solution**: Run in headed mode to see what's happening:

```bash
npm run test:e2e:headed
```

### "All tests skipped"

**Solution**: Set `TEST_ASSESSMENT_ID`:

```bash
export TEST_ASSESSMENT_ID="your-assessment-id"
npm run test:e2e
```

### "Tests flaky"

**Solution**: Tests include explicit waits, but you can add more:

```typescript
await page.waitForTimeout(1000); // Add after state changes
```

## 📈 CI/CD Integration

Tests automatically skip if `TEST_ASSESSMENT_ID` is not set, making them safe for CI:

```yaml
# GitHub Actions example
- name: Run E2E Tests
  run: npm run test:e2e
  env:
    TEST_ASSESSMENT_ID: ${{ secrets.TEST_ASSESSMENT_ID }}
```

If secret is not set, tests skip gracefully ✅

## 🎓 Learning Playwright

- Docs: https://playwright.dev
- Examples: https://playwright.dev/docs/test-examples
- Best Practices: https://playwright.dev/docs/best-practices

## 💡 Pro Tips

1. **Use UI mode during development**:

   ```bash
   npm run test:e2e:ui
   ```

   It's the fastest way to write and debug tests.

2. **Focus on one test**:

   ```typescript
   test.only('should zoom in', async ({ page }) => {
     // ...
   });
   ```

3. **Skip slow tests during development**:

   ```typescript
   test.skip('slow test', async ({ page }) => {
     // ...
   });
   ```

4. **Use Page Object Model** for complex tests (see fixtures/setup.ts for examples)

5. **Screenshot assertions** for visual regression:
   ```typescript
   await expect(page).toHaveScreenshot('name.png');
   ```

## 🚀 Next Steps

After validating tests work:

1. ✅ Add tests to CI/CD pipeline
2. ✅ Integrate Chromatic or Percy for visual regression
3. ✅ Add more test scenarios as you build features
4. ✅ Set up test data seeding script
5. ✅ Add mobile viewport tests

Happy testing! 🎉
