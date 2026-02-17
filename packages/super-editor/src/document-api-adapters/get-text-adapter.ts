import type { Editor } from '../core/Editor.js';
import type { GetTextInput } from '@superdoc/document-api';

/**
 * Return the full document text content from the ProseMirror document.
 *
 * @param editor - The editor instance.
 * @returns Plain text content of the document.
 */
export function getTextAdapter(editor: Editor, _input: GetTextInput): string {
  return editor.state.doc.textContent;
}
