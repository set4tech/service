'use client';

import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import { ViolationMarker } from './get-violations';

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

interface ExportOptions {
  pdfUrl: string;
  violations: ViolationMarker[];
  projectName: string;
  assessmentId: string;
  buildingParams?: any;
  codeInfo?: {
    id: string;
    title: string;
    version: string;
    sourceUrl?: string;
  };
}

const PAGE_MARGIN = 15; // Margin in mm

/**
 * Exports a compliance report PDF with violations marked up
 */
export async function exportCompliancePDF(options: ExportOptions): Promise<void> {
  const { pdfUrl, violations, projectName, buildingParams, codeInfo } = options;

  console.log('[PDF Export] Starting export with', violations.length, 'violations');
  console.log('[PDF Export] Input PDF URL:', pdfUrl);

  // Get presigned URL if needed
  let presignedUrl = pdfUrl;
  const isS3Url = pdfUrl.includes('.s3.') || pdfUrl.includes('.s3-') || pdfUrl.startsWith('s3://');
  const isAlreadyPresigned = pdfUrl.includes('X-Amz-Signature');

  console.log('[PDF Export] isS3Url:', isS3Url, 'isAlreadyPresigned:', isAlreadyPresigned);

  if (isS3Url && !isAlreadyPresigned) {
    console.log('[PDF Export] Fetching presigned URL for S3 URL');
    const presignRes = await fetch('/api/pdf/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfUrl }),
    });
    if (!presignRes.ok) {
      const errorData = await presignRes.json();
      console.error('[PDF Export] Presign failed:', errorData);
      throw new Error(`Failed to get presigned URL: ${errorData.error || presignRes.statusText}`);
    }
    const { url } = await presignRes.json();
    presignedUrl = url;
    console.log('[PDF Export] Got presigned URL, loading PDF...');
  } else {
    console.log('[PDF Export] Using URL as-is (already presigned or not S3)');
  }

  console.log('[PDF Export] Final URL:', presignedUrl.substring(0, 100) + '...');

  // Create output PDF (portrait for report format)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;

  // ==================== TITLE PAGE ====================
  let yPos = PAGE_MARGIN + 30;

  // Project title
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text('Compliance Report', pageWidth / 2, yPos, { align: 'center' });
  yPos += 12;

  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'normal');
  pdf.text(projectName, pageWidth / 2, yPos, { align: 'center' });
  yPos += 20;

  // Code information
  if (codeInfo) {
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Code Information', PAGE_MARGIN, yPos);
    yPos += 8;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Title: ${codeInfo.title}`, PAGE_MARGIN + 5, yPos);
    yPos += 6;
    pdf.text(`Version: ${codeInfo.version}`, PAGE_MARGIN + 5, yPos);
    yPos += 12;
  }

  // Building parameters - format nicely
  if (buildingParams && Object.keys(buildingParams).length > 0) {
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Building Parameters', PAGE_MARGIN, yPos);
    yPos += 8;

    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');

    const formatValue = (val: any, indent = 0): string[] => {
      const indentStr = '  '.repeat(indent);
      if (typeof val === 'object' && val !== null) {
        const lines: string[] = [];
        for (const [k, v] of Object.entries(val)) {
          const key = k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          if (typeof v === 'object' && v !== null) {
            lines.push(`${indentStr}${key}:`);
            lines.push(...formatValue(v, indent + 1));
          } else {
            lines.push(`${indentStr}${key}: ${v}`);
          }
        }
        return lines;
      }
      return [`${indentStr}${val}`];
    };

    for (const [key, value] of Object.entries(buildingParams)) {
      if (yPos > pageHeight - PAGE_MARGIN - 20) {
        pdf.addPage();
        yPos = PAGE_MARGIN;
      }

      const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      pdf.setFont('helvetica', 'bold');
      pdf.text(displayKey + ':', PAGE_MARGIN + 5, yPos);
      yPos += 5;

      pdf.setFont('helvetica', 'normal');
      const lines = formatValue(value, 1);
      lines.forEach(line => {
        if (yPos > pageHeight - PAGE_MARGIN - 10) {
          pdf.addPage();
          yPos = PAGE_MARGIN;
        }
        const wrappedLines = pdf.splitTextToSize(line, contentWidth - 10);
        pdf.text(wrappedLines, PAGE_MARGIN + 5, yPos);
        yPos += 4.5 * wrappedLines.length;
      });
      yPos += 3;
    }
    yPos += 5;
  }

  // Summary stats
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Violations Summary', PAGE_MARGIN, yPos);
  yPos += 8;

  const severityCounts = {
    major: violations.filter(v => v.severity === 'major').length,
    moderate: violations.filter(v => v.severity === 'moderate').length,
    minor: violations.filter(v => v.severity === 'minor').length,
  };

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Total Violations: ${violations.length}`, PAGE_MARGIN + 5, yPos);
  yPos += 6;
  pdf.setTextColor(220, 38, 38);
  pdf.text(`Major: ${severityCounts.major}`, PAGE_MARGIN + 5, yPos);
  yPos += 6;
  pdf.setTextColor(234, 179, 8);
  pdf.text(`Moderate: ${severityCounts.moderate}`, PAGE_MARGIN + 5, yPos);
  yPos += 6;
  pdf.setTextColor(59, 130, 246);
  pdf.text(`Minor: ${severityCounts.minor}`, PAGE_MARGIN + 5, yPos);
  yPos += 12;

  pdf.setTextColor(100, 100, 100);
  pdf.setFontSize(9);
  pdf.text(`Generated: ${new Date().toLocaleString()}`, PAGE_MARGIN, pageHeight - PAGE_MARGIN);

  console.log('[PDF Export] Created title page');

  // ==================== DRAWING PAGES WITH MARKERS ====================
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

  // Render each page that has violations
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const pageViolations = violationsByPage.get(pageNum) || [];
    if (pageViolations.length === 0) {
      continue; // Skip pages without violations
    }

    console.log(
      `[PDF Export] Rendering drawing page ${pageNum} with ${pageViolations.length} violations`
    );

    pdf.addPage('a4', 'landscape');

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

    // Calculate layout dimensions (landscape page)
    const drawingPageWidth = pdf.internal.pageSize.getWidth();
    const drawingPageHeight = pdf.internal.pageSize.getHeight();
    const drawingWidth = drawingPageWidth - PAGE_MARGIN * 2;
    const drawingHeight = drawingPageHeight - PAGE_MARGIN * 2;

    // Calculate aspect ratio to fit
    const imgAspect = viewport.width / viewport.height;
    const boxAspect = drawingWidth / drawingHeight;
    let imgWidth, imgHeight;

    if (imgAspect > boxAspect) {
      imgWidth = drawingWidth;
      imgHeight = drawingWidth / imgAspect;
    } else {
      imgHeight = drawingHeight;
      imgWidth = drawingHeight * imgAspect;
    }

    // Center the image
    const imgX = PAGE_MARGIN + (drawingWidth - imgWidth) / 2;
    const imgY = PAGE_MARGIN + (drawingHeight - imgHeight) / 2;

    // Add the PDF page image
    const imgData = canvas.toDataURL('image/jpeg', 0.9);
    pdf.addImage(imgData, 'JPEG', imgX, imgY, imgWidth, imgHeight);

    // Draw violation markers on the drawing
    pageViolations.forEach(violation => {
      if (violation.bounds.width === 0 || violation.bounds.height === 0) {
        return; // Skip if no bounds
      }

      // Account for zoom level differences between capture and render
      const renderScale = 2.0;
      const captureZoom = violation.bounds.zoom_level || 1.0;
      const zoomRatio = renderScale / captureZoom;

      console.log('[PDF Export] Violation bounds:', {
        checkId: violation.checkId,
        originalBounds: violation.bounds,
        captureZoom,
        renderScale,
        zoomRatio,
        viewportDims: { width: viewport.width, height: viewport.height },
      });

      // Convert PDF coordinates to viewport coordinates, then to image coordinates
      const viewportX = violation.bounds.x * zoomRatio;
      const viewportY = violation.bounds.y * zoomRatio;
      const viewportW = violation.bounds.width * zoomRatio;
      const viewportH = violation.bounds.height * zoomRatio;

      const x = imgX + (viewportX / viewport.width) * imgWidth;
      const y = imgY + (viewportY / viewport.height) * imgHeight;
      const w = (viewportW / viewport.width) * imgWidth;
      const h = (viewportH / viewport.height) * imgHeight;

      // Draw rectangle around violation
      const color = getSeverityColor(violation.severity);
      pdf.setDrawColor(color.r, color.g, color.b);
      pdf.setLineWidth(1.5);
      pdf.rect(x, y, w, h, 'S');

      // Draw filled circle marker with number
      pdf.setFillColor(color.r, color.g, color.b);
      pdf.circle(x + 5, y + 5, 4, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      const violationNum = violations.findIndex(v => v.checkId === violation.checkId) + 1;
      pdf.text(String(violationNum), x + 5, y + 6.5, { align: 'center' });
    });

    // Page title
    pdf.setFontSize(10);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.text(
      `Drawing Page ${pageNum} - ${pageViolations.length} Violation(s)`,
      PAGE_MARGIN,
      PAGE_MARGIN - 3
    );

    console.log('[PDF Export] Completed drawing page', pageNum);
  }

  // ==================== VIOLATION DETAIL PAGES ====================
  // Fetch section texts for all violations
  console.log('[PDF Export] Fetching section texts...');
  const sectionKeys = Array.from(new Set(violations.map(v => v.codeSectionKey).filter(Boolean)));
  const sectionTextsMap = new Map<string, string>();

  try {
    const response = await fetch('/api/sections/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: sectionKeys }),
    });
    if (response.ok) {
      const sections = await response.json();
      sections.forEach((s: any) => {
        sectionTextsMap.set(s.key, s.text || 'No text available');
      });
    }
  } catch (err) {
    console.error('[PDF Export] Failed to fetch section texts:', err);
  }

  // Process each violation
  for (let i = 0; i < violations.length; i++) {
    const violation = violations[i];
    console.log(`[PDF Export] Processing violation ${i + 1}/${violations.length}`);

    pdf.addPage();
    yPos = PAGE_MARGIN;

    // Violation header
    const color = getSeverityColor(violation.severity);
    pdf.setFillColor(color.r, color.g, color.b);
    pdf.rect(PAGE_MARGIN, yPos, contentWidth, 10, 'F');

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text(`Violation ${i + 1} of ${violations.length}`, PAGE_MARGIN + 3, yPos + 7);
    pdf.text(violation.severity.toUpperCase(), pageWidth - PAGE_MARGIN - 3, yPos + 7, {
      align: 'right',
    });
    yPos += 15;

    // Code section
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Code Section: ${violation.codeSectionNumber}`, PAGE_MARGIN, yPos);
    yPos += 8;

    // Code text
    const sectionText = sectionTextsMap.get(violation.codeSectionKey) || 'Code text not available';
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(40, 40, 40);
    const codeTextLines = pdf.splitTextToSize(sectionText, contentWidth);
    const maxCodeLines = 15;
    pdf.text(codeTextLines.slice(0, maxCodeLines), PAGE_MARGIN, yPos);
    yPos += 5 * Math.min(codeTextLines.length, maxCodeLines) + 8;

    if (codeTextLines.length > maxCodeLines) {
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text('(truncated...)', PAGE_MARGIN, yPos);
      yPos += 6;
    }

    // Violation description
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text('Violation:', PAGE_MARGIN, yPos);
    yPos += 6;

    pdf.setFont('helvetica', 'normal');
    const descLines = pdf.splitTextToSize(violation.description, contentWidth);
    pdf.text(descLines, PAGE_MARGIN, yPos);
    yPos += 5 * descLines.length + 6;

    // AI reasoning
    if (violation.reasoning) {
      if (yPos > pageHeight - 60) {
        pdf.addPage();
        yPos = PAGE_MARGIN;
      }

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Analysis:', PAGE_MARGIN, yPos);
      yPos += 6;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const reasoningLines = pdf.splitTextToSize(violation.reasoning, contentWidth);
      pdf.text(reasoningLines, PAGE_MARGIN, yPos);
      yPos += 5 * reasoningLines.length + 6;
    }

    // Recommendations
    if (violation.recommendations && violation.recommendations.length > 0) {
      if (yPos > pageHeight - 40) {
        pdf.addPage();
        yPos = PAGE_MARGIN;
      }

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Recommendations:', PAGE_MARGIN, yPos);
      yPos += 6;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      violation.recommendations.forEach(rec => {
        const recLines = pdf.splitTextToSize(`• ${rec}`, contentWidth - 3);
        pdf.text(recLines, PAGE_MARGIN + 3, yPos);
        yPos += 5 * recLines.length;
      });
      yPos += 6;
    }

    // Screenshot if available
    if (violation.screenshotUrl) {
      try {
        // Get presigned URL for screenshot
        const screenshotRes = await fetch('/api/screenshots/presign-view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ screenshotUrls: [violation.screenshotUrl] }),
        });
        if (screenshotRes.ok) {
          const { presignedUrls } = await screenshotRes.json();
          const imgUrl = presignedUrls[0];

          if (yPos > pageHeight - 80) {
            pdf.addPage();
            yPos = PAGE_MARGIN;
          }

          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'bold');
          pdf.text('Screenshot:', PAGE_MARGIN, yPos);
          yPos += 6;

          // Add image
          const maxImgWidth = contentWidth;
          const maxImgHeight = pageHeight - yPos - PAGE_MARGIN - 10;
          const imgHeight = Math.min(80, maxImgHeight);

          pdf.addImage(imgUrl, 'JPEG', PAGE_MARGIN, yPos, maxImgWidth, imgHeight);
          yPos += imgHeight + 5;
        }
      } catch (err) {
        console.error('[PDF Export] Failed to load screenshot:', err);
      }
    }

    // Page footer
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(
      `Page ${i + 2} of ${violations.length + 1}`,
      pageWidth / 2,
      pageHeight - PAGE_MARGIN / 2,
      { align: 'center' }
    );
  }

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
