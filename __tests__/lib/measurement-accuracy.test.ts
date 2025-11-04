import { describe, it, expect, beforeAll } from 'vitest';
import {
  parseScaleNotation,
  calculatePixelsPerInchKnownLength,
  pixelsToInchesPageSize,
  pixelsToInchesKnownLength,
} from '@/lib/calibration-calculations';
import {
  generateMockPDF,
  TEST_PDF_SPECS,
  type MockPDFSpec,
} from '../fixtures/generate-mock-pdfs';
import { PDFDocument } from 'pdf-lib';

/**
 * End-to-End Accuracy Tests
 * 
 * Tests that verify the complete accuracy of calibration and measurement
 * calculations using programmatically generated PDFs with known dimensions.
 * 
 * These tests ensure that measurements are accurate within ±0.1 inches.
 */

describe('Measurement Accuracy with Mock PDFs', () => {
  // Store generated PDFs in memory for tests
  const mockPDFs: Map<string, { bytes: Uint8Array; spec: MockPDFSpec }> = new Map();

  beforeAll(async () => {
    // Generate all test PDFs before running tests
    for (const spec of TEST_PDF_SPECS) {
      const bytes = await generateMockPDF(spec);
      mockPDFs.set(spec.name, { bytes, spec });
    }
  });

  describe('Page Size Method Accuracy', () => {
    it('should accurately measure 24x36 sheet at 1/8" scale', async () => {
      const pdfData = mockPDFs.get('24x36 Arch D - 1/8" Scale');
      if (!pdfData) throw new Error('PDF not found');

      const { spec } = pdfData;
      
      // Load PDF to get actual dimensions
      const pdfDoc = await PDFDocument.load(pdfData.bytes);
      const page = pdfDoc.getPage(0);
      const { width: pdfWidthPoints, height: pdfHeightPoints } = page.getSize();

      // Verify PDF dimensions match specification
      expect(pdfWidthPoints).toBeCloseTo(spec.widthInches * 72, 1);
      expect(pdfHeightPoints).toBeCloseTo(spec.heightInches * 72, 1);

      // Simulate calibration with Page Size Method
      const scaleNotation = spec.scale;
      const printWidthInches = spec.widthInches;

      // Test each reference line
      for (const refLine of spec.referenceLines) {
        // Convert reference line coordinates from inches to PDF points
        const startXPoints = refLine.startX * 72;
        const startYPoints = refLine.startY * 72;
        const endXPoints = refLine.endX * 72;
        const endYPoints = refLine.endY * 72;

        // Calculate pixel distance (in PDF coordinate space)
        const dx = endXPoints - startXPoints;
        const dy = endYPoints - startYPoints;
        const pixelsDistance = Math.sqrt(dx * dx + dy * dy);

        // Convert to real-world inches using Page Size Method
        const calculatedInches = pixelsToInchesPageSize(
          pixelsDistance,
          scaleNotation,
          pdfWidthPoints, // CSS width matches PDF width at 1x scale
          printWidthInches
        );

        // Verify accuracy within ±0.1 inches
        expect(calculatedInches).not.toBeNull();
        expect(calculatedInches!).toBeCloseTo(refLine.lengthInches, 1);

        // eslint-disable-next-line no-console
        // eslint-disable-next-line no-console
        // eslint-disable-next-line no-console
      console.log(`✓ ${spec.name} - ${refLine.label}: Expected ${refLine.lengthInches}", Got ${calculatedInches!.toFixed(2)}"`);
      }
    });

    it('should accurately measure 11x17 Tabloid at 1/4" scale', async () => {
      const pdfData = mockPDFs.get('11x17 Tabloid - 1/4" Scale');
      if (!pdfData) throw new Error('PDF not found');

      const { spec } = pdfData;
      const pdfDoc = await PDFDocument.load(pdfData.bytes);
      const page = pdfDoc.getPage(0);
      const { width: pdfWidthPoints } = page.getSize();

      const scaleNotation = spec.scale;
      const printWidthInches = spec.widthInches;

      for (const refLine of spec.referenceLines) {
        const startXPoints = refLine.startX * 72;
        const startYPoints = refLine.startY * 72;
        const endXPoints = refLine.endX * 72;
        const endYPoints = refLine.endY * 72;

        const dx = endXPoints - startXPoints;
        const dy = endYPoints - startYPoints;
        const pixelsDistance = Math.sqrt(dx * dx + dy * dy);

        const calculatedInches = pixelsToInchesPageSize(
          pixelsDistance,
          scaleNotation,
          pdfWidthPoints,
          printWidthInches
        );

        expect(calculatedInches).not.toBeNull();
        expect(calculatedInches!).toBeCloseTo(refLine.lengthInches, 1);

        // eslint-disable-next-line no-console
        // eslint-disable-next-line no-console
      console.log(`✓ ${spec.name} - ${refLine.label}: Expected ${refLine.lengthInches}", Got ${calculatedInches!.toFixed(2)}"`);
      }
    });

    it('should accurately measure Letter size at 1:1 scale', async () => {
      const pdfData = mockPDFs.get('Letter - 1" Ruler');
      if (!pdfData) throw new Error('PDF not found');

      const { spec } = pdfData;
      const pdfDoc = await PDFDocument.load(pdfData.bytes);
      const page = pdfDoc.getPage(0);
      const { width: _pdfWidthPoints } = page.getSize();

      // At 1:1 scale (actual size), 1 inch on paper = 1 inch real
      // This is effectively no scaling
      const _printWidthInches = spec.widthInches;

      for (const refLine of spec.referenceLines) {
        const startXPoints = refLine.startX * 72;
        const startYPoints = refLine.startY * 72;
        const endXPoints = refLine.endX * 72;
        const endYPoints = refLine.endY * 72;

        const dx = endXPoints - startXPoints;
        const dy = endYPoints - startYPoints;
        const pixelsDistance = Math.sqrt(dx * dx + dy * dy);

        // For 1:1 scale, we expect pixel distance to directly equal real distance
        // At 72 DPI, 72 pixels = 1 inch
        const expectedPixels = refLine.lengthInches * 72;
        expect(pixelsDistance).toBeCloseTo(expectedPixels, 1);

        // eslint-disable-next-line no-console
        // eslint-disable-next-line no-console
      console.log(`✓ ${spec.name} - ${refLine.label}: ${refLine.lengthInches}" = ${pixelsDistance.toFixed(1)} pixels (expected ${expectedPixels})`);
      }
    });
  });

  describe('Known Length Method Accuracy', () => {
    it('should accurately calibrate using known length', async () => {
      const pdfData = mockPDFs.get('24x36 Arch D - 1/8" Scale');
      if (!pdfData) throw new Error('PDF not found');

      const { spec } = pdfData;

      // Use first reference line as calibration line
      const calibrationLine = spec.referenceLines[0];

      const startXPoints = calibrationLine.startX * 72;
      const startYPoints = calibrationLine.startY * 72;
      const endXPoints = calibrationLine.endX * 72;
      const endYPoints = calibrationLine.endY * 72;

      // Calculate pixels per inch from calibration line
      const pixelsPerInch = calculatePixelsPerInchKnownLength(
        { x: startXPoints, y: startYPoints },
        { x: endXPoints, y: endYPoints },
        calibrationLine.lengthInches
      );

      expect(pixelsPerInch).not.toBeNull();

      // Now test other reference lines using this calibration
      for (let i = 1; i < spec.referenceLines.length; i++) {
        const testLine = spec.referenceLines[i];

        const testStartXPoints = testLine.startX * 72;
        const testStartYPoints = testLine.startY * 72;
        const testEndXPoints = testLine.endX * 72;
        const testEndYPoints = testLine.endY * 72;

        const dx = testEndXPoints - testStartXPoints;
        const dy = testEndYPoints - testStartYPoints;
        const pixelsDistance = Math.sqrt(dx * dx + dy * dy);

        const calculatedInches = pixelsToInchesKnownLength(
          pixelsDistance,
          pixelsPerInch!
        );

        expect(calculatedInches).not.toBeNull();
        expect(calculatedInches!).toBeCloseTo(testLine.lengthInches, 1);

        // eslint-disable-next-line no-console
        // eslint-disable-next-line no-console
      console.log(`✓ Known Length Method - ${testLine.label}: Expected ${testLine.lengthInches}", Got ${calculatedInches!.toFixed(2)}"`);
      }
    });

    it('should handle diagonal calibration lines', async () => {
      const pdfData = mockPDFs.get('24x36 Portrait');
      if (!pdfData) throw new Error('PDF not found');

      const { spec } = pdfData;

      // Use diagonal reference line as calibration
      const diagonalLine = spec.referenceLines[0];

      const startXPoints = diagonalLine.startX * 72;
      const startYPoints = diagonalLine.startY * 72;
      const endXPoints = diagonalLine.endX * 72;
      const endYPoints = diagonalLine.endY * 72;

      const pixelsPerInch = calculatePixelsPerInchKnownLength(
        { x: startXPoints, y: startYPoints },
        { x: endXPoints, y: endYPoints },
        diagonalLine.lengthInches
      );

      expect(pixelsPerInch).not.toBeNull();

      // Verify the calibration is consistent
      const dx = endXPoints - startXPoints;
      const dy = endYPoints - startYPoints;
      const actualPixels = Math.sqrt(dx * dx + dy * dy);
      const recalculatedInches = actualPixels / pixelsPerInch!;

      expect(recalculatedInches).toBeCloseTo(diagonalLine.lengthInches, 1);

      // eslint-disable-next-line no-console
      console.log(`✓ Diagonal calibration: ${diagonalLine.lengthInches}" at ${pixelsPerInch!.toFixed(2)} pixels/inch`);
    });
  });

  describe('Scale Parsing Accuracy', () => {
    it('should correctly parse all common architectural scales', async () => {
      const scales = [
        { notation: '1/8"=1\'-0"', expectedRatio: 0.125 / 12 },
        { notation: '1/4"=1\'-0"', expectedRatio: 0.25 / 12 },
        { notation: '3/16"=1\'-0"', expectedRatio: 0.1875 / 12 },
        { notation: '1/2"=1\'-0"', expectedRatio: 0.5 / 12 },
        { notation: '3/4"=1\'-0"', expectedRatio: 0.75 / 12 },
        { notation: '1"=1\'-0"', expectedRatio: 1 / 12 },
      ];

      for (const scale of scales) {
        const ratio = parseScaleNotation(scale.notation);
        expect(ratio).not.toBeNull();
        expect(ratio!).toBeCloseTo(scale.expectedRatio, 8); // High precision

        // eslint-disable-next-line no-console
        // eslint-disable-next-line no-console
      console.log(`✓ Scale ${scale.notation}: Ratio = ${ratio!.toFixed(8)}`);
      }
    });
  });

  describe('Orientation Handling', () => {
    it('should handle landscape and portrait orientations correctly', async () => {
      // Test with both orientations using the same dimensions
      const landscapeData = mockPDFs.get('24x36 Arch D - 1/8" Scale');
      const portraitData = mockPDFs.get('24x36 Portrait');

      if (!landscapeData || !portraitData) throw new Error('PDFs not found');

      // Both should have the same accuracy regardless of orientation
      for (const pdfData of [landscapeData, portraitData]) {
        const { spec } = pdfData;
        const pdfDoc = await PDFDocument.load(pdfData.bytes);
        const page = pdfDoc.getPage(0);
        const { width: pdfWidthPoints } = page.getSize();

        const scaleNotation = spec.scale;
        const printWidthInches = spec.widthInches;

        // Test first reference line
        const refLine = spec.referenceLines[0];
        const startXPoints = refLine.startX * 72;
        const startYPoints = refLine.startY * 72;
        const endXPoints = refLine.endX * 72;
        const endYPoints = refLine.endY * 72;

        const dx = endXPoints - startXPoints;
        const dy = endYPoints - startYPoints;
        const pixelsDistance = Math.sqrt(dx * dx + dy * dy);

        const calculatedInches = pixelsToInchesPageSize(
          pixelsDistance,
          scaleNotation,
          pdfWidthPoints,
          printWidthInches
        );

        expect(calculatedInches).not.toBeNull();
        expect(calculatedInches!).toBeCloseTo(refLine.lengthInches, 1);

        // eslint-disable-next-line no-console
        // eslint-disable-next-line no-console
      console.log(`✓ ${spec.name}: ${refLine.lengthInches}" measured accurately`);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle small sheet sizes accurately', async () => {
      const pdfData = mockPDFs.get('Small 6x9');
      if (!pdfData) throw new Error('PDF not found');

      const { spec } = pdfData;
      const pdfDoc = await PDFDocument.load(pdfData.bytes);
      const page = pdfDoc.getPage(0);
      const { width: pdfWidthPoints } = page.getSize();

      const scaleNotation = spec.scale;
      const printWidthInches = spec.widthInches;

      for (const refLine of spec.referenceLines) {
        const startXPoints = refLine.startX * 72;
        const startYPoints = refLine.startY * 72;
        const endXPoints = refLine.endX * 72;
        const endYPoints = refLine.endY * 72;

        const dx = endXPoints - startXPoints;
        const dy = endYPoints - startYPoints;
        const pixelsDistance = Math.sqrt(dx * dx + dy * dy);

        const calculatedInches = pixelsToInchesPageSize(
          pixelsDistance,
          scaleNotation,
          pdfWidthPoints,
          printWidthInches
        );

        expect(calculatedInches).not.toBeNull();
        expect(calculatedInches!).toBeCloseTo(refLine.lengthInches, 1);

        // eslint-disable-next-line no-console
        // eslint-disable-next-line no-console
      console.log(`✓ Small sheet - ${refLine.label}: Expected ${refLine.lengthInches}", Got ${calculatedInches!.toFixed(2)}"`);
      }
    });

    it('should maintain precision across different scales', async () => {
      const scales = ['1/8"', '1/4"', '1/2"'];
      const testPixelDistance = 144; // 2 inches at 72 ppi

      for (const scale of scales) {
        const notation = `${scale}=1'-0"`;
        const result = pixelsToInchesPageSize(
          testPixelDistance,
          notation,
          1728, // 24" PDF
          24    // 24" print
        );

        expect(result).not.toBeNull();
        expect(result).toBeGreaterThan(0);

        // eslint-disable-next-line no-console
        // eslint-disable-next-line no-console
      console.log(`✓ ${notation}: ${testPixelDistance} pixels = ${result!.toFixed(2)}"`);
      }
    });

    it('should handle very small measurements', async () => {
      // Test measuring something less than 1 inch
      const pixelsDistance = 36; // 0.5 inches at 72 ppi
      const pixelsPerInch = 72;

      const result = pixelsToInchesKnownLength(pixelsDistance, pixelsPerInch);

      expect(result).toBeCloseTo(0.5, 2);
    });

    it('should handle very large measurements', async () => {
      // Test measuring something over 100 feet
      const realInches = 1200; // 100 feet
      const pixelsPerInch = 6; // Low resolution
      const pixelsDistance = realInches * pixelsPerInch;

      const result = pixelsToInchesKnownLength(pixelsDistance, pixelsPerInch);

      expect(result).toBeCloseTo(1200, 1);
    });
  });

  describe('Consistency Tests', () => {
    it('should get same result with both calibration methods', async () => {
      const pdfData = mockPDFs.get('24x36 Arch D - 1/8" Scale');
      if (!pdfData) throw new Error('PDF not found');

      const { spec } = pdfData;
      const pdfDoc = await PDFDocument.load(pdfData.bytes);
      const page = pdfDoc.getPage(0);
      const { width: pdfWidthPoints } = page.getSize();

      // Test second reference line (not used for calibration)
      const testLine = spec.referenceLines[1];

      // Method 1: Page Size
      const scaleNotation = spec.scale;
      const printWidthInches = spec.widthInches;

      const startXPoints = testLine.startX * 72;
      const startYPoints = testLine.startY * 72;
      const endXPoints = testLine.endX * 72;
      const endYPoints = testLine.endY * 72;

      const dx = endXPoints - startXPoints;
      const dy = endYPoints - startYPoints;
      const pixelsDistance = Math.sqrt(dx * dx + dy * dy);

      const resultPageSize = pixelsToInchesPageSize(
        pixelsDistance,
        scaleNotation,
        pdfWidthPoints,
        printWidthInches
      );

      // Method 2: Known Length (using first line as calibration)
      const calibrationLine = spec.referenceLines[0];
      const calStartXPoints = calibrationLine.startX * 72;
      const calStartYPoints = calibrationLine.startY * 72;
      const calEndXPoints = calibrationLine.endX * 72;
      const calEndYPoints = calibrationLine.endY * 72;

      const pixelsPerInch = calculatePixelsPerInchKnownLength(
        { x: calStartXPoints, y: calStartYPoints },
        { x: calEndXPoints, y: calEndYPoints },
        calibrationLine.lengthInches
      );

      const resultKnownLength = pixelsToInchesKnownLength(
        pixelsDistance,
        pixelsPerInch!
      );

      // Both methods should give the same result within tolerance
      expect(resultPageSize).not.toBeNull();
      expect(resultKnownLength).not.toBeNull();
      expect(resultPageSize!).toBeCloseTo(resultKnownLength!, 1);
      expect(resultPageSize!).toBeCloseTo(testLine.lengthInches, 1);

      // eslint-disable-next-line no-console
      console.log(`✓ Both methods agree: Page Size = ${resultPageSize!.toFixed(2)}", Known Length = ${resultKnownLength!.toFixed(2)}", Expected = ${testLine.lengthInches}"`);
    });
  });
});

