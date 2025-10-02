#!/usr/bin/env node

/**
 * Extract and display PDF layer (Optional Content Group) information
 * Usage: node scripts/extract_pdf_layers.mjs <path-to-pdf>
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('Usage: node extract_pdf_layers.mjs <path-to-pdf>');
  process.exit(1);
}

async function extractLayers(pdfPath) {
  try {
    // Read PDF file
    const data = new Uint8Array(readFileSync(pdfPath));

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;

    console.log(`PDF loaded: ${pdf.numPages} pages\n`);

    // Get optional content configuration
    const optionalContentConfig = await pdf.getOptionalContentConfig();

    if (!optionalContentConfig) {
      console.log('No optional content (layers) found in this PDF');
      return;
    }

    // Get all groups
    const groups = optionalContentConfig.getOrder();

    if (!groups || groups.length === 0) {
      console.log('No layer groups found in this PDF');
      return;
    }

    console.log(`Found ${groups.length} layer groups:\n`);

    // Extract layer information
    groups.forEach((groupId, index) => {
      const group = optionalContentConfig.getGroup(groupId);
      const isVisible = optionalContentConfig.isVisible(groupId);

      console.log(`${index + 1}. ${group.name}`);
      console.log(`   ID: ${groupId}`);
      console.log(`   Visible: ${isVisible}`);
      console.log(`   Intent: ${group.intent || 'N/A'}`);
      console.log('');
    });

    // Also print raw structure for debugging
    console.log('\n--- Raw OCG Structure ---');
    console.log(JSON.stringify({
      groups: groups.map(id => ({
        id,
        name: optionalContentConfig.getGroup(id).name,
        visible: optionalContentConfig.isVisible(id)
      }))
    }, null, 2));

  } catch (error) {
    console.error('Error extracting layers:', error);
    process.exit(1);
  }
}

extractLayers(pdfPath);
