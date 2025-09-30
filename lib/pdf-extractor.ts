import pdf from 'pdf-parse';

export interface PageContent {
  page: number;
  text: string;
}

/**
 * Extract text from PDF buffer with page numbers preserved
 */
export async function extractPdfWithPages(
  pdfBuffer: Buffer
): Promise<PageContent[]> {
  const pagesContent: PageContent[] = [];

  try {
    const data = await pdf(pdfBuffer);

    // pdf-parse doesn't provide per-page text by default
    // We need to use render_page option for each page
    const numPages = data.numpages;

    for (let i = 1; i <= numPages; i++) {
      const pageData = await pdf(pdfBuffer, {
        max: 1,
        pagerender: function(pageData: any) {
          return pageData.getTextContent().then(function(textContent: any) {
            return textContent.items.map((item: any) => item.str).join(' ');
          });
        }
      });

      if (pageData.text) {
        pagesContent.push({
          page: i,
          text: pageData.text
        });
      }
    }

    return pagesContent;
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
 */
export async function downloadPdfFromUrl(url: string): Promise<Buffer> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}