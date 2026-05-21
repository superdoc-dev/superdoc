import type { EditorExtension } from '../core/types/EditorConfig.js';

/**
 * Returns the default extension set used for rich-text documents.
 *
 * Runtime takes no arguments; the previous `(...args: any[]): any[]`
 * signature was incorrect on both sides (no call site passes args;
 * the return is a concrete `EditorExtension[]` from the public
 * EditorConfig type union). SD-3213 drain.
 */
export function getRichTextExtensions(): EditorExtension[];

/**
 * Returns the default extension set used for DOCX documents (superset
 * of `getRichTextExtensions`).
 *
 * Runtime takes no arguments; see the JSDoc on `getRichTextExtensions`
 * for the SD-3213 rationale.
 */
export function getStarterExtensions(): EditorExtension[];
