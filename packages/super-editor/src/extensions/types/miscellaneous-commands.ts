/**
 * Command type augmentations for miscellaneous extension commands.
 *
 * @module MiscellaneousCommands
 */

// ============================================
// FIELD ANNOTATION TYPES
// ============================================

export type FieldAnnotationCommandAttrs = {
  displayLabel?: string;
  defaultDisplayLabel?: string;
  fieldId?: string;
  fieldType?: string;
  fieldColor?: string;
  hash?: string;
};

export type ReplaceWithFieldAnnotationItem = {
  from: number;
  to: number;
  attrs: FieldAnnotationCommandAttrs;
};

// ============================================
// LINKED STYLE TYPES
// ============================================

/** Style definition from Word document */
export type LinkedStyle = {
  /** Style ID (e.g., 'Heading1', 'Normal') */
  id: string | null;
  /** Style type ('paragraph' or 'character') */
  type?: 'paragraph' | 'character';
  /** Style definition from Word */
  definition?: Record<string, unknown>;
};

/** Optional node type hint for linked style commands */
export type LinkedStyleNodeType = 'paragraph' | 'character' | string;

// ============================================
// SECTION/HEADER FOOTER TYPES
// ============================================

/** Options for insertSectionBreakAtSelection */
export type InsertSectionBreakOptions = {
  /** Distance from page top to content area in inches (must be >= 0) */
  headerInches?: number;
  /** Distance from page bottom to content area in inches (must be >= 0) */
  footerInches?: number;
};

/** Options for setBodyHeaderFooter */
export type SetBodyHeaderFooterOptions = {
  /** Distance from page top to content area in inches (must be >= 0) */
  headerInches?: number;
  /** Distance from page bottom to content area in inches (must be >= 0) */
  footerInches?: number;
};

// ============================================
// CONTENT BLOCK TYPES
// ============================================

/** Configuration for insertContentBlock */
export type ContentBlockConfig = {
  /** Whether this is a horizontal rule */
  horizontalRule?: boolean;
  /** Size configuration */
  size?: {
    top?: number;
    left?: number;
    width?: number | string;
    height?: number | string;
  };
  /** Background color */
  background?: string;
};

// ============================================
// DOCUMENT STATS
// ============================================

/** Document statistics returned by getDocumentStats */
export type DocumentStats = {
  /** Number of words in the document */
  words: number;
  /** Number of characters in the document */
  characters: number;
  /** Number of paragraphs in the document */
  paragraphs: number;
};

export interface MiscellaneousCommands {
  // ============================================
  // FIELD ANNOTATION COMMANDS
  // ============================================

  /**
   * Add a field annotation at the specified position
   * @param pos - Position in the document
   * @param attrs - Field annotation attributes
   * @param editorFocus - Whether to focus the editor after insertion
   * @example
   * editor.commands.addFieldAnnotation(0, {
   *   displayLabel: 'Enter your info',
   *   fieldId: '123',
   *   fieldType: 'TEXTINPUT',
   *   fieldColor: '#980043',
   * })
   */
  addFieldAnnotation: (pos: number, attrs?: FieldAnnotationCommandAttrs, editorFocus?: boolean) => boolean;

  /**
   * Add a field annotation at the current selection
   * @param attrs - Field annotation attributes
   * @param editorFocus - Whether to focus the editor after insertion
   */
  addFieldAnnotationAtSelection: (attrs?: FieldAnnotationCommandAttrs, editorFocus?: boolean) => boolean;

  /**
   * Replace text ranges with field annotations
   * @param fieldsArray - Array of field definitions with from, to, and attrs
   * @example
   * editor.commands.replaceWithFieldAnnotation([
   *   { from: 20, to: 45, attrs: { fieldType: 'TEXTINPUT', fieldColor: '#980043' } }
   * ])
   */
  replaceWithFieldAnnotation: (fieldsArray: ReplaceWithFieldAnnotationItem[]) => boolean;

  // ============================================
  // PAGE NUMBER COMMANDS
  // ============================================

  /**
   * Insert an automatic page number at the current position
   * @note Only works in header/footer contexts
   * @example
   * editor.commands.addAutoPageNumber()
   */
  addAutoPageNumber: () => boolean;

