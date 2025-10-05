import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

// Accept file path as command line argument
const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('Usage: node investigate_pdf_layers.mjs <path-to-pdf>');
  process.exit(1);
}

async function investigateLayers() {
  console.log('Loading PDF:', pdfPath);

  // Check if file exists
  if (!fs.existsSync(pdfPath)) {
    console.error('❌ File not found:', pdfPath);
    process.exit(1);
  }

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument(data);
  const pdf = await loadingTask.promise;

  console.log('\n=== PDF INFO ===');
  console.log('Number of pages:', pdf.numPages);

  // Get optional content config
  const optionalContentConfig = await pdf.getOptionalContentConfig();

  if (!optionalContentConfig) {
    console.log('\n❌ No optional content found in this PDF');
    return;
  }

  console.log('\n=== OPTIONAL CONTENT CONFIG ===');

  // Get the groups
  const groups = optionalContentConfig.getOrder();
  console.log('Number of layer groups:', groups ? groups.length : 0);

  if (!groups || groups.length === 0) {
    console.log('\n❌ No layer groups found in optional content config');
    return;
  }

  console.log('\n=== LAYER DETAILS ===');
  groups.forEach((groupId, index) => {
    const group = optionalContentConfig.getGroup(groupId);
    const visible = optionalContentConfig.isVisible(groupId);

    console.log(`\nLayer ${index + 1}:`);
    console.log('  ID:', groupId);
    console.log('  Name:', group.name);
    console.log('  Visible:', visible);
    console.log('  Intent:', group.intent);
    console.log('  Type:', group.type);
    console.log('  Full group object:', JSON.stringify(group, null, 2));
  });

  // Test page 1 rendering with different layer configs
  console.log('\n=== TESTING PAGE 1 RENDERING ===');
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.0 });

  console.log('Page viewport:', {
    width: viewport.width,
    height: viewport.height,
  });

  // Try getting the page content to see what references optional content
  const textContent = await page.getTextContent();
  console.log('\nText items on page:', textContent.items.length);

  // Get operator list to see if there are any optional content markers
  const opList = await page.getOperatorList();
  console.log('\nOperator list length:', opList.fnArray.length);

  // Look for beginMarkedContent operations and optional content operations
  let markedContentCount = 0;
  let optionalContentBeginCount = 0;
  let optionalContentEndCount = 0;

  for (let i = 0; i < opList.fnArray.length; i++) {
    const op = opList.fnArray[i];

    if (op === pdfjsLib.OPS.beginMarkedContent || op === pdfjsLib.OPS.beginMarkedContentProps) {
      markedContentCount++;
      if (i < 20) { // Only log first 20
        console.log(`  Marked content at ${i}:`, opList.argsArray[i]);
      }
    }

    // Check for optional content begin/end
    if (op === pdfjsLib.OPS.beginMarkedContentProps) {
      const args = opList.argsArray[i];
      if (args && args[0] === 'OC') {
        optionalContentBeginCount++;
        if (optionalContentBeginCount < 10) {
          console.log(`  Optional content BEGIN at ${i}:`, args);
        }
      }
    }
  }

  console.log(`\nTotal marked content operations: ${markedContentCount}`);
  console.log(`Total optional content BEGIN operations: ${optionalContentBeginCount}`);
  console.log(`Total optional content END operations: ${optionalContentEndCount}`);

  // Now test turning off all layers
  console.log('\n=== TESTING LAYER VISIBILITY CONTROL ===');
  console.log('Turning off all layers...');
  groups.forEach(groupId => {
    console.log(`  Calling setVisibility(${groupId}, false)...`);
    const result = optionalContentConfig.setVisibility(groupId, false);
    console.log(`    Return value:`, result);
  });

  // Verify they're off
  console.log('\nVerifying all layers are now invisible:');
  groups.forEach((groupId, index) => {
    const group = optionalContentConfig.getGroup(groupId);
    const visible = optionalContentConfig.isVisible(groupId);
    console.log(`  Layer ${index + 1} (${group.name}): ${visible ? 'VISIBLE ❌' : 'HIDDEN ✓'}`);
  });

  // Check the internal state
  console.log('\n=== INTERNAL STATE ===');
  console.log('optionalContentConfig._groups:');
  console.log(JSON.stringify(optionalContentConfig._groups, null, 2));

  console.log('\n=== ADDITIONAL PDF METADATA ===');
  const metadata = await pdf.getMetadata();
  console.log('Metadata:', JSON.stringify(metadata.info, null, 2));

  console.log('\n✅ Investigation complete');
}

investigateLayers().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
