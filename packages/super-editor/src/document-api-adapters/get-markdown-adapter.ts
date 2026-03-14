import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import type { Editor } from '../core/Editor.js';
import type { GetMarkdownInput } from '@superdoc/document-api';
import { proseMirrorDocToMdast } from '../core/helpers/markdown/proseMirrorToMdast.js';

const remarkProcessor = unified().use(remarkGfm).use(remarkStringify, { bullet: '-', fences: true });

/**
 * Return the full document content as a Markdown string.
 *
 * @param editor - The editor instance.
 * @param _input - Canonical getMarkdown input (empty).
 * @returns Markdown string representation of the document.
 */
export function getMarkdownAdapter(editor: Editor, _input: GetMarkdownInput): string {
  const mdastRoot = proseMirrorDocToMdast(editor.state.doc, editor);
  return remarkProcessor.stringify(mdastRoot);
}
