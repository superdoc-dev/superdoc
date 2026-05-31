import type { Editor } from '../core/Editor.js';
import type { GetTextInput } from '@superdoc/document-api';
import { resolveStoryRuntime } from './story-runtime/resolve-story-runtime.js';
import { textBetweenWithTabs } from './helpers/text-with-tabs.js';

/**
 * Return the full document text content from the ProseMirror document.
 *
 * Tab nodes are rendered as real '\t' so the extracted text round-trips with
 * what the write APIs accept. Other inline leaves fall back to '\n' (matching
 * the legacy behavior for non-text nodes).
 *
 * @param editor - The editor instance.
 * @returns Plain text content of the document.
 */
export function getTextAdapter(editor: Editor, input: GetTextInput): string {
  const runtime = resolveStoryRuntime(editor, input.in);
  const doc = runtime.editor.state.doc;
  return textBetweenWithTabs(doc, 0, doc.content.size, '\n', '\n', { textModel: 'visible' });
}
