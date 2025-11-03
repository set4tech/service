import pdf from 'pdf-parse';

export interface PageContent {
  page: number;
  text: string;
}

/**
 * Extract text from PDF buffer page by page
 */
export async function extractPdfWithPages(pdfBuffer: Buffer): Promise<PageContent[]> {
  try {
    const pages: PageContent[] = [];

    // Use pdf-parse with custom page render to extract text per page
    const data = await pdf(pdfBuffer, {
      pagerender: (pageData: any) => {
        return pageData.getTextContent().then((textContent: any) => {
          // Extract text items from the page
          const text = textContent.items.map((item: any) => item.str).join(' ');

          pages.push({
            page: pageData.pageNumber,
            text: text,
          });

          // Return the text for pdf-parse's full text output
          return text;
        });
      },
    });

    // If no pages were extracted via custom render, fall back to full text
    if (pages.length === 0 && data.text) {
      return [
        {
          page: 1,
          text: data.text,
        },
      ];
    }

    return pages;
  } catch (error) {
    console.error('Error extracting PDF:', error);
    throw error;
  }
}

/**
 * Format PDF content with clear page markers for LLM
 */
export function formatPdfForLlm(pagesContent: PageContent[]): string {
  const formattedText: string[] = [];

  for (const pageData of pagesContent) {
    formattedText.push(`[PAGE ${pageData.page} START]`);
    formattedText.push(pageData.text);
    formattedText.push(`[PAGE ${pageData.page} END]\n`);
  }

  return formattedText.join('\n');
}

/**
 * Download PDF from URL and return buffer
 * Handles both direct URLs and S3 URLs (by presigning them first)
 */
export async function downloadPdfFromUrl(url: string): Promise<Buffer> {
  let downloadUrl = url;

  // If it's an S3 URL, presign it first
  if (url.startsWith('s3://') || url.includes('.s3.') || url.includes('.s3-')) {
    const { presignGet } = await import('./s3');

    // Extract key from S3 URL
    let key: string;
    if (url.startsWith('s3://')) {
      const parts = url.replace('s3://', '').split('/');
      key = parts.slice(1).join('/');
    } else {
      const urlObj = new URL(url);
      key = urlObj.pathname.slice(1); // Remove leading slash

      // Decode URL-encoded characters
      try {
        key = decodeURIComponent(key);
      } catch {
        // Handle malformed percent encoding
        const safePath = key.replace(/%(?![0-9A-Fa-f]{2})/g, '___PERCENT___');
        key = decodeURIComponent(safePath).replace(/___PERCENT___/g, '%');
      }
    }

    // Get presigned URL
    downloadUrl = await presignGet(key, 3600); // 1 hour expiry
  }

  const response = await fetch(downloadUrl);

  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
