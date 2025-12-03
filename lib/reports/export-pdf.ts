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
  const { pdfUrl, violations, projectName, buildingParams: _buildingParams, codeInfo } = options;

  // Filter violations to only include those with analysis (AI or human)
  const violationsWithAnalysis = violations.filter(v => v.reasoning || v.manualReasoning);

  console.log('[PDF Export] Starting export with', violations.length, 'total violations');
  console.log(
    '[PDF Export] Filtered to',
    violationsWithAnalysis.length,
    'violations with analysis'
  );
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

  // Summary stats
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Violations Summary', PAGE_MARGIN, yPos);
  yPos += 8;

  const severityCounts = {
    major: violationsWithAnalysis.filter(v => v.severity === 'major').length,
    moderate: violationsWithAnalysis.filter(v => v.severity === 'moderate').length,
    minor: violationsWithAnalysis.filter(v => v.severity === 'minor').length,
  };

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(
    `Total Violations with Analysis: ${violationsWithAnalysis.length}`,
    PAGE_MARGIN + 5,
    yPos
  );
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

  // ==================== VIOLATION DETAIL PAGES ====================
  // Process each violation (filtered to only those with analysis)
  for (let i = 0; i < violationsWithAnalysis.length; i++) {
    const violation = violationsWithAnalysis[i];
    console.log(`[PDF Export] Processing violation ${i + 1}/${violationsWithAnalysis.length}`);

    pdf.addPage();
    yPos = PAGE_MARGIN;

    // Violation header
    const color = getSeverityColor(violation.severity);
    pdf.setFillColor(color.r, color.g, color.b);
    pdf.rect(PAGE_MARGIN, yPos, contentWidth, 10, 'F');

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text(`Violation ${i + 1} of ${violationsWithAnalysis.length}`, PAGE_MARGIN + 3, yPos + 7);
    pdf.text(violation.severity.toUpperCase(), pageWidth - PAGE_MARGIN - 3, yPos + 7, {
      align: 'right',
    });
    yPos += 15;

    // Code section
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Code Section: ${violation.codeSectionNumber}`, PAGE_MARGIN, yPos);
    yPos += 10;

    // Fetch and display section content
    if (violation.codeSectionKey) {
      try {
        const sectionRes = await fetch(`/api/code-sections/${violation.codeSectionKey}`);
        if (sectionRes.ok) {
          const section = await sectionRes.json();

          console.log('[PDF Export] Section data:', {
            checkId: violation.checkId,
            hasParent: !!section.parent_section,
            hasText: !!section.text,
            hasRequirements: !!section.requirements,
          });

          // Check if we need a new page
          if (yPos > pageHeight - 100) {
            pdf.addPage();
            yPos = PAGE_MARGIN;
          }

          // Parent section context (if exists)
          if (section.parent_section) {
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(100, 100, 100);
            pdf.text('Parent Section Context:', PAGE_MARGIN, yPos);
            yPos += 6;

            pdf.setFont('helvetica', 'normal');
            const parentLabel = `${section.parent_section.number} - ${section.parent_section.title || ''}`;
            pdf.text(parentLabel, PAGE_MARGIN + 3, yPos);
            yPos += 6;

            // Parent section text (summary)
            if (section.parent_section.text) {
              const parentTextLines = pdf.splitTextToSize(
                section.parent_section.text,
                contentWidth - 6
              );
              parentTextLines.forEach((line: string) => {
                if (yPos > pageHeight - PAGE_MARGIN - 10) {
                  pdf.addPage();
                  yPos = PAGE_MARGIN;
                }
                pdf.text(line, PAGE_MARGIN + 3, yPos);
                yPos += 4.5;
              });
            }
            yPos += 6;
          }

          // Section Summary (this is the main section text)
          if (section.text) {
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(100, 100, 100);
            pdf.text('Section Summary:', PAGE_MARGIN, yPos);
            yPos += 6;

            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(0, 0, 0);
            const textLines = pdf.splitTextToSize(section.text, contentWidth - 3);
            textLines.forEach((line: string) => {
              if (yPos > pageHeight - PAGE_MARGIN - 10) {
                pdf.addPage();
                yPos = PAGE_MARGIN;
              }
              pdf.text(line, PAGE_MARGIN + 3, yPos);
              yPos += 4.5;
            });
            yPos += 6;
          }

          // Requirements (paragraphs)
          if (
            section.requirements &&
            Array.isArray(section.requirements) &&
            section.requirements.length > 0
          ) {
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(100, 100, 100);
            pdf.text('Requirements:', PAGE_MARGIN, yPos);
            yPos += 6;

            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(0, 0, 0);

            section.requirements.forEach((req: any, _idx: number) => {
              const text = typeof req === 'string' ? req : req.text || '';
              if (text) {
                const reqLines = pdf.splitTextToSize(text, contentWidth - 6);
                reqLines.forEach((line: string) => {
                  if (yPos > pageHeight - PAGE_MARGIN - 10) {
                    pdf.addPage();
                    yPos = PAGE_MARGIN;
                  }
                  pdf.text(line, PAGE_MARGIN + 6, yPos);
                  yPos += 4.5;
                });
                yPos += 3; // Space between requirements
              }
            });
            yPos += 4;
          }

          yPos += 4;
        } else {
          console.error('[PDF Export] Section fetch failed:', sectionRes.status);
        }
      } catch (err) {
        console.error('[PDF Export] Failed to fetch section content:', err);
        yPos += 5;
      }
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

    // Analysis - prioritize manual reasoning over AI reasoning
    const analysisText = violation.manualReasoning || violation.reasoning;
    if (analysisText) {
      if (yPos > pageHeight - 60) {
        pdf.addPage();
        yPos = PAGE_MARGIN;
      }

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');

      // Show different label based on whether it's manual or AI
      const analysisLabel = violation.manualReasoning ? 'Manual Assessment:' : 'AI Analysis:';
      pdf.text(analysisLabel, PAGE_MARGIN, yPos);

      // Add "Human Reviewed" badge if manual reasoning
      if (violation.manualReasoning) {
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(37, 99, 235); // Blue color
        pdf.text('(Human Reviewed)', PAGE_MARGIN + 50, yPos);
        pdf.setTextColor(0, 0, 0); // Reset to black
      }

      yPos += 6;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const reasoningLines = pdf.splitTextToSize(analysisText, contentWidth);
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
      `Page ${i + 2} of ${violationsWithAnalysis.length + 1}`,
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
