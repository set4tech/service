# Design System

This document describes the visual design system for the Set4 compliance assessment platform. It's intended for frontend developers who need to build new features or modify existing UI.

---

## Design Philosophy

This is a **professional tool for compliance reviewers**—people who spend hours reviewing building plans against accessibility codes. The design prioritizes:

1. **Clarity over decoration** — Dense information display without visual noise
2. **Hierarchy through typography** — Weight and size, not color, establish importance
3. **Muted palette** — Lets the PDF content and status colors stand out
4. **Consistent density** — Compact but readable; no wasted space
5. **Sage identity** — The sage-green palette is our signature; build outward from it

The overall feel is closer to a code editor or CAD tool than a consumer SaaS product. We use borders for containment rather than shadows, and status colors feel like stamps on a document rather than UI alerts.

---

## Color System

### Sage Palette (Primary Identity)

The sage-green palette is the foundation of our visual identity. Use it for selected states, active tabs, focus rings, and primary actions.

| Token      | Hex       | Usage                            |
| ---------- | --------- | -------------------------------- |
| `sage-50`  | `#f4f7f5` | Subtle backgrounds, hover states |
| `sage-100` | `#e8eeea` | Sidebar background, muted cards  |
| `sage-200` | `#dce5df` | Section headers, borders         |
| `sage-300` | `#c8d4cc` | Tab backgrounds, dividers        |
| `sage-400` | `#a8bab0` | Inactive elements                |
| `sage-500` | `#889a90` | Muted text, icons                |
| `sage-600` | `#6b7d73` | Focus rings, secondary text      |
| `sage-700` | `#566560` | Primary buttons, links           |
| `sage-800` | `#48544d` | Button hover, emphasis           |
| `sage-900` | `#3d4742` | Strong emphasis                  |

### Text Colors (Ink)

| Token     | Hex       | Usage                           |
| --------- | --------- | ------------------------------- |
| `ink-900` | `#0B0F19` | Primary text, headings          |
| `ink-700` | `#243040` | Secondary text, labels          |
| `ink-500` | `#4B5563` | Tertiary/muted text, timestamps |

### Surface Colors

| Token     | Hex       | Usage                            |
| --------- | --------- | -------------------------------- |
| `paper`   | `#f5f2e8` | Page background (warm off-white) |
| `line`    | `#E7E5DE` | Borders, dividers                |
| `white`   | `#FFFFFF` | Cards, inputs, elevated surfaces |
| `gray-50` | `#F9FAFB` | Muted card backgrounds           |

### Accent Colors

| Token        | Hex       | Usage                                     |
| ------------ | --------- | ----------------------------------------- |
| `accent-600` | `#0F766E` | Teal accent (links, blueprint references) |
| `accent-500` | `#11827A` | Teal hover                                |
| `accent-400` | `#14A39A` | Teal light                                |

### Status Colors (Document Stamps)

These communicate compliance states. They're intentionally muted—like stamps on a document rather than UI alerts. Passing a code check isn't a celebration; it's a neutral confirmation.

| Status         | Background | Text      | Class                   |
| -------------- | ---------- | --------- | ----------------------- |
| Compliant      | `#e8f0e8`  | `#2d5a2d` | `.badge-compliant`      |
| Non-compliant  | `#f0e8e8`  | `#6b3333` | `.badge-non-compliant`  |
| Pending        | `#e8ecf0`  | `#3d4f5f` | `.badge-pending`        |
| Unclear        | `#f0ede8`  | `#5c4d3d` | `.badge-unclear`        |
| Not applicable | `#ebebeb`  | `#5c5c5c` | `.badge-not-applicable` |

### Danger

| Token        | Hex       | Usage               |
| ------------ | --------- | ------------------- |
| `danger-600` | `#B91C1C` | Destructive actions |
| `danger-500` | `#DC2626` | Destructive hover   |

### Dark Theme (Violations Panel)

The violations/comments panel uses a dark green-grey palette:

| Token         | Hex       | Usage                              |
| ------------- | --------- | ---------------------------------- |
| `dark-bg`     | `#3d4a4a` | Panel background                   |
| `dark-card`   | `#4d5a5a` | Card backgrounds, inactive buttons |
| `dark-hover`  | `#5d6a6a` | Hover backgrounds                  |
| `dark-border` | `#2d3838` | Borders, muted elements            |

---

## Typography

### Font Stack

```css
/* Body text */
font-family:
  IBM Plex Sans,
  ui-sans-serif,
  system-ui,
  sans-serif;

/* Code, technical content, measurements, data display */
font-family:
  JetBrains Mono,
  ui-monospace,
  SFMono-Regular,
  monospace;
```

Use monospace (`font-mono`) for:

- Measurements and dimensions
- Code section references (e.g., "11B-404.2.6")
- Status values and technical data
- AI reasoning blocks
- Table cells with numeric data

