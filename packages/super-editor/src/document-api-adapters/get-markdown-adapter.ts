import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import type { Editor } from '../core/Editor.js';
import type { GetMarkdownInput } from '@superdoc/document-api';
import { proseMirrorDocToMdast } from '../core/helpers/markdown/proseMirrorToMdast.js';
import { resolveStoryRuntime } from './story-runtime/resolve-story-runtime.js';

const remarkProcessor = unified().use(remarkGfm).use(remarkStringify, { bullet: '-', fences: true });

/**
 * Return the full document content as a Markdown string.
 *
 * @param editor - The editor instance.
 * @param _input - Canonical getMarkdown input (empty).
 * @returns Markdown string representation of the document.
 */
export function getMarkdownAdapter(editor: Editor, input: GetMarkdownInput): string {
  const runtime = resolveStoryRuntime(editor, input.in);
  const mdastRoot = proseMirrorDocToMdast(runtime.editor.state.doc, runtime.editor);
  return remarkProcessor.stringify(mdastRoot);
}
