import type { ParagraphBlock, ParagraphIndent, WordLayoutConfig } from '@superdoc/contracts';
import { resolveListTextStartPx, type MinimalWordLayout } from '@superdoc/common/list-marker-utils';

/**
 * Utilities for list item detection and text indent calculation.
 *
 * These functions provide consistent logic for determining whether a block is a list item
 * and calculating the correct text start position based on list type (standard hanging indent
 * vs. firstLineIndentMode).
 *
 * **Background:**
 * SuperDoc supports two distinct list rendering modes:
 * 1. **Standard hanging indent lists**: Marker sits in the hanging indent area, text starts at paraIndentLeft
 * 2. **First-line indent mode lists**: Marker is positioned at paraIndentLeft + firstLine, text starts at textStartPx
 *
 * The first-line indent mode is used by input-rule-created lists (e.g., typing "1. " or "- ") and requires
 * special handling to match Word's rendering behavior.
 */

/**
 * Extracts word layout configuration from paragraph attributes with type safety.
 *
 * @param block - The paragraph block to extract configuration from
 * @returns Typed word layout configuration, or undefined if not present
 *
 * @example
 * ```typescript
 * const config = getWordLayoutConfig(paragraphBlock);
 * if (config?.firstLineIndentMode) {
 *   const textStart = config.textStartPx ?? 0;
 * }
 * ```
 */
export function getWordLayoutConfig(block: ParagraphBlock | undefined): WordLayoutConfig | undefined {
  if (!block || block.kind !== 'paragraph') {
    return undefined;
  }
  return block.attrs?.wordLayout;
}

/**
 * Determines if a block is a list item based on multiple detection signals.
 *
 * This function uses a robust detection strategy that checks:
 * 1. **Marker width**: Primary signal - lists always have markers
 * 2. **List attributes**: Explicit list metadata from ProseMirror
 * 3. **Indent pattern**: Hanging indent + left indent suggests a list structure
 *
 * The multi-signal approach handles edge cases where layout data might be stale
 * or incomplete (e.g., a newly created list item before full layout).
 *
 * @param markerWidth - The measured width of the list marker in pixels (0 for non-lists)
 * @param block - The paragraph block to check (may be undefined for defensive coding)
 * @returns True if the block is a list item, false otherwise
 *
 * @example
 * ```typescript
 * const markerWidth = fragment.markerWidth ?? measure.marker?.markerWidth ?? 0;
 * if (isListItem(markerWidth, block)) {
 *   // Apply list-specific text positioning
 * }
 * ```
 */
export function isListItem(markerWidth: number, block: ParagraphBlock | undefined): boolean {
  const hasMarkerWidth = markerWidth > 0;
  if (hasMarkerWidth) {
    return true;
  }

  // When marker width is 0, check for list-related attributes as fallback
  if (!block || block.kind !== 'paragraph') {
    return false;
  }

  const wordLayout = getWordLayoutConfig(block);
  const rawAttrs = block.attrs as unknown as Record<string, unknown> | undefined;
  const hasListItemAttr = rawAttrs?.listItem != null;
  const hasListAttrs = hasListItemAttr || block.attrs?.numberingProperties != null || wordLayout?.marker != null;

  if (hasListAttrs) {
    return true;
  }

  // Check indent pattern: hanging indent with left indent is a strong signal
  const hangingIndent = block.attrs?.indent?.hanging ?? 0;
  const paraIndentLeft = block.attrs?.indent?.left ?? 0;
  const hasHangingIndentPattern = hangingIndent > 0 && paraIndentLeft > 0;

  return hasHangingIndentPattern;
}

/**
 * Configuration for calculating text start indent.
 *
 * This type defines all the parameters needed to calculate where text content
 * starts horizontally within a paragraph fragment. It supports both standard
 * paragraphs and list items (with standard hanging indent or first-line indent mode).
 *
 * All measurements are in pixels.
 *
 * @example
 * ```typescript
 * // Standard list item (hanging indent mode)
 * const standardListParams: TextIndentCalculationParams = {
 *   isFirstLine: true,
 *   isListItem: true,
 *   markerWidth: 18,
 *   paraIndentLeft: 36,
 *   firstLineIndent: 0,
 *   hangingIndent: 18,
 *   wordLayout: undefined
 * };
 * const indent = calculateTextStartIndent(standardListParams);
 * // Returns: 36 (text starts at paraIndentLeft)
 * ```
 *
 * @example
 * ```typescript
 * // First-line indent mode list item (input-rule created)
 * const firstLineIndentParams: TextIndentCalculationParams = {
 *   isFirstLine: true,
 *   isListItem: true,
 *   markerWidth: 20,
 *   paraIndentLeft: 36,
 *   firstLineIndent: 0,
 *   hangingIndent: 18,
 *   wordLayout: {
 *     firstLineIndentMode: true,
 *     textStartPx: 56  // Pre-calculated position after marker + tab
 *   }
 * };
 * const indent = calculateTextStartIndent(firstLineIndentParams);
 * // Returns: 56 (from textStartPx)
 * ```
 *
 * @example
 * ```typescript
 * // Non-list paragraph with first-line indent
 * const paragraphParams: TextIndentCalculationParams = {
 *   isFirstLine: true,
 *   isListItem: false,
 *   markerWidth: 0,
 *   paraIndentLeft: 36,
 *   firstLineIndent: 18,
 *   hangingIndent: 0,
 *   wordLayout: undefined
 * };
 * const indent = calculateTextStartIndent(paragraphParams);
 * // Returns: 54 (paraIndentLeft + firstLineIndent)
 * ```
 *
 * @example
 * ```typescript
 * // Second line of a list item (no first-line indent applied)
 * const secondLineParams: TextIndentCalculationParams = {
 *   isFirstLine: false,
 *   isListItem: true,
 *   markerWidth: 20,
 *   paraIndentLeft: 36,
 *   firstLineIndent: 0,
 *   hangingIndent: 18,
 *   wordLayout: { firstLineIndentMode: true, textStartPx: 56 }
 * };
 * const indent = calculateTextStartIndent(secondLineParams);
 * // Returns: 36 (paraIndentLeft only, no special handling on non-first lines)
 * ```
 */
