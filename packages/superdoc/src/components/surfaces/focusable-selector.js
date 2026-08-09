/**
 * CSS selector matching all focusable elements within a surface shell.
 * Used by SurfaceDialog (focus trap, initial focus) and SurfaceFloating (initial focus).
 */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');
