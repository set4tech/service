/**
 * Test script for CSV element parser
 * Run with: npx tsx scripts/test-csv-parser.ts
 */

import { readFileSync } from 'fs';
import { parseCSV, convertToDoorsData, mapToDoorParameters } from '../lib/csv-element-parser';

const csvPath = process.argv[2] || './saia.csv';

console.log(`Reading CSV file: ${csvPath}\n`);

try {
  const csvContent = readFileSync(csvPath, 'utf-8');
  console.log(`File size: ${csvContent.length} bytes\n`);

  // Parse CSV
  console.log('=== Parsing CSV ===');
  const doorGroups = parseCSV(csvContent);
  console.log(`Found ${doorGroups.length} door groups\n`);

  // Convert to doors
  console.log('=== Converting to Doors ===');
  const doors = convertToDoorsData(doorGroups);
  console.log(`Converted ${doors.length} doors\n`);

  // Display results
  console.log('=== Door Details ===');
  for (const door of doors) {
    console.log(`\nDoor: ${door.instanceLabel}`);
    console.log(`  Page: ${door.pageNumber}`);
    console.log(`  Bounding Box: ${JSON.stringify(door.boundingBox, null, 2)}`);
    console.log(`  Measurements:`);
    console.log(`    Front, pull: ${door.measurements.frontPull || 'N/A'}`);
    console.log(`    Front, push: ${door.measurements.frontPush || 'N/A'}`);
    console.log(`    Pull, latch: ${door.measurements.pullLatch || 'N/A'}`);
    console.log(`    Push, latch: ${door.measurements.pushLatch || 'N/A'}`);
    console.log(`    Hinge, push: ${door.measurements.hingePush || 'N/A'}`);
    console.log(`    Width: ${door.measurements.width || 'N/A'}`);

    // Map to parameters
    const params = mapToDoorParameters(door);
    console.log(`  Mapped Parameters:`);
    console.log(`    clear_width_inches: ${params.clear_width_inches}`);
    console.log(
      `    pull_side_perpendicular_clearance_inches: ${params.pull_side_perpendicular_clearance_inches}`
    );
    console.log(
      `    push_side_perpendicular_clearance_inches: ${params.push_side_perpendicular_clearance_inches}`
    );
    console.log(`    latch_side_clearance_inches: ${params.latch_side_clearance_inches}`);
    console.log(`    hinge_side_clearance_inches: ${params.hinge_side_clearance_inches}`);
    console.log(`    has_latch: ${params.has_latch}`);
  }

  console.log(`\n✅ Parsing completed successfully!`);
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}
