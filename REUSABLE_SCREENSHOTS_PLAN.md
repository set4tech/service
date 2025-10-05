# Reusable Screenshots Implementation Plan

## Overview
Refactor screenshots to use a pure many-to-many relationship via junction table, enabling screenshot reuse across multiple checks without data duplication.

## Current State
- Screenshots have `check_id` foreign key (one-to-many)
- Each screenshot belongs to exactly one check
- Copying checks duplicates screenshot records
- No way to reuse screenshots across checks

## Target State
- Junction table `screenshot_check_assignments` for many-to-many
- Screenshots can be assigned to multiple checks
- `is_original` flag tracks where screenshot was created
- Drag-drop and modal UI for assignment

---

## Phase 1: Database Migration (3 migrations)

### Migration 1: Create junction table
**File:** `supabase/migrations/YYYYMMDD_create_screenshot_assignments.sql`

```sql
-- Create junction table for many-to-many screenshot-check relationships
CREATE TABLE screenshot_check_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screenshot_id uuid NOT NULL REFERENCES screenshots(id) ON DELETE CASCADE,
  check_id uuid NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  is_original boolean DEFAULT false,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid,
  UNIQUE(screenshot_id, check_id)
);

-- Indexes for performance
CREATE INDEX idx_screenshot_assignments_check ON screenshot_check_assignments(check_id);
CREATE INDEX idx_screenshot_assignments_screenshot ON screenshot_check_assignments(screenshot_id);
CREATE INDEX idx_screenshot_assignments_original ON screenshot_check_assignments(is_original) WHERE is_original = true;
```

### Migration 2: Migrate existing data
**File:** `supabase/migrations/YYYYMMDD_migrate_screenshot_relationships.sql`

```sql
-- Migrate all existing screenshot-check relationships to junction table
INSERT INTO screenshot_check_assignments (screenshot_id, check_id, is_original, assigned_at)
SELECT
  id,
  check_id,
  true,
  created_at
FROM screenshots
WHERE check_id IS NOT NULL;

-- Verify migration
DO $$
DECLARE
  screenshot_count integer;
  assignment_count integer;
BEGIN
  SELECT COUNT(*) INTO screenshot_count FROM screenshots WHERE check_id IS NOT NULL;
  SELECT COUNT(*) INTO assignment_count FROM screenshot_check_assignments WHERE is_original = true;

  IF screenshot_count != assignment_count THEN
    RAISE EXCEPTION 'Migration mismatch: % screenshots but % assignments', screenshot_count, assignment_count;
  END IF;

  RAISE NOTICE 'Successfully migrated % screenshot-check relationships', screenshot_count;
END $$;
```

### Migration 3: Drop old column
**File:** `supabase/migrations/YYYYMMDD_drop_screenshot_check_id.sql`

```sql
-- Drop the old foreign key constraint
ALTER TABLE screenshots DROP CONSTRAINT IF EXISTS screenshots_check_id_fkey;

-- Drop the check_id column (now fully replaced by junction table)
ALTER TABLE screenshots DROP COLUMN IF EXISTS check_id;
```

---

## Phase 2: TypeScript Types

**File:** `types/database.ts`

```typescript
export interface Screenshot {
  id: string;
  // check_id REMOVED - now in junction table
  analysis_run_id?: string;
  page_number: number;
  crop_coordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom_level: number;
  };
  screenshot_url: string;
  thumbnail_url?: string;
  caption?: string;
  created_at?: string;
}

export interface ScreenshotCheckAssignment {
  id: string;
  screenshot_id: string;
  check_id: string;
  is_original: boolean;
  assigned_at: string;
  assigned_by?: string;
}

// Extended type for UI with assignment metadata
export interface ScreenshotWithAssignment extends Screenshot {
  assignment?: ScreenshotCheckAssignment;
  original_check_id?: string; // For displaying "From Check X"
}
```

---

## Phase 3: API Layer Updates

### 3.1 Update screenshot creation
**File:** `app/api/screenshots/route.ts`

**Current:**
```typescript
export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from('screenshots').insert(body).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ screenshot: data });
}
```

