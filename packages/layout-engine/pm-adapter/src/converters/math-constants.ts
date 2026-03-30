/** Rough width estimate per character for math content (px). */
export const MATH_CHAR_WIDTH = 10;

/** Default height for math content (px). */
export const MATH_DEFAULT_HEIGHT = 24;

/** Minimum width for a math run (px). */
export const MATH_MIN_WIDTH = 20;

/** Estimate math run dimensions from text content. */
export function estimateMathDimensions(textContent: string): { width: number; height: number } {
  return {
    width: Math.max(textContent.length * MATH_CHAR_WIDTH, MATH_MIN_WIDTH),
    height: MATH_DEFAULT_HEIGHT,
  };
}
