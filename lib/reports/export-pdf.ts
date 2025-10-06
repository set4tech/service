'use client';

import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import { ViolationMarker } from './get-violations';

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

interface ExportOptions {
  pdfUrl: string;
  violations: ViolationMarker[];
  projectName: string;
  assessmentId: string;
}

const SIDEBAR_WIDTH = 200; // Width of sidebar in mm
const PAGE_MARGIN = 10; // Margin in mm
const VIOLATION_ITEM_HEIGHT = 25; // Height per violation in sidebar

/**
 * Exports a compliance report PDF with violations marked up
 */
export async function exportCompliancePDF(options: ExportOptions): Promise<void> {
  const { pdfUrl, violations, projectName } = options;

  console.log('[PDF Export] Starting export with', violations.length, 'violations');

  // Get presigned URL if needed
  let presignedUrl = pdfUrl;
  if (pdfUrl.startsWith('projects/')) {
    console.log('[PDF Export] Fetching presigned URL for S3 key');
    const presignRes = await fetch('/api/pdf/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfUrl }),
    });
    if (!presignRes.ok) {
      throw new Error('Failed to get presigned URL');
    }
    const { url } = await presignRes.json();
    presignedUrl = url;
  }

  // Load source PDF
  const loadingTask = pdfjsLib.getDocument(presignedUrl);
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  console.log('[PDF Export] Loaded PDF with', numPages, 'pages');

  // Group violations by page
  const violationsByPage = new Map<number, ViolationMarker[]>();
  violations.forEach(v => {
    if (!violationsByPage.has(v.pageNumber)) {
      violationsByPage.set(v.pageNumber, []);
    }
    violationsByPage.get(v.pageNumber)!.push(v);
  });

  // Create output PDF (landscape for more space)
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a3', // A3 for larger pages
  });

  let isFirstPage = true;

  // Process each page that has violations
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const pageViolations = violationsByPage.get(pageNum) || [];
    if (pageViolations.length === 0) {
      continue; // Skip pages without violations
    }

    console.log(
      '[PDF Export] Processing page',
      pageNum,
      'with',
      pageViolations.length,
      'violations'
    );

    if (!isFirstPage) {
      pdf.addPage();
    }
    isFirstPage = false;

    // Get PDF page
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // High resolution

    // Create canvas for rendering
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Render PDF page to canvas
    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;

    // Calculate layout dimensions (in mm)
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const drawingWidth = pageWidth - SIDEBAR_WIDTH - PAGE_MARGIN * 3;
    const drawingHeight = pageHeight - PAGE_MARGIN * 2;

    // Draw sidebar background
    pdf.setFillColor(250, 250, 250);
    pdf.rect(PAGE_MARGIN, PAGE_MARGIN, SIDEBAR_WIDTH, drawingHeight, 'F');

    // Draw sidebar border
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.5);
    pdf.rect(PAGE_MARGIN, PAGE_MARGIN, SIDEBAR_WIDTH, drawingHeight, 'S');

    // Add sidebar title
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Violations', PAGE_MARGIN + 5, PAGE_MARGIN + 8);

    // Add page number in sidebar
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 100, 100);
    pdf.text(`Page ${pageNum}`, PAGE_MARGIN + 5, PAGE_MARGIN + 14);

    // Draw violations in sidebar
    let yOffset = PAGE_MARGIN + 20;
    pageViolations.forEach(violation => {
      if (yOffset + VIOLATION_ITEM_HEIGHT > pageHeight - PAGE_MARGIN) {
        return; // Skip if we run out of space
      }

      // Violation number/marker
      const markerColor = getSeverityColor(violation.severity);
      pdf.setFillColor(markerColor.r, markerColor.g, markerColor.b);
      pdf.circle(PAGE_MARGIN + 10, yOffset + 3, 3, 'F');

      // Code reference
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      const codeText = pdf.splitTextToSize(violation.codeSectionNumber, SIDEBAR_WIDTH - 25);
      pdf.text(codeText, PAGE_MARGIN + 16, yOffset + 4);
      yOffset += 4 * codeText.length;

      // Violation description
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(60, 60, 60);
      const descText = pdf.splitTextToSize(violation.description, SIDEBAR_WIDTH - 20);
      pdf.text(descText.slice(0, 3), PAGE_MARGIN + 10, yOffset + 2); // Limit to 3 lines
      yOffset += 3 * Math.min(descText.length, 3);

      // Separator
      yOffset += 4;
      pdf.setDrawColor(220, 220, 220);
      pdf.line(PAGE_MARGIN + 5, yOffset, PAGE_MARGIN + SIDEBAR_WIDTH - 5, yOffset);
      yOffset += 4;
    });

    // Add drawing to right side
    const drawingX = PAGE_MARGIN + SIDEBAR_WIDTH + PAGE_MARGIN;
    const drawingY = PAGE_MARGIN;

    // Calculate aspect ratio to fit
    const imgAspect = viewport.width / viewport.height;
    const boxAspect = drawingWidth / drawingHeight;
    let imgWidth, imgHeight;

    if (imgAspect > boxAspect) {
      // Image is wider - fit to width
      imgWidth = drawingWidth;
      imgHeight = drawingWidth / imgAspect;
    } else {
      // Image is taller - fit to height
      imgHeight = drawingHeight;
      imgWidth = drawingHeight * imgAspect;
    }

    // Center the image in the available space
    const imgX = drawingX + (drawingWidth - imgWidth) / 2;
    const imgY = drawingY + (drawingHeight - imgHeight) / 2;

    // Add the PDF page image
    const imgData = canvas.toDataURL('image/jpeg', 0.85);
    pdf.addImage(imgData, 'JPEG', imgX, imgY, imgWidth, imgHeight);

    // Draw violation markers on the drawing
    pageViolations.forEach(violation => {
      if (violation.bounds.width === 0 || violation.bounds.height === 0) {
        return; // Skip if no bounds
      }

      // Convert PDF coordinates to image coordinates
      // bounds are in PDF coordinate space (relative to viewport)
      const x = imgX + (violation.bounds.x / viewport.width) * imgWidth;
      const y = imgY + (violation.bounds.y / viewport.height) * imgHeight;
      const w = (violation.bounds.width / viewport.width) * imgWidth;
      const h = (violation.bounds.height / viewport.height) * imgHeight;

      // Draw rectangle around violation
      const color = getSeverityColor(violation.severity);
      pdf.setDrawColor(color.r, color.g, color.b);
      pdf.setLineWidth(1);
      pdf.rect(x, y, w, h, 'S');

      // Draw filled circle marker at top-left
      pdf.setFillColor(color.r, color.g, color.b);
      pdf.circle(x, y, 2, 'F');
    });

    console.log('[PDF Export] Completed page', pageNum);
  }

  // Add title page at the beginning
  pdf.insertPage(1);
  pdf.setPage(1);

  // Title page content
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  const titleY = pdf.internal.pageSize.getHeight() / 2 - 30;
  pdf.text('Compliance Report', pdf.internal.pageSize.getWidth() / 2, titleY, { align: 'center' });

  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  pdf.text(projectName, pdf.internal.pageSize.getWidth() / 2, titleY + 10, { align: 'center' });

  // Summary stats
  pdf.setFontSize(12);
  pdf.setTextColor(0, 0, 0);
  const statsY = titleY + 30;
  pdf.text(`Total Violations: ${violations.length}`, pdf.internal.pageSize.getWidth() / 2, statsY, {
    align: 'center',
  });

  const severityCounts = {
    major: violations.filter(v => v.severity === 'major').length,
    moderate: violations.filter(v => v.severity === 'moderate').length,
    minor: violations.filter(v => v.severity === 'minor').length,
  };

  pdf.setFontSize(10);
  pdf.text(
    `Major: ${severityCounts.major} | Moderate: ${severityCounts.moderate} | Minor: ${severityCounts.minor}`,
    pdf.internal.pageSize.getWidth() / 2,
    statsY + 8,
    { align: 'center' }
  );

  // Generated date
  pdf.setFontSize(9);
  pdf.setTextColor(150, 150, 150);
  pdf.text(
    `Generated: ${new Date().toLocaleDateString()}`,
    pdf.internal.pageSize.getWidth() / 2,
    pdf.internal.pageSize.getHeight() - 20,
    { align: 'center' }
  );

  // Save the PDF
  const filename = `compliance-report-${projectName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.pdf`;
  pdf.save(filename);

  console.log('[PDF Export] Export complete:', filename);
}

/**
 * Get RGB color for severity level
 */
function getSeverityColor(severity: string): { r: number; g: number; b: number } {
  switch (severity) {
    case 'major':
      return { r: 220, g: 38, b: 38 }; // Red
    case 'moderate':
      return { r: 234, g: 179, b: 8 }; // Yellow
    case 'minor':
      return { r: 59, g: 130, b: 246 }; // Blue
    default:
      return { r: 100, g: 100, b: 100 }; // Gray
  }
}
