# CSV Element Parser

Import door elements from PDF annotation CSV exports (e.g., from SAIA, Bluebeam, or other PDF markup tools).

## Overview

This library parses CSV files containing door annotations and measurements, automatically creating door element instances with:

- Bounding boxes for PDF visualization
- Extracted clearance measurements
- Pre-filled DoorParameters for compliance checking

## Usage

### In the UI

1. Navigate to an assessment
2. Switch to "By Element" mode
3. Click "Import CSV" button
4. Upload a CSV file with door annotations (GroupID=5)
5. Doors are created automatically with measurements

### API Endpoint

```typescript
POST /api/assessments/[id]/import-csv-doors
Content-Type: multipart/form-data

Body: { file: File }

Response: {
  success: boolean,
  doorsCreated: number,
  doors: Array<{
    id: string,
    instanceLabel: string,
    pageNumber: number,
    boundingBox: { x, y, width, height },
    parameters: DoorParameters,
    measurements: { frontPull, frontPush, ... }
  }>
}
```

### Programmatic Usage

```typescript
import { parseCSV, convertToDoorsData, mapToDoorParameters } from '@/lib/csv-element-parser';

// Parse CSV content
const doorGroups = parseCSV(csvContent);

// Convert to door data with PDF coordinates
const doors = convertToDoorsData(doorGroups);

// Map measurements to DoorParameters
const params = mapToDoorParameters(doors[0]);
```

## CSV Format Requirements

### Required Columns

- `ID` - Unique identifier for each annotation
- `Subject` - Type of annotation (Rectangle, Length Measurement, Width, etc.)
- `GroupID` - Group identifier (must be "5" for doors)
- `Page Index` - Page number (0-indexed)
- `X`, `Y` - Position in inches
- `Document Width`, `Document Height` - Rectangle dimensions in inches
- `Length` - Measurement value in inches

### Required Annotations

For each door (GroupID=5):

1. **Rectangle** - Defines door bounding box
   - Subject: "Rectangle"
   - Uses `X`, `Y`, `Document Width`, `Document Height`

2. **Measurements** - Door clearances
   - Subject: "Front, pull" → pull_side_perpendicular_clearance_inches
   - Subject: "Front, push" → push_side_perpendicular_clearance_inches
   - Subject: "Pull, latch" → latch_side_clearance_inches (pull)
   - Subject: "Push, latch" → latch_side_clearance_inches (push)
   - Subject: "Hinge, push" → hinge_side_clearance_inches
   - Subject: "Width" → clear_width_inches

3. **Label** (optional) - Door name
   - Subject: "Text Box" with door identifier

### Example CSV Structure

```csv
ID,Parent,Subject,Page Label,...,GroupID,Page Index,X,Y,Document Width,Document Height,Length,...
ABC123,,Rectangle,[5] Floor Plan,...,5,5,30.65,4.24,0.15,0.61,0,...
DEF456,,"Front, pull",[5] Floor Plan,...,5,5,30.50,4.55,,,54.39,...
GHI789,,"Front, push",[5] Floor Plan,...,5,5,30.72,4.85,,,54.39,...
```

## Implementation Details

### Coordinate System

- **Input**: Inches from top-left corner of PDF page
- **Output**: PDF points (72 points = 1 inch)
- **Origin**: Top-left corner (0, 0)

### GroupID Hardcoding

Currently hardcoded to `GroupID=5` for doors. This value is defined in:

```typescript
const DOOR_GROUP_ID = '5'; // lib/csv-element-parser/parser.ts
```

To support other element types, modify this constant or add a parameter.

### Data Flow

```
CSV File
  ↓
parseCSV() → DoorGroup[]
  ↓
convertToDoorsData() → ParsedDoor[]
  ↓
mapToDoorParameters() → DoorParameters
  ↓
element_instances table
```

## Database Schema

### element_instances

```sql
CREATE TABLE element_instances (
  id UUID PRIMARY KEY,
  assessment_id UUID NOT NULL,
  element_group_id UUID NOT NULL,
  label VARCHAR NOT NULL,
  parameters JSONB DEFAULT '{}',
  bounding_box JSONB,
  page_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### parameters Field (JSONB)

Stores DoorParameters:

```json
{
  "clear_width_inches": 28.97,
  "pull_side_perpendicular_clearance_inches": 54.4,
  "push_side_perpendicular_clearance_inches": 54.39,
  "latch_side_clearance_inches": 38.06,
  "hinge_side_clearance_inches": 19.94,
  "has_latch": true,
  "is_on_accessible_route": true,
  "is_hinged_door": true
}
```

### bounding_box Field (JSONB)

PDF coordinates in points:

```json
{
  "x": 2206.75,
  "y": 305.01,
  "width": 10.9,
  "height": 44.02
}
```

## Testing

Run the test script:

```bash
npx tsx scripts/test-csv-parser.ts path/to/file.csv
```

Expected output:

```
Door: ✅ Front, Push
  Page: 5
  Bounding Box: { x: 2206.75, y: 305.01, width: 10.90, height: 44.02 }
  Measurements:
    Front, pull: 54.4"
    Front, push: 54.39"
    Pull, latch: 38.06"
    Push, latch: 38.04"
    Hinge, push: 19.94"
    Width: 28.97"
```

## Error Handling

### Common Errors

1. **"No doors found in CSV (GroupID=5)"**
   - CSV doesn't contain annotations with GroupID=5
   - Check CSV export settings

2. **"Skipping door group: no rectangle found"**
   - Missing Rectangle annotation
   - Add rectangle to mark door location

3. **"Assessment not found"**
   - Invalid assessment ID
   - Verify assessment exists

4. **"Doors element group not found"**
   - Database missing element_groups entry for doors
   - Run: `INSERT INTO element_groups (name, slug) VALUES ('Doors', 'doors')`

## Future Enhancements

- [ ] Support multiple GroupIDs in one CSV (doors, ramps, parking, etc.)
- [ ] PDF overlay visualization showing bounding boxes
- [ ] Validation warnings for missing critical measurements
- [ ] Pre-import preview with measurement summary
- [ ] Support for other measurement systems (metric)
- [ ] Batch import from multiple CSV files
- [ ] Custom measurement mapping configuration

## Related Files

- `lib/csv-element-parser/parser.ts` - CSV parsing logic
- `lib/csv-element-parser/mapper.ts` - DoorParameters mapping
- `lib/csv-element-parser/types.ts` - TypeScript types
- `components/assessments/ImportCSVDoorsModal.tsx` - UI component
- `app/api/assessments/[id]/import-csv-doors/route.ts` - API endpoint
- `scripts/test-csv-parser.ts` - Test script