**Updated:**
```typescript
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { check_id, ...screenshotData } = body; // Extract check_id

  const supabase = supabaseAdmin();

  // 1. Create screenshot without check_id
  const { data: screenshot, error: screenshotError } = await supabase
    .from('screenshots')
    .insert(screenshotData)
    .select('*')
    .single();

  if (screenshotError) {
    return NextResponse.json({ error: screenshotError.message }, { status: 400 });
  }

  // 2. Create assignment as original
  const { error: assignmentError } = await supabase
    .from('screenshot_check_assignments')
    .insert({
      screenshot_id: screenshot.id,
      check_id: check_id,
      is_original: true,
    });

  if (assignmentError) {
    // Rollback screenshot if assignment fails
    await supabase.from('screenshots').delete().eq('id', screenshot.id);
    return NextResponse.json({ error: assignmentError.message }, { status: 400 });
  }

  return NextResponse.json({ screenshot });
}
```

### 3.2 Update screenshot queries
**File:** `app/api/screenshots/route.ts`

**Current:**
```typescript
export async function GET(req: NextRequest) {
  const checkId = new URL(req.url).searchParams.get('check_id');
  const supabase = supabaseAdmin();
  const query = supabase.from('screenshots').select('*');
  const { data, error } = checkId
    ? await query.eq('check_id', checkId).order('created_at', { ascending: false })
    : await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ screenshots: data });
}
```

**Updated:**
```typescript
export async function GET(req: NextRequest) {
  const checkId = new URL(req.url).searchParams.get('check_id');
  const supabase = supabaseAdmin();

  if (checkId) {
    // Fetch screenshots assigned to this check via junction table
    const { data, error } = await supabase
      .from('screenshots')
      .select(`
        *,
        screenshot_check_assignments!inner(
          check_id,
          is_original,
          assigned_at
        )
      `)
      .eq('screenshot_check_assignments.check_id', checkId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ screenshots: data });
  } else {
    // Fetch all screenshots
    const { data, error } = await supabase.from('screenshots').select('*');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ screenshots: data });
  }
}
```

**File:** `app/api/checks/[id]/screenshots/route.ts`

```typescript
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = supabaseAdmin();

    const { data: screenshots, error } = await supabase
      .from('screenshots')
      .select(`
        *,
        screenshot_check_assignments!inner(
          check_id,
          is_original,
          assigned_at
        )
      `)
      .eq('screenshot_check_assignments.check_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching screenshots:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(screenshots || []);
  } catch (error) {
    console.error('Failed to fetch screenshots:', error);
    return NextResponse.json({ error: 'Failed to fetch screenshots' }, { status: 500 });
  }
}
```

### 3.3 Update batch screenshot fetching
**File:** `app/api/assessments/[id]/checks/route.ts` (lines 75-92)

**Current:**
```typescript
supabase
  .from('screenshots')
  .select('*')
  .in('check_id', checkIds)
  .order('created_at', { ascending: true }),

// Create screenshots map
const screenshotsMap = new Map<string, any[]>();
(allScreenshots || []).forEach((screenshot: any) => {
  if (!screenshotsMap.has(screenshot.check_id)) {
    screenshotsMap.set(screenshot.check_id, []);
  }
  screenshotsMap.get(screenshot.check_id)!.push(screenshot);
});
```

**Updated:**
```typescript
supabase
  .from('screenshot_check_assignments')
  .select(`
    check_id,
    is_original,
    screenshots (*)
  `)
  .in('check_id', checkIds)
  .order('screenshots.created_at', { ascending: true }),

// Create screenshots map
const screenshotsMap = new Map<string, any[]>();
(allScreenshots || []).forEach((assignment: any) => {
  if (!screenshotsMap.has(assignment.check_id)) {
    screenshotsMap.set(assignment.check_id, []);
  }
  // Flatten the screenshot with assignment metadata
  screenshotsMap.get(assignment.check_id)!.push({
    ...assignment.screenshots,
    is_original: assignment.is_original,
  });
});
```

### 3.4 Update screenshot cloning
**File:** `app/api/checks/[id]/clone/route.ts` (lines 106-125)

**Current:** Creates duplicate screenshot records

**Updated:** Creates assignments to existing screenshots
```typescript
// Optionally copy screenshots
if (copyScreenshots && flattenedData) {
  const { data: assignments, error: assignmentsError } = await supabase
    .from('screenshot_check_assignments')
    .select('screenshot_id')
    .eq('check_id', id);

  if (!assignmentsError && assignments && assignments.length > 0) {
    const newAssignments = assignments.map(assignment => ({
      screenshot_id: assignment.screenshot_id,
      check_id: flattenedData.id,
      is_original: false, // NOT original, this is a reused screenshot
    }));

    await supabase.from('screenshot_check_assignments').insert(newAssignments);
  }
}
```

