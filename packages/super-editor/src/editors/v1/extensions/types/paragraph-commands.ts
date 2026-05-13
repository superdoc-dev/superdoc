/**
 * Command type augmentations for paragraph and list-related commands.
 *
 * @module ParagraphCommands
 */

export type BulletStyle = 'disc' | 'circle' | 'square';

export type OrderedListStyle =
  | 'decimal'
  | 'decimal-paren'
  | 'upper-roman'
  | 'lower-roman'
  | 'upper-alpha'
  | 'upper-alpha-paren'
  | 'lower-alpha'
  | 'lower-alpha-paren';

export interface ParagraphCommands {
  // ============================================
  // LIST COMMANDS
  // ============================================

  /** Toggle ordered list formatting on the current selection */
  toggleOrderedList: () => boolean;

  /** Toggle bullet list formatting on the current selection */
  toggleBulletList: () => boolean;

  /** Toggle a bullet list with a specific style ('disc' | 'circle' | 'square') */
  toggleBulletListStyle: (style: BulletStyle) => boolean;

  /** Toggle an ordered list with a specific numbering style */
  toggleOrderedListStyle: (style: OrderedListStyle) => boolean;

  /** Restart numbering for the current list item */
  restartNumbering: () => boolean;

  /** Increase indentation level of the current list item */
  increaseListIndent: () => boolean;

  /** Decrease indentation level of the current list item */
  decreaseListIndent: () => boolean;

  // ============================================
  // TEXT INDENTATION COMMANDS
  // ============================================

  /**
   * Increase text indentation by the default increment (36 points)
   */
  increaseTextIndent: () => boolean;

  /**
   * Decrease text indentation by the default increment (36 points)
   */
  decreaseTextIndent: () => boolean;

  /**
   * Set text indentation to a specific value in points
   * @param points - Indentation value in points (e.g., 72 for 1 inch)
   */
  setTextIndentation: (points: number) => boolean;

  /**
   * Remove text indentation from selected paragraphs
   */
  unsetTextIndentation: () => boolean;

  // ============================================
  // LINE HEIGHT COMMANDS
  // ============================================

  /** Set line height for paragraphs */
  setLineHeight: (value: number | string) => boolean;

  /** Reset line height to default */
  unsetLineHeight: () => boolean;

  // ============================================
  // PARAGRAPH DIRECTION COMMANDS
  // ============================================

  /**
   * Set paragraph direction (LTR/RTL) on every paragraph in the current selection.
   * When `alignmentPolicy` is `"matchDirection"`, an explicit `justification` of
   * `"left"` ↔ `"right"` is mirrored to follow the new direction.
   */
  setParagraphDirection: (input: { direction: 'ltr' | 'rtl'; alignmentPolicy?: 'matchDirection' }) => boolean;

  /** Clear an explicit paragraph direction override (revert to auto-resolved). */
  clearParagraphDirection: () => boolean;
}

declare module '../../core/types/ChainedCommands.js' {
  interface ExtensionCommandMap extends ParagraphCommands {}
}
