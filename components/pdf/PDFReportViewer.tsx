'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePDFCanvas } from '@/hooks/usePDFCanvas';
import { ViolationMarker } from '@/lib/reports/get-violations';
import { ViolationBoundingBox } from '../reports/ViolationBoundingBox';
import { groupOverlappingViolations } from '@/lib/reports/group-violations';
import { BlueprintLoader } from '../reports/BlueprintLoader';
import { PDFScreenshotNavigation } from './PDFScreenshotNavigation';
import { PDFPageControls } from './PDFPageControls';

// Stable empty function to avoid creating new functions on every render
const NOOP = () => {};

interface ScreenshotNavigation {
  current: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

interface PDFReportViewerProps {
  pdfUrl: string;
  violationMarkers?: ViolationMarker[];
  onMarkerClick?: (marker: ViolationMarker) => void;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  highlightedViolationId?: string | null;
  screenshotNavigation?: ScreenshotNavigation;
}

/**
 * Read-only PDF viewer for compliance reports.
 *
 * Features:
 * - PDF rendering with pan/zoom
 * - Violation marker overlays
 * - Screenshot navigation between relevant drawings
 * - Auto-center on highlighted violation
 *
 * This is a simpler viewer than PDFViewer - no editing capabilities.
 */
export function PDFReportViewer({
  pdfUrl,
  violationMarkers = [],
  onMarkerClick,
  currentPage,
  onPageChange,
  highlightedViolationId,
  screenshotNavigation,
}: PDFReportViewerProps) {
  const pdf = usePDFCanvas({
    pdfUrl,
    currentPage,
    onPageChange,
  });

  // Pan state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // Smooth transition state (for centering animations)
  const [smoothTransition, setSmoothTransition] = useState(false);

  // Expand violation markers to include all their screenshots
  const expandedMarkers = useMemo(() => {
    const result: ViolationMarker[] = [];
    violationMarkers.forEach(violation => {
      if (violation.allScreenshots && violation.allScreenshots.length > 0) {
        violation.allScreenshots.forEach(screenshot => {
          result.push({
            ...violation,
            screenshotId: screenshot.id,
            screenshotUrl: screenshot.url,
            thumbnailUrl: screenshot.thumbnailUrl,
            pageNumber: screenshot.pageNumber,
            bounds: screenshot.bounds,
          });
        });
      } else {
        result.push(violation);
      }
    });
    return result;
  }, [violationMarkers]);

  // Group overlapping violations on current page
  const violationGroups = useMemo(() => {
    return groupOverlappingViolations(expandedMarkers, pdf.pageNumber);
  }, [expandedMarkers, pdf.pageNumber]);

  // Center on highlighted violation
  useEffect(() => {
    if (!highlightedViolationId || !pdf.viewport) return;

    const [checkId, screenshotId] = highlightedViolationId.split(':::');
    const violation = violationMarkers.find(v => v.checkId === checkId);
    if (!violation) return;

    const screenshot =
      violation.allScreenshots?.find(s => s.id === screenshotId) ||
      (violation.screenshotId === screenshotId
        ? {
            pageNumber: violation.pageNumber,
            bounds: violation.bounds,
          }
        : null);

    if (!screenshot) return;
    if (screenshot.pageNumber !== pdf.pageNumber) return;

    const bounds = screenshot.bounds;
    if (!bounds || !bounds.width || !bounds.height) return;

    // Animate centering
    const timeoutId = setTimeout(() => {
      setSmoothTransition(true);
      pdf.centerOn(bounds);
      setTimeout(() => setSmoothTransition(false), 500);
    }, 100);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedViolationId, pdf.pageNumber, pdf.viewport, pdf.centerOn, violationMarkers]);

  // Mouse handlers for panning
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Left-click or middle-click for panning
      if (e.button === 0 || e.button === 1) {
        e.preventDefault();
        setIsDragging(true);
        dragStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          tx: pdf.transform.tx,
          ty: pdf.transform.ty,
        };
      }
    },
    [pdf.transform.tx, pdf.transform.ty]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      pdf.setTransform({
        ...pdf.transform,
        tx: dragStartRef.current.tx + dx,
        ty: dragStartRef.current.ty + dy,
      });
    },
    [isDragging, pdf]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Loading state
  if (pdf.loading && !pdf.viewport) {
    return <BlueprintLoader />;
  }

  // Error state
  if (pdf.error) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-red-50">
        <div className="p-6 text-center text-red-600 max-w-md">
          <div className="text-lg font-medium mb-2">Failed to load PDF</div>
          <div className="text-sm text-gray-600 mt-2">{pdf.error}</div>
        </div>
      </div>
    );
  }

  const zoomPct = Math.round(pdf.transform.scale * 100);

  return (
    <div
      ref={pdf.containerRef}
      className="relative h-full w-full outline-none overscroll-contain"
      style={{ touchAction: 'none' }}
    >
      {/* Screenshot navigation (top-left) */}
      {screenshotNavigation && (
        <PDFScreenshotNavigation
          current={screenshotNavigation.current}
          total={screenshotNavigation.total}
          onNext={screenshotNavigation.onNext}
          onPrev={screenshotNavigation.onPrev}
          canGoNext={screenshotNavigation.canGoNext}
          canGoPrev={screenshotNavigation.canGoPrev}
        />
      )}

      {/* Zoom controls (top-right) */}
      <div className="absolute top-3 right-3 z-50 flex items-center gap-2 pointer-events-auto">
        <button
          aria-label="Zoom out"
          className="btn-icon bg-white shadow-md"
          onClick={() => pdf.zoom('out')}
        >
          −
        </button>
        <div className="px-2 py-2 text-sm bg-white border rounded shadow-md">{zoomPct}%</div>
        <button
          aria-label="Zoom in"
          className="btn-icon bg-white shadow-md"
          onClick={() => pdf.zoom('in')}
        >
          +
        </button>
      </div>

      {/* Canvas area with pan */}
      <div
        className="absolute inset-0 overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onContextMenu={e => e.preventDefault()}
        style={{ clipPath: 'inset(0)' }}
      >
        <div
          style={{
            transform: `translate(${pdf.transform.tx}px, ${pdf.transform.ty}px) scale(${pdf.transform.scale})`,
            transformOrigin: '0 0',
            willChange: 'transform',
            position: 'absolute',
            left: 0,
            top: 0,
            transition: smoothTransition
              ? 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
              : 'none',
          }}
        >
          <div style={{ position: 'relative' }}>
            <canvas ref={pdf.canvasRef} />

            {/* Violation markers */}
            {violationGroups.map((group, groupIdx) => {
              const isHighlighted = highlightedViolationId
                ? group.violations.some(v => {
                    const highlightedId = `${v.checkId}:::${v.screenshotId}`;
                    return highlightedId === highlightedViolationId;
                  })
                : false;

              return (
                <ViolationBoundingBox
                  key={group.key}
                  violations={group.violations}
                  onClick={onMarkerClick || NOOP}
                  isVisible={true}
                  isHighlighted={isHighlighted}
                  fanOutIndex={groupIdx}
                  totalInGroup={group.violations.length}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Page controls (bottom-left) */}
      <PDFPageControls
        pageNumber={pdf.pageNumber}
        numPages={pdf.numPages}
        onPrevPage={pdf.prevPage}
        onNextPage={pdf.nextPage}
      />
    </div>
  );
}
