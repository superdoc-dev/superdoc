/**
 * Shared justify alignment utilities.
 *
 * CRITICAL: This module provides the single source of truth for justify decisions.
 * Both the painter (visual rendering) and text measurement (caret positioning) MUST use
 * these functions to ensure consistent behavior and prevent caret drift.
 */

/**
 * Set of characters considered as spaces for justify distribution.
 * Includes both regular space and non-breaking space.
 */
export const SPACE_CHARS = new Set([' ', '\u00A0']);

/**
 * Parameters for determining whether to apply justify to a line.
 */
export type ShouldApplyJustifyParams = {
  /** Paragraph alignment value (must be 'justify' for justify to apply). */
  alignment: string | undefined;
  /** Whether the line has explicit tab positioning (tab stops with x values). */
  hasExplicitPositioning: boolean;
  /** Whether this is the last line of the paragraph. */
  isLastLineOfParagraph: boolean;
  /** Whether the paragraph ends with a soft break (Shift+Enter / LineBreak run). */
  paragraphEndsWithLineBreak: boolean;
  /** Explicit override to skip justify (e.g., from rendering context). */
  skipJustifyOverride?: boolean;
};

/**
 * Determines whether justify spacing should be applied to a line.
 *
 * Justify is applied when ALL of the following are true:
 * - Alignment is 'justify'
 * - No explicit skip override
 * - Line doesn't have tab stops (explicit positioning)
 * - Line is NOT the last line, OR paragraph ends with a soft break
 *
 * This matches Microsoft Word's behavior:
 * - All lines are justified except the true last line
 * - Soft breaks (Shift+Enter) do NOT count as "last line"
 * - Tab-aligned text is never justified
 *
 * @param params - Parameters for justify decision
 * @returns true if justify should be applied, false otherwise
 */
export function shouldApplyJustify(params: ShouldApplyJustifyParams): boolean {
  const { alignment, hasExplicitPositioning, isLastLineOfParagraph, paragraphEndsWithLineBreak, skipJustifyOverride } =
    params;

  // Must be justify alignment
  // Accept both 'justify' (normalized) and 'both' (raw OOXML) for defensive compatibility
  if (alignment !== 'justify' && alignment !== 'both') {
    return false;
  }

  // Explicit override to skip
  if (skipJustifyOverride === true) {
    return false;
  }

  // Lines with tab stops use explicit positioning
  if (hasExplicitPositioning) {
    return false;
  }

  // Skip justify on the true last line (but NOT if it ends with a soft break)
  if (isLastLineOfParagraph && !paragraphEndsWithLineBreak) {
    return false;
  }

  return true;
}

/**
 * Parameters for calculating justify spacing.
 */
export type CalculateJustifySpacingParams = {
  /** Line width (use naturalWidth ?? width to support compression). */
  lineWidth: number;
  /** Available width for the line. */
  availableWidth: number;
  /** Number of space characters in the line. */
  spaceCount: number;
  /** Whether justify should be applied (from shouldApplyJustify). */
  shouldJustify: boolean;
};

/**
 * Calculates the extra spacing to apply per space character for justify.
 *
 * Returns the number of pixels to add after each space (via CSS word-spacing).
 * Can be negative for compression (when line is slightly too wide).
 *
 * Returns 0 if:
 * - Justify should not be applied
 * - There are no spaces in the line (division by zero prevention)
 *
 * Formula: (availableWidth - lineWidth) / spaceCount
 *
 * @param params - Parameters for spacing calculation
 * @returns Extra spacing per space in pixels (can be negative)
 */
export function calculateJustifySpacing(params: CalculateJustifySpacingParams): number {
  const { lineWidth, availableWidth, spaceCount, shouldJustify } = params;

  // Don't justify if conditions aren't met
  if (!shouldJustify) {
    return 0;
  }

  // Can't distribute across zero spaces
  if (spaceCount <= 0) {
    return 0;
  }

  // Calculate slack (can be negative for compression)
  const slack = availableWidth - lineWidth;

  // Distribute slack evenly across all spaces
  return slack / spaceCount;
}