export type TextIndentCalculationParams = {
  /** Whether this is the first line of the paragraph fragment */
  isFirstLine: boolean;
  /** Whether the block is a list item (from isListItem) */
  isListItem: boolean;
  /** Measured marker width in pixels */
  markerWidth: number;
  /** Measured marker text width in pixels (optional, falls back to markerWidth) */
  markerTextWidth?: number;
  /** Left paragraph indent in pixels */
  paraIndentLeft: number;
  /** First-line indent in pixels (positive pushes first line right, negative pulls it left) */
  firstLineIndent: number;
  /** Hanging indent in pixels (creates space for markers) */
  hangingIndent: number;
  /** Word layout configuration (if present) */
  wordLayout?: WordLayoutConfig;
};

/**
 * Calculates the horizontal text indent adjustment for a line.
 *
 * This function implements the complex logic for determining where text content
 * starts on a line, accounting for:
 * - List markers (standard hanging indent vs. first-line indent mode)
 * - Paragraph indents (left, first-line, hanging)
 * - Non-list paragraphs with first-line indents
 *
 * **Algorithm:**
 * 1. For list items on the first line:
 *    - Use shared `resolveListTextStartPx` as the canonical source
 *    - Fall back to explicit producer-provided `textStart` values only
 * 2. For non-list paragraphs on the first line:
 *    - Add first-line offset (firstLineIndent - hangingIndent)
 * 3. For all other lines:
 *    - Use paraIndentLeft only
 *
 * @param params - Text indent calculation parameters
 * @returns Horizontal indent adjustment in pixels from fragment.x
 *
 * @example
 * ```typescript
 * const indent = calculateTextStartIndent({
 *   isFirstLine: true,
 *   isListItem: true,
 *   markerWidth: 20,
 *   paraIndentLeft: 36,
 *   firstLineIndent: 0,
 *   hangingIndent: 18,
 *   wordLayout: { firstLineIndentMode: true, textStartPx: 56 }
 * });
 * // Returns: 56 (from textStartPx)
 * ```
 */
export function calculateTextStartIndent(params: TextIndentCalculationParams): number {
  const {
    isFirstLine,
    isListItem,
    markerWidth,
    markerTextWidth,
    paraIndentLeft,
    firstLineIndent,
    hangingIndent,
    wordLayout,
  } = params;

  // Calculate first-line offset (used for non-list paragraphs)
  const firstLineOffset = firstLineIndent - hangingIndent;
  const effectiveMarkerTextWidth =
    typeof markerTextWidth === 'number' && Number.isFinite(markerTextWidth) && markerTextWidth > 0
      ? markerTextWidth
      : markerWidth;

  // Start with paragraph left indent as the base
  let indentAdjust = paraIndentLeft;

  if (isListItem && isFirstLine) {
    // Canonical list text-start resolution lives in shared/common/list-marker-utils.
    const resolvedTextStart = resolveListTextStartPx(
      wordLayout as MinimalWordLayout | undefined,
      paraIndentLeft,
      Math.max(firstLineIndent, 0),
      Math.max(hangingIndent, 0),
      () => effectiveMarkerTextWidth, // Use measured marker text width when available
    );

    if (typeof resolvedTextStart === 'number' && Number.isFinite(resolvedTextStart)) {
      indentAdjust = resolvedTextStart;
    } else {
      // Trust explicit producer values only; do not re-derive list geometry locally.
      const explicitTextStart = wordLayout?.marker?.textStartX ?? wordLayout?.textStartPx;
      if (typeof explicitTextStart === 'number' && Number.isFinite(explicitTextStart)) {
        indentAdjust = explicitTextStart;
      }
    }
  } else if (isFirstLine && !isListItem) {
    // Non-list paragraph: apply first-line offset on the first line
    indentAdjust += firstLineOffset;
  }
  // For standard lists or non-first lines, indentAdjust remains paraIndentLeft

  return indentAdjust;
}

/**
 * Safely extracts paragraph indent values with type validation.
 *
 * This helper function ensures all indent values are valid numbers, preventing
 * runtime errors from malformed or missing data.
 *
 * @param indent - Paragraph indent object (may be undefined)
 * @returns Object with validated numeric indent values (defaults to 0)
 *
 * @example
 * ```typescript
 * const { left, firstLine, hanging } = extractParagraphIndent(block.attrs?.indent);
 * const textStart = left + firstLine - hanging;
 * ```
 */
export function extractParagraphIndent(indent: ParagraphIndent | undefined): {
  left: number;
  right: number;
  firstLine: number;
  hanging: number;
} {
  const left = typeof indent?.left === 'number' && Number.isFinite(indent.left) ? indent.left : 0;
  const right = typeof indent?.right === 'number' && Number.isFinite(indent.right) ? indent.right : 0;
  const firstLine = typeof indent?.firstLine === 'number' && Number.isFinite(indent.firstLine) ? indent.firstLine : 0;
  const hanging = typeof indent?.hanging === 'number' && Number.isFinite(indent.hanging) ? indent.hanging : 0;

  return { left, right, firstLine, hanging };
}
