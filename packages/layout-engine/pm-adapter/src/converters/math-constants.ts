/** Rough width estimate per character for math content (px). */
export const MATH_CHAR_WIDTH = 10;

/** Default height for a single-line math expression (px). */
export const MATH_DEFAULT_HEIGHT = 24;

/** Minimum width for a math run (px). */
export const MATH_MIN_WIDTH = 20;

/**
 * OMML elements that stack content vertically, with their height multipliers.
 * Each element adds vertical space: a fraction has num+den (2x), a bar has
 * base+accent (~1.4x), sub/superscripts are modest (~1.3x).
 */
const VERTICAL_ELEMENTS: Record<string, number> = {
  'm:f': 0.6, // Fraction — stacks numerator over denominator
  'm:bar': 0.25, // Bar — accent above/below base
  'm:limLow': 0.35, // Lower limit
  'm:limUpp': 0.35, // Upper limit
  'm:nary': 0.4, // N-ary (integral/summation) with limits
  'm:rad': 0.2, // Radical — root symbol adds height
  'm:sSub': 0.1, // Subscript
  'm:sSup': 0.1, // Superscript
  'm:sSubSup': 0.2, // Sub-superscript
  'm:sPre': 0.2, // Pre-sub-superscript
};

/** Count elements in an m:eqArr (equation array) for row-based height. */
function countEqArrayRows(node: { elements?: unknown[] }): number {
  if (!Array.isArray(node.elements)) return 1;
  return node.elements.filter((el: unknown) => el && typeof el === 'object' && (el as { name?: string }).name === 'm:e')
    .length;
}

/**
 * Estimate height multiplier by walking the OMML JSON tree.
 * Returns the cumulative vertical stacking factor.
 */
function estimateHeightMultiplier(node: unknown): number {
  if (!node || typeof node !== 'object') return 0;
  const n = node as { name?: string; elements?: unknown[] };

  // Equation array: height scales with row count + tallest row content
  if (n.name === 'm:eqArr') {
    const rows = countEqArrayRows(n as { elements?: unknown[] });
    const rowMultiplier = Math.max(0, rows - 1);
    // Also recurse into rows to find tall content (e.g., fraction inside a row)
    let maxRowContent = 0;
    if (Array.isArray(n.elements)) {
      for (const child of n.elements) {
        maxRowContent = Math.max(maxRowContent, estimateHeightMultiplier(child));
      }
    }
    return rowMultiplier + maxRowContent;
  }

  // Check if this node adds vertical height
  const selfMultiplier = n.name ? (VERTICAL_ELEMENTS[n.name] ?? 0) : 0;

  // Recurse into children, take the max child depth (deepest nesting path)
  let maxChild = 0;
  if (Array.isArray(n.elements)) {
    for (const child of n.elements) {
      maxChild = Math.max(maxChild, estimateHeightMultiplier(child));
    }
  }

  return selfMultiplier + maxChild;
}

/**
 * Estimate math run dimensions from text content and OMML structure.
 * When ommlJson is provided, the height scales based on vertical stacking
 * (fractions, bars, limits, equation arrays).
 */
export function estimateMathDimensions(textContent: string, ommlJson?: unknown): { width: number; height: number } {
  const multiplier = ommlJson ? estimateHeightMultiplier(ommlJson) : 0;
  return {
    width: Math.max(textContent.length * MATH_CHAR_WIDTH, MATH_MIN_WIDTH),
    height: Math.round(MATH_DEFAULT_HEIGHT * (1 + multiplier)),
  };
}
