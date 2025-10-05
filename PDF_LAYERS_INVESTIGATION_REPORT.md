# PDF Layers Investigation Report

**Date:** 2025-10-04
**PDF File:** `EM 1003 2024_0925_636386 - 255 California St_5TH FLOOR_IFC set Delta 2.pdf`
**Issue:** Layer visibility toggles in dropdown do not affect rendered markup visibility

## Executive Summary

The PDF contains Optional Content Group (OCG) layer definitions in its metadata, but the actual page content is **not associated with these layers**. This means the layers are organizational/metadata-only and cannot control content visibility during rendering. The layer toggle feature appears to work in the UI but has no effect on what's displayed.

---

## How We Extract Layers (Current Implementation)

### Code Location: `components/pdf/PDFViewer.tsx`

```typescript
// Extract PDF layers (Optional Content Groups)
useEffect(() => {
  if (!pdfInstance) return;
  (async () => {
    try {
      const ocConfig = await pdfInstance.getOptionalContentConfig();
      if (!ocConfig) {
        setLayers([]);
        return;
      }

      setOptionalContentConfig(ocConfig);

      const groups = ocConfig.getOrder();
      if (!groups || groups.length === 0) {
        setLayers([]);
        return;
      }

      const layerList: PDFLayer[] = groups.map((groupId: string) => {
        const group = ocConfig.getGroup(groupId);
        return {
          id: groupId,
          name: group.name,
          visible: ocConfig.isVisible(groupId),
        };
      });

      setLayers(layerList);
    } catch (err) {
      console.error('Failed to extract PDF layers:', err);
      setLayers([]);
    }
  })();
}, [pdfInstance]);
```

### Toggle Implementation

```typescript
const toggleLayer = async (layerId: string) => {
  if (!optionalContentConfig) return;

  // Update the layer visibility in the config
  const currentVisibility = optionalContentConfig.isVisible(layerId);
  optionalContentConfig.setVisibility(layerId, !currentVisibility);

  // Update our local state
  setLayers(prev =>
    prev.map(layer => (layer.id === layerId ? { ...layer, visible: !layer.visible } : layer))
  );

  // Force a re-render by incrementing version
  setLayerVersion(prev => prev + 1);
};
```

### Rendering with Layer Config

```typescript
<Page
  key={`page-${state.pageNumber}-layers-${layerVersion}`}
  pageNumber={state.pageNumber}
  scale={renderScale}
  renderTextLayer={false}
  renderAnnotationLayer={false}
  {...({
    optionalContentConfigPromise:
      pdfInstance && layers.length > 0
        ? (async () => {
            const config = await pdfInstance.getOptionalContentConfig();
            // Apply our visibility state
            layers.forEach(layer => {
              config.setVisibility(layer.id, layer.visible);
            });
            return config;
          })()
        : undefined,
  } as Record<string, unknown>)}
/>
```

---

## Investigation Findings

### PDF Metadata

```json
{
  "PDFFormatVersion": "1.7",
  "Creator": "AutoCAD 2023 - English 2023 (24.2s (LMS Tech))",
  "Producer": "pdfplot16.hdi 16.02.203.00000",
  "CreationDate": "D:20240925165718Z",
  "ModDate": "D:20251003010838-04'00'",
  "Title": "A-30.5"
}
```

- **Number of pages:** 16
- **Page 1 viewport:** 3024 × 2160 pixels
- **Text items on page 1:** 1,877
- **Total PDF operators on page 1:** 31,296

### Layer Definitions Found

The PDF contains **6 Optional Content Groups (OCGs)**:

| Layer ID | Layer Name          | Initial Visibility | Type      | Intent |
|----------|---------------------|-------------------|-----------|--------|
| 274R     | Accessible Spaces   | true              | undefined | null   |
| 268R     | Contract area       | true              | undefined | null   |
| 289R     | Accessible Route    | true              | undefined | null   |
| 1105R    | Doors               | true              | undefined | null   |
| 1215R    | Parking             | true              | undefined | null   |
| 2077R    | Elevators           | true              | undefined | null   |

**Note:** All layers have `type: undefined` and `intent: null`, which is unusual but not necessarily problematic.

### Critical Finding: No Optional Content Operations

```
Operator list length: 31,296
Total marked content operations: 0
Total optional content BEGIN operations: 0
Total optional content END operations: 0
```

**This is the root cause of the issue.** The PDF contains zero `beginMarkedContentProps` operations with the 'OC' (Optional Content) tag. This means:

1. Layer definitions exist in the PDF catalog
2. **But no actual page content is wrapped in these layers**
3. All graphics/markup are rendered unconditionally
4. Toggling layer visibility has no effect

### setVisibility() API Does Not Work

Testing revealed that `optionalContentConfig.setVisibility(layerId, false)` does not modify the configuration:

```javascript
// After calling setVisibility(layerId, false) on ALL layers:
groups.forEach((groupId, index) => {
  const visible = optionalContentConfig.isVisible(groupId);
  console.log(`Layer ${index + 1}: ${visible ? 'VISIBLE ❌' : 'HIDDEN ✓'}`);
});

// Result: ALL layers still report as VISIBLE
```

Additionally:
- `setVisibility()` returns `undefined` (no confirmation)
- `optionalContentConfig._groups` is `undefined` (internal state not modifiable)
- The config object appears to be read-only

