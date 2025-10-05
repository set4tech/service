import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';

interface LayerInfo {
  name: string;
  id: string;
  visible: boolean;
}

interface ExtractedLayer {
  name: string;
  id: string;
  imageBuffer: Buffer;
  pageNumber: number;
}

// Custom canvas implementation for PDF.js
class NodeCanvasFactory {
  create(width: number, height: number) {
    console.log(`    - Creating canvas: ${width}x${height}`);
    const canvas = {
      width,
      height,
      data: Buffer.alloc(width * height * 4), // RGBA
    };
    const context = {
      canvas,
      fillStyle: 'white',
      fillRect(x: number, y: number, w: number, h: number) {
        // Fill with white background
        for (let i = y; i < y + h && i < height; i++) {
          for (let j = x; j < x + w && j < width; j++) {
            const idx = (i * width + j) * 4;
            this.canvas.data[idx] = 255; // R
            this.canvas.data[idx + 1] = 255; // G
            this.canvas.data[idx + 2] = 255; // B
            this.canvas.data[idx + 3] = 255; // A
          }
        }
      },
      save() {},
      restore() {},
      translate() {},
      scale() {},
      transform() {},
      setTransform() {},
      resetTransform() {},
      createLinearGradient() {
        return {
          addColorStop() {},
        };
      },
      createRadialGradient() {
        return {
          addColorStop() {},
        };
      },
      createPattern() {
        return null;
      },
      beginPath() {},
      closePath() {},
      moveTo() {},
      lineTo() {},
      bezierCurveTo() {},
      quadraticCurveTo() {},
      arc() {},
      arcTo() {},
      ellipse() {},
      rect() {},
      fill() {},
      stroke() {},
      clip() {},
      isPointInPath() {
        return false;
      },
      isPointInStroke() {
        return false;
      },
      measureText() {
        return { width: 0 };
      },
      fillText() {},
      strokeText() {},
      drawImage() {},
      createImageData(w: number, h: number) {
        return {
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4),
        };
      },
      getImageData(x: number, y: number, w: number, h: number) {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < h; i++) {
          for (let j = 0; j < w; j++) {
            const srcIdx = ((y + i) * width + (x + j)) * 4;
            const dstIdx = (i * w + j) * 4;
            if (srcIdx >= 0 && srcIdx < canvas.data.length - 3) {
              data[dstIdx] = canvas.data[srcIdx];
              data[dstIdx + 1] = canvas.data[srcIdx + 1];
              data[dstIdx + 2] = canvas.data[srcIdx + 2];
              data[dstIdx + 3] = canvas.data[srcIdx + 3];
            }
          }
        }
        return { width: w, height: h, data };
      },
      putImageData(imageData: any, dx: number, dy: number) {
        const { width: imgWidth, height: imgHeight, data: imgData } = imageData;
        for (let i = 0; i < imgHeight; i++) {
          for (let j = 0; j < imgWidth; j++) {
            const srcIdx = (i * imgWidth + j) * 4;
            const dstIdx = ((dy + i) * width + (dx + j)) * 4;
            if (dstIdx >= 0 && dstIdx < canvas.data.length - 3) {
              canvas.data[dstIdx] = imgData[srcIdx];
              canvas.data[dstIdx + 1] = imgData[srcIdx + 1];
              canvas.data[dstIdx + 2] = imgData[srcIdx + 2];
              canvas.data[dstIdx + 3] = imgData[srcIdx + 3];
            }
          }
        }
      },
      setLineDash() {},
      getLineDash() {
        return [];
      },
      getTransform() {
        return {
          a: 1,
          b: 0,
          c: 0,
          d: 1,
          e: 0,
          f: 0,
          invertSelf() {
            return this;
          },
        };
      },
      mozCurrentTransform: [1, 0, 0, 1, 0, 0],
      mozCurrentTransformInverse: [1, 0, 0, 1, 0, 0],
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      strokeStyle: 'black',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      miterLimit: 10,
      lineDashOffset: 0,
      shadowBlur: 0,
      shadowColor: 'transparent',
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      font: '10px sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      direction: 'ltr',
      imageSmoothingEnabled: true,
    };
    return { canvas, context };
  }

  reset(canvasAndContext: any, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
    canvasAndContext.canvas.data = Buffer.alloc(width * height * 4);
  }

  destroy(canvasAndContext: any) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas.data = null;
  }
}

