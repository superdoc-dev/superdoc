/**
 * High-level entry points for Markdown → ProseMirror conversion.
 *
 * Exports two functions:
 *  - `markdownToPmDoc` — full document (for doc.open body replacement)
 *  - `markdownToPmFragment` — fragment (for doc.insert structured insertion)
 *
 * Both parse Markdown to mdast, convert to PM JSON, and materialize
 * via the editor's schema. The conversion is synchronous and does not
 * perform network I/O (image URLs are stored as-is).
 */

import { Fragment } from 'prosemirror-model';
import type { Node as PmNode } from 'prosemirror-model';
import type { Editor } from '../../Editor.js';
import { parseMarkdownToAst } from './parseMarkdownAst.js';
import { convertMdastToBlocks } from './mdastToProseMirror.js';
import { normalizeFixedWidthTables } from './normalizeFixedWidthTables.js';
import { wrapTextsInRuns } from '../../inputRules/docx-paste/docx-paste.js';
import type {
  MarkdownConversionOptions,
  MarkdownConversionResult,
  MarkdownFragmentResult,
  MdastConversionContext,
} from './types.js';

// ---------------------------------------------------------------------------
// Full document conversion (for body replacement in doc.open)
// ---------------------------------------------------------------------------

/**
 * Parse Markdown and produce a full ProseMirror document node.
 *
 * The result replaces the entire document body. Template-level OOXML context
 * (styles.xml, settings, numbering infrastructure) is preserved by the caller.
 */
export function markdownToPmDoc(
  markdown: string,
  editor: Editor,
  options: MarkdownConversionOptions = {},
): MarkdownConversionResult {
  const { blocks, diagnostics } = parseAndConvert(markdown, editor, options);

  const docJson = {
    type: 'doc',
    content: blocks.length > 0 ? blocks : [{ type: 'paragraph' }],
  };

  let doc: PmNode = editor.schema.nodeFromJSON(docJson);
  doc = wrapTextsInRuns(doc) as PmNode;

  return { doc, diagnostics };
}

// ---------------------------------------------------------------------------
// Fragment conversion (for structured insertion in doc.insert)
// ---------------------------------------------------------------------------

/**
 * Parse Markdown and produce a ProseMirror Fragment for insertion at a position.
 *
 * The fragment can contain multiple block nodes (paragraphs, tables, lists, etc.)
 * and is suitable for `tr.replaceWith(from, to, fragment)`.
 */
export function markdownToPmFragment(
  markdown: string,
  editor: Editor,
  options: MarkdownConversionOptions = {},
): MarkdownFragmentResult {
  const { blocks, diagnostics } = parseAndConvert(markdown, editor, options);

  if (blocks.length === 0) {
    return { fragment: Fragment.empty, diagnostics };
  }

  const nodes = blocks.map((json) => editor.schema.nodeFromJSON(json));
  const wrappedNodes = nodes.map((node) => wrapTextsInRuns(node) as PmNode);
  const fragment = Fragment.from(wrappedNodes);

  return { fragment, diagnostics };
}

// ---------------------------------------------------------------------------
// Shared parse + convert pipeline
// ---------------------------------------------------------------------------

function parseAndConvert(
  markdown: string,
  editor: Editor,
  options: MarkdownConversionOptions,
): { blocks: ReturnType<typeof convertMdastToBlocks>; diagnostics: MdastConversionContext['diagnostics'] } {
  const source = options.normalizeFixedWidthTables === false ? markdown : normalizeFixedWidthTables(markdown);
  const ast = parseMarkdownToAst(source);

  const ctx: MdastConversionContext = {
    editor,
    schema: editor.schema,
    diagnostics: [],
    options,
  };

  const blocks = convertMdastToBlocks(ast, ctx);
  return { blocks, diagnostics: ctx.diagnostics };
}