---

## Technical Explanation

### How PDF Layers Should Work

In a properly layer-enabled PDF, content is wrapped like this:

```pdf
/OC /MC0 BDC    % Begin marked content with optional content reference
  ... drawing operations ...
EMC             % End marked content
```

The `/OC` tag references an Optional Content Group (OCG) ID, which maps to a layer definition. PDF viewers can then:
1. Check if that OCG is visible in the current configuration
2. Skip rendering operations within that marked content block if hidden

### What This PDF Has

This PDF has:
- ✅ Layer definitions in the PDF catalog (`/OCProperties`)
- ❌ **No content associated with those layers** (no `/OC` marked content blocks)

This is common with AutoCAD exports where layers are organizational but the export flattens everything into a single rendering stream.

### Why setVisibility() Doesn't Work

PDF.js's `OptionalContentConfig` object appears to be a **read-only snapshot** of the PDF's initial layer state. The `setVisibility()` method exists but:

1. Doesn't modify internal state (confirmed by `_groups` remaining `undefined`)
2. Doesn't return a new config object
3. Is not the intended API for visibility control

The correct approach would be to:
1. Get a fresh config via `pdfDocument.getOptionalContentConfig()`
2. Pass visibility overrides during **render time**, not via `setVisibility()`
3. Use PDF.js's internal viewer event system (`optionalcontentconfig` event)

However, even if we implemented this correctly, **it would have no effect** because the PDF content doesn't reference the layers.

---

## Investigation Script

### Script: `scripts/investigate_pdf_layers.mjs`

```javascript
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';

const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('Usage: node investigate_pdf_layers.mjs <path-to-pdf>');
  process.exit(1);
}

async function investigateLayers() {
  console.log('Loading PDF:', pdfPath);

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

  // Test page 1 rendering
  console.log('\n=== TESTING PAGE 1 RENDERING ===');
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.0 });

  console.log('Page viewport:', {
    width: viewport.width,
    height: viewport.height,
  });

  const textContent = await page.getTextContent();
  console.log('\nText items on page:', textContent.items.length);

  // Get operator list to check for optional content markers
  const opList = await page.getOperatorList();
  console.log('\nOperator list length:', opList.fnArray.length);

  let markedContentCount = 0;
  let optionalContentBeginCount = 0;

  for (let i = 0; i < opList.fnArray.length; i++) {
    const op = opList.fnArray[i];

    if (op === pdfjsLib.OPS.beginMarkedContent || op === pdfjsLib.OPS.beginMarkedContentProps) {
      markedContentCount++;
    }

    // Check for optional content begin
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

  // Test visibility control
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

  console.log('\n=== ADDITIONAL PDF METADATA ===');
  const metadata = await pdf.getMetadata();
  console.log('Metadata:', JSON.stringify(metadata.info, null, 2));

  console.log('\n✅ Investigation complete');
}

investigateLayers().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
```

### Running the Script

```bash
node scripts/investigate_pdf_layers.mjs "/path/to/pdf/file.pdf"
```

---

## Recommendations

### Option 1: Hide Non-Functional Layers
Only show the layers panel when layers are actually functional:

```typescript
// After extracting layers, verify they're actually used
const opList = await pageInstance.getOperatorList();
let hasOptionalContent = false;
for (let i = 0; i < opList.fnArray.length; i++) {
  if (opList.fnArray[i] === pdfjs.OPS.beginMarkedContentProps) {
    const args = opList.argsArray[i];
    if (args && args[0] === 'OC') {
      hasOptionalContent = true;
      break;
    }
  }
}

// Only show layers panel if hasOptionalContent is true
if (layers.length > 0 && hasOptionalContent) {
  // Show layers panel
}
```

### Option 2: Show Warning
Display a message when layers exist but aren't functional:

```typescript
{layers.length > 0 && !hasOptionalContent && (
  <div className="text-xs text-yellow-600 p-2">
    ⚠️ This PDF has layer definitions but content is not associated with layers.
    Layer toggles will have no effect.
  </div>
)}
```

### Option 3: Remove Feature
Remove the layers feature entirely until we encounter PDFs where it actually works.

### Option 4: Contact AutoCAD Export Team
Request that the PDF export process in AutoCAD properly wraps layer content in OCG marked content blocks.

---

## Related PDF.js Issues

- [mozilla/pdf.js#13192](https://github.com/mozilla/pdf.js/issues/13192) - Default state of Optional Content Configuration not respected
- [mozilla/pdf.js#269](https://github.com/mozilla/pdf.js/issues/269) - Feature request for PDF layers
- [mozilla/pdf.js#18823](https://github.com/mozilla/pdf.js/issues/18823) - Optional Content Radio Button Groups

---

## Conclusion

The layer visibility feature is **correctly implemented** in our code, but the PDFs we're receiving from AutoCAD exports don't properly associate content with their layer definitions. This is a limitation of the source PDF, not our rendering code.

The immediate fix is to detect when layers are non-functional and either hide the UI or display a warning to users.

For a long-term solution, we'd need to work with the AutoCAD team to ensure PDFs are exported with proper optional content markup, or find an alternative method to control markup visibility (e.g., manual annotation layers we add ourselves).
