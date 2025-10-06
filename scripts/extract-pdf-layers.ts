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

// A more complete canvas implementation that actually tracks drawing operations
class NodeCanvasFactory {
  create(width: number, height: number) {
    console.log(`    - Creating canvas: ${width}x${height}`);

    const canvas = {
      width,
      height,
      data: Buffer.alloc(width * height * 4), // RGBA
    };

    // Initialize to white
    for (let i = 0; i < canvas.data.length; i += 4) {
      canvas.data[i] = 255;     // R
      canvas.data[i + 1] = 255; // G
      canvas.data[i + 2] = 255; // B
      canvas.data[i + 3] = 255; // A
    }

    let currentTransform = [1, 0, 0, 1, 0, 0]; // [a, b, c, d, e, f]
    const transformStack: number[][] = [];
    let currentFillStyle = '#000000';
    let currentStrokeStyle = '#000000';
    let currentLineWidth = 1;

    const context = {
      canvas,

      // Transform methods
      save() {
        transformStack.push([...currentTransform]);
      },
      restore() {
        if (transformStack.length > 0) {
          currentTransform = transformStack.pop()!;
        }
      },
      translate(x: number, y: number) {
        currentTransform[4] += currentTransform[0] * x + currentTransform[2] * y;
        currentTransform[5] += currentTransform[1] * x + currentTransform[3] * y;
      },
      scale(x: number, y: number) {
        currentTransform[0] *= x;
        currentTransform[1] *= x;
        currentTransform[2] *= y;
        currentTransform[3] *= y;
      },
      rotate(angle: number) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const [a, b, c, d] = currentTransform;
        currentTransform[0] = a * cos + c * sin;
        currentTransform[1] = b * cos + d * sin;
        currentTransform[2] = -a * sin + c * cos;
        currentTransform[3] = -b * sin + d * cos;
      },
      transform(a: number, b: number, c: number, d: number, e: number, f: number) {
        const [m11, m12, m21, m22, m31, m32] = currentTransform;
        currentTransform[0] = m11 * a + m21 * b;
        currentTransform[1] = m12 * a + m22 * b;
        currentTransform[2] = m11 * c + m21 * d;
        currentTransform[3] = m12 * c + m22 * d;
        currentTransform[4] = m11 * e + m21 * f + m31;
        currentTransform[5] = m12 * e + m22 * f + m32;
      },
      setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
        currentTransform = [a, b, c, d, e, f];
      },
      resetTransform() {
        currentTransform = [1, 0, 0, 1, 0, 0];
      },
      getTransform() {
        return {
          a: currentTransform[0],
          b: currentTransform[1],
          c: currentTransform[2],
          d: currentTransform[3],
          e: currentTransform[4],
          f: currentTransform[5],
          invertSelf() {
            const [a, b, c, d, e, f] = currentTransform;
            const det = a * d - b * c;
            if (det === 0) return this;
            const invDet = 1 / det;
            return {
              a: d * invDet,
              b: -b * invDet,
              c: -c * invDet,
              d: a * invDet,
              e: (c * f - d * e) * invDet,
              f: (b * e - a * f) * invDet,
            };
          },
        };
      },
      mozCurrentTransform: currentTransform,
      mozCurrentTransformInverse: currentTransform,

      // Drawing methods
      fillRect(x: number, y: number, w: number, h: number) {
        const color = this.parseColor(currentFillStyle);
        for (let i = Math.floor(y); i < Math.floor(y + h) && i < height; i++) {
          for (let j = Math.floor(x); j < Math.floor(x + w) && j < width; j++) {
            if (i >= 0 && j >= 0) {
              const idx = (i * width + j) * 4;
              canvas.data[idx] = color.r;
              canvas.data[idx + 1] = color.g;
              canvas.data[idx + 2] = color.b;
              canvas.data[idx + 3] = Math.floor(color.a * 255);
            }
          }
        }
      },

      strokeRect(x: number, y: number, w: number, h: number) {
        // Simple stroke implementation - just draw the outline
        const lw = Math.max(1, currentLineWidth);
        this.fillStyle = currentStrokeStyle;
        this.fillRect(x, y, w, lw); // top
        this.fillRect(x, y + h - lw, w, lw); // bottom
        this.fillRect(x, y, lw, h); // left
        this.fillRect(x + w - lw, y, lw, h); // right
      },

