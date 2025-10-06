# CodeDetailPanel Refactoring Guide

## Overview

CodeDetailPanel.tsx was 1,707 lines with 30+ state variables. We've extracted it into focused hooks and components.

## Extracted Hooks

### 1. `useCheckData`

**Location**: `components/checks/hooks/useCheckData.ts`

**Purpose**: Manages check loading, sections loading, and child checks for element checks

**Replaces**:

- `check`, `setCheck`
- `sections`, `setSections`
- `activeSectionIndex`
- `loading`, `error`
- `childChecks`, `setChildChecks`
- `activeChildCheckId`, `setActiveChildCheckId`

**Returns**:

```ts
{
  check,
  sections,
  section, // computed: sections[activeSectionIndex]
  activeSectionIndex,
  loading,
  error,
  childChecks,
  activeChildCheckId,
  setActiveChildCheckId,
  setChildChecks,
  refreshChildChecks, // function to reload child checks
}
```

### 2. `useManualOverride`

**Location**: `components/checks/hooks/useManualOverride.ts`

**Purpose**: Manages manual compliance judgment state and saving

**Replaces**:

- `manualOverride`, `setManualOverride`
- `manualOverrideNote`, `setManualOverrideNote`
- `showOverrideNote`, `setShowOverrideNote`
- `savingOverride`
- `overrideError`, `setOverrideError`
- `handleSaveOverride`
- `handleClearOverride`

**Parameters**: `(effectiveCheckId, onCheckUpdate, onAssessmentStop)`

### 3. `useSectionActions`

**Location**: `components/checks/hooks/useSectionActions.ts`

**Purpose**: Handles section actions (never relevant, floorplan relevant, exclude from project)

**Replaces**:

- `showNeverRelevantDialog`, `setShowNeverRelevantDialog`
- `markingNeverRelevant`
- `handleMarkNeverRelevant`
- `showFloorplanRelevantDialog`, `setShowFloorplanRelevantDialog`
- `markingFloorplanRelevant`
- `handleMarkFloorplanRelevant`
- `showExcludeDialog`, `setShowExcludeDialog`
- `excludingSection`
- `excludeReason`, `setExcludeReason`
- `handleExcludeFromProject`

**Parameters**: `(sectionKey, check, checkId, activeCheck, onClose, onCheckUpdate, onRefreshChildChecks, setOverrideError)`

### 4. `useAssessment`

**Location**: `components/checks/hooks/useAssessment.ts`

**Purpose**: Manages AI assessment, polling, analysis runs, and prompt editing

**Replaces**:

- `selectedModel`, `setSelectedModel`
- `extraContext`, `setExtraContext`, `showExtraContext`
- `assessing`, `assessmentError`, `assessmentProgress`, `assessmentMessage`
- `showPrompt`, `defaultPrompt`, `customPrompt`, `isPromptEditing`, `loadingPrompt`
- `analysisRuns`, `loadingRuns`, `expandedRuns`
- `handleViewPrompt`, `handleEditPrompt`, `handleResetPrompt`
- `handleAssess`
- `toggleRunExpanded`

**Parameters**: `(checkId, effectiveCheckId, onCheckUpdate)`

**Returns**: Includes `stopAssessment()` function for manual override integration

## Extracted Components

### 1. `ManualJudgmentPanel`

**Location**: `components/checks/panels/ManualJudgmentPanel.tsx`

**Purpose**: The 5-button compliance judgment UI with override status, notes, and actions

**Props**: All manual override state + section actions dialog triggers

**Renders**: Lines 865-1026 of original CodeDetailPanel

### 2. `SectionContentDisplay`

**Location**: `components/checks/panels/SectionContentDisplay.tsx`

**Purpose**: Displays code section content (intro, header, text, requirements, tables, references)

**Props**: `section`, `loading`, `error`, `isElementCheck`, `sections`, `check`

**Renders**: Lines 1028-1195 of original CodeDetailPanel

## Refactoring Steps

### Step 1: Import the hooks and components

```tsx
import { useCheckData } from './hooks/useCheckData';
import { useManualOverride } from './hooks/useManualOverride';
import { useSectionActions } from './hooks/useSectionActions';
import { useAssessment } from './hooks/useAssessment';
import { ManualJudgmentPanel } from './panels/ManualJudgmentPanel';
import { SectionContentDisplay } from './panels/SectionContentDisplay';
```

### Step 2: Replace state with hook calls

```tsx
export function CodeDetailPanel({
  checkId,
  sectionKey,
  onClose,
  onCheckUpdate,
  activeCheck,
  screenshotsRefreshKey,
  onScreenshotAssigned,
}: CodeDetailPanelProps) {
  // Check data
  const {
    check,
    sections,
    section,
    loading,
    error,
    childChecks,
    activeChildCheckId,
    setActiveChildCheckId,
    refreshChildChecks,
  } = useCheckData(checkId, sectionKey);

  // Computed: effective check ID
  const effectiveCheckId = activeChildCheckId || checkId;

  // Assessment
  const assessment = useAssessment(checkId, effectiveCheckId, onCheckUpdate);

  // Manual override
  const manualOverride = useManualOverride(
    effectiveCheckId,
    onCheckUpdate,
    assessment.stopAssessment
  );

  // Section actions
  const sectionActions = useSectionActions(
    sectionKey,
    check,
    checkId,
    activeCheck,
    onClose,
    onCheckUpdate,
    refreshChildChecks,
    manualOverride.setOverrideError
  );

  // Remaining UI state
  const [showSectionTabs, setShowSectionTabs] = useState(false);
  const [showScreenshots, setShowScreenshots] = useState(true);
  const [sectionContentHeight, setSectionContentHeight] = useState(40);
  const [showTriageModal, setShowTriageModal] = useState(false);
  const [triageSections, setTriageSections] = useState<SectionResult[]>([]);

  // ... rest of component
}
```

### Step 3: Replace component sections

Replace the Manual Judgment Panel section (lines 865-1026):

```tsx
<ManualJudgmentPanel
  effectiveCheckId={effectiveCheckId}
  sectionKey={sectionKey}
  section={section}
  {...manualOverride}
  {...sectionActions}
/>
```

Replace the Section Content Display (lines 1028-1195):

```tsx
<div className="overflow-y-auto p-4" style={{ height: `${sectionContentHeight}%` }}>
  <SectionContentDisplay
    section={section}
    loading={loading}
    error={error}
    isElementCheck={isElementCheck}
    sections={sections}
    check={check}
  />
</div>
```

### Step 4: Update hook dependencies

Auto-expand section tabs when child checks load:

```tsx
useEffect(() => {
  if (childChecks.length > 1) {
    setShowSectionTabs(true);
  }
}, [childChecks.length]);
```

## Benefits

- **Reduced from 1,707 lines to ~800 lines** (estimated)
- **Separation of concerns**: Each hook handles one domain
- **Reusability**: Hooks can be used in other components
- **Testability**: Each hook can be tested independently
- **Maintainability**: Clear boundaries make changes easier

## Testing Strategy

1. **Test each hook independently** with mock data
2. **Test extracted components** with storybook or unit tests
3. **Integration test** the refactored CodeDetailPanel
4. **Manual testing** of all workflows:
   - Section loading
   - Element checks with child sections
   - Manual override saving
   - Never relevant / Exclude actions
   - AI assessment + polling
   - Prompt editing

## Migration Notes

- All hooks maintain the same behavior as original code
- Dialog state is managed where it's used (sectionActions for most, TriageModal still in main component)
- The `refreshChildChecks` function in `useCheckData` replaces inline child check reloading logic
- Assessment hook includes `stopAssessment()` for integration with manual override
