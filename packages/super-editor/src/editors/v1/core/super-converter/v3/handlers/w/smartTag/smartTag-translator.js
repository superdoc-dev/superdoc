// @ts-check
import { NodeTranslator } from '@translator';
import { translateChildNodes } from '../../../../v2/exporter/helpers/translateChildNodes.js';
import { cloneXmlNode } from '../r/helpers/helpers.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:smartTag';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_NODE_NAME = 'smartTag';

/**
 * Helper to create one-to-one attribute handlers between OOXML attrs and
 * SuperDoc PM-node attrs.
 * @param {string} xmlName
 * @param {string} sdName
 * @returns {import('@translator').AttrConfig}
 */
const _createAttributeHandler = (xmlName, sdName) => ({
  xmlName,
  sdName,
  encode: (attributes) => attributes[xmlName],
  decode: (attributes) => attributes[sdName],
});

/**
 * w:smartTag carries two named attributes (ECMA-376 §17.5.1.9):
 *   w:element - required, the smart tag's local name (e.g. "country-region")
 *   w:uri     - optional, the namespace URI
 *
 * The optional <w:smartTagPr> child element is handled separately during
 * encode/decode (preserved as raw XML in the PM-node attrs for round-trip).
 *
 * @type {import('@translator').AttrConfig[]}
 */
const validXmlAttributes = [_createAttributeHandler('w:element', 'element'), _createAttributeHandler('w:uri', 'uri')];

/**
 * Encode <w:smartTag> as a SuperDoc `smartTag` PM container node (SD-2647 /
 * SD-3298). The wrapper is transparent: its child runs / inline content are
 * imported as the PM node's content. <w:smartTagPr>, if present, is preserved
 * as raw XML on `attrs.smartTagPr` so export can re-emit it.
 *
 * Children are full `EG_PContent` (per §17.5.1.9 + the EG_ContentRunContent
 * group): runs, hyperlinks, fields, SDTs, nested smartTags, customXml, range
 * markers, etc., so we route the entire non-smartTagPr child list back
 * through `nodeListHandler.handler` rather than filtering to `w:r` only.
 *
 * @param {import('@translator').SCEncoderConfig} params
 * @param {import('@translator').EncodedAttributes} [encodedAttrs]
 * @returns {import('@translator').SCEncoderResult}
 */
function encode(params, encodedAttrs = {}) {
  const { nodes, nodeListHandler } = params;
  const node = nodes[0];

  const elements = Array.isArray(node?.elements) ? node.elements : [];

  // Capture <w:smartTagPr> if present (round-trip metadata) and strip it from
  // the content stream so it doesn't get imported as a visible child.
  let smartTagPr = null;
  const visibleChildren = [];
  for (const child of elements) {
    if (child?.name === 'w:smartTagPr') {
      smartTagPr = cloneXmlNode(child);
      continue;
    }
    visibleChildren.push(child);
  }

  const translatedContent =
    visibleChildren.length > 0
      ? nodeListHandler.handler({
          ...params,
          nodes: visibleChildren,
          path: [...(params.path || []), node],
        }) || []
      : [];

  return {
    type: SD_NODE_NAME,
    content: translatedContent,
    attrs: {
      element: encodedAttrs.element ?? null,
      uri: encodedAttrs.uri ?? null,
      smartTagPr,
    },
  };
}

/**
 * Decode a SuperDoc `smartTag` PM node back into <w:smartTag>, recursively
 * translating its inline children and re-emitting the preserved <w:smartTagPr>
 * when present.
 *
 * @param {import('@translator').SCDecoderConfig} params
 * @param {import('@translator').DecodedAttributes} [decodedAttrs]
 * @returns {import('@translator').SCDecoderResult}
 */
function decode(params, decodedAttrs = {}) {
  const { node } = params || {};
  if (!node) return null;

  const childContent = translateChildNodes({ ...params, node });
  const childElements = Array.isArray(childContent) ? childContent : childContent ? [childContent] : [];

  const elements = [];
  const smartTagPr = node.attrs?.smartTagPr;
  if (smartTagPr) {
    elements.push(cloneXmlNode(smartTagPr));
  }
  elements.push(...childElements);

  return {
    name: 'w:smartTag',
    attributes: { ...decodedAttrs },
    elements,
  };
}

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
 * The NodeTranslator instance for the <w:smartTag> element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