### Type Scale (Data-Dense)

| Class       | Size | Line Height | Usage                                |
| ----------- | ---- | ----------- | ------------------------------------ |
| `text-2xs`  | 11px | 14px        | Form labels, table headers, metadata |
| `text-xs`   | 12px | 16px        | Badges, timestamps, secondary data   |
| `text-sm`   | 13px | 18px        | Body text, table cells, form fields  |
| `text-base` | 14px | 20px        | Primary content (default)            |
| `text-lg`   | 16px | 24px        | Section headings                     |
| `text-xl`   | 18px | 28px        | Page section titles                  |
| `text-2xl`  | 24px | 32px        | Page titles                          |

**Note**: Our base size is 14px, not 16px. This allows for denser data display appropriate for a professional tool.

### Font Weights

| Weight | Class           | Usage                     |
| ------ | --------------- | ------------------------- |
| 400    | `font-normal`   | Body text                 |
| 500    | `font-medium`   | Labels, buttons, emphasis |
| 600    | `font-semibold` | Headings, badges          |

### Text Color Hierarchy

```jsx
// Primary text (default)
<p className="text-ink-900">Main content</p>

// Secondary text
<p className="text-ink-700">Supporting information</p>

// Muted/tertiary text
<p className="text-ink-500">Timestamps, metadata</p>
```

---

## Spacing (Compact Density)

### Base Unit

All spacing uses Tailwind's 4px base unit. For data-dense views, prefer tighter spacing:

| Class               | Value | Common Use                  |
| ------------------- | ----- | --------------------------- |
| `p-1.5` / `gap-1.5` | 6px   | Tight list items, icon gaps |
| `p-2` / `gap-2`     | 8px   | Compact cards, table cells  |
| `p-3` / `gap-3`     | 12px  | Card padding, section gaps  |
| `p-4` / `gap-4`     | 16px  | Generous padding (desktop)  |
| `p-6`               | 24px  | Major section breaks        |

### Stack Utilities

```jsx
// 6px gaps between children (tighter)
<div className="stack-sm">
  <p>Item 1</p>
  <p>Item 2</p>
</div>

// 12px gaps
<div className="stack-md">...</div>

// 24px gaps
<div className="stack-lg">...</div>
```

---

## Borders and Elevation

### Borders over Shadows

Prefer borders for containment. Reserve shadows only for elements that actually float (dropdowns, modals).

```jsx
// Standard card (bordered, no shadow)
<div className="card">Content</div>

// Only for floating elements
<div className="card-elevated">Floating content</div>
```

### Hairline Borders

Use 0.5px borders for internal dividers:

```jsx
// Single hairline border
<div className="border-hairline border-line" />

// Hairline dividers between children
<div className="divide-y divide-hairline divide-line">
  <div>Item 1</div>
  <div>Item 2</div>
</div>
```

### Border Tokens

| Usage                 | Class                         |
| --------------------- | ----------------------------- |
| Card/outer boundaries | `border border-line`          |
| Internal dividers     | `border-hairline border-line` |
| Focus ring            | `ring-2 ring-sage-600`        |

### Shadow Tokens (Floating Only)

| Token           | Usage                             |
| --------------- | --------------------------------- |
| `shadow-card`   | Subtle lift for interactive cards |
| `shadow-cardMd` | Dropdowns, popovers               |
| `shadow-sheet`  | Modals, major overlays            |

---

## Border Radius

| Token           | Value | Usage                        |
| --------------- | ----- | ---------------------------- |
| `rounded-md`    | 6px   | Buttons, inputs, small cards |
| `rounded-lg`    | 8px   | Cards, panels                |
| `rounded-sheet` | 12px  | Large modals                 |
| `rounded-full`  | 50%   | Badges, avatars              |

---

## Components

### Buttons (Compact)

```jsx
// Primary action (sage green)
<button className="btn-primary">Save Changes</button>

// Secondary action (white with border)
<button className="btn-secondary">Cancel</button>

// Ghost button (no border)
<button className="btn-ghost">View Details</button>

// Destructive action (red text)
<button className="btn-danger">Delete</button>

// Icon-only button (36x36 touch target)
<button className="btn-icon">
  <IconComponent />
</button>
```

**Button anatomy:**

- `px-3 py-1.5` padding (compact)
- `text-sm font-medium`
- `rounded-md`
- `gap-1.5` between icon and text
- Focus ring: `ring-2 ring-sage-600 ring-offset-2`

### Inputs (Compact)

```jsx
<input className="input" placeholder="Enter value" />
<select className="select">...</select>
<textarea className="textarea">...</textarea>
```

**Input anatomy:**

- `px-2.5 py-1.5` padding
- `text-sm`
- `border border-line`
- `rounded-md`
- Focus: `border-sage-600 ring-2 ring-sage-600`

### Labels

