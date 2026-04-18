// @ts-check
import { NodeTranslator } from '@translator';
import { createAttributeHandler } from '@converter/v3/handlers/utils.js';
import { translator as wDelTranslator } from '@converter/v3/handlers/w/del/index.js';
import { translator as wInsTranslator } from '@converter/v3/handlers/w/ins/index.js';
import { translator as wHyperlinkTranslator } from '@converter/v3/handlers/w/hyperlink/index.js';
import { getTextNodeForExport } from '@converter/v3/handlers/w/t/helpers/translate-text-node.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:t';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'text';

/** @type {import('@translator').AttrConfig[]} */
const validXmlAttributes = [createAttributeHandler('xml:space', 'xmlSpace')];

/**
 * Translate a text node or link node from OOXML to SuperDoc format.
 *
 * This function handles the conversion of <w:t> and <w:delText> elements to SuperDoc text nodes.
 * It intelligently manages whitespace preservation based on xml:space attributes at multiple levels.
 *
 * Whitespace preservation precedence (highest to lowest):
 * 1. Element-level xml:space attribute (via encodedAttrs or node attributes)
 * 2. Text content-level xml:space attribute
 * 3. Document-level xml:space attribute (params.converter.documentAttributes)
 *
 * The document-level xml:space is particularly important for PDF-to-DOCX converted documents,
 * which often set xml:space="preserve" at the document root instead of on individual elements.
 *
 * Link nodes look the same as text nodes but with a link attr.
 * Also, tracked changes are text marks so those need to be separated here.
 * We need to check here and re-route as necessary.
 *
 * @param {import('@translator').SCEncoderConfig} params - The encoding parameters
 * @param {import('@translator').EncodedAttributes} [encodedAttrs] - The already encoded attributes
 * @returns {import('@translator').SCEncoderResult} The encoded SuperDoc text node or null if encoding fails
 */
const encode = (params, encodedAttrs = {}) => {
  const { node } = params.extraParams;
  const { elements, type, attributes } = node;

  // Text nodes have no children. Only text, and there should only be one child
  let text;

  if (!elements) {
    return null;
  }

  if (elements.length === 1) {
    text = elements[0].text;
    // Check for xml:space="preserve" at multiple levels:
    // 1. On the element's own attributes (via encodedAttrs)
    // 2. On the element's attributes directly
    // 3. On the text content's attributes (rare)
    // 4. At the document level (for PDF-to-DOCX converted documents)
    const docXmlSpace = params.converter?.documentAttributes?.['xml:space'];
    const xmlSpace =
      encodedAttrs.xmlSpace ?? attributes?.['xml:space'] ?? elements[0]?.attributes?.['xml:space'] ?? docXmlSpace;
    if (xmlSpace !== 'preserve' && typeof text === 'string') {
      // Only trim regular ASCII whitespace, not NBSP (U+00A0) which is used intentionally for alignment
      text = text.replace(/^[ \t\n\r]+/, '').replace(/[ \t\n\r]+$/, '');
    }
    // Remove [[sdspace]] placeholders that were injected during XML parsing (SuperConverter.parseXmlToJson).
    // These placeholders prevent xml-js from discarding whitespace-only text runs during parsing.
    // Now that we've preserved the whitespace through the parsing stage and applied appropriate
    // trimming rules above, we remove the placeholders to restore the original content.
    text = text.replace(/\[\[sdspace\]\]/g, '');

    // If the text is whitespace-only after placeholder removal and xml:space != 'preserve',
    // drop the node entirely. This prevents creating empty/whitespace text nodes that ProseMirror
    // may treat as invalid. The placeholder was only needed to prevent xml-js from dropping
    // the node during parsing - but if xml:space doesn't require preservation, we should drop it.
    const isWhitespaceOnly = /^[ \t\n\r]*$/.test(text);
    if (xmlSpace !== 'preserve' && isWhitespaceOnly) {
      return null;
    }
  } else if (!elements.length && encodedAttrs.xmlSpace === 'preserve') {
    // Word sometimes will have an empty text node with a space attribute, in that case it should be a space
    text = ' ';
  } else return null;

  return {
    type: 'text',
    text: text,
    attrs: { type, attributes: attributes || {} },
    marks: [],
  };
};

/**
 * Decode a SuperDoc text node back into OOXML <w:t> wrapped in a run.
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult}
 */
const decode = (params) => {
  const { node, extraParams } = params;

  if (!node || !node.type) {
    return null;
  }

  // Separate tracked changes from regular text
  const trackedMarks = ['trackDelete', 'trackInsert'];
  const trackedMark = node.marks?.find((m) => trackedMarks.includes(m.type));

  if (trackedMark) {
    switch (trackedMark.type) {
      case 'trackDelete':
        return wDelTranslator.decode(params);
      case 'trackInsert':
        return wInsTranslator.decode(params);
    }
  }

  // Separate links from regular text
  const isLinkNode = node.marks?.some((m) => m.type === 'link');
  if (isLinkNode && !extraParams?.linkProcessed) {
    return wHyperlinkTranslator.decode(params);
  }

  const { text, marks = [] } = node;
  return getTextNodeForExport(text, marks, params);
};

/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_NODE_NAME,
  type: NodeTranslator.translatorTypes.NODE,
  encode,
  decode,
  attributes: validXmlAttributes,
};

/**
 * The NodeTranslator instance for the <w:t> element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