async function extractPDFLayers(inputPath: string, outputDir: string) {
  console.log('='.repeat(80));
  console.log('PDF LAYER EXTRACTION TOOL');
  console.log('='.repeat(80));
  console.log(`Input PDF: ${inputPath}`);
  console.log(`Output directory: ${outputDir}`);
  console.log('');

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`✓ Created output directory: ${outputDir}`);
  }

  // Read the PDF file
  const pdfBuffer = fs.readFileSync(inputPath);
  console.log(`✓ Loaded PDF file (${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log('');

  // Load PDF with pdf.js for layer inspection
  console.log('Loading PDF with PDF.js...');
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  console.log(`✓ PDF loaded successfully`);
  console.log(`  - Number of pages: ${pdfDoc.numPages}`);
  console.log('');

  // Get optional content (layers) information
  const optionalContentConfig = await pdfDoc.getOptionalContentConfig();
  console.log('Analyzing Optional Content (Layers)...');

  const layers: LayerInfo[] = [];

  try {
    const groups = optionalContentConfig.getGroups();
    console.log(`✓ Found ${Object.keys(groups).length} optional content groups`);

    for (const [id, group] of Object.entries(groups)) {
      const groupData = group as { name?: string };
      const layerInfo: LayerInfo = {
        id: id,
        name: groupData.name || `Layer ${id}`,
        visible: optionalContentConfig.isVisible(id),
      };
      layers.push(layerInfo);
      console.log(`  - Layer: "${layerInfo.name}" (ID: ${id}, Visible: ${layerInfo.visible})`);
    }
    console.log('');
  } catch (error) {
    console.log('⚠ No optional content groups found or error accessing them');
    console.log(`  Error: ${error}`);
    console.log('');
  }

  // Now render each layer separately
  console.log('='.repeat(80));
  console.log('RENDERING LAYERS');
  console.log('='.repeat(80));
  console.log('');

  const extractedLayers: ExtractedLayer[] = [];
  const scale = 2.0; // Higher quality rendering
  const canvasFactory = new NodeCanvasFactory();

  // Process first page only (for testing)
  const maxPages = Math.min(1, pdfDoc.numPages);
  console.log(`Processing ${maxPages} page(s) out of ${pdfDoc.numPages} (limited for performance)`);
  console.log('');

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    console.log(`Processing Page ${pageNum}/${maxPages}...`);
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    console.log(
      `  - Page dimensions: ${Math.floor(viewport.width)}x${Math.floor(viewport.height)} (scale: ${scale})`
    );

    if (layers.length > 0) {
      // Render each layer separately
      for (const layer of layers) {
        console.log(`  - Rendering layer: "${layer.name}"`);

        try {
          // Create a new optional content configuration with only this layer visible
          console.log(`    - Setting visibility: only "${layer.name}" visible`);

          // Hide all layers first
          for (const l of layers) {
            await optionalContentConfig.setVisibility(l.id, false);
          }

          // Show only current layer
          await optionalContentConfig.setVisibility(layer.id, true);

          // Create canvas
          const canvasAndContext = canvasFactory.create(
            Math.floor(viewport.width),
            Math.floor(viewport.height)
          );

          // Fill with white background
          canvasAndContext.context.fillStyle = 'white';
          canvasAndContext.context.fillRect(0, 0, viewport.width, viewport.height);

          // Render PDF page to canvas
          const renderContext = {
            canvasContext: canvasAndContext.context as any,
            viewport: viewport,
            optionalContentConfigPromise: Promise.resolve(optionalContentConfig),
          };

          console.log(`    - Starting render...`);
          await page.render(renderContext).promise;
          console.log(`    ✓ Rendered to canvas`);

          // Convert canvas data to PNG using sharp
          const imageBuffer = await sharp(canvasAndContext.canvas.data, {
            raw: {
              width: Math.floor(viewport.width),
              height: Math.floor(viewport.height),
              channels: 4,
            },
          })
            .png()
            .toBuffer();

          console.log(`    ✓ Converted to PNG (${(imageBuffer.length / 1024).toFixed(2)} KB)`);

          extractedLayers.push({
            name: layer.name,
            id: layer.id,
            imageBuffer,
            pageNumber: pageNum,
          });

          // Save individual layer image
          const layerFilename = `page${pageNum}_layer_${layer.name.replace(/[^a-z0-9]/gi, '_')}.png`;
          const layerPath = path.join(outputDir, layerFilename);
          fs.writeFileSync(layerPath, imageBuffer);
          console.log(`    ✓ Saved: ${layerFilename}`);

          // Cleanup
          canvasFactory.destroy(canvasAndContext);
        } catch (error) {
          console.log(`    ✗ Error rendering layer: ${error}`);
          console.error(error);
        }
      }

      // Reset all layers to visible
      for (const l of layers) {
        await optionalContentConfig.setVisibility(l.id, true);
      }

      // Also render "all layers" version
      console.log(`  - Rendering all layers combined`);
      try {
        const canvasAndContext = canvasFactory.create(
          Math.floor(viewport.width),
          Math.floor(viewport.height)
        );

        canvasAndContext.context.fillStyle = 'white';
        canvasAndContext.context.fillRect(0, 0, viewport.width, viewport.height);

        const renderContext = {
          canvasContext: canvasAndContext.context as any,
          viewport: viewport,
          optionalContentConfigPromise: Promise.resolve(optionalContentConfig),
        };

        await page.render(renderContext).promise;

        const imageBuffer = await sharp(canvasAndContext.canvas.data, {
          raw: {
            width: Math.floor(viewport.width),
            height: Math.floor(viewport.height),
            channels: 4,
          },
        })
          .png()
          .toBuffer();

        extractedLayers.push({
          name: 'All Layers',
          id: 'all',
          imageBuffer,
          pageNumber: pageNum,
        });

        const filename = `page${pageNum}_all_layers.png`;
        fs.writeFileSync(path.join(outputDir, filename), imageBuffer);
        console.log(`    ✓ Saved: ${filename}`);

        canvasFactory.destroy(canvasAndContext);
      } catch (error) {
        console.log(`    ✗ Error rendering all layers: ${error}`);
      }
    } else {
      // No layers found - render the full page
      console.log(`  - No layers detected, rendering full page`);

      const canvasAndContext = canvasFactory.create(
        Math.floor(viewport.width),
        Math.floor(viewport.height)
      );

      canvasAndContext.context.fillStyle = 'white';
      canvasAndContext.context.fillRect(0, 0, viewport.width, viewport.height);

      const renderContext = {
        canvasContext: canvasAndContext.context as any,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      const imageBuffer = await sharp(canvasAndContext.canvas.data, {
        raw: {
          width: Math.floor(viewport.width),
          height: Math.floor(viewport.height),
          channels: 4,
        },
      })
        .png()
        .toBuffer();

      extractedLayers.push({
        name: 'Full Page',
        id: 'full',
        imageBuffer,
        pageNumber: pageNum,
      });

      const filename = `page${pageNum}_full.png`;
      fs.writeFileSync(path.join(outputDir, filename), imageBuffer);
      console.log(`    ✓ Saved: ${filename}`);

      canvasFactory.destroy(canvasAndContext);
    }

    console.log('');
  }

  // Create a new PDF with layers as separate pages
  console.log('='.repeat(80));
  console.log('CREATING OUTPUT PDF');
  console.log('='.repeat(80));
  console.log('');

  const outputPdf = await PDFDocument.create();

  for (const layer of extractedLayers) {
    console.log(`Adding layer to PDF: "${layer.name}" (Page ${layer.pageNumber})`);

    // Embed the PNG image
    const pngImage = await outputPdf.embedPng(layer.imageBuffer);
    const page = outputPdf.addPage([pngImage.width, pngImage.height]);

    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pngImage.width,
      height: pngImage.height,
    });

    console.log(`  ✓ Added page (${pngImage.width}x${pngImage.height})`);
  }

  // Save the output PDF
  const outputPdfPath = path.join(outputDir, 'layers-separated.pdf');
  const pdfBytes = await outputPdf.save();
  fs.writeFileSync(outputPdfPath, pdfBytes);

  console.log('');
  console.log(`✓ Output PDF saved: ${outputPdfPath}`);
  console.log(`  - Total pages in output: ${extractedLayers.length}`);
  console.log(`  - File size: ${(pdfBytes.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log('');

  // Summary
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Input pages: ${pdfDoc.numPages}`);
  console.log(`Layers found: ${layers.length || 'None (rendered full pages instead)'}`);
  if (layers.length > 0) {
    console.log(`\nLayers:`);
    layers.forEach((l, i) => {
      console.log(`  ${i + 1}. "${l.name}" (ID: ${l.id})`);
    });
  }
  console.log(`\nOutput images: ${extractedLayers.length}`);
  console.log(`Output directory: ${outputDir}`);
  console.log('='.repeat(80));
}

// Main execution
const inputPdf = process.argv[2] || '/Users/will/code/service/test-layer.pdf';
const outputDir = process.argv[3] || '/Users/will/code/service/output-layers';

extractPDFLayers(inputPdf, outputDir)
  .then(() => {
    console.log('\n✓ Process completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n✗ Error:', error);
    console.error(error.stack);
    process.exit(1);
  });
