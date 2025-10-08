// PDF.js text extraction types are imported dynamically

/**
 * Extract text content from a PDF page that falls within specified crop coordinates.
 * Uses PDF.js getTextContent() API to get text items with their bounding boxes.
 *
 * @param page - PDF.js page proxy object
 * @param cropCoords - Screenshot crop coordinates (in CSS pixels at scale 1)
 * @returns Extracted text as a single string
 */
export async function extractTextFromRegion(
  page: any,
  cropCoords: { x: number; y: number; width: number; height: number }
): Promise<string> {
  try {
    // Get text content with position data
    const textContent = await page.getTextContent();

    // Get viewport at scale 1 for coordinate mapping
    const viewport = page.getViewport({ scale: 1 });

    const extractedItems: string[] = [];

    for (const item of textContent.items) {
      if (!('transform' in item) || !('str' in item)) continue;

      // PDF.js uses bottom-left origin, convert to top-left
      const transform = item.transform;
      const x = transform[4]; // x position
      const y = viewport.height - transform[5]; // y position (flip vertical)

      // Check if text item falls within crop region
      if (
        x >= cropCoords.x &&
        x <= cropCoords.x + cropCoords.width &&
        y >= cropCoords.y &&
        y <= cropCoords.y + cropCoords.height
      ) {
        extractedItems.push(item.str);
      }
    }

    // Join with spaces, clean up excessive whitespace
    return extractedItems.join(' ').replace(/\s+/g, ' ').trim();
  } catch (error) {
    console.error('[extractTextFromRegion] Failed to extract text:', error);
    return '';
  }
}
