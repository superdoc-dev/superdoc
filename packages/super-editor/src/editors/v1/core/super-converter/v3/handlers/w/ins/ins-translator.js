// @ts-check
import { NodeTranslator } from '@translator';
import { createAttributeHandler } from '@converter/v3/handlers/utils.js';
import { exportSchemaToJson } from '@converter/exporter.js';
import {
  resolveTrackedChangeImportIds,
  stampImportTrackingAttrs,
  withParentFrame,
} from '../../../../v2/importer/importTrackingContext.js';
import { applyTrackedMarkToRunContent } from '../r/helpers/track-change-helpers.js';
import { resolveExportWordId } from '@converter/v3/handlers/helpers/resolve-export-word-id.js';

/** @type {import('@translator').XmlNodeName} */
const XML_NODE_NAME = 'w:ins';

/** @type {import('@translator').SuperDocNodeOrKeyName} */
const SD_ATTR_KEY = 'trackInsert';

/** @type {import('@translator').AttrConfig[]} */
const validXmlAttributes = [
  createAttributeHandler('w:id', 'id'),
  createAttributeHandler('w:date', 'date'),
  createAttributeHandler('w:author', 'author'),
  createAttributeHandler('w:authorEmail', 'authorEmail'),
];

/**
 * Encode the w:ins element
 * @param {import('@translator').SCEncoderConfig & { importTrackingContext?: import('@extensions/track-changes/review-model/import-context.js').ImportTrackingContext }} params
 * @param {Record<string, any>} [encodedAttrs]
 * @returns {import('@translator').SCEncoderResult}
 */
const encode = (params, encodedAttrs = {}) => {
  const { nodeListHandler, extraParams = {} } = params;
  const { node } = extraParams;

  // Preserve the original OOXML w:id for round-trip export fidelity.
  // The internal id is remapped to a shared UUID for replacement pairing.
  const { partPath, sourceId, logicalId } = resolveTrackedChangeImportIds(params, encodedAttrs.id);
  encodedAttrs.id = logicalId;
  encodedAttrs.sourceId = sourceId;
  const { context, frame } = stampImportTrackingAttrs({
    params,
    attrs: encodedAttrs,
    side: 'insertion',
    sourceId,
    partPath,
  });

  const childParams = {
    ...params,
    insideTrackChange: true,
    importTrackingContext: context ?? params.importTrackingContext,
    nodes: node.elements,
    path: [...(params.path || []), node],
  };
  const subs =
    context && frame
      ? withParentFrame(context, frame, () => nodeListHandler.handler(childParams))
      : nodeListHandler.handler(childParams);
  encodedAttrs.importedAuthor = `${encodedAttrs.author} (imported)`;

  const converter = /** @type {{ documentOrigin?: string } | undefined} */ (params.converter);
  if (converter?.documentOrigin) {
    encodedAttrs.origin = converter.documentOrigin;
  }

  applyTrackedMarkToRunContent(subs, 'trackInsert', encodedAttrs);

  return subs;
};

/**
 * @param {import('@translator').SCDecoderConfig} params
 * @returns {import('@translator').SCDecoderResult}
 */
function decode(params) {
  const { node } = params;

  if (!node || !node.type) {
    return /** @type {import('@translator').SCDecoderResult} */ (/** @type {unknown} */ (null));
  }

  const marks = Array.isArray(node.marks) ? node.marks : [];
  const trackedMark = marks.find((m) => m.type === 'trackInsert');
  if (!trackedMark) {
    return /** @type {import('@translator').SCDecoderResult} */ (/** @type {unknown} */ (null));
  }

  node.marks = marks.filter((m) => m.type !== 'trackInsert');

  const translatedTextNode = exportSchemaToJson({ ...params, node });

  if (params.isFinalDoc) {
    return translatedTextNode;
  }

  return {
    name: 'w:ins',
    attributes: {
      'w:id': resolveExportWordId(params, trackedMark.attrs),
      'w:author': trackedMark.attrs.author,
      'w:authorEmail': trackedMark.attrs.authorEmail,
      'w:date': trackedMark.attrs.date,
    },
    elements: [translatedTextNode],
  };
}

/**
 * Resolve the `w:id` to write on export. Uses the Word revision id allocator
 * when one is installed on the converter; otherwise falls through to
 * `sourceId || id`.
 *
 * @param {import('@translator').SCDecoderConfig} params
 * @param {Record<string, unknown>} attrs
 * @returns {string}
 */

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
 * The NodeTranslator instance for the w:ins element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
