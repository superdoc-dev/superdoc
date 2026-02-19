//@ts-check
import { DOMParser } from 'prosemirror-model';
import { stripHtmlStyles } from './htmlSanitizer.js';
import { htmlHandler } from '../InputRule.js';
import { wrapTextsInRuns } from '../inputRules/docx-paste/docx-paste.js';

/**
 * Create a document from HTML content
 * @param {string} content - HTML content
 * @param {Object} editor - Editor instance
 * @param {Object} [options={}] - Import options
 * @param {Document | null} [options.document] - Optional Document instance for Node environments (e.g. JSDOM)
 * @param {boolean} [options.isImport] - Whether this is an import operation
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

  let doc = DOMParser.fromSchema(editor.schema).parse(parsedContent);
  doc = wrapTextsInRuns(doc);
  return doc;
}
