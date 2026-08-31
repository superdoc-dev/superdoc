// @ts-check
import { NodeTranslator } from '@translator';
import { createAttributeHandler } from '@converter/v3/handlers/utils.js';
import { exportSchemaToJson } from '@converter/exporter.js';
import {
  resolveTrackedChangeImportIds,
  stampImportTrackingAttrs,
  withParentFrame,
} from '../../../../v2/importer/importTrackingContext.js';
import { applyTrackedMarkToRunContent, renameTextElementsForDeletion } from '../r/helpers/track-change-helpers.js';
import { resolveExportWordId } from '@converter/v3/handlers/helpers/resolve-export-word-id.js';

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
    side: 'deletion',
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

  applyTrackedMarkToRunContent(subs, 'trackDelete', encodedAttrs);

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
  const trackedMark = marks.find((m) => m.type === 'trackDelete');
  if (!trackedMark) {
    return /** @type {import('@translator').SCDecoderResult} */ (/** @type {unknown} */ (null));
  }

  // Strip the tracked mark on a copy: `node` belongs to the caller, and the
  // header/footer export path passes the converter's persistent import-time
  // tree by reference. Mutating it here makes the strip permanent, so the
  // second export loses the tracked change entirely (issue #3893).
  const strippedNode = { ...node, marks: marks.filter((m) => m.type !== 'trackDelete') };

  const translatedResult = exportSchemaToJson({ ...params, node: strippedNode });

  if (params.isFinalDoc) {
    return null;
  }

  // A decoded node's export can be a single XML node (e.g. a plain text run)
  // or an array of sibling nodes (e.g. a field's begin/instr/separate/result/end
  // runs from crossReference-translator.js). Normalize to an array so both
  // shapes wrap correctly under one <w:del> instead of nesting an array inside
  // `elements`.
  const translatedNodes = Array.isArray(translatedResult) ? translatedResult : [translatedResult];

  // ECMA-376 requires w:delText for ALL text runs inside <w:del> (17.3.3.7) and
  // w:delInstrText for field instruction runs inside <w:del> (17.16.13). A
  // single run can now hold multiple <w:t> siblings, because the newline export
  // safety net splits text around <w:br/> (e.g. <w:t>Alpha</w:t><w:br/><w:t>Beta</w:t>),
  // so rename every w:t/w:instrText found anywhere in the translated output, not
  // just the first; a leftover <w:t>/<w:instrText> inside <w:del> would not be
  // treated as deleted. Other inline content (w:noBreakHyphen, w:tab, w:br,
  // w:fldChar, etc.) stays as-is; the <w:del> wrapper alone conveys the deletion.
  translatedNodes.forEach(renameTextElementsForDeletion);

  return {
    name: 'w:del',
    attributes: {
      'w:id': resolveExportWordId(params, trackedMark.attrs),
      'w:author': trackedMark.attrs.author,
      'w:authorEmail': trackedMark.attrs.authorEmail,
      'w:date': trackedMark.attrs.date,
    },
    elements: translatedNodes,
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
 * The NodeTranslator instance for the w:del element.
 * @type {import('@translator').NodeTranslator}
 */
export const translator = NodeTranslator.from(config);
