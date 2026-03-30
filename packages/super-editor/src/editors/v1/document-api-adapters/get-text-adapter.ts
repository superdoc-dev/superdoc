import type { Editor } from '../core/Editor.js';
import type { GetTextInput } from '@superdoc/document-api';
import { resolveStoryRuntime } from './story-runtime/resolve-story-runtime.js';

/**
 * Return the full document text content from the ProseMirror document.
 *
 * @param editor - The editor instance.
 * @returns Plain text content of the document.
 */
export function getTextAdapter(editor: Editor, input: GetTextInput): string {
  const runtime = resolveStoryRuntime(editor, input.in);
  const doc = runtime.editor.state.doc;
  return doc.textBetween(0, doc.content.size, '\n', '\n');
}
