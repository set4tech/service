#!/usr/bin/env node

/**
 * Check PDF internal structure for layers
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync } from 'fs';
import util from 'util';

const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('Usage: node check_pdf_structure.mjs <path-to-pdf>');
  process.exit(1);
}

async function checkStructure(pdfPath) {
  try {
    const data = new Uint8Array(readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;

    console.log(`PDF: ${pdf.numPages} pages\n`);

    // Check catalog
    const catalog = await pdf.pdfManager?.ensureCatalog();
    console.log('=== Catalog ===');
    console.log(util.inspect(catalog, { depth: 3, colors: true }));
    console.log('\n');

    // Check first page structure
    const page = await pdf.getPage(1);
    console.log('=== Page 1 ===');
    console.log('Resources:', util.inspect(page._pageDict?.get('Resources'), { depth: 3, colors: true }));
    console.log('\n');

    // Try to get operator list which might show layer switches
    const viewport = page.getViewport({ scale: 1.0 });
    const opList = await page.getOperatorList();

    console.log('=== Operator List (first 50 operations) ===');
    if (opList && opList.fnArray) {
      const operations = opList.fnArray.slice(0, 50);
      operations.forEach((op, i) => {
        const opName = Object.keys(pdfjsLib.OPS).find(key => pdfjsLib.OPS[key] === op);
        const args = opList.argsArray[i];
        console.log(`${i}: ${opName || op}`, args && args.length < 3 ? args : `(${args?.length} args)`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

checkStructure(pdfPath);
