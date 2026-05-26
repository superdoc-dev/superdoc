// @ts-check
import { NodeTranslator } from '@translator';
import { createAttributeHandler } from '@converter/v3/handlers/utils.js';
import { exportSchemaToJson } from '@converter/exporter.js';
import {
  resolveTrackedChangeImportIds,
  stampImportTrackingAttrs,
  withParentFrame,
} from '../../../../v2/importer/importTrackingContext.js';

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

  subs.forEach((subElement) => {
    subElement.marks = [];
    if (subElement?.content?.[0]) {
      if (subElement.content[0].marks === undefined) {
        subElement.content[0].marks = [];
      }
      if (subElement.content[0].type === 'text') {
        subElement.content[0].marks.push({ type: 'trackInsert', attrs: encodedAttrs });
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
function resolveExportWordId(params, attrs) {
  const sourceId = attrs?.sourceId;
  /** @type {string | number | null | undefined} */
  let exportSourceId;
  if (typeof sourceId === 'string' || typeof sourceId === 'number') {
    exportSourceId = sourceId;
  } else if (sourceId === null) {
    exportSourceId = null;
  } else if (sourceId === undefined) {
    exportSourceId = undefined;
  } else {
    exportSourceId = String(sourceId);
  }
  const logicalId = typeof attrs?.id === 'string' ? attrs.id : '';
  const exportParams =
    /** @type {import('@translator').SCDecoderConfig & { converter?: { wordIdAllocator?: import('@extensions/track-changes/review-model/word-id-allocator.js').WordIdAllocator | null }, currentPartPath?: string, filename?: string }} */ (
      params
    );
  const allocator = exportParams?.converter?.wordIdAllocator;
  const partPath =
    exportParams?.currentPartPath ||
    (typeof exportParams?.filename === 'string' && exportParams.filename.length > 0
      ? `word/${exportParams.filename}`
      : 'word/document.xml');
  if (allocator) {
    return allocator.allocate({ partPath, sourceId: exportSourceId, logicalId });
  }
  return /** @type {string} */ (sourceId || logicalId);
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
 * The NodeTranslator instance for the w:ins element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
