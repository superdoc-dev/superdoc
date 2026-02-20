//@ts-check
import { DOMParser, Fragment } from 'prosemirror-model';
import { stripHtmlStyles } from './htmlSanitizer.js';
import { htmlHandler } from '../InputRule.js';
import { wrapTextsInRuns } from '../inputRules/docx-paste/docx-paste.js';
import { createCellBorders } from '../../extensions/table-cell/helpers/createCellBorders.js';
import { detectUnsupportedContent } from './catchAllSchema.js';

const TABLE_HEADER_NODE_NAME = 'tableHeader';

/**
 * @param {unknown} borderValue
 * @returns {boolean}
 */
const hasMeaningfulCellBorders = (borderValue) => {
  if (!borderValue || typeof borderValue !== 'object') return false;

  return Object.values(borderValue).some((side) => side && typeof side === 'object' && Object.keys(side).length > 0);
};

/**
 * Fill missing border metadata for imported HTML header cells (<th>).
 * This keeps editor rendering and DOCX export aligned without overriding explicit borders.
 *
 * @param {import('prosemirror-model').Node} doc
 * @returns {import('prosemirror-model').Node}
 */
const normalizeImportedHtmlTableHeaders = (doc) => {
  const normalizeNode = (node) => {
    let nextNode = node;

    if (node.childCount > 0) {
      const nextChildren = [];
      let childrenChanged = false;

      node.forEach((child) => {
        const normalizedChild = normalizeNode(child);
        if (normalizedChild !== child) childrenChanged = true;
        nextChildren.push(normalizedChild);
      });

      if (childrenChanged) {
        nextNode = node.copy(Fragment.fromArray(nextChildren));
      }
    }

    if (nextNode.type.name !== TABLE_HEADER_NODE_NAME) {
      return nextNode;
    }

    if (hasMeaningfulCellBorders(nextNode.attrs?.borders)) {
      return nextNode;
    }

    const nextAttrs = {
      ...nextNode.attrs,
      borders: createCellBorders(),
    };

    return nextNode.type.create(nextAttrs, nextNode.content, nextNode.marks);
  };

  return normalizeNode(doc);
};

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
  if (isImport) {
    doc = normalizeImportedHtmlTableHeaders(doc);
  }
  doc = wrapTextsInRuns(doc);
  return doc;
}
