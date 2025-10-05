#!/usr/bin/env node

/**
 * Exhaustive search for all possible layer information in PDF
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'fs';
import util from 'util';

const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('Usage: node exhaustive_layer_search.mjs <path-to-pdf>');
  process.exit(1);
}

function flattenOrder(order, depth = 0) {
  const results = [];
  const indent = '  '.repeat(depth);

  if (!order) return results;

  for (const item of order) {
    if (typeof item === 'string') {
      results.push({ id: item, depth });
      console.log(`${indent}[String] ${item}`);
    } else if (Array.isArray(item)) {
      console.log(`${indent}[Array] with ${item.length} items:`);
      results.push(...flattenOrder(item, depth + 1));
    } else if (typeof item === 'object' && item !== null) {
      console.log(`${indent}[Object]`, item);
    } else {
      console.log(`${indent}[Unknown type: ${typeof item}]`, item);
    }
  }

  return results;
}

async function exhaustiveSearch(pdfPath) {
  try {
    const data = new Uint8Array(readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;

    console.log(`PDF: ${pdf.numPages} pages\n`);

    const optionalContentConfig = await pdf.getOptionalContentConfig();

    if (!optionalContentConfig) {
      console.log('No optional content found');
      return;
    }

    console.log('=== Full Optional Content Config ===');
    console.log(util.inspect(optionalContentConfig, { showHidden: true, depth: 10, colors: true }));
    console.log('\n');

    console.log('=== Flattened Order Structure ===');
    const order = optionalContentConfig.getOrder();
    const allIds = flattenOrder(order);
    console.log(`\nTotal layer IDs found: ${allIds.length}\n`);

    console.log('=== All Layer Details ===');
    allIds.forEach(({ id, depth }) => {
      const indent = '  '.repeat(depth);
      try {
        const group = optionalContentConfig.getGroup(id);
        const visible = optionalContentConfig.isVisible(id);
        console.log(`${indent}ID: ${id}`);
        console.log(`${indent}  Name: ${group.name}`);
        console.log(`${indent}  Visible: ${visible}`);
        console.log(`${indent}  Intent: ${group.intent}`);
        console.log(`${indent}  Full:`, util.inspect(group, { depth: 3 }));
        console.log('');
      } catch (e) {
        console.log(`${indent}Error processing ${id}:`, e.message);
      }
    });

    // Try to access internal state
    console.log('=== Internal Properties ===');
    const props = Object.getOwnPropertyNames(optionalContentConfig);
    console.log('Properties:', props);

    props.forEach(prop => {
      if (!prop.startsWith('_') || prop === '_groups') {
        try {
          const val = optionalContentConfig[prop];
          if (val && typeof val === 'object') {
            console.log(`\n${prop}:`, util.inspect(val, { depth: 5, colors: true }));
          }
        } catch (e) {
          // Ignore
        }
      }
    });

    // Check page resources for layer references
    console.log('\n=== Checking Page Resources ===');
    for (let i = 1; i <= Math.min(3, pdf.numPages); i++) {
      console.log(`\nPage ${i}:`);
      const page = await pdf.getPage(i);
      const ops = await page.getOperatorList();

      // Look for layer-switching operations
      const layerOps = [];
      if (ops && ops.fnArray) {
        ops.fnArray.forEach((op, idx) => {
          const opName = Object.keys(pdfjsLib.OPS).find(key => pdfjsLib.OPS[key] === op);
          if (opName && (opName.includes('MARKED') || opName.includes('BDC') || opName.includes('BMC'))) {
            layerOps.push({ index: idx, op: opName, args: ops.argsArray[idx] });
          }
        });
      }

      if (layerOps.length > 0) {
        console.log(`  Found ${layerOps.length} marked content operations:`);
        layerOps.slice(0, 10).forEach(op => {
          console.log(`    ${op.op}:`, op.args);
        });
      } else {
        console.log('  No marked content operations found');
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

exhaustiveSearch(pdfPath);
