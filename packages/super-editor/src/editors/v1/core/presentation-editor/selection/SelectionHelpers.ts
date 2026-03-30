import type { FlowBlock } from '@superdoc/contracts';
import { findParagraphBoundaries, findWordBoundaries } from '@superdoc/layout-bridge';

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