```jsx
<label className="label">Section Number</label>
```

Labels use `text-2xs` (11px), uppercase, with tracking.

### Cards

```jsx
// Standard card (bordered, no shadow)
<div className="card">
  <h3>Title</h3>
  <p>Content</p>
</div>

// Muted card (gray background)
<div className="card-muted">
  <p>Secondary content</p>
</div>

// Elevated card (for floating elements only)
<div className="card-elevated">
  <p>Floating content</p>
</div>
```

### Badges (Document Stamps)

```jsx
<span className="badge-compliant">Compliant</span>
<span className="badge-non-compliant">Non-compliant</span>
<span className="badge-pending">Pending</span>
<span className="badge-unclear">Unclear</span>
<span className="badge-not-applicable">N/A</span>

// Active state (sage)
<span className="badge-active">In Progress</span>
```

### Progress Bar

```jsx
<div className="progress" style={{ '--value': '65%' } as React.CSSProperties}>
  <div className="bar" />
</div>
```

### Tables (Dense)

```jsx
<table className="table-base">
  <thead>
    <tr>
      <th>Column</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Value</td>
    </tr>
  </tbody>
</table>
```

**Table anatomy:**

- Header: `text-2xs` (11px), uppercase, `py-1.5 px-2`
- Cells: `text-sm` (13px), `py-1.5 px-2`
- Row hover: `bg-sage-50`
- Row dividers: hairline borders

---

## Motion

### Default Transitions

All elements have automatic transitions on color, background-color, and border-color:

```css
transition: 0.12s cubic-bezier(0.2, 0, 0, 1);
```

### Reduced Motion

Users who prefer reduced motion get `transition: none` and `animation: none` automatically.

---

## Layout Patterns

### Three-Panel Layout (Assessment View)

```
┌─────────────┬──┬─────────────┬──┬────────────────────┐
│   SIDEBAR   │R │   DETAIL    │R │      PDF VIEWER    │
│   384px     │E │   400px     │E │      flex-1        │
│   (280-600) │S │   (300-700) │S │                    │
└─────────────┴──┴─────────────┴──┴────────────────────┘
```

### Resize Handles

```jsx
<div className="w-1 bg-sage-200 hover:bg-sage-500 cursor-col-resize" />
```

### Modal Overlay

```jsx
// Overlay
<div className="fixed inset-0 z-50 bg-black/50" />

// Centered content
<div className="fixed inset-0 z-50 flex items-center justify-center">
  <div className="bg-white rounded-lg shadow-sheet max-w-lg w-full p-4">
    ...
  </div>
</div>
```

---

## Icons

Use Lucide React icons. Standard sizing:

```jsx
import { Check, X, ChevronRight } from 'lucide-react';

// In buttons (14px)
<button className="btn-primary">
  <Check className="w-3.5 h-3.5" />
  Save
</button>

// Standalone (16px)
<ChevronRight className="w-4 h-4 text-ink-500" />
```

---

## Accessibility

### Focus States

All interactive elements must have visible focus:

```jsx
className =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-600 focus-visible:ring-offset-2';
```

### Touch Targets

Minimum 36x36px for icon buttons (`.btn-icon`). Full buttons have adequate height from padding.

### Color Contrast

- Text on `paper` background: Use `ink-900` or `ink-700`
- Text on white cards: Use `ink-900` or `ink-700`
- Status badge text meets WCAG AA on its background

---

## File Reference

| File                 | Purpose                                |
| -------------------- | -------------------------------------- |
| `tailwind.config.js` | Custom colors, shadows, fonts, spacing |
| `app/globals.css`    | Component classes, motion defaults     |
| `app/layout.tsx`     | Font imports, body defaults            |
| `lib/utils.ts`       | `cn()` helper for class merging        |
| `components/ui/`     | Shared UI components                   |

---

## Quick Reference

### Common patterns

```jsx
// Card with heading
<div className="card stack-md">
  <h3 className="text-lg font-semibold">Title</h3>
  <p className="text-ink-700">Description</p>
</div>

// Form field
<div className="stack-sm">
  <label className="label">Label</label>
  <input className="input" />
</div>

// Status badge
<span className="badge-compliant">Compliant</span>

// Button with icon
<button className="btn-primary">
  <PlusIcon className="w-3.5 h-3.5" />
  Add Item
</button>

// Monospace data
<span className="font-mono text-sm">11B-404.2.6</span>
```

### Migration Notes

If updating existing components:

1. Replace `bg-brand-*` with `bg-sage-*`
2. Replace `ring-brand-*` with `ring-sage-*`
3. Replace `hover:bg-blue-50` with `hover:bg-sage-50`
4. Update status badges to use new document-style classes
5. Remove `shadow-card` from most cards, use `border border-line` instead
6. Reduce padding: `p-4` → `p-3`, `py-2` → `py-1.5`
