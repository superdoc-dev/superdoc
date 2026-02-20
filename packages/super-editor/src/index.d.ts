/**
 * Main type declarations for @superdoc/super-editor
 * This file provides TypeScript types for the JavaScript exports in index.js
 */

import type { EditorView } from 'prosemirror-view';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { Schema, Node as ProseMirrorNode, Mark as ProseMirrorMark } from 'prosemirror-model';

// ============================================
// COMMAND TYPES (inlined from ChainedCommands.ts)
// ============================================

/**
 * Map of built-in command names to their parameter signatures.
 * Extensions can augment this interface to add more precise types.
 */
export interface CoreCommandMap {}

/**
 * Map of extension command names to their parameter signatures.
 * Extensions should augment this interface via module augmentation.
 */
export interface ExtensionCommandMap {}

/**
 * Props passed to command functions
 */
export interface CommandProps {
  editor: Editor;
  tr: Transaction;
  state: EditorState;
  view: EditorView;
  dispatch?: (tr: Transaction) => void;
}

/**
 * A command function signature
 */
export type Command = (props: CommandProps) => boolean;

/**
 * Chainable command object returned by editor.chain()
 */
export interface ChainableCommandObject {
  run: () => boolean;
  [commandName: string]: ((...args: any[]) => ChainableCommandObject) | (() => boolean);
}

/**
 * Chained command type
 */
export type ChainedCommand = ChainableCommandObject;

/**
 * Object returned by editor.can()
 */
export interface CanObject {
  chain: () => ChainableCommandObject;
  [commandName: string]: ((...args: any[]) => boolean) | (() => ChainableCommandObject);
}

/**
 * All available editor commands.
 * Commands are dynamically populated from extensions.
 */
export interface EditorCommands {
  // Core commands
  focus: (position?: 'start' | 'end' | 'all' | number | boolean | null) => boolean;
  blur: () => boolean;

  // Formatting commands (from extensions)
  toggleBold: () => boolean;
  toggleItalic: () => boolean;
  toggleUnderline: () => boolean;
  toggleStrike: () => boolean;
  toggleHighlight: (color?: string) => boolean;

  // Font commands
  setFontSize: (size: string | number) => boolean;
  setFontFamily: (family: string) => boolean;
  setTextColor: (color: string) => boolean;

  // Alignment commands
  setTextAlign: (alignment: 'left' | 'center' | 'right' | 'justify') => boolean;

  // List commands
  toggleBulletList: () => boolean;
  toggleOrderedList: () => boolean;

  // History commands
  undo: () => boolean;
  redo: () => boolean;

  // Link commands
  setLink: (attrs: { href: string; target?: string }) => boolean;
  unsetLink: () => boolean;

  // Table commands
  insertTable: (options?: { rows?: number; cols?: number }) => boolean;
  deleteTable: () => boolean;
  addRowBefore: () => boolean;
  addRowAfter: () => boolean;
  addColumnBefore: () => boolean;
  addColumnAfter: () => boolean;
  deleteRow: () => boolean;
  deleteColumn: () => boolean;
  mergeCells: () => boolean;
  splitCell: () => boolean;

  // Image commands
  insertImage: (attrs: { src: string; alt?: string }) => boolean;

  // Selection commands
  selectAll: () => boolean;

  // Content commands
  insertContent: (content: any) => boolean;
  setContent: (content: any) => boolean;
  clearContent: () => boolean;

  // Allow any other command (for extension commands)
  [commandName: string]: ((...args: any[]) => boolean) | undefined;
}

// ============================================
// DATA TYPES
// ============================================

/** An unsupported HTML element that was dropped during import. */
export interface UnsupportedContentItem {
  /** The tag name, e.g. "HR", "DETAILS" */
  tagName: string;
  /** The outerHTML of the element (truncated to 200 chars) */
  outerHTML: string;
  /** How many instances of this tag were dropped */
  count: number;
}

/** Binary data source (works in both browser and Node.js - Buffer extends Uint8Array) */
export type BinaryData = ArrayBuffer | ArrayBufferView;

export interface DocxFileEntry {
  name: string;
  content: string;
}

export interface OpenOptions {
  mode?: 'docx' | 'text' | 'html';
  html?: string;
  markdown?: string;
  json?: object | null;
  isCommentsEnabled?: boolean;
  suppressDefaultDocxStyles?: boolean;
  documentMode?: 'editing' | 'viewing' | 'suggesting';
  content?: unknown;
  mediaFiles?: Record<string, unknown>;
  fonts?: Record<string, unknown>;
}

// ============================================
// EDITOR CLASS
// ============================================

/**
 * The main Editor class for SuperDoc.
 * Provides a rich text editing experience built on ProseMirror.
 */
export declare class Editor {
  /**
   * Creates a new Editor instance.
   * @param options - Editor configuration options
   */
  constructor(options?: {
    element?: HTMLElement;
    content?: string | object;
    extensions?: any[];
    editable?: boolean;
    autofocus?: boolean | 'start' | 'end' | 'all' | number;
    [key: string]: any;
  });

  /** Load and parse a DOCX file into XML data for headless processing. */
  static loadXmlData(
    fileSource: File | Blob | BinaryData,
    isNode?: boolean,
  ): Promise<[DocxFileEntry[], Record<string, unknown>, Record<string, unknown>, Record<string, unknown>] | undefined>;

  /** Open a document with smart defaults. */
  static open(
    source?: string | File | Blob | BinaryData,
    config?: Partial<{
      element?: HTMLElement;
      selector?: string;
      [key: string]: any;
    }> &
      OpenOptions,
  ): Promise<Editor>;

