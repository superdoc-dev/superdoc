/**
 * Markdown → ProseMirror conversion module.
 *
 * Public API:
 *  - `markdownToPmDoc` — full document conversion (for body replacement)
 *  - `markdownToPmFragment` — fragment conversion (for insertion)
 *  - `parseMarkdownToAst` — raw mdast parsing (for advanced use)
 */

export { markdownToPmDoc, markdownToPmFragment } from './markdownToPmContent.js';
export { parseMarkdownToAst } from './parseMarkdownAst.js';
export { normalizeFixedWidthTables } from './normalizeFixedWidthTables.js';
export type {
  MarkdownConversionOptions,
  MarkdownConversionResult,
  MarkdownFragmentResult,
  MarkdownDiagnostic,
} from './types.js';
