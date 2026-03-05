//@ts-check
import { DOMParser } from 'prosemirror-model';
import { stripHtmlStyles } from './htmlSanitizer.js';
import { htmlHandler } from '../InputRule.js';
import { wrapTextsInRuns } from '../inputRules/docx-paste/docx-paste.js';
import { detectUnsupportedContent } from './catchAllSchema.js';

/**
 * @typedef {import('./catchAllSchema.js').UnsupportedContentItem} UnsupportedContentItem
 */

/**
 * Create a document from HTML content
 * @param {string} content - HTML content
 * @param {Object} editor - Editor instance
 * @param {Object} [options={}] - Import options
 * @param {Document | null} [options.document] - Optional Document instance for Node environments (e.g. JSDOM)
 * @param {boolean} [options.isImport] - Whether this is an import operation
 * @param {((items: UnsupportedContentItem[]) => void) | null} [options.onUnsupportedContent] - Callback invoked with unsupported items
 * @param {boolean} [options.warnOnUnsupportedContent] - When true and no callback is provided, emits console.warn
 * @returns {Object} Document node
 */
export function createDocFromHTML(content, editor, options = {}) {
  const { isImport = false } = options;
  let parsedContent;

  if (typeof content === 'string') {
    const domDocument =
      options.document ??
      editor?.options?.document ??
      editor?.options?.mockDocument ??
      (typeof document !== 'undefined' ? document : null);

    // Strip styles
    const tempDiv = htmlHandler(stripHtmlStyles(content, domDocument), editor, domDocument);

    // Mark as import if needed
    if (isImport) {
      // @ts-expect-error - dataset property may not exist on all node types
      tempDiv.dataset.superdocImport = 'true';
    }

    parsedContent = tempDiv;
  } else {
    parsedContent = content;
  }

  // Detect unsupported content when opted in (requires an Element for DOM scanning)
  if (
    (options.onUnsupportedContent || options.warnOnUnsupportedContent) &&
    parsedContent instanceof globalThis.Element
  ) {
    const unsupported = detectUnsupportedContent(parsedContent, editor.schema);
    if (unsupported.length > 0) {
      if (options.onUnsupportedContent) {
        options.onUnsupportedContent(unsupported);
      } else {
        console.warn('[super-editor] Unsupported HTML content dropped during import:', unsupported);
      }
    }
  }

  let doc = DOMParser.fromSchema(editor.schema).parse(parsedContent);
  doc = wrapTextsInRuns(doc);
  return doc;
}