### 3.5 Update other queries

**File:** `app/api/checks/[id]/assess/route.ts`
```typescript
const { data: screenshots, error: screenshotsError } = await supabase
  .from('screenshots')
  .select(`
    screenshot_url,
    caption,
    screenshot_check_assignments!inner(check_id)
  `)
  .eq('screenshot_check_assignments.check_id', checkId)
  .order('created_at', { ascending: true });
```

**File:** `app/api/checks/[id]/prompt/route.ts`
```typescript
const { count: screenshotCount } = await supabase
  .from('screenshot_check_assignments')
  .select('*', { count: 'exact', head: true })
  .eq('check_id', checkId);
```

**File:** `app/assessments/[id]/page.tsx`
```typescript
const result = await supabase
  .from('screenshot_check_assignments')
  .select(`
    check_id,
    screenshots (*)
  `)
  .eq('checks.assessment_id', id)
  .order('screenshots.created_at');
```

**File:** `lib/reports/get-violations.ts`
```typescript
const { data: screenshots } = await supabase
  .from('screenshots')
  .select(`
    id,
    screenshot_url,
    thumbnail_url,
    page_number,
    crop_coordinates,
    screenshot_check_assignments!inner(check_id)
  `)
  .eq('screenshot_check_assignments.check_id', check.id)
  .order('created_at', { ascending: true });
```

### 3.6 New assignment endpoints

**File:** `app/api/screenshots/[id]/assign/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: screenshotId } = await params;
    const { checkIds } = await req.json();

    if (!Array.isArray(checkIds) || checkIds.length === 0) {
      return NextResponse.json({ error: 'checkIds must be a non-empty array' }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // Create assignments (is_original = false)
    const assignments = checkIds.map(checkId => ({
      screenshot_id: screenshotId,
      check_id: checkId,
      is_original: false,
    }));

    const { data, error } = await supabase
      .from('screenshot_check_assignments')
      .insert(assignments)
      .select();

    if (error) {
      console.error('Error creating assignments:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ assigned: data.length, assignments: data });
  } catch (error) {
    console.error('Failed to assign screenshot:', error);
    return NextResponse.json({ error: 'Failed to assign screenshot' }, { status: 500 });
  }
}
```

**File:** `app/api/screenshots/[id]/unassign/[checkId]/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; checkId: string }> }
) {
  try {
    const { id: screenshotId, checkId } = await params;
    const supabase = supabaseAdmin();

    // Check if this is the original assignment
    const { data: assignment } = await supabase
      .from('screenshot_check_assignments')
      .select('is_original')
      .eq('screenshot_id', screenshotId)
      .eq('check_id', checkId)
      .single();

    if (assignment?.is_original) {
      return NextResponse.json(
        { error: 'Cannot unassign screenshot from its original check' },
        { status: 400 }
      );
    }

    // Delete the assignment
    const { error } = await supabase
      .from('screenshot_check_assignments')
      .delete()
      .eq('screenshot_id', screenshotId)
      .eq('check_id', checkId);

    if (error) {
      console.error('Error unassigning screenshot:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to unassign screenshot:', error);
    return NextResponse.json({ error: 'Failed to unassign screenshot' }, { status: 500 });
  }
}
```

---

## Phase 4: UI Components

### 4.1 AssignScreenshotModal component

**File:** `components/screenshots/AssignScreenshotModal.tsx` (NEW)

