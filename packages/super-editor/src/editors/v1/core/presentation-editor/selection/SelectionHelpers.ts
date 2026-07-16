import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { FlowBlock } from '@superdoc/contracts';
import { findParagraphBoundaries, findWordBoundaries } from '@superdoc/layout-bridge';
import { cellWrapping } from '@extensions/table/tableHelpers/cellWrapping.js';

/**
 * Unicode-aware regular expression for matching word characters.
 *
 * @remarks
 * This regex uses Unicode property escapes to match:
 * - \p{L}: Any Unicode letter (across all languages and scripts)
 * - \p{N}: Any Unicode number (digits in any script)
 * - '': Apostrophe (for contractions like "don't")
 * - ': Left/right single quotation marks (Unicode equivalents)
 * - _: Underscore (common in programming identifiers)
 * - ~: Tilde (used in some contexts)
 * - -: Hyphen (for hyphenated words)
 *
 * The 'u' flag enables Unicode mode for proper Unicode property escape support.
 */
const WORD_CHARACTER_REGEX = /[\p{L}\p{N}'\u2018\u2019_~-]/u;

/**
 * Determines if a character is considered part of a word for selection purposes.
 *
 * This function uses a Unicode-aware regex to test whether a character should be
 * included in word-based selection operations. It supports international characters
 * and common punctuation used within words.
 *
 * @param char - The character to test (typically a single character string)
 * @returns True if the character is a word character, false otherwise
 *
 * @remarks
 * Word character definition:
 * - Unicode letters in any language (Latin, Cyrillic, CJK, etc.)
 * - Unicode digits in any script
 * - Apostrophes and quotation marks (for contractions)
 * - Underscores, tildes, and hyphens
 *
 * Non-word characters include:
 * - Whitespace (spaces, tabs, newlines)
 * - Most punctuation (periods, commas, semicolons, etc.)
 * - Empty strings
 *
 * This function is used by word boundary detection logic to determine where
 * words start and end during double-click selection and word-based navigation.
 *
 * @example
 * ```typescript
 * isWordCharacter('a');  // true (letter)
 * isWordCharacter('5');  // true (digit)
 * isWordCharacter("'");  // true (apostrophe for contractions)
 * isWordCharacter(' ');  // false (whitespace)
 * isWordCharacter('.');  // false (punctuation)
 * isWordCharacter('');   // false (empty string)
 * isWordCharacter('文'); // true (Unicode letter - Chinese character)
 * ```
 */
export function isWordCharacter(char: string): boolean {
  if (!char) {
    return false;
  }
  return WORD_CHARACTER_REGEX.test(char);
}

/**
 * Calculates extended selection boundaries based on the selection mode.
 *
 * This function expands a selection range to align with word or paragraph boundaries,
 * depending on the specified mode. It handles both forward and backward selections
 * correctly, ensuring the selection extends in the expected direction.
 *
 * @param blocks - Array of layout blocks containing text content
 * @param anchor - The anchor position (where selection started)
 * @param head - The head position (current selection endpoint)
 * @param mode - Selection extension mode: 'char', 'word', or 'para'
 * @returns Object with selAnchor and selHead representing the extended selection range
 *
 * @remarks
 * Selection modes:
 * - 'char': Character-level selection (no extension) - returns input positions unchanged
 * - 'word': Extends to word boundaries using findWordBoundaries
 * - 'para': Extends to paragraph boundaries using findParagraphBoundaries
 *
 * Forward selection (head >= anchor):
 * - Anchor extends to the start of its containing unit (word/paragraph)
 * - Head extends to the end of its containing unit
 * - This expands the selection to include complete units
 *
 * Backward selection (head < anchor):
 * - Anchor extends to the end of its containing unit
 * - Head extends to the start of its containing unit
 * - This maintains the backward direction while expanding to complete units
 *
 * Fallback behavior:
 * - If boundary finding fails (returns null), falls back to character mode
 * - Returns original positions if mode is 'char'
 * - Gracefully handles invalid positions
 *
 * This function is typically called during:
 * - Double-click (word mode)
 * - Triple-click (paragraph mode)
 * - Shift+arrow key navigation with word/paragraph modifiers
 * - Drag extension in word/paragraph selection modes
 *
 * @example
 * ```typescript
 * // Double-click on a word: extend to full word
 * const wordSelection = calculateExtendedSelection(
 *   blocks,
 *   clickPos,
 *   clickPos,
 *   'word'
 * );
 * // Result: { selAnchor: wordStart, selHead: wordEnd }
 *
 * // Triple-click: extend to full paragraph
 * const paraSelection = calculateExtendedSelection(
 *   blocks,
 *   clickPos,
 *   clickPos,
 *   'para'
 * );
 * // Result: { selAnchor: paraStart, selHead: paraEnd }
 *
 * // Character-level selection (no extension)
 * const charSelection = calculateExtendedSelection(
 *   blocks,
 *   anchor,
 *   head,
 *   'char'
 * );
 * // Result: { selAnchor: anchor, selHead: head }
 * ```
 */
export function calculateExtendedSelection(
  blocks: FlowBlock[],
  anchor: number,
  head: number,
  mode: 'char' | 'word' | 'para',
): { selAnchor: number; selHead: number } {
  if (mode === 'word') {
    const anchorBounds = findWordBoundaries(blocks, anchor);
    const headBounds = findWordBoundaries(blocks, head);
    if (anchorBounds && headBounds) {
      if (head >= anchor) {
        // Dragging/extending forward: anchor at start of anchor word, head at end of head word
        return { selAnchor: anchorBounds.from, selHead: headBounds.to };
      } else {
        // Dragging/extending backward: anchor at end of anchor word, head at start of head word
        return { selAnchor: anchorBounds.to, selHead: headBounds.from };
      }
    }
  } else if (mode === 'para') {
    const anchorBounds = findParagraphBoundaries(blocks, anchor);
    const headBounds = findParagraphBoundaries(blocks, head);
    if (anchorBounds && headBounds) {
      if (head >= anchor) {
        // Dragging/extending forward: anchor at start of anchor para, head at end of head para
        return { selAnchor: anchorBounds.from, selHead: headBounds.to };
      } else {
        // Dragging/extending backward: anchor at end of anchor para, head at start of head para
        return { selAnchor: anchorBounds.to, selHead: headBounds.from };
      }
    }
  }

  // Fallback to character mode (no extension) if boundaries not found or mode is 'char'
  return { selAnchor: anchor, selHead: head };
}

/**
 * Detects when extending a text selection from `anchor` to `head` would be collapsed by
 * prosemirror-tables' selection normalization.
 *
 * prosemirror-tables (`normalizeSelection` -> `isTextSelectionAcrossCells`) rewrites a
 * TextSelection to the anchor block's own bounds when the two endpoints resolve to different
 * table cells AND the head sits at the very start of its block (`parentOffset === 0`). An
 * empty paragraph inside a cell only ever has `parentOffset === 0`, so dragging a body
 * selection into (or through) an empty cell paragraph collapses the whole selection back to
 * the run at the anchor — e.g. `[44, 2026]` becomes `[44, 49]`. (SD-3328.)
 *
 * Returns true when extending to `head` would trigger that collapse, so a drag handler can
 * keep the last good selection for that frame instead of dispatching a doomed one. Mirrors
 * the upstream condition exactly; the regression test pins it against real editor behavior.
 *
 * @param doc - The current ProseMirror document.
 * @param anchor - The selection anchor position.
 * @param head - The prospective selection head position.
 * @returns True if dispatching `TextSelection(anchor, head)` would be normalized to a collapse.
 */
export function selectionCollapsesAcrossTableCells(doc: ProseMirrorNode, anchor: number, head: number): boolean {
  if (anchor === head) return false;

  // Fail open: if the document shape is unexpected or a position is out of range, never block
  // the selection — extending it is the safe default. This also keeps the guard a no-op for
  // callers that pass a minimal doc stub.
  try {
    const size = doc.content.size;
    if (anchor < 0 || head < 0 || anchor > size || head > size) return false;

    const $from = doc.resolve(Math.min(anchor, head));
    const $to = doc.resolve(Math.max(anchor, head));

    // Mirrors prosemirror-tables `isTextSelectionAcrossCells`: endpoints in different cells
    // (or one outside the table entirely) with the head at the start of its block.
    return cellWrapping($from) !== cellWrapping($to) && $to.parentOffset === 0;
  } catch {
    return false;
  }
}

/**
 * Returns a stable text-selection range for drags that cross a table boundary.
 *
 * prosemirror-tables collapses a text selection when its upper endpoint sits at the start of a
 * block in a different cell context. For empty textblocks there is no interior position to keep,
 * so the closest stable endpoint is the position immediately after that empty block. Using that
 * endpoint preserves the intended visual extent without pulling visible characters into the range.
 *
 * Returns the original endpoints when they are already safe, a stabilized pair for the empty-
 * textblock case, or null when the selection would still collapse.
 */
export function stabilizeTextSelectionAcrossTableCells(
  doc: ProseMirrorNode,
  anchor: number,
  head: number,
): { selAnchor: number; selHead: number } | null {
  if (!selectionCollapsesAcrossTableCells(doc, anchor, head)) {
    return { selAnchor: anchor, selHead: head };
  }

  try {
    const anchorIsUpper = anchor > head;
    const upperPos = anchorIsUpper ? anchor : head;
    if (upperPos < 0 || upperPos >= doc.content.size) return null;

    const $upper = doc.resolve(upperPos);
    if (!$upper.parent.inlineContent || $upper.parent.content.size !== 0) {
      return null;
    }

    const stabilizedUpperPos = upperPos + 1;
    if (stabilizedUpperPos > doc.content.size) return null;

    const selAnchor = anchorIsUpper ? stabilizedUpperPos : anchor;
    const selHead = anchorIsUpper ? head : stabilizedUpperPos;
    if (selectionCollapsesAcrossTableCells(doc, selAnchor, selHead)) {
      return null;
    }

    return { selAnchor, selHead };
  } catch {
    return null;
  }
}
