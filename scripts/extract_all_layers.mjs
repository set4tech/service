#!/usr/bin/env node

/**
 * Extract layers from all PDFs in a directory
 * Usage: node scripts/extract_all_layers.mjs <directory-path>
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dirPath = process.argv[2] || `${process.env.HOME}/floorplans/255-cali/`;

console.log(`Scanning directory: ${dirPath}\n`);

async function extractLayers(pdfPath) {
  try {
    const data = new Uint8Array(readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;

    const optionalContentConfig = await pdf.getOptionalContentConfig();

    if (!optionalContentConfig) {
      return null;
    }

    const groups = optionalContentConfig.getOrder();

    if (!groups || groups.length === 0) {
      return null;
    }

    // Flatten nested arrays and extract all layer names
    const flattenGroups = (items) => {
      const result = [];
      for (const item of items) {
        if (typeof item === 'string') {
          result.push(item);
        } else if (Array.isArray(item)) {
          result.push(...flattenGroups(item));
        }
      }
      return result;
    };

    const allGroupIds = flattenGroups(groups);
    const layers = allGroupIds.map(id => {
      const group = optionalContentConfig.getGroup(id);
      return {
        id,
        name: group.name,
        visible: optionalContentConfig.isVisible(id)
      };
    });

    return layers;
  } catch (error) {
    console.error(`Error processing ${pdfPath}:`, error.message);
    return null;
  }
}

async function processDirectory(dirPath) {
  try {
    const files = readdirSync(dirPath);
    const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));

    console.log(`Found ${pdfFiles.length} PDF files\n`);
    console.log('='.repeat(80));

    for (const file of pdfFiles) {
      const fullPath = join(dirPath, file);
      console.log(`\n📄 ${file}`);
      console.log('-'.repeat(80));

      const layers = await extractLayers(fullPath);

      if (!layers) {
        console.log('  No layers found');
      } else {
        console.log(`  Found ${layers.length} layers:\n`);
        layers.forEach((layer, index) => {
          console.log(`  ${index + 1}. ${layer.name}`);
          console.log(`     ID: ${layer.id}`);
          console.log(`     Visible: ${layer.visible}`);
        });
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('Done!');
  } catch (error) {
    console.error('Error reading directory:', error);
    process.exit(1);
  }
}

processDirectory(dirPath);
