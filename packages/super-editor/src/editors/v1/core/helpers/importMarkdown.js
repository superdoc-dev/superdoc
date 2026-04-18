// @ts-check
import { markdownToPmDoc } from './markdown/markdownToPmContent.js';

/**
 * Create a ProseMirror document from Markdown content.
 *
 * Delegates to the AST-based conversion pipeline (remark-parse → mdast → PM JSON).
 * The old `marked` → HTML → HTML importer path is no longer used.
 *
 * @param {string} markdown - Markdown content
 * @param {import('../Editor').Editor} editor - Editor instance
 * @param {Object} [options={}] - Import options
 * @param {boolean} [options.isImport] - Whether this is an import operation
 * @param {Document | null} [options.document] - Optional DOM document (unused by AST path)
 * @param {((items: import('./catchAllSchema.js').UnsupportedContentItem[]) => void) | null} [options.onUnsupportedContent] - Callback for unsupported items
 * @param {boolean} [options.warnOnUnsupportedContent] - Emit console.warn for unsupported items
 * @returns {import('prosemirror-model').Node} Document node
 */
export function createDocFromMarkdown(markdown, editor, options = {}) {
  const { doc, diagnostics } = markdownToPmDoc(markdown, editor);

  // Surface diagnostics through the unsupported content callback if provided.
  // Aggregate by tag name to match the HTML importer's deduplication behavior.
  if (diagnostics.length > 0) {
    /** @type {Map<string, { tagName: string; outerHTML: string; count: number }>} */
    const byTag = new Map();
    for (const d of diagnostics) {
      const existing = byTag.get(d.nodeType);
      if (existing) {
        existing.count += 1;
      } else {
        byTag.set(d.nodeType, { tagName: d.nodeType, outerHTML: d.message, count: 1 });
      }
    }
    const items = [...byTag.values()];

    if (options.onUnsupportedContent) {
      options.onUnsupportedContent(items);
    } else if (options.warnOnUnsupportedContent) {
      console.warn('[super-editor] Unsupported Markdown content during import:', items);
    }
  }

  return doc;
}
