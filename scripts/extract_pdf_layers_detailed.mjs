#!/usr/bin/env node

/**
 * Deep inspection of PDF Optional Content structure
 * Usage: node scripts/extract_pdf_layers_detailed.mjs <path-to-pdf>
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'fs';
import util from 'util';

const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('Usage: node extract_pdf_layers_detailed.mjs <path-to-pdf>');
  process.exit(1);
}

async function inspectLayers(pdfPath) {
  try {
    const data = new Uint8Array(readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;

    console.log(`PDF loaded: ${pdf.numPages} pages\n`);

    const optionalContentConfig = await pdf.getOptionalContentConfig();

    if (!optionalContentConfig) {
      console.log('No optional content found');
      return;
    }

    console.log('=== Optional Content Config Object ===');
    console.log(util.inspect(optionalContentConfig, { depth: 10, colors: true }));
    console.log('\n');

    // Try to get all groups
    const order = optionalContentConfig.getOrder();
    console.log('=== getOrder() result ===');
    console.log(util.inspect(order, { depth: 10, colors: true }));
    console.log('\n');

    if (order && order.length > 0) {
      console.log(`Found ${order.length} groups in order:\n`);

      order.forEach((item, index) => {
        console.log(`${index + 1}. Item:`, item);

        if (typeof item === 'string') {
          try {
            const group = optionalContentConfig.getGroup(item);
            console.log(`   Group info:`, util.inspect(group, { depth: 5 }));
            console.log(`   Visible:`, optionalContentConfig.isVisible(item));
          } catch (e) {
            console.log(`   Error getting group:`, e.message);
          }
        } else if (Array.isArray(item)) {
          console.log(`   This is a nested array with ${item.length} items`);
          item.forEach((subItem, subIndex) => {
            console.log(`   ${subIndex + 1}. Sub-item:`, subItem);
            if (typeof subItem === 'string') {
              try {
                const group = optionalContentConfig.getGroup(subItem);
                console.log(`      Group info:`, util.inspect(group, { depth: 5 }));
                console.log(`      Visible:`, optionalContentConfig.isVisible(subItem));
              } catch (e) {
                console.log(`      Error getting group:`, e.message);
              }
            }
          });
        }
        console.log('');
      });
    }

    // Try to access internal properties
    console.log('\n=== Trying internal _groups property ===');
    if (optionalContentConfig._groups) {
      console.log('Groups map:', util.inspect(optionalContentConfig._groups, { depth: 5, colors: true }));
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

inspectLayers(pdfPath);
