/**
 * CSV Element Parser
 * Parses CSV exports from PDF annotation tools to extract door elements
 */

import { CSVRow, DoorGroup, ParsedDoor, Measurement } from './types';

const POINTS_PER_INCH = 72;
const DOOR_GROUP_ID = '5'; // Hardcoded for now

/**
 * Parse CSV content and extract door groups (GroupID=5)
 */
export function parseCSV(csvContent: string): DoorGroup[] {
  const lines = csvContent.split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file is empty or invalid');
  }

  // Parse header
  const headers = parseCSVLine(lines[0]);

  // Parse rows
  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = parseCSVLine(lines[i]);
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row as CSVRow);
  }

  console.log(`Parsed ${rows.length} rows from CSV`);

  // Group rows by GroupID=5
  return groupDoorRows(rows);
}

/**
 * Parse a single CSV line (handles quoted values)
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Group CSV rows by door GroupID
 */
function groupDoorRows(rows: CSVRow[]): DoorGroup[] {
  // Filter for GroupID=5 (doors)
  const doorRows = rows.filter(row => row.GroupID === DOOR_GROUP_ID);

  console.log(`Found ${doorRows.length} rows with GroupID=${DOOR_GROUP_ID}`);

  if (doorRows.length === 0) {
    return [];
  }

  // All rows with GroupID=5 represent a single door element
  // Create one door group with all these rows
  const doorGroup: DoorGroup = {
    groupId: DOOR_GROUP_ID,
    pageNumber: 0,
    pageLabel: '',
    label: 'Door',
    measurements: [],
  };

  // Get page info from first row
  if (doorRows.length > 0) {
    doorGroup.pageNumber = parseInt(doorRows[0]['Page Index']) || 0;
    doorGroup.pageLabel = doorRows[0]['Page Label'];
  }

  // Extract label from any row with a Label field
  for (const row of doorRows) {
    const label = row.Label;
    if (label && label.trim() && label.toLowerCase() !== 'no') {
      doorGroup.label = extractDoorLabel(label, '');
      break;
    }
  }

  console.log(`Creating door group: "${doorGroup.label}" on page ${doorGroup.pageNumber}`);

  // Extract rectangle (bounding box) - use first Rectangle with reasonable dimensions
  const rectangleRows = doorRows.filter(row => row.Subject === 'Rectangle');
  for (const rectangleRow of rectangleRows) {
    // Rectangle dimensions are in "Document Width" and "Document Height" columns
    const width = parseFloat(rectangleRow['Document Width']) || 0;
    const height = parseFloat(rectangleRow['Document Height']) || 0;
    // Look for rectangle that's likely the door frame (not tiny)
    if (width > 0.05 && height > 0.05) {
      doorGroup.rectangle = {
        x: parseFloat(rectangleRow.X) || 0,
        y: parseFloat(rectangleRow.Y) || 0,
        width: width,
        height: height,
      };
      console.log(
        `Found rectangle: ${width}" x ${height}" at (${doorGroup.rectangle.x}", ${doorGroup.rectangle.y}")`
      );
      break;
    }
  }

  // Extract measurements
  for (const row of doorRows) {
    // Length measurements have Subject like "Front, pull", "Front, push", etc.
    if (row.Subject && row.Subject.includes(',')) {
      const value = parseFloat(row.Length);
      if (!isNaN(value)) {
        doorGroup.measurements.push({
          subject: row.Subject,
          value: value,
          label: row.Label || row.Measurement || '',
        });
        console.log(`  Measurement: ${row.Subject} = ${value}"`);
      }
    }
    // Also check for Width measurements
    else if (row.Subject === 'Width' && row.Length) {
      const value = parseFloat(row.Length);
      if (!isNaN(value)) {
        doorGroup.measurements.push({
          subject: 'Width',
          value: value,
          label: row.Label || 'Width',
        });
        console.log(`  Measurement: Width = ${value}"`);
      }
    }
  }

  return [doorGroup];
}

/**
 * Extract clean door label from Label field or Comments
 */
function extractDoorLabel(label: string, comments: string): string {
  // Use Label field if available
  if (label && label.trim() && label !== 'No') {
    // Clean up the label (remove extra quotes, trim)
    return label.replace(/^["']|["']$/g, '').trim();
  }

  // Fall back to Comments if it looks like a door label
  if (comments && comments.trim()) {
    return comments.trim();
  }

  // Default fallback
  return 'Door';
}

/**
 * Convert door groups to parsed door objects with PDF coordinates
 */
export function convertToDoorsData(doorGroups: DoorGroup[]): ParsedDoor[] {
  const doors: ParsedDoor[] = [];

  for (const group of doorGroups) {
    if (!group.rectangle) {
      console.warn(`Skipping door group ${group.groupId}: no rectangle found`);
      continue;
    }

    const door: ParsedDoor = {
      groupId: group.groupId,
      pageNumber: group.pageNumber,
      instanceLabel: group.label,
      boundingBox: {
        x: group.rectangle.x * POINTS_PER_INCH,
        y: group.rectangle.y * POINTS_PER_INCH,
        width: group.rectangle.width * POINTS_PER_INCH,
        height: group.rectangle.height * POINTS_PER_INCH,
      },
      measurements: extractMeasurements(group.measurements),
    };

    doors.push(door);
  }

  return doors;
}

/**
 * Extract and map measurements to door parameters
 */
function extractMeasurements(measurements: Measurement[]): ParsedDoor['measurements'] {
  const result: ParsedDoor['measurements'] = {};

  for (const m of measurements) {
    const subject = m.subject.toLowerCase();

    if (subject.includes('front') && subject.includes('pull')) {
      result.frontPull = m.value;
    } else if (subject.includes('front') && subject.includes('push')) {
      result.frontPush = m.value;
    } else if (subject.includes('pull') && subject.includes('latch')) {
      result.pullLatch = m.value;
    } else if (subject.includes('push') && subject.includes('latch')) {
      result.pushLatch = m.value;
    } else if (subject.includes('hinge') && subject.includes('push')) {
      result.hingePush = m.value;
    } else if (subject === 'width') {
      result.width = m.value;
    }
  }

  return result;
}
