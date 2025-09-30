'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

// Dynamically import the entire PDFViewer component with no SSR
const PDFViewerComponent = dynamic(
  () => import('./PDFViewer').then(mod => ({ default: mod.PDFViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-gray-500">Loading PDF viewer...</div>
        </div>
      </div>
    ),
  }
);

export function PDFViewerWrapper(props: any) {
  return (
    <div className="h-full w-full">
      <Suspense
        fallback={
          <div className="h-full w-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-sm text-gray-500">Loading PDF viewer...</div>
            </div>
          </div>
        }
      >
        <PDFViewerComponent {...props} />
      </Suspense>
    </div>
  );
}
