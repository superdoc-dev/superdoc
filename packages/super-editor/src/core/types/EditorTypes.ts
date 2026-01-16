import type { Editor } from '../Editor.js';

/**
 * A map of plugin names to their helper API objects.
 * Each plugin defines its own helper methods.
 *
 * Example:
 * editor.helpers.linkedStyles.getStyles()
 */
export type EditorHelpers = Record<string, Record<string, (...args: unknown[]) => unknown>>;

/**
 * Export format options
 */
export type ExportFormat = 'docx' | 'json' | 'html' | 'markdown';

/**
 * Editor node options
 */
export interface EditorNodeOptions {
  [key: string]: unknown;
}

/**
 * Editor node storage
 */
export interface EditorNodeStorage {
  [key: string]: unknown;
}

/**
 * Extension storage - stores data for each extension by extension name
 */
export type ExtensionStorage = Record<string, unknown>;

/**
 * ProseMirror JSON mark structure
 */
export interface ProseMirrorJSONMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/**
 * ProseMirror JSON node structure
 */
export interface ProseMirrorJSONNode {
  type: string;
  content?: ProseMirrorJSONNode[];
  attrs?: Record<string, unknown>;
  marks?: ProseMirrorJSONMark[];
  text?: string;
}

/**
 * ProseMirror JSON document structure
 * @deprecated Use ProseMirrorJSONNode instead. This alias remains for compatibility.
 */
export interface ProseMirrorJSON {
  type: string;
  content?: ProseMirrorJSON[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

/**
 * Page styles configuration
 */
export interface PageStyles {
  width?: string | number;
  height?: string | number;
  marginTop?: string | number;
  marginBottom?: string | number;
  marginLeft?: string | number;
  marginRight?: string | number;
  [key: string]: unknown;
}

/**
 * Toolbar configuration
 */
export interface Toolbar {
  setActiveEditor?: (editor: Editor) => void;
  [key: string]: unknown;
}

/**
 * Re-export commonly used types
 */
export type * from '../OxmlNode.js';
export type * from './EditorConfig.js';
