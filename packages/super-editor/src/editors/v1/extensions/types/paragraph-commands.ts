/**
 * Command type augmentations for paragraph and list-related commands.
 *
 * @module ParagraphCommands
 */

export interface ParagraphCommands {
  // ============================================
  // LIST COMMANDS
  // ============================================

  /** Toggle ordered list formatting on the current selection */
  toggleOrderedList: () => boolean;

  /** Toggle bullet list formatting on the current selection */
  toggleBulletList: () => boolean;

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
}

declare module '../../core/types/ChainedCommands.js' {
  interface ExtensionCommandMap extends ParagraphCommands {}
}