  /** ProseMirror view instance (undefined in headless mode) */
  view?: EditorView;

  /** ProseMirror schema */
  schema: Schema;

  /** Editor converter for import/export */
  converter?: any;

  /** Presentation editor instance for pages mode */
  presentationEditor?: {
    element?: HTMLElement;
    [key: string]: any;
  };

  /** Editor options passed during construction */
  options: {
    element?: HTMLElement;
    [key: string]: any;
  };

  /** Current editor state */
  state: EditorState;

  /** Whether the editor is currently editable */
  isEditable: boolean;

  /** Whether the editor has been destroyed */
  isDestroyed: boolean;

  /** Update page style (for pages mode) */
  updatePageStyle?: (styles: Record<string, unknown>) => void;

  /** Get current page styles (for pages mode) */
  getPageStyles?: () => Record<string, unknown>;

  /** Get coordinates at a document position */
  coordsAtPos?: (pos: number) => { left: number; top: number } | undefined;

  /** Get the DOM element for a document position */
  getElementAtPos?: (
    pos: number,
    options?: { forceRebuild?: boolean; fallbackToCoords?: boolean },
  ) => HTMLElement | null;

  /**
   * Command service - provides access to all editor commands.
   * @example
   * editor.commands.toggleBold();
   * editor.commands.setFontSize('14pt');
   */
  commands: EditorCommands;

  /**
   * Create a chain of commands to call multiple commands at once.
   * Commands are executed in order when `.run()` is called.
   * @example
   * editor.chain().toggleBold().toggleItalic().run();
   */
  chain(): ChainedCommand;

  /**
   * Check if a command or chain of commands can be executed without executing it.
   * @example
   * if (editor.can().toggleBold()) {
   *   // Bold can be toggled
   * }
   */
  can(): CanObject;

  /** Dispatch a transaction to update editor state (use this in headless mode instead of view.dispatch). */
  dispatch(tr: Transaction): void;

  /**
   * Destroy the editor instance and clean up resources.
   */
  destroy(): void;

  /**
   * Get the current document as HTML.
   */
  getHTML(): string;

  /**
   * Get the current document as JSON.
   */
  getJSON(): object;

  /**
   * Get the current document as plain text.
   */
  getText(): string;

  /**
   * Check if the document is empty.
   */
  isEmpty: boolean;

  /** Allow additional properties */
  [key: string]: any;
}

// ============================================
// OTHER CLASSES
// ============================================

export declare class SuperConverter {
  [key: string]: any;
}

export declare class DocxZipper {
  [key: string]: any;
}

export declare class SuperToolbar {
  [key: string]: any;
}

export declare class PresentationEditor {
  /** Get the painted DOM element for a document position (body only) */
  getElementAtPos?: (
    pos: number,
    options?: { forceRebuild?: boolean; fallbackToCoords?: boolean },
  ) => HTMLElement | null;

  [key: string]: any;
}

// ============================================
// VUE COMPONENTS
// ============================================

export declare const SuperEditor: any;
export declare const SuperInput: any;
export declare const BasicUpload: any;
export declare const Toolbar: any;
export declare const AIWriter: any;
export declare const ContextMenu: any;
/** @deprecated Use ContextMenu instead */
export declare const SlashMenu: any;

// ============================================
// HELPER MODULES
// ============================================

export declare const helpers: {
  [key: string]: any;
};

export declare const fieldAnnotationHelpers: {
  [key: string]: any;
};

export declare const trackChangesHelpers: {
  [key: string]: any;
};

export declare const AnnotatorHelpers: {
  [key: string]: any;
};

export declare const SectionHelpers: {
  [key: string]: any;
};

export declare const registeredHandlers: {
  [key: string]: any;
};

// ============================================
// FUNCTIONS
// ============================================

export declare function getMarksFromSelection(selection: any): any[];
export declare function getActiveFormatting(state: any): Record<string, any>;
export declare function getStarterExtensions(): any[];
export declare function getRichTextExtensions(): any[];
export declare function createZip(files: any): Promise<Blob>;
export declare function getAllowedImageDimensions(file: File): Promise<{ width: number; height: number }>;

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard to check if a node is of a specific type.
 * Narrows the node.attrs type to the specific node's attributes.
 */
export declare function isNodeType<T extends string>(
  node: { type: { name: string }; attrs: unknown },
  typeName: T,
): node is { type: { name: T }; attrs: any };

/**
 * Assert that a node is of a specific type.
 * Throws if the node type doesn't match.
 */
export declare function assertNodeType<T extends string>(
  node: { type: { name: string }; attrs: unknown },
  typeName: T,
): asserts node is { type: { name: T }; attrs: any };

/**
 * Type guard to check if a mark is of a specific type.
 */
export declare function isMarkType<T extends string>(
  mark: { type: { name: string }; attrs: unknown },
  typeName: T,
): mark is { type: { name: T }; attrs: any };

// ============================================
// EXTENSION HELPERS
// ============================================

export declare function defineNode(config: any): any;
export declare function defineMark(config: any): any;

// ============================================
// EXTENSIONS NAMESPACE
// ============================================

export declare const Extensions: {
  Node: any;
  Attribute: any;
  Extension: any;
  Mark: any;
  Plugin: any;
  PluginKey: any;
  Decoration: any;
  DecorationSet: any;
};

// ============================================
// PLUGIN KEYS
// ============================================

export declare const TrackChangesBasePluginKey: any;
export declare const CommentsPluginKey: any;
