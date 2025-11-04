/**
 * Mock PDF Generator for Testing Calibration and Measurements
 * 
 * Generates test PDFs with known dimensions, grid patterns, and reference lines
 * for verifying calibration accuracy.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

export interface MockPDFSpec {
  name: string;
  widthInches: number;
  heightInches: number;
  scale: string; // e.g., "1/8\"=1'-0\""
  referenceLines: Array<{
    label: string;
    startX: number; // inches from left
    startY: number; // inches from bottom
    endX: number; // inches from left
    endY: number; // inches from bottom
    lengthInches: number; // real-world length in inches
  }>;
  includeGrid?: boolean;
  gridSpacingInches?: number;
}

/**
 * Generate a mock PDF with known dimensions and reference measurements
 */
export async function generateMockPDF(spec: MockPDFSpec): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  
  // PDF units are in points (72 points = 1 inch)
  const widthPoints = spec.widthInches * 72;
  const heightPoints = spec.heightInches * 72;
  
  const page = pdfDoc.addPage([widthPoints, heightPoints]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Draw border
  page.drawRectangle({
    x: 10,
    y: 10,
    width: widthPoints - 20,
    height: heightPoints - 20,
    borderColor: rgb(0, 0, 0),
    borderWidth: 2,
  });
  
  // Draw title block
  const titleText = `Test PDF: ${spec.name}`;
  const titleSize = 16;
  page.drawText(titleText, {
    x: 30,
    y: heightPoints - 40,
    size: titleSize,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  
  // Draw dimensions info
  const infoText = [
    `Size: ${spec.widthInches}" × ${spec.heightInches}"`,
    `Scale: ${spec.scale}`,
    `Generated for calibration testing`,
  ];
  
  infoText.forEach((text, i) => {
    page.drawText(text, {
      x: 30,
      y: heightPoints - 65 - (i * 15),
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
  });
  
  // Draw grid if requested
  if (spec.includeGrid) {
    const gridSpacing = (spec.gridSpacingInches || 1) * 72; // Default 1 inch
    
    // Vertical lines
    for (let x = gridSpacing; x < widthPoints; x += gridSpacing) {
      page.drawLine({
        start: { x, y: 10 },
        end: { x, y: heightPoints - 10 },
        color: rgb(0.8, 0.8, 0.8),
        thickness: 0.5,
      });
    }
    
    // Horizontal lines
    for (let y = gridSpacing; y < heightPoints; y += gridSpacing) {
      page.drawLine({
        start: { x: 10, y },
        end: { x: widthPoints - 10, y },
        color: rgb(0.8, 0.8, 0.8),
        thickness: 0.5,
      });
    }
  }
  
  // Draw reference lines with labels
  spec.referenceLines.forEach((line) => {
    const startXPoints = line.startX * 72;
    const startYPoints = line.startY * 72;
    const endXPoints = line.endX * 72;
    const endYPoints = line.endY * 72;
    
    // Draw the line
    page.drawLine({
      start: { x: startXPoints, y: startYPoints },
      end: { x: endXPoints, y: endYPoints },
      color: rgb(1, 0, 0), // Red for reference lines
      thickness: 2,
    });
    
    // Draw arrow heads
    const angle = Math.atan2(endYPoints - startYPoints, endXPoints - startXPoints);
    const arrowSize = 10;
    
    // Start arrow
    page.drawLine({
      start: { x: startXPoints, y: startYPoints },
      end: {
        x: startXPoints + arrowSize * Math.cos(angle + Math.PI / 6),
        y: startYPoints + arrowSize * Math.sin(angle + Math.PI / 6),
      },
      color: rgb(1, 0, 0),
      thickness: 2,
    });
    page.drawLine({
      start: { x: startXPoints, y: startYPoints },
      end: {
        x: startXPoints + arrowSize * Math.cos(angle - Math.PI / 6),
        y: startYPoints + arrowSize * Math.sin(angle - Math.PI / 6),
      },
      color: rgb(1, 0, 0),
      thickness: 2,
    });
    
    // End arrow
    page.drawLine({
      start: { x: endXPoints, y: endYPoints },
      end: {
        x: endXPoints - arrowSize * Math.cos(angle + Math.PI / 6),
        y: endYPoints - arrowSize * Math.sin(angle + Math.PI / 6),
      },
      color: rgb(1, 0, 0),
      thickness: 2,
    });
    page.drawLine({
      start: { x: endXPoints, y: endYPoints },
      end: {
        x: endXPoints - arrowSize * Math.cos(angle - Math.PI / 6),
        y: endYPoints - arrowSize * Math.sin(angle - Math.PI / 6),
      },
      color: rgb(1, 0, 0),
      thickness: 2,
    });
    
    // Draw label
    const midX = (startXPoints + endXPoints) / 2;
    const midY = (startYPoints + endYPoints) / 2;
    
    const feet = Math.floor(line.lengthInches / 12);
    const inches = line.lengthInches % 12;
    const labelText = `${line.label}: ${feet}'-${inches.toFixed(1)}"`;
    
    // Draw label background
    const labelWidth = font.widthOfTextAtSize(labelText, 10);
    page.drawRectangle({
      x: midX - labelWidth / 2 - 3,
      y: midY - 8,
      width: labelWidth + 6,
      height: 16,
      color: rgb(1, 1, 1),
      borderColor: rgb(1, 0, 0),
      borderWidth: 1,
    });
    
    page.drawText(labelText, {
      x: midX - labelWidth / 2,
      y: midY - 3,
      size: 10,
      font: boldFont,
      color: rgb(1, 0, 0),
    });
  });
  
  return pdfDoc.save();
}

/**
 * Predefined test PDF specifications
 */
export const TEST_PDF_SPECS: MockPDFSpec[] = [
  {
    name: '24x36 Arch D - 1/8" Scale',
    widthInches: 24,
    heightInches: 36,
    scale: '1/8"=1\'-0"',
    includeGrid: true,
    gridSpacingInches: 2,
    referenceLines: [
      {
        label: 'Line 1',
        startX: 2,
        startY: 30,
        endX: 22,
        endY: 30,
        lengthInches: 1920, // 20" on paper at 1/8" scale = 160 feet real
      },
      {
        label: 'Line 2',
        startX: 12,
        startY: 4,
        endX: 12,
        endY: 16,
        lengthInches: 1152, // 12" on paper at 1/8" scale = 96 feet real
      },
    ],
  },
  {
    name: '11x17 Tabloid - 1/4" Scale',
    widthInches: 11,
    heightInches: 17,
    scale: '1/4"=1\'-0"',
    includeGrid: true,
    gridSpacingInches: 1,
    referenceLines: [
      {
        label: 'H-Line',
        startX: 1,
        startY: 14,
        endX: 10,
        endY: 14,
        lengthInches: 432, // 9" on paper at 1/4" scale = 36 feet real
      },
      {
        label: 'V-Line',
        startX: 5.5,
        startY: 2,
        endX: 5.5,
        endY: 8,
        lengthInches: 288, // 6" on paper at 1/4" scale = 24 feet real
      },
    ],
  },
  {
    name: 'Letter - 1" Ruler',
    widthInches: 8.5,
    heightInches: 11,
    scale: '1"=1" (Actual Size)',
    includeGrid: false,
    referenceLines: [
      // 1-inch ruler markings
      {
        label: '1"',
        startX: 1,
        startY: 9,
        endX: 2,
        endY: 9,
        lengthInches: 1,
      },
      {
        label: '2"',
        startX: 1,
        startY: 8.5,
        endX: 3,
        endY: 8.5,
        lengthInches: 2,
      },
      {
        label: '5"',
        startX: 1,
        startY: 8,
        endX: 6,
        endY: 8,
        lengthInches: 5,
      },
    ],
  },
  {
    name: '24x36 Portrait',
    widthInches: 24,
    heightInches: 36,
    scale: '1/8"=1\'-0"',
    includeGrid: true,
    gridSpacingInches: 3,
    referenceLines: [
      {
        label: 'Diagonal',
        startX: 4,
        startY: 4,
        endX: 20,
        endY: 28,
        lengthInches: 2769.06, // sqrt(16^2 + 24^2) = 28.8444" on paper at 1/8" scale = 230.755 feet real
      },
    ],
  },
  {
    name: 'Small 6x9',
    widthInches: 6,
    heightInches: 9,
    scale: '1/2"=1\'-0"',
    includeGrid: true,
    gridSpacingInches: 0.5,
    referenceLines: [
      {
        label: 'Test',
        startX: 1,
        startY: 6,
        endX: 5,
        endY: 6,
        lengthInches: 96, // 4" on paper at 1/2" scale = 8 feet real
      },
    ],
  },
];

/**
 * Generate all test PDFs and save to fixtures directory
 */
export async function generateAllTestPDFs(outputDir: string): Promise<void> {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // eslint-disable-next-line no-console
  console.log(`Generating ${TEST_PDF_SPECS.length} test PDFs...`);
  
  for (const spec of TEST_PDF_SPECS) {
    const pdfBytes = await generateMockPDF(spec);
    const filename = `${spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`;
    const filepath = path.join(outputDir, filename);
    
    fs.writeFileSync(filepath, pdfBytes);
    // eslint-disable-next-line no-console
    console.log(`✓ Generated: ${filename} (${spec.widthInches}x${spec.heightInches})`);
  }
  
  // eslint-disable-next-line no-console
  console.log(`\nAll test PDFs generated in: ${outputDir}`);
}

/**
 * Get specification for a test PDF by name
 */
export function getTestPDFSpec(name: string): MockPDFSpec | undefined {
  return TEST_PDF_SPECS.find(spec => 
    spec.name.toLowerCase().includes(name.toLowerCase())
  );
}

// CLI usage: node generate-mock-pdfs.js
if (require.main === module) {
  const outputDir = path.join(__dirname, 'mock-pdfs');
  generateAllTestPDFs(outputDir)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Error generating PDFs:', err);
      process.exit(1);
    });
}