```typescript
'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';

interface Check {
  id: string;
  code_section_number: string;
  check_name: string;
  instance_label?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  screenshotId: string;
  currentCheckId: string;
  assessmentId: string;
  onAssigned: () => void;
}

export function AssignScreenshotModal({
  open,
  onClose,
  screenshotId,
  currentCheckId,
  assessmentId,
  onAssigned,
}: Props) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [selectedCheckIds, setSelectedCheckIds] = useState<Set<string>>(new Set());
  const [existingAssignments, setExistingAssignments] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch all checks for this assessment
        const checksRes = await fetch(`/api/assessments/${assessmentId}/checks`);
        const checksData = await checksRes.json();
        setChecks(checksData);

        // Fetch existing assignments for this screenshot
        const assignmentsRes = await fetch(`/api/screenshots/${screenshotId}/assignments`);
        const assignmentsData = await assignmentsRes.json();
        const assignedCheckIds = new Set(assignmentsData.map((a: any) => a.check_id));
        setExistingAssignments(assignedCheckIds);
        setSelectedCheckIds(new Set(assignedCheckIds));
      } catch (error) {
        console.error('Failed to load checks:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [open, assessmentId, screenshotId]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Find new assignments (selected but not existing)
      const newAssignments = Array.from(selectedCheckIds).filter(
        id => !existingAssignments.has(id)
      );

      if (newAssignments.length > 0) {
        const res = await fetch(`/api/screenshots/${screenshotId}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkIds: newAssignments }),
        });

        if (!res.ok) throw new Error('Failed to assign screenshots');
      }

      onAssigned();
      onClose();
    } catch (error) {
      console.error('Failed to assign screenshot:', error);
      alert('Failed to assign screenshot');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredChecks = checks.filter(
    check =>
      check.code_section_number.toLowerCase().includes(search.toLowerCase()) ||
      check.check_name.toLowerCase().includes(search.toLowerCase()) ||
      check.instance_label?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal open={open} onClose={onClose} title="Assign Screenshot to Checks">
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Search checks..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 border rounded"
        />

        {loading ? (
          <div className="text-center py-8">Loading checks...</div>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-2">
            {filteredChecks.map(check => {
              const isOriginal = check.id === currentCheckId;
              const isExisting = existingAssignments.has(check.id);
              const isSelected = selectedCheckIds.has(check.id);

              return (
                <label
                  key={check.id}
                  className={`flex items-center gap-3 p-3 border rounded cursor-pointer hover:bg-gray-50 ${
                    isOriginal ? 'bg-blue-50 border-blue-300' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isOriginal}
                    onChange={e => {
                      const newSelected = new Set(selectedCheckIds);
                      if (e.target.checked) {
                        newSelected.add(check.id);
                      } else {
                        newSelected.delete(check.id);
                      }
                      setSelectedCheckIds(newSelected);
                    }}
                    className="w-4 h-4"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">
                      {check.code_section_number}
                      {check.instance_label && ` - ${check.instance_label}`}
                    </div>
                    <div className="text-xs text-gray-600">{check.check_name}</div>
                  </div>
                  {isOriginal && <span className="text-xs text-blue-600">Original</span>}
                  {isExisting && !isOriginal && (
                    <span className="text-xs text-gray-500">Assigned</span>
                  )}
                </label>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-4 border-t">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || selectedCheckIds.size === 0}
            className="btn-primary"
          >
            {submitting ? 'Assigning...' : 'Assign to Selected'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
```

**Also create:** `app/api/screenshots/[id]/assignments/route.ts`
```typescript
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from('screenshot_check_assignments')
    .select('check_id, is_original, assigned_at')
    .eq('screenshot_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
```

### 4.2 Update ScreenshotGallery

**File:** `components/screenshots/ScreenshotGallery.tsx`

Add state and UI for assignment:

```typescript
const [assigningScreenshot, setAssigningScreenshot] = useState<Screenshot | null>(null);

// In the render, add assign button and modal
<figure key={s.id} className="w-40">
  <button
    className="w-40 h-28 bg-gray-100 border rounded overflow-hidden flex items-center justify-center relative group"
    onClick={() => setPreview(s)}
    draggable="true"
    onDragStart={(e) => {
      e.dataTransfer.setData('screenshot-id', s.id);
      e.dataTransfer.effectAllowed = 'copy';
    }}
  >
    {urls?.thumbnail ? (
      <img src={urls.thumbnail} alt={s.caption || 'Screenshot'} className="w-full h-full object-cover" />
    ) : (
      <span className="text-xs text-gray-400">Loading...</span>
    )}

    {/* Badge for assigned screenshots */}
    {!s.is_original && (
      <div className="absolute top-1 right-1 bg-blue-600 text-white text-xs px-1 rounded">
        📎 Assigned
      </div>
    )}
  </button>

  <figcaption className="mt-1 text-xs text-gray-700">
    <div className="flex items-center justify-between gap-1">
      <span className="truncate flex-1">{s.caption || 'No caption'}</span>
      <button
        className="text-blue-600 hover:text-blue-900"
        onClick={() => setAssigningScreenshot(s)}
        title="Assign to other checks"
      >
        📋
      </button>
      <button
        className="text-red-600 hover:text-red-900"
        onClick={() => {
          if (confirm('Delete screenshot?')) handleDelete(s.id);
        }}
      >
        🗑
      </button>
    </div>
  </figcaption>
</figure>

{/* Assignment Modal */}
{assigningScreenshot && (
  <AssignScreenshotModal
    open={!!assigningScreenshot}
    onClose={() => setAssigningScreenshot(null)}
    screenshotId={assigningScreenshot.id}
    currentCheckId={check.id}
    assessmentId={check.assessment_id}
    onAssigned={() => {
      setAssigningScreenshot(null);
      // Refresh screenshots
    }}
  />
)}
```

### 4.3 Update CheckList for drag-and-drop

**File:** `components/checks/CheckList.tsx`

Add drop zone handlers to check items:

```typescript
const handleDrop = async (e: React.DragEvent, checkId: string) => {
  e.preventDefault();
  const screenshotId = e.dataTransfer.getData('screenshot-id');

  if (!screenshotId) return;

  try {
    const res = await fetch(`/api/screenshots/${screenshotId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkIds: [checkId] }),
    });

    if (res.ok) {
      // Show success feedback
      console.log('Screenshot assigned successfully');
      // Could trigger a refresh or show toast notification
    }
  } catch (error) {
    console.error('Failed to assign screenshot:', error);
  }
};

// In the check item render:
<div
  onDragOver={(e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }}
  onDrop={(e) => handleDrop(e, check.id)}
  className={clsx(
    'check-item',
    'transition-colors',
    'hover:bg-blue-50' // Visual feedback on drag hover
  )}
>
  {/* existing check content */}
</div>
```

---

## Phase 5: Testing Checklist

- [ ] Run all 3 migrations successfully
- [ ] Verify existing screenshots migrated correctly
- [ ] Create new screenshot → verify assignment created with `is_original=true`
- [ ] Fetch screenshots for check → verify query works
- [ ] Assign screenshot to another check via modal → verify assignment created
- [ ] Drag screenshot to different check → verify assignment created
- [ ] View screenshot in multiple checks → verify shows in both
- [ ] Try to unassign from original check → verify error/prevented
- [ ] Unassign from non-original check → verify removed
- [ ] Clone check with screenshots → verify assignments created (not duplicates)
- [ ] Delete screenshot → verify cascade removes all assignments
- [ ] Delete check → verify cascade removes assignments
- [ ] Verify all existing API endpoints still work
- [ ] Test batch analysis with assigned screenshots
- [ ] Test reports generation with assigned screenshots

---

## Rollback Plan

If issues arise, rollback steps:

1. Re-add `check_id` column to screenshots table
2. Populate from junction table: `UPDATE screenshots s SET check_id = (SELECT check_id FROM screenshot_check_assignments WHERE screenshot_id = s.id AND is_original = true)`
3. Re-add foreign key constraint
4. Drop junction table
5. Revert code changes

---

## Files Modified Summary

### Database
- `supabase/migrations/YYYYMMDD_create_screenshot_assignments.sql` (NEW)
- `supabase/migrations/YYYYMMDD_migrate_screenshot_relationships.sql` (NEW)
- `supabase/migrations/YYYYMMDD_drop_screenshot_check_id.sql` (NEW)

### Types
- `types/database.ts` (MODIFIED)

### API Endpoints (MODIFIED)
- `app/api/screenshots/route.ts` - Update GET and POST
- `app/api/screenshots/[id]/route.ts` - Update queries
- `app/api/checks/[id]/screenshots/route.ts` - Update query
- `app/api/checks/[id]/assess/route.ts` - Update query
- `app/api/checks/[id]/clone/route.ts` - Update cloning logic
- `app/api/checks/[id]/prompt/route.ts` - Update count query
- `app/api/assessments/[id]/checks/route.ts` - Update batch fetch
- `app/assessments/[id]/page.tsx` - Update query
- `lib/reports/get-violations.ts` - Update query

### API Endpoints (NEW)
- `app/api/screenshots/[id]/assign/route.ts` - Assign to checks
- `app/api/screenshots/[id]/unassign/[checkId]/route.ts` - Unassign from check
- `app/api/screenshots/[id]/assignments/route.ts` - Get assignments

### UI Components (NEW)
- `components/screenshots/AssignScreenshotModal.tsx` - Assignment modal

### UI Components (MODIFIED)
- `components/screenshots/ScreenshotGallery.tsx` - Add assign button, drag, badges
- `components/checks/CheckList.tsx` - Add drop zones

---

## Notes

- All existing screenshots will continue to work during migration
- No data loss - pure additive changes until final column drop
- `is_original` flag preserves historical context
- CASCADE deletes ensure referential integrity
- Junction table allows true many-to-many flexibility
