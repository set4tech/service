'use client';

import dynamic from 'next/dynamic';

// Dynamically import the entire PDFViewer component with no SSR
const PDFViewerComponent = dynamic(
  () => import('./PDFViewer').then(mod => ({ default: mod.PDFViewer })),
  {
    ssr: false,
    loading: () => <div className="p-6 text-center">Loading PDF viewer...</div>
  }
);

export function PDFViewerWrapper(props: any) {
  return <PDFViewerComponent {...props} />;
}