'use client';

import dynamic from 'next/dynamic';

// Dynamically import the entire PDFViewer component with no SSR
// Using a function that returns the import to prevent build-time analysis
const PDFViewerComponent = dynamic(
  async () => {
    const mod = await import('./PDFViewer');
    return { default: mod.PDFViewer };
  },
  {
    ssr: false,
    loading: () => <div className="p-6 text-center">Loading PDF viewer...</div>
  }
);

export function PDFViewerWrapper(props: any) {
  if (typeof window === 'undefined') {
    return <div className="p-6">PDF viewer requires client-side rendering</div>;
  }
  return <PDFViewerComponent {...props} />;
}