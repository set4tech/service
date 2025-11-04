const MAX_CANVAS_SIDE = 16384;
const MAX_CANVAS_PIXELS = 268_000_000; // 16384^2

/**
 * Calculate safe rendering multiplier that respects canvas limits.
 *
 * Canvas has hard limits:
 * - Max side: 16384px
 * - Max pixels: 268 million (16384²)
 *
 * @param baseWidth - Base viewport width
 * @param baseHeight - Base viewport height
 * @param desiredMultiplier - Desired scale multiplier
 * @returns Safe multiplier that won't exceed limits
 */
export function getSafeRenderMultiplier(
  baseWidth: number,
  baseHeight: number,
  desiredMultiplier: number
): number {
  const maxBySide = Math.min(MAX_CANVAS_SIDE / baseWidth, MAX_CANVAS_SIDE / baseHeight);

  const maxByPixels = Math.sqrt(MAX_CANVAS_PIXELS / (baseWidth * baseHeight));

  const cap = Math.min(maxBySide, maxByPixels);

  return Math.max(1, Math.min(desiredMultiplier, cap));
}

/**
 * Render PDF page to canvas with specified scale.
 *
 * @param page - PDF.js page object
 * @param canvas - Target canvas element
 * @param options - Rendering options
 * @returns Viewport information
 */
export async function renderPdfPage(
  page: any,
  canvas: HTMLCanvasElement,
  options: {
    scaleMultiplier: number;
    optionalContentConfig?: any;
  }
): Promise<{
  baseViewport: any;
  viewport: any;
  multiplier: number;
}> {
  const { scaleMultiplier, optionalContentConfig } = options;

  // Get base viewport
  const baseViewport = page.getViewport({ scale: 1 });

  // Calculate safe multiplier
  const safeMultiplier = getSafeRenderMultiplier(
    baseViewport.width,
    baseViewport.height,
    scaleMultiplier
  );

  // Create viewport at safe scale
  const viewport = page.getViewport({ scale: safeMultiplier });

  // Set canvas size (CSS = base, backing store = high-res)
  canvas.style.width = `${Math.ceil(baseViewport.width)}px`;
  canvas.style.height = `${Math.ceil(baseViewport.height)}px`;
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  // Get context and clear
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D context');

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // Render
  const renderParams: any = {
    canvasContext: ctx,
    viewport,
  };

  if (optionalContentConfig) {
    renderParams.optionalContentConfigPromise = Promise.resolve(optionalContentConfig);
  }

  await page.render(renderParams).promise;

  return { baseViewport, viewport, multiplier: safeMultiplier };
}

/**
 * Capture a region from a PDF page to blob.
 *
 * @param page - PDF.js page object
 * @param sourceCanvas - Canvas with rendered page
 * @param region - Region to capture (in CSS pixels)
 * @param renderScale - Quality multiplier
 * @param ocConfig - Optional content config
 * @returns Full-size and thumbnail blobs
 */
export async function captureCanvasRegion(
  page: any,
  sourceCanvas: HTMLCanvasElement,
  region: { x: number; y: number; width: number; height: number },
  renderScale: number,
  ocConfig?: any
): Promise<{ full: Blob; thumbnail: Blob }> {
  // Calculate CSS-to-canvas ratio from source canvas
  const baseViewport = page.getViewport({ scale: 1 });
  const cssToCanvas = sourceCanvas.width / Math.ceil(baseViewport.width);

  // Convert region from CSS pixels to source canvas pixels
  const canvasSx = Math.floor(region.x * cssToCanvas);
  const canvasSy = Math.floor(region.y * cssToCanvas);
  const canvasSw = Math.max(1, Math.ceil(region.width * cssToCanvas));
  const canvasSh = Math.max(1, Math.ceil(region.height * cssToCanvas));

  // Render full page at high resolution
  const safeMultiplier = getSafeRenderMultiplier(
    baseViewport.width,
    baseViewport.height,
    renderScale
  );

  const viewport = page.getViewport({ scale: safeMultiplier });
  const offscreen = document.createElement('canvas');
  offscreen.width = Math.ceil(viewport.width);
  offscreen.height = Math.ceil(viewport.height);

  const ctx = offscreen.getContext('2d')!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, offscreen.width, offscreen.height);

  await page.render({
    canvasContext: ctx,
    viewport,
    ...(ocConfig && { optionalContentConfigPromise: Promise.resolve(ocConfig) }),
  }).promise;

  // Map source canvas coords to offscreen canvas coords
  const ratio = viewport.width / sourceCanvas.width;
  const rx = Math.max(0, Math.floor(canvasSx * ratio));
  const ry = Math.max(0, Math.floor(canvasSy * ratio));
  const rw = Math.max(1, Math.ceil(canvasSw * ratio));
  const rh = Math.max(1, Math.ceil(canvasSh * ratio));

  // Clamp to canvas bounds
  const cx = Math.min(rx, offscreen.width - 1);
  const cy = Math.min(ry, offscreen.height - 1);
  const cw = Math.min(rw, offscreen.width - cx);
  const ch = Math.min(rh, offscreen.height - cy);

  // Extract region
  const output = document.createElement('canvas');
  output.width = cw;
  output.height = ch;
  output.getContext('2d')!.drawImage(offscreen, cx, cy, cw, ch, 0, 0, cw, ch);

  // Create thumbnail (max 240px)
  const thumbMax = 240;
  const thumbRatio = Math.min(1, thumbMax / Math.max(cw, ch));
  const thumbWidth = Math.max(1, Math.round(cw * thumbRatio));
  const thumbHeight = Math.max(1, Math.round(ch * thumbRatio));

  const thumbnail = document.createElement('canvas');
  thumbnail.width = thumbWidth;
  thumbnail.height = thumbHeight;
  thumbnail.getContext('2d')!.drawImage(output, 0, 0, thumbWidth, thumbHeight);

  // Convert to blobs
  const [full, thumbnailBlob] = await Promise.all([
    new Promise<Blob>(resolve => output.toBlob(b => resolve(b!), 'image/png')),
    new Promise<Blob>(resolve => thumbnail.toBlob(b => resolve(b!), 'image/png')),
  ]);

  return { full, thumbnail: thumbnailBlob };
}
