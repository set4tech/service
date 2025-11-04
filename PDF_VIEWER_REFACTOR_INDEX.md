# PDF Viewer Refactoring - Master Index

> **Complete refactoring guide with detailed code snippets for all 67 tasks**

---

## Document Structure

### 📄 Part 1: Foundation & Standardization
**File:** `PDF_VIEWER_REFACTOR_TASKS.md`  
**Tasks:** 1.1.1 through 3.2.1 (28 tasks)  
**Focus:** Create base hooks, standardize existing hooks, begin PDF domain extraction

**Key Deliverables:**
- ✅ `useFetch` - Generic API hook
- ✅ `usePersisted` - LocalStorage persistence
- ✅ `usePolling` - Interval polling
- ✅ Refactor 6 existing hooks to use new patterns
- ✅ Create `useMeasurements` hook

---

### 📄 Part 2: PDF Domain & Type Safety
**File:** `PDF_VIEWER_REFACTOR_TASKS_PART2.md`  
**Tasks:** 3.2.2 through 4.1.2 (18 tasks)  
**Focus:** Extract calibration, canvas, PDF document, layers, persistence, transform hooks

**Key Deliverables:**
- ✅ `calibration-utils.ts` - Pure calculation functions
- ✅ `canvas-utils.ts` - Safe rendering helpers
- ✅ `usePdfDocument` - PDF.js integration
- ✅ `usePdfLayers` - Layer management
- ✅ `usePdfPersistence` - Consolidated storage
- ✅ `useViewTransform` - Pan/zoom logic
- ✅ `useScreenshotCapture` - Full capture workflow
- ✅ `usePresignedUrl` - S3 URL management
- ✅ **Mode Union Type** - Discriminated union replacing booleans

---

### 📄 Part 3: Component Refactoring & Polish
**File:** `PDF_VIEWER_REFACTOR_TASKS_PART3.md`  
**Tasks:** 4.2.1 through 6.4.2 (21 tasks)  
**Focus:** Replace PDFViewer internals, extract handlers, testing, documentation, cleanup

**Key Deliverables:**
- ✅ Replace all manual logic with composed hooks
- ✅ `useKeyboardShortcuts` - Centralized shortcuts
- ✅ `usePdfMouseHandlers` - Mouse interaction
- ✅ Reorganize component to ~800 lines (from 2230)
- ✅ Update E2E tests
- ✅ `docs/HOOK_ARCHITECTURE.md` - Architecture guide
- ✅ Remove dead code, optimize, format

---

## Quick Navigation

### By Phase

- **Phase 1: Foundation** → Part 1 (Tasks 1.1-1.4)
- **Phase 2: Standardization** → Part 1 (Tasks 2.1-2.5)
- **Phase 3: PDF Domain** → Part 1 & 2 (Tasks 3.1-3.8)
- **Phase 4: PDFViewer Refactor** → Part 2 & 3 (Tasks 4.1-4.6)
- **Phase 5: Testing & Docs** → Part 3 (Tasks 5.1-5.3)
- **Phase 6: Cleanup** → Part 3 (Tasks 6.1-6.4)

### By File Created

**Base Hooks:**
- `lib/hooks/useFetch.ts` → Part 1, Task 1.1.1
- `lib/hooks/usePersisted.ts` → Part 1, Task 1.2.1
- `lib/hooks/usePolling.ts` → Part 1, Task 1.3.1
- `lib/hooks/types.ts` → Part 1, Task 1.4.1
- `lib/hooks/index.ts` → Part 1, Task 1.4.2

**Domain Hooks:**
- `hooks/useMeasurements.ts` → Part 1, Task 3.1.1
- `hooks/useCalibration.ts` → Part 1, Task 3.2.1
- `hooks/usePdfDocument.ts` → Part 2, Task 3.3.1
- `hooks/usePdfLayers.ts` → Part 2, Task 3.4.1
- `hooks/usePdfPersistence.ts` → Part 2, Task 3.5.1
- `hooks/useViewTransform.ts` → Part 2, Task 3.6.1
- `hooks/useScreenshotCapture.ts` → Part 2, Task 3.7.1
- `hooks/usePresignedUrl.ts` → Part 2, Task 3.8.1
- `hooks/useKeyboardShortcuts.ts` → Part 3, Task 4.3.1
- `hooks/usePdfMouseHandlers.ts` → Part 3, Task 4.4.1

**Utilities:**
- `lib/pdf/calibration-utils.ts` → Part 2, Task 3.2.2
- `lib/pdf/canvas-utils.ts` → Part 2, Task 3.7.3
- `lib/pdf/transform-utils.ts` → Part 2, Task 3.6.2
- `lib/pdf/element-instance.ts` → Part 2, Task 3.7.2
- `lib/pdf/screenshot-upload.ts` → Part 2, Task 3.7.4

**Types:**
- `components/pdf/types.ts` → Part 2, Task 4.1.1

**Documentation:**
- `docs/HOOK_ARCHITECTURE.md` → Part 3, Task 5.3.1

### By File Modified

**Hooks Refactored:**
- `hooks/useAssessmentScreenshots.ts` → Part 1, Task 2.1
- `hooks/useManualOverride.ts` → Part 1, Task 2.2
- `components/checks/hooks/useCheckData.ts` → Part 1, Task 2.3
- `hooks/useAssessmentPolling.ts` → Part 1, Task 2.4
- `components/checks/hooks/useAssessment.ts` → Part 1, Task 2.5