      clearRect(x: number, y: number, w: number, h: number) {
        for (let i = Math.floor(y); i < Math.floor(y + h) && i < height; i++) {
          for (let j = Math.floor(x); j < Math.floor(x + w) && j < width; j++) {
            if (i >= 0 && j >= 0) {
              const idx = (i * width + j) * 4;
              canvas.data[idx] = 255;
              canvas.data[idx + 1] = 255;
              canvas.data[idx + 2] = 255;
              canvas.data[idx + 3] = 255;
            }
          }
        }
      },

      // Path methods
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
      isPointInPath() { return false; },
      isPointInStroke() { return false; },

      // Image methods
      drawImage(image: any, ...args: number[]) {
        console.log(`      - drawImage called with ${args.length} args`);
        // This is where actual image drawing would happen
        // For now, we'll just note that an image was drawn
      },

      // ImageData methods
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
            const srcIdx = ((Math.floor(y) + i) * width + (Math.floor(x) + j)) * 4;
            const dstIdx = (i * w + j) * 4;
            if (srcIdx >= 0 && srcIdx < canvas.data.length - 3) {
              data[dstIdx] = canvas.data[srcIdx];
              data[dstIdx + 1] = canvas.data[srcIdx + 1];
              data[dstIdx + 2] = canvas.data[srcIdx + 2];
              data[dstIdx + 3] = canvas.data[srcIdx + 3];
            } else {
              data[dstIdx] = 255;
              data[dstIdx + 1] = 255;
              data[dstIdx + 2] = 255;
              data[dstIdx + 3] = 255;
            }
          }
        }
        return { width: w, height: h, data };
      },

      putImageData(imageData: any, dx: number, dy: number) {
        console.log(`      - putImageData called: ${imageData.width}x${imageData.height} at ${dx},${dy}`);
        const { width: imgWidth, height: imgHeight, data: imgData } = imageData;
        for (let i = 0; i < imgHeight; i++) {
          for (let j = 0; j < imgWidth; j++) {
            const srcIdx = (i * imgWidth + j) * 4;
            const dstIdx = ((Math.floor(dy) + i) * width + (Math.floor(dx) + j)) * 4;
            if (dstIdx >= 0 && dstIdx < canvas.data.length - 3) {
              canvas.data[dstIdx] = imgData[srcIdx];
              canvas.data[dstIdx + 1] = imgData[srcIdx + 1];
              canvas.data[dstIdx + 2] = imgData[srcIdx + 2];
              canvas.data[dstIdx + 3] = imgData[srcIdx + 3];
            }
          }
        }
      },

      // Text methods
      measureText() { return { width: 0 }; },
      fillText() {},
      strokeText() {},

      // Line methods
      setLineDash() {},
      getLineDash() { return []; },

      // Gradient methods
      createLinearGradient() {
        return { addColorStop() {} };
      },
      createRadialGradient() {
        return { addColorStop() {} };
      },
      createPattern() {
        return null;
      },

      // Helper to parse color
      parseColor(colorStr: string) {
        if (colorStr.startsWith('#')) {
          const hex = colorStr.slice(1);
          return {
            r: parseInt(hex.slice(0, 2), 16) || 0,
            g: parseInt(hex.slice(2, 4), 16) || 0,
            b: parseInt(hex.slice(4, 6), 16) || 0,
            a: 1,
          };
        } else if (colorStr.startsWith('rgb')) {
          const match = colorStr.match(/\d+/g);
          if (match) {
            return {
              r: parseInt(match[0]) || 0,
              g: parseInt(match[1]) || 0,
              b: parseInt(match[2]) || 0,
              a: match[3] ? parseFloat(match[3]) : 1,
            };
          }
        }
        return { r: 0, g: 0, b: 0, a: 1 };
      },

      // Properties
      get fillStyle() { return currentFillStyle; },
      set fillStyle(value: any) {
        currentFillStyle = typeof value === 'string' ? value : '#000000';
      },
      get strokeStyle() { return currentStrokeStyle; },
      set strokeStyle(value: any) {
        currentStrokeStyle = typeof value === 'string' ? value : '#000000';
      },
      get lineWidth() { return currentLineWidth; },
      set lineWidth(value: number) {
        currentLineWidth = value;
      },

      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
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
    // Fill with white
    for (let i = 0; i < canvasAndContext.canvas.data.length; i += 4) {
      canvasAndContext.canvas.data[i] = 255;
      canvasAndContext.canvas.data[i + 1] = 255;
      canvasAndContext.canvas.data[i + 2] = 255;
      canvasAndContext.canvas.data[i + 3] = 255;
    }
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
  console.log('NOTE: This script creates one image with all layers separated side-by-side');
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

  if (layers.length === 0) {
    console.log('No layers found in PDF. Exiting.');
    return;
  }

  // Render layers side-by-side in ONE image
  console.log('='.repeat(80));
  console.log('RENDERING LAYERS SIDE-BY-SIDE');
  console.log('='.repeat(80));
  console.log('');

  const scale = 1.5; // Adjust for quality vs size
  const canvasFactory = new NodeCanvasFactory();

  // Process first page only
  const pageNum = 1;
  console.log(`Processing Page ${pageNum}...`);
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const pageWidth = Math.floor(viewport.width);
  const pageHeight = Math.floor(viewport.height);
  console.log(`  - Page dimensions: ${pageWidth}x${pageHeight} (scale: ${scale})`);
  console.log(`  - Will create ${layers.length + 1} renders (each layer + all combined)`);
  console.log('');

  // Create array to hold all rendered layer buffers
  const layerImages: Buffer[] = [];

  // Render each layer separately
  for (const layer of layers) {
    console.log(`  - Rendering layer: "${layer.name}"`);
    console.log(`    - Setting visibility: only "${layer.name}" visible`);

    try {
      // Hide all layers first
      for (const l of layers) {
        await optionalContentConfig.setVisibility(l.id, false);
      }

      // Show only current layer
      await optionalContentConfig.setVisibility(layer.id, true);

      // Create canvas
      const canvasAndContext = canvasFactory.create(pageWidth, pageHeight);

      // Render PDF page to canvas
      const renderContext = {
        canvasContext: canvasAndContext.context as any,
        viewport: viewport,
        optionalContentConfigPromise: Promise.resolve(optionalContentConfig),
      };

      console.log(`    - Rendering...`);
      await page.render(renderContext).promise;
      console.log(`    ✓ Rendered to canvas`);

      // Convert to PNG buffer
      const imageBuffer = await sharp(canvasAndContext.canvas.data, {
        raw: {
          width: pageWidth,
          height: pageHeight,
          channels: 4,
        },
      })
        .png()
        .toBuffer();

      console.log(`    ✓ Converted to PNG (${(imageBuffer.length / 1024).toFixed(2)} KB)`);
      layerImages.push(imageBuffer);

      canvasFactory.destroy(canvasAndContext);
    } catch (error) {
      console.log(`    ✗ Error rendering layer: ${error}`);
      console.error(error);
    }
  }

  // Reset all layers to visible and render combined
  for (const l of layers) {
    await optionalContentConfig.setVisibility(l.id, true);
  }

  console.log(`  - Rendering all layers combined`);
  try {
    const canvasAndContext = canvasFactory.create(pageWidth, pageHeight);

    const renderContext = {
      canvasContext: canvasAndContext.context as any,
      viewport: viewport,
      optionalContentConfigPromise: Promise.resolve(optionalContentConfig),
    };

    await page.render(renderContext).promise;

    const imageBuffer = await sharp(canvasAndContext.canvas.data, {
      raw: {
        width: pageWidth,
        height: pageHeight,
        channels: 4,
      },
    })
      .png()
      .toBuffer();

    console.log(`    ✓ Rendered all layers combined`);
    layerImages.push(imageBuffer);

    canvasFactory.destroy(canvasAndContext);
  } catch (error) {
    console.log(`    ✗ Error rendering all layers: ${error}`);
  }

  // Composite all images side-by-side
  console.log('');
  console.log('='.repeat(80));
  console.log('COMPOSITING SIDE-BY-SIDE IMAGE');
  console.log('='.repeat(80));
  console.log('');

  const totalWidth = pageWidth * layerImages.length;
  console.log(`Creating composite image: ${totalWidth}x${pageHeight}`);

  // Create composite with all layers side by side
  const compositeOps = layerImages.map((img, idx) => ({
    input: img,
    top: 0,
    left: pageWidth * idx,
  }));

  const compositeImage = await sharp({
    create: {
      width: totalWidth,
      height: pageHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(compositeOps)
    .png()
    .toBuffer();

  const compositePath = path.join(outputDir, 'layers-side-by-side.png');
  fs.writeFileSync(compositePath, compositeImage);
  console.log(`✓ Saved composite image: ${compositePath}`);
  console.log(`  - Dimensions: ${totalWidth}x${pageHeight}`);
  console.log(`  - Size: ${(compositeImage.length / 1024).toFixed(2)} KB`);
  console.log('');

  // Summary
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Layers found: ${layers.length}`);
  console.log(`\nLayers:`);
  layers.forEach((l, i) => {
    console.log(`  ${i + 1}. "${l.name}" (ID: ${l.id})`);
  });
  console.log(`\nOutput: ${compositePath}`);
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
