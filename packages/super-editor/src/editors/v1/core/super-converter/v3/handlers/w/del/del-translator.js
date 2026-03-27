// @ts-check
import { NodeTranslator } from '@translator';
import { createAttributeHandler } from '@converter/v3/handlers/utils.js';
import { exportSchemaToJson } from '@converter/exporter.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:del';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_ATTR_KEY = 'trackDelete';

/** @type {import('@translator').AttrConfig[]} */
const validXmlAttributes = [
  createAttributeHandler('w:id', 'id'),
  createAttributeHandler('w:date', 'date'),
  createAttributeHandler('w:author', 'author'),
  createAttributeHandler('w:authorEmail', 'authorEmail'),
];

/**
 * Encode the w:del element
 * @param {import('@translator').SCEncoderConfig} params
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params, encodedAttrs = {}) => {
  const { nodeListHandler, extraParams = {}, converter } = params;
  const { node } = extraParams;

  // Preserve the original OOXML w:id for round-trip export fidelity.
  // The internal id is remapped to a shared UUID for replacement pairing.
  const originalWordId = encodedAttrs.id;
  if (originalWordId && converter?.trackedChangeIdMap?.has(originalWordId)) {
    encodedAttrs.id = converter.trackedChangeIdMap.get(originalWordId);
  }
  encodedAttrs.sourceId = originalWordId || '';

  const subs = nodeListHandler.handler({
    ...params,
    insideTrackChange: true,
    nodes: node.elements,
    path: [...(params.path || []), node],
  });

  encodedAttrs.importedAuthor = `${encodedAttrs.author} (imported)`;

  if (converter?.documentOrigin) {
    encodedAttrs.origin = converter.documentOrigin;
  }

  subs.forEach((subElement) => {
    subElement.marks = [];
    if (subElement?.content?.[0]) {
      if (subElement.content[0].marks === undefined) {
        subElement.content[0].marks = [];
      }
      if (subElement.content[0].type === 'text') {
        subElement.content[0].marks.push({ type: 'trackDelete', attrs: encodedAttrs });
      }
    }
  });

  return subs;
};

/**
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult}
 */
function decode(params) {
  const { node } = params;

  if (!node || !node.type) {
    return null;
  }

  const trackingMarks = ['trackInsert', 'trackDelete'];
  const marks = Array.isArray(node.marks) ? node.marks : [];
  const trackedMark = marks.find((m) => m.type === 'trackDelete');
  if (!trackedMark) {
    return null;
  }

  node.marks = marks.filter((m) => !trackingMarks.includes(m.type));

  const translatedTextNode = exportSchemaToJson({ ...params, node });
  const textNode = translatedTextNode.elements.find((n) => n.name === 'w:t');
  textNode.name = 'w:delText';

  return {
    name: 'w:del',
    attributes: {
      'w:id': trackedMark.attrs.sourceId || trackedMark.attrs.id,
      'w:author': trackedMark.attrs.author,
      'w:authorEmail': trackedMark.attrs.authorEmail,
      'w:date': trackedMark.attrs.date,
    },
    elements: [translatedTextNode],
  };
}

/** @type {import('@translator').NodeTranslatorConfig} */
export const config = {
  xmlName: XML_NODE_NAME,
  sdNodeOrKeyName: SD_ATTR_KEY,
  type: NodeTranslator.translatorTypes.ATTRIBUTE,
  encode,
  decode,
  attributes: validXmlAttributes,
};

/**
 * The NodeTranslator instance for the w:del element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