**Main Component:**
- `components/pdf/PDFViewer.tsx` → All of Phase 4 (Part 2 & 3)
  - Task 4.2.1: Replace presigned URL logic
  - Task 4.2.2: Replace PDF document logic
  - Task 4.2.3: Replace layer logic
  - Task 4.2.4: Replace persistence logic
  - Task 4.2.5: Replace transform logic
  - Task 4.2.6: Replace measurements logic
  - Task 4.2.7: Replace calibration logic
  - Task 4.2.8: Replace screenshot capture
  - Task 4.3.2: Use keyboard shortcuts hook
  - Task 4.4.2: Use mouse handlers hook
  - Task 4.6.1: Reorganize structure

**Documentation:**
- `CLAUDE.md` → Part 3, Task 5.3.2

---

## Implementation Order

### Recommended Sequence

1. ✅ **Start with Phase 1** (Part 1, Tasks 1.1-1.4)
   - Low risk, high value
   - Creates foundation for everything else
   - Can be tested independently

2. ✅ **Then Phase 2** (Part 1, Tasks 2.1-2.5)
   - Incrementally refactor one hook at a time
   - Test after each hook
   - Builds confidence in patterns

3. ⚠️ **Then Phase 3** (Part 1-2, Tasks 3.1-3.8)
   - Extract PDF domain logic
   - Test each hook thoroughly
   - Medium complexity

4. 🔴 **Then Phase 4** (Part 2-3, Tasks 4.1-4.6)
   - High risk - major component changes
   - Do in feature branch
   - Extensive E2E testing
   - Consider feature flag

5. ✅ **Then Phase 5** (Part 3, Tasks 5.1-5.3)
   - Update tests
   - Write documentation
   - Low risk

6. ✅ **Finally Phase 6** (Part 3, Tasks 6.1-6.4)
   - Cleanup
   - Polish
   - Format
   - Low risk

---

## Metrics

### Code Reduction
- **PDFViewer.tsx:** 2,230 → ~800 lines (-64%)
- **Total lines saved:** 1,000+
- **New files created:** 22+
- **Tests added:** 17+

### Complexity Reduction
- **Boolean modes:** 3 → 1 discriminated union
- **useEffect hooks:** ~15 → ~8 (composition)
- **Cyclomatic complexity:** Massively reduced
- **State management:** Centralized and predictable

### Quality Improvements
- ✅ All hooks independently testable
- ✅ Consistent return patterns
- ✅ Strong TypeScript types
- ✅ Pure utility functions
- ✅ Clear separation of concerns
- ✅ Reusable hooks
- ✅ Well-documented

---

## Testing Strategy

### Unit Tests
Each hook gets its own test file with:
- Success cases
- Error handling
- Edge cases
- Mocking strategies

**Coverage Target:** >80%

### Integration Tests
Test composed hooks together:
- Mock PDF.js
- Mock fetch
- Verify state flow

### E2E Tests
Update existing Playwright tests:
- `pdf-viewer-canvas.spec.ts`
- `pdf-viewer-layers.spec.ts`
- `pdf-viewer-navigation.spec.ts`
- `pdf-viewer-screenshot.spec.ts`

All must pass before merging.

---

## Risk Mitigation

### Phase 1-2: Low Risk ✅
- New code, no breaking changes
- Can be tested independently
- Easy to roll back

### Phase 3: Medium Risk ⚠️
- New abstractions for existing logic
- Thorough testing required
- Incremental adoption possible

### Phase 4: High Risk 🔴
- Major component refactoring
- Requires feature branch
- Consider feature flag for gradual rollout
- Extensive QA required

**Mitigation:**
1. Feature branch: `refactor/pdf-viewer-hooks`
2. Feature flag: `PDF_VIEWER_V2`
3. Parallel implementation (old + new)
4. Gradual migration
5. Rollback plan

---

## Success Criteria

- [ ] All 67 tasks completed
- [ ] All existing tests pass
- [ ] All new tests pass
- [ ] E2E tests pass
- [ ] No functional regressions
- [ ] PDFViewer < 1000 lines
- [ ] Code coverage ≥ 80%
- [ ] Documentation complete
- [ ] Team code review approved
- [ ] Performance maintained or improved

---

## Getting Started

### Step 1: Review
Read all three parts to understand the full scope.

### Step 2: Setup
```bash
git checkout -b refactor/pdf-viewer-hooks
```

### Step 3: Execute Phase 1
Start with Task 1.1.1 in Part 1:
```bash
# Create the first file
touch lib/hooks/useFetch.ts
# Copy implementation from Part 1, Task 1.1.1
```

### Step 4: Test as You Go
After each hook:
```bash
npm test -- <hook-name>
```

### Step 5: Commit Frequently
Small, atomic commits make review easier:
```bash
git add lib/hooks/useFetch.ts __tests__/hooks/useFetch.test.tsx
git commit -m "feat: add useFetch base hook"
```

### Step 6: Open PR After Each Phase
Don't wait until everything is done. Open PRs for:
- Phase 1 completion
- Phase 2 completion  
- Phase 3 completion
- Phase 4 completion

This allows for iterative feedback.

---

## Questions?

If you need clarification on any task:
1. Find the task number (e.g., "Task 3.2.1")
2. Locate it in the corresponding Part
3. Read the complete implementation
4. Check the before/after code
5. Review the lines removed/added

Every task has:
- ✅ Complete code snippets
- ✅ Specific file paths
- ✅ Before/After comparisons
- ✅ Line counts
- ✅ Test implementations

---

**Created:** 2025-11-04  
**Status:** Ready for Implementation  
**Estimated Duration:** 2-4 weeks (depending on team size)


