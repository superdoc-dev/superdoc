import { defaultNodeListHandler } from './docxImporter';
import { carbonCopy } from '../../../utilities/carbonCopy.js';

/**
 * Remove w:footnoteRef / w:endnoteRef placeholders from converted note content.
 * In OOXML notes, the first run often includes a reference marker which Word
 * uses to render the display number. We render numbering ourselves.
 *
 * @param {Array} nodes
 * @returns {Array}
 */
const stripNoteMarkerNodes = (nodes) => {
  if (!Array.isArray(nodes) || nodes.length === 0) return nodes;
  const walk = (list) => {
    if (!Array.isArray(list) || list.length === 0) return;
    for (let i = list.length - 1; i >= 0; i--) {
      const node = list[i];
      if (!node) continue;
      if (
        node.type === 'passthroughInline' &&
        (node.attrs?.originalName === 'w:footnoteRef' || node.attrs?.originalName === 'w:endnoteRef')
      ) {
        list.splice(i, 1);
        continue;
      }
      if (Array.isArray(node.content)) {
        walk(node.content);
      }
    }
  };
  const copy = JSON.parse(JSON.stringify(nodes));
  walk(copy);
  return copy;
};

/**
 * Parse a notes part (footnotes.xml or endnotes.xml) into SuperDoc-ready note entries.
 *
 * Shared implementation for both footnotes and endnotes. The only structural
 * difference between the two OOXML parts is the element names
 * (w:footnote vs w:endnote), which are parameterized via `childElementName`.
 *
 * @param {Object} params
 * @param {Object} params.partXml        The parsed OOXML JSON for the notes part
 * @param {string} params.childElementName  'w:footnote' or 'w:endnote'
 * @param {string} params.filename       Filename for import context (e.g. 'footnotes.xml')
 * @param {ParsedDocx} params.docx       The full parsed docx package
 * @param {NodeListHandler} [params.nodeListHandler] Optional node list handler
 * @param {SuperConverter} params.converter The super converter instance
 * @param {Editor} params.editor         The editor instance
 * @param {Object} [params.numbering]    Numbering definitions (optional)
 * @returns {Array<{id: string, type?: string|null, content: any[], originalXml?: any}>}
 */
function importNoteEntries({
  partXml,
  childElementName,
  filename,
  docx,
  editor,
  converter,
  nodeListHandler,
  numbering,
}) {
  const handler = nodeListHandler || defaultNodeListHandler();
  if (!partXml?.elements?.length) return [];

  const root = partXml.elements[0];
  const elements = Array.isArray(root?.elements) ? root.elements : [];
  const noteElements = elements.filter((el) => el?.name === childElementName);
  if (noteElements.length === 0) return [];

  const results = [];
  const lists = {};
  const inlineDocumentFonts = [];
  noteElements.forEach((el) => {
    const idRaw = el?.attributes?.['w:id'];
    if (idRaw === undefined || idRaw === null) return;
    const id = String(idRaw);
    const idNumber = Number(id);
    const originalXml = carbonCopy(el);

    // Get the footnote type (separator, continuationSeparator, or undefined for regular)
    const type = el?.attributes?.['w:type'] || null;

    // §17.18.33 ST_FtnEdn — special typed records (separator, continuationSeparator,
    // continuationNotice) are preserved wholesale for round-trip fidelity. Their
    // visible rendering (when they contain explicit non-default content) is handled
    // downstream from `originalXml`.
    if (type === 'separator' || type === 'continuationSeparator' || type === 'continuationNotice') {
      results.push({
        id,
        type,
        originalXml,
        content: [],
      });
      return;
    }

    // Be permissive about ids: some producers emit footnotes starting at 0.
    // Only skip negative ids (Word uses -1 for separator).
    if (!Number.isFinite(idNumber) || idNumber < 0) return;

    const childElements = Array.isArray(el.elements) ? el.elements : [];
    const converted = handler.handler({
      nodes: childElements,
      nodeListHandler: handler,
      docx,
      editor,
      converter,
      numbering,
      lists,
      inlineDocumentFonts,
      filename,
      path: [el],
    });

    const stripped = stripNoteMarkerNodes(converted);
    results.push({
      id,
      type,
      originalXml,
      content: stripped,
    });
  });

  return results;
}

/**
 * Parse footnotes.xml into SuperDoc-ready footnote entries.
 *
 * These will be available on converter.footnotes and are used by PresentationEditor
 * to build a footnotes panel.
 *
 * @param {Object} params
 * @param {ParsedDocx} params.docx The parsed docx object
 * @param {NodeListHandler} [params.nodeListHandler] Optional node list handler (defaults to docxImporter default)
 * @param {SuperConverter} params.converter The super converter instance
 * @param {Editor} params.editor The editor instance
 * @param {Object} [params.numbering] Numbering definitions (optional)
 * @returns {Array<{id: string, content: any[]}>}
 */
export function importFootnoteData({ docx, editor, converter, nodeListHandler, numbering } = {}) {
  return importNoteEntries({
    partXml: docx?.['word/footnotes.xml'],
    childElementName: 'w:footnote',
    filename: 'footnotes.xml',
    docx,
    editor,
    converter,
    nodeListHandler,
    numbering,
  });
}

/**
 * Parse endnotes.xml into SuperDoc-ready endnote entries.
 *
 * Identical structure to footnotes but reads from word/endnotes.xml
 * and filters for w:endnote elements.
 *
 * @param {Object} params - Same as importFootnoteData
 * @returns {Array<{id: string, content: any[]}>}
 */
export function importEndnoteData({ docx, editor, converter, nodeListHandler, numbering } = {}) {
  return importNoteEntries({
    partXml: docx?.['word/endnotes.xml'],
    childElementName: 'w:endnote',
    filename: 'endnotes.xml',
    docx,
    editor,
    converter,
    nodeListHandler,
    numbering,
  });
}