  /**
   * Insert total page count at the current position
   * @note Only works in header/footer contexts
   * @example
   * editor.commands.addTotalPageCount()
   */
  addTotalPageCount: () => boolean;

  // ============================================
  // LINKED STYLES COMMANDS
  // ============================================

  /**
   * Apply a linked style to the selected paragraphs
   * @param style - The style object to apply
   * @example
   * const style = editor.helpers.linkedStyles.getStyleById('Heading1');
   * editor.commands.setLinkedStyle(style);
   */
  setLinkedStyle: (style: LinkedStyle) => boolean;

  /**
   * Toggle a linked style on the current selection
   * @param style - The linked style to toggle
   * @param nodeType - Optional node type hint (e.g., 'paragraph')
   * @note Removes style if already applied, applies it if not
   */
  toggleLinkedStyle: (style: LinkedStyle, nodeType?: LinkedStyleNodeType) => boolean;

  /**
   * Apply a linked style by its ID
   * @param styleId - The style ID to apply (e.g., 'Heading1')
   * @example
   * editor.commands.setStyleById('Heading1')
   */
  setStyleById: (styleId: string) => boolean;

  // ============================================
  // LINE/PAGE BREAK COMMANDS
  // ============================================

  /**
   * Insert a line break (soft break within same paragraph)
   * @example
   * editor.commands.insertLineBreak()
   */
  insertLineBreak: () => boolean;

  /**
   * Insert a page break
   * @example
   * editor.commands.insertPageBreak()
   * @note Forces content to start on a new page when printed
   */
  insertPageBreak: () => boolean;

  // ============================================
  // CONTENT BLOCK COMMANDS
  // ============================================

  /**
   * Insert a horizontal rule
   * @example
   * editor.commands.insertHorizontalRule()
   */
  insertHorizontalRule: () => boolean;

  /**
   * Insert a content block
   * @param config - Block configuration
   * @example
   * // Insert a spacer block
   * editor.commands.insertContentBlock({ size: { height: 20 } })
   *
   * // Insert a colored divider
   * editor.commands.insertContentBlock({
   *   size: { width: '50%', height: 3 },
   *   background: '#3b82f6'
   * })
   */
  insertContentBlock: (config: ContentBlockConfig) => boolean;

  // ============================================
  // SECTION COMMANDS
  // ============================================

  /**
   * Insert a section break at the current selection
   * @param options - Optional margin values in inches
   * @example
   * editor.commands.insertSectionBreakAtSelection()
   * editor.commands.insertSectionBreakAtSelection({ headerInches: 0.5, footerInches: 0.5 })
   */
  insertSectionBreakAtSelection: (options?: InsertSectionBreakOptions) => boolean;

  /**
   * Set body default header/footer distances
   * @param options - Margin values in inches
   * @example
   * editor.commands.setBodyHeaderFooter({ headerInches: 0.5, footerInches: 0.5 })
   */
  setBodyHeaderFooter: (options?: SetBodyHeaderFooterOptions) => boolean;

  /**
   * Set section header/footer distances at selection
   * @param options - Margin values in inches
   */
  setSectionHeaderFooterAtSelection: (options?: SetBodyHeaderFooterOptions) => boolean;

  /**
   * Set section page margins (top/right/bottom/left) at selection.
   * Updates the governing section's sectPr so changes persist to layout/export.
   * @param options - Margin values in inches
   */
  setSectionPageMarginsAtSelection: (options?: {
    topInches?: number;
    rightInches?: number;
    bottomInches?: number;
    leftInches?: number;
  }) => boolean;

  // ============================================
  // DOCUMENT COMMANDS
  // ============================================

  /**
   * Clear entire document content
   * @note Replaces all content with an empty paragraph
   */
  clearDocument: () => boolean;

  /**
   * Get document statistics (word count, character count, paragraphs)
   * @returns Document statistics object
   * @example
   * const stats = editor.commands.getDocumentStats()
   * console.log(`${stats.words} words`)
   */
  getDocumentStats: () => DocumentStats;
}

declare module '../../core/types/ChainedCommands.js' {
  interface ExtensionCommandMap extends MiscellaneousCommands {}
}
