import type { Editor } from '../core/Editor.js';
import type { GetHtmlInput } from '@superdoc/document-api';

const DEFAULT_UNFLATTEN_LISTS = true;

/**
 * Return the full document content as an HTML string.
 *
 * Unlike the markdown adapter (which uses its own AST pipeline), this delegates
 * directly to `editor.getHTML()` because there is no equivalent AST-based HTML
 * serialization pipeline. The DOM required by `getHTML()` is provided by the
 * CLI-injected `options.document` in headless sessions.
 *
 * @param editor - The editor instance.
 * @param input - Canonical getHtml input.
 * @returns HTML string representation of the document.
 */
export function getHtmlAdapter(editor: Editor, input: GetHtmlInput): string {
  const unflattenLists = input.unflattenLists ?? DEFAULT_UNFLATTEN_LISTS;
  return editor.getHTML({ unflattenLists });
}
