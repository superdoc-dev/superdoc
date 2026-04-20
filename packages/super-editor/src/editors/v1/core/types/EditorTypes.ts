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
 * Toolbar instance accepted by `Editor.setToolbar()`.
 *
 * Any object with an optional `setActiveEditor` method satisfies this interface,
 * including `SuperToolbar` which extends EventEmitter.
 */
export interface Toolbar {
  setActiveEditor?: (editor: Editor) => void;
}

/**
 * Binary data accepted by document open/import APIs.
 */
export type BinaryData = ArrayBuffer | ArrayBufferView;

/**
 * Represents an unsupported HTML element dropped during paste.
 */
export type UnsupportedContentItem = {
  tagName: string;
  outerHTML: string;
  count: number;
};

/**
 * Re-export commonly used types
 */
export type * from '../OxmlNode.js';
export type * from './EditorConfig.js';
