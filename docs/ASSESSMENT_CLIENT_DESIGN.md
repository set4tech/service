# Assessment Client Design Specification

This document provides comprehensive styling and design specifications for the AssessmentClient component, the main workspace for compliance assessment.

---

## Table of Contents

1. [Layout Overview](#layout-overview)
2. [Color Palette](#color-palette)
3. [Typography](#typography)
4. [Component Structure](#component-structure)
5. [Navigation System](#navigation-system)
6. [Panel Specifications](#panel-specifications)
7. [Interactive Elements](#interactive-elements)
8. [State Management](#state-management)
9. [Responsive Behavior](#responsive-behavior)
10. [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Layout Overview

The AssessmentClient uses a **fixed, full-screen horizontal layout** with resizable panels.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              FIXED INSET-0                                   │
├─────────────────┬──┬─────────────────┬──┬────────────────────────────────────┤
│                 │  │                 │  │                                    │
│   LEFT SIDEBAR  │R │  DETAIL PANEL   │R │         PDF VIEWER                 │
│   (Checks/Nav)  │E │  (Collapsible)  │E │         (Main Content)             │
│                 │S │                 │S │                                    │
│   Width: 384px  │I │  Width: 400px   │I │         flex-1                     │
│   Min: 280px    │Z │  Min: 300px     │Z │                                    │
│   Max: 600px    │E │  Max: 700px     │E │                                    │
│                 │  │                 │  │                                    │
└─────────────────┴──┴─────────────────┴──┴────────────────────────────────────┘
```

### Root Container

```css
.root-container {
  position: fixed;
  inset: 0;
  display: flex;
  overflow: hidden;
}
```

---

## Color Palette

### Sidebar Theme (Greyish-Green / Sage)

| Element             | Hex Code  | Description                    |
| ------------------- | --------- | ------------------------------ |
| Sidebar Background  | `#e8eeea` | Light sage green               |
| Header Background   | `#dce5df` | Slightly darker sage           |
| Border Color        | `#d0d9d3` | Matching sage border           |
| Main Tab Background | `#c8d4cc` | Darker sage for tabs container |
| Sub-tab Background  | `#d5dfd8` | Medium sage for sub-tabs       |
| Sub-tab Border      | `#c0ccc4` | Subtle border                  |

### Interactive States

| State            | Background  | Text                 | Border |
| ---------------- | ----------- | -------------------- | ------ |
| Tab Active       | `#ffffff`   | `#111827` (gray-900) | -      |
| Tab Inactive     | transparent | `#4b5563` (gray-600) | -      |
| Tab Hover        | transparent | `#111827` (gray-900) | -      |
| Sub-tab Active   | `#ffffff`   | `#111827` (gray-900) | -      |
| Sub-tab Inactive | transparent | `#6b7280` (gray-500) | -      |
| Sub-tab Hover    | transparent | `#374151` (gray-700) | -      |

### Agent Button States

| State      | Text                   | Background            | Border                 |
| ---------- | ---------------------- | --------------------- | ---------------------- |
| Idle       | `#9333ea` (purple-600) | `#faf5ff` (purple-50) | `#e9d5ff` (purple-200) |
| Idle Hover | `#a855f7` (purple-500) | `#faf5ff`             | `#c084fc` (purple-400) |
| Running    | `#d97706` (amber-600)  | `#fffbeb` (amber-50)  | `#fde68a` (amber-200)  |

### Progress Bar

| Element | Color                |
| ------- | -------------------- |
| Track   | `#e5e7eb` (gray-200) |
| Fill    | `#2563eb` (blue-600) |

### Resize Handles

| State   | Color                |
| ------- | -------------------- |
| Default | `#e5e7eb` (gray-200) |
| Hover   | `#3b82f6` (blue-500) |

---

## Typography

### Font Stack

The application uses system fonts via Tailwind's default stack.

### Text Sizes

| Element               | Size               | Weight                | Color           |
| --------------------- | ------------------ | --------------------- | --------------- |
| Project Name (Header) | `text-base` (16px) | `font-semibold` (600) | gray-900        |
| Tab Labels            | `text-xs` (12px)   | `font-medium` (500)   | varies by state |
| Progress Label        | `text-sm` (14px)   | normal                | gray-600        |
| Progress Count        | `text-xs` (12px)   | normal                | gray-500        |
| Loading Text          | `text-sm` (14px)   | normal                | gray-500        |

---

## Component Structure

### Hierarchy

```
AssessmentClient (root)
├── Loading Modal (conditional)
│
├── Left Sidebar
│   ├── Header
│   │   ├── Back Link + Project Name
│   │   ├── Action Buttons (Agent, Report)
│   │   ├── Main Tab Navigation
│   │   ├── Sub-tab Navigation (conditional)
│   │   ├── CSV Import Button (conditional)
│   │   └── Progress Bar (conditional)
│   │
│   └── Content Area
│       ├── ViolationsSummary (violations tab)
│       ├── ChatPanel (chat tab)
│       ├── ProjectPanel (project tab)
│       ├── AssessmentScreenshotGallery (gallery sub-tab)
│       └── CheckList (elements/sections sub-tab)
│
├── Resize Handle (sidebar)
│
├── Detail Panel (collapsible)
│   ├── ViolationDetailPanel (in violations mode)
│   └── CodeDetailPanel (in checks mode)
│
├── Resize Handle (detail panel, conditional)
│
├── PDF Viewer Area
│   ├── PDFViewer component
│   └── Empty State (if no PDF)
│
└── Agent Analysis Modal
```

---

## Navigation System

### Two-Level Tab Structure

#### Main Tabs

Located in the header, always visible.

| Tab        | Value          | Description                    |
| ---------- | -------------- | ------------------------------ |
| Checks     | `'checks'`     | Shows check list with sub-tabs |
| Violations | `'violations'` | Shows violations summary       |
| Chat       | `'chat'`       | Shows AI chat panel            |
| Project    | `'project'`    | Shows project variables editor |

#### Sub-Tabs (Checks mode only)

Only visible when `mainTab === 'checks'`.

| Sub-tab  | Value        | Description                               |
| -------- | ------------ | ----------------------------------------- |
| Elements | `'elements'` | Element-based checks (doors, ramps, etc.) |
| Sections | `'sections'` | Section-based checks (code sections)      |
| Gallery  | `'gallery'`  | Screenshot gallery view                   |

### Tab Button Styling

```tsx
// Main Tab Button
<button
  className={clsx(
    'flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors',
    isActive
      ? 'bg-white shadow-sm text-gray-900'
      : 'text-gray-600 hover:text-gray-900'
  )}
>

// Sub-Tab Button
<button
  className={clsx(
    'flex-1 px-2 py-1 text-xs font-medium rounded transition-colors',
    isActive
      ? 'bg-white shadow-sm text-gray-900'
      : 'text-gray-500 hover:text-gray-700'
  )}
>
```

### State Persistence

Tab states are persisted to localStorage:

- `mainTab-{assessmentId}` - Main tab selection
- `checksSubTab-{assessmentId}` - Sub-tab selection

---

## Panel Specifications

### Left Sidebar

```tsx
<div
  className="flex-shrink-0 bg-[#e8eeea] border-r border-[#d0d9d3] flex flex-col h-screen overflow-hidden relative z-10"
  style={{ width: `${checksSidebarWidth}px` }}
>
```

| Property      | Value               |
| ------------- | ------------------- |
| Default Width | 384px               |
| Min Width     | 280px               |
| Max Width     | 600px               |
| Background    | `#e8eeea`           |
| Border Right  | 1px solid `#d0d9d3` |
| Z-Index       | 10                  |

#### Header Section

```tsx
<div className="px-4 py-3 border-b border-[#d0d9d3] bg-[#dce5df]">
```

| Property      | Value                          |
| ------------- | ------------------------------ |
| Padding       | 16px horizontal, 12px vertical |
| Background    | `#dce5df`                      |
| Border Bottom | 1px solid `#d0d9d3`            |

#### Content Area

```tsx
<div className="flex-1 min-h-0 overflow-y-auto">
```

| Property   | Value                     |
| ---------- | ------------------------- |
| Flex       | 1 (fills remaining space) |
| Min Height | 0 (enables scroll)        |
| Overflow Y | auto                      |

### Detail Panel

```tsx
<div
  className="flex-shrink-0 h-screen overflow-hidden transition-all duration-300 ease-in-out"
  style={{
    width: showDetailPanel ? `${detailPanelWidth}px` : '0px',
    opacity: showDetailPanel ? 1 : 0,
  }}
>
```

| Property        | Value             |
| --------------- | ----------------- |
| Default Width   | 400px             |
| Min Width       | 300px             |
| Max Width       | 700px             |
| Collapsed Width | 0px               |
| Transition      | 300ms ease-in-out |

### PDF Viewer Area

```tsx
<div className="flex-1 bg-gray-50 overflow-hidden h-screen">
```

| Property   | Value                     |
| ---------- | ------------------------- |
| Flex       | 1 (fills remaining space) |
| Background | `#f9fafb` (gray-50)       |
| Height     | 100vh                     |
| Overflow   | hidden                    |

---

## Interactive Elements

### Resize Handles

```tsx
<div
  onMouseDown={handleResizeStart}
  className="w-1 bg-gray-200 hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors relative z-20"
  style={{ touchAction: 'none' }}
/>
```

| Property         | Value      |
| ---------------- | ---------- |
| Width            | 4px (w-1)  |
| Background       | gray-200   |
| Hover Background | blue-500   |
| Cursor           | col-resize |
| Z-Index          | 20         |

### Agent Button

```tsx
<button
  className={clsx(
    'inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-lg border transition-colors',
    isRunning
      ? 'text-amber-600 bg-amber-50 border-amber-200 hover:border-amber-400'
      : 'text-purple-600 hover:text-purple-500 bg-purple-50 border-purple-200 hover:border-purple-400'
  )}
>
```

### Report Link Button

```tsx
<Link
  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-accent-600 hover:text-accent-500 bg-white border border-line rounded-lg hover:border-accent-400 transition-colors"
>
```

### Back Arrow Link

```tsx
<Link
  href="/"
  className="text-gray-400 hover:text-gray-600 transition-colors"
>
  <svg width="20" height="20" ...>
    <path d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
</Link>
```

### Progress Bar

```tsx
<div className="w-full bg-gray-200 rounded-full h-2">
  <div
    className="bg-blue-600 h-2 rounded-full transition-all"
    style={{ width: `${progress.pct}%` }}
  />
</div>
```

| Property         | Value         |
| ---------------- | ------------- |
| Track Height     | 8px (h-2)     |
| Track Background | gray-200      |
| Fill Background  | blue-600      |
| Border Radius    | full (9999px) |

---

## State Management

### Navigation State

```typescript
// Main tab: 'checks' | 'violations' | 'chat' | 'project'
const [mainTab, setMainTab] = useState<'checks' | 'violations' | 'chat' | 'project'>('checks');

// Sub-tab for checks: 'elements' | 'sections' | 'gallery'
const [checksSubTab, setChecksSubTab] = useState<'elements' | 'sections' | 'gallery'>('sections');

// Derived legacy mode for backward compatibility
const checkMode =
  mainTab === 'checks'
    ? checksSubTab === 'elements'
      ? 'element'
      : checksSubTab === 'sections'
        ? 'section'
        : 'gallery'
    : mainTab === 'violations'
      ? 'summary'
      : mainTab;
```

### Detail Panel State (Reducer Pattern)

```typescript
type DetailPanelState =
  | { mode: 'closed' }
  | { mode: 'check-detail'; checkId: string; filterToSectionKey: string | null }
  | { mode: 'violation-detail'; violation: ViolationMarker };

type DetailPanelAction =
  | { type: 'CLOSE_PANEL' }
  | { type: 'SELECT_CHECK'; checkId: string; filterToSectionKey?: string | null }
  | { type: 'SELECT_VIOLATION'; violation: ViolationMarker };
```

### Panel Width State

```typescript
const [checksSidebarWidth, setChecksSidebarWidth] = useState(384);
const [detailPanelWidth, setDetailPanelWidth] = useState(400);
```

### Resize Logic

```typescript
// Sidebar: min 280px, max 600px
const newWidth = Math.max(280, Math.min(600, startWidth + deltaX));

// Detail Panel: min 300px, max 700px
const newWidth = Math.max(300, Math.min(700, startWidth + deltaX));
```

---

## Responsive Behavior

The layout is currently **desktop-only** with fixed viewport handling:

```tsx
<div className="fixed inset-0 flex overflow-hidden">
```

### Panel Visibility Rules

| Main Tab   | Sub-Tab  | Detail Panel  | Shows                       |
| ---------- | -------- | ------------- | --------------------------- |
| checks     | elements | can open      | CheckList (element mode)    |
| checks     | sections | can open      | CheckList (section mode)    |
| checks     | gallery  | always closed | AssessmentScreenshotGallery |
| violations | -        | can open      | ViolationsSummary           |
| chat       | -        | always closed | ChatPanel                   |
| project    | -        | always closed | ProjectPanel                |

### Progress Bar Visibility

Only shown when:

- `mainTab === 'checks'` AND
- `checksSubTab !== 'gallery'`

### CSV Import Button Visibility

Only shown when:

- `mainTab === 'checks'` AND
- `checksSubTab === 'elements'`

---

## Keyboard Shortcuts

| Key        | Action                     | Condition                         |
| ---------- | -------------------------- | --------------------------------- |
| Arrow Up   | Navigate to previous check | In checks mode, check selected    |
| Arrow Down | Navigate to next check     | In checks mode, check selected    |
| Enter      | Mark compliant & advance   | Check selected, PDF search closed |

---

## Loading States

### Seeding Modal

```tsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
  <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
    <div className="flex items-center gap-3 mb-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      <h3 className="text-lg font-semibold">Loading Code Sections</h3>
    </div>
    <p className="text-sm text-gray-500 mt-4">Creating checks for selected chapters...</p>
  </div>
</div>
```

| Property      | Value                    |
| ------------- | ------------------------ |
| Overlay       | black 50% opacity        |
| Modal Width   | max-w-md (448px)         |
| Padding       | 24px (p-6)               |
| Border Radius | lg (8px)                 |
| Z-Index       | 50                       |
| Spinner       | 32x32px, blue-600 border |

### Empty PDF State

```tsx
<div className="h-full flex items-center justify-center text-gray-500">
  <div className="text-center">
    <svg className="mx-auto h-12 w-12 text-gray-400">...</svg>
    <h3 className="mt-2 text-sm font-medium text-gray-900">No document</h3>
    <p className="mt-1 text-sm text-gray-500">Upload a PDF to begin the assessment.</p>
  </div>
</div>
```

---

## Icons

### Back Arrow (Header)

```tsx
<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2}
    d="M10 19l-7-7m0 0l7-7m-7 7h18"
  />
</svg>
```

### Robot (Agent Button)

```tsx
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
  <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
  <circle cx="8" cy="14" r="2" />
  <circle cx="16" cy="14" r="2" />
</svg>
```

### External Link (Report Button)

```tsx
<svg width="12" height="12" viewBox="0 0 24 24">
  <path d="M14 3h7v7M21 3l-9 9" stroke="currentColor" strokeWidth="1.5" fill="none" />
  <path d="M21 14v7H3V3h7" stroke="currentColor" strokeWidth="1.5" fill="none" />
</svg>
```

### Spinner (Loading)

```tsx
<svg
  className="animate-spin"
  width="14"
  height="14"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  strokeWidth="2"
>
  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" />
  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
</svg>
```

### Document (Empty State)

```tsx
<svg
  className="mx-auto h-12 w-12 text-gray-400"
  fill="none"
  viewBox="0 0 24 24"
  stroke="currentColor"
>
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2}
    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
  />
</svg>
```

---

## Related Components

The following child components should have their own design specifications:

- `CheckList` - List of compliance checks
- `CodeDetailPanel` - Check detail view with AI analysis
- `ViolationsSummary` - Violations list and summary
- `ViolationDetailPanel` - Violation detail view
- `ChatPanel` - AI chat interface
- `ProjectPanel` - Project variables editor
- `AssessmentScreenshotGallery` - Screenshot gallery view
- `PDFViewer` - PDF viewing and screenshot capture
- `AgentAnalysisModal` - Agent analysis configuration and status
- `ImportCSVDoorsModal` - CSV import for door elements

---

## File Location

```
app/assessments/[id]/ui/AssessmentClient.tsx
```

## Dependencies

- `clsx` - Conditional class names
- `next/dynamic` - Dynamic imports for PDFViewer
- `next/link` - Client-side navigation
- React hooks: useState, useEffect, useMemo, useRef, useReducer, useCallback
