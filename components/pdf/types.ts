/**
 * Selection bounds for screenshot/measurement drawing.
 */
export interface Selection {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/**
 * Discriminated union for viewer mode.
 * 
 * Using a discriminated union prevents impossible states like:
 * - Being in idle mode with an active selection
 * - Being in multiple modes at once
 * 
 * Each mode can have its own associated data.
 */
export type ViewerMode =
  | { type: 'idle' }
  | { type: 'screenshot'; selection: Selection | null }
  | { type: 'measure'; selection: Selection | null }
  | { type: 'calibrate'; selection: Selection | null };

/**
 * Helper type guards for mode checking.
 */
export function isScreenshotMode(mode: ViewerMode): mode is { type: 'screenshot'; selection: Selection | null } {
  return mode.type === 'screenshot';
}

export function isMeasureMode(mode: ViewerMode): mode is { type: 'measure'; selection: Selection | null } {
  return mode.type === 'measure';
}

export function isCalibrateMode(mode: ViewerMode): mode is { type: 'calibrate'; selection: Selection | null } {
  return mode.type === 'calibrate';
}

export function isInteractiveMode(mode: ViewerMode): boolean {
  return mode.type !== 'idle';
}

/**
 * Mode transitions.
 */
export function enterMode(type: 'screenshot' | 'measure' | 'calibrate'): ViewerMode {
  return { type, selection: null };
}

export function exitMode(): ViewerMode {
  return { type: 'idle' };
}

export function startSelection(mode: ViewerMode, x: number, y: number): ViewerMode {
  if (mode.type === 'idle') return mode;
  return { ...mode, selection: { startX: x, startY: y, endX: x, endY: y } };
}

export function updateSelection(mode: ViewerMode, x: number, y: number): ViewerMode {
  if (mode.type === 'idle' || !mode.selection) return mode;
  return { ...mode, selection: { ...mode.selection, endX: x, endY: y } };
}

export function clearSelection(mode: ViewerMode): ViewerMode {
  if (mode.type === 'idle') return mode;
  return { ...mode, selection: null };
}
